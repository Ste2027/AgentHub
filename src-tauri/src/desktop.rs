use crate::{database::Database, indexer, models::*};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{Emitter, Manager, State};

pub struct AppState {
    db: Arc<Mutex<Database>>,
    path: PathBuf,
    pub(crate) demo_root: Option<PathBuf>,
    watcher: Arc<Mutex<crate::watcher::SessionWatcher>>,
}
pub(crate) async fn with_db<T: Send + 'static>(
    state: &AppState,
    f: impl FnOnce(&mut Database) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut db = db.lock().map_err(|_| "Database lock failed")?;
        f(&mut db)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn get_analytics(state: State<'_, AppState>) -> Result<crate::insights::Analytics, String> {
    with_db(&state, |db| db.analytics()).await
}
#[tauri::command]
async fn session_context(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<crate::insights::SessionContext, String> {
    with_db(&state, move |db| db.session_context(&session_id)).await
}
#[tauri::command]
async fn overview(state: State<'_, AppState>) -> Result<Overview, String> {
    let path = state.path.to_string_lossy().into_owned();
    let demo_root = state.demo_root.clone();
    with_db(&state, move |db| match demo_root {
        Some(root) => db.overview_with_agents(path, crate::demo::agents(&root), true),
        None => db.overview(path),
    })
    .await
}
#[tauri::command]
async fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    with_db(&state, |db| db.settings()).await
}
#[tauri::command]
async fn save_settings(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    settings: Settings,
) -> Result<(), String> {
    let saved = settings.clone();
    with_db(&state, move |db| db.save_settings(&settings)).await?;
    let agents = match &state.demo_root {
        Some(root) => crate::demo::agents(root),
        None => crate::adapters::agents(&saved),
    };
    state
        .watcher
        .lock()
        .map_err(|_| "File watcher lock failed".to_string())?
        .configure(
            state.db.clone(),
            saved.auto_index,
            agents,
            watcher_callback(app),
        );
    Ok(())
}
#[tauri::command]
fn auto_index_status(state: State<'_, AppState>) -> AutoIndexStatus {
    state
        .watcher
        .lock()
        .map(|watcher| watcher.status())
        .unwrap_or_else(|_| AutoIndexStatus {
            last_error: "Automatic index status is unavailable".into(),
            ..AutoIndexStatus::default()
        })
}
#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn list_sessions(
    state: State<'_, AppState>,
    agent: String,
    project: String,
    date_from: String,
    date_to: String,
    model: String,
    sort: String,
    offset: usize,
) -> Result<Vec<Session>, String> {
    with_db(&state, move |db| {
        db.sessions(
            &agent, &project, &date_from, &date_to, &model, &sort, offset,
        )
    })
    .await
}
#[tauri::command]
async fn get_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Option<Session>, String> {
    with_db(&state, move |db| db.session(&session_id)).await
}
#[tauri::command]
async fn session_events(
    state: State<'_, AppState>,
    session_id: String,
    offset: usize,
) -> Result<Vec<Event>, String> {
    with_db(&state, move |db| db.events(&session_id, offset)).await
}
#[tauri::command]
async fn search(state: State<'_, AppState>, query: String) -> Result<Vec<SearchHit>, String> {
    if query.len() > 2000 {
        return Err("Search query is too long".into());
    }
    with_db(&state, move |db| db.search(&query)).await
}
#[tauri::command]
async fn list_projects(state: State<'_, AppState>) -> Result<Vec<Project>, String> {
    with_db(&state, |db| db.projects()).await
}
#[tauri::command]
async fn index_sessions(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    force: bool,
) -> Result<IndexProgress, String> {
    let demo_root = state.demo_root.clone();
    with_db(&state, move |db| match demo_root {
        Some(root) => indexer::run_with_agents(db, force, crate::demo::agents(&root), |p| {
            let _ = app.emit("index-progress", p);
        }),
        None => indexer::run(db, force, |p| {
            let _ = app.emit("index-progress", p);
        }),
    })
    .await
}
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let demo = matches!(
                std::env::var("CONTEXTMELD_DEMO")
                    .or_else(|_| std::env::var("AGENTHUB_DEMO"))
                    .ok()
                    .as_deref(),
                Some("1" | "true" | "yes")
            );
            let dir = match std::env::var_os("CONTEXTMELD_DATA_DIR")
                .or_else(|| std::env::var_os("AGENTHUB_DATA_DIR"))
            {
                Some(value) => {
                    let path = PathBuf::from(value);
                    if !crate::paths::is_local_absolute(&path) {
                        return Err(std::io::Error::other(
                            "CONTEXTMELD_DATA_DIR must be an absolute local path",
                        )
                        .into());
                    }
                    path
                }
                None if demo => std::env::temp_dir().join("contextmeld-demo-v0.2.0"),
                None => app.path().app_local_data_dir()?,
            };
            std::fs::create_dir_all(&dir)?;
            // Keep the legacy filename and bundle identifier so v0.1.x users retain
            // their local index after the product rename.
            let path = dir.join("agenthub.db");
            let mut db = Database::open(&path).map_err(std::io::Error::other)?;
            if demo {
                crate::demo::prepare(&dir, &mut db).map_err(std::io::Error::other)?;
            }
            let settings = db.settings().map_err(std::io::Error::other)?;
            let db = Arc::new(Mutex::new(db));
            let mut watcher = crate::watcher::SessionWatcher::default();
            let agents = if demo {
                crate::demo::agents(&dir)
            } else {
                crate::adapters::agents(&settings)
            };
            watcher.configure(
                db.clone(),
                settings.auto_index,
                agents,
                watcher_callback(app.handle().clone()),
            );
            app.manage(AppState {
                db,
                path,
                demo_root: demo.then_some(dir),
                watcher: Arc::new(Mutex::new(watcher)),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_analytics,
            session_context,
            crate::memory_commands::list_memories,
            crate::memory_commands::get_memory,
            crate::memory_commands::save_memory,
            crate::memory_commands::trash_memory,
            crate::memory_commands::export_memories,
            crate::memory_commands::import_memories,
            crate::memory_commands::write_export,
            crate::skill_commands::list_skills,
            crate::skill_commands::read_skill,
            crate::skill_commands::export_skill,
            crate::skill_commands::import_skill_archive,
            crate::skill_commands::save_skill,
            crate::skill_commands::restore_skill,
            crate::skill_commands::copy_skill,
            crate::skill_commands::duplicate_skill,
            crate::skill_commands::install_skill,
            crate::skill_commands::delete_skill,
            crate::skill_commands::restore_deleted_skill,
            crate::mcp_commands::list_mcp_servers,
            crate::mcp_commands::read_mcp_config,
            crate::mcp_commands::save_mcp_config,
            crate::mcp_commands::restore_mcp_config,
            crate::mcp_commands::duplicate_mcp_server,
            crate::mcp_commands::add_mcp_server,
            crate::mcp_commands::remove_mcp_server,
            crate::mcp_commands::set_mcp_enabled,
            crate::mcp_commands::copy_mcp_server,
            overview,
            get_settings,
            save_settings,
            auto_index_status,
            list_sessions,
            get_session,
            session_events,
            search,
            list_projects,
            index_sessions
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start ContextMeld");
}

fn watcher_callback(app: tauri::AppHandle) -> crate::watcher::WatchCallback {
    Arc::new(move |update| {
        let _ = app.emit("auto-index-status", update);
    })
}
