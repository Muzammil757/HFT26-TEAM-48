import { useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, Filter, Link2 } from "lucide-react";
import { Link } from "react-router-dom";
import { getIncidents } from "../api.js";
import usePolling from "../hooks/usePolling.js";

const severityStyles = {
  critical: "border-red-400/20 bg-red-400/10 text-red-300",
  high: "border-orange-400/20 bg-orange-400/10 text-orange-300",
  medium: "border-amber-400/20 bg-amber-400/10 text-amber-300",
  low: "border-zinc-600 bg-zinc-800 text-zinc-300"
};

export default function Incidents() {
  const { data: incidents, error, loading } = usePolling(
    getIncidents,
    3000
  );
  const [severityFilter, setSeverityFilter] = useState("all");

  const filteredIncidents = useMemo(() => {
    const rows = incidents || [];

    if (severityFilter === "all") {
      return rows;
    }

    return rows.filter(
      (incident) => incident.severity === severityFilter
    );
  }, [incidents, severityFilter]);

  function formatTimestamp(value) {
    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString();
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
            Threat detection
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Security Incidents
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Review correlated findings, explainable risk scores, and
            agent-related activity.
          </p>
        </div>

        <label className="flex w-fit items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
          <Filter size={14} />
          <span>Severity</span>
          <select
            value={severityFilter}
            onChange={(event) => setSeverityFilter(event.target.value)}
            className="bg-transparent text-zinc-200 outline-none"
          >
            <option value="all" className="bg-zinc-900">
              All
            </option>
            <option value="critical" className="bg-zinc-900">
              Critical
            </option>
            <option value="high" className="bg-zinc-900">
              High
            </option>
            <option value="medium" className="bg-zinc-900">
              Medium
            </option>
            <option value="low" className="bg-zinc-900">
              Low
            </option>
          </select>
        </label>
      </section>

      {error && (
        <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-300">
          Could not load incidents: {error}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        {["critical", "high", "medium"].map((severity) => (
          <div className="panel p-5" key={severity}>
            <p className="text-xs capitalize text-zinc-500">
              {severity} severity
            </p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {(incidents || []).filter(
                (incident) => incident.severity === severity
              ).length}
            </p>
          </div>
        ))}
      </section>

      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">
              Incident queue
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              {filteredIncidents.length} matching incident
              {filteredIncidents.length === 1 ? "" : "s"}
            </p>
          </div>
          <span className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-400">
            AUTO-REFRESH · 3S
          </span>
        </div>

        {loading && !incidents ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            Loading incidents…
          </div>
        ) : filteredIncidents.length === 0 ? (
          <div className="p-10 text-center">
            <AlertTriangle size={25} className="mx-auto text-zinc-600" />
            <p className="mt-3 text-sm text-zinc-400">
              No incidents match this filter.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {filteredIncidents.map((incident) => (
              <Link
                key={incident.incident_id}
                to={`/incidents/${incident.incident_id}`}
                className="flex flex-col gap-4 px-5 py-5 transition hover:bg-zinc-900/60 lg:flex-row lg:items-center"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div
                    className={`mt-0.5 rounded-lg border p-2 ${
                      severityStyles[incident.severity] ||
                      severityStyles.low
                    }`}
                  >
                    <AlertTriangle size={17} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                          severityStyles[incident.severity] ||
                          severityStyles.low
                        }`}
                      >
                        {incident.severity}
                      </span>

                      {incident.is_chain && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/5 px-2 py-1 text-[10px] font-medium text-amber-300">
                          <Link2 size={11} />
                          Exfiltration chain
                        </span>
                      )}
                    </div>

                    <p className="mt-2 text-sm font-medium leading-6 text-zinc-200">
                      {incident.agent_context}
                    </p>

                    <p className="mt-1 text-xs text-zinc-500">
                      <span className="mono">{incident.source}</span>
                      <span className="mx-2 text-zinc-700">→</span>
                      {incident.provider}
                      <span className="mx-2 text-zinc-700">·</span>
                      {formatTimestamp(incident.timestamp)}
                    </p>

                    <p className="mono mt-2 truncate text-[10px] text-zinc-600">
                      {incident.incident_id}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center justify-between gap-5 border-t border-zinc-800 pt-3 lg:border-0 lg:pt-0">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                      Risk score
                    </p>
                    <p className="mono mt-1 text-xl font-semibold text-white">
                      {incident.risk_score}
                      <span className="text-sm text-zinc-600">/10</span>
                    </p>
                  </div>

                  <ArrowUpRight
                    size={17}
                    className="text-zinc-500"
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}