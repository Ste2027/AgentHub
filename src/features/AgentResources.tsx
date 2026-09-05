import { useEffect, useState } from "react";
import { api, desktop } from "@/lib/api";
import type { McpServer, Skill } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/Empty";
import { saveText } from "@/lib/files";

function diffText(before: string, after: string): string {
  if (before === after) return "No changes.";
  const oldLines = before.split(/\r?\n/);
  const newLines = after.split(/\r?\n/);
  const length = Math.max(oldLines.length, newLines.length);
  return Array.from({ length }, (_, i) => {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    if (oldLine === newLine) return `  ${oldLine ?? ""}`;
    return `${oldLine === undefined ? "+" : "-"} ${oldLine ?? ""}\n${newLine === undefined ? "" : `+ ${newLine}`}`;
  }).join("\n");
}

export function SkillsPage() {
  const [items, setItems] = useState<Skill[]>([]);
  const [open, setOpen] = useState<{
    name: string;
    path: string;
    text: string;
    original: string;
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
  async function reloadSkills() {
    try {
      setItems(await api.skills());
    } catch {
      setError("Could not refresh local skills.");
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
        <Button
          variant="outline"
          onClick={async () => {
            const source = window.prompt("Absolute path to an existing SKILL.md:");
            const destination = source && window.prompt("Absolute destination skills directory:");
            if (!source || !destination) return;
            try {
              const file = await api.skillContent(source);
              const name = source.split(/[\\/]/).slice(-2, -1)[0] || "imported-skill";
              if (!window.confirm(`Import ${name} into ${destination}? Only SKILL.md will be copied.`)) return;
              await api.installSkill(name, file.text, destination);
              await reloadSkills();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not import this skill.");
            }
          }}
        >
          Import skill
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            const backup = window.prompt("Absolute path to an AgentHub skill backup:");
            const target = backup && window.prompt("Absolute path to the destination SKILL.md:");
            if (!backup || !target || !window.confirm("Restore this skill backup?")) return;
            try {
              await api.restoreSkill(target, backup);
              await reloadSkills();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not restore this skill.");
            }
          }}
        >
          Restore backup
        </Button>
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
                          original: file.text,
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
                  onClick={() => {
                    const destination = window.prompt(
                      "Absolute destination skills directory (for example ~/.agents/skills):",
                    );
                    if (!destination) return;
                    if (!window.confirm(`Copy ${s.name} to ${destination}?`)) return;
                    api
                      .copySkill(s.path, destination)
                      .then(() => reloadSkills())
                      .catch((e) =>
                        setError(e instanceof Error ? e.message : "Could not copy this skill."),
                      );
                  }}
                >
                  Copy to agent
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (!window.confirm(`Move ${s.name} to AgentHub trash?`)) return;
                    api
                      .deleteSkill(s.path)
                      .then(() => reloadSkills())
                      .catch((e) =>
                        setError(e instanceof Error ? e.message : "Could not remove this skill."),
                      );
                  }}
                >
                  Remove
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
                <pre>{diffText(open.original, open.text)}</pre>
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
                        original: file.text,
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
    original: string;
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
  async function reloadMcp() {
    try {
      setItems(await api.mcpServers());
    } catch {
      setError("Could not refresh local MCP configuration.");
    }
  }
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
        <Button
          variant="outline"
          onClick={async () => {
            const path = window.prompt("Absolute JSON MCP config path to update:");
            const name = path && window.prompt("New server name:");
            const config = name && window.prompt('Server JSON, for example {"command":"npx","args":[]}');
            if (!path || !name || !config || !window.confirm(`Add ${name} to this MCP config?`)) return;
            try {
              const file = await api.mcpConfig(path);
              await api.addMcpServer(path, name, config, file.hash);
              await reloadMcp();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not add this server.");
            }
          }}
        >
          Add server
        </Button>
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
                </small>
                {s.env_keys.length > 0 && (
                  <div className="secret-list" aria-label="Masked environment variables">
                    {s.env_keys.map((key) => (
                      <code key={key}>{key} = ••••••••</code>
                    ))}
                  </div>
                )}
                <div className="compatibility-chips">
                  {["claude", "codex", "cursor", "gemini", "opencode"].map(
                    (a) => (
                      <span className="badge" key={a}>
                        {a}: {a === s.agent ? "Supported" : "Unknown"}
                      </span>
                    ),
                  )}
                </div>
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
                        original: f.text,
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
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  const newName = window.prompt(`Duplicate ${s.name} as:`);
                  if (!newName || !window.confirm(`Duplicate ${s.name} as ${newName}?`)) return;
                  try {
                    const file = await api.mcpConfig(s.config_path);
                    await api.duplicateMcpServer(s.config_path, s.name, newName, file.hash);
                    await reloadMcp();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Could not duplicate this server.");
                  }
                }}
              >
                Duplicate
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  const destination = window.prompt(
                    "Absolute destination JSON config path for this server:",
                  );
                  if (!destination || !window.confirm(`Copy ${s.name} to ${destination}?`)) return;
                  try {
                    await api.copyMcpServer(s.config_path, s.name, destination);
                    setError("MCP server copied. Reopen the target agent to load its config.");
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Could not copy this server.");
                  }
                }}
              >
                Copy to agent
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (!window.confirm(`${s.enabled ? "Disable" : "Enable"} ${s.name}?`)) return;
                  try {
                    const file = await api.mcpConfig(s.config_path);
                    await api.setMcpEnabled(s.config_path, s.name, !s.enabled, file.hash);
                    await reloadMcp();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Could not change this server.");
                  }
                }}
              >
                {s.enabled ? "Disable" : "Enable"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (!window.confirm(`Remove ${s.name} from this MCP config?`)) return;
                  try {
                    const file = await api.mcpConfig(s.config_path);
                    await api.removeMcpServer(s.config_path, s.name, file.hash);
                    await reloadMcp();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Could not remove this server.");
                  }
                }}
              >
                Remove
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
                <pre>{diffText(open.original, open.text)}</pre>
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
                        original: f.text,
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
  const [sources, setSources] = useState<string[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem("agenthub.marketplace.sources") || "[]",
      ) as string[];
    } catch {
      return [];
    }
  });
  const [view, setView] = useState<
    "browse" | "installed" | "updates" | "sources"
  >("browse");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [installedSkills, setInstalledSkills] = useState<Skill[]>([]);
  const [items, setItems] = useState<{
    name: string;
    url: string;
    apiUrl: string;
  }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [readme, setReadme] = useState<{
    name: string;
    text: string;
    source: string;
    files: string[];
    description: string;
    version: string;
    warnings: string[];
  } | null>(null);
  useEffect(() => {
    if (view !== "installed" && view !== "updates") return;
    void api.skills().then(setInstalledSkills).catch(() => setInstalledSkills([]));
  }, [view]);
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
        url: string;
      }[];
      setItems(
        data
          .filter((x) => x.type === "dir")
          .map((x) => ({ name: x.name, url: x.html_url, apiUrl: x.url })),
      );
      if (!sources.includes(source.trim())) {
        const next = [...sources, source.trim()];
        setSources(next);
        localStorage.setItem(
          "agenthub.marketplace.sources",
          JSON.stringify(next),
        );
      }
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
      <div className="marketplace-tabs">
        <Button
          variant={view === "browse" ? "outline" : "ghost"}
          onClick={() => setView("browse")}
        >
          Browse
        </Button>
        <Button
          variant={view === "installed" ? "outline" : "ghost"}
          onClick={() => setView("installed")}
        >
          Installed
        </Button>
        <Button
          variant={view === "updates" ? "outline" : "ghost"}
          onClick={() => setView("updates")}
        >
          Updates
        </Button>
        <Button
          variant={view === "sources" ? "outline" : "ghost"}
          onClick={() => setView("sources")}
        >
          Sources
        </Button>
      </div>
      {view === "sources" ? (
        <div className="marketplace-sources">
          {sources.length ? (
            sources.map((s) => (
              <div className="resource-row" key={s}>
                <code>{s}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const next = sources.filter((x) => x !== s);
                    setSources(next);
                    localStorage.setItem(
                      "agenthub.marketplace.sources",
                      JSON.stringify(next),
                    );
                  }}
                >
                  Remove
                </Button>
              </div>
            ))
          ) : (
            <p className="muted">No saved sources yet.</p>
          )}
        </div>
      ) : (
        <>
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
          {view === "updates" && (
            installedSkills.length ? (
              <p className="muted">{installedSkills.length} installed skill{installedSkills.length === 1 ? "" : "s"} are ready for a source comparison. Version checks stay manual so no repository is contacted without your request.</p>
            ) : <p className="muted">No installed skills yet. Install a reviewed package to track it here.</p>
          )}
          {view === "browse" && (
            <input
              className="marketplace-filter"
              aria-label="Search marketplace catalog"
              placeholder="Search catalog…"
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
            />
          )}
          {view === "installed" && (
            installedSkills.length ? (
              <div className="resource-list">
                {installedSkills.map((skill) => (
                  <article className="resource-row" key={`${skill.agent}:${skill.path}`}>
                    <div><h3>{skill.name}</h3><small>{skill.agent} · {skill.scope} · {skill.path}</small></div>
                    <span className="badge">Installed locally</span>
                  </article>
                ))}
              </div>
            ) : <p className="muted">No installed skills yet. Install a reviewed package to see it here.</p>
          )}
          {view === "browse" && items.length > 0 && (
            <div className="resource-list">
              {items
                .filter((i) =>
                  i.name
                    .toLocaleLowerCase()
                    .includes(catalogQuery.toLocaleLowerCase()),
                )
                .map((i) => (
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
                          const r = await fetch(i.apiUrl);
                          const entries = (await r.json()) as {
                            name: string;
                            type: string;
                            download_url: string | null;
                          }[];
                          const skill = entries.find(
                            (e) => e.name.toLowerCase() === "skill.md",
                          );
                          if (!skill?.download_url)
                            throw Error(
                              "This folder has no SKILL.md at its root.",
                            );
                          const t = await fetch(skill.download_url);
                          const text = await t.text();
                          const frontmatter = text.match(/^---\s*([\s\S]*?)\s*---/);
                          const field = (key: string) =>
                            frontmatter?.[1]
                              ?.split(/\r?\n/)
                              .find((line) => line.trim().toLowerCase().startsWith(`${key}:`))
                              ?.split(":").slice(1).join(":").trim().replace(/^['"]|['"]$/g, "") || "Unknown";
                          const names = entries.map((entry) => entry.name);
                          const warnings: string[] = [];
                          if (names.some((name) => /\.(sh|bash|ps1|bat|cmd|exe|py|js|ts)$/i.test(name)))
                            warnings.push("This package contains executable or script files.");
                          if (/\b(mcpServers|\.mcp\.json|command\s*:)/i.test(text) || names.some((name) => /mcp/i.test(name)))
                            warnings.push("This package references MCP configuration or commands.");
                          if (/\b(curl|wget|invoke-webrequest|powershell|rm\s+-rf|format\s+c:)/i.test(text))
                            warnings.push("The documentation contains shell commands; review them before use.");
                          setReadme({
                            name: i.name,
                            text,
                            source: i.url,
                            files: names,
                            description: field("description"),
                            version: field("version"),
                            warnings,
                          });
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
        </>
      )}
      {readme && (
        <div className="resource-preview">
          <header>
            <h3>{readme.name}</h3>
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const destination = window.prompt(
                    "Absolute destination skills directory (for example ~/.agents/skills):",
                  );
                  if (!destination) return;
                  if (
                    !window.confirm(
                      `Install the reviewed ${readme.name} skill into ${destination}?`,
                    )
                  )
                    return;
                  api
                    .installSkill(readme.name, readme.text, destination)
                    .then(() => setError("Skill installed. Reopen Skills to discover it."))
                    .catch((e) =>
                      setError(e instanceof Error ? e.message : "Could not install this skill."),
                    );
                }}
              >
                Install to…
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setReadme(null)}>
                Close
              </Button>
            </div>
          </header>
          <p className="notice">
            Remote content is untrusted. Review instructions and scripts before
            any manual installation.
          </p>
          <div className="marketplace-metadata">
            <span><strong>Description</strong> {readme.description}</span>
            <span><strong>Version</strong> {readme.version}</span>
            <span><strong>Author/source</strong> {readme.source}</span>
            <span><strong>Compatibility</strong> Unknown until an adapter verifies it</span>
          </div>
          <p><strong>Files inspected ({readme.files.length})</strong></p>
          <ul className="marketplace-files">
            {readme.files.map((file) => <li key={file}><code>{file}</code></li>)}
          </ul>
          {readme.warnings.map((warning) => (
            <p className="warning" role="alert" key={warning}>{warning}</p>
          ))}
          <p className="muted">Install preview: exactly one file will be copied — <code>{readme.name}/SKILL.md</code>. Bundled files remain untouched.</p>
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
