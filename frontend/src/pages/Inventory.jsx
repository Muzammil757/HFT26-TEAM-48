
import { useMemo, useState } from "react";
import {
  Activity,
  Clock3,
  Search,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
} from "lucide-react";
import { getStats } from "../api";
import usePolling from "../hooks/usePolling";

function formatNumber(value) {
  return new Intl.NumberFormat("en-IN").format(Number(value) || 0);
}

function getRelativeTime(value) {
  if (!value) return "Never";

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) return "Unknown";

  const difference = Date.now() - timestamp;
  const seconds = Math.floor(Math.abs(difference) / 1000);
  const future = difference < 0;

  if (seconds < 10) return future ? "In a few seconds" : "Just now";
  if (seconds < 60) return future ? `In ${seconds}s` : `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return future ? `In ${minutes}m` : `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return future ? `In ${hours}h` : `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return future ? `In ${days}d` : `${days}d ago`;

  const date = new Date(timestamp);

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function LoadingState() {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-sm text-zinc-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-cyan-400" />
      Loading AI inventory...
    </div>
  );
}

function ErrorState() {
  return (
    <div
      role="alert"
      className="flex min-h-56 flex-col items-center justify-center gap-2 px-6 text-center"
    >
      <ShieldOff size={24} className="text-red-400" />
      <p className="text-sm font-medium text-zinc-200">
        Unable to load the AI inventory
      </p>
      <p className="max-w-md text-xs text-zinc-500">
        Statistics could not be retrieved. Check the API configuration and
        try again.
      </p>
    </div>
  );
}

function EmptyState({ searched, shadowOnly }) {
  let message = "No AI providers have been detected yet.";

  if (searched) {
    message = "No processes match your search.";
  } else if (shadowOnly) {
    message = "No shadow AI processes detected.";
  }

  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
        <Search size={22} className="text-zinc-500" />
      </div>
      <p className="text-sm font-medium text-zinc-300">{message}</p>
      <p className="text-xs text-zinc-500">
        Inventory updates automatically as new events are collected.
      </p>
    </div>
  );
}

function StatusBadge({ sanctioned }) {
  if (sanctioned === true) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
        <ShieldCheck size={13} />
        Approved
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/25 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-400">
      <ShieldOff size={13} />
      SHADOW
    </span>
  );
}

function SummaryCard({ label, value, icon: Icon, color }) {
  const colors = {
    cyan: "bg-cyan-400/10 text-cyan-400",
    red: "bg-red-400/10 text-red-400",
    green: "bg-emerald-400/10 text-emerald-400",
  };

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
      <div className={`rounded-lg p-2.5 ${colors[color] || colors.cyan}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-zinc-500">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-100">
          {formatNumber(value)}
        </p>
      </div>
    </div>
  );
}

export default function Inventory() {
  const { data: stats, error, loading } = usePolling(getStats, 3000);
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
      .sort((a, b) => {
        if (a.sanctioned !== b.sanctioned) {
          return Number(a.sanctioned) - Number(b.sanctioned);
        }

        return b.requests - a.requests;
      });
  }, [stats]);

  const filteredInventory = useMemo(() => {
    const query = search.trim().toLowerCase();

    return inventory.filter((item) => {
      const matchesSearch = item.source.toLowerCase().includes(query);
      const matchesShadow = !shadowOnly || !item.sanctioned;

      return matchesSearch && matchesShadow;
    });
  }, [inventory, search, shadowOnly]);

  const shadowCount = inventory.filter((item) => !item.sanctioned).length;
  const approvedCount = inventory.filter((item) => item.sanctioned).length;
  const initialLoading = loading && stats == null;
  const hasError = Boolean(error) && stats == null;

  return (
    <div className="min-h-full bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-5 lg:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Activity size={20} className="text-cyan-400" />
              <h1 className="text-xl font-semibold tracking-tight">
                Shadow AI Inventory
              </h1>
            </div>
            <p className="mt-1 max-w-2xl text-xs text-zinc-500">
              Discover AI providers used by local processes and identify
              unapproved services.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
              <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-xs text-zinc-400">Refreshes every 3s</span>
          </div>
        </header>

        {initialLoading ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
            <LoadingState />
          </div>
        ) : hasError ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
            <ErrorState />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <SummaryCard
                label="Detected Processes"
                value={inventory.length}
                icon={Activity}
                color="cyan"
              />
              <SummaryCard
                label="Shadow Processes"
                value={shadowCount}
                icon={ShieldOff}
                color="red"
              />
              <SummaryCard
                label="Approved Processes"
                value={approvedCount}
                icon={ShieldCheck}
                color="green"
              />
            </div>

            <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
              <div className="flex flex-col gap-3 border-b border-zinc-800 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-100">
                    Detected Processes
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    Grouped by process source and provider
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <label className="relative block sm:w-64">
                    <Search
                      size={16}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                    />
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search process..."
                      aria-label="Search by process"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-950 py-2 pl-9 pr-3 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30"
                    />
                  </label>

                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 transition hover:border-zinc-600">
                    <input
                      type="checkbox"
                      checked={shadowOnly}
                      onChange={(event) => setShadowOnly(event.target.checked)}
                      className="h-3.5 w-3.5 accent-red-500"
                    />
                    <SlidersHorizontal size={14} className="text-red-400" />
                    Show shadow only
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/70 px-4 py-3">
                <p className="text-xs text-zinc-500">
                  Showing{" "}
                  <span className="font-medium text-zinc-300">
                    {filteredInventory.length}
                  </span>{" "}
                  of{" "}
                  <span className="font-medium text-zinc-300">
                    {inventory.length}
                  </span>{" "}
                  processes
                </p>

                <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <Clock3 size={13} />
                  Last activity is relative to your current time
                </p>
              </div>

              {filteredInventory.length === 0 ? (
                <EmptyState
                  searched={Boolean(search.trim())}
                  shadowOnly={shadowOnly}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-950/60">
                        <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                          Process
                        </th>
                        <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                          Provider
                        </th>
                        <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                          Status
                        </th>
                        <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                          Requests
                        </th>
                        <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                          Last seen
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-zinc-800/70">
                      {filteredInventory.map((item, index) => (
                        <tr
                          key={`${item.source}-${item.provider}-${index}`}
                          className="transition hover:bg-zinc-800/30"
                        >
                          <td className="max-w-[260px] px-5 py-3.5">
                            <p
                              title={item.source}
                              className="truncate text-sm font-medium text-zinc-200"
                            >
                              {item.source}
                            </p>
                          </td>

                          <td className="px-5 py-3.5">
                            <span className="inline-flex items-center gap-2 text-sm text-zinc-300">
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  item.sanctioned
                                    ? "bg-emerald-400"
                                    : "bg-red-400"
                                }`}
                              />
                              {item.provider}
                            </span>
                          </td>

                          <td className="px-5 py-3.5">
                            <StatusBadge sanctioned={item.sanctioned} />
                          </td>

                          <td className="px-5 py-3.5 text-right">
                            <span className="font-mono text-sm tabular-nums text-zinc-300">
                              {formatNumber(item.requests)}
                            </span>
                          </td>

                          <td className="px-5 py-3.5 text-right">
                            <span
                              title={
                                item.last_seen
                                  ? new Date(item.last_seen).toLocaleString()
                                  : "No activity recorded"
                              }
                              className="whitespace-nowrap text-xs text-zinc-400"
                            >
                              {getRelativeTime(item.last_seen)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 px-4 py-3">
                <p className="text-[11px] text-zinc-600">
                  Shadow processes are listed first.
                </p>
                <p className="text-[11px] text-zinc-600">
                  Metadata only · No payloads persisted
                </p>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
