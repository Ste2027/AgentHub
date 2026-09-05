import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  IndexProgress,
  Overview,
  Project,
  SearchHit,
  Session,
  Settings,
  TimelineEvent,
} from "./types";
export const desktop = isTauri();
function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!desktop)
    return Promise.reject(
      new Error(
        "Open the desktop app to access your local agent data. Run npm run desktop.",
      ),
    );
  return invoke<T>(command, args);
}
export const api = {
  session: (sessionId: string) =>
    call<Session | null>("get_session", { sessionId }),
  overview: () => call<Overview>("overview"),
  settings: () => call<Settings>("get_settings"),
  saveSettings: (settings: Settings) =>
    call<void>("save_settings", { settings }),
  sessions: (agent = "", project = "", offset = 0) =>
    call<Session[]>("list_sessions", { agent, project, offset }),
  events: (sessionId: string, offset = 0) =>
    call<TimelineEvent[]>("session_events", { sessionId, offset }),
  projects: () => call<Project[]>("list_projects"),
  search: (query: string) => call<SearchHit[]>("search", { query }),
  index: (force = false) => call<IndexProgress>("index_sessions", { force }),
};
