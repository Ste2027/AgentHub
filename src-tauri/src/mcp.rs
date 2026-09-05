use serde::Serialize;
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Serialize)]
pub struct McpServer {
    pub name: String,
    pub agent: String,
    pub scope: String,
    pub config_path: String,
    pub transport: String,
    pub command: Option<String>,
    pub args: Vec<String>,
    pub env_keys: Vec<String>,
    pub url: Option<String>,
    pub enabled: bool,
    pub readable: bool,
}
#[derive(Debug, Serialize)]
pub struct McpFile {
    pub text: String,
    pub hash: String,
}
fn add_json(path: &Path, agent: &str, scope: &str, out: &mut Vec<McpServer>) {
    let Ok(text) = fs::read_to_string(path) else {
        return;
    };
    let Ok(root) = serde_json::from_str::<Value>(&text) else {
        return;
    };
    let Some(map) = root.get("mcpServers").and_then(Value::as_object) else {
        return;
    };
    for (name, v) in map {
        let command = v.get("command").and_then(Value::as_str).map(str::to_owned);
        let args = v
            .get("args")
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default();
        let env_keys = v
            .get("env")
            .and_then(Value::as_object)
            .map(|m| m.keys().cloned().collect())
            .unwrap_or_default();
        let url = v.get("url").and_then(Value::as_str).map(str::to_owned);
        let transport = if url.is_some() { "http" } else { "stdio" };
        let enabled = v.get("disabled").and_then(Value::as_bool) != Some(true)
            && v.get("enabled").and_then(Value::as_bool) != Some(false);
        out.push(McpServer {
            name: name.clone(),
            agent: agent.into(),
            scope: scope.into(),
            config_path: path.to_string_lossy().into_owned(),
            transport: transport.into(),
            command,
            args,
            env_keys,
            url,
            enabled,
            readable: true,
        });
    }
}
fn add_toml(path: &Path, out: &mut Vec<McpServer>) {
    let Ok(text) = fs::read_to_string(path) else {
        return;
    };
    let Ok(root) = text.parse::<toml::Value>() else {
        return;
    };
    let Some(map) = root.get("mcp_servers").and_then(toml::Value::as_table) else {
        return;
    };
    for (name, v) in map {
        let Some(t) = v.as_table() else { continue };
        let command = t
            .get("command")
            .and_then(toml::Value::as_str)
            .map(str::to_owned);
        let args = t
            .get("args")
            .and_then(toml::Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(toml::Value::as_str)
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default();
        let env_keys = t
            .get("env")
            .and_then(toml::Value::as_table)
            .map(|m| m.keys().cloned().collect())
            .unwrap_or_default();
        let url = t
            .get("url")
            .and_then(toml::Value::as_str)
            .map(str::to_owned);
        out.push(McpServer {
            name: name.clone(),
            agent: "codex".into(),
            scope: "user".into(),
            config_path: path.to_string_lossy().into_owned(),
            transport: if url.is_some() {
                "http".into()
            } else {
                "stdio".into()
            },
            command,
            args,
            env_keys,
            url,
            enabled: true,
            readable: true,
        });
    }
}
pub fn discover(projects: &[String]) -> Vec<McpServer> {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let mut out = Vec::new();
    add_json(&home.join(".claude.json"), "claude", "user", &mut out);
    add_toml(&home.join(".codex/config.toml"), &mut out);
    for p in projects {
        let path = Path::new(p);
        add_json(&path.join(".mcp.json"), "claude", "project", &mut out);
    }
    out.sort_by(|a, b| a.agent.cmp(&b.agent).then(a.name.cmp(&b.name)));
    out
}
