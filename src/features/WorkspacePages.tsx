import {
  ArrowUpRight,
  Layers3,
  MessagesSquare,
  FolderGit2,
  Cpu,
  ShieldCheck,
} from "lucide-react";
import type { Agent, Overview, Session, Project, Page } from "@/lib/types";
import { desktop } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/Empty";
import { SessionList } from "@/components/SessionList";
export function OverviewPage({
  overview,
  detected,
  sessions,
  loading,
  select,
  navigate,
}: {
  overview: Overview | null;
  detected: Agent[];
  sessions: Session[];
  loading: boolean;
  select: (s: Session) => void;
  navigate: (p: Page) => void;
}) {
  return (
    <>
      <section className="hero-panel">
        <div>
          <span className="badge accent">BUILT FOR YOUR FLOW</span>
          <h2>
            The context is already there.
            <br />
            <span>Bring it all together.</span>
          </h2>
          <p>
            Explore conversations, trace a decision, and pick up
            <br className="wide-only" /> where you left off. Across agents.
            Entirely local.
          </p>
          <Button variant="outline" onClick={() => navigate("agents")}>
            Manage your agents <ArrowUpRight size={15} />
          </Button>
        </div>
        <div className="hub-art" aria-hidden="true">
          <div className="orbit" />
          <div className="hub-core">
            <Layers3 size={38} />
          </div>
          <span className="orbit-agent claude">✳</span>
          <span className="orbit-agent codex">⌘</span>
          <span className="orbit-tag">YOUR WORKSPACE</span>
        </div>
      </section>
      <div className="stat-grid">
        {[
          {
            label: "Indexed sessions",
            value: overview?.sessions,
            icon: MessagesSquare,
          },
          {
            label: "Discovered projects",
            value: overview?.projects,
            icon: FolderGit2,
          },
          {
            label: "Detected agents",
            value: overview ? detected.length : undefined,
            icon: Cpu,
          },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <span>
              {s.label}
              <s.icon size={17} />
            </span>
            <strong>{s.value ?? "—"}</strong>
            <small>
              {s.value === undefined
                ? "Connect the desktop app"
                : "From your local data"}
            </small>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>
            Recent sessions <span className="subtle-badge">LOCAL HISTORY</span>
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("sessions")}
          >
            View all <ArrowUpRight size={14} />
          </Button>
        </div>
        {loading ? (
          <p className="loading">Loading sessions…</p>
        ) : sessions.length ? (
          <SessionList sessions={sessions.slice(0, 6)} onSelect={select} />
        ) : (
          <Empty
            title="Your next idea starts with context"
            body="Index your Claude Code and Codex sessions to see your recent work here."
            action="Configure agent paths"
            onAction={() => navigate("settings")}
          />
        )}
      </section>
      <p className="bottom-caption">
        <ShieldCheck size={13} /> No cloud. No account. Just your workspace.
      </p>
    </>
  );
}
export function SessionsPage({
  agentFilter,
  setAgentFilter,
  projectFilter,
  setProjectFilter,
  offset,
  setOffset,
  projects,
  loading,
  sessions,
  select,
  navigate,
}: {
  agentFilter: string;
  setAgentFilter: (v: string) => void;
  projectFilter: string;
  setProjectFilter: (v: string) => void;
  offset: number;
  setOffset: (v: number) => void;
  projects: Project[];
  loading: boolean;
  sessions: Session[];
  select: (s: Session) => void;
  navigate: (p: Page) => void;
}) {
  return (
    <section className="panel">
      <div className="filters">
        <select
          aria-label="Filter by agent"
          value={agentFilter}
          onChange={(e) => {
            setAgentFilter(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">All agents</option>
          <option value="claude">Claude Code</option>
          <option value="codex">OpenAI Codex</option>
        </select>
        <select
          aria-label="Filter by project"
          value={projectFilter}
          onChange={(e) => {
            setProjectFilter(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.path} value={p.path}>
              {p.name}
            </option>
          ))}
        </select>
        <span>Most recent first</span>
      </div>
      {loading ? (
        <p className="loading">Loading sessions…</p>
      ) : sessions.length ? (
        <SessionList sessions={sessions} onSelect={select} />
      ) : (
        <Empty
          title="No sessions found"
          body="Try different filters, or check your agent paths and index your sessions."
          action="Configure paths"
          onAction={() => navigate("settings")}
        />
      )}
      <div className="pagination">
        <Button
          variant="ghost"
          disabled={offset === 0 || loading}
          onClick={() => setOffset(Math.max(0, offset - 100))}
        >
          Previous
        </Button>
        <span>Page {offset / 100 + 1}</span>
        <Button
          variant="ghost"
          disabled={sessions.length < 100 || loading}
          onClick={() => setOffset(offset + 100)}
        >
          Next
        </Button>
      </div>
    </section>
  );
}
export function ProjectsPage({
  projects,
  setProjectFilter,
  setOffset,
  setPage,
  navigate,
}: {
  projects: Project[];
  setProjectFilter: (v: string) => void;
  setOffset: (v: number) => void;
  setPage: (p: Page) => void;
  navigate: (p: Page) => void;
}) {
  return projects.length ? (
    <div className="project-grid">
      {projects.map((p) => (
        <button
          key={p.path}
          className="panel project-card"
          onClick={() => {
            setProjectFilter(p.path);
            setOffset(0);
            setPage("sessions");
          }}
        >
          <FolderGit2 size={23} />
          <h2>{p.name}</h2>
          <p>{p.path}</p>
          <footer>
            <span>
              {p.sessions} sessions · {p.agents}
            </span>
            {p.git && <span className="badge">Git</span>}
            <ArrowUpRight size={16} />
          </footer>
        </button>
      ))}
    </div>
  ) : (
    <div className="panel">
      <Empty
        title="Projects will find their way here"
        body="AgentHub discovers project paths from indexed sessions."
        action="Browse agents"
        onAction={() => navigate("agents")}
      />
    </div>
  );
}
export function AgentsPage({
  overview,
  navigate,
  busy,
  index,
}: {
  overview: Overview | null;
  navigate: (p: Page) => void;
  busy: boolean;
  index: (force?: boolean) => Promise<void>;
}) {
  return (
    <>
      <section className="panel agent-panel">
        <h2>Supported adapters</h2>
        <p className="muted">
          Detection means a local session directory exists. No agent is started
          or contacted.
        </p>
        {(
          overview?.agents.filter((a) => a.supported) ?? [
            { id: "claude", name: "Claude Code", detected: false, path: "" },
            { id: "codex", name: "OpenAI Codex", detected: false, path: "" },
          ]
        ).map((a) => (
          <div key={a.id} className="agent-card">
            <span className={`agent-mark ${a.id}`}>
              {a.id === "claude" ? "✳" : "⌘"}
            </span>
            <div>
              <h3>{a.name}</h3>
              <code>{a.path || "Path available in desktop app"}</code>
            </div>
            <span className={`badge ${a.detected ? "accent" : ""}`}>
              {desktop
                ? a.detected
                  ? "Detected"
                  : "Not found"
                : "Desktop required"}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("settings")}
            >
              Configure
            </Button>
          </div>
        ))}
      </section>
      <section className="panel roadmap-note">
        <h3>Room for more agents</h3>
        <p>
          Cursor, Gemini CLI, OpenCode and GitHub Copilot are planned adapters.
          They are not indexed in this release.
        </p>
        <Button
          variant="outline"
          disabled={!desktop || busy}
          onClick={() => void index(true)}
        >
          Rebuild index from source files
        </Button>
        <p className="muted">
          Re-reads supported files, including previously unchanged sessions.
        </p>
      </section>
    </>
  );
}
