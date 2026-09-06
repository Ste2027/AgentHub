use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    pub ordinal: usize,
    pub kind: String,
    pub role: String,
    pub timestamp: String,
    pub text: String,
    pub name: String,
    pub call_id: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub agent: String,
    pub source_id: String,
    pub source: String,
    pub project: String,
    pub title: String,
    pub updated_at: String,
    pub model: String,
    pub event_count: usize,
    pub warnings: usize,
}
#[derive(Debug, Clone)]
pub struct ParsedSession {
    pub session: Session,
    pub events: Vec<Event>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub supported: bool,
    pub detected: bool,
    pub installation_detected: bool,
    pub config_detected: bool,
    pub sessions_detected: bool,
    pub adapter_status: String,
    pub config_path: String,
    pub path: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub claude_path: String,
    pub codex_path: String,
    pub light_mode: bool,
    pub auto_index: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            claude_path: String::new(),
            codex_path: String::new(),
            light_mode: false,
            auto_index: true,
        }
    }
}
#[derive(Debug, Serialize)]
pub struct Project {
    pub path: String,
    pub name: String,
    pub sessions: usize,
    pub agents: String,
    pub updated_at: String,
    pub git: bool,
    pub branch: String,
    pub memories: usize,
    pub skills: usize,
    pub errors: usize,
    pub modified_files: Vec<String>,
    pub recent_activity: Vec<String>,
}
#[derive(Debug, Serialize)]
pub struct SearchHit {
    pub entity_type: String,
    pub entity_id: String,
    pub session_id: String,
    pub title: String,
    pub agent: String,
    pub project: String,
    pub text: String,
    pub kind: String,
    pub ordinal: usize,
    pub updated_at: String,
}
#[derive(Debug, Clone, Default, Serialize)]
pub struct IndexProgress {
    pub scanned: usize,
    pub indexed: usize,
    pub skipped: usize,
    pub failed: usize,
    pub warnings: usize,
    pub done: bool,
    pub issues: Vec<String>,
}
#[derive(Debug, Clone, Default, Serialize)]
pub struct AutoIndexStatus {
    pub enabled: bool,
    pub active: bool,
    pub running: bool,
    pub watched_paths: Vec<String>,
    pub last_run_at: Option<u64>,
    pub last_indexed: usize,
    pub last_failed: usize,
    pub last_warnings: usize,
    pub last_error: String,
}
#[derive(Debug, Clone, Serialize)]
pub struct AutoIndexUpdate {
    pub status: AutoIndexStatus,
    pub progress: Option<IndexProgress>,
}
#[derive(Debug, Serialize)]
pub struct Overview {
    pub sessions: usize,
    pub projects: usize,
    pub events: usize,
    pub agents: Vec<Agent>,
    pub database_path: String,
    pub demo_mode: bool,
}
