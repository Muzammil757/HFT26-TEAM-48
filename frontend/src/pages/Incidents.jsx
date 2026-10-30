import { useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, CircleAlert, Filter, ListFilter, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { getIncidents } from "../api.js";
import usePolling from "../hooks/usePolling.js";
import {
  Card,
  ChainBadge,
  CountUp,
  EmptyState,
  PageHeader,
  PageShell,
  ProviderStatusBadge,
  ScoreMeter,
  SeverityBadge,
  Skeleton,
  formatDateTime,
  severityOf,
  useHighlights,
} from "../components/ui.jsx";

// Incidents are only created at score >= 3, so "low" never occurs.
const SEVERITIES = ["critical", "high", "medium"];

export default function Incidents() {
  const { data: incidents, error } = usePolling(getIncidents, 3000, "incidents");
  const [severityFilter, setSeverityFilter] = useState("all");

  const highlighted = useHighlights(
    incidents,
    (incident) => incident.incident_id,
    (incident) => incident.risk_score,
  );

  const filteredIncidents = useMemo(() => {
    const rows = incidents || [];
    return severityFilter === "all" ? rows : rows.filter((incident) => incident.severity === severityFilter);
  }, [incidents, severityFilter]);

  const toggleFilter = (severity) => setSeverityFilter((current) => (current === severity ? "all" : severity));

  return (
    <PageShell>
      <PageHeader
        title="Security Incidents"
        subtitle="Correlated sessions with explainable risk scores"
        actions={
          <label className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-muted">
            <Filter size={14} />
            Severity
            <select
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value)}
              className="bg-transparent font-medium text-fg outline-none"
            >
              <option value="all" className="bg-card">All</option>
              {SEVERITIES.map((severity) => (
                <option key={severity} value={severity} className="bg-card">
                  {severityOf(severity).label}
                </option>
              ))}
            </select>
          </label>
        }
      />

      <section className="grid grid-cols-3 gap-4">
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
              className={`card flex h-24 items-center justify-between px-6 text-left transition-colors duration-150 hover:border-line-strong ${
                selected ? "!border-accent/50" : ""
              }`}
              style={{ boxShadow: `inset 3px 0 0 ${count ? s.hex : "transparent"}, var(--shadow-card)` }}
            >
              <div>
                <p className="eyebrow">{s.label}</p>
                <div className={`mt-1 h-9 text-title font-semibold ${count ? s.text : "text-subtle"}`}>
                  {incidents == null ? <Skeleton className="h-8 w-10" /> : <CountUp value={count} />}
                </div>
              </div>
              <span className={`text-xs ${selected ? "text-accent" : "text-subtle"}`}>
                {selected ? "Filtering" : "Click to filter"}
              </span>
            </button>
          );
        })}
      </section>

      <Card
        title="Incident queue"
        subtitle={`${filteredIncidents.length} matching incident${filteredIncidents.length === 1 ? "" : "s"} · newest first`}
        icon={ListFilter}
      >
        {!incidents ? (
          error ? (
            <EmptyState icon={CircleAlert} title="Waiting for the backend" hint={error.message || String(error)} />
          ) : (
            <div className="divide-y divide-line">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4">
                  <Skeleton className="h-8 w-8" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          )
        ) : filteredIncidents.length === 0 ? (
          <EmptyState
            icon={incidents.length ? ListFilter : ShieldCheck}
            title={incidents.length ? "No incidents match this filter" : "No incidents yet"}
            hint={incidents.length ? "Clear the severity filter to see all incidents." : "Load demo data or run demo_agent.py."}
          />
        ) : (
          <div className="divide-y divide-line">
            {filteredIncidents.map((incident) => {
              const s = severityOf(incident.severity);
              const flash = highlighted.has(incident.incident_id);
              return (
                <Link
                  key={incident.incident_id}
                  to={`/incidents/${encodeURIComponent(incident.incident_id)}`}
                  className={`group flex items-center gap-4 px-6 py-4 transition-colors duration-150 hover:bg-white/[0.02] ${flash ? "flash" : ""}`}
                >
                  <span className={`rounded-lg border p-2 ${s.icon}`}>
                    <AlertTriangle size={16} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={incident.severity} />
                      {incident.is_chain && <ChainBadge />}
                      <ProviderStatusBadge sanctioned={incident.sanctioned} />
                    </div>
                    <p className="mt-1 truncate text-sm font-medium text-fg group-hover:text-accent">
                      {incident.agent_context}
                    </p>
                    <p className="truncate text-xs text-subtle">
                      <span className="mono text-muted">{incident.source}</span>
                      <span className="mx-1">→</span>
                      {incident.provider}
                      <span className="mx-2">·</span>
                      {formatDateTime(incident.timestamp)}
                      <span className="mx-2">·</span>
                      <span className="mono">{String(incident.incident_id).slice(0, 8)}</span>
                    </p>
                  </div>

                  <div className="w-24 shrink-0 text-right">
                    <p className={`mono text-xl font-semibold ${s.text}`}>
                      <span key={incident.risk_score} className={flash ? "score-pop" : ""}>
                        {incident.risk_score}
                      </span>
                      <span className="text-sm font-normal text-subtle">/10</span>
                    </p>
                    <ScoreMeter score={incident.risk_score} severity={incident.severity} className="mt-1" />
                  </div>

                  <ArrowUpRight size={16} className="shrink-0 text-subtle group-hover:text-accent" />
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </PageShell>
  );
}
