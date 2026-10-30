import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, Siren, TrendingUp, X } from "lucide-react";
import { getIncidents } from "../api.js";
import usePolling from "../hooks/usePolling.js";
import { severityOf } from "./ui.jsx";

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
      const what = incident.is_chain ? "Exfiltration chain detected" : incident.agent_context;
      if (!before && severity === "critical") {
        fresh.push({ kind: "new", incident, what, from: null });
      } else if (before && Number(incident.risk_score) > Number(before.risk_score)) {
        fresh.push({ kind: "jump", incident, what, from: before.risk_score });
      }
    }
    if (fresh.length === 0) return;

    const stamped = fresh.map((t) => ({ ...t, id: `${t.incident.incident_id}:${t.incident.risk_score}` }));
    setToasts((list) => [...stamped, ...list.filter((t) => !stamped.some((s) => s.id === t.id))].slice(0, MAX_TOASTS));
    for (const t of stamped) window.setTimeout(() => dismiss(t.id), TOAST_MS);
  }, [incidents, dismiss]);

  return (
    <div aria-live="polite" className="pointer-events-none fixed right-6 top-16 z-50 flex w-[360px] flex-col gap-2">
      {toasts.map((t) => {
        const s = severityOf(t.incident.severity);
        const Icon = t.kind === "new" ? Siren : TrendingUp;
        return (
          <div
            key={t.id}
            className="toast-in pointer-events-auto relative overflow-hidden rounded-xl border border-line-strong bg-raised"
            style={{ boxShadow: `inset 3px 0 0 ${s.hex}, var(--shadow-raised)` }}
          >
            <button
              type="button"
              onClick={() => {
                dismiss(t.id);
                navigate(`/incidents/${encodeURIComponent(t.incident.incident_id)}`);
              }}
              className="flex w-full items-start gap-3 py-3 pl-4 pr-10 text-left transition-colors duration-150 hover:bg-white/[0.03]"
            >
              <span className={`mt-0.5 rounded-lg border p-1.5 ${s.icon}`}>
                <Icon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-fg">
                  <span className={s.text}>{s.label.toUpperCase()}</span>
                  <span className="text-subtle"> · </span>
                  <span className="mono">{t.incident.source}</span>
                  <span className="text-subtle"> · </span>
                  {t.what}
                </span>
                <span className="mt-1 flex items-center gap-1 text-xs text-muted">
                  {t.from != null ? (
                    <>
                      Risk <span className="mono text-fg">{t.from}</span> →{" "}
                      <span className={`mono font-semibold ${s.text}`}>{t.incident.risk_score}</span>
                    </>
                  ) : (
                    <>
                      New incident · risk <span className={`mono font-semibold ${s.text}`}>{t.incident.risk_score}</span>
                    </>
                  )}
                  <span className="text-subtle">·</span>
                  <span className="text-accent">Open</span>
                  <ArrowUpRight size={12} className="text-accent" />
                </span>
              </span>
            </button>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
              className="absolute right-2 top-2 rounded-md p-1 text-subtle transition-colors duration-150 hover:bg-white/5 hover:text-fg"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
