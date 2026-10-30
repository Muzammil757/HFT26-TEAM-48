import { useMemo } from "react";
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
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getStats, getIncidents } from "../api";
import usePolling from "../hooks/usePolling";
import {
  ChainBadge,
  LivePill,
  PageHeader,
  PageShell,
  ScoreMeter,
  SectionHeader,
  SeverityBadge,
  formatClock,
  formatDateTime,
  severityOf,
  useHighlights,
} from "../components/ui.jsx";

const numberFormat = new Intl.NumberFormat("en-IN");
const MINUTE = 60_000;
const MAX_BUCKETS = 60;

function number(value) {
  return numberFormat.format(Number(value) || 0);
}

function incidentList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.incidents)) return data.incidents;
  return [];
}

/**
 * Turn the sparse per-minute timeline into continuous buckets (zero where nothing
 * happened) from the first minute up to now, so gaps read as gaps. Buckets widen
 * beyond one minute if the span would exceed MAX_BUCKETS bars.
 */
function buildTimeline(rows) {
  const points = rows
    .map((row) => ({
      t: Date.parse(row.minute),
      requests: Number(row.requests) || 0,
      incidents: Number(row.incidents) || 0,
    }))
    .filter((p) => !Number.isNaN(p.t))
    .sort((a, b) => a.t - b.t);
  if (points.length === 0) return [];

  const first = points[0].t;
  const lastData = points[points.length - 1].t;
  const nowMinute = Math.floor(Date.now() / MINUTE) * MINUTE;
  // Extend to the current minute when the data is recent, so live activity
  // appears on the right edge.
  const last = nowMinute > lastData && nowMinute - lastData < 3 * 60 * MINUTE ? nowMinute : lastData;

  const minutes = Math.round((last - first) / MINUTE) + 1;
  const step = Math.max(1, Math.ceil(minutes / MAX_BUCKETS)) * MINUTE;
  const buckets = new Map();
  for (let t = first; t <= last; t += step) {
    buckets.set(t, { t, requests: 0, incidents: 0 });
  }
  for (const p of points) {
    const bucket = buckets.get(first + Math.floor((p.t - first) / step) * step);
    if (bucket) {
      bucket.requests += p.requests;
      bucket.incidents += p.incidents;
    }
  }
  return [...buckets.values()];
}

function LoadingState() {
  return (
    <div className="flex h-[220px] items-center justify-center gap-2 text-sm text-zinc-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-cyan-400" />
      Loading...
    </div>
  );
}

function ErrorState({ message = "Unable to load this data." }) {
  return (
    <div
      role="alert"
      className="flex h-[220px] items-center justify-center gap-2 px-4 text-center text-sm text-red-400"
    >
      <CircleAlert size={16} />
      {message}
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="flex h-[220px] items-center justify-center px-4 text-center text-sm text-zinc-500">
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
    <div className="panel min-w-0 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-zinc-400">{label}</p>
        <span className={`rounded-lg p-2 ${tones[tone]}`}>
          <Icon size={16} />
        </span>
      </div>
      <p className="tabular mt-2 text-2xl font-semibold tracking-tight text-zinc-50">
        {value}
      </p>
      <p className="mt-1 text-xs text-zinc-500">{description}</p>
    </div>
  );
}

function ChartTooltip({ active, payload, label, labelFormatter }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 shadow-xl">
      <p className="mb-1.5 text-xs text-zinc-400">
        {labelFormatter ? labelFormatter(label) : label}
      </p>
      {payload.map((entry) => (
        <div
          key={entry.dataKey}
          className="flex items-center justify-between gap-5 py-0.5 text-xs"
        >
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span className="tabular font-medium text-zinc-100">
            {number(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

const axisTick = { fill: "#a1a1aa", fontSize: 11 };
const legendStyle = { fontSize: "11px", color: "#a1a1aa" };

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

  const incidents = useMemo(() => incidentList(incidentsData), [incidentsData]);
  const highlighted = useHighlights(
    incidentsData == null ? null : incidents,
    (incident) => incident.incident_id,
    (incident) => incident.risk_score,
  );

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
      (a, b) => b.sanctioned + b.shadow - (a.sanctioned + a.shadow),
    );
  }, [stats]);

  const timelineData = useMemo(
    () => (Array.isArray(stats?.timeline) ? buildTimeline(stats.timeline) : []),
    [stats],
  );

  const topIncidents = useMemo(
    () =>
      [...incidents]
        .sort(
          (a, b) =>
            (Number(b.risk_score) || 0) - (Number(a.risk_score) || 0) ||
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime() ||
            String(a.incident_id).localeCompare(String(b.incident_id)),
        )
        .slice(0, 5),
    [incidents],
  );

  const statsInitialLoading = statsLoading && stats == null;
  const incidentsInitialLoading = incidentsLoading && incidentsData == null;
  const statsFailed = Boolean(statsError) && stats == null;
  const incidentsFailed = Boolean(incidentsError) && incidentsData == null;

  return (
    <PageShell>
      <PageHeader
        icon={ShieldCheck}
        title="Security Overview"
        subtitle="AI usage, shadow traffic and security incidents on this machine"
        actions={<LivePill />}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="AI Requests"
          value={statsInitialLoading || statsFailed ? "—" : number(stats?.ai_requests)}
          description="Requests to detected AI providers"
          icon={Activity}
          tone="cyan"
        />
        <StatCard
          label="Shadow AI Requests"
          value={statsInitialLoading || statsFailed ? "—" : number(stats?.shadow_requests)}
          description="Requests to unapproved providers"
          icon={ShieldOff}
          tone="red"
        />
        <StatCard
          label="Open Incidents"
          value={statsInitialLoading || statsFailed ? "—" : number(stats?.incidents_total)}
          description="Correlated incidents, score 3 or higher"
          icon={AlertTriangle}
          tone="amber"
        />
        <StatCard
          label="Providers Detected"
          value={statsInitialLoading || statsFailed ? "—" : number(stats?.providers_seen)}
          description="Distinct AI providers observed"
          icon={Bot}
          tone="violet"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="panel min-w-0 p-4">
          <SectionHeader
            title="AI Provider Traffic"
            subtitle="Approved vs. shadow requests by provider"
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
                  margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                >
                  <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="provider"
                    tick={axisTick}
                    tickLine={false}
                    axisLine={{ stroke: "#3f3f46" }}
                    interval={0}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ ...axisTick, fill: "#71717a" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "#27272a66" }} />
                  <Legend verticalAlign="top" align="right" height={26} iconType="circle" wrapperStyle={legendStyle} />
                  <Bar dataKey="sanctioned" name="Approved" stackId="traffic" fill="#22d3ee" maxBarSize={44} isAnimationActive={false} />
                  <Bar dataKey="shadow" name="Shadow AI" stackId="traffic" fill="#f87171" radius={[3, 3, 0, 0]} maxBarSize={44} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="panel min-w-0 p-4">
          <SectionHeader
            title="Activity Timeline"
            subtitle="Requests and new incidents per minute (local time)"
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
                <BarChart
                  data={timelineData}
                  margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                  barGap={1}
                >
                  <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="t"
                    tickFormatter={formatClock}
                    tick={axisTick}
                    tickLine={false}
                    axisLine={{ stroke: "#3f3f46" }}
                    minTickGap={28}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ ...axisTick, fill: "#71717a" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    content={<ChartTooltip labelFormatter={formatClock} />}
                    cursor={{ fill: "#27272a66" }}
                  />
                  <Legend verticalAlign="top" align="right" height={26} iconType="circle" wrapperStyle={legendStyle} />
                  <Bar dataKey="requests" name="Requests" fill="#22d3ee" radius={[2, 2, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                  <Bar dataKey="incidents" name="Incidents" fill="#f87171" radius={[2, 2, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-zinc-800 px-4 py-3">
          <SectionHeader
            title="Top Incidents"
            subtitle="Highest risk scores across all sessions"
            right={
              <Link
                to="/incidents"
                className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-cyan-400 hover:text-cyan-300"
              >
                All incidents
                <ArrowUpRight size={14} />
              </Link>
            }
          />
        </div>

        {incidentsInitialLoading ? (
          <LoadingState />
        ) : incidentsFailed ? (
          <ErrorState message="Could not load incidents. Check that the backend is running." />
        ) : topIncidents.length === 0 ? (
          <EmptyState message="No incidents yet. Leaks and risky agent activity will appear here." />
        ) : (
          <div className="divide-y divide-zinc-800/80">
            {topIncidents.map((incident) => {
              const s = severityOf(incident.severity);
              const flash = highlighted.has(incident.incident_id);

              return (
                <Link
                  key={incident.incident_id}
                  to={`/incidents/${encodeURIComponent(incident.incident_id)}`}
                  className={`group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-800/40 ${flash ? "flash" : ""}`}
                >
                  <span className={`hidden rounded-lg border p-2 sm:inline-flex ${s.icon}`}>
                    <CircleAlert size={16} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={incident.severity} />
                      {incident.is_chain && <ChainBadge />}
                      <span className="text-xs text-zinc-500">
                        {formatDateTime(incident.timestamp)}
                      </span>
                    </div>

                    <p className="mt-1 truncate text-sm font-medium text-zinc-200 group-hover:text-cyan-300">
                      {incident.agent_context || "Security incident"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      <span className="mono text-zinc-400">{incident.source}</span>
                      {" → "}
                      {incident.provider}
                      {" · "}
                      {Array.isArray(incident.findings) ? incident.findings.length : 0} findings
                    </p>
                  </div>

                  <div className="w-24 shrink-0 text-right">
                    <p className={`mono text-lg font-semibold ${s.text}`}>
                      <span key={incident.risk_score} className={flash ? "score-pop" : ""}>
                        {Number(incident.risk_score) || 0}
                      </span>
                      <span className="text-xs font-normal text-zinc-500">/10</span>
                    </p>
                    <ScoreMeter score={incident.risk_score} severity={incident.severity} className="mt-1" />
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

      <footer className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-600">
        <span>ShadowGuard AI · Local security monitoring</span>
        <span>Metadata-first · Payloads are never stored</span>
      </footer>
    </PageShell>
  );
}
