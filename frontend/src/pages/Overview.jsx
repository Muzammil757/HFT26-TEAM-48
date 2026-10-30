import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Bot,
  CircleAlert,
  Clock3,
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
import { getIncidents, getStats } from "../api";
import usePolling from "../hooks/usePolling";
import {
  Card,
  ChainBadge,
  CountUp,
  EmptyState,
  PageHeader,
  PageShell,
  Ring,
  ScoreMeter,
  SeverityBadge,
  Skeleton,
  Sparkline,
  TOKENS,
  buildTimeline,
  formatClock,
  formatDateTime,
  formatNumber,
  plural,
  severityOf,
  useHighlights,
} from "../components/ui.jsx";

const SPARK_POINTS = 30;

// state: "loading" (skeleton), "unavailable" (backend down, nothing cached) or "ready".
function HeroCard({ label, icon: Icon, tone, state, value, valueClass = "text-fg", aside, footer }) {
  return (
    <div className="card flex h-40 min-w-0 flex-col p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow">{label}</p>
        <Icon size={16} className={tone} />
      </div>
      <div className="mt-2 flex min-h-12 items-center justify-between gap-2">
        {state === "loading" ? (
          <Skeleton className="h-10 w-24" />
        ) : state === "unavailable" ? (
          <p className="text-display font-semibold text-subtle">—</p>
        ) : (
          <p className={`text-display font-semibold tracking-tight ${valueClass}`}>{value}</p>
        )}
        {state === "ready" && aside}
      </div>
      <div className="mt-auto h-8">
        {state === "loading" ? (
          <Skeleton className="h-8 w-full" />
        ) : state === "unavailable" ? (
          <p className="text-xs text-subtle">Waiting for the backend</p>
        ) : (
          footer
        )}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label, labelFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line-strong bg-raised px-3 py-2 shadow-[var(--shadow-raised)]">
      <p className="mb-1 text-xs text-muted">{labelFormatter ? labelFormatter(label) : label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-6 text-xs">
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span className="mono font-medium text-fg">{formatNumber(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

const axisTick = { fill: TOKENS.muted, fontSize: 12, fontFamily: "Inter, sans-serif" };
const legendStyle = { fontSize: "12px", color: TOKENS.muted };

function ChartSkeleton() {
  return (
    <div className="flex h-[232px] items-end gap-2 px-6 pb-6 pt-4">
      {[40, 70, 30, 90, 55, 20, 65, 45].map((h, i) => (
        <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

export default function Overview() {
  const { data: stats, error: statsError, loading: statsLoading } = usePolling(getStats, 3000, "stats");
  const {
    data: incidentsData,
    error: incidentsError,
    loading: incidentsLoading,
  } = usePolling(getIncidents, 3000, "incidents");

  const incidents = useMemo(() => (Array.isArray(incidentsData) ? incidentsData : []), [incidentsData]);
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
      const current = grouped.get(provider) || { provider, sanctioned: 0, shadow: 0 };
      if (item.sanctioned === false) current.shadow += Number(item.count) || 0;
      else current.sanctioned += Number(item.count) || 0;
      grouped.set(provider, current);
    }
    return [...grouped.values()].sort((a, b) => b.sanctioned + b.shadow - (a.sanctioned + a.shadow));
  }, [stats]);

  const timelineData = useMemo(() => buildTimeline(stats?.timeline), [stats]);

  // Sparklines from the same timeline: running totals of requests and incidents
  // over the whole range (always a meaningful shape, even when recent minutes are
  // quiet), sampled to SPARK_POINTS. The timeline has no per-minute shadow series.
  const sparks = useMemo(() => {
    let requests = 0;
    let incidentCount = 0;
    const cumulative = timelineData.map((b) => ({
      requests: (requests += b.requests),
      incidents: (incidentCount += b.incidents),
    }));
    const step = Math.max(1, Math.ceil(cumulative.length / SPARK_POINTS));
    const sampled = cumulative.filter((_, i) => i % step === 0 || i === cumulative.length - 1);
    // Start from zero so the line always shows the rise, even if everything
    // happened in the first bucket.
    return {
      requests: [0, ...sampled.map((p) => p.requests)],
      incidents: [0, ...sampled.map((p) => p.incidents)],
    };
  }, [timelineData]);

  const providerSplit = useMemo(() => {
    const shadow = providerData.filter((p) => p.shadow > 0).map((p) => p.provider);
    const approved = providerData.filter((p) => p.shadow === 0).map((p) => p.provider);
    return { shadow, approved };
  }, [providerData]);

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

  const statsPending = stats == null;
  const statsFailed = Boolean(statsError) && stats == null;
  const incidentsPending = incidentsLoading && incidentsData == null;
  const incidentsFailed = Boolean(incidentsError) && incidentsData == null;
  const bySeverity = stats?.incidents_by_severity || {};
  const heroState = stats != null ? "ready" : statsFailed ? "unavailable" : "loading";

  return (
    <PageShell>
      <PageHeader
        title="Security Overview"
        subtitle="Which processes talk to which AI providers, and what they leaked"
      />

      {/* Hero strip */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <HeroCard
          label="AI requests"
          icon={Activity}
          tone="text-accent"
          state={heroState}
          value={<CountUp value={stats?.ai_requests} />}
          footer={<Sparkline values={sparks.requests} color={TOKENS.accent} />}
        />
        <HeroCard
          label="Shadow AI requests"
          icon={ShieldOff}
          tone="text-shadow"
          state={heroState}
          value={<CountUp value={stats?.shadow_requests} />}
          valueClass="text-shadow"
          aside={<Ring part={stats?.shadow_requests || 0} total={stats?.ai_requests || 0} size={56} />}
          footer={
            <p className="flex items-center gap-2 text-xs text-muted">
              <span className="h-2 w-2 rounded-full bg-shadow" />
              Shadow AI share of all AI requests
            </p>
          }
        />
        <HeroCard
          label="Open incidents"
          icon={AlertTriangle}
          tone="text-high"
          state={heroState}
          value={<CountUp value={stats?.incidents_total} />}
          aside={
            <div className="space-y-0.5 text-right text-xs">
              {["critical", "high", "medium"].map((sev) => (
                <p key={sev} className="flex items-center justify-end gap-1.5 text-muted">
                  <span className="mono text-fg">{bySeverity[sev] || 0}</span>
                  {severityOf(sev).label}
                  <span className={`h-1.5 w-1.5 rounded-full ${severityOf(sev).bar}`} />
                </p>
              ))}
            </div>
          }
          footer={<Sparkline values={sparks.incidents} color={TOKENS.high} />}
        />
        <HeroCard
          label="Providers detected"
          icon={Bot}
          tone="text-accent"
          state={heroState}
          value={<CountUp value={stats?.providers_seen} />}
          aside={
            <div className="space-y-0.5 text-right text-xs">
              <p className="flex items-center justify-end gap-1.5 text-muted">
                <span className="mono text-fg">{providerSplit.shadow.length}</span> shadow
                <ShieldOff size={12} className="text-shadow" />
              </p>
              <p className="flex items-center justify-end gap-1.5 text-muted">
                <span className="mono text-fg">{providerSplit.approved.length}</span> approved
                <ShieldCheck size={12} className="text-approved" />
              </p>
            </div>
          }
          footer={
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-line">
              {providerData.map((p) => (
                <span
                  key={p.provider}
                  title={`${p.provider}: ${p.sanctioned + p.shadow} requests`}
                  className={`h-full border-r border-card last:border-r-0 ${p.shadow > 0 ? "bg-shadow" : "bg-approved"}`}
                  style={{ width: `${((p.sanctioned + p.shadow) / Math.max(1, stats?.ai_requests || 1)) * 100}%` }}
                />
              ))}
            </div>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="AI provider traffic" subtitle="Approved vs. shadow requests per provider" icon={BarChart3}>
          {statsPending && !statsFailed ? (
            <ChartSkeleton />
          ) : statsFailed ? (
            <EmptyState icon={CircleAlert} title="Statistics unavailable" hint="Waiting for the backend." className="h-[232px]" />
          ) : providerData.length === 0 ? (
            <EmptyState icon={BarChart3} title="No AI traffic yet" hint="Load demo data or start the collector." className="h-[232px]" />
          ) : (
            <div className="h-[232px] px-4 pb-4 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={providerData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={TOKENS.line} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="provider" tick={axisTick} tickLine={false} axisLine={{ stroke: TOKENS.lineStrong }} interval={0} />
                  <YAxis allowDecimals={false} tick={{ ...axisTick, fill: TOKENS.subtle }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                  <Legend verticalAlign="top" align="right" height={28} iconType="circle" iconSize={8} wrapperStyle={legendStyle} />
                  <Bar dataKey="sanctioned" name="Approved" stackId="t" fill={TOKENS.approved} maxBarSize={40} isAnimationActive={false} />
                  <Bar dataKey="shadow" name="Shadow AI" stackId="t" fill={TOKENS.shadow} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Activity timeline" subtitle="Requests and new incidents per minute, local time" icon={Clock3}>
          {statsPending && !statsFailed ? (
            <ChartSkeleton />
          ) : statsFailed ? (
            <EmptyState icon={CircleAlert} title="Timeline unavailable" hint="Waiting for the backend." className="h-[232px]" />
          ) : timelineData.length === 0 ? (
            <EmptyState icon={Clock3} title="No activity yet" className="h-[232px]" />
          ) : (
            <div className="h-[232px] px-4 pb-4 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timelineData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }} barGap={1}>
                  <CartesianGrid stroke={TOKENS.line} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="t" tickFormatter={formatClock} tick={axisTick} tickLine={false} axisLine={{ stroke: TOKENS.lineStrong }} minTickGap={32} />
                  <YAxis allowDecimals={false} tick={{ ...axisTick, fill: TOKENS.subtle }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip labelFormatter={formatClock} />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                  <Legend verticalAlign="top" align="right" height={28} iconType="circle" iconSize={8} wrapperStyle={legendStyle} />
                  <Bar dataKey="requests" name="Requests" fill={TOKENS.accent} radius={[2, 2, 0, 0]} maxBarSize={16} isAnimationActive={false} />
                  <Bar dataKey="incidents" name="Incidents" fill={TOKENS.high} radius={[2, 2, 0, 0]} maxBarSize={16} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Top incidents"
        subtitle="Highest risk scores across all sessions"
        icon={AlertTriangle}
        actions={
          <Link to="/incidents" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-fg">
            All incidents <ArrowUpRight size={14} />
          </Link>
        }
      >
        {incidentsPending ? (
          <div className="divide-y divide-line">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4">
                <Skeleton className="h-8 w-8" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : incidentsFailed ? (
          <EmptyState icon={CircleAlert} title="Incidents unavailable" hint="Waiting for the backend." />
        ) : topIncidents.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No incidents"
            hint="Leaks of secrets or personal data and risky agent activity will appear here."
          />
        ) : (
          <div className="divide-y divide-line">
            {topIncidents.map((incident) => {
              const s = severityOf(incident.severity);
              const flash = highlighted.has(incident.incident_id);
              return (
                <Link
                  key={incident.incident_id}
                  to={`/incidents/${encodeURIComponent(incident.incident_id)}`}
                  className={`group flex items-center gap-4 px-6 py-3 transition-colors duration-150 hover:bg-white/[0.02] ${flash ? "flash" : ""}`}
                >
                  <span className={`rounded-lg border p-2 ${s.icon}`}>
                    <CircleAlert size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={incident.severity} />
                      {incident.is_chain && <ChainBadge />}
                      <span className="text-xs text-subtle">{formatDateTime(incident.timestamp)}</span>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium text-fg group-hover:text-accent">
                      {incident.agent_context || "Security incident"}
                    </p>
                    <p className="truncate text-xs text-subtle">
                      <span className="mono text-muted">{incident.source}</span> → {incident.provider} ·{" "}
                      {plural(Array.isArray(incident.findings) ? incident.findings.length : 0, "finding")}
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
