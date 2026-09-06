import { useEffect, useState } from "react";
import { ArrowLeft, Download, Copy } from "lucide-react";
import { api, desktop } from "@/lib/api";
import { saveText } from "@/lib/files";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { formatContext } from "@/lib/context";
import { errorMessage } from "@/lib/utils";
import type { Memory, SessionContext } from "@/lib/types";
import { Button } from "@/components/ui/button";
const noMemoryIds: string[] = [];
export function ContextExport({
  sessionId,
  onClose,
  initialMemoryIds = noMemoryIds,
}: {
  sessionId: string;
  onClose: () => void;
  initialMemoryIds?: string[];
}) {
  const [context, setContext] = useState<SessionContext | null>(null);
  const [target, setTarget] = useState("OpenAI Codex");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<"markdown" | "json">("markdown");
  const [memories, setMemories] = useState<Memory[]>([]);
  const [selectedMemoryIds, setSelectedMemoryIds] = useState<string[]>([]);
  const [memoryOffset, setMemoryOffset] = useState(0);
  const [memoryTotal, setMemoryTotal] = useState(0);
  const [loadingMemories, setLoadingMemories] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([
      api.context(sessionId),
      api.memories("", "", false, 0),
      Promise.all(initialMemoryIds.map((id) => api.memory(id))),
    ])
      .then(([c, page, requested]) => {
        if (active) {
          setContext(c);
          setMemoryOffset(page.items.length);
          setMemoryTotal(page.total);
          const matching = page.items.filter(
            (m) =>
              m.scope === "global" ||
              (m.scope === "project" && m.project === c.project) ||
              (m.scope === "agent" && m.agents.includes(c.source_agent)),
          );
          const explicit = requested.filter((memory): memory is Memory =>
            Boolean(memory && !memory.deleted_at),
          );
          setMemories([
            ...new Map(
              [...matching, ...explicit].map((m) => [m.id, m]),
            ).values(),
          ]);
          setSelectedMemoryIds(explicit.map((memory) => memory.id));
          setTarget(
            c.source_agent === "codex" ? "Claude Code" : "OpenAI Codex",
          );
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [sessionId, initialMemoryIds]);
  async function loadMoreMemories() {
    if (!context || loadingMemories) return;
    setLoadingMemories(true);
    try {
      const page = await api.memories("", "", false, memoryOffset);
      const matching = page.items.filter(
        (m) =>
          m.scope === "global" ||
          (m.scope === "project" && m.project === context.project) ||
          (m.scope === "agent" && m.agents.includes(context.source_agent)),
      );
      setMemories((existing) => [
        ...new Map([...existing, ...matching].map((m) => [m.id, m])).values(),
      ]);
      setMemoryOffset((offset) => offset + page.items.length);
      setMemoryTotal(page.items.length ? page.total : memoryOffset);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingMemories(false);
    }
  }
  async function exportFile() {
    if (!context) return;
    setSaving(true);
    setError("");
    try {
      if (
        await saveText(
          format === "json"
            ? JSON.stringify(
                {
                  format: "contextmeld.context",
                  version: 1,
                  target_agent: target,
                  context,
                  memories: memories.filter((m) =>
                    selectedMemoryIds.includes(m.id),
                  ),
                },
                null,
                2,
              )
            : formatContext(
                context,
                target,
                memories.filter((m) => selectedMemoryIds.includes(m.id)),
              ),
          format === "json"
            ? "contextmeld-context.json"
            : "contextmeld-context.md",
        )
      )
        setNotice(
          "Context exported. Review the file before sharing it with your next agent.",
        );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  const change = (key: keyof SessionContext, value: string | string[]) =>
    setContext((c) => (c ? { ...c, [key]: value } : c));
  async function copyContext() {
    if (!context) return;
    const text = formatContext(
      context,
      target,
      memories.filter((m) => selectedMemoryIds.includes(m.id)),
    );
    try {
      if (desktop) await writeText(text);
      else if (navigator.clipboard?.writeText)
        await navigator.clipboard.writeText(text);
      else throw new Error("Clipboard API unavailable");
      setCopied(true);
      setNotice("Context copied to the clipboard.");
    } catch (clipboardError) {
      const fallback = document.createElement("textarea");
      fallback.value = text;
      fallback.setAttribute("readonly", "");
      fallback.style.position = "fixed";
      fallback.style.opacity = "0";
      document.body.append(fallback);
      fallback.select();
      const copiedWithFallback = document.execCommand?.("copy") === true;
      fallback.remove();
      if (copiedWithFallback) {
        setCopied(true);
        setNotice("Context copied to the clipboard.");
      } else {
        setError(
          `Clipboard access was unavailable (${errorMessage(clipboardError)}). Use Export context instead.`,
        );
      }
    }
  }
  return (
    <section className="panel memory-editor context-editor">
      <Button variant="ghost" onClick={onClose}>
        <ArrowLeft size={15} /> Back to timeline
      </Button>
      <h2>Continue with another agent</h2>
      <p className="field-note">
        Review and edit this compact context, then export it. ContextMeld does
        not send data to an agent or execute the recorded commands.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {context ? (
        <>
          <label htmlFor="context-target">Next agent</label>
          <select
            id="context-target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            {[
              "OpenAI Codex",
              "Claude Code",
              "Cursor",
              "Gemini CLI",
              "OpenCode",
              "GitHub Copilot",
              "Other compatible agent",
            ].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          {(
            ["task", "current_state", "decisions", "remaining_work"] as const
          ).map((key) => (
            <div key={key}>
              <label htmlFor={`context-${key}`}>
                {key === "task"
                  ? "Task"
                  : key === "current_state"
                    ? "Current state"
                    : key === "decisions"
                      ? "Important decisions"
                      : "Remaining work / TODOs"}
              </label>
              <textarea
                id={`context-${key}`}
                rows={key === "task" ? 5 : 3}
                value={context[key]}
                onChange={(e) => change(key, e.target.value)}
                maxLength={16000}
              />
            </div>
          ))}
          {(["files", "commands", "errors", "relevant_skills"] as const).map(
            (key) => (
              <div key={key}>
                <label htmlFor={`context-${key}`}>
                  {key === "files"
                    ? "File edit requests"
                    : key === "commands"
                      ? "Recorded shell requests"
                      : key === "errors"
                        ? "Recorded errors — remove resolved items"
                        : "Relevant project skills"}
                </label>
                <textarea
                  id={`context-${key}`}
                  rows={3}
                  value={(context[key] ?? []).join("\n")}
                  onChange={(e) => change(key, e.target.value.split("\n"))}
                  maxLength={30000}
                />
              </div>
            ),
          )}
          {context.truncated && (
            <p className="notice">
              This is a compact selection. The original timeline retains the
              full indexed history.
            </p>
          )}
          <div className="context-metadata">
            <p>
              <strong>Project:</strong> {context.project || "Not recorded"}
            </p>
            <p>
              <strong>Repository:</strong>{" "}
              {context.repository || "Not detected"}
            </p>
            <details>
              <summary>Git status and diff</summary>
              <pre>{context.git_diff}</pre>
            </details>
          </div>
          {(memories.length > 0 || memoryOffset < memoryTotal) && (
            <fieldset className="context-memories">
              <legend>Include memories (optional)</legend>
              <p className="field-note">
                Only matching global, project or source-agent memories are
                offered. Review them before exporting.
              </p>
              {memories.map((m) => (
                <label key={m.id}>
                  <input
                    type="checkbox"
                    checked={selectedMemoryIds.includes(m.id)}
                    onChange={(e) =>
                      setSelectedMemoryIds((ids) =>
                        e.target.checked
                          ? [...ids, m.id]
                          : ids.filter((id) => id !== m.id),
                      )
                    }
                  />{" "}
                  {m.title} <span className="badge">{m.scope}</span>
                </label>
              ))}
              {memoryOffset < memoryTotal && (
                <Button
                  variant="outline"
                  disabled={loadingMemories}
                  onClick={() => void loadMoreMemories()}
                >
                  {loadingMemories ? "Loading memories…" : "Load more memories"}
                </Button>
              )}
            </fieldset>
          )}
          <details>
            <summary>Preview exported Markdown</summary>
            <pre>
              {formatContext(
                context,
                target,
                memories.filter((m) => selectedMemoryIds.includes(m.id)),
              )}
            </pre>
          </details>
          {notice && (
            <p className="success" role="status">
              {notice}
            </p>
          )}
          <footer>
            <label htmlFor="context-format">Export format</label>
            <select
              id="context-format"
              value={format}
              onChange={(event) =>
                setFormat(event.target.value as "markdown" | "json")
              }
            >
              <option value="markdown">Markdown</option>
              <option value="json">JSON</option>
            </select>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => void copyContext()}
            >
              <Copy size={15} />
              {copied ? "Copied" : "Copy context"}
            </Button>
            <Button disabled={saving} onClick={() => void exportFile()}>
              <Download size={15} />
              {saving ? "Exporting…" : "Export context"}
            </Button>
          </footer>
        </>
      ) : (
        !error && (
          <p className="loading">Building context from source events…</p>
        )
      )}
    </section>
  );
}
