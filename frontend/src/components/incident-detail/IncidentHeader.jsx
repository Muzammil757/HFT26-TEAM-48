import { useState } from "react";
import { Check, Copy, Link2, LockKeyhole } from "lucide-react";
import { formatDateTime } from "../../lib/format.js";
import { severityOf } from "../../lib/theme.js";
import { ApprovalLabel, ProviderName } from "../ui/Badges.jsx";

const PRIVACY_TOOLTIP =
  "Evidence is redacted in memory before storage. Fingerprints are keyed HMACs. Payloads and raw secrets are never stored.";

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API unavailable (e.g. insecure context): fall back to a hidden textarea.
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

function CopyIdButton({ id }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(id)) {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }
      }}
      title={copied ? "Copied" : `Copy incident ID ${id}`}
      aria-label={`Copy incident ID ${id}`}
      className="inline-flex h-7 items-center gap-1 rounded-md border border-line-strong bg-card px-2 text-xs text-muted transition-colors duration-150 hover:bg-hover hover:text-fg"
    >
      {copied ? <Check size={13} className="text-approved" /> : <Copy size={13} />}
      {copied ? "Copied" : "ID"}
    </button>
  );
}

function Meta({ label, children }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="text-muted">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-fg">{children}</span>
    </div>
  );
}

/**
 * Always-visible incident header: one severity·score badge (pulses when the score
 * changes), the context sentence, and one slim meta strip. Tabs render below it.
 */
export default function IncidentHeader({ incident, scoreChanged, children }) {
  const s = severityOf(incident.severity);
  const events = incident.events || [];
  return (
    <section className="card" style={{ boxShadow: `inset 0 3px 0 ${s.hex}, var(--shadow-card)` }}>
      <div className="px-5 pb-3 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            key={incident.risk_score}
            aria-label={`${s.label} severity, risk score ${incident.risk_score} out of 10`}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[13px] font-semibold leading-4 ${s.badge} ${
              scoreChanged ? "score-pulse" : ""
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
            {s.label}
            <span aria-hidden="true" className="opacity-50">
              ·
            </span>
            <span className="mono">{incident.risk_score}/10</span>
          </span>
          {incident.is_chain && (
            <span
              title="Agent exfiltration chain: sensitive read followed by a credential sent within 60 s, same session"
              className="inline-flex items-center gap-1 rounded-md border border-critical-line bg-card px-2 py-1 text-[13px] font-medium leading-4 text-critical"
            >
              <Link2 size={13} strokeWidth={2.25} />
              Agent chain
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span
              title={PRIVACY_TOOLTIP}
              className="inline-flex h-7 cursor-help items-center gap-1 rounded-md border border-approved-line bg-approved-soft px-2 text-xs font-medium text-approved"
            >
              <LockKeyhole size={12} />
              Raw secrets: <span className="mono">0</span>
            </span>
            <CopyIdButton id={incident.incident_id} />
          </div>
        </div>

        <h1 className="mt-2.5 text-lg font-semibold leading-6 tracking-tight text-fg">{incident.agent_context}</h1>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px]">
          <Meta label="Provider">
            <ProviderName provider={incident.provider} />
            <ApprovalLabel sanctioned={incident.sanctioned} />
          </Meta>
          <Meta label="Source">
            <span className="mono truncate text-[13px]" title={incident.source}>
              {incident.source}
            </span>
          </Meta>
          <Meta label="Started">
            <span className="whitespace-nowrap">{formatDateTime(incident.timestamp)}</span>
          </Meta>
          <Meta label="Events">
            <span className="mono">{events.length}</span>
          </Meta>
        </div>
      </div>
      {children}
    </section>
  );
}
