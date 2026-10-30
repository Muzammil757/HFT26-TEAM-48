import { useEffect, useRef, useState } from "react";
import { Link2, ShieldCheck, ShieldOff } from "lucide-react";
import { useBackendOffline } from "../hooks/usePolling.js";

// One severity palette for every page: critical red, high orange, medium amber, low slate.
export const SEVERITY = {
  critical: {
    label: "Critical",
    badge: "border-red-500/30 bg-red-500/10 text-red-300",
    text: "text-red-400",
    bar: "bg-red-500",
    icon: "border-red-500/25 bg-red-500/10 text-red-400",
  },
  high: {
    label: "High",
    badge: "border-orange-500/30 bg-orange-500/10 text-orange-300",
    text: "text-orange-400",
    bar: "bg-orange-500",
    icon: "border-orange-500/25 bg-orange-500/10 text-orange-400",
  },
  medium: {
    label: "Medium",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    text: "text-amber-400",
    bar: "bg-amber-400",
    icon: "border-amber-500/25 bg-amber-500/10 text-amber-400",
  },
  low: {
    label: "Low",
    badge: "border-slate-500/30 bg-slate-500/10 text-slate-300",
    text: "text-slate-400",
    bar: "bg-slate-400",
    icon: "border-slate-500/25 bg-slate-500/10 text-slate-400",
  },
};

export function severityOf(severity) {
  return SEVERITY[String(severity || "").toLowerCase()] || SEVERITY.low;
}

export function SeverityBadge({ severity }) {
  const s = severityOf(severity);
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${s.badge}`}
    >
      {s.label}
    </span>
  );
}

export function ChainBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-fuchsia-500/30 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-300">
      <Link2 size={11} />
      Exfiltration chain
    </span>
  );
}

export function ProviderStatusBadge({ sanctioned }) {
  return sanctioned ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
      <ShieldCheck size={11} />
      Approved
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-red-500/25 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-400">
      <ShieldOff size={11} />
      Shadow
    </span>
  );
}

/** Same padding and max width on every page. */
export function PageShell({ children }) {
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5 px-6 py-6">
      {children}
    </div>
  );
}

export function PageHeader({ icon: Icon, title, subtitle, actions }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={20} className="text-cyan-400" />}
          <h1 className="text-xl font-semibold tracking-tight text-zinc-50">
            {title}
          </h1>
        </div>
        {subtitle && <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

/** "Live · 3s" while polling succeeds; red "Paused" while the backend is offline. */
export function LivePill() {
  const offline = useBackendOffline();
  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${
        offline
          ? "border-red-500/30 bg-red-500/10"
          : "border-zinc-800 bg-zinc-900"
      }`}
    >
      <span className="relative flex h-2 w-2">
        {!offline && (
          <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
        )}
        <span
          className={`relative h-2 w-2 rounded-full ${offline ? "bg-red-400" : "bg-emerald-400"}`}
        />
      </span>
      <span className={`text-xs ${offline ? "text-red-300" : "text-zinc-400"}`}>
        {offline ? "Paused · backend offline" : "Live · refresh 3s"}
      </span>
    </div>
  );
}

export function SectionHeader({ title, subtitle, right }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/** Ten-segment risk meter coloured by severity. */
export function ScoreMeter({ score, severity, className = "" }) {
  const s = severityOf(severity);
  const value = Math.max(0, Math.min(10, Number(score) || 0));
  return (
    <div className={`flex gap-0.5 ${className}`} aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 flex-1 rounded-sm transition-colors duration-500 ${
            i < value ? s.bar : "bg-zinc-800"
          }`}
        />
      ))}
    </div>
  );
}

export function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value ? String(value) : "Unknown time";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function formatClock(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Ids of items that appeared, or whose signature (e.g. risk score) changed, since
 * the previous poll. Nothing is highlighted on the first load. Each id stays
 * highlighted for `duration` ms.
 */
export function useHighlights(items, getId, getSignature = () => "", duration = 2500) {
  const [active, setActive] = useState(() => new Set());
  const previousRef = useRef(null);
  const timersRef = useRef(new Map());

  useEffect(() => {
    if (!Array.isArray(items)) return;
    const current = new Map(items.map((item) => [getId(item), String(getSignature(item))]));
    const previous = previousRef.current;
    previousRef.current = current;
    if (previous === null) return;

    const changed = [...current]
      .filter(([id, signature]) => !previous.has(id) || previous.get(id) !== signature)
      .map(([id]) => id);
    if (changed.length === 0) return;

    setActive((prev) => new Set([...prev, ...changed]));
    for (const id of changed) {
      window.clearTimeout(timersRef.current.get(id));
      timersRef.current.set(
        id,
        window.setTimeout(() => {
          setActive((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          timersRef.current.delete(id);
        }, duration),
      );
    }
    // getId/getSignature are plain accessors; re-running only on new data is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, duration]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
    };
  }, []);

  return active;
}
