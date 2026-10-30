import { useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, Filter } from "lucide-react";
import { Link } from "react-router-dom";
import { getIncidents } from "../api.js";
import usePolling from "../hooks/usePolling.js";
import {
  ChainBadge,
  LivePill,
  PageHeader,
  PageShell,
  ProviderStatusBadge,
  ScoreMeter,
  SeverityBadge,
  formatDateTime,
  severityOf,
  useHighlights,
} from "../components/ui.jsx";

// Incidents are only created at score >= 3, so "low" never occurs.
const SEVERITIES = ["critical", "high", "medium"];

export default function Incidents() {
  const { data: incidents, error, loading } = usePolling(getIncidents, 3000);
  const [severityFilter, setSeverityFilter] = useState("all");

  const highlighted = useHighlights(
    incidents,
    (incident) => incident.incident_id,
    (incident) => incident.risk_score,
  );

  const filteredIncidents = useMemo(() => {
    const rows = incidents || [];
    return severityFilter === "all"
      ? rows
      : rows.filter((incident) => incident.severity === severityFilter);
  }, [incidents, severityFilter]);

  const toggleFilter = (severity) =>
    setSeverityFilter((current) => (current === severity ? "all" : severity));

  return (
    <PageShell>
      <PageHeader
        icon={AlertTriangle}
        title="Security Incidents"
        subtitle="Correlated findings with explainable risk scores and agent activity"
        actions={
          <>
            <label className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400">
              <Filter size={14} />
              <span>Severity</span>
              <select
                value={severityFilter}
                onChange={(event) => setSeverityFilter(event.target.value)}
                className="bg-transparent text-zinc-200 outline-none"
              >
                <option value="all" className="bg-zinc-900">All</option>
                {SEVERITIES.map((severity) => (
                  <option key={severity} value={severity} className="bg-zinc-900">
                    {severityOf(severity).label}
                  </option>
                ))}
              </select>
            </label>
            <LivePill />
          </>
        }
      />

      {error && incidents == null && (
        <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300">
          Could not load incidents: {error.message || String(error)}
        </div>
      )}

      <section className="grid grid-cols-3 gap-3">
        {SEVERITIES.map((severity) => {
          const s = severityOf(severity);
          const count = (incidents || []).filter((incident) => incident.severity === severity).length;
          const selected = severityFilter === severity;
          return (
            <button
              type="button"
              key={severity}
              onClick={() => toggleFilter(severity)}
              aria-pressed={selected}
              className={`panel flex items-center justify-between p-4 text-left transition hover:border-zinc-600 ${
                selected ? "!border-cyan-400/40" : ""
              }`}
            >
              <div>
                <p className="text-xs font-medium text-zinc-400">{s.label} severity</p>
                <p className={`tabular mt-1 text-2xl font-semibold ${count ? s.text : "text-zinc-600"}`}>
                  {incidents == null ? "—" : count}
                </p>
              </div>
              <span className={`h-8 w-1 rounded-full ${s.bar} ${count ? "" : "opacity-20"}`} />
            </button>
          );
        })}
      </section>

      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Incident queue</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {filteredIncidents.length} matching incident
              {filteredIncidents.length === 1 ? "" : "s"} · newest first
            </p>
          </div>
        </div>

        {!incidents ? (
          <div className="p-10 text-center text-sm text-zinc-500">
            {loading ? "Loading incidents…" : "Waiting for the backend…"}
          </div>
        ) : filteredIncidents.length === 0 ? (
          <div className="p-10 text-center">
            <AlertTriangle size={24} className="mx-auto text-zinc-600" />
            <p className="mt-3 text-sm text-zinc-400">
              {incidents?.length ? "No incidents match this filter." : "No incidents yet."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {filteredIncidents.map((incident) => {
              const s = severityOf(incident.severity);
              const flash = highlighted.has(incident.incident_id);
              return (
                <Link
                  key={incident.incident_id}
                  to={`/incidents/${encodeURIComponent(incident.incident_id)}`}
                  className={`group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-zinc-800/40 ${flash ? "flash" : ""}`}
                >
                  <div className={`rounded-lg border p-2 ${s.icon}`}>
                    <AlertTriangle size={16} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={incident.severity} />
                      {incident.is_chain && <ChainBadge />}
                      <ProviderStatusBadge sanctioned={incident.sanctioned} />
                    </div>

                    <p className="mt-1.5 truncate text-sm font-medium text-zinc-200 group-hover:text-cyan-300">
                      {incident.agent_context}
                    </p>

                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      <span className="mono text-zinc-400">{incident.source}</span>
                      <span className="mx-1.5 text-zinc-600">→</span>
                      {incident.provider}
                      <span className="mx-1.5 text-zinc-700">·</span>
                      {formatDateTime(incident.timestamp)}
                      <span className="mx-1.5 text-zinc-700">·</span>
                      <span className="mono text-zinc-600">{String(incident.incident_id).slice(0, 8)}</span>
                    </p>
                  </div>

                  <div className="w-24 shrink-0 text-right">
                    <p className={`mono text-xl font-semibold ${s.text}`}>
                      <span key={incident.risk_score} className={flash ? "score-pop" : ""}>
                        {incident.risk_score}
                      </span>
                      <span className="text-sm text-zinc-600">/10</span>
                    </p>
                    <ScoreMeter score={incident.risk_score} severity={incident.severity} className="mt-1" />
                  </div>

                  <ArrowUpRight size={16} className="shrink-0 text-zinc-600 group-hover:text-cyan-400" />
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </PageShell>
  );
}
