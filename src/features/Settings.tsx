import { useEffect, useState } from "react";
import { ShieldCheck, Save } from "lucide-react";
import { api, desktop } from "@/lib/api";
import type { AutoIndexStatus, Settings as Preferences } from "@/lib/types";
import { errorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
export function Settings({
  onSaved,
  databasePath,
  busy,
  autoIndexStatus,
}: {
  onSaved: () => void;
  databasePath: string;
  busy: boolean;
  autoIndexStatus: AutoIndexStatus | null;
}) {
  const [settings, setSettings] = useState<Preferences>({
    claude_path: "",
    codex_path: "",
    light_mode: false,
    auto_index: true,
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (desktop)
      api
        .settings()
        .then((s) => {
          setSettings(s);
          setReady(true);
        })
        .catch((e) => setError(errorMessage(e)));
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.saveSettings(settings);
      document.documentElement.dataset.theme = settings.light_mode
        ? "light"
        : "dark";
      setMessage(
        settings.auto_index
          ? "Settings saved. New and changed sessions will be indexed automatically."
          : "Settings saved. Automatic indexing is off.",
      );
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="settings-grid">
      <form onSubmit={save} className="panel settings-form">
        <h2>Agent directories</h2>
        <p>
          Leave a path empty to use its default. Choose the directory containing
          session JSONL files.
        </p>
        <label htmlFor="claude-path">Claude Code</label>
        <input
          id="claude-path"
          placeholder="Default: ~/.claude/projects"
          value={settings.claude_path}
          onChange={(e) =>
            setSettings({ ...settings, claude_path: e.target.value })
          }
        />
        <label htmlFor="codex-path">OpenAI Codex</label>
        <input
          id="codex-path"
          placeholder="Default: $CODEX_HOME/sessions or ~/.codex/sessions"
          value={settings.codex_path}
          onChange={(e) =>
            setSettings({ ...settings, codex_path: e.target.value })
          }
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.light_mode}
            onChange={(e) =>
              setSettings({ ...settings, light_mode: e.target.checked })
            }
          />{" "}
          Use light appearance
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.auto_index}
            onChange={(e) =>
              setSettings({ ...settings, auto_index: e.target.checked })
            }
          />{" "}
          Keep the session index up to date automatically
        </label>
        <div className="watcher-status" role="status">
          <span
            className={`status-dot ${autoIndexStatus?.active ? "online" : ""}`}
          />
          <span>
            <strong>
              {autoIndexStatus?.running
                ? "Indexing changed sessions…"
                : autoIndexStatus?.active
                  ? `Watching ${autoIndexStatus.watched_paths.length} agent ${autoIndexStatus.watched_paths.length === 1 ? "folder" : "folders"}`
                  : autoIndexStatus?.enabled
                    ? "Waiting for a supported session folder"
                    : "Automatic indexing is off"}
            </strong>
            <small>
              {autoIndexStatus?.last_run_at
                ? `Last update ${new Date(autoIndexStatus.last_run_at).toLocaleString()} · ${autoIndexStatus.last_indexed} changed · ${autoIndexStatus.last_failed} failed`
                : "Run Index sessions once for existing history; later file changes are detected automatically."}
            </small>
          </span>
        </div>
        {autoIndexStatus?.last_error && (
          <p className="watcher-warning">{autoIndexStatus.last_error}</p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="success">
            {message}
          </p>
        )}
        <Button disabled={!desktop || !ready || saving || busy}>
          <Save size={15} />
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </form>
      <aside className="panel privacy">
        <ShieldCheck size={26} />
        <h2>Your data stays yours.</h2>
        <p>
          ContextMeld reads local transcripts and keeps a searchable SQLite
          index on this device. No accounts, telemetry or AI service calls.
          Marketplace contacts public GitHub repositories only when you request
          it.
        </p>
        <p>
          Original transcripts are never modified. Skill and MCP changes require
          your explicit action. Tool commands in transcripts are displayed as
          text and never executed.
        </p>
        <h3>Local storage</h3>
        <code>{databasePath || "Available in the desktop app"}</code>
        <p>
          The index contains transcript text and may include secrets from your
          sessions. It is not encrypted. Protect it with your OS account and
          disk encryption.
        </p>
        <p>
          Automatic indexing watches only supported local session directories
          and can be disabled above. Deleted source files remain searchable in
          the local archive. To reset the index, close ContextMeld and delete
          its database and adjacent -wal/-shm files.
        </p>
      </aside>
    </div>
  );
}
