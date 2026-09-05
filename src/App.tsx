import {
  OverviewPage,
  SessionsPage,
  ProjectsPage,
  AgentsPage,
} from "./features/WorkspacePages";
import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  Layers3,
  LayoutDashboard,
  MessagesSquare,
  FolderGit2,
  SlidersHorizontal,
  Cpu,
  Search as SearchIcon,
  RefreshCw,
  ShieldCheck,
  Database,
  ChevronRight,
  Brain,
  BarChart3,
} from "lucide-react";
import { api, desktop } from "./lib/api";
import type {
  IndexProgress,
  Overview,
  Page,
  Project,
  SearchHit,
  Session,
} from "./lib/types";
import { errorMessage } from "./lib/utils";
import { Button } from "./components/ui/button";
import { Timeline } from "./features/Timeline";
import { Search } from "./features/Search";
import { Settings } from "./features/Settings";
import { MemoryLibrary } from "./features/memories/MemoryLibrary";
import { Analytics } from "./features/Analytics";
import {
  SkillsPage,
  McpPage,
  MarketplacePage,
} from "./features/AgentResources";

const pages = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "sessions", label: "Sessions", icon: MessagesSquare },
  { id: "projects", label: "Projects", icon: FolderGit2 },
  { id: "memories", label: "Memories", icon: Brain },
  { id: "analytics", label: "Activity", icon: BarChart3 },
  { id: "skills", label: "Skills", icon: Brain },
  { id: "mcp", label: "MCP", icon: Cpu },
  { id: "marketplace", label: "Marketplace", icon: Layers3 },
  { id: "agents", label: "Agents", icon: Cpu },
  { id: "settings", label: "Settings", icon: SlidersHorizontal },
] as const;
const headings: Record<Page, [string, string]> = {
  analytics: ["Local activity", "Understand the work recorded by your agents."],
  skills: ["Skills", "Review the workflows your agents can discover locally."],
  mcp: [
    "MCP servers",
    "Inspect local tool configuration without starting anything.",
  ],
  marketplace: [
    "Marketplace",
    "A deliberate, local-first home for reviewed skill packages.",
  ],
  memories: [
    "Memories",
    "Keep the decisions and context worth carrying forward.",
  ],
  overview: [
    "Your agents. One workspace.",
    "A little less searching. A lot more context.",
  ],
  sessions: [
    "Sessions",
    "Every conversation, connected to the work behind it.",
  ],
  projects: ["Projects", "Follow your work across agents and conversations."],
  agents: [
    "Connected agents",
    "Discover the local history your coding agents leave behind.",
  ],
  settings: ["Settings", "Make yourself at home. Keep your data close."],
};
export function App() {
  const [page, setPage] = useState<Page>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Session | null>(null);
  const [ordinal, setOrdinal] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<IndexProgress | null>(null);
  const [agentFilter, setAgentFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [memoryDirty, setMemoryDirty] = useState(false);
  const [memorySelection, setMemorySelection] = useState<{
    id: string;
    key: number;
  } | null>(null);
  const refresh = useCallback(() => setRevision((r) => r + 1), []);
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    setLoading(true);
    Promise.all([
      api.overview(),
      api.sessions(agentFilter, projectFilter, offset),
      api.projects(),
    ])
      .then(([o, s, p]) => {
        if (active) {
          setOverview(o);
          setSessions(s);
          setProjects(p);
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision, agentFilter, projectFilter, offset]);
  useEffect(() => {
    if (desktop)
      api
        .settings()
        .then((s) => {
          document.documentElement.dataset.theme = s.light_mode
            ? "light"
            : "dark";
        })
        .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    listen<IndexProgress>("index-progress", (event) =>
      setProgress(event.payload),
    )
      .then((fn) => {
        if (disposed) fn();
        else cleanup = fn;
      })
      .catch((e) => setError(errorMessage(e)));
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);
  const navigate = (next: Page) => {
    if (memoryDirty && !window.confirm("Discard unsaved memory changes?"))
      return;
    setMemoryDirty(false);
    setMemorySelection(null);
    setPage(next);
    setSelected(null);
    setOffset(0);
    setAgentFilter("");
    setProjectFilter("");
  };
  async function index(force = false) {
    setBusy(true);
    setError("");
    setProgress(null);
    try {
      setProgress(await api.index(force));
      refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function select(s: Session) {
    setSelected(s);
    setOrdinal(0);
    setPage("sessions");
  }
  async function selectHit(hit: SearchHit) {
    if (memoryDirty && !window.confirm("Discard unsaved memory changes?"))
      return;
    setMemoryDirty(false);
    if (hit.entity_type === "memory" && hit.entity_id) {
      setSelected(null);
      setPage("memories");
      setMemorySelection((old) => ({
        id: hit.entity_id!,
        key: (old?.key ?? 0) + 1,
      }));
      return;
    }
    try {
      const found = await api.session(hit.session_id);
      if (found) {
        setSelected(found);
        setOrdinal(hit.ordinal);
        setPage("sessions");
      } else setError("Session no longer exists. Refresh the index.");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  const detected = overview?.agents.filter((a) => a.detected) ?? [];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
        >
          <span>
            <Layers3 size={22} />
          </span>
          AgentHub<span className="version">α</span>
        </a>
        <div className="workspace-label">
          <span className="workspace-avatar">L</span>
          <span>
            Local workspace<small>Personal · On this device</small>
          </span>
          <ShieldCheck size={14} />
        </div>
        <button className="search-trigger" onClick={() => setSearchOpen(true)}>
          <SearchIcon size={15} />
          <span>Search anything</span>
          <kbd>⌘ K</kbd>
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {pages.map((p) => (
            <button
              key={p.id}
              className={page === p.id ? "active" : ""}
              onClick={() => navigate(p.id)}
            >
              <p.icon size={18} />
              {p.label}
              {p.id === "sessions" && !!overview?.sessions && (
                <span className="nav-count">{overview.sessions}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="nav-label">ON THIS DEVICE</div>
          {overview ? (
            overview.agents
              .filter((a) => a.supported)
              .map((a) => (
                <button
                  className="agent-status"
                  key={a.id}
                  onClick={() => navigate("agents")}
                >
                  <span
                    className={`status-dot ${a.detected ? "online" : ""}`}
                  />
                  {a.name}
                  <small>{a.detected ? "Detected" : "Not found"}</small>
                </button>
              ))
          ) : (
            <p className="sidebar-hint">
              {desktop ? "Detecting agents…" : "Open desktop to detect agents"}
            </p>
          )}
          <div className="local-note">
            <ShieldCheck size={15} />
            <span>Local first. Always yours.</span>
          </div>
          <span className="build-label">AgentHub / v0.1.0</span>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            Workspace <ChevronRight size={13} />{" "}
            <strong>{pages.find((p) => p.id === page)?.label}</strong>
          </span>
          <span className="private-pill">
            <span className="status-dot online" /> Private workspace
          </span>
        </header>
        <div className="content">
          {!desktop && (
            <div className="notice browser-notice">
              <Database size={18} />
              <span>
                <strong>Desktop companion</strong> · This browser preview has no
                access to local transcripts. Run <code>npm run desktop</code> to
                connect your agents.
              </span>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setError("");
                  refresh();
                }}
              >
                Retry
              </Button>
            </div>
          )}
          {selected ? (
            <Timeline
              key={`${selected.id}:${ordinal}`}
              session={selected}
              initialOrdinal={ordinal}
              onBack={() => setSelected(null)}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">YOUR LOCAL CONTROL CENTER</span>
                  <h1>{headings[page][0]}</h1>
                  <p>{headings[page][1]}</p>
                </div>
                {page !== "settings" && page !== "memories" && (
                  <Button
                    onClick={() => void index()}
                    disabled={!desktop || busy}
                  >
                    <RefreshCw size={15} className={busy ? "spin" : ""} />
                    {busy ? "Indexing…" : "Index sessions"}
                  </Button>
                )}
              </div>
              {progress && (
                <div className="index-progress" role="status">
                  <span>
                    {progress.done ? "Index complete" : "Reading local files…"}
                  </span>
                  <span>
                    {progress.indexed} updated · {progress.skipped} unchanged ·{" "}
                    {progress.failed} failed · {progress.warnings} skipped
                    records
                  </span>
                  {progress.issues.length > 0 && (
                    <details>
                      <summary>View import issues</summary>
                      {progress.issues.map((issue, i) => (
                        <p key={i}>{issue}</p>
                      ))}
                    </details>
                  )}
                </div>
              )}
              {page === "overview" && (
                <OverviewPage
                  overview={overview}
                  detected={detected}
                  sessions={sessions}
                  loading={loading}
                  select={select}
                  navigate={navigate}
                />
              )}{" "}
              {page === "sessions" && (
                <SessionsPage
                  agentFilter={agentFilter}
                  setAgentFilter={setAgentFilter}
                  projectFilter={projectFilter}
                  setProjectFilter={setProjectFilter}
                  offset={offset}
                  setOffset={setOffset}
                  projects={projects}
                  loading={loading}
                  sessions={sessions}
                  select={select}
                  navigate={navigate}
                />
              )}{" "}
              {page === "projects" && (
                <ProjectsPage
                  projects={projects}
                  setProjectFilter={setProjectFilter}
                  setOffset={setOffset}
                  setPage={setPage}
                  navigate={navigate}
                />
              )}{" "}
              {page === "agents" && (
                <AgentsPage
                  overview={overview}
                  navigate={navigate}
                  busy={busy}
                  index={index}
                />
              )}{" "}
              {page === "settings" && (
                <Settings
                  onSaved={refresh}
                  databasePath={overview?.database_path ?? ""}
                  busy={busy}
                />
              )}
              {page === "memories" && (
                <MemoryLibrary
                  key={memorySelection?.key ?? "library"}
                  initialId={memorySelection?.id}
                  projects={projects}
                  onDirty={setMemoryDirty}
                />
              )}
              {page === "analytics" && <Analytics revision={revision} />}
              {page === "skills" && <SkillsPage />}
              {page === "mcp" && <McpPage />}
              {page === "marketplace" && <MarketplacePage />}
            </>
          )}
        </div>
      </main>
      <Search
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelect={(hit) => void selectHit(hit)}
      />
    </div>
  );
}
