import {
  ArrowUpRight,
  Layers3,
  MessagesSquare,
  FolderGit2,
  Cpu,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import type {
  Agent,
  Overview,
  Session,
  Project,
  Page,
  Skill,
  McpServer,
  Analytics,
} from "@/lib/types";
import { api, desktop } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/Empty";
import { SessionList } from "@/components/SessionList";
import { date } from "@/lib/utils";
export function OverviewPage({
  overview,
  detected,
  sessions,
  projects,
  loading,
  select,
  navigate,
}: {
  overview: Overview | null;
  detected: Agent[];
  sessions: Session[];
  projects: Project[];
  loading: boolean;
  select: (s: Session) => void;
  navigate: (p: Page) => void;
}) {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  useEffect(() => {
    if (desktop)
      api
        .analytics()
        .then(setAnalytics)
        .catch(() => undefined);
  }, []);
  const toolCalls = analytics?.tools.reduce(
    (total, metric) => total + metric.count,
    0,
  );
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
          {
            label: "Messages",
            value: analytics?.event_count,
            icon: MessagesSquare,
          },
          {
            label: "Tool calls",
            value: toolCalls,
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
      <section className="panel">
        <div className="section-heading">
          <h2>
            Recent projects <span className="subtle-badge">LOCAL WORK</span>
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("projects")}
          >
            View all <ArrowUpRight size={14} />
          </Button>
        </div>
        {projects?.length ? (
          <div className="project-list-compact">
            {projects.slice(0, 4).map((project) => (
              <button
                className="project-compact-row"
                key={project.path}
                onClick={() => navigate("projects")}
              >
                <FolderGit2 size={16} />
                <span>{project.name}</span>
                <small>{project.sessions} sessions</small>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">Projects appear after the first local index.</p>
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
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  modelFilter,
  setModelFilter,
  sessionSort,
  setSessionSort,
  offset,
  setOffset,
  projects,
  loading,
  sessions,
  select,
  navigate,
  stagedMemoryCount = 0,
  clearStagedMemories,
}: {
  agentFilter: string;
  setAgentFilter: (v: string) => void;
  projectFilter: string;
  setProjectFilter: (v: string) => void;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  modelFilter: string;
  setModelFilter: (v: string) => void;
  sessionSort: string;
  setSessionSort: (v: string) => void;
  offset: number;
  setOffset: (v: number) => void;
  projects: Project[];
  loading: boolean;
  sessions: Session[];
  select: (s: Session) => void;
  navigate: (p: Page) => void;
  stagedMemoryCount?: number;
  clearStagedMemories?: () => void;
}) {
  return (
    <section className="panel">
      {stagedMemoryCount > 0 && (
        <div className="notice resource-rollback" role="status">
          <span>
            {stagedMemoryCount}{" "}
            {stagedMemoryCount === 1 ? "memory is" : "memories are"} ready.
            Choose a session, then select Continue with another agent.
          </span>
          <Button variant="ghost" size="sm" onClick={clearStagedMemories}>
            Clear
          </Button>
        </div>
      )}
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
        <input
          aria-label="Filter by model"
          placeholder="Model contains…"
          value={modelFilter}
          onChange={(e) => {
            setModelFilter(e.target.value);
            setOffset(0);
          }}
        />
        <label className="compact-filter">
          From{" "}
          <input
            aria-label="Sessions from date"
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label className="compact-filter">
          To{" "}
          <input
            aria-label="Sessions to date"
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => {
              setDateTo(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <select
          aria-label="Sort sessions"
          value={sessionSort}
          onChange={(e) => {
            setSessionSort(e.target.value);
            setOffset(0);
          }}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
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
        <article
          key={p.path}
          className="panel project-card project-detail-card"
        >
          <header>
            <FolderGit2 size={23} />
            <div>
              <h2>{p.name}</h2>
              <code>{p.path}</code>
            </div>
            {p.git && (
              <span className="badge accent">
                Git · {p.branch || "detached"}
              </span>
            )}
          </header>
          <div className="project-facts">
            <span>
              <strong>{p.sessions}</strong> Sessions
            </span>
            <span>
              <strong>{p.agents?.split(",").length || 0}</strong> Agents
            </span>
            <span>
              <strong>{p.memories ?? 0}</strong> Memories
            </span>
            <span>
              <strong>{p.skills ?? 0}</strong> Skills
            </span>
            <span className={p.errors ? "has-errors" : ""}>
              <strong>{p.errors ?? 0}</strong> Errors
            </span>
          </div>
          <div className="project-activity">
            <strong>Recent activity</strong>
            <small>{date(p.updated_at)}</small>
            {(p.recent_activity ?? []).map((activity) => (
              <span key={activity}>{activity}</span>
            ))}
          </div>
          {(p.modified_files ?? []).length > 0 && (
            <details>
              <summary>{p.modified_files.length} referenced files</summary>
              {p.modified_files.map((file) => (
                <code key={file}>{file}</code>
              ))}
            </details>
          )}
          <footer>
            <span>{p.agents}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setProjectFilter(p.path);
                setOffset(0);
                setPage("sessions");
              }}
            >
              Open sessions <ArrowUpRight size={14} />
            </Button>
          </footer>
        </article>
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
  const [skills, setSkills] = useState<Skill[]>([]);
  const [mcp, setMcp] = useState<McpServer[]>([]);
  const [loadError, setLoadError] = useState("");
  const [skillContent, setSkillContent] = useState<{
    name: string;
    text: string;
  } | null>(null);
  useEffect(() => {
    if (!desktop) return;
    Promise.all([api.skills(), api.mcpServers()])
      .then(([s, m]) => {
        setSkills(s);
        setMcp(m);
      })
      .catch(() =>
        setLoadError("Could not read local skills or MCP configuration."),
      );
  }, []);
  return (
    <>
      <section className="panel agent-panel">
        <h2>Supported adapters</h2>
        <p className="muted">
          Installation, configuration and session history are checked
          independently. A leftover folder never counts as an installed app,
          and no agent is started or contacted.
        </p>
        {(
          overview?.agents ?? [
            {
              id: "claude",
              name: "Claude Code",
              detected: false,
              supported: true,
              path: "",
              config_path: "",
              installation_detected: false,
              config_detected: false,
              sessions_detected: false,
              adapter_status: "Supported",
            },
            {
              id: "codex",
              name: "OpenAI Codex",
              detected: false,
              supported: true,
              path: "",
              config_path: "",
              installation_detected: false,
              config_detected: false,
              sessions_detected: false,
              adapter_status: "Supported",
            },
          ]
        ).map((a) => (
          <div key={a.id} className="agent-card">
            <span className={`agent-mark ${a.id}`}>
              {a.id === "claude" ? "✳" : "⌘"}
            </span>
            <div>
              <h3>{a.name}</h3>
              <p className="muted">
                {a.installation_detected
                  ? "Executable found"
                  : "Executable not found"}{" "}
                · {a.config_detected ? "config found" : "config not found"} ·{" "}
                {a.supported
                  ? a.sessions_detected
                    ? "session files found"
                    : "no session folder found"
                  : "session adapter planned"}
              </p>
              <code>
                {a.sessions_detected
                  ? a.path
                  : a.config_detected
                    ? a.config_path
                    : "No local installation or data found"}
              </code>
            </div>
            <span
              className={`badge ${a.installation_detected ? "accent" : ""}`}
            >
              {desktop
                ? overview?.demo_mode
                  ? a.installation_detected
                    ? "Synthetic install"
                    : a.config_detected
                      ? "Synthetic config"
                      : "Synthetic absence"
                  : a.installation_detected
                    ? "Installed"
                    : a.sessions_detected
                      ? "History found"
                      : a.config_detected
                        ? "Config found"
                        : "Not found"
                : "Desktop required"}
            </span>
            <span className="badge">{a.adapter_status}</span>
            {a.supported && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("settings")}
              >
                Configure
              </Button>
            )}
          </div>
        ))}
      </section>
      <section className="panel roadmap-note">
        <h3>
          {overview?.demo_mode
            ? "Synthetic detection states"
            : `${overview?.agents.filter((agent) => agent.installation_detected).length ?? 0} installed agents found`}
        </h3>
        <p>
          Claude Code and OpenAI Codex have verified session adapters. Cursor,
          Gemini CLI, OpenCode and GitHub Copilot expose installation status
          only until their session formats are implemented and tested.
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
      <section className="panel compatibility-panel">
        <h2>Adapter compatibility</h2>
        <p className="muted">
          Status reflects what AgentHub can parse and verify locally in this
          release.
        </p>
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Sessions</th>
              <th>Skills</th>
              <th>MCP</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Claude Code</th>
              <td>
                <span className="badge accent">Supported</span>
              </td>
              <td>
                <span className="badge accent">Supported</span>
              </td>
              <td><span className="badge accent">Full · JSON</span></td>
            </tr>
            <tr>
              <th>OpenAI Codex</th>
              <td>
                <span className="badge accent">Supported</span>
              </td>
              <td>
                <span className="badge accent">Supported</span>
              </td>
              <td><span className="badge accent">Full · TOML</span></td>
            </tr>
            {[
              ["Cursor", "Planned"],
              ["Gemini CLI", "Planned"],
              ["OpenCode", "Planned"],
              ["GitHub Copilot", "Planned"],
            ].map(([name, status]) => (
              <tr key={name}>
                <th>{name}</th>
                <td>
                  <span className="badge">{status}</span>
                </td>
                <td>
                  <span className="badge">{status}</span>
                </td>
                <td>
                  <span className="badge">{status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel agent-panel">
        <h2>Local skills</h2>
        <p className="muted">
          Read-only discovery from each user or project skills directory.
          AgentHub never edits these files automatically.
        </p>
        {loadError && (
          <p className="error" role="alert">
            {loadError}
          </p>
        )}
        {skills.length ? (
          skills.map((s) => (
            <div className="agent-card" key={`${s.agent}:${s.scope}:${s.path}`}>
              <span className="agent-mark">✦</span>
              <div>
                <h3>{s.name}</h3>
                <p className="muted">
                  {s.description || "No description in SKILL.md"}
                </p>
                <small>
                  {s.agent} · {s.scope}
                  {s.files.length ? ` · ${s.files.length} files` : ""}
                </small>
              </div>
              <span className="badge">
                {s.readable ? "Readable" : "Unavailable"}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!s.readable}
                onClick={() =>
                  api
                    .skillContent(s.path)
                    .then((file) =>
                      setSkillContent({ name: s.name, text: file.text }),
                    )
                    .catch(() => setLoadError("Could not read this SKILL.md."))
                }
              >
                Review
              </Button>
            </div>
          ))
        ) : (
          <p className="muted">No supported skills found yet.</p>
        )}
        {skillContent && (
          <div className="skill-preview">
            <div>
              <h3>{skillContent.name}</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSkillContent(null)}
              >
                Close
              </Button>
            </div>
            <pre>{skillContent.text}</pre>
          </div>
        )}
      </section>
      <section className="panel agent-panel">
        <h2>MCP servers</h2>
        <p className="muted">
          Configuration discovery only. Commands are displayed for review and
          never started by AgentHub.
        </p>
        {mcp.length ? (
          mcp.map((s) => (
            <div
              className="agent-card"
              key={`${s.agent}:${s.scope}:${s.name}:${s.config_path}`}
            >
              <span className="agent-mark">⌁</span>
              <div>
                <h3>{s.name}</h3>
                <code>{s.command || s.url || "Transport not recorded"}</code>
                <small>
                  {s.agent} · {s.scope} · {s.transport}
                  {s.args.length ? ` · ${s.args.length} args` : ""}
                  {s.env_keys.length ? ` · ${s.env_keys.length} env keys` : ""}
                </small>
              </div>
              <span className="badge">Review only</span>
            </div>
          ))
        ) : (
          <p className="muted">No Claude or Codex MCP configuration found.</p>
        )}
      </section>
    </>
  );
}
