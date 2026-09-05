import { useEffect, useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { api } from "@/lib/api";
import { saveText } from "@/lib/files";
import { formatContext } from "@/lib/context";
import { errorMessage } from "@/lib/utils";
import type { SessionContext } from "@/lib/types";
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
  useEffect(() => {
    let active = true;
    api
      .context(sessionId)
      .then((c) => {
        if (active) {
          setContext(c);
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
      if (await saveText(formatContext(context, target), "agenthub-context.md"))
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
          <details>
            <summary>Preview exported Markdown</summary>
            <pre>{formatContext(context, target)}</pre>
          </details>
          {notice && (
            <p className="success" role="status">
              {notice}
            </p>
          )}
          <footer>
            <span className="muted">No upload · Markdown export</span>
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
