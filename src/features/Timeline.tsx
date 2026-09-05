import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Terminal,
  MessageSquare,
  Wrench,
  AlertCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Session, TimelineEvent } from "@/lib/types";
import { basename, date, errorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ContextExport } from "./ContextExport";
export function Timeline({
  session,
  initialOrdinal = 0,
  onBack,
}: {
  session: Session;
  initialOrdinal?: number;
  onBack: () => void;
}) {
  const [offset, setOffset] = useState(Math.floor(initialOrdinal / 100) * 100);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api
      .events(session.id, offset)
      .then((data) => {
        if (active) setEvents(data);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session.id, offset]);
  if (exporting)
    return (
      <ContextExport
        sessionId={session.id}
        onClose={() => setExporting(false)}
      />
    );
  return (
    <section>
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft size={16} /> Back to sessions
      </Button>
      <Button variant="outline" onClick={() => setExporting(true)}>
        Continue with another agent
      </Button>
      <div className="detail-heading">
        <span className="eyebrow">SESSION TIMELINE</span>
        <h1>{session.title}</h1>
        <p>
          {basename(session.project)} · {session.agent} ·{" "}
          {session.model || "Model not recorded"}
        </p>
        <details className="source">
          <summary>Source details</summary>
          <p>{session.source}</p>
          {session.source_id && <p>Session ID: {session.source_id}</p>}
        </details>
      </div>
      {session.warnings > 0 && (
        <p className="notice">
          {session.warnings} malformed or oversized records were skipped.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {loading ? (
        <p className="loading" role="status">
          Loading timeline…
        </p>
      ) : (
        <div className="timeline">
          {events.map((e) => {
            const Icon =
              e.kind === "error"
                ? AlertCircle
                : e.kind === "tool_call"
                  ? Wrench
                  : e.kind === "tool_result"
                    ? Terminal
                    : MessageSquare;
            return (
              <article
                key={e.ordinal}
                className={`timeline-event ${e.kind} ${e.ordinal === initialOrdinal && initialOrdinal > 0 ? "matched" : ""}`}
              >
                <span className="timeline-icon">
                  <Icon size={15} />
                </span>
                <div className="event-card">
                  <header>
                    <strong>{e.name || e.role}</strong>
                    <span className="badge">{e.kind.replaceAll("_", " ")}</span>
                    <time>{date(e.timestamp)}</time>
                  </header>
                  {e.kind === "message" ? (
                    <ExpandableText text={e.text} />
                  ) : (
                    <details open={e.kind === "error"}>
                      <summary>
                        {e.kind === "tool_call"
                          ? "Inspect arguments / command"
                          : "Inspect output"}
                        {e.call_id && <small> · {e.call_id}</small>}
                      </summary>
                      <ExpandableText text={e.text} />
                    </details>
                  )}
                </div>
              </article>
            );
          })}
          {events.length === 0 && (
            <p className="muted">
              This session has no supported timeline events.
            </p>
          )}
        </div>
      )}
      <div className="pagination">
        <Button
          variant="outline"
          disabled={offset === 0 || loading}
          onClick={() => setOffset(Math.max(0, offset - 100))}
        >
          Previous
        </Button>
        <span>
          Events {events.length ? offset + 1 : 0}–{offset + events.length}
        </span>
        <Button
          variant="outline"
          disabled={events.length < 100 || loading}
          onClick={() => setOffset(offset + 100)}
        >
          Next
        </Button>
      </div>
    </section>
  );
}
function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <pre>{expanded ? text : text.slice(0, 6000)}</pre>
      {text.length > 6000 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : "Show full content"}
        </Button>
      )}
    </>
  );
}
