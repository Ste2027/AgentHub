import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Analytics, SessionContext, Skill, McpServer } from "./types";
import type { Memory, MemoryDraft, MemoryPage, ImportResult } from "./types";
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
  analytics: () => call<Analytics>("get_analytics"),
  skills: () => call<Skill[]>("list_skills"),
  mcpServers: () => call<McpServer[]>("list_mcp_servers"),
  context: (sessionId: string) =>
    call<SessionContext>("session_context", { sessionId }),
  memories: (query = "", scope = "", trash = false, offset = 0) =>
    call<MemoryPage>("list_memories", { query, scope, trash, offset }),
  memory: (id: string) => call<Memory | null>("get_memory", { id }),
  saveMemory: (draft: MemoryDraft) => call<Memory>("save_memory", { draft }),
  trashMemory: (id: string, revision: number, restore = false) =>
    call<void>("trash_memory", { id, revision, restore }),
  exportMemories: (ids: string[] = []) =>
    call<string>("export_memories", { ids }),
  importMemories: (json: string) =>
    call<ImportResult>("import_memories", { json }),
  writeExport: (path: string, text: string) =>
    call<void>("write_export", { path, text }),
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
