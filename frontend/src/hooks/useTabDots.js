import { useEffect, useLayoutEffect, useRef, useState } from "react";

// What each tab shows, reduced to a comparable string.
function signatures(incident) {
  const events = incident.events || [];
  const findings = incident.findings || [];
  const factors = (incident.score_breakdown || []).map((b) => `${b.factor}:${b.points}`).join("|");
  return {
    summary: `${incident.risk_score}|${factors}|${Boolean(incident.ai_analysis)}`,
    timeline: events.map((e) => e.event_id).join("|"),
    findings: `${findings.map((f) => `${f.rule}@${f.event_id}`).join("|")}#${events.length}`,
    score: `${incident.risk_score}|${factors}`,
    analysis: String(Boolean(incident.ai_analysis)),
  };
}

/**
 * Tabs whose content changed on a poll while another tab was open. A tab's dot
 * clears when it is visited. Nothing is marked on the first load.
 */
export default function useTabDots(incident, active) {
  const [dots, setDots] = useState(() => new Set());
  const previousRef = useRef(null);
  const activeRef = useRef(active);
  useLayoutEffect(() => {
    activeRef.current = active;
  });

  useEffect(() => {
    if (!incident) return;
    const current = signatures(incident);
    const previous = previousRef.current;
    previousRef.current = current;
    if (!previous) return;
    const changed = Object.keys(current).filter((tab) => current[tab] !== previous[tab] && tab !== activeRef.current);
    if (changed.length) setDots((d) => new Set([...d, ...changed]));
  }, [incident]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- visiting a tab clears its dot
    setDots((d) => {
      if (!d.has(active)) return d;
      const next = new Set(d);
      next.delete(active);
      return next;
    });
  }, [active]);

  return dots;
}
