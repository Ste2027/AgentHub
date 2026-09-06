use crate::{
    database::Database,
    indexer,
    models::{Agent, AutoIndexStatus, AutoIndexUpdate, IndexProgress},
};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::{
    collections::HashSet,
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const DEBOUNCE: Duration = Duration::from_millis(900);
const MAX_CHANGED_PATHS: usize = 4096;
pub type WatchCallback = Arc<dyn Fn(AutoIndexUpdate) + Send + Sync + 'static>;

pub struct SessionWatcher {
    watcher: Option<RecommendedWatcher>,
    status: Arc<Mutex<AutoIndexStatus>>,
    generation: Arc<AtomicU64>,
}

impl Default for SessionWatcher {
    fn default() -> Self {
        Self {
            watcher: None,
            status: Arc::new(Mutex::new(AutoIndexStatus::default())),
            generation: Arc::new(AtomicU64::new(0)),
        }
    }
}

impl SessionWatcher {
    pub fn status(&self) -> AutoIndexStatus {
        self.status
            .lock()
            .map(|status| status.clone())
            .unwrap_or_else(|_| AutoIndexStatus {
                last_error: "Automatic index status is unavailable".into(),
                ..AutoIndexStatus::default()
            })
    }

    pub fn configure(
        &mut self,
        db: Arc<Mutex<Database>>,
        enabled: bool,
        agents: Vec<Agent>,
        callback: WatchCallback,
    ) {
        // Dropping the previous native watcher closes its event channel and lets
        // the previous worker exit without a detached polling loop.
        self.watcher.take();
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;

        let mut roots = Vec::new();
        for agent in &agents {
            if !agent.supported || !agent.sessions_detected {
                continue;
            }
            let path = PathBuf::from(&agent.path);
            if !crate::paths::is_local_absolute(&path) {
                continue;
            }
            if let Ok(canonical) = path.canonicalize() {
                if !roots.contains(&canonical) {
                    roots.push(canonical);
                }
            }
        }

        replace_status(
            &self.status,
            AutoIndexStatus {
                enabled,
                watched_paths: roots
                    .iter()
                    .map(|path| path.to_string_lossy().into_owned())
                    .collect(),
                ..AutoIndexStatus::default()
            },
        );

        if !enabled || roots.is_empty() {
            emit(&callback, &self.status, None);
            return;
        }

        let (tx, rx) = mpsc::channel::<notify::Result<Event>>();
        let mut watcher = match notify::recommended_watcher(move |event| {
            let _ = tx.send(event);
        }) {
            Ok(watcher) => watcher,
            Err(error) => {
                update_status(&self.status, |status| {
                    status.last_error = format!("Could not start the file watcher: {error}");
                });
                emit(&callback, &self.status, None);
                return;
            }
        };

        let mut active_roots = Vec::new();
        let mut errors = Vec::new();
        for root in roots {
            match watcher.watch(&root, RecursiveMode::Recursive) {
                Ok(()) => active_roots.push(root),
                Err(error) => errors.push(format!("{}: {error}", root.display())),
            }
        }
        update_status(&self.status, |status| {
            status.active = !active_roots.is_empty();
            status.watched_paths = active_roots
                .iter()
                .map(|path| path.to_string_lossy().into_owned())
                .collect();
            status.last_error = errors.join("; ");
        });
        emit(&callback, &self.status, None);

        if active_roots.is_empty() {
            return;
        }

        let status = self.status.clone();
        let worker_callback = callback.clone();
        let worker_agents = agents;
        let worker_generation = self.generation.clone();
        let spawn = thread::Builder::new()
            .name("contextmeld-session-watcher".into())
            .spawn(move || {
                worker(
                    rx,
                    db,
                    worker_agents,
                    status,
                    worker_callback,
                    worker_generation,
                    generation,
                )
            });
        if let Err(error) = spawn {
            update_status(&self.status, |status| {
                status.active = false;
                status.last_error = format!("Could not start the index worker: {error}");
            });
            emit(&callback, &self.status, None);
            return;
        }
        self.watcher = Some(watcher);
    }
}

fn worker(
    rx: mpsc::Receiver<notify::Result<Event>>,
    db: Arc<Mutex<Database>>,
    agents: Vec<Agent>,
    status: Arc<Mutex<AutoIndexStatus>>,
    callback: WatchCallback,
    generation: Arc<AtomicU64>,
    current_generation: u64,
) {
    while let Ok(first) = rx.recv() {
        if generation.load(Ordering::SeqCst) != current_generation {
            return;
        }
        let mut changed = HashSet::new();
        collect_event(first, &mut changed, &status, &callback);
        let mut deadline = Instant::now() + DEBOUNCE;
        loop {
            let wait = deadline.saturating_duration_since(Instant::now());
            match rx.recv_timeout(wait) {
                Ok(event) => {
                    let before = changed.len();
                    collect_event(event, &mut changed, &status, &callback);
                    if changed.len() > before {
                        deadline = Instant::now() + DEBOUNCE;
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => break,
                Err(mpsc::RecvTimeoutError::Disconnected) => return,
            }
        }
        if changed.is_empty() {
            continue;
        }
        if generation.load(Ordering::SeqCst) != current_generation {
            return;
        }

        update_status(&status, |value| {
            value.running = true;
            value.last_error.clear();
        });
        emit(&callback, &status, None);

        let paths = changed.into_iter().collect::<Vec<_>>();
        let result = db
            .lock()
            .map_err(|_| "Database lock failed".to_string())
            .and_then(|mut db| indexer::run_paths(&mut db, agents.clone(), paths, |_| {}));
        if generation.load(Ordering::SeqCst) != current_generation {
            return;
        }
        match result {
            Ok(progress) => {
                update_status(&status, |value| {
                    value.running = false;
                    value.last_run_at = Some(epoch_millis());
                    value.last_indexed = progress.indexed;
                    value.last_failed = progress.failed;
                    value.last_warnings = progress.warnings;
                    value.last_error = progress.issues.first().cloned().unwrap_or_default();
                });
                emit(&callback, &status, Some(progress));
            }
            Err(error) => {
                update_status(&status, |value| {
                    value.running = false;
                    value.last_run_at = Some(epoch_millis());
                    value.last_error = error;
                });
                emit(&callback, &status, None);
            }
        }
    }
}

fn collect_event(
    event: notify::Result<Event>,
    changed: &mut HashSet<PathBuf>,
    status: &Arc<Mutex<AutoIndexStatus>>,
    callback: &WatchCallback,
) {
    match event {
        Ok(event) if !matches!(event.kind, EventKind::Access(_)) => {
            for path in event.paths {
                if changed.len() >= MAX_CHANGED_PATHS {
                    break;
                }
                if path
                    .extension()
                    .and_then(|extension| extension.to_str())
                    .is_some_and(|extension| extension.eq_ignore_ascii_case("jsonl"))
                {
                    changed.insert(path);
                }
            }
        }
        Ok(_) => {}
        Err(error) => {
            update_status(status, |value| {
                value.last_error = format!("File watcher error: {error}");
            });
            emit(callback, status, None);
        }
    }
}

fn update_status(status: &Arc<Mutex<AutoIndexStatus>>, update: impl FnOnce(&mut AutoIndexStatus)) {
    if let Ok(mut status) = status.lock() {
        update(&mut status);
    }
}

fn replace_status(status: &Arc<Mutex<AutoIndexStatus>>, replacement: AutoIndexStatus) {
    if let Ok(mut status) = status.lock() {
        *status = replacement;
    }
}

fn emit(
    callback: &WatchCallback,
    status: &Arc<Mutex<AutoIndexStatus>>,
    progress: Option<IndexProgress>,
) {
    if let Ok(status) = status.lock() {
        callback(AutoIndexUpdate {
            status: status.clone(),
            progress,
        });
    }
}

fn epoch_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collects_only_jsonl_content_changes() {
        let status = Arc::new(Mutex::new(AutoIndexStatus::default()));
        let callback: WatchCallback = Arc::new(|_| {});
        let mut changed = HashSet::new();
        collect_event(
            Ok(Event {
                kind: EventKind::Any,
                paths: vec![
                    PathBuf::from("session.JSONL"),
                    PathBuf::from("contextmeld.db"),
                ],
                attrs: Default::default(),
            }),
            &mut changed,
            &status,
            &callback,
        );
        assert_eq!(changed, HashSet::from([PathBuf::from("session.JSONL")]));
    }

    #[test]
    fn ignores_access_events() {
        let status = Arc::new(Mutex::new(AutoIndexStatus::default()));
        let callback: WatchCallback = Arc::new(|_| {});
        let mut changed = HashSet::new();
        collect_event(
            Ok(Event {
                kind: EventKind::Access(notify::event::AccessKind::Any),
                paths: vec![PathBuf::from("session.jsonl")],
                attrs: Default::default(),
            }),
            &mut changed,
            &status,
            &callback,
        );
        assert!(changed.is_empty());
    }
}
