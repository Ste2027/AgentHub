import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  Analytics,
  SessionContext,
  Skill,
  McpServer,
  SkillFile,
  McpFile,
} from "./types";
import type { Memory, MemoryDraft, MemoryPage, ImportResult } from "./types";
import type {
  IndexProgress,
  AutoIndexStatus,
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
  skillContent: (path: string) => call<SkillFile>("read_skill", { path }),
  exportSkill: (path: string) => call<string>("export_skill", { path }),
  importSkillArchive: (json: string, destinationDir: string) =>
    call<string>("import_skill_archive", { json, destinationDir }),
  saveSkill: (path: string, text: string, expected: string) =>
    call<string>("save_skill", { path, text, expected }),
  restoreSkill: (path: string, backup: string) =>
    call<void>("restore_skill", { path, backup }),
  copySkill: (path: string, destinationDir: string) =>
    call<string>("copy_skill", { path, destinationDir }),
  duplicateSkill: (path: string, newName: string) =>
    call<string>("duplicate_skill", { path, newName }),
  installSkill: (name: string, text: string, destinationDir: string) =>
    call<string>("install_skill", { name, text, destinationDir }),
  deleteSkill: (path: string) => call<string>("delete_skill", { path }),
  restoreDeletedSkill: (trashPath: string) =>
    call<string>("restore_deleted_skill", { trashPath }),
  mcpServers: () => call<McpServer[]>("list_mcp_servers"),
  mcpConfig: (path: string, revealSecrets = false) =>
    call<McpFile>("read_mcp_config", { path, revealSecrets }),
  saveMcpConfig: (path: string, text: string, expected: string) =>
    call<string>("save_mcp_config", { path, text, expected }),
  restoreMcpConfig: (path: string, backup: string) =>
    call<string>("restore_mcp_config", { path, backup }),
  duplicateMcpServer: (
    path: string,
    name: string,
    newName: string,
    expected: string,
  ) => call<string>("duplicate_mcp_server", { path, name, newName, expected }),
  addMcpServer: (
    path: string,
    name: string,
    configJson: string,
    expected: string,
  ) => call<string>("add_mcp_server", { path, name, configJson, expected }),
  removeMcpServer: (path: string, name: string, expected: string) =>
    call<string>("remove_mcp_server", { path, name, expected }),
  setMcpEnabled: (
    path: string,
    name: string,
    enabled: boolean,
    expected: string,
  ) => call<string>("set_mcp_enabled", { path, name, enabled, expected }),
  copyMcpServer: (sourcePath: string, name: string, destinationPath: string) =>
    call<string>("copy_mcp_server", { sourcePath, name, destinationPath }),
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
  sessions: (
    agent = "",
    project = "",
    dateFrom = "",
    dateTo = "",
    model = "",
    sort = "newest",
    offset = 0,
  ) =>
    call<Session[]>("list_sessions", {
      agent,
      project,
      dateFrom,
      dateTo,
      model,
      sort,
      offset,
    }),
  events: (sessionId: string, offset = 0) =>
    call<TimelineEvent[]>("session_events", { sessionId, offset }),
  projects: () => call<Project[]>("list_projects"),
  search: (query: string) => call<SearchHit[]>("search", { query }),
  index: (force = false) => call<IndexProgress>("index_sessions", { force }),
  autoIndexStatus: () => call<AutoIndexStatus>("auto_index_status"),
};
