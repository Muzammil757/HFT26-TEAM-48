import { useCallback, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Cloud,
  FileText,
  ListChecks,
  LoaderCircle,
  Sparkles,
  Terminal,
  TriangleAlert,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { analyzeIncident, getIncident } from "../api.js";
import usePolling from "../hooks/usePolling.js";
import {
  ChainBadge,
  LivePill,
  PageShell,
  ProviderStatusBadge,
  ScoreMeter,
  SeverityBadge,
  formatDateTime,
  severityOf,
  useHighlights,
} from "../components/ui.jsx";

const EVENT_TYPES = {
  file_read: { label: "File read", icon: FileText },
  shell_exec: { label: "Shell command", icon: Terminal },
  ai_request: { label: "AI request", icon: Cloud },
  connection: { label: "Connection", icon: Cloud },
};

const CATEGORY_DOT = {
  Credential: "bg-red-400",
  PII: "bg-orange-400",
  HighEntropy: "bg-violet-400",
  AgentAction: "bg-fuchsia-400",
};

function parseAnalysis(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return { sensitivity: "unknown", summary: value, remediation: [] };
  }
}

function offsetSeconds(first, value) {
  const a = new Date(first).getTime();
  const b = new Date(value).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 1000);
}

function PanelHeader({ title, subtitle, icon: Icon, right }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-3.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && <Icon size={16} className="shrink-0 text-cyan-400" />}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/incidents"
      className="inline-flex items-center gap-2 text-xs font-medium text-zinc-400 transition hover:text-cyan-300"
    >
      <ArrowLeft size={14} />
      Back to incidents
    </Link>
  );
}

// Keyed by id so navigating between incidents starts with fresh state.
export default function IncidentDetailRoute() {
  const { id } = useParams();
  return <IncidentDetail key={id} id={id} />;
}

function IncidentDetail({ id }) {
  const fetchIncident = useCallback(() => getIncident(id), [id]);
  const { data: incident, error, loading } = usePolling(fetchIncident, 3000);

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  // Last analysis this page received; stays visible if the backend later clears
  // ai_analysis because the incident changed.
  const [localAnalysis, setLocalAnalysis] = useState(null);
  const latestIncidentRef = useRef(null);
  latestIncidentRef.current = incident;

  const scoreChanged = useHighlights(
    incident ? [incident] : null,
    (item) => item.incident_id,
    (item) => item.risk_score,
  ).has(id);
  const newFactors = useHighlights(incident?.score_breakdown ?? null, (item) => item.factor);
  const newEvents = useHighlights(incident?.events ?? null, (item) => item.event_id);

  async function handleAnalyze() {
    if (!incident || analyzing) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const result = await analyzeIncident(id);
      // Remember which polled copy was on screen when the analysis arrived.
      setLocalAnalysis({ text: result.ai_analysis, polledAt: latestIncidentRef.current });
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "AI analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  if (loading && !incident) {
    return (
      <PageShell>
        <BackLink />
        <div className="panel p-10 text-center text-sm text-zinc-400">Loading incident details…</div>
      </PageShell>
    );
  }

  if (!incident) {
    return (
      <PageShell>
        <BackLink />
        <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-5 text-sm text-red-300">
          {error?.status === 404
            ? "Incident not found. The database may have been reset."
            : error?.message || "Unable to load incident"}
        </div>
      </PageShell>
    );
  }

  const s = severityOf(incident.severity);
  const breakdown = incident.score_breakdown || [];
  const events = incident.events || [];
  const findings = incident.findings || [];
  const findingsByEvent = findings.reduce((acc, f) => {
    if (f.event_id) acc[f.event_id] = (acc[f.event_id] || 0) + 1;
    return acc;
  }, {});
  // The backend stores the analysis, so a poll after it arrived still showing no
  // ai_analysis means the incident changed and the backend cleared it. Until that
  // next poll, the local copy is simply newer than the polled data.
  const analysisStale =
    !incident.ai_analysis && Boolean(localAnalysis) && incident !== localAnalysis.polledAt;
  const analysis = parseAnalysis(incident.ai_analysis || localAnalysis?.text);
  const firstTimestamp = events[0]?.timestamp;

  return (
    <PageShell>
      <div className="flex items-center justify-between gap-3">
        <BackLink />
        <LivePill />
      </div>

      {error?.status === 404 && (
        <div role="alert" className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-300">
          This incident no longer exists on the server (database reset). Showing the last loaded copy.
        </div>
      )}

      {/* Header: what happened + the score */}
      <section className="panel flex flex-col gap-5 p-5 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={incident.severity} />
            {incident.is_chain && <ChainBadge />}
            <ProviderStatusBadge sanctioned={incident.sanctioned} />
          </div>
          <h1 className="mt-3 text-lg font-semibold leading-snug tracking-tight text-zinc-50">
            {incident.agent_context}
          </h1>
          <p className="mt-2 text-xs text-zinc-500">
            <span className="mono text-zinc-300">{incident.source}</span>
            <span className="mx-1.5 text-zinc-600">→</span>
            <span className="text-zinc-300">{incident.provider}</span>
            <span className="mx-1.5 text-zinc-700">·</span>
            first seen {formatDateTime(incident.timestamp)}
            <span className="mx-1.5 text-zinc-700">·</span>
            <span className="mono text-zinc-600">{incident.incident_id}</span>
          </p>
        </div>

        <div className="w-full shrink-0 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 lg:w-56">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Risk score</p>
          <p className={`mono mt-1 text-4xl font-semibold ${s.text}`}>
            <span key={incident.risk_score} className={scoreChanged ? "score-pop" : ""}>
              {incident.risk_score}
            </span>
            <span className="text-lg text-zinc-600">/10</span>
          </p>
          <ScoreMeter score={incident.risk_score} severity={incident.severity} className="mt-2" />
          <p className={`mt-2 text-xs font-medium ${s.text}`}>{s.label} severity</p>
        </div>
      </section>

      {/* Focal row: why it scored this way, and what happened in order */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel overflow-hidden">
          <PanelHeader
            icon={ListChecks}
            title="Explainable risk score"
            subtitle="Every factor that contributed, each counted once"
          />
          <div className="divide-y divide-zinc-800/80">
            {breakdown.map((item) => (
              <div
                key={item.factor}
                className={`flex items-center justify-between gap-4 px-5 py-3 ${newFactors.has(item.factor) ? "enter flash" : ""}`}
              >
                <span className="text-sm text-zinc-200">{item.factor}</span>
                <span className="mono shrink-0 rounded-md bg-zinc-800 px-2 py-0.5 text-sm font-semibold text-zinc-100">
                  +{item.points}
                </span>
              </div>
            ))}
            {breakdown.length === 0 && (
              <p className="px-5 py-6 text-sm text-zinc-500">No score factors available.</p>
            )}
            <div className="flex items-center justify-between bg-zinc-950/50 px-5 py-3.5">
              <span className="text-sm font-semibold text-zinc-200">
                Total
                <span className="ml-2 text-xs font-normal text-zinc-500">capped at 10</span>
              </span>
              <span className={`mono text-lg font-semibold ${s.text}`}>{incident.risk_score}/10</span>
            </div>
          </div>
        </div>

        <div className="panel overflow-hidden">
          <PanelHeader
            icon={Activity}
            title="Chain timeline"
            subtitle="Trigger events in order, with time since the first"
          />
          {events.length === 0 ? (
            <p className="p-6 text-sm text-zinc-500">No event details are available for this incident.</p>
          ) : (
            <ol className="p-5">
              {events.map((event, index) => {
                const type = EVENT_TYPES[event.event_type] || { label: event.event_type, icon: Activity };
                const Icon = type.icon;
                const offset = offsetSeconds(firstTimestamp, event.timestamp);
                const leaks = findingsByEvent[event.event_id] || 0;
                return (
                  <li
                    key={event.event_id}
                    className={`relative flex gap-3 rounded-lg pb-5 last:pb-0 ${newEvents.has(event.event_id) ? "enter" : ""}`}
                  >
                    {index < events.length - 1 && (
                      <span className="absolute left-[15px] top-9 bottom-1 w-px bg-zinc-700" />
                    )}
                    <div
                      className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                        leaks ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-cyan-400/20 bg-cyan-400/5 text-cyan-300"
                      }`}
                    >
                      <Icon size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-zinc-100">{type.label}</span>
                        <span className="mono text-[11px] text-zinc-500">
                          {offset === null ? "" : offset === 0 ? "T+0s" : `T+${offset}s`}
                        </span>
                        {leaks > 0 && (
                          <span className="rounded border border-red-500/30 bg-red-500/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-red-300">
                            {leaks} finding{leaks === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                      <p className="mono mt-1 break-all text-xs text-zinc-300">
                        {event.destination || "No destination"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-500">
                        {formatDateTime(event.timestamp)}
                        {" · "}
                        <span className="mono">{event.source}</span>
                        {event.provider ? ` → ${event.provider}` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>

      <section className="panel overflow-hidden">
        <PanelHeader
          icon={TriangleAlert}
          title="Detected findings"
          subtitle="Redacted evidence and fingerprints only; raw values are never stored"
        />
        {findings.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">No findings are attached to this incident.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead className="bg-zinc-950/50">
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="px-5 py-2.5">Category</th>
                  <th className="px-5 py-2.5">Rule</th>
                  <th className="px-5 py-2.5">Redacted evidence</th>
                  <th className="px-5 py-2.5">Fingerprint</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {findings.map((finding, index) => (
                  <tr key={`${finding.rule}-${finding.event_id}-${index}`}>
                    <td className="px-5 py-3 text-xs text-zinc-300">
                      <span className="inline-flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 rounded-full ${CATEGORY_DOT[finding.category] || "bg-zinc-500"}`} />
                        {finding.category}
                      </span>
                    </td>
                    <td className="mono px-5 py-3 text-xs text-zinc-300">{finding.rule}</td>
                    <td className="mono px-5 py-3 text-xs text-amber-200">{finding.redacted_evidence}</td>
                    <td className="mono px-5 py-3 text-xs text-zinc-500">{finding.fingerprint || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel overflow-hidden">
        <PanelHeader
          icon={Sparkles}
          title="AI security analysis"
          subtitle="Triage from redacted fields only; payloads never leave this machine"
          right={
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={analyzing}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/20 disabled:opacity-50"
            >
              {analyzing ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {analyzing ? "Analyzing…" : analysisStale ? "Re-analyze" : "Analyze with AI"}
            </button>
          }
        />

        {analysisError && (
          <p className="border-b border-red-400/20 bg-red-400/5 px-5 py-3 text-xs text-red-300">{analysisError}</p>
        )}

        {analysis ? (
          <div className="space-y-4 p-5">
            {analysisStale && (
              <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                The incident changed since this analysis. Re-analyze for an up-to-date result.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Sensitivity</p>
                <p className={`mt-1 text-sm font-semibold capitalize ${severityOf(analysis.sensitivity).text}`}>
                  {analysis.sensitivity || "Unknown"}
                </p>
              </div>
              {analysis.engine && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Engine</p>
                  <p className="mono mt-1 text-xs text-zinc-400">{analysis.engine}</p>
                </div>
              )}
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Summary</p>
              <p className="mt-1 text-sm leading-6 text-zinc-300">{analysis.summary || "No summary returned."}</p>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Recommended remediation
              </p>
              {(analysis.remediation || []).length === 0 ? (
                <p className="text-sm text-zinc-500">No remediation steps returned.</p>
              ) : (
                <ul className="space-y-2">
                  {analysis.remediation.map((step, index) => (
                    <li key={`${index}-${step}`} className="flex items-start gap-2 text-sm text-zinc-300">
                      <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" />
                      {step}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="border-t border-zinc-800 pt-3 text-[11px] text-emerald-300/80">
              Analysed using redacted data only.
            </p>
          </div>
        ) : (
          <p className="p-5 text-xs leading-5 text-zinc-500">
            Run AI analysis for a sensitivity assessment, summary and remediation steps. Only the
            provider, scores, context sentence and redacted evidence are sent.
          </p>
        )}
      </section>
    </PageShell>
  );
}
