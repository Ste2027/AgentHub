use super::*;
use std::collections::HashMap;
pub struct Claude;
impl AgentAdapter for Claude {
    fn id(&self) -> &'static str {
        "claude"
    }
    fn name(&self) -> &'static str {
        "Claude Code"
    }
    fn parse(&self, reader: &mut dyn BufRead, source: &Path) -> Result<ParsedSession, String> {
        let mut out = base(self.id(), source);
        let mut seen = HashMap::<String, usize>::new();
        out.session.warnings = records(reader, |v| {
            let typ = string(&v, "type");
            if !["user", "assistant"].contains(&typ.as_str()) {
                return;
            }
            let sid = string(&v, "sessionId");
            if !sid.is_empty() {
                out.session.source_id = sid;
            }
            let cwd = string(&v, "cwd");
            if !cwd.is_empty() {
                out.session.project = cwd;
            }
            let timestamp = string(&v, "timestamp");
            let msg = &v["message"];
            let model = string(msg, "model");
            if !model.is_empty() {
                out.session.model = model;
            }
            let identity = string(&v, "uuid");
            let blocks = msg["content"].as_array().cloned().unwrap_or_else(|| {
                vec![serde_json::json!({"type":"text","text":content(&msg["content"])})]
            });
            for (i, b) in blocks.iter().enumerate() {
                let event = match string(b, "type").as_str() {
                    "text" => event(
                        "message",
                        &typ,
                        &timestamp,
                        string(b, "text"),
                        String::new(),
                        String::new(),
                    ),
                    "tool_use" => event(
                        "tool_call",
                        "assistant",
                        &timestamp,
                        b["input"].to_string(),
                        string(b, "name"),
                        string(b, "id"),
                    ),
                    "tool_result" => event(
                        if b["is_error"].as_bool() == Some(true) {
                            "error"
                        } else {
                            "tool_result"
                        },
                        "tool",
                        &timestamp,
                        content(&b["content"]),
                        String::new(),
                        string(b, "tool_use_id"),
                    ),
                    _ => continue,
                };
                if event.text.is_empty() && event.kind == "message" {
                    continue;
                }
                let key = format!("{identity}:{i}");
                if !identity.is_empty() {
                    if let Some(index) = seen.get(&key) {
                        out.events[*index] = event;
                        continue;
                    }
                    seen.insert(key, out.events.len());
                }
                out.events.push(event);
            }
        })?;
        finish(out)
    }
}
