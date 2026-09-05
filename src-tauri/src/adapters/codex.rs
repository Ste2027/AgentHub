use super::*;
pub struct Codex;
impl AgentAdapter for Codex {
    fn id(&self) -> &'static str {
        "codex"
    }
    fn name(&self) -> &'static str {
        "OpenAI Codex"
    }
    fn parse(&self, reader: &mut dyn BufRead, source: &Path) -> Result<ParsedSession, String> {
        let mut out = base(self.id(), source);
        out.session.warnings = records(reader, |v| {
            let p = &v["payload"];
            let timestamp = string(&v, "timestamp");
            match string(&v, "type").as_str() {
                "session_meta" => {
                    out.session.source_id = string(p, "id");
                    out.session.project = string(p, "cwd");
                    out.session.updated_at = timestamp;
                }
                "turn_context" => {
                    let m = string(p, "model");
                    if !m.is_empty() {
                        out.session.model = m;
                    }
                    let cwd = string(p, "cwd");
                    if !cwd.is_empty() {
                        out.session.project = cwd;
                    }
                }
                "response_item" => {
                    let e = match string(p, "type").as_str() {
                        "message" => event(
                            "message",
                            &string(p, "role"),
                            &timestamp,
                            content(&p["content"]),
                            String::new(),
                            String::new(),
                        ),
                        "function_call" => event(
                            "tool_call",
                            "assistant",
                            &timestamp,
                            string(p, "arguments"),
                            string(p, "name"),
                            string(p, "call_id"),
                        ),
                        "custom_tool_call" => event(
                            "tool_call",
                            "assistant",
                            &timestamp,
                            string(p, "input"),
                            string(p, "name"),
                            string(p, "call_id"),
                        ),
                        "function_call_output" | "custom_tool_call_output" => event(
                            "tool_result",
                            "tool",
                            &timestamp,
                            if p["output"].is_string() {
                                string(p, "output")
                            } else {
                                p["output"].to_string()
                            },
                            String::new(),
                            string(p, "call_id"),
                        ),
                        _ => return,
                    };
                    if !e.text.is_empty() {
                        out.events.push(e);
                    }
                }
                "event_msg" if string(p, "type") == "error" => out.events.push(event(
                    "error",
                    "system",
                    &timestamp,
                    string(p, "message"),
                    String::new(),
                    String::new(),
                )),
                // event_msg user_message/agent_message duplicate response_item messages.
                _ => {}
            }
        })?;
        finish(out)
    }
}
