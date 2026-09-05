use crate::{
    desktop::{with_db, AppState},
    memories::{ImportResult, Memory, MemoryDraft, MemoryPage},
};
use tauri::State;
#[tauri::command]
pub async fn list_memories(
    state: State<'_, AppState>,
    query: String,
    scope: String,
    trash: bool,
    offset: usize,
) -> Result<MemoryPage, String> {
    with_db(&state, move |db| db.memories(&query, &scope, trash, offset)).await
}
#[tauri::command]
pub async fn get_memory(state: State<'_, AppState>, id: String) -> Result<Option<Memory>, String> {
    with_db(&state, move |db| db.memory(&id)).await
}
#[tauri::command]
pub async fn save_memory(state: State<'_, AppState>, draft: MemoryDraft) -> Result<Memory, String> {
    with_db(&state, move |db| db.save_memory(draft)).await
}
#[tauri::command]
pub async fn trash_memory(
    state: State<'_, AppState>,
    id: String,
    revision: i64,
    restore: bool,
) -> Result<(), String> {
    with_db(&state, move |db| db.trash_memory(&id, revision, restore)).await
}
#[tauri::command]
pub async fn export_memories(
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> Result<String, String> {
    with_db(&state, move |db| db.export_memories(&ids)).await
}
#[tauri::command]
pub async fn import_memories(
    state: State<'_, AppState>,
    json: String,
) -> Result<ImportResult, String> {
    with_db(&state, move |db| db.import_memories(&json)).await
}
#[tauri::command]
pub async fn write_export(path: String, text: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::exports::write_text(std::path::Path::new(&path), &text)
    })
    .await
    .map_err(|e| e.to_string())?
}
