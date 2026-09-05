import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, RefreshCw } from "lucide-react";
import { api, desktop } from "@/lib/api";
import type { Skill } from "@/lib/types";
import {
  browseMarketplaceSource,
  checkMarketplaceUpdate,
  inspectMarketplaceSkill,
  type CatalogItem,
  type InspectedSkill,
  type MarketplaceInstall,
} from "@/lib/marketplace";
import { Button } from "@/components/ui/button";

const SOURCE_KEY = "agenthub.marketplace.sources";
const INSTALL_KEY = "agenthub.marketplace.installs.v1";
function stored<T>(key: string): T[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]") as unknown;
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

export function MarketplacePage() {
  const [source, setSource] = useState("");
  const [sources, setSources] = useState<string[]>(() => stored(SOURCE_KEY));
  const [installs, setInstalls] = useState<MarketplaceInstall[]>(() =>
    stored(INSTALL_KEY),
  );
  const [view, setView] = useState<
    "browse" | "installed" | "updates" | "sources"
  >("browse");
  const [query, setQuery] = useState("");
  const [installedSkills, setInstalledSkills] = useState<Skill[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [selected, setSelected] = useState<InspectedSkill | null>(null);
  const [targetAgent, setTargetAgent] = useState("codex");
  const [destination, setDestination] = useState("");
  const [updates, setUpdates] = useState<
    Record<string, "checking" | "current" | "available" | "missing" | "error">
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!desktop || (view !== "installed" && view !== "updates")) return;
    void api
      .skills()
      .then(setInstalledSkills)
      .catch(() => setInstalledSkills([]));
  }, [view]);
  async function browse(value = source) {
    setLoading(true);
    setError("");
    setNotice("");
    setSelected(null);
    try {
      const catalog = await browseMarketplaceSource(value);
      setItems(catalog);
      const normalized = value.trim().replace(/\.git\/?$/, "");
      setSource(normalized);
      if (!sources.includes(normalized)) {
        const next = [...sources, normalized];
        setSources(next);
        localStorage.setItem(SOURCE_KEY, JSON.stringify(next));
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not read this public repository.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function inspect(item: CatalogItem) {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      setSelected(await inspectMarketplaceSkill(item));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not inspect this skill package.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function install() {
    if (!selected || !destination.trim()) {
      setError(
        "Choose an absolute local destination directory before installing.",
      );
      return;
    }
    const conflict = installedSkills.some(
      (skill) => skill.name === selected.name,
    );
    const warning = [
      `Install ${selected.name} for ${targetAgent}?`,
      `Destination: ${destination}`,
      `Files: ${selected.files.length}`,
      `Scripts: ${selected.scripts.length}`,
      `MCP files: ${selected.mcpFiles.length}`,
      conflict
        ? "Conflict: a skill with this name is already discovered."
        : "Conflict: none discovered by name.",
      "No package script will run.",
    ].join("\n");
    if (!window.confirm(warning)) return;
    setLoading(true);
    setError("");
    try {
      const installedPath = await api.importSkillArchive(
        selected.archive,
        destination.trim(),
      );
      const record: MarketplaceInstall = {
        name: selected.name,
        sourceRoot: selected.sourceRoot,
        source: selected.source,
        sha: selected.sha,
        version: selected.version,
        destination: installedPath,
        targetAgent,
        installedAt: new Date().toISOString(),
      };
      const next = [
        ...installs.filter((item) => item.destination !== installedPath),
        record,
      ];
      setInstalls(next);
      localStorage.setItem(INSTALL_KEY, JSON.stringify(next));
      setNotice(
        `${selected.name} installed atomically. No scripts were executed.`,
      );
      setInstalledSkills(await api.skills().catch(() => installedSkills));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not install this skill package.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function check(record: MarketplaceInstall) {
    setUpdates((value) => ({ ...value, [record.destination]: "checking" }));
    try {
      const status = await checkMarketplaceUpdate(record);
      setUpdates((value) => ({ ...value, [record.destination]: status }));
    } catch {
      setUpdates((value) => ({ ...value, [record.destination]: "error" }));
    }
  }
  const conflict =
    selected && installedSkills.some((skill) => skill.name === selected.name);
  return (
    <section className="panel marketplace-panel">
      <span className="badge accent">USER-REQUESTED GITHUB CATALOG</span>
      <h2>Skills marketplace</h2>
      <p>
        Browse public GitHub repositories only when you ask. AgentHub downloads
        text for review, never executes package scripts, and writes only after
        an explicit preview and confirmation.
      </p>
      <div
        className="marketplace-tabs"
        role="tablist"
        aria-label="Marketplace views"
      >
        {(["browse", "installed", "updates", "sources"] as const).map((tab) => (
          <Button
            key={tab}
            variant={view === tab ? "outline" : "ghost"}
            onClick={() => setView(tab)}
          >
            {tab[0].toUpperCase() + tab.slice(1)}
          </Button>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {view === "sources" && (
        <div className="marketplace-sources">
          {sources.length ? (
            sources.map((value) => (
              <div className="resource-row" key={value}>
                <code>{value}</code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void browse(value)}
                >
                  Browse
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const next = sources.filter((item) => item !== value);
                    setSources(next);
                    localStorage.setItem(SOURCE_KEY, JSON.stringify(next));
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
      )}
      {view === "browse" && (
        <>
          <div className="marketplace-source">
            <label htmlFor="marketplace-source">
              Public GitHub repository URL
            </label>
            <div>
              <input
                id="marketplace-source"
                placeholder="https://github.com/org/skills"
                value={source}
                onChange={(event) => setSource(event.target.value)}
              />
              <Button disabled={loading} onClick={() => void browse()}>
                {loading ? "Reading…" : "Browse"}
              </Button>
            </div>
          </div>
          <input
            className="marketplace-filter"
            aria-label="Search marketplace catalog"
            placeholder="Search this catalog…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {items.length > 0 && (
            <div className="resource-list">
              {items
                .filter((item) =>
                  item.name.toLowerCase().includes(query.toLowerCase()),
                )
                .map((item) => (
                  <article className="resource-row" key={item.apiUrl}>
                    <div>
                      <h3>{item.name}</h3>
                      <small>{item.url}</small>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loading}
                      onClick={() => void inspect(item)}
                    >
                      Inspect package
                    </Button>
                  </article>
                ))}
            </div>
          )}
        </>
      )}
      {view === "installed" &&
        (installedSkills.length ? (
          <div className="resource-list">
            {installedSkills.map((skill) => (
              <article
                className="resource-row"
                key={`${skill.agent}:${skill.path}`}
              >
                <div>
                  <h3>{skill.name}</h3>
                  <small>
                    {skill.agent} · {skill.scope} · {skill.path}
                  </small>
                </div>
                <span className="badge accent">
                  <CheckCircle2 size={11} /> Installed locally
                </span>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">No installed skills discovered.</p>
        ))}
      {view === "updates" &&
        (installs.length ? (
          <div className="resource-list">
            {installs.map((record) => {
              const status = updates[record.destination];
              return (
                <article className="resource-row" key={record.destination}>
                  <div>
                    <h3>{record.name}</h3>
                    <small>
                      {record.version} · {record.targetAgent} ·{" "}
                      {record.sourceRoot}
                    </small>
                    <p className="muted">
                      {status === "current"
                        ? "Current"
                        : status === "available"
                          ? "Update available — inspect the package again before replacing anything"
                          : status === "missing"
                            ? "Package no longer appears in this source"
                            : status === "error"
                              ? "Could not compare with the source"
                              : "Not checked"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={status === "checking"}
                    onClick={() => void check(record)}
                  >
                    <RefreshCw size={13} />{" "}
                    {status === "checking" ? "Checking…" : "Check source"}
                  </Button>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="muted">
            No marketplace installs have been recorded yet.
          </p>
        ))}
      {selected && view === "browse" && (
        <div className="resource-preview marketplace-preview">
          <header>
            <div>
              <h3>{selected.name}</h3>
              <small>{selected.source}</small>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              Close
            </Button>
          </header>
          <p className="notice">
            <AlertTriangle size={15} /> Remote content is untrusted. Review
            every file before installation.
          </p>
          <div className="marketplace-metadata">
            <span>
              <strong>Description</strong> {selected.description}
            </span>
            <span>
              <strong>Version</strong> {selected.version}
            </span>
            <span>
              <strong>Source tree</strong>{" "}
              <code>{selected.sha.slice(0, 12)}</code>
            </span>
            <span>
              <strong>Total files</strong> {selected.files.length}
            </span>
            <span>
              <strong>Scripts</strong>{" "}
              {selected.scripts.length ? selected.scripts.join(", ") : "None"}
            </span>
            <span>
              <strong>MCP config</strong>{" "}
              {selected.mcpFiles.length ? selected.mcpFiles.join(", ") : "None"}
            </span>
            <span>
              <strong>Conflict</strong>{" "}
              {conflict
                ? "A discovered skill uses this name"
                : "None found by name"}
            </span>
          </div>
          {selected.warnings.map((warning) => (
            <p className="warning" role="alert" key={warning}>
              {warning}
            </p>
          ))}
          <details open className="marketplace-tree">
            <summary>File tree and exact write set</summary>
            {selected.files.map((file) => (
              <code key={file.path}>
                {file.path} · {file.size} bytes
              </code>
            ))}
          </details>
          <div className="marketplace-install-grid">
            <label>
              Target agent
              <select
                value={targetAgent}
                onChange={(event) => setTargetAgent(event.target.value)}
              >
                <option value="codex">OpenAI Codex</option>
                <option value="claude">Claude Code</option>
                <option value="cursor">Cursor</option>
                <option value="gemini">Gemini CLI</option>
                <option value="opencode">OpenCode</option>
                <option value="copilot">GitHub Copilot</option>
              </select>
            </label>
            <label>
              Absolute local skills directory
              <input
                aria-label="Marketplace install destination"
                placeholder="Choose the target agent's skills directory"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
              />
            </label>
            <Button
              disabled={!desktop || loading || !destination.trim()}
              onClick={() => void install()}
            >
              <Download size={14} /> Preview & install
            </Button>
          </div>
          <details>
            <summary>Review SKILL.md</summary>
            <pre>{selected.text}</pre>
          </details>
        </div>
      )}
      <div className="marketplace-rules">
        <div>
          <strong>Bounded inspection</strong>
          <span>
            128 UTF-8 files, 1 MiB each, 4 MiB total and 8 folder levels.
          </span>
        </div>
        <div>
          <strong>Atomic install</strong>
          <span>
            No overwrite. The backend validates paths, writes a temporary
            package and verifies SKILL.md.
          </span>
        </div>
        <div>
          <strong>No execution</strong>
          <span>
            Scripts and MCP files are listed as warnings and never started.
          </span>
        </div>
      </div>
    </section>
  );
}
