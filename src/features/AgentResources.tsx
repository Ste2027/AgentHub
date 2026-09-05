import { useEffect, useState } from "react";
import { api, desktop } from "@/lib/api";
import type { McpServer, Skill } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/Empty";

export function SkillsPage() {
  const [items, setItems] = useState<Skill[]>([]);
  const [open, setOpen] = useState<{ name: string; text: string } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (desktop)
      api
        .skills()
        .then(setItems)
        .catch(() => setError("Could not read local skills."));
  }, []);
  if (!desktop)
    return (
      <div className="panel">
        <Empty
          title="Skills are available in the desktop app"
          body="The browser preview cannot inspect local skill directories."
        />
      </div>
    );
  return (
    <section className="panel resource-panel">
      <div className="resource-heading">
        <div>
          <h2>Skills</h2>
          <p className="muted">
            Local SKILL.md folders discovered for Claude Code and Codex.
            AgentHub reads them and never runs or edits them.
          </p>
        </div>
        <span className="badge">{items.length} discovered</span>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {items.length ? (
        <div className="resource-list">
          {items.map((s) => (
            <article
              className="resource-row"
              key={`${s.agent}:${s.scope}:${s.path}`}
            >
              <div>
                <h3>{s.name}</h3>
                <p>{s.description || "No description in frontmatter."}</p>
                <small>
                  {s.agent} · {s.scope} · {s.path}
                </small>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!s.readable}
                onClick={() =>
                  api
                    .skillContent(s.path)
                    .then((text) => setOpen({ name: s.name, text }))
                    .catch(() => setError("Could not read this skill."))
                }
              >
                Review
              </Button>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="No skills discovered"
          body="Create a SKILL.md under ~/.claude/skills or ~/.agents/skills, then reopen this page."
        />
      )}
      {open && (
        <div className="resource-preview">
          <header>
            <h3>{open.name}</h3>
            <Button variant="ghost" size="sm" onClick={() => setOpen(null)}>
              Close
            </Button>
          </header>
          <pre>{open.text}</pre>
        </div>
      )}
    </section>
  );
}

export function McpPage() {
  const [items, setItems] = useState<McpServer[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (desktop)
      api
        .mcpServers()
        .then(setItems)
        .catch(() => setError("Could not read local MCP configuration."));
  }, []);
  if (!desktop)
    return (
      <div className="panel">
        <Empty
          title="MCP is available in the desktop app"
          body="The browser preview cannot inspect local configuration files."
        />
      </div>
    );
  return (
    <section className="panel resource-panel">
      <div className="resource-heading">
        <div>
          <h2>MCP servers</h2>
          <p className="muted">
            Review-only view of Claude and Codex configuration. AgentHub never
            starts a server, connects to it or reveals secret values.
          </p>
        </div>
        <span className="badge">{items.length} discovered</span>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {items.length ? (
        <div className="resource-list">
          {items.map((s) => (
            <article
              className="resource-row"
              key={`${s.agent}:${s.scope}:${s.name}:${s.config_path}`}
            >
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
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="No MCP servers discovered"
          body="Add a Claude .mcp.json or Codex config.toml, then reopen this page."
        />
      )}
    </section>
  );
}

export function MarketplacePage() {
  return (
    <section className="panel marketplace-panel">
      <span className="badge accent">LOCAL MARKETPLACE</span>
      <h2>Skills marketplace</h2>
      <p>
        AgentHub does not contact a marketplace or download code automatically.
        This page is reserved for reviewed skill packages you import
        deliberately from disk or a trusted repository.
      </p>
      <div className="marketplace-rules">
        <div>
          <strong>Review first</strong>
          <span>
            Inspect SKILL.md and every bundled script before using a package.
          </span>
        </div>
        <div>
          <strong>Portable folders</strong>
          <span>
            Packages use the same .agents/skills and .claude/skills layouts as
            the agents themselves.
          </span>
        </div>
        <div>
          <strong>No hidden sync</strong>
          <span>
            Installing a package will require an explicit destination and a
            visible change preview.
          </span>
        </div>
      </div>
      <p className="muted">
        Catalog and installation flow are being built next. No empty cards or
        pretend listings are shown.
      </p>
    </section>
  );
}
