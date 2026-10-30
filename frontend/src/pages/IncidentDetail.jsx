import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Ban,
  CheckCircle2,
  Cloud,
  FileText,
  Fingerprint,
  KeyRound,
  ListChecks,
  LoaderCircle,
  Lock,
  Power,
  Sparkles,
  Terminal,
  TriangleAlert,
  UserCheck,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { analyzeIncident, getIncident } from "../api.js";
import usePolling, { useBackendOffline } from "../hooks/usePolling.js";
import {
  Card,
  ChainBadge,
  EmptyState,
  PageShell,
  PrivacyBadge,
  ProviderStatusBadge,
  RiskGauge,
  SeverityBadge,
  Skeleton,
  errorMessage,
  formatDateTime,
  formatGap,
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
  Credential: "bg-critical",
  PII: "bg-high",
  HighEntropy: "bg-medium",
  AgentAction: "bg-accent",
};

// Shade per breakdown segment (same hue = same incident severity).
const SEGMENT_OPACITY = [0.9, 0.7, 0.55, 0.42, 0.32, 0.25];

function withAlpha(hex, alpha) {
  return `${hex}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
}

// Icon for a remediation step, chosen from what the step asks for.
function remediationIcon(step) {
  if (/isolate|stop the process/i.test(step)) return Power;
  if (/rotate|revoke|deactivate|invalidate|replace/i.test(step)) return KeyRound;
  if (/block|egress|allowlist/i.test(step)) return Ban;
  if (/restrict|deny list|permission|approval/i.test(step)) return Lock;
  if (/notify|officer|dpo|deletion/i.test(step)) return UserCheck;
  return CheckCircle2;
}

function parseAnalysis(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return { sensitivity: "unknown", summary: value, remediation: [] };
  }
}

function secondsBetween(a, b) {
  const x = new Date(a).getTime();
  const y = new Date(b).getTime();
  return Number.isNaN(x) || Number.isNaN(y) ? null : Math.round((y - x) / 1000);
}

function BackLink() {
  // Return to the Incidents page with the severity filter it had.
  let search = "";
  try {
    search = sessionStorage.getItem("sg.incidentsSearch") || "";
  } catch {
    // Storage unavailable; go back unfiltered.
  }
  return (
    <Link to={`/incidents${search}`} className="inline-flex items-center gap-2 text-sm text-muted transition-colors duration-150 hover:text-accent">
      <ArrowLeft size={16} />
      Back to incidents
    </Link>
  );
}

// Keyed by id so navigating between incidents starts with fresh state.
export default function IncidentDetailRoute() {
  const { id } = useParams();
  return <IncidentDetail key={id} id={id} />;
}

function ScoreBreakdown({ incident, newFactors }) {
  const s = severityOf(incident.severity);
  const breakdown = incident.score_breakdown || [];
  const raw = breakdown.reduce((sum, b) => sum + (Number(b.points) || 0), 0);
  const scale = Math.max(raw, 10);
  return (
    <Card title="Explainable risk score" subtitle="Each factor counted once; the total is capped at 10" icon={ListChecks}>
      <div className="px-6 pb-2 pt-6">
        <div className="relative">
          <div className="flex h-8 w-full gap-0.5 overflow-hidden rounded-lg bg-line">
            {breakdown.map((item, i) => (
              <div
                key={item.factor}
                title={`${item.factor}: +${item.points}`}
                className={`flex h-full items-center justify-center text-xs font-semibold text-fg transition-[width] duration-250 ease-out ${newFactors.has(item.factor) ? "enter" : ""}`}
                style={{
                  width: `${((Number(item.points) || 0) / scale) * 100}%`,
                  // Tint the background only, so the "+N" label keeps full contrast.
                  backgroundColor: withAlpha(s.hex, SEGMENT_OPACITY[i] ?? 0.2),
                  textShadow: "0 1px 2px rgb(0 0 0 / 0.6)",
                }}
              >
                <span className="mono">+{item.points}</span>
              </div>
            ))}
          </div>
          {raw > 10 && (
            <div className="absolute -top-1 bottom-0" style={{ left: `${(10 / scale) * 100}%` }}>
              <div className="h-10 w-0.5 bg-fg" />
              <span className="mono absolute left-1 top-10 whitespace-nowrap text-xs text-muted">cap 10</span>
            </div>
          )}
        </div>
        <div className="mono mt-2 flex justify-between text-xs text-subtle">
          <span>0</span>
          <span>{raw > 10 ? `${raw} pts` : "10"}</span>
        </div>
      </div>

      <ul className="divide-y divide-line">
        {breakdown.map((item, i) => (
          <li
            key={item.factor}
            className={`flex items-center justify-between gap-4 px-6 py-2 ${newFactors.has(item.factor) ? "enter flash" : ""}`}
          >
            <span className="flex min-w-0 items-center gap-2 text-sm text-fg">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: withAlpha(s.hex, SEGMENT_OPACITY[i] ?? 0.2) }} />
              <span className="truncate">{item.factor}</span>
            </span>
            <span className="mono shrink-0 text-sm font-semibold text-fg">+{item.points}</span>
          </li>
        ))}
        {breakdown.length === 0 && <li className="px-6 py-4 text-sm text-subtle">No score factors available.</li>}
        <li className="flex items-center justify-between bg-raised/60 px-6 py-3">
          <span className="text-sm font-semibold text-fg">
            Total{raw > 10 && <span className="ml-2 text-xs font-normal text-subtle">{raw} points, capped at 10</span>}
          </span>
          <span className={`mono text-xl font-semibold ${s.text}`}>{incident.risk_score}/10</span>
        </li>
      </ul>
    </Card>
  );
}

function ChainTimeline({ incident, newEvents }) {
  const events = incident.events || [];
  const findingsByEvent = (incident.findings || []).reduce((acc, f) => {
    if (f.event_id) acc[f.event_id] = (acc[f.event_id] || 0) + 1;
    return acc;
  }, {});
  // The exfiltration step: the last event that carried findings.
  const exfilId = [...events].reverse().find((e) => findingsByEvent[e.event_id])?.event_id;
  const critical = incident.is_chain || String(incident.severity).toLowerCase() === "critical";

  return (
    <Card title="Chain timeline" subtitle="What happened, in order, with the time between steps" icon={Activity}>
      {events.length === 0 ? (
        <EmptyState icon={Activity} title="No event details for this incident" />
      ) : (
        <ol className="px-6 py-4">
          {events.map((event, index) => {
            const type = EVENT_TYPES[event.event_type] || { label: event.event_type, icon: Activity };
            const Icon = type.icon;
            const leaks = findingsByEvent[event.event_id] || 0;
            const isExfil = event.event_id === exfilId;
            const isNew = newEvents.has(event.event_id);
            const gap = index > 0 ? secondsBetween(events[index - 1].timestamp, event.timestamp) : null;
            return (
              <li key={event.event_id}>
                {index > 0 && (
                  <div className="flex h-6 items-stretch gap-4 px-2" aria-hidden="true">
                    <div className="flex w-8 justify-center">
                      <span className={`w-0.5 rounded-full ${isExfil && critical ? "bg-critical" : "bg-accent"} ${isNew ? "grow-y" : ""}`} />
                    </div>
                    <span className="mono self-center text-xs text-subtle">{formatGap(gap)}</span>
                  </div>
                )}
                <div
                  className={`flex items-start gap-4 rounded-lg p-2 ${isExfil ? (critical ? "glow-critical bg-critical/5" : "shadow-[0_0_0_1px_var(--color-line-strong)]") : ""} ${isNew ? "enter" : ""}`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                      leaks ? "border-critical/40 bg-critical/15 text-critical" : "border-accent/30 bg-accent/10 text-accent"
                    }`}
                  >
                    <Icon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-fg">{type.label}</span>
                      {isExfil && critical && (
                        <span className="rounded-md border border-critical/40 bg-critical/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-critical">
                          Exfiltration
                        </span>
                      )}
                      {leaks > 0 && (
                        <span className="text-xs text-critical">
                          {leaks} finding{leaks === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <p className="mono mt-1 break-all text-xs text-fg/90">{event.destination || "No destination"}</p>
                    <p className="mt-1 text-xs text-subtle">
                      {formatDateTime(event.timestamp)} · <span className="mono">{event.source}</span>
                      {event.provider ? ` → ${event.provider}` : ""}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

function IncidentDetail({ id }) {
  const fetchIncident = useCallback(() => getIncident(id), [id]);
  const { data: incident, error, loading } = usePolling(fetchIncident, 3000, `incident:${id}`);

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  // Last analysis this page received; stays visible if the backend later clears
  // ai_analysis because the incident changed.
  const [localAnalysis, setLocalAnalysis] = useState(null);
  const latestIncidentRef = useRef(null);
  latestIncidentRef.current = incident;

  // Analyze needs the backend; clear a stale error once it is reachable again.
  const offline = useBackendOffline();
  useEffect(() => {
    if (!offline) setAnalysisError(null);
  }, [offline]);

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
      setAnalysisError(errorMessage(err) || "AI analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  if (loading && !incident) {
    return (
      <PageShell>
        <BackLink />
        <div className="card flex items-center gap-6 p-6">
          <Skeleton className="h-[136px] w-[136px] rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </PageShell>
    );
  }

  if (!incident) {
    return (
      <PageShell>
        <BackLink />
        <div className="card">
          <EmptyState
            icon={TriangleAlert}
            title={error?.status === 404 ? "Incident not found" : "Unable to load incident"}
            hint={errorMessage(error)}
          />
        </div>
      </PageShell>
    );
  }

  const s = severityOf(incident.severity);
  const findings = incident.findings || [];
  const agentEvents = (incident.events || []).filter((e) => e.event_type === "file_read" || e.event_type === "shell_exec");
  // The backend stores the analysis, so a poll after it arrived still showing no
  // ai_analysis means the incident changed and the backend cleared it. Until that
  // next poll, the local copy is simply newer than the polled data.
  const analysisStale = !incident.ai_analysis && Boolean(localAnalysis) && incident !== localAnalysis.polledAt;
  const analysis = parseAnalysis(incident.ai_analysis || localAnalysis?.text);

  return (
    <PageShell>
      <BackLink />

      {error?.status === 404 && (
        <div role="alert" className="rounded-lg border border-medium/30 bg-medium/5 px-4 py-2 text-sm text-medium">
          This incident no longer exists on the server (database reset). Showing the last loaded copy.
        </div>
      )}

      {/* Hero: gauge + what happened */}
      <section
        className="card flex items-center gap-8 p-6"
        style={{ boxShadow: `inset 0 3px 0 ${s.hex}, var(--shadow-card)` }}
      >
        <div className={scoreChanged ? "score-pop" : ""}>
          <RiskGauge score={incident.risk_score} severity={incident.severity} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={incident.severity} />
            {incident.is_chain && <ChainBadge />}
            <ProviderStatusBadge sanctioned={incident.sanctioned} />
          </div>
          <h1 className="mt-3 text-xl font-semibold leading-7 tracking-tight text-fg">{incident.agent_context}</h1>
          <p className="mt-2 text-sm text-muted">
            <span className="mono text-fg">{incident.source}</span>
            <span className="mx-2 text-subtle">→</span>
            <span className="text-fg">{incident.provider}</span>
            <span className="mx-2 text-subtle">·</span>
            session started {formatDateTime(incident.timestamp)}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <PrivacyBadge />
            <span className="mono text-xs text-subtle">{incident.incident_id}</span>
          </div>
        </div>
      </section>

      {/* Focal row */}
      <section className="grid gap-4 lg:grid-cols-2">
        <ScoreBreakdown incident={incident} newFactors={newFactors} />
        <ChainTimeline incident={incident} newEvents={newEvents} />
      </section>

      <Card
        title="Detected findings"
        subtitle="Redacted evidence only; raw values are never stored. Fingerprints are keyed HMACs."
        icon={Fingerprint}
      >
        {findings.length === 0 && agentEvents.length === 0 ? (
          <EmptyState icon={Fingerprint} title="No findings in this session yet" hint="Agent actions alone can still raise the score." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="eyebrow border-b border-line">
                  <th className="px-6 py-2 font-semibold">Category</th>
                  <th className="px-6 py-2 font-semibold">Rule</th>
                  <th className="px-6 py-2 font-semibold">Redacted evidence</th>
                  <th className="px-6 py-2 font-semibold">Fingerprint</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {findings.map((finding, index) => (
                  <tr key={`${finding.rule}-${finding.event_id}-${index}`}>
                    <td className="px-6 py-3 text-sm text-fg">
                      <span className="inline-flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${CATEGORY_DOT[finding.category] || "bg-subtle"}`} />
                        {finding.category}
                      </span>
                    </td>
                    <td className="mono px-6 py-3 text-xs text-muted">{finding.rule}</td>
                    <td className="mono px-6 py-3 text-xs text-medium">{finding.redacted_evidence}</td>
                    <td className="mono px-6 py-3 text-xs text-subtle">{finding.fingerprint || "—"}</td>
                  </tr>
                ))}
                {/* Agent activity recorded as events (file reads, shell commands): evidence too,
                    though not produced by the payload scanner. */}
                {agentEvents.map((event) => (
                  <tr key={`event-${event.event_id}`}>
                    <td className="px-6 py-3 text-sm text-fg">
                      <span className="inline-flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${CATEGORY_DOT.AgentAction}`} />
                        Agent event
                      </span>
                    </td>
                    <td className="mono px-6 py-3 text-xs text-muted">{event.event_type}</td>
                    <td className="mono px-6 py-3 text-xs text-medium">{event.destination || "—"}</td>
                    <td className="mono px-6 py-3 text-xs text-subtle">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="AI security analysis"
        subtitle="Triage from redacted fields only; payloads never leave this machine"
        icon={Sparkles}
        actions={
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing || offline}
            title={offline ? "Backend offline" : undefined}
            className="inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition-colors duration-150 hover:bg-accent/20 disabled:opacity-50"
          >
            {analyzing ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {analyzing ? "Analyzing…" : analysisStale ? "Re-analyze" : "Analyze with AI"}
          </button>
        }
      >
        {analysisError && (
          <p className="border-b border-critical/30 bg-critical/5 px-6 py-3 text-sm text-critical">{analysisError}</p>
        )}

        {analysis ? (
          <div className="space-y-4 p-6">
            {analysisStale && (
              <p className="rounded-lg border border-medium/30 bg-medium/5 px-3 py-2 text-sm text-medium">
                The incident changed since this analysis. Re-analyze for an up-to-date result.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <p className="eyebrow">Sensitivity</p>
                <p className={`mt-1 text-base font-semibold capitalize ${severityOf(analysis.sensitivity).text}`}>
                  {analysis.sensitivity || "Unknown"}
                </p>
              </div>
              {analysis.engine && (
                <div>
                  <p className="eyebrow">Engine</p>
                  <p className="mono mt-1 inline-flex rounded-md border border-line-strong bg-raised px-2 py-0.5 text-xs text-fg">
                    {analysis.engine}
                  </p>
                </div>
              )}
              <PrivacyBadge className="ml-auto" />
            </div>

            <div>
              <p className="eyebrow">Summary</p>
              <p className="mt-1 text-sm leading-6 text-fg/90">{analysis.summary || "No summary returned."}</p>
            </div>

            <div>
              <p className="eyebrow mb-2">Remediation checklist</p>
              {(analysis.remediation || []).length === 0 ? (
                <p className="text-sm text-subtle">No remediation steps returned.</p>
              ) : (
                <ul className="grid gap-2">
                  {analysis.remediation.map((step, index) => {
                    const Icon = remediationIcon(step);
                    return (
                      <li key={`${index}-${step}`} className="flex items-start gap-3 rounded-lg border border-line bg-raised/50 px-3 py-2 text-sm text-fg">
                        <span className="mt-0.5 rounded-md border border-approved/30 bg-approved/10 p-1 text-approved">
                          <Icon size={14} />
                        </span>
                        <span className="leading-6">{step}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4 p-6">
            <p className="max-w-xl text-sm text-muted">
              Get a sensitivity assessment, summary and remediation checklist. Only the provider, scores, context
              sentence and redacted evidence are sent.
            </p>
            <PrivacyBadge />
          </div>
        )}
      </Card>
    </PageShell>
  );
}
