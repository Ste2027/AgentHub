use crate::{
    desktop::{with_db, AppState},
    mcp::{McpFile, McpServer},
};
use sha2::Digest;
use std::path::{Path, PathBuf};
use tauri::State;
use toml_edit::{Array, DocumentMut, InlineTable, Item, Table, Value as EditValue};

const MAX_CONFIG_BYTES: usize = 4 * 1024 * 1024;

#[derive(Clone, Copy, Debug, PartialEq)]
enum ConfigFormat {
    Json,
    Toml,
}

impl ConfigFormat {
    fn from_path(path: &Path) -> Result<Self, String> {
        match path.extension().and_then(|value| value.to_str()) {
            Some(value) if value.eq_ignore_ascii_case("json") => Ok(Self::Json),
            Some(value) if value.eq_ignore_ascii_case("toml") => Ok(Self::Toml),
            _ => Err("MCP configuration must be a JSON or TOML file".into()),
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Json => "json",
            Self::Toml => "toml",
        }
    }
}

enum ConfigDocument {
    Json(serde_json::Value),
    Toml(DocumentMut),
}

fn stamp() -> Result<u128, String> {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .map_err(|error| error.to_string())
}

fn checked_path(path: &str) -> Result<(PathBuf, ConfigFormat), String> {
    let path = PathBuf::from(path);
    if !crate::paths::is_local_absolute(&path) {
        return Err("Only absolute local MCP configuration paths are supported".into());
    }
    let format = ConfigFormat::from_path(&path)?;
    Ok((path, format))
}

fn read_limited(path: &Path) -> Result<String, String> {
    let metadata = std::fs::metadata(path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_CONFIG_BYTES as u64 {
        return Err("MCP config is larger than 4 MiB".into());
    }
    std::fs::read_to_string(path).map_err(|error| error.to_string())
}

fn parse_document(text: &str, format: ConfigFormat) -> Result<ConfigDocument, String> {
    match format {
        ConfigFormat::Json => serde_json::from_str(text)
            .map(ConfigDocument::Json)
            .map_err(|error| format!("Invalid JSON: {error}")),
        ConfigFormat::Toml => text
            .parse::<DocumentMut>()
            .map(ConfigDocument::Toml)
            .map_err(|error| format!("Invalid TOML: {error}")),
    }
}

fn serialize_document(document: &ConfigDocument) -> Result<String, String> {
    match document {
        ConfigDocument::Json(root) => serde_json::to_string_pretty(root)
            .map(|text| text + "\n")
            .map_err(|error| error.to_string()),
        ConfigDocument::Toml(root) => Ok(root.to_string()),
    }
}

fn expected_hash(path: &Path, expected: &str) -> Result<(), String> {
    let current = read_limited(path)?;
    let digest = format!("{:x}", sha2::Sha256::digest(current.as_bytes()));
    if digest != expected {
        return Err("This MCP config changed on disk. Reload it before saving.".into());
    }
    Ok(())
}

fn backup_path(path: &Path, qualifier: &str) -> Result<PathBuf, String> {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Invalid MCP config path".to_string())?;
    Ok(path.with_file_name(format!(
        "{name}.contextmeld-backup-{qualifier}-{}",
        stamp()?
    )))
}

fn write_verified(path: &Path, text: &str, format: ConfigFormat) -> Result<String, String> {
    parse_document(text, format)?;
    let existed = path.exists();
    let backup = if existed {
        let backup = backup_path(path, "change")?;
        std::fs::copy(path, &backup).map_err(|error| error.to_string())?;
        Some(backup)
    } else {
        None
    };
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    if let Err(error) = crate::exports::replace_text(path, text) {
        if let Some(backup) = &backup {
            let _ = std::fs::copy(backup, path);
        }
        return Err(error);
    }
    let verified = std::fs::read_to_string(path)
        .ok()
        .and_then(|saved| parse_document(&saved, format).ok())
        .is_some();
    if !verified {
        if let Some(backup) = &backup {
            let _ = std::fs::copy(backup, path);
        } else {
            let _ = std::fs::remove_file(path);
        }
        return Err("MCP config verification failed; the previous state was restored".into());
    }
    Ok(backup
        .unwrap_or_else(|| path.to_path_buf())
        .to_string_lossy()
        .into_owned())
}

fn load(path: &str) -> Result<(PathBuf, ConfigFormat, ConfigDocument), String> {
    let (path, format) = checked_path(path)?;
    let text = read_limited(&path)?;
    let document = parse_document(&text, format)?;
    Ok((path, format, document))
}

fn valid_name(name: &str) -> Result<(), String> {
    if name.trim().is_empty()
        || name.len() > 96
        || name.contains(['/', '\\'])
        || name == "."
        || name == ".."
    {
        return Err("Server name must be a simple name up to 96 characters".into());
    }
    Ok(())
}

fn json_servers(
    root: &mut serde_json::Value,
) -> Result<&mut serde_json::Map<String, serde_json::Value>, String> {
    root.as_object_mut()
        .ok_or_else(|| "MCP config root must be an object".to_string())?
        .entry("mcpServers")
        .or_insert_with(|| serde_json::json!({}))
        .as_object_mut()
        .ok_or_else(|| "mcpServers must be an object".to_string())
}

fn toml_servers(root: &mut DocumentMut) -> Result<&mut Table, String> {
    if root.get("mcp_servers").is_none() {
        root["mcp_servers"] = Item::Table(Table::new());
    }
    root["mcp_servers"]
        .as_table_mut()
        .ok_or_else(|| "mcp_servers must be a TOML table".to_string())
}

fn json_to_edit_value(value: &serde_json::Value) -> Result<EditValue, String> {
    match value {
        serde_json::Value::String(value) => Ok(EditValue::from(value.as_str())),
        serde_json::Value::Bool(value) => Ok(EditValue::from(*value)),
        serde_json::Value::Number(value) if value.is_i64() => {
            Ok(EditValue::from(value.as_i64().unwrap()))
        }
        serde_json::Value::Number(value) if value.is_u64() => {
            let value = i64::try_from(value.as_u64().unwrap())
                .map_err(|_| "Number is too large for TOML".to_string())?;
            Ok(EditValue::from(value))
        }
        serde_json::Value::Number(value) => Ok(EditValue::from(value.as_f64().unwrap())),
        serde_json::Value::Array(values) => {
            let mut array = Array::new();
            for value in values {
                array.push(json_to_edit_value(value)?);
            }
            Ok(EditValue::Array(array))
        }
        serde_json::Value::Object(values) => {
            let mut table = InlineTable::new();
            for (key, value) in values {
                table.insert(key, json_to_edit_value(value)?);
            }
            Ok(EditValue::InlineTable(table))
        }
        serde_json::Value::Null => {
            Err("TOML server configurations cannot contain null values".into())
        }
    }
}

fn json_server_to_toml(value: &serde_json::Value) -> Result<Table, String> {
    let object = value
        .as_object()
        .ok_or_else(|| "Server configuration must be a JSON object".to_string())?;
    let mut table = Table::new();
    for (key, value) in object {
        table.insert(key, Item::Value(json_to_edit_value(value)?));
    }
    Ok(table)
}

fn edit_value_to_json(value: &EditValue) -> Result<serde_json::Value, String> {
    if let Some(value) = value.as_str() {
        return Ok(serde_json::Value::String(value.into()));
    }
    if let Some(value) = value.as_bool() {
        return Ok(serde_json::Value::Bool(value));
    }
    if let Some(value) = value.as_integer() {
        return Ok(serde_json::Value::Number(value.into()));
    }
    if let Some(value) = value.as_float() {
        return serde_json::Number::from_f64(value)
            .map(serde_json::Value::Number)
            .ok_or_else(|| "TOML contains a non-finite number".into());
    }
    if let Some(array) = value.as_array() {
        return array
            .iter()
            .map(edit_value_to_json)
            .collect::<Result<Vec<_>, _>>()
            .map(serde_json::Value::Array);
    }
    if let Some(table) = value.as_inline_table() {
        let mut output = serde_json::Map::new();
        for (key, value) in table.iter() {
            output.insert(key.into(), edit_value_to_json(value)?);
        }
        return Ok(serde_json::Value::Object(output));
    }
    if let Some(value) = value.as_datetime() {
        return Ok(serde_json::Value::String(value.to_string()));
    }
    Err("Unsupported TOML value in MCP server".into())
}

fn item_to_json(item: &Item) -> Result<serde_json::Value, String> {
    if let Some(value) = item.as_value() {
        return edit_value_to_json(value);
    }
    if let Some(table) = item.as_table() {
        let mut output = serde_json::Map::new();
        for (key, item) in table.iter() {
            output.insert(key.into(), item_to_json(item)?);
        }
        return Ok(serde_json::Value::Object(output));
    }
    if let Some(tables) = item.as_array_of_tables() {
        return tables
            .iter()
            .map(|table| item_to_json(&Item::Table(table.clone())))
            .collect::<Result<Vec<_>, _>>()
            .map(serde_json::Value::Array);
    }
    Err("Unsupported TOML item in MCP server".into())
}

fn server_as_json(document: &ConfigDocument, name: &str) -> Result<serde_json::Value, String> {
    match document {
        ConfigDocument::Json(root) => root
            .get("mcpServers")
            .and_then(serde_json::Value::as_object)
            .and_then(|servers| servers.get(name))
            .cloned()
            .ok_or_else(|| "MCP server was not found".to_string()),
        ConfigDocument::Toml(root) => root
            .get("mcp_servers")
            .and_then(Item::as_table)
            .and_then(|servers| servers.get(name))
            .ok_or_else(|| "MCP server was not found".to_string())
            .and_then(item_to_json),
    }
}

fn add_server(
    document: &mut ConfigDocument,
    name: &str,
    value: serde_json::Value,
) -> Result<(), String> {
    valid_name(name)?;
    if !value.is_object() {
        return Err("Server configuration must be a JSON object".into());
    }
    match document {
        ConfigDocument::Json(root) => {
            let servers = json_servers(root)?;
            if servers.contains_key(name) {
                return Err("A server with that name already exists".into());
            }
            servers.insert(name.to_string(), value);
        }
        ConfigDocument::Toml(root) => {
            let value = json_server_to_toml(&value)?;
            let servers = toml_servers(root)?;
            if servers.contains_key(name) {
                return Err("A server with that name already exists".into());
            }
            servers.insert(name, Item::Table(value));
        }
    }
    Ok(())
}

fn is_sensitive_key(key: &str) -> bool {
    let key = key.to_ascii_lowercase().replace('-', "_");
    if key.ends_with("_env_var") || key.ends_with("_env_vars") {
        return false;
    }
    key.contains("token")
        || key.contains("secret")
        || key.contains("password")
        || key.contains("api_key")
        || key == "authorization"
        || key == "cookie"
}

fn mask_json(value: &mut serde_json::Value, protected_parent: bool) {
    match value {
        serde_json::Value::Object(map) => {
            for (key, child) in map {
                let protected = protected_parent
                    || matches!(key.as_str(), "env" | "http_headers")
                    || is_sensitive_key(key);
                if protected && !child.is_object() && !child.is_array() {
                    *child = serde_json::Value::String("••••••••".into());
                } else {
                    mask_json(child, protected);
                }
            }
        }
        serde_json::Value::Array(values) => {
            for value in values {
                mask_json(value, protected_parent);
            }
        }
        value if protected_parent => *value = serde_json::Value::String("••••••••".into()),
        _ => {}
    }
}

fn mask_toml(value: &mut toml::Value, protected_parent: bool) {
    match value {
        toml::Value::Table(table) => {
            for (key, child) in table {
                let protected = protected_parent
                    || matches!(key.as_str(), "env" | "http_headers")
                    || is_sensitive_key(key);
                if protected && !child.is_table() && !child.is_array() {
                    *child = toml::Value::String("••••••••".into());
                } else {
                    mask_toml(child, protected);
                }
            }
        }
        toml::Value::Array(values) => {
            for value in values {
                mask_toml(value, protected_parent);
            }
        }
        value if protected_parent => *value = toml::Value::String("••••••••".into()),
        _ => {}
    }
}

fn masked_text(text: &str, format: ConfigFormat) -> Result<String, String> {
    match format {
        ConfigFormat::Json => {
            let mut value: serde_json::Value =
                serde_json::from_str(text).map_err(|e| format!("Invalid JSON: {e}"))?;
            mask_json(&mut value, false);
            serde_json::to_string_pretty(&value)
                .map(|value| value + "\n")
                .map_err(|error| error.to_string())
        }
        ConfigFormat::Toml => {
            let mut value: toml::Value =
                toml::from_str(text).map_err(|e| format!("Invalid TOML: {e}"))?;
            mask_toml(&mut value, false);
            toml::to_string_pretty(&value).map_err(|error| error.to_string())
        }
    }
}

#[tauri::command]
pub async fn list_mcp_servers(state: State<'_, AppState>) -> Result<Vec<McpServer>, String> {
    let demo_home = state.demo_root.as_ref().map(|root| root.join("home"));
    with_db(&state, move |db| {
        let projects = db
            .projects()
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(|project| project.path)
            .collect::<Vec<_>>();
        Ok(match demo_home {
            Some(home) => crate::mcp::discover_at(&home, &projects),
            None => crate::mcp::discover(&projects),
        })
    })
    .await
}

#[tauri::command]
pub async fn read_mcp_config(path: String, reveal_secrets: bool) -> Result<McpFile, String> {
    let (path, format) = checked_path(&path)?;
    let original = read_limited(&path)?;
    parse_document(&original, format)?;
    let hash = format!("{:x}", sha2::Sha256::digest(original.as_bytes()));
    let text = if reveal_secrets {
        original
    } else {
        masked_text(&original, format)?
    };
    Ok(McpFile {
        text,
        hash,
        format: format.label().into(),
        secrets_revealed: reveal_secrets,
    })
}

#[tauri::command]
pub async fn save_mcp_config(
    path: String,
    text: String,
    expected: String,
) -> Result<String, String> {
    let (path, format) = checked_path(&path)?;
    expected_hash(&path, &expected)?;
    if text.len() > MAX_CONFIG_BYTES {
        return Err("MCP config is larger than 4 MiB".into());
    }
    write_verified(&path, &text, format)
}

#[tauri::command]
pub async fn restore_mcp_config(path: String, backup: String) -> Result<String, String> {
    let (path, format) = checked_path(&path)?;
    let backup = PathBuf::from(backup);
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Invalid MCP config path".to_string())?;
    let backup_name = backup
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    if !crate::paths::is_local_absolute(&backup)
        || path.parent() != backup.parent()
        || (!backup_name.starts_with(&format!("{name}.contextmeld-backup-"))
            && !backup_name.starts_with(&format!("{name}.agenthub-backup-")))
    {
        return Err("Invalid MCP backup path".into());
    }
    let backup_text = read_limited(&backup)?;
    parse_document(&backup_text, format)
        .map_err(|error| format!("Backup is not valid: {error}"))?;
    let rollback = backup_path(&path, "before-restore")?;
    std::fs::copy(&path, &rollback).map_err(|error| error.to_string())?;
    if let Err(error) = crate::exports::replace_text(&path, &backup_text) {
        let _ = std::fs::copy(&rollback, &path);
        return Err(error);
    }
    if read_limited(&path)
        .and_then(|text| parse_document(&text, format))
        .is_err()
    {
        let _ = std::fs::copy(&rollback, &path);
        return Err("MCP restore verification failed; the previous file was restored".into());
    }
    Ok(rollback.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn duplicate_mcp_server(
    path: String,
    name: String,
    new_name: String,
    expected: String,
) -> Result<String, String> {
    let (path, format, mut document) = load(&path)?;
    expected_hash(&path, &expected)?;
    let value = server_as_json(&document, &name)?;
    add_server(&mut document, &new_name, value)?;
    write_verified(&path, &serialize_document(&document)?, format)
}

#[tauri::command]
pub async fn add_mcp_server(
    path: String,
    name: String,
    config_json: String,
    expected: String,
) -> Result<String, String> {
    let (path, format, mut document) = load(&path)?;
    expected_hash(&path, &expected)?;
    let value: serde_json::Value = serde_json::from_str(&config_json)
        .map_err(|error| format!("Invalid server JSON: {error}"))?;
    add_server(&mut document, &name, value)?;
    write_verified(&path, &serialize_document(&document)?, format)
}

#[tauri::command]
pub async fn remove_mcp_server(
    path: String,
    name: String,
    expected: String,
) -> Result<String, String> {
    let (path, format, mut document) = load(&path)?;
    expected_hash(&path, &expected)?;
    let removed = match &mut document {
        ConfigDocument::Json(root) => json_servers(root)?.remove(&name).is_some(),
        ConfigDocument::Toml(root) => toml_servers(root)?.remove(&name).is_some(),
    };
    if !removed {
        return Err("MCP server was not found".into());
    }
    write_verified(&path, &serialize_document(&document)?, format)
}

#[tauri::command]
pub async fn set_mcp_enabled(
    path: String,
    name: String,
    enabled: bool,
    expected: String,
) -> Result<String, String> {
    let (path, format, mut document) = load(&path)?;
    expected_hash(&path, &expected)?;
    match &mut document {
        ConfigDocument::Json(root) => {
            let server = json_servers(root)?
                .get_mut(&name)
                .and_then(serde_json::Value::as_object_mut)
                .ok_or_else(|| "MCP server was not found".to_string())?;
            server.insert("disabled".into(), serde_json::Value::Bool(!enabled));
        }
        ConfigDocument::Toml(root) => {
            let server = toml_servers(root)?
                .get_mut(&name)
                .and_then(Item::as_table_mut)
                .ok_or_else(|| "MCP server was not found".to_string())?;
            server.insert("enabled", toml_edit::value(enabled));
        }
    }
    write_verified(&path, &serialize_document(&document)?, format)
}

#[tauri::command]
pub async fn copy_mcp_server(
    source_path: String,
    name: String,
    destination_path: String,
) -> Result<String, String> {
    let (_, _, source_document) = load(&source_path)?;
    let value = server_as_json(&source_document, &name)?;
    let (destination, format) = checked_path(&destination_path)?;
    let mut document = if destination.exists() {
        parse_document(&read_limited(&destination)?, format)?
    } else {
        match format {
            ConfigFormat::Json => ConfigDocument::Json(serde_json::json!({})),
            ConfigFormat::Toml => ConfigDocument::Toml(DocumentMut::new()),
        }
    };
    add_server(&mut document, &name, value).map_err(|error| {
        if error == "A server with that name already exists" {
            "A server with that name already exists at the destination".into()
        } else {
            error
        }
    })?;
    write_verified(&destination, &serialize_document(&document)?, format)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root() -> PathBuf {
        let root = std::env::temp_dir().join(format!("contextmeld-mcp-{}", stamp().unwrap()));
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    fn expected(path: &Path) -> String {
        format!("{:x}", sha2::Sha256::digest(std::fs::read(path).unwrap()))
    }

    #[test]
    fn json_mutations_backup_mask_and_restore() {
        let root = temp_root();
        let path = root.join("mcp.json");
        std::fs::write(
            &path,
            r#"{"mcpServers":{"files":{"command":"node","args":["server.js"],"env":{"TOKEN":"secret"}}}}"#,
        )
        .unwrap();
        let path_s = path.to_string_lossy().into_owned();
        let masked =
            tauri::async_runtime::block_on(read_mcp_config(path_s.clone(), false)).unwrap();
        assert!(!masked.text.contains("secret"));
        assert!(masked.text.contains("••••••••"));
        let revealed =
            tauri::async_runtime::block_on(read_mcp_config(path_s.clone(), true)).unwrap();
        assert!(revealed.text.contains("secret"));

        let backup = tauri::async_runtime::block_on(duplicate_mcp_server(
            path_s.clone(),
            "files".into(),
            "files-copy".into(),
            expected(&path),
        ))
        .unwrap();
        assert!(Path::new(&backup).exists());
        tauri::async_runtime::block_on(set_mcp_enabled(
            path_s.clone(),
            "files-copy".into(),
            false,
            expected(&path),
        ))
        .unwrap();
        let parsed: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(parsed["mcpServers"]["files-copy"]["disabled"], true);
        tauri::async_runtime::block_on(add_mcp_server(
            path_s.clone(),
            "http".into(),
            r#"{"url":"https://example.invalid/mcp"}"#.into(),
            expected(&path),
        ))
        .unwrap();
        tauri::async_runtime::block_on(remove_mcp_server(
            path_s.clone(),
            "http".into(),
            expected(&path),
        ))
        .unwrap();
        tauri::async_runtime::block_on(restore_mcp_config(path_s, backup)).unwrap();
        let restored: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert!(restored["mcpServers"].get("files-copy").is_none());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn toml_mutations_preserve_other_configuration_and_copy_between_formats() {
        let root = temp_root();
        let toml_path = root.join("config.toml");
        let json_path = root.join("target.json");
        std::fs::write(
            &toml_path,
            "# keep this comment\nmodel = \"example-model\"\n\n[mcp_servers.docs]\ncommand = \"npx\"\nargs = [\"docs-server\"]\nenv = { API_TOKEN = \"secret\" }\n",
        )
        .unwrap();
        std::fs::write(&json_path, r#"{"mcpServers":{}}"#).unwrap();
        let toml_s = toml_path.to_string_lossy().into_owned();

        tauri::async_runtime::block_on(duplicate_mcp_server(
            toml_s.clone(),
            "docs".into(),
            "docs-copy".into(),
            expected(&toml_path),
        ))
        .unwrap();
        tauri::async_runtime::block_on(set_mcp_enabled(
            toml_s.clone(),
            "docs-copy".into(),
            false,
            expected(&toml_path),
        ))
        .unwrap();
        tauri::async_runtime::block_on(add_mcp_server(
            toml_s.clone(),
            "remote".into(),
            r#"{"url":"https://example.invalid/mcp","bearer_token_env_var":"EXAMPLE_TOKEN"}"#
                .into(),
            expected(&toml_path),
        ))
        .unwrap();
        let saved = std::fs::read_to_string(&toml_path).unwrap();
        assert!(saved.contains("# keep this comment"));
        let parsed: toml::Value = toml::from_str(&saved).unwrap();
        assert_eq!(
            parsed["mcp_servers"]["docs-copy"]["enabled"].as_bool(),
            Some(false)
        );
        assert_eq!(
            parsed["mcp_servers"]["remote"]["url"].as_str(),
            Some("https://example.invalid/mcp")
        );

        tauri::async_runtime::block_on(copy_mcp_server(
            toml_s.clone(),
            "docs".into(),
            json_path.to_string_lossy().into_owned(),
        ))
        .unwrap();
        let copied: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&json_path).unwrap()).unwrap();
        assert_eq!(copied["mcpServers"]["docs"]["command"], "npx");
        tauri::async_runtime::block_on(remove_mcp_server(
            toml_s,
            "remote".into(),
            expected(&toml_path),
        ))
        .unwrap();
        let _ = std::fs::remove_dir_all(root);
    }
}
