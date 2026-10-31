import { Skeleton } from "../ui/States.jsx";

const TONES = {
  accent: "border-[#d5e0ee] bg-accent-soft text-accent",
  shadow: "border-shadow-line bg-shadow-soft text-shadow",
  high: "border-high-line bg-high-soft text-high",
  neutral: "border-line bg-sunken text-muted",
};

/**
 * Compact KPI: label, value, one line of real context underneath.
 * state: "loading" | "unavailable" | "ready".
 */
export default function KpiCard({ label, icon: Icon, tone = "accent", state, value, valueClass = "text-fg", footer }) {
  return (
    <div className="card flex min-w-0 flex-col px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        <span className={`flex h-7 w-7 items-center justify-center rounded-md border ${TONES[tone]}`}>
          <Icon size={15} />
        </span>
      </div>
      <div className="mt-1 h-[34px]">
        {state === "loading" ? (
          <Skeleton className="mt-1 h-7 w-20" />
        ) : state === "unavailable" ? (
          <p className="text-kpi font-semibold text-subtle">—</p>
        ) : (
          <p className={`text-kpi font-semibold tracking-tight ${valueClass}`}>{value}</p>
        )}
      </div>
      <div className="mt-2 min-h-5 text-xs text-muted">
        {state === "loading" ? <Skeleton className="h-3 w-3/4" /> : state === "unavailable" ? "Waiting for the backend" : footer}
      </div>
    </div>
  );
}
