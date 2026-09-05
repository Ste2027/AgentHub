use crate::{
    desktop::{with_db, AppState},
    mcp::{McpFile, McpServer},
};
use sha2::Digest;
use tauri::State;

fn stamp() -> Result<u128, String> {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .map_err(|e| e.to_string())
}

fn write_json_config(p: &std::path::Path, root: &serde_json::Value) -> Result<String, String> {
    let text = serde_json::to_string_pretty(root).map_err(|e| e.to_string())? + "\n";
    let suffix = stamp()?;
    let backup = p.with_file_name(format!(
        "{}.agenthub-backup-{suffix}",
        p.file_name().unwrap_or_default().to_string_lossy()
    ));
    std::fs::copy(p, &backup).map_err(|e| e.to_string())?;
    let tmp = p.with_file_name(format!(
        "{}.agenthub-tmp-{suffix}",
        p.file_name().unwrap_or_default().to_string_lossy()
    ));
    if let Err(e) = std::fs::write(&tmp, text.as_bytes()) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }
    if let Err(e) = std::fs::rename(&tmp, p) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }
    Ok(backup.to_string_lossy().into_owned())
}

fn load_json(path: &str) -> Result<(std::path::PathBuf, serde_json::Value), String> {
    let p = std::path::PathBuf::from(path);
    if !p.is_absolute() || !matches!(p.extension().and_then(|x| x.to_str()), Some("json")) {
        return Err("Only absolute JSON MCP configs can be changed safely".into());
    }
    let text = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    let root = serde_json::from_str(&text).map_err(|e| format!("Invalid JSON: {e}"))?;
    Ok((p, root))
}

fn server_object(
    root: &mut serde_json::Value,
) -> Result<&mut serde_json::Map<String, serde_json::Value>, String> {
    root.as_object_mut()
        .ok_or_else(|| "MCP config root must be an object".to_string())?
        .entry("mcpServers")
        .or_insert_with(|| serde_json::json!({}))
        .as_object_mut()
        .ok_or_else(|| "mcpServers must be an object".to_string())
}
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
    // Verify the final file can still be parsed. If the filesystem accepted the
    // replacement but the result is unreadable, restore the known-good backup.
    let verified = std::fs::read_to_string(&p)
        .ok()
        .and_then(|saved| serde_json::from_str::<serde_json::Value>(&saved).ok())
        .is_some();
    if !verified {
        let _ = std::fs::copy(&backup, &p);
        return Err("MCP config verification failed; the previous file was restored".into());
    }
    Ok(backup.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn duplicate_mcp_server(
    path: String,
    name: String,
    new_name: String,
    expected: String,
) -> Result<String, String> {
    let (p, mut root) = load_json(&path)?;
    let current = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    if format!("{:x}", sha2::Sha256::digest(current.as_bytes())) != expected {
        return Err("This MCP config changed on disk. Reload it before saving.".into());
    }
    if new_name.is_empty() || new_name.len() > 96 || new_name.contains(['/', '\\']) {
        return Err("Server name must be a simple name".into());
    }
    let servers = server_object(&mut root)?;
    let value = servers
        .get(&name)
        .cloned()
        .ok_or_else(|| "MCP server was not found".to_string())?;
    if servers.contains_key(&new_name) {
        return Err("A server with that name already exists".into());
    }
    servers.insert(new_name, value);
    write_json_config(&p, &root)
}

#[tauri::command]
pub async fn add_mcp_server(
    path: String,
    name: String,
    config_json: String,
    expected: String,
) -> Result<String, String> {
    let (p, mut root) = load_json(&path)?;
    let current = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    if format!("{:x}", sha2::Sha256::digest(current.as_bytes())) != expected {
        return Err("This MCP config changed on disk. Reload it before saving.".into());
    }
    if name.is_empty() || name.len() > 96 || name.contains(['/', '\\']) {
        return Err("Server name must be a simple name".into());
    }
    let value: serde_json::Value =
        serde_json::from_str(&config_json).map_err(|e| format!("Invalid server JSON: {e}"))?;
    if !value.is_object() {
        return Err("Server configuration must be a JSON object".into());
    }
    let servers = server_object(&mut root)?;
    if servers.contains_key(&name) {
        return Err("A server with that name already exists".into());
    }
    servers.insert(name, value);
    write_json_config(&p, &root)
}

#[tauri::command]
pub async fn remove_mcp_server(
    path: String,
    name: String,
    expected: String,
) -> Result<String, String> {
    let (p, mut root) = load_json(&path)?;
    let current = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    if format!("{:x}", sha2::Sha256::digest(current.as_bytes())) != expected {
        return Err("This MCP config changed on disk. Reload it before saving.".into());
    }
    let servers = server_object(&mut root)?;
    if servers.remove(&name).is_none() {
        return Err("MCP server was not found".into());
    }
    write_json_config(&p, &root)
}

#[tauri::command]
pub async fn set_mcp_enabled(
    path: String,
    name: String,
    enabled: bool,
    expected: String,
) -> Result<String, String> {
    let (p, mut root) = load_json(&path)?;
    let current = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    if format!("{:x}", sha2::Sha256::digest(current.as_bytes())) != expected {
        return Err("This MCP config changed on disk. Reload it before saving.".into());
    }
    let servers = server_object(&mut root)?;
    let value = servers
        .get_mut(&name)
        .ok_or_else(|| "MCP server was not found".to_string())?;
    let object = value
        .as_object_mut()
        .ok_or_else(|| "MCP server entry must be an object".to_string())?;
    object.insert("disabled".into(), serde_json::Value::Bool(!enabled));
    write_json_config(&p, &root)
}

#[tauri::command]
pub async fn copy_mcp_server(
    source_path: String,
    name: String,
    destination_path: String,
) -> Result<String, String> {
    let (_, source_root) = load_json(&source_path)?;
    let source = source_root
        .get("mcpServers")
        .and_then(serde_json::Value::as_object)
        .and_then(|m| m.get(&name))
        .cloned()
        .ok_or_else(|| "MCP server was not found".to_string())?;
    let destination = std::path::PathBuf::from(destination_path);
    if !destination.is_absolute()
        || !matches!(
            destination.extension().and_then(|x| x.to_str()),
            Some("json")
        )
    {
        return Err("Destination must be an absolute JSON config path".into());
    }
    let mut root = if destination.exists() {
        let text = std::fs::read_to_string(&destination).map_err(|e| e.to_string())?;
        serde_json::from_str(&text).map_err(|e| format!("Invalid destination JSON: {e}"))?
    } else {
        serde_json::json!({})
    };
    let servers = server_object(&mut root)?;
    if servers.contains_key(&name) {
        return Err("A server with that name already exists at the destination".into());
    }
    servers.insert(name, source);
    if destination.exists() {
        write_json_config(&destination, &root)
    } else {
        let text = serde_json::to_string_pretty(&root).map_err(|e| e.to_string())? + "\n";
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let tmp = destination.with_extension("agenthub-tmp.json");
        std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, &destination).map_err(|e| e.to_string())?;
        Ok(destination.to_string_lossy().into_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::Digest;

    fn temp_config() -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!(
            "agenthub-mcp-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("mcp.json");
        std::fs::write(
            &path,
            r#"{"mcpServers":{"files":{"command":"node","args":["server.js"],"env":{"TOKEN":"secret"}}}}"#,
        )
        .unwrap();
        path
    }

    fn expected(path: &std::path::Path) -> String {
        format!("{:x}", sha2::Sha256::digest(std::fs::read(path).unwrap()))
    }

    #[test]
    fn mcp_mutations_keep_json_valid_and_backup_before_changes() {
        let path = temp_config();
        let path_s = path.to_string_lossy().into_owned();
        let backup = tauri::async_runtime::block_on(duplicate_mcp_server(
            path_s.clone(),
            "files".into(),
            "files-copy".into(),
            expected(&path),
        ))
        .unwrap();
        assert!(std::path::Path::new(&backup).exists());
        let root: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert!(root["mcpServers"]["files-copy"].is_object());

        tauri::async_runtime::block_on(set_mcp_enabled(
            path_s.clone(),
            "files-copy".into(),
            false,
            expected(&path),
        ))
        .unwrap();
        let root: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(
            root["mcpServers"]["files-copy"]["disabled"],
            serde_json::Value::Bool(true)
        );

        tauri::async_runtime::block_on(add_mcp_server(
            path_s.clone(),
            "http".into(),
            r#"{"url":"https://example.invalid/mcp"}"#.into(),
            expected(&path),
        ))
        .unwrap();
        tauri::async_runtime::block_on(remove_mcp_server(path_s, "http".into(), expected(&path)))
            .unwrap();
        let root: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert!(root["mcpServers"].get("http").is_none());
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }
}
