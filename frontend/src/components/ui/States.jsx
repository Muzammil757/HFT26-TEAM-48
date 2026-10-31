import { CircleAlert, Info, TriangleAlert } from "lucide-react";

export function Skeleton({ className = "", style }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}

export function EmptyState({ icon: Icon, title, hint, action, className = "" }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-1.5 px-6 py-10 text-center ${className}`}>
      {Icon && (
        <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-sunken text-muted">
          <Icon size={18} />
        </span>
      )}
      <p className="text-sm font-medium text-fg">{title}</p>
      {hint && <p className="max-w-sm text-xs leading-5 text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const ALERT_TONES = {
  error: { cls: "border-critical-line bg-critical-soft text-critical", icon: CircleAlert },
  warning: { cls: "border-medium-line bg-medium-soft text-medium", icon: TriangleAlert },
  info: { cls: "border-[#c9d7ea] bg-accent-soft text-accent-strong", icon: Info },
};

export function InlineAlert({ tone = "info", children, className = "" }) {
  const t = ALERT_TONES[tone] || ALERT_TONES.info;
  const Icon = t.icon;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${t.cls} ${className}`}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Table body placeholder rows. */
export function TableSkeleton({ rows = 5, cols = 5 }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-6 px-4 py-3.5">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={`h-3.5 ${c === 1 ? "flex-[3]" : "flex-1"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}
