import { useEffect, useRef, useState } from "react";
import { api, desktop } from "@/lib/api";
import type { McpServer, Skill, SearchHit } from "@/lib/types";
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

export function SkillsPage({ selection }: { selection?: SearchHit | null }) {
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
  const [deletedSkill, setDeletedSkill] = useState<{
    name: string;
    trash: string;
  } | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!desktop || selection?.entity_type !== "skill" || !selection.entity_id)
      return;
    let active = true;
    const path = selection.entity_id;
    api
      .skillContent(path)
      .then((file) => {
        if (active)
          setOpen({
            name: selection.title,
            path,
            text: file.text,
            original: file.text,
            hash: file.hash,
            editing: false,
          });
      })
      .catch(() => {
        if (active)
          setError(
            "This skill could not be opened. It may have moved or become unreadable.",
          );
      });
    return () => {
      active = false;
    };
  }, [selection]);
  useEffect(() => {
    if (desktop)
      api
        .skills()
        .then(setItems)
        .catch(() => setError("Could not read local skills."));
  }, []);
  async function exportSkill(path: string, name: string) {
    try {
      const archive = await api.exportSkill(path);
      await saveText(archive, `${name}.agenthub-skill.json`);
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
            Local SKILL.md folders discovered for Claude Code and Codex. Review
            files and explicitly apply changes. AgentHub never runs skills.
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
        <Button variant="outline" onClick={() => importInput.current?.click()}>
          Import archive
        </Button>
        <input
          ref={importInput}
          className="sr-only"
          type="file"
          accept=".json"
          aria-label="Import skill archive"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            try {
              if (file.size > 6 * 1024 * 1024)
                throw Error("Choose a skill archive smaller than 6 MiB.");
              const json = await file.text();
              const archive = JSON.parse(json) as {
                format?: string;
                name?: string;
                files?: { path: string }[];
              };
              if (
                archive.format !== "agenthub.skill" ||
                !archive.name ||
                !Array.isArray(archive.files)
              )
                throw Error("This is not an AgentHub skill archive.");
              const destination = window.prompt(
                "Absolute destination skills directory:",
              );
              if (!destination) return;
              const preview = archive.files.map((item) => item.path).join("\n");
              if (
                !window.confirm(
                  `Import ${archive.name} into ${destination}?\n\nFiles to create:\n${preview}\n\nExisting destinations are never overwritten.`,
                )
              )
                return;
              await api.importSkillArchive(json, destination);
              await reloadSkills();
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Could not import this skill archive.",
              );
            }
          }}
        />
        <Button
          variant="ghost"
          onClick={async () => {
            const backup = window.prompt(
              "Absolute path to an AgentHub skill backup:",
            );
            const target =
              backup &&
              window.prompt("Absolute path to the destination SKILL.md:");
            if (
              !backup ||
              !target ||
              !window.confirm("Restore this skill backup?")
            )
              return;
            try {
              await api.restoreSkill(target, backup);
              await reloadSkills();
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Could not restore this skill.",
              );
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
      {deletedSkill && (
        <div className="notice resource-rollback">
          <span>{deletedSkill.name} is in AgentHub trash.</span>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await api.restoreDeletedSkill(deletedSkill.trash);
                setDeletedSkill(null);
                await reloadSkills();
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Could not restore this skill.",
                );
              }
            }}
          >
            Restore removed skill
          </Button>
        </div>
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
                    const files = [
                      "SKILL.md",
                      ...s.files.filter((file) => !file.endsWith("SKILL.md")),
                    ];
                    if (
                      !window.confirm(
                        `Copy ${s.name} to ${destination}?\n\nFiles to create:\n${files.join("\n")}\n\nCompatibility: verify manually for the target agent. No transformations will be applied.`,
                      )
                    )
                      return;
                    api
                      .copySkill(s.path, destination)
                      .then(() => reloadSkills())
                      .catch((e) =>
                        setError(
                          e instanceof Error
                            ? e.message
                            : "Could not copy this skill.",
                        ),
                      );
                  }}
                >
                  Copy to agent
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (!window.confirm(`Move ${s.name} to AgentHub trash?`))
                      return;
                    api
                      .deleteSkill(s.path)
                      .then((trash) => {
                        setDeletedSkill({ name: s.name, trash });
                        return reloadSkills();
                      })
                      .catch((e) =>
                        setError(
                          e instanceof Error
                            ? e.message
                            : "Could not remove this skill.",
                        ),
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

export function McpPage({ selection }: { selection?: SearchHit | null }) {
  const [items, setItems] = useState<McpServer[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<{
    path: string;
    text: string;
    original: string;
    hash: string;
    editing: boolean;
    server?: string;
    backup?: string;
  } | null>(null);
  const [lastChange, setLastChange] = useState<{
    path: string;
    backup: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!desktop || selection?.entity_type !== "mcp" || !selection.entity_id)
      return;
    let active = true;
    const path = selection.entity_id;
    api
      .mcpConfig(path)
      .then((file) => {
        if (active)
          setOpen({
            path,
            text: file.text,
            original: file.text,
            hash: file.hash,
            editing: false,
            server: selection.title,
          });
      })
      .catch(() => {
        if (active)
          setError(
            "This MCP configuration could not be opened. It may have moved or become unreadable.",
          );
      });
    return () => {
      active = false;
    };
  }, [selection]);
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
  function rememberBackup(path: string, backup: string) {
    if (backup.includes(".agenthub-backup-")) setLastChange({ path, backup });
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
            Review Claude and Codex configuration and explicitly edit supported
            formats. AgentHub never starts a server, connects to it or reveals
            secret values.
          </p>
        </div>
        <span className="badge">{items.length} discovered</span>
        <Button
          variant="outline"
          onClick={async () => {
            const path = window.prompt(
              "Absolute JSON MCP config path to update:",
            );
            const name = path && window.prompt("New server name:");
            const config =
              name &&
              window.prompt(
                'Server JSON, for example {"command":"npx","args":[]}',
              );
            if (
              !path ||
              !name ||
              !config ||
              !window.confirm(`Add ${name} to this MCP config?`)
            )
              return;
            try {
              const file = await api.mcpConfig(path);
              const backup = await api.addMcpServer(
                path,
                name,
                config,
                file.hash,
              );
              rememberBackup(path, backup);
              setNotice(`${name} added. A restorable backup was created.`);
              await reloadMcp();
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Could not add this server.",
              );
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
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      {lastChange && (
        <div className="notice resource-rollback">
          <span>The last MCP change can be rolled back.</span>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (
                !window.confirm(
                  "Restore the MCP configuration from its last backup?",
                )
              )
                return;
              try {
                const rollback = await api.restoreMcpConfig(
                  lastChange.path,
                  lastChange.backup,
                );
                setLastChange({ path: lastChange.path, backup: rollback });
                setNotice(
                  "MCP configuration restored. The pre-restore state is also backed up.",
                );
                if (open?.path === lastChange.path) {
                  const file = await api.mcpConfig(lastChange.path);
                  setOpen({
                    ...open,
                    text: file.text,
                    original: file.text,
                    hash: file.hash,
                    editing: false,
                    backup: rollback,
                  });
                }
                await reloadMcp();
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Could not restore this MCP configuration.",
                );
              }
            }}
          >
            Rollback last change
          </Button>
        </div>
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
                  <div
                    className="secret-list"
                    aria-label="Masked environment variables"
                  >
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
                  if (
                    !newName ||
                    !window.confirm(`Duplicate ${s.name} as ${newName}?`)
                  )
                    return;
                  try {
                    const file = await api.mcpConfig(s.config_path);
                    const backup = await api.duplicateMcpServer(
                      s.config_path,
                      s.name,
                      newName,
                      file.hash,
                    );
                    rememberBackup(s.config_path, backup);
                    setNotice(`${s.name} duplicated as ${newName}.`);
                    await reloadMcp();
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not duplicate this server.",
                    );
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
                  if (
                    !destination ||
                    !window.confirm(`Copy ${s.name} to ${destination}?`)
                  )
                    return;
                  try {
                    const backup = await api.copyMcpServer(
                      s.config_path,
                      s.name,
                      destination,
                    );
                    rememberBackup(destination, backup);
                    setNotice(
                      "MCP server copied. Reopen the target agent to load its config.",
                    );
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not copy this server.",
                    );
                  }
                }}
              >
                Copy to agent
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (
                    !window.confirm(
                      `${s.enabled ? "Disable" : "Enable"} ${s.name}?`,
                    )
                  )
                    return;
                  try {
                    const file = await api.mcpConfig(s.config_path);
                    const backup = await api.setMcpEnabled(
                      s.config_path,
                      s.name,
                      !s.enabled,
                      file.hash,
                    );
                    rememberBackup(s.config_path, backup);
                    setNotice(
                      `${s.name} ${s.enabled ? "disabled" : "enabled"}.`,
                    );
                    await reloadMcp();
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not change this server.",
                    );
                  }
                }}
              >
                {s.enabled ? "Disable" : "Enable"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (!window.confirm(`Remove ${s.name} from this MCP config?`))
                    return;
                  try {
                    const file = await api.mcpConfig(s.config_path);
                    const backup = await api.removeMcpServer(
                      s.config_path,
                      s.name,
                      file.hash,
                    );
                    rememberBackup(s.config_path, backup);
                    setNotice(
                      `${s.name} removed. You can roll back this change.`,
                    );
                    await reloadMcp();
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not remove this server.",
                    );
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
            <h3>
              {open.server
                ? `${open.server} configuration`
                : "Configuration preview"}
            </h3>
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
                    .then((backup) =>
                      api.mcpConfig(open.path).then((f) => ({ backup, f })),
                    )
                    .then(({ backup, f }) => {
                      rememberBackup(open.path, backup);
                      setNotice("MCP configuration saved and verified.");
                      setOpen({
                        ...open,
                        text: f.text,
                        original: f.text,
                        hash: f.hash,
                        editing: false,
                        backup,
                      });
                    })
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
