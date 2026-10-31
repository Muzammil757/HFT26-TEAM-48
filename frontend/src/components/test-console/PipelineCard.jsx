import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Circle, LoaderCircle, Waypoints, XCircle } from "lucide-react";
import { destinationById } from "../../lib/consoleEvent.js";
import { severityOf } from "../../lib/theme.js";
import { ApprovalLabel, SeverityBadge } from "../ui/Badges.jsx";
import Card from "../ui/Card.jsx";
import { EmptyState } from "../ui/States.jsx";
import { ScoreMeter } from "../ui/RiskScore.jsx";

const ICONS = {
  idle: { icon: Circle, cls: "text-subtle" },
  loading: { icon: LoaderCircle, cls: "spin text-accent" },
  done: { icon: CheckCircle2, cls: "text-approved" },
  error: { icon: XCircle, cls: "text-critical" },
};

function Step({ status, title, children }) {
  const { icon: Icon, cls } = ICONS[status] || ICONS.idle;
  return (
    <li className="flex gap-3">
      <Icon size={16} className={`mt-0.5 shrink-0 ${cls}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-fg">{title}</p>
        {children && <div className="mt-1 text-xs text-muted">{children}</div>}
      </div>
    </li>
  );
}

function IncidentResult({ incident }) {
  const s = severityOf(incident.severity);
  return (
    <div className="mt-2 rounded-lg border border-line bg-card p-3" style={{ boxShadow: `inset 3px 0 0 ${s.hex}` }}>
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={incident.severity} />
        <ApprovalLabel sanctioned={incident.sanctioned} noun="provider" />
        <span className="ml-auto mono text-sm font-semibold text-fg">
          <span className={s.text}>{incident.risk_score}</span>
          <span className="text-xs font-normal text-subtle">/10</span>
        </span>
      </div>
      <ScoreMeter score={incident.risk_score} severity={incident.severity} className="mt-2" />
      <p className="mt-2 text-[13px] leading-5 text-fg">{incident.agent_context}</p>
      <ul className="mt-2 space-y-0.5">
        {(incident.score_breakdown || []).map((b) => (
          <li key={b.factor} className="flex justify-between gap-3 text-xs text-muted">
            <span>{b.factor}</span>
            <span className="mono font-semibold text-fg">+{b.points}</span>
          </li>
        ))}
      </ul>
      <Link
        to={`/incidents/${encodeURIComponent(incident.incident_id)}`}
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-strong"
      >
        Open incident detail <ArrowRight size={13} />
      </Link>
    </div>
  );
}

/** Steps 2 and 3: the simulated event through ingest, then correlation. */
export default function PipelineCard({ run, incident }) {
  if (!run) {
    return (
      <Card title="2 · Ingest & correlation" subtitle="POST /api/ingest · same pipeline as real traffic" icon={Waypoints}>
        <EmptyState icon={Waypoints} title="Nothing sent yet" hint="After the scan, the prompt is sent as an ai_request event to the local ingest." />
      </Card>
    );
  }
  const d = destinationById(run.destinationId);
  const ingestDone = run.ingest.status === "done";
  const incidentStatus =
    run.ingest.status !== "done" ? "idle" : run.incident.status === "waiting" ? "loading" : run.incident.status === "error" ? "error" : "done";

  return (
    <Card title="2 · Ingest & correlation" subtitle="POST /api/ingest · same pipeline as real traffic" icon={Waypoints}>
      <ol className="space-y-4 p-4">
        <Step status={run.ingest.status} title="Sent to the local ingest as an ai_request event">
          <dl className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-0.5">
            <dt>Event</dt>
            <dd className="mono truncate text-fg">{run.event.event_id}</dd>
            <dt>Session</dt>
            <dd className="mono truncate text-fg">{run.event.session_id}</dd>
            <dt>Source</dt>
            <dd className="mono truncate text-fg">{run.event.source}</dd>
            <dt>Destination</dt>
            <dd className="mono truncate text-fg" title={`${d.host}:${d.port}${d.path}`}>
              {d.host}:{d.port}
              {d.path}
            </dd>
          </dl>
          {run.ingest.status === "error" && <p className="mt-1 font-medium text-critical">{run.ingest.error}</p>}
        </Step>
        <Step
          status={incidentStatus}
          title={
            !ingestDone
              ? "Correlate into an incident"
              : run.incident.status === "waiting"
                ? "Correlating…"
                : run.incident.status === "found"
                  ? "Incident raised"
                  : run.incident.status === "none"
                    ? "No incident raised"
                    : "Incident not found"
          }
        >
          {run.incident.status === "none" && (
            <p>
              This session scored below 3, so it was recorded (it counts in the inventory and stats) but not raised as an incident.
              {!d.sanctioned && " An unapproved provider alone scores 2."}
            </p>
          )}
          {run.incident.status === "error" && <p className="text-critical">{run.incident.error}</p>}
          {run.incident.status === "found" && incident && <IncidentResult incident={incident} />}
        </Step>
      </ol>
    </Card>
  );
}
