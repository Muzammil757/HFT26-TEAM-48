import { Link } from "react-router-dom";
import { ArrowRight, CircleAlert, ShieldAlert, ShieldCheck } from "lucide-react";
import { destinationById } from "../../lib/consoleEvent.js";
import { plural } from "../../lib/format.js";
import { ruleLabel } from "../../lib/redaction.js";
import { severityOf } from "../../lib/theme.js";
import BrandMark from "../layout/BrandMark.jsx";
import { CategoryBadge, SeverityBadge } from "../ui/Badges.jsx";

const PROGRESS = {
  scanning: "Scanning for secrets and personal data…",
  sending: "Logging to the local ingest…",
  correlating: "Correlating with this chat's session…",
};

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      {[0, 150, 300].map((delay) => (
        <span key={delay} className="typing-dot h-1.5 w-1.5 rounded-full bg-accent" style={{ animationDelay: `${delay}ms` }} />
      ))}
    </span>
  );
}

function IncidentLine({ incident, label }) {
  const s = severityOf(incident.severity);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-sunken px-3 py-2" style={{ boxShadow: `inset 3px 0 0 ${s.hex}` }}>
      <span className="text-xs text-muted">{label}</span>
      <SeverityBadge severity={incident.severity} />
      <span className="mono text-sm font-semibold">
        <span className={s.text}>{incident.risk_score}</span>
        <span className="text-xs font-normal text-subtle">/10</span>
      </span>
      <Link
        to={`/incidents/${encodeURIComponent(incident.incident_id)}`}
        className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-strong"
      >
        View incident <ArrowRight size={12} />
      </Link>
    </div>
  );
}

/** ShadowGuard's reply: a verdict on what was intercepted and logged, not an AI answer. */
export default function VerdictCard({ message }) {
  const d = destinationById(message.destinationId);
  const findings = message.scan?.findings || [];
  const status = message.status;

  let body;
  if (PROGRESS[status]) {
    body = (
      <p className="flex items-center gap-2.5 text-[13px] text-muted" role="status">
        <TypingDots />
        {PROGRESS[status]}
      </p>
    );
  } else if (status === "error") {
    body = (
      <p className="flex items-start gap-2 text-[13px] text-critical" role="alert">
        <CircleAlert size={15} className="mt-0.5 shrink-0" />
        <span>
          <span className="font-semibold">Couldn&apos;t reach ShadowGuard&apos;s local API.</span> {message.error}
        </span>
      </p>
    );
  } else {
    const leak = findings.length > 0;
    body = (
      <>
        {leak ? (
          <>
            <p className="flex items-center gap-2 text-[13px] font-semibold text-critical">
              <ShieldAlert size={16} />
              Intercepted · {plural(findings.length, "finding")}
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {findings.map((f, i) => (
                <li key={`${f.rule}-${i}`} className="flex items-center gap-1.5 rounded-md border border-line bg-card py-0.5 pl-0.5 pr-2 text-xs">
                  <CategoryBadge category={f.category} />
                  <span className="text-fg">{ruleLabel(f.rule)}</span>
                  <code className="mono text-[11px] text-muted">{f.redacted_evidence}</code>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">
              Logged as a request to {d.provider} ({d.sanctioned ? "approved" : "shadow"}); only the redacted form was stored.
            </p>
          </>
        ) : (
          <p className="flex items-start gap-2 text-[13px] text-fg">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-approved" />
            <span>
              <span className="font-semibold">No sensitive data found in this message</span>
              <span className="text-muted"> · logged as normal AI usage to {d.provider} ({d.sanctioned ? "approved" : "shadow"})</span>
            </span>
          </p>
        )}
        {message.incident ? (
          <IncidentLine incident={message.incident} label={leak ? "Incident" : "Earlier in this chat:"} />
        ) : message.incidentStatus === "missing" ? (
          <p className="mt-2 text-xs text-medium">The incident did not appear within 12 s. Check the Incidents page.</p>
        ) : (
          <p className="mt-2 text-xs text-muted">Logged, below incident threshold (incidents start at a score of 3).</p>
        )}
      </>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-card" aria-label="ShadowGuard">
        <BrandMark size={20} />
      </span>
      <div className="min-w-0 max-w-[85%] flex-1 rounded-2xl rounded-tl-md border border-line bg-card px-4 py-3 shadow-[var(--shadow-card)]">
        <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">ShadowGuard</p>
        {body}
      </div>
    </div>
  );
}
