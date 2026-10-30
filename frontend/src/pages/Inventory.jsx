import { useMemo, useState } from "react";
import { Activity, Clock3, Network, Search, ShieldCheck, ShieldOff, Waypoints } from "lucide-react";
import { getStats } from "../api";
import usePolling from "../hooks/usePolling";
import {
  Card,
  CountUp,
  EmptyState,
  PageHeader,
  PageShell,
  ProviderChip,
  ProviderStatusBadge,
  Skeleton,
  formatNumber,
} from "../components/ui.jsx";

function relativeTime(value) {
  if (!value) return "Never";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "Unknown";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function SummaryCard({ label, value, hint, icon: Icon, tone, loading }) {
  return (
    <div className="card flex h-24 min-w-0 items-center gap-4 px-6" title={hint}>
      <span className={`rounded-lg border p-2 ${tone}`}>
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <p className="eyebrow">{label}</p>
        <div className="mt-1 h-9 text-title font-semibold text-fg">
          {loading ? <Skeleton className="h-8 w-12" /> : <CountUp value={value} />}
        </div>
      </div>
    </div>
  );
}

export default function Inventory() {
  const { data: stats, error } = usePolling(getStats, 3000, "stats");
  const [search, setSearch] = useState("");
  const [shadowOnly, setShadowOnly] = useState(false);

  const inventory = useMemo(() => {
    if (!Array.isArray(stats?.inventory)) return [];
    return stats.inventory
      .map((item) => ({
        source: item.source || "Unknown process",
        provider: item.provider || "Unknown provider",
        sanctioned: item.sanctioned === true,
        requests: Number(item.requests) || 0,
        last_seen: item.last_seen || null,
      }))
      .sort((a, b) => (a.sanctioned !== b.sanctioned ? Number(a.sanctioned) - Number(b.sanctioned) : b.requests - a.requests));
  }, [stats]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return inventory.filter(
      (item) =>
        (item.source.toLowerCase().includes(query) || item.provider.toLowerCase().includes(query)) &&
        (!shadowOnly || !item.sanctioned),
    );
  }, [inventory, search, shadowOnly]);

  // Cards count unique process names; one process can use several providers.
  const processes = new Set(inventory.map((item) => item.source));
  const shadowProcesses = new Set(inventory.filter((item) => !item.sanctioned).map((item) => item.source));
  const approvedOnly = [...processes].filter((source) => !shadowProcesses.has(source));
  const loading = stats == null;

  return (
    <PageShell>
      <PageHeader
        title="Shadow AI Inventory"
        subtitle="Which local processes talk to which AI providers, learned from connection metadata only"
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <SummaryCard
          label="Processes"
          value={processes.size}
          hint="Unique process names seen talking to an AI provider"
          icon={Activity}
          tone="border-accent/30 bg-accent/10 text-accent"
          loading={loading}
        />
        <SummaryCard
          label="Using shadow AI"
          value={shadowProcesses.size}
          hint="Processes that used at least one unapproved provider"
          icon={ShieldOff}
          tone="border-shadow/30 bg-shadow/10 text-shadow"
          loading={loading}
        />
        <SummaryCard
          label="Approved only"
          value={approvedOnly.length}
          hint="Processes that only used approved providers"
          icon={ShieldCheck}
          tone="border-approved/30 bg-approved/10 text-approved"
          loading={loading}
        />
        <SummaryCard
          label="Pairs"
          value={inventory.length}
          hint="Rows in the table below"
          icon={Waypoints}
          tone="border-line-strong bg-raised text-muted"
          loading={loading}
        />
      </div>

      <Card
        title="Process → provider"
        subtitle={`Showing ${filtered.length} of ${inventory.length} pairs · shadow first`}
        icon={Network}
        actions={
          <div className="flex items-center gap-2">
            <label className="relative block w-56">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search…"
                aria-label="Search by process or provider"
                className="w-full rounded-lg border border-line bg-bg py-1.5 pl-9 pr-3 text-sm text-fg outline-none placeholder:text-subtle focus:border-accent/60"
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-bg px-3 py-1.5 text-sm text-muted transition-colors duration-150 hover:border-line-strong">
              <input
                type="checkbox"
                checked={shadowOnly}
                onChange={(event) => setShadowOnly(event.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--color-shadow)]"
              />
              Shadow only
            </label>
          </div>
        }
      >
        {loading ? (
          error ? (
            <EmptyState icon={Network} title="Waiting for the backend" hint={error.message || String(error)} />
          ) : (
            <div className="divide-y divide-line">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="flex items-center gap-6 px-6 py-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-6 w-28" />
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="ml-auto h-4 w-12" />
                </div>
              ))}
            </div>
          )
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title={search.trim() ? "No processes match your search" : shadowOnly ? "No shadow AI detected" : "No AI traffic detected yet"}
            hint="The inventory updates automatically as connections and requests are collected."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left">
              <thead>
                <tr className="eyebrow border-b border-line">
                  <th className="px-6 py-2 font-semibold">Process</th>
                  <th className="px-6 py-2 font-semibold">Provider</th>
                  <th className="px-6 py-2 font-semibold">Status</th>
                  <th className="px-6 py-2 text-right font-semibold">Requests</th>
                  <th className="px-6 py-2 text-right font-semibold">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 size={12} /> Last seen
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((item) => (
                  <tr
                    key={`${item.source}-${item.provider}`}
                    className="transition-colors duration-150 hover:bg-white/[0.02]"
                    style={item.sanctioned ? undefined : { boxShadow: "inset 2px 0 0 var(--color-shadow)" }}
                  >
                    <td className="max-w-[260px] px-6 py-3">
                      <p title={item.source} className="mono truncate text-sm font-medium text-fg">
                        {item.source}
                      </p>
                    </td>
                    <td className="px-6 py-3">
                      <ProviderChip provider={item.provider} sanctioned={item.sanctioned} />
                    </td>
                    <td className="px-6 py-3">
                      <ProviderStatusBadge sanctioned={item.sanctioned} />
                    </td>
                    <td className="mono px-6 py-3 text-right text-sm text-fg">{formatNumber(item.requests)}</td>
                    <td className="px-6 py-3 text-right">
                      <span
                        title={item.last_seen ? new Date(item.last_seen).toLocaleString() : "No activity recorded"}
                        className="whitespace-nowrap text-xs text-muted"
                      >
                        {relativeTime(item.last_seen)}
                      </span>
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
