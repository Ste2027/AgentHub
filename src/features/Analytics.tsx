import { useEffect, useState } from "react";
import { api, desktop } from "@/lib/api";
import { errorMessage } from "@/lib/utils";
import type { Analytics as Report, Metric } from "@/lib/types";
import { Empty } from "@/components/Empty";
export function Analytics({ revision }: { revision: number }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!desktop) return;
    setError("");
    let active = true;
    api
      .analytics()
      .then((r) => {
        if (active) setReport(r);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [revision]);
  if (error)
    return (
      <p role="alert" className="error">
        {error}
      </p>
    );
  if (!desktop)
    return (
      <div className="panel">
        <Empty
          title="Local activity, measured from your data"
          body="Open the desktop app and index sessions to see actual activity."
        />
      </div>
    );
  if (!report)
    return (
      <p role="status" className="loading">
        Reading local activity…
      </p>
    );
  return (
    <>
      <div className="stat-grid">
        {[
          ["Sessions", report.session_count],
          ["Projects", report.project_count],
          ["Timeline events", report.event_count],
        ].map(([label, count]) => (
          <div className="stat-card" key={label}>
            <span>{label}</span>
            <strong>{count}</strong>
            <small>From the local index</small>
          </div>
        ))}
      </div>
      <p className="analytics-note">
        Counts describe recorded activity. Tool requests do not prove successful
        execution. No success rates, costs or inferred token totals are
        calculated.
      </p>
      <section className="panel analytics-comparison">
        <h2>Agent comparison</h2>
        {report.agents.length ? (
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Sessions</th>
                <th>Tool calls</th>
                <th>Recorded errors</th>
              </tr>
            </thead>
            <tbody>
              {report.agents.map((a) => (
                <tr key={a.agent}>
                  <th>{a.agent}</th>
                  <td>{a.sessions}</td>
                  <td>{a.tool_calls}</td>
                  <td>{a.errors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No indexed sessions yet.</p>
        )}
      </section>
      <div className="analytics-grid">
        <MetricCard
          title="Sessions by last activity date"
          note="Most recent 30 dates with activity; not session creation dates."
          metrics={report.activity}
        />
        <MetricCard
          title="Models recorded"
          note="One latest recorded model per session."
          metrics={report.models}
        />
        <MetricCard
          title="Tool calls"
          note="Counts source tool-call events."
          metrics={report.tools}
        />
        <MetricCard
          title="File edit requests"
          note="Recognized Write/Edit/apply_patch paths; requests may fail."
          metrics={report.file_requests}
        />
        <MetricCard
          title="Recorded shell requests"
          note="Recognized shell tool calls, grouped by the first 240 characters."
          metrics={report.shell_requests}
        />
        <MetricCard
          title="Recorded errors"
          note="Explicit error events, grouped by the first 240 characters."
          metrics={report.errors}
        />
      </div>
    </>
  );
}
function MetricCard({
  title,
  note,
  metrics,
}: {
  title: string;
  note: string;
  metrics: Metric[];
}) {
  const max = Math.max(1, ...metrics.map((m) => m.count));
  return (
    <section className="panel metric-card">
      <h2>{title}</h2>
      <p className="muted">{note}</p>
      {metrics.length ? (
        <ol>
          {metrics.map((m, i) => (
            <li key={`${m.label}:${i}`}>
              <div>
                <span title={m.label}>{m.label || "(empty error)"}</span>
                <strong>{m.count}</strong>
              </div>
              <div className="metric-track">
                <span style={{ width: `${(m.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="metric-empty">No matching records in the local index.</p>
      )}
    </section>
  );
}
