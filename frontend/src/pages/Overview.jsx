
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CircleAlert,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getStats, getIncidents } from "../api";
import usePolling from "../hooks/usePolling";

const numberFormat = new Intl.NumberFormat("en-IN");

function number(value) {
  return numberFormat.format(Number(value) || 0);
}

function incidentList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.incidents)) return data.incidents;
  return [];
}

function formatTime(value) {
  if (!value) return "Unknown time";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function LoadingState() {
  return (
    <div className="flex min-h-36 items-center justify-center gap-2 text-sm text-zinc-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-cyan-400" />
      Loading...
    </div>
  );
}

function ErrorState({ message = "Unable to load this data." }) {
  return (
    <div
      role="alert"
      className="flex min-h-36 items-center justify-center gap-2 px-4 text-center text-sm text-red-400"
    >
      <CircleAlert size={16} />
      {message}
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="flex min-h-36 items-center justify-center px-4 text-center text-sm text-zinc-500">
      {message}
    </div>
  );
}

function StatCard({ label, value, description, icon: Icon, tone }) {
  const tones = {
    cyan: "bg-cyan-400/10 text-cyan-400",
    red: "bg-red-400/10 text-red-400",
    amber: "bg-amber-400/10 text-amber-400",
    violet: "bg-violet-400/10 text-violet-400",
  };

  return (
    <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-zinc-400">{label}</p>
        <span className={`rounded-lg p-2 ${tones[tone]}`}>
          <Icon size={17} />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
        {value}
      </p>
      <p className="mt-1 text-xs text-zinc-500">{description}</p>
    </div>
  );
}

function SectionHeader({ title, subtitle, to, linkLabel }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
        <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
      </div>
      {to && (
        <Link
          to={to}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-cyan-400 hover:text-cyan-300"
        >
          {linkLabel}
          <ArrowUpRight size={14} />
        </Link>
      )}
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 shadow-xl">
      <p className="mb-2 text-xs text-zinc-400">{label}</p>
      {payload.map((entry) => (
        <div
          key={entry.dataKey}
          className="flex items-center justify-between gap-5 py-0.5 text-xs"
        >
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span className="font-medium text-zinc-100">
            {number(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function SeverityBadge({ severity }) {
  const normalized = String(severity || "low").toLowerCase();
  const styles = {
    critical: "border-red-500/30 bg-red-500/10 text-red-400",
    high: "border-orange-500/30 bg-orange-500/10 text-orange-400",
    medium: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    low: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  };

  return (
    <span
      className={`inline-flex shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase ${styles[normalized] || styles.low}`}
    >
      {normalized}
    </span>
  );
}

export default function Overview() {
  const {
    data: stats,
    error: statsError,
    loading: statsLoading,
  } = usePolling(getStats, 3000);

  const {
    data: incidentsData,
    error: incidentsError,
    loading: incidentsLoading,
  } = usePolling(getIncidents, 3000);

  const [highlightedIds, setHighlightedIds] = useState(() => new Set());
  const previousIdsRef = useRef(null);
  const highlightTimersRef = useRef(new Map());

  // Highlight only incidents that arrive after the initial data load.
  useEffect(() => {
    if (incidentsData == null) return;

    const currentIncidents = incidentList(incidentsData);
    const currentIds = new Set(
      currentIncidents
        .map((incident) => incident.incident_id)
        .filter(Boolean),
    );

    // Do not flash existing incidents on the initial page load.
    if (previousIdsRef.current === null) {
      previousIdsRef.current = currentIds;
      return;
    }

    const newIds = [...currentIds].filter(
      (id) => !previousIdsRef.current.has(id),
    );

    previousIdsRef.current = currentIds;

    if (newIds.length === 0) return;

    setHighlightedIds((previous) => {
      const next = new Set(previous);
      newIds.forEach((id) => next.add(id));
      return next;
    });

    for (const id of newIds) {
      const oldTimer = highlightTimersRef.current.get(id);
      if (oldTimer) window.clearTimeout(oldTimer);

      const timer = window.setTimeout(() => {
        setHighlightedIds((previous) => {
          const next = new Set(previous);
          next.delete(id);
          return next;
        });
        highlightTimersRef.current.delete(id);
      }, 2000);

      highlightTimersRef.current.set(id, timer);
    }
  }, [incidentsData]);

  // Clean up highlight timers when the page unmounts.
  useEffect(() => {
    return () => {
      for (const timer of highlightTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      highlightTimersRef.current.clear();
    };
  }, []);

  const providerData = useMemo(() => {
    if (!Array.isArray(stats?.by_provider)) return [];

    const grouped = new Map();

    for (const item of stats.by_provider) {
      const provider = item.provider || "Unknown";
      const current = grouped.get(provider) || {
        provider,
        sanctioned: 0,
        shadow: 0,
      };

      if (item.sanctioned === false) {
        current.shadow += Number(item.count) || 0;
      } else {
        current.sanctioned += Number(item.count) || 0;
      }

      grouped.set(provider, current);
    }

    return [...grouped.values()].sort(
      (a, b) =>
        b.sanctioned + b.shadow - (a.sanctioned + a.shadow),
    );
  }, [stats]);

  const timelineData = useMemo(() => {
    if (!Array.isArray(stats?.timeline)) return [];

    return stats.timeline.map((item) => ({
      minute: item.minute,
      requests: Number(item.requests) || 0,
      incidents: Number(item.incidents) || 0,
    }));
  }, [stats]);

  const latestCritical = useMemo(() => {
    return incidentList(incidentsData)
      .filter(
        (incident) =>
          String(incident.severity || "").toLowerCase() === "critical",
      )
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() -
          new Date(a.timestamp).getTime(),
      )
      .slice(0, 5);
  }, [incidentsData]);

  const statsInitialLoading = statsLoading && stats == null;
  const incidentsInitialLoading =
    incidentsLoading && incidentsData == null;
  const statsFailed = Boolean(statsError) && stats == null;
  const incidentsFailed =
    Boolean(incidentsError) && incidentsData == null;

  return (
    <div className="min-h-full bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-5 lg:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={20} className="text-cyan-400" />
              <h1 className="text-xl font-semibold tracking-tight">
                Security Overview
              </h1>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              AI usage, shadow traffic and security incidents
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
              <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-xs text-zinc-400">Auto-refresh · 3s</span>
          </div>
        </header>

        {statsInitialLoading ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
            <LoadingState />
          </div>
        ) : statsFailed ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
            <ErrorState message="Could not load statistics. Check the backend or mock configuration." />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="AI Requests"
              value={number(stats?.ai_requests)}
              description="Requests to detected AI providers"
              icon={Activity}
              tone="cyan"
            />
            <StatCard
              label="Shadow AI Requests"
              value={number(stats?.shadow_requests)}
              description="Requests to unsanctioned providers"
              icon={ShieldOff}
              tone="red"
            />
            <StatCard
              label="Open Incidents"
              value={number(stats?.incidents_total)}
              description="Incidents recorded by the scanner"
              icon={AlertTriangle}
              tone="amber"
            />
            <StatCard
              label="Providers Detected"
              value={number(stats?.providers_seen)}
              description="AI providers observed"
              icon={Bot}
              tone="violet"
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <section className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <SectionHeader
              title="AI Provider Traffic"
              subtitle="Sanctioned vs. shadow requests by provider"
            />

            {statsInitialLoading ? (
              <LoadingState />
            ) : statsFailed ? (
              <ErrorState />
            ) : providerData.length === 0 ? (
              <EmptyState message="No provider traffic recorded yet." />
            ) : (
              <div className="mt-3 h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={providerData}
                    margin={{ top: 8, right: 8, left: -18, bottom: 4 }}
                  >
                    <CartesianGrid
                      stroke="#27272a"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="provider"
                      tick={{ fill: "#a1a1aa", fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: "#3f3f46" }}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={48}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: "#71717a", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      height={28}
                      iconType="circle"
                      wrapperStyle={{ fontSize: "11px", color: "#a1a1aa" }}
                    />
                    <Bar
                      dataKey="sanctioned"
                      name="Sanctioned"
                      stackId="traffic"
                      fill="#22d3ee"
                      maxBarSize={42}
                    />
                    <Bar
                      dataKey="shadow"
                      name="Shadow AI"
                      stackId="traffic"
                      fill="#f87171"
                      radius={[3, 3, 0, 0]}
                      maxBarSize={42}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <SectionHeader
              title="Activity Timeline"
              subtitle="Request and incident activity over time"
            />

            {statsInitialLoading ? (
              <LoadingState />
            ) : statsFailed ? (
              <ErrorState />
            ) : timelineData.length === 0 ? (
              <EmptyState message="No timeline activity available yet." />
            ) : (
              <div className="mt-3 h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={timelineData}
                    margin={{ top: 8, right: 8, left: -18, bottom: 4 }}
                  >
                    <defs>
                      <linearGradient
                        id="requestsGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#22d3ee"
                          stopOpacity={0.24}
                        />
                        <stop
                          offset="95%"
                          stopColor="#22d3ee"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke="#27272a"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="minute"
                      tick={{ fill: "#a1a1aa", fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: "#3f3f46" }}
                      minTickGap={24}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: "#71717a", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      height={28}
                      iconType="circle"
                      wrapperStyle={{ fontSize: "11px", color: "#a1a1aa" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="requests"
                      name="Requests"
                      stroke="#22d3ee"
                      strokeWidth={2}
                      fill="url(#requestsGradient)"
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="incidents"
                      name="Incidents"
                      stroke="#f87171"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        </div>

        <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
          <div className="border-b border-zinc-800 p-4">
            <SectionHeader
              title="Latest Critical Incidents"
              subtitle="Highest-severity incidents requiring attention"
              to="/incidents"
              linkLabel="All incidents"
            />
          </div>

          {incidentsInitialLoading ? (
            <LoadingState />
          ) : incidentsFailed ? (
            <ErrorState message="Could not load incidents. Check the backend or mock configuration." />
          ) : latestCritical.length === 0 ? (
            <EmptyState message="No critical incidents detected." />
          ) : (
            <div className="divide-y divide-zinc-800/80">
              {latestCritical.map((incident) => {
                const isNew = highlightedIds.has(incident.incident_id);

                return (
                  <Link
                    key={incident.incident_id}
                    to={`/incidents/${encodeURIComponent(incident.incident_id)}`}
                    className={[
                      "group flex items-center gap-3 border-l-2 px-4 py-3 transition-colors duration-300",
                      isNew
                        ? "animate-pulse border-cyan-400 bg-cyan-400/10 shadow-[inset_0_0_24px_rgba(34,211,238,0.08)]"
                        : "border-transparent hover:bg-zinc-800/40",
                    ].join(" ")}
                  >
                    <span className="hidden rounded-lg bg-red-500/10 p-2 text-red-400 sm:inline-flex">
                      <CircleAlert size={17} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={incident.severity} />
                        {incident.is_chain && (
                          <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-400">
                            EXFILTRATION CHAIN
                          </span>
                        )}
                        {isNew && (
                          <span className="rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold uppercase text-cyan-300">
                            New
                          </span>
                        )}
                        <span className="text-xs text-zinc-500">
                          {formatTime(incident.timestamp)}
                        </span>
                      </div>

                      <p className="mt-1 truncate text-sm font-medium text-zinc-200 group-hover:text-cyan-300">
                        {incident.agent_context ||
                          incident.provider ||
                          "Security incident"}
                      </p>
                      <p className="mt-1 truncate text-xs text-zinc-500">
                        {incident.provider || "Unknown provider"}
                        {" · "}
                        {incident.source || "Unknown source"}
                        {" · "}
                        {Array.isArray(incident.findings)
                          ? incident.findings.length
                          : 0}{" "}
                        findings
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-lg font-semibold tabular-nums text-red-400">
                        {Number(incident.risk_score) || 0}
                        <span className="text-xs font-normal text-zinc-500">
                          /10
                        </span>
                      </p>
                      <p className="text-[10px] text-zinc-500">Risk score</p>
                    </div>

                    <ArrowUpRight
                      size={16}
                      className="hidden shrink-0 text-zinc-600 group-hover:text-cyan-400 sm:block"
                    />
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-2 pb-1 text-[11px] text-zinc-600">
          <span>ShadowGuard AI · Local security monitoring</span>
          <span>Metadata-first · Payloads are not persisted</span>
        </footer>
      </div>
    </div>
  );
}
