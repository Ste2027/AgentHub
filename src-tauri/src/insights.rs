use crate::database::Database;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, VecDeque};
type Result<T> = std::result::Result<T, String>;
#[derive(Debug, Serialize)]
pub struct Metric {
    pub label: String,
    pub count: usize,
}
#[derive(Debug, Serialize)]
pub struct AgentComparison {
    pub agent: String,
    pub sessions: usize,
    pub tool_calls: usize,
    pub errors: usize,
}
#[derive(Debug, Serialize)]
pub struct Analytics {
    pub session_count: usize,
    pub project_count: usize,
    pub event_count: usize,
    pub activity: Vec<Metric>,
    pub models: Vec<Metric>,
    pub tools: Vec<Metric>,
    pub file_requests: Vec<Metric>,
    pub shell_requests: Vec<Metric>,
    pub errors: Vec<Metric>,
    pub agents: Vec<AgentComparison>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionContext {
    pub session_id: String,
    pub title: String,
    pub project: String,
    pub source_agent: String,
    pub task: String,
    pub decisions: String,
    pub remaining_work: String,
    pub files: Vec<String>,
    pub commands: Vec<String>,
    pub errors: Vec<String>,
    pub notes: Vec<String>,
    pub truncated: bool,
}
#[derive(Default, Debug)]
pub struct ToolDetails {
    pub command: Option<String>,
    pub files: Vec<String>,
}
pub fn tool_details(name: &str, text: &str) -> ToolDetails {
    let name = name.rsplit('.').next().unwrap_or(name);
    let value: Value = serde_json::from_str(text).unwrap_or(Value::Null);
    let mut result = ToolDetails::default();
    if matches!(name, "Bash" | "exec_command" | "shell_command" | "shell") {
        if let Some(v) = value.get("cmd").or_else(|| value.get("command")) {
            if let Some(s) = v.as_str() {
                result.command = Some(s.to_owned());
            } else if v.is_array() {
                result.command = Some(v.to_string());
            }
        }
    }
    if matches!(name, "Write" | "Edit" | "MultiEdit") {
        if let Some(path) = value.get("file_path").and_then(Value::as_str) {
            result.files.push(path.to_owned());
        }
    }
    if name == "apply_patch" {
        let patch = value
            .get("input")
            .or_else(|| value.get("patch"))
            .and_then(Value::as_str)
            .or_else(|| value.as_str())
            .unwrap_or(text);
        for line in patch.lines() {
            for prefix in [
                "*** Add File: ",
                "*** Update File: ",
                "*** Delete File: ",
                "*** Move to: ",
            ] {
                if let Some(path) = line.strip_prefix(prefix) {
                    result.files.push(path.trim().to_owned());
                }
            }
        }
    }
    result.files.sort();
    result.files.dedup();
    result
}
fn metrics(conn: &rusqlite::Connection, sql: &str) -> Result<Vec<Metric>> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Metric {
                label: r.get(0)?,
                count: r.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<_>>()
        .map_err(|e| e.to_string())
}
fn ranked(values: BTreeMap<String, usize>) -> Vec<Metric> {
    let mut values: Vec<_> = values
        .into_iter()
        .map(|(label, count)| Metric { label, count })
        .collect();
    values.sort_by(|a, b| b.count.cmp(&a.count).then(a.label.cmp(&b.label)));
    values.truncate(20);
    values
}
fn excerpt(text: &str, max: usize) -> String {
    text.chars().take(max).collect()
}
fn recent(
    items: &mut VecDeque<String>,
    text: &str,
    limit: usize,
    max: usize,
    truncated: &mut bool,
) {
    if text.chars().count() > max || items.len() == limit {
        *truncated = true;
    }
    if items.len() == limit {
        items.pop_front();
    }
    items.push_back(excerpt(text, max));
}
impl Database {
    pub fn analytics(&self) -> Result<Analytics> {
        let (session_count,project_count,event_count)=self.conn.query_row("SELECT (SELECT count(*) FROM sessions),(SELECT count(*) FROM projects WHERE path<>''),(SELECT count(*) FROM events)",[],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).map_err(|e|e.to_string())?;
        let activity=metrics(&self.conn,"SELECT substr(updated_at,1,10),count(*) FROM sessions WHERE updated_at<>'' GROUP BY substr(updated_at,1,10) ORDER BY 1 DESC LIMIT 30")?;
        let models=metrics(&self.conn,"SELECT CASE WHEN model='' THEN 'Not recorded' ELSE model END,count(*) FROM sessions GROUP BY model ORDER BY count(*) DESC LIMIT 20")?;
        let tools=metrics(&self.conn,"SELECT CASE WHEN name='' THEN 'Unnamed tool' ELSE name END,count(*) FROM events WHERE kind='tool_call' GROUP BY name ORDER BY count(*) DESC LIMIT 20")?;
        let errors=metrics(&self.conn,"SELECT substr(text,1,240),count(*) FROM events WHERE kind='error' GROUP BY substr(text,1,240) ORDER BY count(*) DESC LIMIT 20")?;
        let mut stmt = self
            .conn
            .prepare("SELECT name,text FROM events WHERE kind='tool_call'")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        let mut files = BTreeMap::new();
        let mut commands = BTreeMap::new();
        for row in rows {
            let (name, text) = row.map_err(|e| e.to_string())?;
            let details = tool_details(&name, &text);
            for path in details.files {
                *files.entry(path).or_insert(0) += 1;
            }
            if let Some(cmd) = details.command {
                *commands.entry(excerpt(&cmd, 240)).or_insert(0) += 1;
            }
        }
        let mut stmt=self.conn.prepare("SELECT s.agent,count(DISTINCT s.id),coalesce(sum(e.kind='tool_call'),0),coalesce(sum(e.kind='error'),0) FROM sessions s LEFT JOIN events e ON e.session_id=s.id GROUP BY s.agent ORDER BY s.agent").map_err(|e|e.to_string())?;
        let agents = stmt
            .query_map([], |r| {
                Ok(AgentComparison {
                    agent: r.get(0)?,
                    sessions: r.get(1)?,
                    tool_calls: r.get(2)?,
                    errors: r.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<rusqlite::Result<_>>()
            .map_err(|e| e.to_string())?;
        Ok(Analytics {
            session_count,
            project_count,
            event_count,
            activity,
            models,
            tools,
            errors,
            agents,
            file_requests: ranked(files),
            shell_requests: ranked(commands),
        })
    }
    pub fn session_context(&self, id: &str) -> Result<SessionContext> {
        let session = self.session(id)?.ok_or("Session not found")?;
        let mut context = SessionContext {
            session_id: session.id,
            title: session.title,
            project: session.project,
            source_agent: session.agent,
            task: String::new(),
            decisions: String::new(),
            remaining_work: String::new(),
            files: Vec::new(),
            commands: Vec::new(),
            errors: Vec::new(),
            notes: Vec::new(),
            truncated: false,
        };
        let mut statement = self
            .conn
            .prepare("SELECT kind,role,name,text FROM events WHERE session_id=?1 ORDER BY ordinal")
            .map_err(|e| e.to_string())?;
        let rows = statement
            .query_map([id], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut files = BTreeSet::new();
        let mut commands = VecDeque::new();
        let mut errors = VecDeque::new();
        let mut notes = VecDeque::new();
        let mut decisions = VecDeque::new();
        let mut todos = VecDeque::new();
        for row in rows {
            let (kind, role, name, text) = row.map_err(|e| e.to_string())?;
            if kind == "message" && role == "user" && context.task.is_empty() {
                context.task = excerpt(&text, 4000);
                context.truncated |= text.chars().count() > 4000;
            }
            if kind == "message" && role == "assistant" {
                recent(&mut notes, &text, 2, 2000, &mut context.truncated);
                for line in text.lines() {
                    let line = line.trim();
                    if line.starts_with("Decision:") {
                        recent(&mut decisions, line, 10, 300, &mut context.truncated);
                    }
                    if line.starts_with("TODO:") || line.starts_with("- [ ]") {
                        recent(&mut todos, line, 10, 300, &mut context.truncated);
                    }
                }
            }
            if kind == "tool_call" {
                let details = tool_details(&name, &text);
                for file in details.files {
                    if files.len() < 100 {
                        files.insert(excerpt(&file, 500));
                    } else {
                        context.truncated = true;
                    }
                }
                if let Some(cmd) = details.command {
                    recent(&mut commands, &cmd, 30, 500, &mut context.truncated);
                }
            }
            if kind == "error" {
                recent(&mut errors, &text, 10, 500, &mut context.truncated);
            }
        }
        context.files = files.into_iter().collect();
        context.commands = commands.into_iter().collect();
        context.errors = errors.into_iter().collect();
        context.notes = notes.into_iter().collect();
        context.decisions = decisions.into_iter().collect::<Vec<_>>().join("\n");
        context.remaining_work = todos.into_iter().collect::<Vec<_>>().join("\n");
        Ok(context)
    }
}
