export interface Agent {
  id: string;
  name: string;
  supported: boolean;
  detected: boolean;
  path: string;
}
export interface Session {
  id: string;
  agent: string;
  source_id: string;
  source: string;
  project: string;
  title: string;
  updated_at: string;
  model: string;
  event_count: number;
  warnings: number;
}
export interface TimelineEvent {
  ordinal: number;
  kind: string;
  role: string;
  timestamp: string;
  text: string;
  name: string;
  call_id: string;
}
export interface Settings {
  claude_path: string;
  codex_path: string;
  light_mode: boolean;
}
export interface Project {
  path: string;
  name: string;
  sessions: number;
  agents: string;
  updated_at: string;
  git: boolean;
}
export interface Overview {
  sessions: number;
  projects: number;
  events: number;
  agents: Agent[];
  database_path: string;
}
export interface SearchHit {
  entity_type?: "session" | "memory";
  entity_id?: string;
  session_id: string;
  title: string;
  agent: string;
  project: string;
  text: string;
  kind: string;
  ordinal: number;
}
export interface IndexProgress {
  scanned: number;
  indexed: number;
  skipped: number;
  failed: number;
  warnings: number;
  done: boolean;
  issues: string[];
}
export type Page =
  | "overview"
  | "sessions"
  | "projects"
  | "agents"
  | "settings"
  | "memories"
  | "analytics";
export interface MemoryDraft {
  id: string | null;
  revision: number | null;
  title: string;
  body: string;
  scope: "global" | "project" | "agent";
  project: string;
  agents: string[];
  tags: string[];
}
export interface Memory extends Omit<MemoryDraft, "id" | "revision"> {
  id: string;
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
export interface MemoryPage {
  items: Memory[];
  total: number;
}
export interface ImportResult {
  imported: number;
  skipped: number;
}
export interface Metric {
  label: string;
  count: number;
}
export interface Analytics {
  session_count: number;
  project_count: number;
  event_count: number;
  activity: Metric[];
  models: Metric[];
  tools: Metric[];
  file_requests: Metric[];
  shell_requests: Metric[];
  errors: Metric[];
  agents: {
    agent: string;
    sessions: number;
    tool_calls: number;
    errors: number;
  }[];
}
export interface SessionContext {
  session_id: string;
  title: string;
  project: string;
  source_agent: string;
  task: string;
  decisions: string;
  remaining_work: string;
  files: string[];
  commands: string[];
  errors: string[];
  notes: string[];
  truncated: boolean;
}
export interface Skill {
  name: string;
  agent: string;
  path: string;
  description: string;
  scope: string;
  readable: boolean;
}
export interface McpServer {
  name: string;
  agent: string;
  scope: string;
  config_path: string;
  transport: string;
  command: string | null;
  args: string[];
  env_keys: string[];
  url: string | null;
  enabled: boolean;
  readable: boolean;
}
