import { useEffect, useRef, useState } from "react";
import { api, desktop } from "@/lib/api";
import type { McpServer, Skill, SearchHit } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ActionDialog } from "@/components/ActionDialog";
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

function modifiedLabel(value: string): string {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(seconds * 1000));
}

function destinationForAgent(path: string, agent: "claude" | "codex") {
  const normalized = path.replaceAll("\\", "/");
  for (const marker of ["/.claude/skills/", "/.agents/skills/"]) {
    const index = normalized.indexOf(marker);
    if (index >= 0) {
      const root = normalized.slice(0, index);
      const target = agent === "claude" ? "/.claude/skills" : "/.agents/skills";
      const value = `${root}${target}`;
      return path.includes("\\") ? value.replaceAll("/", "\\") : value;
    }
  }
  return "";
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
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [agent, setAgent] = useState("");
  const [deletedSkill, setDeletedSkill] = useState<{
    name: string;
    trash: string;
  } | null>(null);
  const [skillAction, setSkillAction] = useState<{
    kind: "copy" | "duplicate" | "remove";
    skill: Skill;
    files: string[];
    targetAgent: "claude" | "codex";
    destination: string;
    newName: string;
  } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
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
      await saveText(archive, `${name}.contextmeld-skill.json`);
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
            files and explicitly apply changes. ContextMeld never runs skills.
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
                archive.format !== "contextmeld.skill" ||
                !archive.name ||
                !Array.isArray(archive.files)
              )
                throw Error("This is not an ContextMeld skill archive.");
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
              "Absolute path to an ContextMeld skill backup:",
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
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      {deletedSkill && (
        <div className="notice resource-rollback">
          <span>{deletedSkill.name} is in ContextMeld trash.</span>
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
                    {modifiedLabel(s.modified_at)
                      ? ` · updated ${modifiedLabel(s.modified_at)}`
                      : ""}
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
                  onClick={async () => {
                    try {
                      const archive = JSON.parse(
                        await api.exportSkill(s.path),
                      ) as {
                        files: { path: string }[];
                      };
                      const targetAgent =
                        s.agent === "claude" ? "codex" : "claude";
                      setSkillAction({
                        kind: "copy",
                        skill: s,
                        files: archive.files.map((file) => file.path),
                        targetAgent,
                        destination: destinationForAgent(s.path, targetAgent),
                        newName: `${s.name}-copy`,
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
                  Copy to agent
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSkillAction({
                      kind: "duplicate",
                      skill: s,
                      files: ["SKILL.md", ...s.files],
                      targetAgent: s.agent === "claude" ? "claude" : "codex",
                      destination: "",
                      newName: `${s.name}-copy`,
                    })
                  }
                >
                  Duplicate
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSkillAction({
                      kind: "remove",
                      skill: s,
                      files: ["SKILL.md", ...s.files],
                      targetAgent: s.agent === "claude" ? "claude" : "codex",
                      destination: "",
                      newName: "",
                    })
                  }
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
      {skillAction && (
        <ActionDialog
          title={
            skillAction.kind === "copy"
              ? `Copy ${skillAction.skill.name}`
              : skillAction.kind === "duplicate"
                ? `Duplicate ${skillAction.skill.name}`
                : `Remove ${skillAction.skill.name}`
          }
          description={
            skillAction.kind === "copy"
              ? "Review the complete package and target before creating files for another agent. No content is transformed or executed."
              : skillAction.kind === "duplicate"
                ? "Create a complete sibling copy. Existing folders are never overwritten."
                : "The complete folder will move to ContextMeld trash and can be restored."
          }
          confirmLabel={
            skillAction.kind === "copy"
              ? "Copy skill"
              : skillAction.kind === "duplicate"
                ? "Create duplicate"
                : "Move to trash"
          }
          danger={skillAction.kind === "remove"}
          busy={actionBusy}
          onClose={() => setSkillAction(null)}
          onConfirm={async () => {
            setActionBusy(true);
            setError("");
            try {
              if (skillAction.kind === "copy") {
                if (!skillAction.destination.trim())
                  throw Error(
                    "Choose an absolute local destination directory.",
                  );
                await api.copySkill(
                  skillAction.skill.path,
                  skillAction.destination.trim(),
                );
                setNotice(
                  `${skillAction.skill.name} copied for ${skillAction.targetAgent === "claude" ? "Claude Code" : "OpenAI Codex"}.`,
                );
              } else if (skillAction.kind === "duplicate") {
                await api.duplicateSkill(
                  skillAction.skill.path,
                  skillAction.newName.trim(),
                );
                setNotice(
                  `${skillAction.skill.name} duplicated as ${skillAction.newName.trim()}.`,
                );
              } else {
                const trash = await api.deleteSkill(skillAction.skill.path);
                setDeletedSkill({ name: skillAction.skill.name, trash });
              }
              setSkillAction(null);
              await reloadSkills();
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Could not apply this skill change.",
              );
            } finally {
              setActionBusy(false);
            }
          }}
        >
          {skillAction.kind === "copy" && (
            <>
              <div className="action-dialog-summary">
                <span>
                  <strong>{skillAction.files.length}</strong>Files
                </span>
                <span>
                  <strong>{skillAction.skill.agent}</strong>Source agent
                </span>
                <span>
                  <strong>No scripts</strong>will be run
                </span>
              </div>
              <label>
                Target agent
                <select
                  value={skillAction.targetAgent}
                  onChange={(event) => {
                    const targetAgent = event.target.value as
                      "claude" | "codex";
                    setSkillAction({
                      ...skillAction,
                      targetAgent,
                      destination: destinationForAgent(
                        skillAction.skill.path,
                        targetAgent,
                      ),
                    });
                  }}
                >
                  <option value="codex">OpenAI Codex</option>
                  <option value="claude">Claude Code</option>
                </select>
              </label>
              <label>
                Destination skills directory
                <input
                  aria-label="Skill copy destination"
                  value={skillAction.destination}
                  onChange={(event) =>
                    setSkillAction({
                      ...skillAction,
                      destination: event.target.value,
                    })
                  }
                />
              </label>
            </>
          )}
          {skillAction.kind === "duplicate" && (
            <label>
              New skill name
              <input
                aria-label="Duplicate skill name"
                value={skillAction.newName}
                onChange={(event) =>
                  setSkillAction({
                    ...skillAction,
                    newName: event.target.value,
                  })
                }
              />
            </label>
          )}
          <div className="action-dialog-files">
            <strong>Exact file set</strong>
            {skillAction.files.map((file) => (
              <code key={file}>{file}</code>
            ))}
          </div>
          <p className="notice">
            {skillAction.kind === "remove"
              ? "This is reversible from the Skills page until the trash entry is replaced."
              : "ContextMeld validates every path and refuses conflicts before writing."}
          </p>
        </ActionDialog>
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
    format: "json" | "toml";
    secretsRevealed: boolean;
    editing: boolean;
    server?: string;
    backup?: string;
  } | null>(null);
  const [lastChange, setLastChange] = useState<{
    path: string;
    backup: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [mcpAction, setMcpAction] = useState<{
    kind: "add" | "duplicate" | "copy" | "toggle" | "remove";
    server?: McpServer;
    path: string;
    name: string;
    newName: string;
    config: string;
    destination: string;
  } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
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
            format: file.format,
            secretsRevealed: file.secrets_revealed,
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
    if (backup.includes(".contextmeld-backup-"))
      setLastChange({ path, backup });
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
            formats. ContextMeld never starts a server or connects to it.
            Sensitive values stay masked until you explicitly open the editor.
          </p>
        </div>
        <span className="badge">{items.length} discovered</span>
        <Button
          variant="outline"
          onClick={() =>
            setMcpAction({
              kind: "add",
              path: items[0]?.config_path ?? "",
              name: "",
              newName: "",
              config: '{\n  "command": "npx",\n  "args": []\n}',
              destination: "",
            })
          }
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
                    format: file.format,
                    secretsRevealed: file.secrets_revealed,
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
                        format: f.format,
                        secretsRevealed: f.secrets_revealed,
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
                onClick={() =>
                  setMcpAction({
                    kind: "duplicate",
                    server: s,
                    path: s.config_path,
                    name: s.name,
                    newName: `${s.name}-copy`,
                    config: "",
                    destination: "",
                  })
                }
              >
                Duplicate
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setMcpAction({
                    kind: "copy",
                    server: s,
                    path: s.config_path,
                    name: s.name,
                    newName: "",
                    config: "",
                    destination: "",
                  })
                }
              >
                Copy to agent
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setMcpAction({
                    kind: "toggle",
                    server: s,
                    path: s.config_path,
                    name: s.name,
                    newName: "",
                    config: "",
                    destination: "",
                  })
                }
              >
                {s.enabled ? "Disable" : "Enable"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setMcpAction({
                    kind: "remove",
                    server: s,
                    path: s.config_path,
                    name: s.name,
                    newName: "",
                    config: "",
                    destination: "",
                  })
                }
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
                onClick={async () => {
                  if (open.editing) {
                    const file = await api.mcpConfig(open.path);
                    setOpen({
                      ...open,
                      text: file.text,
                      original: file.text,
                      hash: file.hash,
                      format: file.format,
                      secretsRevealed: false,
                      editing: false,
                    });
                    return;
                  }
                  try {
                    const file = await api.mcpConfig(open.path, true);
                    setOpen({
                      ...open,
                      text: file.text,
                      original: file.text,
                      hash: file.hash,
                      format: file.format,
                      secretsRevealed: true,
                      editing: true,
                    });
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not open this configuration for editing.",
                    );
                  }
                }}
              >
                {open.editing
                  ? "Cancel edit"
                  : `Reveal & edit ${open.format.toUpperCase()}`}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setOpen(null)}>
                Close
              </Button>
            </div>
          </header>
          {open.editing ? (
            <>
              <p className="notice">
                Sensitive values are visible while this editor is open. Nothing
                is sent outside this device.
              </p>
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
                        format: f.format,
                        secretsRevealed: f.secrets_revealed,
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
      {mcpAction && (
        <ActionDialog
          title={
            mcpAction.kind === "add"
              ? "Add MCP server"
              : mcpAction.kind === "duplicate"
                ? `Duplicate ${mcpAction.name}`
                : mcpAction.kind === "copy"
                  ? `Copy ${mcpAction.name}`
                  : mcpAction.kind === "toggle"
                    ? `${mcpAction.server?.enabled ? "Disable" : "Enable"} ${mcpAction.name}`
                    : `Remove ${mcpAction.name}`
          }
          description="Review the exact target and change. ContextMeld creates a backup, writes atomically, parses the result again and rolls back automatically if validation fails."
          confirmLabel={
            mcpAction.kind === "add"
              ? "Add server"
              : mcpAction.kind === "duplicate"
                ? "Create duplicate"
                : mcpAction.kind === "copy"
                  ? "Copy server"
                  : mcpAction.kind === "toggle"
                    ? mcpAction.server?.enabled
                      ? "Disable server"
                      : "Enable server"
                    : "Remove server"
          }
          danger={mcpAction.kind === "remove"}
          busy={actionBusy}
          onClose={() => setMcpAction(null)}
          onConfirm={async () => {
            setActionBusy(true);
            setError("");
            try {
              let backup: string;
              if (mcpAction.kind === "copy") {
                if (!mcpAction.destination.trim())
                  throw Error(
                    "Choose an absolute JSON or TOML destination path.",
                  );
                backup = await api.copyMcpServer(
                  mcpAction.path,
                  mcpAction.name,
                  mcpAction.destination.trim(),
                );
                rememberBackup(mcpAction.destination.trim(), backup);
                setNotice(
                  `${mcpAction.name} copied. Reopen the target agent to load it.`,
                );
              } else {
                if (!mcpAction.path.trim())
                  throw Error(
                    "Choose an absolute JSON or TOML configuration path.",
                  );
                const file = await api.mcpConfig(mcpAction.path);
                if (mcpAction.kind === "add") {
                  backup = await api.addMcpServer(
                    mcpAction.path,
                    mcpAction.name.trim(),
                    mcpAction.config,
                    file.hash,
                  );
                  setNotice(`${mcpAction.name.trim()} added and verified.`);
                } else if (mcpAction.kind === "duplicate") {
                  backup = await api.duplicateMcpServer(
                    mcpAction.path,
                    mcpAction.name,
                    mcpAction.newName.trim(),
                    file.hash,
                  );
                  setNotice(
                    `${mcpAction.name} duplicated as ${mcpAction.newName.trim()}.`,
                  );
                } else if (mcpAction.kind === "toggle") {
                  backup = await api.setMcpEnabled(
                    mcpAction.path,
                    mcpAction.name,
                    !mcpAction.server!.enabled,
                    file.hash,
                  );
                  setNotice(
                    `${mcpAction.name} ${mcpAction.server!.enabled ? "disabled" : "enabled"}.`,
                  );
                } else {
                  backup = await api.removeMcpServer(
                    mcpAction.path,
                    mcpAction.name,
                    file.hash,
                  );
                  setNotice(
                    `${mcpAction.name} removed. The change can be rolled back.`,
                  );
                }
                rememberBackup(mcpAction.path, backup);
              }
              setMcpAction(null);
              await reloadMcp();
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Could not apply this MCP change.",
              );
            } finally {
              setActionBusy(false);
            }
          }}
        >
          {mcpAction.kind === "add" && (
            <>
              <label>
                Existing MCP configuration
                <input
                  aria-label="MCP configuration path"
                  placeholder="Absolute .json or .toml path"
                  value={mcpAction.path}
                  onChange={(event) =>
                    setMcpAction({ ...mcpAction, path: event.target.value })
                  }
                />
              </label>
              <label>
                Server name
                <input
                  aria-label="MCP server name"
                  value={mcpAction.name}
                  onChange={(event) =>
                    setMcpAction({ ...mcpAction, name: event.target.value })
                  }
                />
              </label>
              <label>
                Server configuration as JSON
                <textarea
                  aria-label="MCP server configuration"
                  rows={6}
                  value={mcpAction.config}
                  onChange={(event) =>
                    setMcpAction({ ...mcpAction, config: event.target.value })
                  }
                />
              </label>
            </>
          )}
          {mcpAction.kind === "duplicate" && (
            <label>
              New server name
              <input
                aria-label="Duplicate MCP server name"
                value={mcpAction.newName}
                onChange={(event) =>
                  setMcpAction({ ...mcpAction, newName: event.target.value })
                }
              />
            </label>
          )}
          {mcpAction.kind === "copy" && (
            <label>
              Destination MCP configuration
              <input
                aria-label="MCP copy destination"
                placeholder="Absolute .json or .toml path"
                value={mcpAction.destination}
                onChange={(event) =>
                  setMcpAction({
                    ...mcpAction,
                    destination: event.target.value,
                  })
                }
              />
            </label>
          )}
          <div className="action-dialog-summary">
            <span>
              <strong>{mcpAction.server?.agent ?? "New"}</strong>Agent
            </span>
            <span>
              <strong>
                {mcpAction.path.endsWith(".toml") ? "TOML" : "JSON"}
              </strong>
              Format
            </span>
            <span>
              <strong>Automatic</strong>Rollback
            </span>
          </div>
          <div className="action-dialog-files">
            <strong>Change preview</strong>
            <code>
              {mcpAction.kind === "add"
                ? `+ ${mcpAction.name || "server-name"}`
                : mcpAction.kind === "duplicate"
                  ? `+ ${mcpAction.newName}`
                  : mcpAction.kind === "copy"
                    ? `+ ${mcpAction.name} → ${mcpAction.destination || "destination"}`
                    : mcpAction.kind === "toggle"
                      ? `${mcpAction.server?.enabled ? "enabled: true → false" : "enabled: false → true"}`
                      : `- ${mcpAction.name}`}
            </code>
          </div>
          <p className="notice">
            Sensitive environment values remain masked in normal previews.
          </p>
        </ActionDialog>
      )}
    </section>
  );
}
