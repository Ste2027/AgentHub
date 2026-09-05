use crate::{
    desktop::{with_db, AppState},
    mcp::{McpFile, McpServer},
};
use sha2::Digest;
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
#[tauri::command]
pub async fn read_mcp_config(path: String) -> Result<McpFile, String> {
    let p = std::path::PathBuf::from(path);
    if !p.is_absolute() {
        return Err("Only a local MCP config can be opened".into());
    }
    let text = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    if text.len() > 4 * 1024 * 1024 {
        return Err("MCP config is larger than 4 MiB".into());
    }
    let hash = format!("{:x}", sha2::Sha256::digest(text.as_bytes()));
    Ok(McpFile { text, hash })
}
#[tauri::command]
pub async fn save_mcp_config(
    path: String,
    text: String,
    expected: String,
) -> Result<String, String> {
    let p = std::path::PathBuf::from(&path);
    if !p.is_absolute() || !matches!(p.extension().and_then(|x| x.to_str()), Some("json")) {
        return Err("Only JSON MCP configs can be edited safely in this release".into());
    }
    let current = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    let digest = format!("{:x}", sha2::Sha256::digest(current.as_bytes()));
    if digest != expected {
        return Err("This MCP config changed on disk. Reload it before saving.".into());
    }
    let _: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Invalid JSON: {e}"))?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let backup = p.with_file_name(format!(
        "{}.agenthub-backup-{stamp}",
        p.file_name().unwrap().to_string_lossy()
    ));
    std::fs::copy(&p, &backup).map_err(|e| e.to_string())?;
    let tmp = p.with_file_name(format!(
        "{}.agenthub-tmp-{stamp}",
        p.file_name().unwrap().to_string_lossy()
    ));
    std::fs::write(&tmp, text.as_bytes()).map_err(|e| e.to_string())?;
    if let Err(e) = std::fs::rename(&tmp, &p) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }
    Ok(backup.to_string_lossy().into_owned())
}
