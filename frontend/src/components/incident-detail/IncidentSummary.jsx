import { Link2 } from "lucide-react";
import { formatDateTime } from "../../lib/format.js";
import { severityOf } from "../../lib/theme.js";
import { ApprovalLabel, ProviderName, SeverityBadge } from "../ui/Badges.jsx";
import PrivacyBadge from "../ui/PrivacyBadge.jsx";
import { ScoreMeter } from "../ui/RiskScore.jsx";

function Field({ label, children }) {
  return (
    <div className="min-w-0 px-4 py-2.5">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 flex min-h-6 min-w-0 items-center text-[13px] text-fg">{children}</dd>
    </div>
  );
}

/** Header card: what happened, how bad, and the key facts in one row. */
export default function IncidentSummary({ incident, scoreChanged }) {
  const s = severityOf(incident.severity);
  const score = Number(incident.risk_score) || 0;
  return (
    <section className="card overflow-hidden" style={{ boxShadow: `inset 0 3px 0 ${s.hex}, var(--shadow-card)` }}>
      <div className="flex flex-wrap items-start gap-6 px-5 pb-4 pt-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={incident.severity} size="lg" />
            {incident.is_chain && (
              <span className="inline-flex items-center gap-1 rounded-md border border-critical-line bg-critical-soft px-2 py-1 text-[13px] font-medium leading-4 text-critical">
                <Link2 size={13} strokeWidth={2.25} />
                Agent exfiltration chain
              </span>
            )}
            <ApprovalLabel sanctioned={incident.sanctioned} noun="provider" />
          </div>
          <p className="eyebrow mt-4">Agent context</p>
          <h1 className="mt-1 text-xl font-semibold leading-7 tracking-tight text-fg">{incident.agent_context}</h1>
        </div>

        <div className="w-[200px] shrink-0 rounded-lg border border-line bg-sunken px-4 py-3" aria-label={`Risk score ${score} out of 10`}>
          <p className="eyebrow">Risk score</p>
          <p className="mt-1 flex items-baseline gap-1">
            <span key={score} className={`mono text-[34px] font-semibold leading-none ${s.text} ${scoreChanged ? "score-pop" : ""}`}>
              {score}
            </span>
            <span className="mono text-base text-muted">/ 10</span>
            <span className={`ml-auto text-xs font-semibold ${s.text}`}>{s.label}</span>
          </p>
          <ScoreMeter score={score} severity={incident.severity} className="mt-3" height="h-1.5" />
        </div>
      </div>

      <dl className="grid grid-cols-2 divide-x divide-line border-t border-line bg-card md:grid-cols-3 xl:grid-cols-6">
        <Field label="Provider">
          <ProviderName provider={incident.provider} />
        </Field>
        <Field label="Source process">
          <span className="mono truncate text-[13px]" title={incident.source}>
            {incident.source}
          </span>
        </Field>
        <Field label="Provider approval">
          <ApprovalLabel sanctioned={incident.sanctioned} noun="provider" />
        </Field>
        <Field label="Session started">
          <span className="whitespace-nowrap">{formatDateTime(incident.timestamp)}</span>
        </Field>
        <Field label="Agent chain">
          {incident.is_chain ? (
            <span className="font-medium text-critical">Yes · within 60 s</span>
          ) : (
            <span className="text-muted">Not detected</span>
          )}
        </Field>
        <Field label="Incident ID">
          <span className="mono truncate text-xs text-muted" title={incident.incident_id}>
            {incident.incident_id}
          </span>
        </Field>
      </dl>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-sunken px-5 py-2">
        <PrivacyBadge />
        <span className="text-xs text-muted">Evidence below is redacted in memory before storage; raw payloads are never kept.</span>
      </div>
    </section>
  );
}
