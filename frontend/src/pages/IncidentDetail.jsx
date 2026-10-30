import { useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Cloud,
  FileText,
  LoaderCircle,
  Sparkles,
  Terminal,
  TriangleAlert
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { analyzeIncident, getIncident } from "../api.js";

const severityStyles = {
  critical: "border-red-400/20 bg-red-400/10 text-red-300",
  high: "border-orange-400/20 bg-orange-400/10 text-orange-300",
  medium: "border-amber-400/20 bg-amber-400/10 text-amber-300",
  low: "border-zinc-600 bg-zinc-800 text-zinc-300"
};

function getEventIcon(eventType) {
  if (eventType === "file_read") {
    return FileText;
  }

  if (eventType === "shell_exec") {
    return Terminal;
  }

  if (eventType === "ai_request" || eventType === "connection") {
    return Cloud;
  }

  return Activity;
}

function formatTimestamp(value) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString();
}

function parseAnalysis(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return {
      sensitivity: "unknown",
      summary: value,
      remediation: []
    };
  }
}

export default function IncidentDetail() {
  const { id } = useParams();
  const [incident, setIncident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadIncident() {
      setLoading(true);
      setError(null);
      setIncident(null);

      try {
        const result = await getIncident(id);

        if (active) {
          setIncident(result);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Unable to load incident"
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadIncident();

    return () => {
      active = false;
    };
  }, [id]);

  async function handleAnalyze() {
    if (!incident || analyzing) {
      return;
    }

    setAnalyzing(true);
    setAnalysisError(null);

    try {
      const result = await analyzeIncident(id);
      setIncident((current) => ({
        ...current,
        ...result
      }));
    } catch (err) {
      setAnalysisError(
        err instanceof Error ? err.message : "AI analysis failed"
      );
    } finally {
      setAnalyzing(false);
    }
  }

  const analysis = parseAnalysis(incident?.ai_analysis);
  const breakdown = incident?.score_breakdown || [];
  const events = incident?.events || [];
  const findings = incident?.findings || [];

  if (loading) {
    return (
      <div className="panel p-10 text-center text-sm text-zinc-400">
        Loading incident details…
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div className="space-y-4">
        <Link
          to="/incidents"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
        >
          <ArrowLeft size={15} />
          Back to incidents
        </Link>

        <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-5 text-sm text-red-300">
          {error || "Incident not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to="/incidents"
        className="inline-flex items-center gap-2 text-xs font-medium text-zinc-400 transition hover:text-cyan-300"
      >
        <ArrowLeft size={14} />
        Back to incidents
      </Link>

      <section className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                severityStyles[incident.severity] || severityStyles.low
              }`}
            >
              {incident.severity}
            </span>

            {incident.is_chain && (
              <span className="rounded-full border border-amber-400/20 bg-amber-400/5 px-2.5 py-1 text-[10px] font-semibold text-amber-300">
                ⛓ EXFILTRATION CHAIN
              </span>
            )}

            <span className="text-[10px] text-zinc-500">
              {incident.sanctioned ? "APPROVED PROVIDER" : "SHADOW PROVIDER"}
            </span>
          </div>

          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
            Incident details
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            {incident.agent_context}
          </p>
          <p className="mono mt-3 break-all text-[10px] text-zinc-600">
            {incident.incident_id}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-5 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">
              Risk score
            </p>
            <p className="mono mt-1 text-3xl font-semibold text-white">
              {incident.risk_score}
              <span className="text-base text-zinc-600">/10</span>
            </p>
          </div>

          <div className="h-11 w-px bg-zinc-800" />

          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">
              Provider
            </p>
            <p className="mt-2 text-sm font-medium text-zinc-200">
              {incident.provider}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="panel overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-4">
            <h2 className="text-sm font-semibold text-zinc-100">
              Explainable risk score
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Factor-by-factor scoring breakdown
            </p>
          </div>

          <div className="divide-y divide-zinc-800">
            {breakdown.map((item, index) => (
              <div
                key={`${item.factor}-${index}`}
                className="flex items-center justify-between gap-4 px-5 py-3.5"
              >
                <span className="text-sm text-zinc-300">
                  {item.factor}
                </span>
                <span className="mono shrink-0 text-sm font-semibold text-amber-300">
                  +{item.points}
                </span>
              </div>
            ))}

            {breakdown.length === 0 && (
              <p className="px-5 py-6 text-sm text-zinc-500">
                No score factors available.
              </p>
            )}

            <div className="flex items-center justify-between bg-zinc-900/70 px-5 py-4">
              <span className="text-sm font-semibold text-zinc-200">
                Total risk score
              </span>
              <span className="mono text-lg font-semibold text-white">
                {incident.risk_score}/10
              </span>
            </div>
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Chain timeline
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Events associated with this incident
              </p>
            </div>
            <Activity size={17} className="text-cyan-300" />
          </div>

          {events.length === 0 ? (
            <p className="p-6 text-sm text-zinc-500">
              No event details are available for this incident.
            </p>
          ) : (
            <div className="p-5">
              <div className="space-y-0">
                {events.map((event, index) => {
                  const Icon = getEventIcon(event.event_type);

                  return (
                    <div key={event.event_id} className="relative flex gap-3 pb-6 last:pb-0">
                      {index < events.length - 1 && (
                        <span className="absolute left-[15px] top-9 h-full w-px bg-zinc-700" />
                      )}

                      <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-400/15 bg-cyan-400/5 text-cyan-300">
                        <Icon size={15} />
                      </div>

                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-zinc-200">
                            {event.event_type}
                          </span>
                          <span className="text-[10px] text-zinc-600">
                            {formatTimestamp(event.timestamp)}
                          </span>
                        </div>

                        <p className="mono mt-1 break-all text-[11px] text-zinc-400">
                          {event.destination || "No destination"}
                        </p>

                        <p className="mt-1 text-[10px] text-zinc-600">
                          {event.source}
                          {event.provider ? ` · ${event.provider}` : ""}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-zinc-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-100">
            Detected findings
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Redacted evidence only; raw values are not displayed.
          </p>
        </div>

        {findings.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">
            No findings are attached to this incident.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left">
              <thead className="bg-zinc-900/70">
                <tr className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Rule</th>
                  <th className="px-5 py-3">Redacted evidence</th>
                  <th className="px-5 py-3">Fingerprint</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-zinc-800">
                {findings.map((finding, index) => (
                  <tr key={`${finding.rule}-${index}`}>
                    <td className="px-5 py-4 text-xs text-zinc-300">
                      {finding.category}
                    </td>
                    <td className="px-5 py-4 text-xs text-zinc-300">
                      {finding.rule}
                    </td>
                    <td className="mono px-5 py-4 text-xs text-amber-200">
                      {finding.redacted_evidence}
                    </td>
                    <td className="mono px-5 py-4 text-[11px] text-zinc-500">
                      {finding.fingerprint || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel overflow-hidden">
        <div className="flex flex-col justify-between gap-4 border-b border-zinc-800 px-5 py-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Sparkles size={17} className="text-cyan-300" />
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                AI security analysis
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Contextual triage using redacted incident information
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-4 py-2.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/15 disabled:opacity-50"
          >
            {analyzing ? (
              <LoaderCircle size={15} className="animate-spin" />
            ) : (
              <Sparkles size={15} />
            )}
            {analyzing ? "Analyzing…" : "Analyze with AI"}
          </button>
        </div>

        {analysisError && (
          <p className="border-b border-red-400/20 bg-red-400/5 px-5 py-3 text-xs text-red-300">
            {analysisError}
          </p>
        )}

        {analysis ? (
          <div className="space-y-4 p-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Sensitivity
              </p>
              <p className="mt-1 text-sm font-medium capitalize text-amber-300">
                {analysis.sensitivity || "Unknown"}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Summary
              </p>
              <p className="mt-1 text-sm leading-6 text-zinc-300">
                {analysis.summary || "No summary returned."}
              </p>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Recommended remediation
              </p>

              {(analysis.remediation || []).length === 0 ? (
                <p className="text-sm text-zinc-500">
                  No remediation steps returned.
                </p>
              ) : (
                <ul className="space-y-2">
                  {analysis.remediation.map((step, index) => (
                    <li
                      key={`${index}-${step}`}
                      className="flex items-start gap-2 text-sm text-zinc-300"
                    >
                      <CheckCircle2
                        size={15}
                        className="mt-0.5 shrink-0 text-emerald-400"
                      />
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
          <div className="flex items-start gap-3 p-5">
            <TriangleAlert
              size={17}
              className="mt-0.5 shrink-0 text-zinc-500"
            />
            <p className="text-xs leading-5 text-zinc-500">
              Run AI analysis to receive a sensitivity assessment, incident
              summary, and remediation suggestions. Only redacted evidence
              should be sent to the analysis provider.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}