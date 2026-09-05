import { ChevronRight, MessageSquare } from "lucide-react";
import type { Session } from "@/lib/types";
import { basename, date } from "@/lib/utils";
export function SessionList({
  sessions,
  onSelect,
}: {
  sessions: Session[];
  onSelect: (s: Session) => void;
}) {
  return (
    <div className="session-list">
      {sessions.map((s) => (
        <button className="session-row" key={s.id} onClick={() => onSelect(s)}>
          <span className={`agent-mark ${s.agent}`}>
            {s.agent === "claude" ? "✳" : "⌘"}
          </span>
          <span className="session-description">
            <strong>{s.title}</strong>
            <span>
              {basename(s.project)}
              <i /> {s.agent === "claude" ? "Claude Code" : "Codex"}
              {s.model && (
                <>
                  <i />
                  {s.model}
                </>
              )}
            </span>
          </span>
          <span className="session-meta">
            <span>
              <MessageSquare size={13} /> {s.event_count} events
            </span>
            <time>{date(s.updated_at)}</time>
          </span>
          <ChevronRight size={16} />
        </button>
      ))}
    </div>
  );
}
