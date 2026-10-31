import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { CircleAlert, ListFilter, ShieldCheck, Siren } from "lucide-react";
import { getIncidents } from "../api.js";
import IncidentsTable from "../components/incidents/IncidentsTable.jsx";
import Card from "../components/ui/Card.jsx";
import { ClearFiltersButton, SearchInput, Segmented, SelectFilter, Toolbar } from "../components/ui/Controls.jsx";
import { PageHeader, PageShell } from "../components/ui/Page.jsx";
import { ReplayBanner, ReplayButton, useReplayAgent } from "../components/demo/ReplayAgent.jsx";
import { EmptyState, TableSkeleton } from "../components/ui/States.jsx";
import useHighlights from "../hooks/useHighlights.js";
import usePolling from "../hooks/usePolling.js";
import { plural } from "../lib/format.js";
import { severityOf } from "../lib/theme.js";

// Incidents are only created at score >= 3, so "low" never occurs.
const SEVERITIES = ["critical", "high", "medium"];
const APPROVALS = ["approved", "shadow"];
const CHAINS = ["chain", "no-chain"];
const SORTS = ["recent", "score"];
const FILTER_KEYS = ["q", "severity", "provider", "approval", "chain"];

/** All filter state lives in the URL so it survives opening an incident and coming back. */
function useIncidentFilters() {
  const [params, setParams] = useSearchParams();
  const pick = (key, allowed) => (allowed.includes(params.get(key)) ? params.get(key) : "all");
  const filters = {
    q: params.get("q") || "",
    severity: pick("severity", SEVERITIES),
    provider: params.get("provider") || "all",
    approval: pick("approval", APPROVALS),
    chain: pick("chain", CHAINS),
    sort: SORTS.includes(params.get("sort")) ? params.get("sort") : "recent",
    dir: params.get("dir") === "asc" ? "asc" : "desc",
  };

  // Functional updates: always apply changes to the latest URL, never a stale copy.
  const update = (changes) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          const isDefault = value === "" || value === "all" || (key === "sort" && value === "recent") || (key === "dir" && value === "desc");
          if (isDefault) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );

  const clear = () =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const key of FILTER_KEYS) next.delete(key);
        return next;
      },
      { replace: true },
    );

  const active = FILTER_KEYS.some((key) => (key === "q" ? filters.q.trim() : filters[key] !== "all"));
  return { filters, update, clear, active, search: params.toString() };
}

export default function Incidents() {
  const { data: incidents, error } = usePolling(getIncidents, 3000, "incidents");
  const { filters, update, clear, active, search } = useIncidentFilters();
  const replay = useReplayAgent();

  // Remember the query for the detail page's "Back to incidents" link.
  useEffect(() => {
    try {
      sessionStorage.setItem("sg.incidentsSearch", search ? `?${search}` : "");
    } catch {
      // Storage unavailable (private mode); the filters just won't be restored.
    }
  }, [search]);

  const highlighted = useHighlights(
    incidents,
    (incident) => incident.incident_id,
    (incident) => incident.risk_score,
  );

  const all = useMemo(() => (Array.isArray(incidents) ? incidents : []), [incidents]);
  const providers = useMemo(() => [...new Set(all.map((i) => i.provider).filter(Boolean))].sort(), [all]);

  const rows = useMemo(() => {
    const query = filters.q.trim().toLowerCase();
    const filtered = all.filter(
      (i) =>
        (!query ||
          [i.agent_context, i.source, i.provider, i.incident_id].some((v) => String(v || "").toLowerCase().includes(query))) &&
        (filters.severity === "all" || String(i.severity).toLowerCase() === filters.severity) &&
        (filters.provider === "all" || i.provider === filters.provider) &&
        (filters.approval === "all" || (filters.approval === "approved" ? i.sanctioned === true : i.sanctioned === false)) &&
        (filters.chain === "all" || (filters.chain === "chain" ? i.is_chain : !i.is_chain)),
    );
    const time = (i) => new Date(i.timestamp).getTime() || 0;
    const sign = filters.dir === "asc" ? -1 : 1;
    return filtered.sort((a, b) =>
      filters.sort === "score"
        ? sign * ((Number(b.risk_score) || 0) - (Number(a.risk_score) || 0)) || time(b) - time(a)
        : sign * (time(b) - time(a)),
    );
  }, [all, filters.q, filters.severity, filters.provider, filters.approval, filters.chain, filters.sort, filters.dir]);

  // Clicking the active sort header flips its direction; another header switches to it (descending).
  const onSort = (key) =>
    update(key === filters.sort ? { dir: filters.dir === "desc" ? "asc" : "desc" } : { sort: key, dir: "desc" });

  const counts = Object.fromEntries(SEVERITIES.map((sev) => [sev, all.filter((i) => String(i.severity).toLowerCase() === sev).length]));

  return (
    <PageShell>
      <PageHeader
        title="Incidents"
        subtitle="Investigate suspicious AI usage and potential data-exfiltration activity."
        actions={
          <>
          {incidents != null && (
            <div className="flex items-center gap-1.5" role="group" aria-label="Filter by severity">
              {SEVERITIES.map((sev) => {
                const s = severityOf(sev);
                const selected = filters.severity === sev;
                return (
                  <button
                    key={sev}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => update({ severity: selected ? "all" : sev })}
                    className={`inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-[13px] transition-colors duration-150 ${
                      selected ? `${s.badge} font-semibold` : "border-line-strong bg-card text-muted hover:bg-hover"
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden="true" />
                    {s.label}
                    <span className="mono font-semibold text-fg">{counts[sev]}</span>
                  </button>
                );
              })}
            </div>
          )}
          <ReplayButton replay={replay} />
          </>
        }
      />
      <ReplayBanner replay={replay} />

      <Card
        title="Incident queue"
        subtitle={
          incidents == null
            ? "Correlated sessions with explainable risk scores"
            : `${plural(rows.length, "incident")}${active ? ` of ${all.length}` : ""} · ${
                filters.sort === "score" ? "by risk score" : "most recent"
              } ${filters.dir === "asc" ? "(ascending)" : "first"}`
        }
        icon={Siren}
        actions={
          <>
            <span className="text-xs text-muted">Sort by</span>
            <Segmented
              label="Sort incidents"
              value={filters.sort}
              onChange={(value) => update({ sort: value, dir: "desc" })}
              options={[
                { value: "recent", label: "Most recent" },
                { value: "score", label: "Risk score" },
              ]}
            />
          </>
        }
      >
        <Toolbar>
          <SearchInput
            value={filters.q}
            onChange={(value) => update({ q: value })}
            placeholder="Search incidents"
            label="Search by context, source, provider or ID"
            className="w-56"
          />
          <SelectFilter
            label="Severity"
            value={filters.severity}
            onChange={(value) => update({ severity: value })}
            options={[{ value: "all", label: "All" }, ...SEVERITIES.map((sev) => ({ value: sev, label: severityOf(sev).label }))]}
          />
          <SelectFilter
            label="Provider"
            value={filters.provider}
            onChange={(value) => update({ provider: value })}
            options={[
              { value: "all", label: "All" },
              ...providers.map((p) => ({ value: p, label: p })),
              ...(filters.provider !== "all" && !providers.includes(filters.provider)
                ? [{ value: filters.provider, label: filters.provider }]
                : []),
            ]}
          />
          <SelectFilter
            label="Approval"
            value={filters.approval}
            onChange={(value) => update({ approval: value })}
            options={[
              { value: "all", label: "All" },
              { value: "approved", label: "Approved" },
              { value: "shadow", label: "Shadow" },
            ]}
          />
          <SelectFilter
            label="Chain"
            value={filters.chain}
            onChange={(value) => update({ chain: value })}
            options={[
              { value: "all", label: "All" },
              { value: "chain", label: "Chains only" },
              { value: "no-chain", label: "No chain" },
            ]}
          />
          <ClearFiltersButton onClick={clear} disabled={!active} />
        </Toolbar>

        {incidents == null ? (
          error ? (
            <EmptyState icon={CircleAlert} title="Waiting for the backend" hint="Incidents load automatically once the API is reachable." />
          ) : (
            <TableSkeleton rows={6} cols={7} />
          )
        ) : rows.length === 0 ? (
          <EmptyState
            icon={all.length ? ListFilter : ShieldCheck}
            title={all.length ? "No incidents match these filters" : "No incidents detected"}
            hint={all.length ? "Adjust or clear the filters to see more incidents." : "Load demo data or run demo_agent.py."}
            action={all.length > 0 && active && <ClearFiltersButton onClick={clear} />}
          />
        ) : (
          <IncidentsTable incidents={rows} highlighted={highlighted} sort={{ key: filters.sort, dir: filters.dir }} onSort={onSort} />
        )}
      </Card>
    </PageShell>
  );
}
