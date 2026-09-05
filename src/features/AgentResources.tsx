import { useEffect, useState } from "react";
import { api, desktop } from "@/lib/api";
import type { McpServer, Skill } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/Empty";
import { saveText } from "@/lib/files";

export function SkillsPage() {
  const [items, setItems] = useState<Skill[]>([]);
  const [open, setOpen] = useState<{
    name: string;
    path: string;
    text: string;
    hash: string;
    editing: boolean;
    backup?: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [agent, setAgent] = useState("");
  useEffect(() => {
    if (desktop)
      api
        .skills()
        .then(setItems)
        .catch(() => setError("Could not read local skills."));
  }, []);
  async function exportSkill(path: string, name: string) {
    try {
      const file = await api.skillContent(path);
      await saveText(file.text, `${name}-SKILL.md`);
    } catch {
      setError("Could not export this skill.");
    }
  }
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
      <div className="resource-filters">
        <input
          aria-label="Search skills"
          placeholder="Search skills…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Filter skills by agent"
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
        >
          <option value="">All agents</option>
          <option value="claude">Claude Code</option>
          <option value="codex">OpenAI Codex</option>
        </select>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {items.length ? (
        <div className="resource-list">
          {items
            .filter(
              (s) =>
                `${s.name} ${s.description} ${s.path}`
                  .toLocaleLowerCase()
                  .includes(query.toLocaleLowerCase()) &&
                (!agent || s.agent === agent),
            )
            .map((s) => (
              <article
                className="resource-row"
                key={`${s.agent}:${s.scope}:${s.path}`}
              >
                <div>
                  <h3>{s.name}</h3>
                  <p>{s.description || "No description in frontmatter."}</p>
                  <small>
                    {s.agent} · {s.scope} · {s.path}
                    {s.modified_at ? ` · updated ${s.modified_at}` : ""}
                    {s.files.length
                      ? ` · ${s.files.length} associated files`
                      : ""}
                  </small>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!s.readable}
                  onClick={() =>
                    api
                      .skillContent(s.path)
                      .then((file) =>
                        setOpen({
                          name: s.name,
                          path: s.path,
                          text: file.text,
                          hash: file.hash,
                          editing: false,
                        }),
                      )
                      .catch(() => setError("Could not read this skill."))
                  }
                >
                  Review
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void exportSkill(s.path, s.name)}
                >
                  Export
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
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen({ ...open, editing: !open.editing })}
              >
                {open.editing ? "Cancel edit" : "Edit"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setOpen(null)}>
                Close
              </Button>
            </div>
          </header>
          {open.editing ? (
            <>
              <textarea
                className="skill-editor"
                aria-label="Skill content"
                value={open.text}
                onChange={(e) => setOpen({ ...open, text: e.target.value })}
              />
              <details open>
                <summary>Preview changes</summary>
                <pre>{open.text}</pre>
              </details>
              <Button
                onClick={() => {
                  if (
                    !window.confirm("Create a backup and save this SKILL.md?")
                  )
                    return;
                  api
                    .saveSkill(open.path, open.text, open.hash)
                    .then((backup) =>
                      api
                        .skillContent(open.path)
                        .then((file) => ({ backup, file })),
                    )
                    .then(({ backup, file }) =>
                      setOpen({
                        ...open,
                        text: file.text,
                        hash: file.hash,
                        editing: false,
                        backup,
                      }),
                    )
                    .catch((e) =>
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Could not save this skill.",
                      ),
                    );
                }}
              >
                Save skill
              </Button>
              {open.backup && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (!window.confirm("Restore the last backup?")) return;
                    api
                      .restoreSkill(open.path, open.backup!)
                      .then(() => api.skillContent(open.path))
                      .then((file) =>
                        setOpen({
                          ...open,
                          text: file.text,
                          hash: file.hash,
                          backup: undefined,
                        }),
                      )
                      .catch((e) =>
                        setError(
                          e instanceof Error
                            ? e.message
                            : "Could not restore backup.",
                        ),
                      );
                  }}
                >
                  Rollback last backup
                </Button>
              )}
            </>
          ) : (
            <pre>{open.text}</pre>
          )}
        </div>
      )}
    </section>
  );
}

export function McpPage() {
  const [items, setItems] = useState<McpServer[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<{
    path: string;
    text: string;
    hash: string;
    editing: boolean;
  } | null>(null);
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
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  api
                    .mcpConfig(s.config_path)
                    .then((f) =>
                      setOpen({
                        path: s.config_path,
                        text: f.text,
                        hash: f.hash,
                        editing: false,
                      }),
                    )
                    .catch((e) =>
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Could not read config.",
                      ),
                    )
                }
              >
                Review
              </Button>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="No MCP servers discovered"
          body="Add a Claude .mcp.json or Codex config.toml, then reopen this page."
        />
      )}
      {open && (
        <div className="resource-preview">
          <header>
            <h3>Configuration preview</h3>
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen({ ...open, editing: !open.editing })}
              >
                {open.editing ? "Cancel edit" : "Edit JSON"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setOpen(null)}>
                Close
              </Button>
            </div>
          </header>
          {open.editing ? (
            <>
              <textarea
                className="skill-editor"
                aria-label="MCP configuration"
                value={open.text}
                onChange={(e) => setOpen({ ...open, text: e.target.value })}
              />
              <details open>
                <summary>Preview changes</summary>
                <pre>{open.text}</pre>
              </details>
              <Button
                onClick={() => {
                  if (
                    !window.confirm(
                      "Create a backup and save this MCP configuration?",
                    )
                  )
                    return;
                  api
                    .saveMcpConfig(open.path, open.text, open.hash)
                    .then(() => api.mcpConfig(open.path))
                    .then((f) =>
                      setOpen({
                        ...open,
                        text: f.text,
                        hash: f.hash,
                        editing: false,
                      }),
                    )
                    .catch((e) =>
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Could not save this configuration.",
                      ),
                    );
                }}
              >
                Save MCP config
              </Button>
            </>
          ) : (
            <pre>{open.text}</pre>
          )}
        </div>
      )}
    </section>
  );
}

export function MarketplacePage() {
  const [source, setSource] = useState("");
  const [items, setItems] = useState<{ name: string; url: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [readme, setReadme] = useState<{ name: string; text: string } | null>(
    null,
  );
  async function browse() {
    const match = source
      .trim()
      .match(/^https?:\/\/github\.com\/([^/]+)\/([^/#]+)\/?$/);
    if (!match) {
      setError(
        "Enter a public GitHub repository URL, for example https://github.com/org/skills.",
      );
      return;
    }
    setLoading(true);
    setError("");
    try {
      const r = await fetch(
        `https://api.github.com/repos/${match[1]}/${match[2]}/contents`,
        { headers: { Accept: "application/vnd.github+json" } },
      );
      if (!r.ok) throw Error(`GitHub returned ${r.status}.`);
      const data = (await r.json()) as {
        type: string;
        name: string;
        html_url: string;
      }[];
      setItems(
        data
          .filter((x) => x.type === "dir")
          .map((x) => ({ name: x.name, url: x.html_url })),
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not read this public repository.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="panel marketplace-panel">
      <span className="badge accent">PUBLIC REPOSITORY CATALOG</span>
      <h2>Skills marketplace</h2>
      <p>
        Browse a public GitHub repository only when you request it. AgentHub
        does not use credentials, track popularity or install code
        automatically.
      </p>
      <div className="marketplace-source">
        <label htmlFor="marketplace-source">GitHub repository URL</label>
        <div>
          <input
            id="marketplace-source"
            placeholder="https://github.com/org/skills"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
          <Button disabled={loading} onClick={() => void browse()}>
            {loading ? "Browsing…" : "Browse"}
          </Button>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {items.length > 0 && (
        <div className="resource-list">
          {items.map((i) => (
            <article className="resource-row" key={i.name}>
              <div>
                <h3>{i.name}</h3>
                <small>{i.url}</small>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const raw = i.url.replace(
                      "github.com",
                      "api.github.com/repos",
                    );
                    const r = await fetch(raw + "/contents");
                    const entries = (await r.json()) as {
                      name: string;
                      download_url: string | null;
                    }[];
                    const skill = entries.find(
                      (e) => e.name.toLowerCase() === "skill.md",
                    );
                    if (!skill?.download_url)
                      throw Error("This folder has no SKILL.md at its root.");
                    const t = await fetch(skill.download_url);
                    setReadme({ name: i.name, text: await t.text() });
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not inspect this skill.",
                    );
                  }
                }}
              >
                Inspect
              </Button>
            </article>
          ))}
        </div>
      )}
      {readme && (
        <div className="resource-preview">
          <header>
            <h3>{readme.name}</h3>
            <Button variant="ghost" size="sm" onClick={() => setReadme(null)}>
              Close
            </Button>
          </header>
          <p className="notice">
            Remote content is untrusted. Review instructions and scripts before
            any manual installation.
          </p>
          <pre>{readme.text}</pre>
        </div>
      )}
      <div className="marketplace-rules">
        <div>
          <strong>Review first</strong>
          <span>
            Inspect SKILL.md and bundled scripts before using a package.
          </span>
        </div>
        <div>
          <strong>No hidden sync</strong>
          <span>
            Installing a package requires an explicit destination and visible
            change preview.
          </span>
        </div>
        <div>
          <strong>Data stays deliberate</strong>
          <span>
            Only public repository content is fetched after you click Browse or
            Inspect.
          </span>
        </div>
      </div>
    </section>
  );
}
