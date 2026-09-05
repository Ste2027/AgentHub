import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { Search as SearchIcon, X, ArrowUpRight } from "lucide-react";
import { api, desktop } from "@/lib/api";
import { basename, date, errorMessage } from "@/lib/utils";
import type { SearchHit } from "@/lib/types";
export function Search({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (hit: SearchHit) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setHits([]);
    setError("");
    if (!query.trim() || !open || !desktop) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      Promise.all([
        api.search(query),
        api.skills().catch(() => []),
        api.mcpServers().catch(() => []),
        api.projects().catch(() => []),
      ])
        .then(([data, skills, mcp, projects]) => {
          const q = query.toLocaleLowerCase();
          const resourceHits: SearchHit[] = [
            ...projects
              .filter((p) =>
                `${p.name} ${p.path} ${p.agents}`
                  .toLocaleLowerCase()
                  .includes(q),
              )
              .map((p) => ({
                entity_type: "project" as const,
                entity_id: p.path,
                session_id: "",
                title: p.name,
                agent: p.agents,
                project: p.path,
                text: p.path,
                kind: "project",
                ordinal: 0,
                updated_at: p.updated_at,
              })),
            ...skills
              .filter((s) =>
                `${s.name} ${s.description} ${s.agent} ${s.path}`
                  .toLocaleLowerCase()
                  .includes(q),
              )
              .map((s) => ({
                entity_type: "skill" as const,
                entity_id: s.path,
                session_id: "",
                title: s.name,
                agent: s.agent,
                project: "",
                text: s.description || s.path,
                kind: "skill" as const,
                ordinal: 0,
                updated_at: s.modified_at,
              })),
            ...mcp
              .filter((s) =>
                `${s.name} ${s.command || ""} ${s.url || ""} ${s.agent}`
                  .toLocaleLowerCase()
                  .includes(q),
              )
              .map((s) => ({
                entity_type: "mcp" as const,
                entity_id: s.config_path,
                session_id: "",
                title: s.name,
                agent: s.agent,
                project: "",
                text: s.command || s.url || "",
                kind: "mcp" as const,
                ordinal: 0,
              })),
          ];
          if (active) setHits([...data, ...resourceHits]);
        })
        .catch((e) => {
          if (active) setError(errorMessage(e));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, open]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="search-dialog">
          <Dialog.Title className="sr-only">Search your workspace</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search indexed sessions, projects, messages, tool calls and
            commands.
          </Dialog.Description>
          <div className="search-input">
            <SearchIcon size={20} />
            <input
              aria-label="Search all sessions"
              placeholder="Search sessions, messages, commands…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={2000}
            />
            <Dialog.Close aria-label="Close search">
              <X size={18} />
            </Dialog.Close>
          </div>
          <div className="search-results">
            {!desktop ? (
              <p>Search is available in the desktop app.</p>
            ) : loading ? (
              <p role="status">Searching your local index…</p>
            ) : error ? (
              <p role="alert">{error}</p>
            ) : hits.length ? (
              hits.map((hit, i) => (
                <button
                  key={`${hit.session_id}-${hit.ordinal}-${i}`}
                  onClick={() => {
                    onSelect(hit);
                    onOpenChange(false);
                  }}
                >
                  <span>
                    <strong>{hit.title}</strong>
                    <small>
                      {hit.entity_type === "memory"
                        ? "Memory library"
                        : basename(hit.project)}
                      {hit.agent && ` · ${hit.agent}`} ·{" "}
                      {hit.kind.replaceAll("_", " ")}
                      {hit.updated_at && ` · ${date(hit.updated_at)}`}
                    </small>
                    <p>{hit.text}</p>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))
            ) : (
              <p>
                {query.trim()
                  ? "No matches. Try another phrase or index your sessions."
                  : "Find a decision, a command, or that conversation from last week."}
              </p>
            )}
          </div>
          <footer>
            <span>Local full-text search</span>
            <kbd>ESC to close</kbd>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
