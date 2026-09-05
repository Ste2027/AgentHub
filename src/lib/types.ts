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
export type Page = "overview" | "sessions" | "projects" | "agents" | "settings";
