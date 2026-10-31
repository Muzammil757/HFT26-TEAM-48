import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Siren, TrendingUp, X } from "lucide-react";
import { getIncidents } from "../../api.js";
import usePolling from "../../hooks/usePolling.js";
import { severityOf } from "../../lib/theme.js";

const TOAST_MS = 7000;
const MAX_TOASTS = 3;

/**
 * Watches the shared "incidents" poll (no extra request) and raises a toast when a
 * NEW critical incident appears or an existing incident's score jumps. Nothing is
 * raised for the incidents already present on first load.
 */
export default function Toasts() {
  const { data: incidents } = usePolling(getIncidents, 3000, "incidents");
  const [toasts, setToasts] = useState([]);
  const previousRef = useRef(null);
  const navigate = useNavigate();

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  useEffect(() => {
    if (!Array.isArray(incidents)) return;
    const current = new Map(incidents.map((i) => [i.incident_id, i]));
    const previous = previousRef.current;
    previousRef.current = current;
    if (previous === null) return;

    const fresh = [];
    for (const incident of incidents) {
      const before = previous.get(incident.incident_id);
      const severity = String(incident.severity || "").toLowerCase();
      if (!before && severity === "critical") {
        fresh.push({ kind: "new", incident, from: null });
      } else if (before && Number(incident.risk_score) > Number(before.risk_score)) {
        fresh.push({ kind: "jump", incident, from: before.risk_score });
      }
    }
    if (fresh.length === 0) return;

    const stamped = fresh.map((t) => ({ ...t, id: `${t.incident.incident_id}:${t.incident.risk_score}` }));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- toasts are raised by changes in the polled incident list
    setToasts((list) => [...stamped, ...list.filter((t) => !stamped.some((s) => s.id === t.id))].slice(0, MAX_TOASTS));
    for (const t of stamped) window.setTimeout(() => dismiss(t.id), TOAST_MS);
  }, [incidents, dismiss]);

  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[360px] flex-col-reverse gap-2">
      {toasts.map((t) => {
        const s = severityOf(t.incident.severity);
        const Icon = t.kind === "new" ? Siren : TrendingUp;
        const title = t.kind === "new" ? "New critical incident" : "Incident risk increased";
        const what = t.incident.is_chain ? "Agent exfiltration chain detected" : t.incident.agent_context;
        return (
          <div
            key={t.id}
            className="toast-in pointer-events-auto relative overflow-hidden rounded-lg border border-line bg-card shadow-[var(--shadow-pop)]"
          >
            <span className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: s.hex }} aria-hidden="true" />
            <button
              type="button"
              onClick={() => {
                dismiss(t.id);
                navigate(`/incidents/${encodeURIComponent(t.incident.incident_id)}`);
              }}
              className="flex w-full items-start gap-3 py-3 pl-4 pr-9 text-left transition-colors duration-150 hover:bg-hover"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: s.soft, color: s.hex }}>
                <Icon size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[13px] font-semibold text-fg">
                  {title}
                  <span className={`text-xs font-medium ${s.text}`}>{s.label}</span>
                </span>
                <span className="mt-0.5 line-clamp-2 block text-xs leading-[18px] text-muted">
                  <span className="mono text-fg">{t.incident.source}</span> · {what}
                </span>
                <span className="mt-1.5 flex items-center gap-1 text-xs text-muted">
                  Risk{" "}
                  {t.from != null && (
                    <>
                      <span className="mono">{t.from}</span>→
                    </>
                  )}
                  <span className={`mono font-semibold ${s.text}`}>{t.incident.risk_score}/10</span>
                  <span className="ml-auto inline-flex items-center gap-0.5 font-medium text-accent">
                    View incident <ArrowRight size={12} />
                  </span>
                </span>
              </span>
            </button>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
              className="absolute right-2 top-2 rounded p-1 text-subtle transition-colors duration-150 hover:bg-hover hover:text-fg"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
