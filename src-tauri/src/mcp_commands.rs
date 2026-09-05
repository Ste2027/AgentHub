use crate::{
    desktop::{with_db, AppState},
    mcp::McpServer,
};
use tauri::State;
#[tauri::command]
pub async fn list_mcp_servers(state: State<'_, AppState>) -> Result<Vec<McpServer>, String> {
    with_db(&state, |db| {
        let projects = db
            .projects()
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(|p| p.path)
            .collect::<Vec<_>>();
        Ok(crate::mcp::discover(&projects))
    })
    .await
}
