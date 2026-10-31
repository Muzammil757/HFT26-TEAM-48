import { useCallback } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { getIncident } from "../api.js";
import AnalysisPanel from "../components/incident-detail/AnalysisPanel.jsx";
import DetailTabs from "../components/incident-detail/DetailTabs.jsx";
import EventTimeline from "../components/incident-detail/EventTimeline.jsx";
import FindingsTable from "../components/incident-detail/FindingsTable.jsx";
import IncidentHeader from "../components/incident-detail/IncidentHeader.jsx";
import ScoreBreakdown from "../components/incident-detail/ScoreBreakdown.jsx";
import SummaryTab from "../components/incident-detail/SummaryTab.jsx";
import { PageShell } from "../components/ui/Page.jsx";
import { EmptyState, InlineAlert, Skeleton } from "../components/ui/States.jsx";
import useHighlights from "../hooks/useHighlights.js";
import useIncidentAnalysis from "../hooks/useIncidentAnalysis.js";
import usePolling, { useBackendOffline } from "../hooks/usePolling.js";
import useTabDots from "../hooks/useTabDots.js";
import { errorMessage } from "../lib/format.js";

const TABS = ["summary", "timeline", "findings", "score", "analysis"];

function BackLink() {
  // Return to the Incidents page with the filters it had.
  let search = "";
  try {
    search = sessionStorage.getItem("sg.incidentsSearch") || "";
  } catch {
    // Storage unavailable; go back unfiltered.
  }
  return (
    <Link
      to={`/incidents${search}`}
      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors duration-150 hover:text-accent"
    >
      <ArrowLeft size={15} />
      Back to incidents
    </Link>
  );
}

// Keyed by id so navigating between incidents starts with fresh state.
export default function IncidentDetailRoute() {
  const { id } = useParams();
  return <IncidentDetail key={id} id={id} />;
}

function IncidentDetail({ id }) {
  const fetchIncident = useCallback(() => getIncident(id), [id]);
  // Live: polled every 3 s, so the score climbs (3 -> 6 -> 10) without a reload.
  const { data: incident, error, loading } = usePolling(fetchIncident, 3000, `incident:${id}`);
  const offline = useBackendOffline();
  const analysisState = useIncidentAnalysis(id, incident, offline);

  // Active tab lives in the URL (?tab=), default summary.
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get("tab")) ? params.get("tab") : "summary";
  const openTab = (next) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "summary") p.delete("tab");
        else p.set("tab", next);
        return p;
      },
      { replace: true },
    );
  const dots = useTabDots(incident, tab);

  const scoreChanged = useHighlights(
    incident ? [incident] : null,
    (item) => item.incident_id,
    (item) => item.risk_score,
  ).has(id);
  const newFactors = useHighlights(incident?.score_breakdown ?? null, (item) => item.factor);
  const newEvents = useHighlights(incident?.events ?? null, (item) => item.event_id);

  if (loading && !incident) {
    return (
      <PageShell>
        <BackLink />
        <div className="card space-y-3 p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="h-64 rounded-[10px]" />
      </PageShell>
    );
  }

  if (!incident) {
    return (
      <PageShell>
        <BackLink />
        <div className="card">
          <EmptyState
            icon={TriangleAlert}
            title={error?.status === 404 ? "Incident not found" : "Unable to load incident"}
            hint={errorMessage(error)}
          />
        </div>
      </PageShell>
    );
  }

  const events = incident.events || [];
  const tabs = [
    { id: "summary", label: "Summary" },
    { id: "timeline", label: "Timeline", count: events.length },
    { id: "findings", label: "Findings", count: (incident.findings || []).length },
    { id: "score", label: "Risk score" },
    { id: "analysis", label: "AI analysis" },
  ].map((t) => ({ ...t, dot: dots.has(t.id) }));

  return (
    <PageShell>
      <BackLink />

      {error?.status === 404 && (
        <InlineAlert tone="warning">
          This incident no longer exists on the server (database reset). Showing the last loaded copy.
        </InlineAlert>
      )}

      <IncidentHeader incident={incident} scoreChanged={scoreChanged}>
        <DetailTabs tabs={tabs} active={tab} onChange={openTab} />
      </IncidentHeader>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "summary" && <SummaryTab incident={incident} analysisState={analysisState} offline={offline} openTab={openTab} />}
        {tab === "timeline" && <EventTimeline incident={incident} newEvents={newEvents} />}
        {tab === "findings" && <FindingsTable incident={incident} />}
        {tab === "score" && (
          <div className="max-w-3xl">
            <ScoreBreakdown incident={incident} newFactors={newFactors} />
          </div>
        )}
        {tab === "analysis" && (
          <div className="max-w-4xl">
            <AnalysisPanel state={analysisState} offline={offline} />
          </div>
        )}
      </div>
    </PageShell>
  );
}
