import { useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { getIncident } from "../api.js";
import AnalysisPanel from "../components/incident-detail/AnalysisPanel.jsx";
import EventTimeline from "../components/incident-detail/EventTimeline.jsx";
import FindingsTable from "../components/incident-detail/FindingsTable.jsx";
import IncidentSummary from "../components/incident-detail/IncidentSummary.jsx";
import ScoreBreakdown from "../components/incident-detail/ScoreBreakdown.jsx";
import { PageShell } from "../components/ui/Page.jsx";
import { EmptyState, InlineAlert, Skeleton } from "../components/ui/States.jsx";
import useHighlights from "../hooks/useHighlights.js";
import usePolling, { useBackendOffline } from "../hooks/usePolling.js";
import { errorMessage } from "../lib/format.js";

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
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="grid gap-3 lg:grid-cols-12">
          <Skeleton className="h-80 rounded-[10px] lg:col-span-7" />
          <Skeleton className="h-80 rounded-[10px] lg:col-span-5" />
        </div>
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

  return (
    <PageShell>
      <BackLink />

      {error?.status === 404 && (
        <InlineAlert tone="warning">
          This incident no longer exists on the server (database reset). Showing the last loaded copy.
        </InlineAlert>
      )}

      <IncidentSummary incident={incident} scoreChanged={scoreChanged} />

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-12">
        {/* Left: what happened and the evidence. Right: why it scored, and what to do. */}
        <div className="space-y-3 lg:col-span-7">
          <EventTimeline incident={incident} newEvents={newEvents} />
          <FindingsTable incident={incident} />
        </div>
        <div className="space-y-3 lg:col-span-5">
          <ScoreBreakdown incident={incident} newFactors={newFactors} />
          <AnalysisPanel id={id} incident={incident} offline={offline} />
        </div>
      </div>
    </PageShell>
  );
}
