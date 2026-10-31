import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, Boxes, CircleAlert, Clock3, ShieldAlert, ShieldCheck, Siren } from "lucide-react";
import { getIncidents, getStats } from "../api.js";
import ActivityTimelineChart from "../components/charts/ActivityTimelineChart.jsx";
import IncidentsTable from "../components/incidents/IncidentsTable.jsx";
import KpiCard from "../components/overview/KpiCard.jsx";
import ProviderUsageCard, { providerRows } from "../components/overview/ProviderUsageCard.jsx";
import Card from "../components/ui/Card.jsx";
import CountUp from "../components/ui/CountUp.jsx";
import { PageHeader, PageShell } from "../components/ui/Page.jsx";
import { ReplayBanner, ReplayButton, useReplayAgent } from "../components/demo/ReplayAgent.jsx";
import { EmptyState, Skeleton, TableSkeleton } from "../components/ui/States.jsx";
import useHighlights from "../hooks/useHighlights.js";
import usePolling from "../hooks/usePolling.js";
import { formatNumber, plural } from "../lib/format.js";
import { CHART, severityOf } from "../lib/theme.js";
import { buildTimeline } from "../lib/timeline.js";

function TimelineLegend({ data }) {
  const requests = data.reduce((sum, b) => sum + b.requests, 0);
  const incidents = data.reduce((sum, b) => sum + b.incidents, 0);
  return (
    <div className="flex items-center gap-3 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-3 rounded" style={{ backgroundColor: CHART.requests }} />
        AI requests <span className="mono text-fg">{formatNumber(requests)}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-1.5 rounded-sm" style={{ backgroundColor: CHART.incidents }} />
        Incidents <span className="mono text-fg">{formatNumber(incidents)}</span>
      </span>
    </div>
  );
}

export default function Overview() {
  const { data: stats, error: statsError } = usePolling(getStats, 3000, "stats");
  const { data: incidentsData, error: incidentsError } = usePolling(getIncidents, 3000, "incidents");
  const replay = useReplayAgent();

  const state = stats != null ? "ready" : statsError ? "unavailable" : "loading";
  const timeline = useMemo(() => buildTimeline(stats?.timeline), [stats]);
  const providers = useMemo(() => providerRows(stats?.by_provider), [stats]);
  const shadowProviders = providers.filter((p) => p.shadow > 0).length;
  const approvedProviders = providers.length - shadowProviders;

  const recent = useMemo(
    () =>
      (Array.isArray(incidentsData) ? [...incidentsData] : [])
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 5),
    [incidentsData],
  );
  const highlighted = useHighlights(
    incidentsData,
    (incident) => incident.incident_id,
    (incident) => incident.risk_score,
  );

  const aiRequests = Number(stats?.ai_requests) || 0;
  const shadowRequests = Number(stats?.shadow_requests) || 0;
  const shadowShare = aiRequests ? Math.round((shadowRequests / aiRequests) * 100) : 0;
  const bySeverity = stats?.incidents_by_severity || {};
  const step = timeline[0]?.step || 1;

  return (
    <PageShell>
      <PageHeader
        title="Security Overview"
        subtitle="Monitor AI usage, identify shadow AI activity and investigate potential data exposure."
        actions={<ReplayButton replay={replay} />}
      />
      <ReplayBanner replay={replay} />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label="AI Requests"
          icon={Activity}
          state={state}
          value={<CountUp value={stats?.ai_requests} />}
          footer={
            <>
              of <span className="mono text-fg">{formatNumber(stats?.total_events)}</span> recorded events
            </>
          }
        />
        <KpiCard
          label="Shadow AI Requests"
          icon={ShieldAlert}
          tone="shadow"
          state={state}
          value={<CountUp value={shadowRequests} />}
          valueClass={shadowRequests ? "text-shadow" : "text-fg"}
          footer={
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-line" aria-hidden="true">
                <div className="h-full rounded-full bg-shadow" style={{ width: `${shadowShare}%` }} />
              </div>
              <span>
                <span className="mono text-fg">{shadowShare}%</span> of AI requests
              </span>
            </div>
          }
        />
        <KpiCard
          label="Incidents Detected"
          icon={Siren}
          tone="high"
          state={state}
          value={<CountUp value={stats?.incidents_total} />}
          footer={
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              {["critical", "high", "medium"].map((sev) => (
                <span key={sev} className="flex items-center gap-1">
                  <span className={`h-1.5 w-1.5 rounded-full ${severityOf(sev).dot}`} aria-hidden="true" />
                  <span className="mono text-fg">{bySeverity[sev] || 0}</span> {severityOf(sev).label}
                </span>
              ))}
            </div>
          }
        />
        <KpiCard
          label="Providers Detected"
          icon={Boxes}
          tone="neutral"
          state={state}
          value={<CountUp value={stats?.providers_seen} />}
          footer={
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <ShieldCheck size={12} className="text-approved" />
                <span className="mono text-fg">{approvedProviders}</span> approved
              </span>
              <span className="flex items-center gap-1">
                <ShieldAlert size={12} className="text-shadow" />
                <span className="mono text-fg">{shadowProviders}</span> shadow
              </span>
            </div>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <Card
          title="AI activity timeline"
          subtitle={`Per ${step > 1 ? `${step} minutes` : "minute"}, local time · quiet minutes plotted as zero`}
          icon={Clock3}
          className="lg:col-span-7"
        >
          {state === "loading" ? (
            <div className="flex h-[230px] items-end gap-1.5 px-4 pb-4 pt-6">
              {[30, 45, 25, 70, 50, 85, 40, 60, 35, 55, 20, 65].map((h, i) => (
                <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
              ))}
            </div>
          ) : state === "unavailable" ? (
            <EmptyState icon={CircleAlert} title="Timeline unavailable" hint="Waiting for the backend." className="h-[230px]" />
          ) : timeline.length === 0 ? (
            <EmptyState icon={Clock3} title="No activity yet" hint="Load demo data or start the collector." className="h-[230px]" />
          ) : (
            <div className="px-2 pb-2 pt-3">
              <ActivityTimelineChart data={timeline} height={230} />
              <div className="mt-1 flex justify-end px-2">
                <TimelineLegend data={timeline} />
              </div>
            </div>
          )}
        </Card>
        <div className="lg:col-span-5">
          <ProviderUsageCard stats={stats} state={state} />
        </div>
      </div>

      <Card
        title="Recent incidents"
        subtitle="Latest five incidents by time · select a row to investigate"
        icon={Siren}
        actions={
          <Link
            to="/incidents"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-accent transition-colors duration-150 hover:bg-accent-soft"
          >
            View all incidents <ArrowRight size={13} />
          </Link>
        }
      >
        {incidentsData == null ? (
          incidentsError ? (
            <EmptyState icon={CircleAlert} title="Incidents unavailable" hint="Waiting for the backend." />
          ) : (
            <TableSkeleton rows={4} cols={6} />
          )
        ) : recent.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No incidents detected"
            hint="Leaked credentials or personal data and risky agent activity will appear here."
          />
        ) : (
          <>
            <IncidentsTable incidents={recent} highlighted={highlighted} compact />
            {incidentsData.length > recent.length && (
              <p className="border-t border-line px-4 py-2 text-xs text-muted">
                Showing 5 of {plural(incidentsData.length, "incident")}
              </p>
            )}
          </>
        )}
      </Card>
    </PageShell>
  );
}
