import {
  Ban,
  CheckCircle2,
  Cpu,
  KeyRound,
  LoaderCircle,
  Lock,
  Power,
  RotateCw,
  Sparkles,
  UserCheck,
  WifiOff,
} from "lucide-react";
import { describeEngine } from "../../lib/analysis.js";
import { severityOf } from "../../lib/theme.js";
import Card from "../ui/Card.jsx";
import { InlineAlert, Skeleton } from "../ui/States.jsx";

// Icon for a remediation step, chosen from what the step asks for.
function remediationIcon(step) {
  if (/isolate|stop the process/i.test(step)) return Power;
  if (/rotate|revoke|deactivate|invalidate|replace/i.test(step)) return KeyRound;
  if (/block|egress|allowlist/i.test(step)) return Ban;
  if (/restrict|deny list|permission|approval/i.test(step)) return Lock;
  if (/notify|officer|dpo|deletion/i.test(step)) return UserCheck;
  return CheckCircle2;
}

const SENT_FIELDS = "provider, approval, source, severity, score factors, the context sentence and redacted evidence";

function AnalysisResult({ analysis, stale }) {
  const engine = describeEngine(analysis.engine);
  const sensitivity = String(analysis.sensitivity || "unknown").toLowerCase();
  const known = ["critical", "high", "medium", "low"].includes(sensitivity);
  return (
    <div className="space-y-3 p-4">
      {stale && (
        <InlineAlert tone="warning">The incident changed since this analysis. Re-analyze for an up-to-date result.</InlineAlert>
      )}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div>
          <p className="eyebrow">Sensitivity</p>
          <p className={`mt-0.5 text-sm font-semibold capitalize ${known ? severityOf(sensitivity).text : "text-muted"}`}>{sensitivity}</p>
        </div>
        {engine && (
          <div className="min-w-0">
            <p className="eyebrow">Engine</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-fg" title={analysis.engine}>
              <Cpu size={13} className="text-muted" />
              <span className="font-medium">{engine.name}</span>
              {engine.detail && <span className="mono truncate text-xs text-muted">{engine.detail}</span>}
            </p>
          </div>
        )}
      </div>

      <div>
        <p className="eyebrow">Summary</p>
        <p className="mt-1 text-[13px] leading-5 text-fg">{analysis.summary || "No summary returned."}</p>
      </div>

      <div>
        <p className="eyebrow mb-1.5">Recommended remediation</p>
        {(analysis.remediation || []).length === 0 ? (
          <p className="text-[13px] text-muted">No remediation steps returned.</p>
        ) : (
          <ol className="space-y-1.5">
            {analysis.remediation.map((step, index) => {
              const Icon = remediationIcon(step);
              return (
                <li key={`${index}-${step}`} className="flex items-start gap-2.5 rounded-md border border-line bg-sunken px-2.5 py-2 text-[13px] leading-5 text-fg">
                  <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded border border-approved-line bg-approved-soft text-approved">
                    <Icon size={12} />
                  </span>
                  <span>{step}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <p className="flex items-center gap-1.5 border-t border-line pt-2.5 text-xs text-muted">
        <Lock size={12} className="text-approved" />
        Analyzed using redacted data only. Payloads and raw secrets never leave this machine.
      </p>
    </div>
  );
}

/**
 * Optional LLM triage. Detection never depends on it: the score and findings come
 * from deterministic rules; this panel only adds a summary and remediation steps.
 */
/** The one Analyze control, shared by the Summary and AI analysis tabs. */
export function AnalyzeButton({ state, offline, size = "md" }) {
  const { analysis, stale, analyzing, run } = state;
  return (
    <button
      type="button"
      onClick={run}
      disabled={analyzing || offline}
      title={offline ? "Unavailable while the backend is offline" : undefined}
      className={`inline-flex items-center gap-1.5 rounded-md bg-accent font-semibold text-white shadow-[0_1px_2px_rgb(23_36_58/0.12)] transition-colors duration-150 hover:bg-accent-strong disabled:bg-[#9fb2cc] ${
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]"
      }`}
    >
      {analyzing ? <LoaderCircle size={14} className="spin" /> : stale ? <RotateCw size={14} /> : <Sparkles size={14} />}
      {analyzing ? "Analyzing…" : stale ? "Re-analyze" : analysis ? "Analysis ready" : "Generate AI Analysis"}
    </button>
  );
}

/**
 * Optional LLM triage. Detection never depends on it: the score and findings come
 * from deterministic rules; this panel only adds a summary and remediation steps.
 * `state` comes from useIncidentAnalysis, shared with the Summary tab.
 */
export default function AnalysisPanel({ state, offline }) {
  const { analysis, stale, analyzing, error: analysisError } = state;
  const button = <AnalyzeButton state={state} offline={offline} />;

  return (
    <Card
      title="AI-assisted analysis"
      subtitle="Optional triage · detection does not depend on it"
      icon={Sparkles}
      actions={(!analysis || stale || analyzing) && button}
    >
      {analysisError && !analyzing && (
        <div className="px-4 pt-3">
          <InlineAlert tone="error">
            <span className="font-semibold">Analysis failed.</span> {analysisError}
          </InlineAlert>
        </div>
      )}

      {analyzing ? (
        <div className="space-y-3 p-4" aria-busy="true">
          <p className="flex items-center gap-2 text-[13px] text-fg">
            <LoaderCircle size={14} className="spin text-accent" />
            Analyzing redacted evidence… this usually takes 3–10 seconds.
          </p>
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : analysis ? (
        <AnalysisResult analysis={analysis} stale={stale} />
      ) : offline ? (
        <div className="flex items-start gap-3 p-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-sunken text-muted">
            <WifiOff size={15} />
          </span>
          <div>
            <p className="text-[13px] font-medium text-fg">AI analysis is unavailable while the backend is offline.</p>
            <p className="mt-0.5 text-xs text-muted">The button re-enables automatically when the API reconnects.</p>
          </div>
        </div>
      ) : (
        <div className="p-4">
          <p className="text-[13px] font-medium text-fg">AI analysis has not been generated for this incident.</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Generates a sensitivity assessment, a short summary and remediation steps. Only the {SENT_FIELDS} are sent, never the
            payload or a raw secret.
          </p>
        </div>
      )}
    </Card>
  );
}
