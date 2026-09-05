mod claude;
mod codex;

use crate::models::{Agent, Event, ParsedSession, Session, Settings};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{io::BufRead, path::Path};

pub trait AgentAdapter: Send + Sync {
    fn id(&self) -> &'static str;
    fn name(&self) -> &'static str;
    fn parse(&self, reader: &mut dyn BufRead, source: &Path) -> Result<ParsedSession, String>;
}
pub fn adapter(id: &str) -> Option<Box<dyn AgentAdapter>> {
    match id {
        "claude" => Some(Box::new(claude::Claude)),
        "codex" => Some(Box::new(codex::Codex)),
        _ => None,
    }
}
pub fn agents(settings: &Settings) -> Vec<Agent> {
    let home = dirs::home_dir().unwrap_or_default();
    let codex_root = std::env::var_os("CODEX_HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| home.join(".codex"));
    let copilot_root = std::env::var_os("COPILOT_HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| home.join(".copilot"));
    let opencode_root = std::env::var_os("OPENCODE_CONFIG_DIR")
        .map(std::path::PathBuf::from)
        .or_else(|| {
            std::env::var_os("XDG_CONFIG_HOME")
                .map(std::path::PathBuf::from)
                .map(|path| path.join("opencode"))
        })
        .unwrap_or_else(|| home.join(".config/opencode"));
    let definitions = [
        (
            "claude",
            "Claude Code",
            home.join(".claude"),
            vec!["claude"],
            true,
        ),
        ("codex", "OpenAI Codex", codex_root, vec!["codex"], true),
        (
            "cursor",
            "Cursor",
            home.join(".cursor"),
            vec!["cursor", "cursor-agent"],
            false,
        ),
        (
            "gemini",
            "Gemini CLI",
            home.join(".gemini"),
            vec!["gemini"],
            false,
        ),
        (
            "opencode",
            "OpenCode",
            opencode_root,
            vec!["opencode"],
            false,
        ),
        (
            "copilot",
            "GitHub Copilot",
            copilot_root,
            vec!["copilot"],
            false,
        ),
    ];
    definitions
        .into_iter()
        .map(|(id, name, config_root, commands, supported)| {
            let custom = match id {
                "claude" => settings.claude_path.as_str(),
                "codex" => settings.codex_path.as_str(),
                _ => "",
            };
            let session_path = if !custom.is_empty() {
                std::path::PathBuf::from(custom)
            } else if id == "claude" {
                config_root.join("projects")
            } else if id == "codex" {
                config_root.join("sessions")
            } else {
                std::path::PathBuf::new()
            };
            let installation_detected = command_exists(&commands);
            let config_detected =
                crate::paths::is_local_absolute(&config_root) && config_root.is_dir();
            let sessions_detected = supported
                && crate::paths::is_local_absolute(&session_path)
                && session_path.is_dir();
            Agent {
                id: id.into(),
                name: name.into(),
                supported,
                // `detected` is the installation signal shown in summaries. A stale
                // config directory or old transcript must not imply that the app is
                // currently installed; those signals remain available separately.
                detected: installation_detected,
                installation_detected,
                config_detected,
                sessions_detected,
                adapter_status: if supported {
                    "Supported"
                } else {
                    "Detection only"
                }
                .into(),
                config_path: config_root.to_string_lossy().into_owned(),
                path: session_path.to_string_lossy().into_owned(),
            }
        })
        .collect()
}

fn command_exists(names: &[&str]) -> bool {
    names
        .iter()
        .any(|name| crate::paths::local_executable(name).is_some())
}
pub fn string(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned()
}
pub fn content(v: &Value) -> String {
    if let Some(s) = v.as_str() {
        return s.to_owned();
    }
    if let Some(a) = v.as_array() {
        return a
            .iter()
            .filter_map(|b| b.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n");
    }
    String::new()
}
pub fn event(
    kind: &str,
    role: &str,
    timestamp: &str,
    text: String,
    name: String,
    call_id: String,
) -> Event {
    Event {
        ordinal: 0,
        kind: kind.into(),
        role: role.into(),
        timestamp: timestamp.into(),
        text,
        name,
        call_id,
    }
}
pub fn base(agent: &str, source: &Path) -> ParsedSession {
    let source = source.to_string_lossy().into_owned();
    let id = format!("{}:{:x}", agent, Sha256::digest(source.as_bytes()));
    ParsedSession {
        session: Session {
            id,
            agent: agent.into(),
            source_id: String::new(),
            source,
            project: String::new(),
            title: "Untitled session".into(),
            updated_at: String::new(),
            model: String::new(),
            event_count: 0,
            warnings: 0,
        },
        events: Vec::new(),
    }
}
pub fn finish(mut parsed: ParsedSession) -> Result<ParsedSession, String> {
    if parsed.events.is_empty() && parsed.session.source_id.is_empty() {
        return Err("No recognized session records".into());
    }
    for (i, e) in parsed.events.iter_mut().enumerate() {
        e.ordinal = i;
    }
    if let Some(e) = parsed
        .events
        .iter()
        .find(|e| e.role == "user" && e.kind == "message" && !e.text.trim().is_empty())
    {
        parsed.session.title = e
            .text
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .chars()
            .take(120)
            .collect();
    }
    if let Some(t) = parsed
        .events
        .iter()
        .map(|e| &e.timestamp)
        .filter(|s| !s.is_empty())
        .max()
    {
        parsed.session.updated_at = t.clone();
    }
    parsed.session.event_count = parsed.events.len();
    Ok(parsed)
}
// Bounded line reads prevent a single hostile JSONL record from consuming arbitrary memory.
pub fn records(reader: &mut dyn BufRead, mut consume: impl FnMut(Value)) -> Result<usize, String> {
    use std::io::Read;
    const MAX_LINE: u64 = 8 * 1024 * 1024;
    let mut warnings = 0;
    loop {
        let mut line = Vec::new();
        let n = reader
            .take(MAX_LINE + 1)
            .read_until(b'\n', &mut line)
            .map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        if n as u64 > MAX_LINE {
            while !line.ends_with(b"\n") {
                line.clear();
                if reader
                    .take(MAX_LINE)
                    .read_until(b'\n', &mut line)
                    .map_err(|e| e.to_string())?
                    == 0
                {
                    break;
                }
            }
            warnings += 1;
            continue;
        }
        if line.iter().all(u8::is_ascii_whitespace) {
            continue;
        }
        match serde_json::from_slice(&line) {
            Ok(v) => consume(v),
            Err(_) => warnings += 1,
        }
    }
    Ok(warnings)
}

#[cfg(test)]
mod agent_detection_tests {
    use super::*;

    #[test]
    fn reports_all_agents_without_claiming_unimplemented_adapters() {
        let found = agents(&Settings::default());
        assert_eq!(found.len(), 6);
        assert_eq!(found.iter().filter(|agent| agent.supported).count(), 2);
        assert!(found
            .iter()
            .all(|agent| agent.detected == agent.installation_detected));
        for id in ["cursor", "gemini", "opencode", "copilot"] {
            let agent = found.iter().find(|agent| agent.id == id).unwrap();
            assert_eq!(agent.adapter_status, "Detection only");
            assert!(!agent.sessions_detected);
        }
    }
}
