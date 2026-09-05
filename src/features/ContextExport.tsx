import { useEffect, useState } from "react";
import { ArrowLeft, Download, Copy } from "lucide-react";
import { api } from "@/lib/api";
import { saveText } from "@/lib/files";
import { formatContext } from "@/lib/context";
import { errorMessage } from "@/lib/utils";
import type { Memory, SessionContext } from "@/lib/types";
import { Button } from "@/components/ui/button";
export function ContextExport({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const [context, setContext] = useState<SessionContext | null>(null);
  const [target, setTarget] = useState("OpenAI Codex");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [selectedMemoryIds, setSelectedMemoryIds] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    Promise.all([api.context(sessionId), api.memories("", "", false, 0)])
      .then(([c, page]) => {
        if (active) {
          setContext(c);
          setMemories(
            page.items.filter(
              (m) =>
                m.scope === "global" ||
                (m.scope === "project" && m.project === c.project) ||
                (m.scope === "agent" && m.agents.includes(c.source_agent)),
            ),
          );
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
  }, [sessionId]);
  async function exportFile() {
    if (!context) return;
    setSaving(true);
    setError("");
    try {
      if (
        await saveText(
          formatContext(
            context,
            target,
            memories.filter((m) => selectedMemoryIds.includes(m.id)),
          ),
          "agenthub-context.md",
        )
      )
        setNotice(
          "Context exported. Open the Markdown file in your next agent session.",
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
    try {
      await navigator.clipboard.writeText(
        formatContext(
          context,
          target,
          memories.filter((m) => selectedMemoryIds.includes(m.id)),
        ),
      );
      setCopied(true);
      setNotice("Context copied to the clipboard.");
    } catch {
      setError("Clipboard access was unavailable. Use Export context instead.");
    }
  }
  return (
    <section className="panel memory-editor context-editor">
      <Button variant="ghost" onClick={onClose}>
        <ArrowLeft size={15} /> Back to timeline
      </Button>
      <h2>Continue with another agent</h2>
      <p className="field-note">
        Review and edit this compact context, then export it. AgentHub does not
        send data to an agent or execute the recorded commands.
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
          {(["task", "decisions", "remaining_work"] as const).map((key) => (
            <div key={key}>
              <label htmlFor={`context-${key}`}>
                {key === "task"
                  ? "Task"
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
          {(["files", "commands", "errors"] as const).map((key) => (
            <div key={key}>
              <label htmlFor={`context-${key}`}>
                {key === "files"
                  ? "File edit requests"
                  : key === "commands"
                    ? "Recorded shell requests"
                    : "Recorded errors — remove resolved items"}
              </label>
              <textarea
                id={`context-${key}`}
                rows={3}
                value={context[key].join("\n")}
                onChange={(e) => change(key, e.target.value.split("\n"))}
                maxLength={30000}
              />
            </div>
          ))}
          {context.truncated && (
            <p className="notice">
              This is a compact selection. The original timeline retains the
              full indexed history.
            </p>
          )}
          {memories.length > 0 && (
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
            <span className="muted">No upload · Markdown export</span>
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
