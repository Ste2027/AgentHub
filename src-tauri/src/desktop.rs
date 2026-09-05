use crate::{database::Database, indexer, models::*};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{Emitter, Manager, State};

pub struct AppState {
    db: Arc<Mutex<Database>>,
    path: PathBuf,
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
    with_db(&state, move |db| db.overview(path)).await
}
#[tauri::command]
async fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    with_db(&state, |db| db.settings()).await
}
#[tauri::command]
async fn save_settings(state: State<'_, AppState>, settings: Settings) -> Result<(), String> {
    with_db(&state, move |db| db.save_settings(&settings)).await
}
#[tauri::command]
async fn list_sessions(
    state: State<'_, AppState>,
    agent: String,
    project: String,
    offset: usize,
) -> Result<Vec<Session>, String> {
    with_db(&state, move |db| db.sessions(&agent, &project, offset)).await
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
    with_db(&state, move |db| {
        indexer::run(db, force, |p| {
            let _ = app.emit("index-progress", p);
        })
    })
    .await
}
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = match std::env::var_os("AGENTHUB_DATA_DIR") {
                Some(value) => {
                    let path = PathBuf::from(value);
                    if !path.is_absolute() {
                        return Err(
                            std::io::Error::other("AGENTHUB_DATA_DIR must be absolute").into()
                        );
                    }
                    path
                }
                None => app.path().app_local_data_dir()?,
            };
            std::fs::create_dir_all(&dir)?;
            let path = dir.join("agenthub.db");
            let db = Database::open(&path).map_err(std::io::Error::other)?;
            app.manage(AppState {
                db: Arc::new(Mutex::new(db)),
                path,
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
            crate::skill_commands::save_skill,
            crate::mcp_commands::list_mcp_servers,
            overview,
            get_settings,
            save_settings,
            list_sessions,
            get_session,
            session_events,
            search,
            list_projects,
            index_sessions
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start AgentHub");
}
