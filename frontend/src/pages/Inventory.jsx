import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Activity, Boxes, CircleAlert, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { getStats } from "../api.js";
import { providerRows } from "../components/overview/ProviderUsageCard.jsx";
import { ApprovalLabel, ProviderName } from "../components/ui/Badges.jsx";
import Card from "../components/ui/Card.jsx";
import { ClearFiltersButton, SearchInput, Segmented, SortHeader, Toolbar } from "../components/ui/Controls.jsx";
import CountUp from "../components/ui/CountUp.jsx";
import { PageHeader, PageShell } from "../components/ui/Page.jsx";
import { EmptyState, Skeleton, TableSkeleton } from "../components/ui/States.jsx";
import usePolling, { useLastRefreshed } from "../hooks/usePolling.js";
import { formatDateTime, formatNumber, plural, relativeTime } from "../lib/format.js";

function Metric({ label, value, icon: Icon, tone, loading, hint }) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-4 py-3" title={hint}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${tone}`}>
        <Icon size={15} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted">{label}</p>
        <div className="h-7 text-xl font-semibold text-fg">{loading ? <Skeleton className="mt-1 h-5 w-12" /> : <CountUp value={value} />}</div>
      </div>
    </div>
  );
}

export default function Inventory() {
  const { data: stats, error } = usePolling(getStats, 3000, "stats");
  const [params, setParams] = useSearchParams();
  const query = params.get("q") || "";
  const view = params.get("view") === "shadow" ? "shadow" : "all";
  const sort = ["requests-desc", "requests-asc"].includes(params.get("sort")) ? params.get("sort") : "default";

  // Functional update: always apply changes to the latest URL, never a stale copy.
  const update = (changes) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (!value || value === "all" || value === "default") next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  const filtersActive = Boolean(query.trim()) || view !== "all" || sort !== "default";

  const inventory = useMemo(
    () =>
      (Array.isArray(stats?.inventory) ? stats.inventory : []).map((item) => ({
        source: item.source || "Unknown process",
        provider: item.provider || "Unknown provider",
        sanctioned: item.sanctioned === true,
        requests: Number(item.requests) || 0,
        last_seen: item.last_seen || null,
      })),
    [stats],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = inventory.filter(
      (item) =>
        (!q || item.source.toLowerCase().includes(q) || item.provider.toLowerCase().includes(q)) &&
        (view === "all" || !item.sanctioned),
    );
    return filtered.sort((a, b) => {
      if (sort === "requests-desc") return b.requests - a.requests;
      if (sort === "requests-asc") return a.requests - b.requests;
      // Default: shadow first, then busiest.
      return a.sanctioned !== b.sanctioned ? Number(a.sanctioned) - Number(b.sanctioned) : b.requests - a.requests;
    });
  }, [inventory, query, view, sort]);

  // Summary metrics from stats.by_provider (per-provider totals).
  const providers = useMemo(() => providerRows(stats?.by_provider), [stats]);
  const shadowProviders = providers.filter((p) => p.shadow > 0).length;
  const totalRequests = providers.reduce((sum, p) => sum + p.approved + p.shadow, 0);
  const loading = stats == null && !error;
  // "Last seen" is relative to the latest poll (the moment this data arrived).
  const now = useLastRefreshed() ?? undefined;

  return (
    <PageShell>
      <PageHeader
        title="AI Inventory"
        subtitle="Discover AI providers and understand where AI usage originates."
      />

      <section className="card grid grid-cols-2 divide-line xl:grid-cols-4 xl:divide-x [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-line xl:[&>*:nth-child(-n+2)]:border-b-0">
        <Metric label="Detected providers" value={providers.length} icon={Boxes} tone="border-line bg-sunken text-muted" loading={loading} />
        <Metric label="Approved providers" value={providers.length - shadowProviders} icon={ShieldCheck} tone="border-approved-line bg-approved-soft text-approved" loading={loading} />
        <Metric label="Shadow providers" value={shadowProviders} icon={ShieldAlert} tone="border-shadow-line bg-shadow-soft text-shadow" loading={loading} />
        <Metric
          label="Total recorded requests"
          value={totalRequests}
          icon={Activity}
          tone="border-[#d5e0ee] bg-accent-soft text-accent"
          loading={loading}
          hint="AI requests and connections attributed to a provider"
        />
      </section>

      <Card
        title="Process → provider inventory"
        subtitle="Built from connection metadata and request logs · no TLS decryption"
        icon={Boxes}
      >
        <Toolbar trailing={stats != null && <span>{plural(rows.length, "row")} of {inventory.length}</span>}>
          <SearchInput value={query} onChange={(value) => update({ q: value })} placeholder="Search process or provider" className="w-72" />
          <Segmented
            label="Provider status"
            value={view}
            onChange={(value) => update({ view: value })}
            options={[
              { value: "all", label: "All providers" },
              { value: "shadow", label: "Shadow only", icon: ShieldAlert },
            ]}
          />
          <ClearFiltersButton onClick={() => update({ q: "", view: "all", sort: "default" })} disabled={!filtersActive} />
        </Toolbar>

        {stats == null ? (
          error ? (
            <EmptyState icon={CircleAlert} title="Waiting for the backend" hint="The inventory loads automatically once the API is reachable." />
          ) : (
            <TableSkeleton rows={6} cols={5} />
          )
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Search}
            title={inventory.length ? "No rows match these filters" : "No AI traffic detected yet"}
            hint={
              inventory.length
                ? "Adjust or clear the filters."
                : "The inventory fills in as connections and request logs are collected."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[720px]">
              <thead>
                <tr>
                  <th>Process / Source</th>
                  <th>AI Provider</th>
                  <th>Approval Status</th>
                  <SortHeader
                    align="right"
                    direction={sort === "requests-desc" ? "desc" : sort === "requests-asc" ? "asc" : null}
                    onClick={() => update({ sort: sort === "requests-desc" ? "requests-asc" : "requests-desc" })}
                    title="Sort by requests"
                  >
                    Requests
                  </SortHeader>
                  <th className="text-right">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={`${item.source}|${item.provider}`} style={item.sanctioned ? undefined : { boxShadow: "inset 3px 0 0 #b42318" }}>
                    <td className="max-w-[280px]">
                      <span title={item.source} className="mono block truncate text-[13px] font-medium text-fg">
                        {item.source}
                      </span>
                    </td>
                    <td>
                      <ProviderName provider={item.provider} />
                    </td>
                    <td>
                      <ApprovalLabel sanctioned={item.sanctioned} />
                    </td>
                    <td className="mono text-right text-fg">{formatNumber(item.requests)}</td>
                    <td className="whitespace-nowrap text-right">
                      <span className="text-xs text-fg">{relativeTime(item.last_seen, now)}</span>
                      <span className="block text-2xs text-muted">{item.last_seen ? formatDateTime(item.last_seen) : "—"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageShell>
  );
}
