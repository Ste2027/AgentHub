#![cfg(feature = "desktop")]

use contextmeld_core::{
    adapters,
    database::Database,
    models::{AutoIndexUpdate, Settings},
    watcher::{SessionWatcher, WatchCallback},
};
use std::{
    path::Path,
    sync::{mpsc, Arc, Mutex},
    time::{Duration, Instant},
};

const CLAUDE: &str = r#"{"type":"user","uuid":"u1","sessionId":"watch-1","cwd":"/projects/watched","timestamp":"2026-09-06T10:00:00Z","message":{"role":"user","content":"Index this new session"}}
{"type":"assistant","uuid":"a1","sessionId":"watch-1","timestamp":"2026-09-06T10:01:00Z","message":{"model":"claude-test","content":"Indexed automatically"}}
"#;

#[test]
fn native_watcher_indexes_a_new_jsonl_file_after_the_debounce() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("claude");
    std::fs::create_dir_all(&source).unwrap();
    let settings = Settings {
        claude_path: source.to_string_lossy().into_owned(),
        codex_path: temp.path().join("absent").to_string_lossy().into_owned(),
        ..Settings::default()
    };
    let database = Arc::new(Mutex::new(Database::open(Path::new(":memory:")).unwrap()));
    database.lock().unwrap().save_settings(&settings).unwrap();
    let (tx, rx) = mpsc::channel::<AutoIndexUpdate>();
    let callback: WatchCallback = Arc::new(move |update| {
        let _ = tx.send(update);
    });
    let mut watcher = SessionWatcher::default();
    watcher.configure(
        database.clone(),
        true,
        adapters::agents(&settings),
        callback,
    );
    assert!(watcher.status().active);

    std::fs::write(source.join("new-session.jsonl"), CLAUDE).unwrap();
    let deadline = Instant::now() + Duration::from_secs(10);
    let completed = loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        let update = rx
            .recv_timeout(remaining)
            .expect("watcher did not report an automatic index");
        if let Some(progress) = update.progress {
            break progress;
        }
    };
    assert_eq!((completed.indexed, completed.failed), (1, 0));
    assert_eq!(
        database
            .lock()
            .unwrap()
            .sessions("", "", "", "", "", "newest", 0)
            .unwrap()
            .len(),
        1
    );
}
