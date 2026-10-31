import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { analyzeIncident } from "../api.js";
import { parseAnalysis } from "../lib/analysis.js";
import { errorMessage } from "../lib/format.js";

/**
 * Analysis state for one incident, shared by every place that can start or show
 * it (Summary tab and AI analysis tab), so both always agree.
 *
 * Returns { analysis, stale, analyzing, error, run }.
 */
export default function useIncidentAnalysis(id, incident, offline) {
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  // Last analysis this page received; stays visible if the backend later clears
  // ai_analysis because the incident changed.
  const [localAnalysis, setLocalAnalysis] = useState(null);
  const latestIncidentRef = useRef(incident);
  useLayoutEffect(() => {
    latestIncidentRef.current = incident;
  });

  // Analyze needs the backend; clear a stale error once it is reachable again.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the backend becomes reachable again
    if (!offline) setError(null);
  }, [offline]);

  async function run() {
    if (analyzing || offline) return;
    setAnalyzing(true);
    setError(null);
    try {
      const result = await analyzeIncident(id);
      // Remember which polled copy was on screen when the analysis arrived.
      setLocalAnalysis({ text: result.ai_analysis, polledAt: latestIncidentRef.current });
    } catch (err) {
      setError(errorMessage(err) || "AI analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  // The backend stores the analysis, so a poll after it arrived still showing no
  // ai_analysis means the incident changed and the backend cleared it. Until that
  // next poll, the local copy is simply newer than the polled data.
  const stale = Boolean(incident) && !incident.ai_analysis && Boolean(localAnalysis) && incident !== localAnalysis.polledAt;
  const analysis = parseAnalysis(incident?.ai_analysis || localAnalysis?.text);

  return { analysis, stale, analyzing, error, run };
}
