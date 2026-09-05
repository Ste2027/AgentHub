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
    [
        (
            "claude",
            "Claude Code",
            ".claude/projects",
            &settings.claude_path,
            true,
        ),
        (
            "codex",
            "OpenAI Codex",
            ".codex/sessions",
            &settings.codex_path,
            true,
        ),
        ("cursor", "Cursor", "", &String::new(), false),
        ("gemini", "Gemini CLI", "", &String::new(), false),
        ("opencode", "OpenCode", "", &String::new(), false),
        ("copilot", "GitHub Copilot", "", &String::new(), false),
    ]
    .iter()
    .map(|(id, name, default, custom, supported)| {
        let path = if !supported {
            String::new()
        } else if custom.is_empty() {
            if *id == "codex" {
                std::env::var_os("CODEX_HOME")
                    .map(|p| std::path::PathBuf::from(p).join("sessions"))
                    .unwrap_or_else(|| home.join(default))
                    .to_string_lossy()
                    .into_owned()
            } else {
                home.join(default).to_string_lossy().into_owned()
            }
        } else {
            (*custom).clone()
        };
        Agent {
            id: id.to_string(),
            name: name.to_string(),
            supported: *supported,
            detected: *supported
                && crate::paths::is_local_absolute(Path::new(&path))
                && Path::new(&path).is_dir(),
            path,
        }
    })
    .collect()
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
