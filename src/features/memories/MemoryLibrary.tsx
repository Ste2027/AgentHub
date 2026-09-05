import { useEffect, useRef, useState } from "react";
import {
  Brain,
  Copy,
  Download,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { api, desktop } from "@/lib/api";
import { saveText } from "@/lib/files";
import type { Memory, MemoryDraft, MemoryPage, Project } from "@/lib/types";
import { date, errorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/Empty";
import { MemoryEditor } from "./MemoryEditor";
const blank: MemoryDraft = {
  id: null,
  revision: null,
  title: "",
  body: "",
  scope: "global",
  project: "",
  agents: [],
  tags: [],
};
export function MemoryLibrary({
  projects,
  initialId,
  onDirty,
  onUseInContext,
}: {
  projects: Project[];
  initialId?: string;
  onDirty: (value: boolean) => void;
  onUseInContext?: (memory: Memory) => void;
}) {
  const [page, setPage] = useState<MemoryPage>({ items: [], total: 0 });
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("");
  const [trash, setTrash] = useState(false);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<MemoryDraft | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .memories(query, scope, trash, offset)
        .then((p) => {
          if (active) setPage(p);
        })
        .catch((e) => {
          if (active) setError(errorMessage(e));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, scope, trash, offset, revision]);
  useEffect(() => {
    if (!initialId || !desktop) return;
    let active = true;
    api
      .memory(initialId)
      .then((m) => {
        if (active) {
          if (m && !m.deleted_at) setEditor(m);
          else setError("This memory is no longer available. Check Trash.");
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [initialId]);
  async function save(draft: MemoryDraft) {
    const saved = await api.saveMemory(draft);
    setEditor(saved);
    setRevision((r) => r + 1);
    setNotice("Memory saved locally.");
  }
  async function toggleTrash(memory: Memory) {
    setBusy(true);
    setError("");
    try {
      await api.trashMemory(memory.id, memory.revision, trash);
      setRevision((r) => r + 1);
      setNotice(
        trash
          ? "Memory restored."
          : "Memory moved to Trash. You can restore it anytime.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function exportRecords(ids: string[] = []) {
    setBusy(true);
    setError("");
    try {
      const json = await api.exportMemories(ids);
      if (await saveText(json, "agenthub-memories.json"))
        setNotice("Memory archive exported.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function importFile(file: File) {
    setBusy(true);
    setError("");
    try {
      if (file.size > 4 * 1024 * 1024)
        throw Error("Choose a file smaller than 4 MiB.");
      const text = await file.text();
      if (file.name.toLowerCase().endsWith(".json")) {
        const result = await api.importMemories(text);
        setNotice(
          `${result.imported} imported · ${result.skipped} identical memories skipped.`,
        );
        setRevision((r) => r + 1);
      } else if (/\.(md|txt)$/i.test(file.name)) {
        setEditor({
          ...blank,
          title: file.name.replace(/\.(md|txt)$/i, ""),
          body: text,
        });
        setNotice("Review the imported text and save your new memory.");
      } else
        throw Error("Import a memory JSON archive, Markdown or text file.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (editor)
    return (
      <>
        <MemoryEditor
          key={`${editor.id ?? "new"}:${editor.revision ?? 0}`}
          initial={editor}
          projects={projects}
          onSave={save}
          onClose={() => setEditor(null)}
          onDirty={onDirty}
        />
        {notice && (
          <p className="success" role="status">
            {notice}
          </p>
        )}
      </>
    );
  return (
    <>
      <section className="panel memory-guide" aria-label="How memories work">
        <div className="memory-guide-icon">
          <Brain size={18} />
        </div>
        <div>
          <h3>How memories work</h3>
          <p>
            Memories are private notes you keep for decisions, conventions and
            reusable context. They stay in AgentHub and are never injected into
            an agent automatically.
          </p>
          <div className="memory-guide-steps">
            <span>
              <strong>1</strong> Create a note
            </span>
            <span>
              <strong>2</strong> Choose global, project or agent scope
            </span>
            <span>
              <strong>3</strong> Select it in Context Export when needed
            </span>
          </div>
        </div>
      </section>
      <div className="library-toolbar">
        <div className="segmented">
          <Button
            variant={!trash ? "outline" : "ghost"}
            disabled={busy}
            onClick={() => {
              setTrash(false);
              setOffset(0);
            }}
          >
            Library
          </Button>
          <Button
            variant={trash ? "outline" : "ghost"}
            disabled={busy}
            onClick={() => {
              setTrash(true);
              setOffset(0);
            }}
          >
            <Trash2 size={14} /> Trash
          </Button>
        </div>
        <Button
          variant="outline"
          disabled={!desktop || busy}
          onClick={() => fileInput.current?.click()}
        >
          <Upload size={14} /> Import
        </Button>
        <Button
          variant="outline"
          disabled={!desktop || busy || trash || page.total === 0}
          onClick={() => void exportRecords()}
        >
          <Download size={14} /> Export all
        </Button>
        <Button
          disabled={!desktop || busy}
          onClick={() => {
            setNotice("");
            setEditor({ ...blank });
          }}
        >
          <Plus size={15} /> New memory
        </Button>
        <input
          ref={fileInput}
          className="sr-only"
          type="file"
          accept=".json,.md,.txt"
          aria-label="Import memory file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void importFile(file);
          }}
        />
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
      <section className="panel">
        <div className="filters">
          <input
            aria-label="Search memories"
            placeholder="Search content, projects or tags…"
            value={query}
            maxLength={2000}
            onChange={(e) => {
              setQuery(e.target.value);
              setOffset(0);
            }}
          />
          <select
            aria-label="Filter memory scope"
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All scopes</option>
            <option value="global">Global</option>
            <option value="project">Project</option>
            <option value="agent">Agent-specific</option>
          </select>
          <span>{page.total} memories</span>
        </div>
        {loading ? (
          <p className="loading" role="status">
            Loading memories…
          </p>
        ) : page.items.length ? (
          <div className="memory-list">
            {page.items.map((memory) => (
              <article key={memory.id} className="memory-row">
                <Brain size={18} />
                <div className="memory-summary">
                  {trash ? (
                    <h3>{memory.title}</h3>
                  ) : (
                    <button
                      className="text-button"
                      onClick={() => {
                        setNotice("");
                        setEditor(memory);
                      }}
                    >
                      {memory.title}
                    </button>
                  )}
                  <p>{memory.body.slice(0, 160)}</p>
                  <div className="memory-labels">
                    <span className="badge">{memory.scope}</span>
                    {memory.project && (
                      <span title={memory.project}>{memory.project}</span>
                    )}
                    {memory.agents.length > 0 && (
                      <span>{memory.agents.join(", ")}</span>
                    )}
                    {memory.tags.map((tag) => (
                      <span className="badge" key={tag}>
                        {tag}
                      </span>
                    ))}
                    <time>{date(memory.updated_at)}</time>
                  </div>
                </div>
                <div className="memory-actions">
                  {!trash && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Use ${memory.title} in context`}
                        disabled={busy}
                        onClick={() => onUseInContext?.(memory)}
                      >
                        Use in context
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Duplicate ${memory.title}`}
                        disabled={busy}
                        onClick={() => {
                          setNotice("");
                          setEditor({
                            ...memory,
                            id: null,
                            revision: null,
                            title: `${memory.title.slice(0, 230)} (copy)`,
                          });
                        }}
                      >
                        <Copy size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Export ${memory.title}`}
                        disabled={busy}
                        onClick={() => void exportRecords([memory.id])}
                      >
                        <Download size={14} />
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`${trash ? "Restore" : "Trash"} ${memory.title}`}
                    disabled={busy}
                    onClick={() => void toggleTrash(memory)}
                  >
                    {trash ? <RotateCcw size={14} /> : <Trash2 size={14} />}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title={trash ? "Trash is empty" : "A home for what you learn"}
            body={
              trash
                ? "Removed memories stay here until you restore them."
                : "Save project decisions, personal preferences and reusable context. Import Markdown or create your first memory."
            }
          />
        )}
        <div className="pagination">
          <Button
            variant="ghost"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(offset - 100)}
          >
            Previous
          </Button>
          <span>
            {page.total ? offset + 1 : 0}–
            {Math.min(offset + page.items.length, page.total)} of {page.total}
          </span>
          <Button
            variant="ghost"
            disabled={offset + 100 >= page.total || loading}
            onClick={() => setOffset(offset + 100)}
          >
            Next
          </Button>
        </div>
      </section>
    </>
  );
}
