import { useEffect, useState } from "react";
import { Save, X } from "lucide-react";
import type { MemoryDraft, Project } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/utils";
export function MemoryEditor({
  initial,
  projects,
  onSave,
  onClose,
  onDirty,
}: {
  initial: MemoryDraft;
  projects: Project[];
  onSave: (draft: MemoryDraft) => Promise<void>;
  onClose: () => void;
  onDirty: (value: boolean) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [tags, setTags] = useState(initial.tags.join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(initial) ||
    tags !== initial.tags.join(", ");
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await onSave({ ...draft, tags: tags.split(",") });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  const change = <K extends keyof MemoryDraft>(key: K, value: MemoryDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  return (
    <form className="panel memory-editor" onSubmit={submit}>
      <header>
        <h2>{draft.id ? "Edit memory" : "New memory"}</h2>
        <Button
          variant="ghost"
          type="button"
          aria-label="Close editor"
          disabled={saving}
          onClick={() => {
            if (!dirty || window.confirm("Discard unsaved memory changes?"))
              onClose();
          }}
        >
          <X size={16} />
        </Button>
      </header>
      <label htmlFor="memory-title">Title</label>
      <input
        id="memory-title"
        required
        maxLength={240}
        value={draft.title}
        onChange={(e) => change("title", e.target.value)}
        autoFocus
      />
      <div className="editor-columns">
        <div>
          <label htmlFor="memory-scope">Scope</label>
          <select
            id="memory-scope"
            value={draft.scope}
            onChange={(e) =>
              change("scope", e.target.value as MemoryDraft["scope"])
            }
          >
            <option value="global">Global</option>
            <option value="project">Project</option>
            <option value="agent">Agent-specific</option>
          </select>
        </div>
        <div>
          <label htmlFor="memory-tags">Tags, separated by commas</label>
          <input
            id="memory-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="architecture, testing"
          />
        </div>
      </div>
      {draft.scope === "project" && (
        <>
          <label htmlFor="memory-project">Project path</label>
          <input
            id="memory-project"
            required
            value={draft.project}
            list="known-projects"
            onChange={(e) => change("project", e.target.value)}
          />
          <datalist id="known-projects">
            {projects.map((p) => (
              <option key={p.path} value={p.path}>
                {p.name}
              </option>
            ))}
          </datalist>
        </>
      )}
      <fieldset>
        <legend>Associated agents</legend>
        {[
          ["claude", "Claude Code"],
          ["codex", "Codex"],
          ["cursor", "Cursor"],
          ["gemini", "Gemini CLI"],
          ["opencode", "OpenCode"],
          ["copilot", "Copilot"],
        ].map(([id, label]) => (
          <label className="checkbox" key={id}>
            <input
              type="checkbox"
              checked={draft.agents.includes(id)}
              onChange={(e) =>
                change(
                  "agents",
                  e.target.checked
                    ? [...draft.agents, id]
                    : draft.agents.filter((a) => a !== id),
                )
              }
            />
            {label}
          </label>
        ))}
      </fieldset>
      <p className="field-note">
        Associations organize your library. Agents receive this content only
        when you explicitly export or synchronize it.
      </p>
      <label htmlFor="memory-body">
        Memory content · Markdown supported as text
      </label>
      <textarea
        id="memory-body"
        rows={16}
        value={draft.body}
        onChange={(e) => change("body", e.target.value)}
        maxLength={1024 * 1024}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <span className="muted">
          {dirty ? "Unsaved changes" : "Saved locally"}
        </span>
        <Button disabled={saving || !draft.title.trim()}>
          <Save size={15} />
          {saving ? "Saving…" : "Save memory"}
        </Button>
      </footer>
    </form>
  );
}
