import { useEffect, useRef, useState } from "react";
import { Bot, Cloud, Link2, Server, ShieldCheck, ShieldOff } from "lucide-react";
import { useBackendOffline } from "../hooks/usePolling.js";

// Hex mirrors of the CSS tokens in index.css, for SVG/recharts attributes.
export const TOKENS = {
  bg: "#07090d",
  card: "#0d1117",
  raised: "#141a22",
  line: "#1e2630",
  lineStrong: "#2b3542",
  fg: "#e8ecf2",
  muted: "#9aa5b4",
  subtle: "#657083",
  accent: "#22d3ee",
  critical: "#f43f5e",
  high: "#fb923c",
  medium: "#fbbf24",
  shadow: "#f87171",
  approved: "#34d399",
};

// One severity palette for every page. Incidents never score below 3, so "low"
// only exists as a fallback.
export const SEVERITY = {
  critical: {
    label: "Critical",
    hex: TOKENS.critical,
    badge: "border-critical/35 bg-critical/10 text-critical",
    text: "text-critical",
    bar: "bg-critical",
    icon: "border-critical/30 bg-critical/10 text-critical",
  },
  high: {
    label: "High",
    hex: TOKENS.high,
    badge: "border-high/35 bg-high/10 text-high",
    text: "text-high",
    bar: "bg-high",
    icon: "border-high/30 bg-high/10 text-high",
  },
  medium: {
    label: "Medium",
    hex: TOKENS.medium,
    badge: "border-medium/35 bg-medium/10 text-medium",
    text: "text-medium",
    bar: "bg-medium",
    icon: "border-medium/30 bg-medium/10 text-medium",
  },
  low: {
    label: "Low",
    hex: TOKENS.subtle,
    badge: "border-line-strong bg-raised text-muted",
    text: "text-muted",
    bar: "bg-subtle",
    icon: "border-line-strong bg-raised text-muted",
  },
};

export function severityOf(severity) {
  return SEVERITY[String(severity || "").toLowerCase()] || SEVERITY.low;
}

const numberFormat = new Intl.NumberFormat("en-IN");
export const formatNumber = (value) => numberFormat.format(Number(value) || 0);

// ---------------------------------------------------------------- badges

const chip = "inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold";

export function SeverityBadge({ severity }) {
  const s = severityOf(severity);
  return <span className={`${chip} uppercase tracking-wider ${s.badge}`}>{s.label}</span>;
}

export function ChainBadge() {
  return (
    <span className={`${chip} border-critical/35 bg-critical/10 text-critical`}>
      <Link2 size={12} />
      Exfiltration chain
    </span>
  );
}

export function ProviderStatusBadge({ sanctioned }) {
  return sanctioned ? (
    <span className={`${chip} border-approved/30 bg-approved/10 text-approved`}>
      <ShieldCheck size={12} />
      Approved
    </span>
  ) : (
    <span className={`${chip} border-shadow/30 bg-shadow/10 text-shadow`}>
      <ShieldOff size={12} />
      Shadow
    </span>
  );
}

const LOCAL_PROVIDERS = new Set(["Ollama", "LM Studio"]);

/** Provider name with a generic icon (no brand logos), coloured by status. */
export function ProviderChip({ provider, sanctioned }) {
  const Icon = LOCAL_PROVIDERS.has(provider) ? Server : provider?.startsWith("Unknown") ? Bot : Cloud;
  return (
    <span
      className={`${chip} font-medium ${
        sanctioned
          ? "border-approved/25 bg-approved/5 text-fg"
          : "border-shadow/30 bg-shadow/5 text-fg"
      }`}
    >
      <Icon size={13} className={sanctioned ? "text-approved" : "text-shadow"} />
      {provider}
    </span>
  );
}

export function PrivacyBadge({ className = "" }) {
  return (
    <div
      className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-approved/20 bg-approved/5 px-3 py-1.5 text-xs text-approved ${className}`}
    >
      <ShieldCheck size={14} className="shrink-0" />
      <span className="font-semibold">
        Raw secrets stored: <span className="mono">0</span>
      </span>
      <span className="text-approved/50">·</span>
      <span>Evidence redacted</span>
      <span className="text-approved/50">·</span>
      <span>Fingerprint only</span>
    </div>
  );
}

// ---------------------------------------------------------------- layout

/** Same padding and max width on every page (8px grid). */
export function PageShell({ children }) {
  return <div className="mx-auto w-full max-w-[1440px] space-y-6 px-6 py-6">{children}</div>;
}

export function PageHeader({ icon: Icon, title, subtitle, actions }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={22} className="text-accent" />}
          <h1 className="text-title font-semibold tracking-tight text-fg">{title}</h1>
        </div>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Card with the one consistent header used across the app. */
export function Card({ title, subtitle, icon: Icon, actions, children, className = "", bodyClassName = "" }) {
  return (
    <section className={`card min-w-0 overflow-hidden ${className}`}>
      {title && (
        <div className="flex min-h-14 items-center justify-between gap-4 border-b border-line px-6 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {Icon && <Icon size={16} className="shrink-0 text-accent" />}
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-fg">{title}</h2>
              {subtitle && <p className="truncate text-xs text-subtle">{subtitle}</p>}
            </div>
          </div>
          {actions}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function Skeleton({ className = "", style }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}

export function EmptyState({ icon: Icon, title, hint, className = "" }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 px-6 py-8 text-center ${className}`}>
      {Icon && (
        <span className="mb-1 rounded-xl border border-line bg-raised p-3 text-subtle">
          <Icon size={20} />
        </span>
      )}
      <p className="text-sm font-medium text-muted">{title}</p>
      {hint && <p className="max-w-sm text-xs text-subtle">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- live status

/** Header indicator: pulsing "Monitoring live" or red "Offline". */
export function LiveIndicator() {
  const offline = useBackendOffline();
  return (
    <div
      role="status"
      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-200 ${
        offline ? "border-critical/40 bg-critical/10 text-critical" : "border-line bg-card text-muted"
      }`}
    >
      <span className="relative flex h-2 w-2">
        {!offline && <span className="absolute h-full w-full animate-ping rounded-full bg-approved opacity-50" />}
        <span className={`relative h-2 w-2 rounded-full ${offline ? "bg-critical" : "bg-approved"}`} />
      </span>
      {offline ? (
        <span>Offline · retrying every 3s</span>
      ) : (
        <span>
          Monitoring live <span className="text-subtle">·</span> <span className="mono">127.0.0.1</span>
        </span>
      )}
    </div>
  );
}

/** Kept for pages that still render a status pill. */
export const LivePill = LiveIndicator;

// ---------------------------------------------------------------- numbers & charts

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Number that counts from its previous value (0 on mount) to the new one. */
export function CountUp({ value, duration = 600, format = formatNumber }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(prefersReducedMotion() ? target : 0);
  const shownRef = useRef(shown);

  useEffect(() => {
    const from = shownRef.current;
    if (from === target || prefersReducedMotion()) {
      shownRef.current = target;
      setShown(target);
      return undefined;
    }
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const next = Math.round(from + (target - from) * (1 - (1 - p) ** 3));
      shownRef.current = next;
      setShown(next);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return <span className="tabular">{format(shown)}</span>;
}

/** Tiny area sparkline; flat line when there is not enough data. */
export function Sparkline({ values, color = TOKENS.accent, className = "" }) {
  const data = values?.length ? values : [0];
  const max = Math.max(1, ...data);
  const points = data.map((v, i) => {
    const x = data.length === 1 ? 50 : (i / (data.length - 1)) * 100;
    const y = 30 - (v / max) * 26;
    return [x, y];
  });
  if (points.length === 1) points.unshift([0, points[0][1]]);
  const line = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={`h-8 w-full ${className}`} aria-hidden="true">
      <polygon points={`0,32 ${line} 100,32`} fill={color} opacity="0.12" />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Donut showing part/total, e.g. shadow share of AI traffic. */
export function Ring({ part, total, color = TOKENS.shadow, rest = TOKENS.approved, size = 64 }) {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const share = total > 0 ? Math.min(1, part / total) : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={total > 0 ? rest : TOKENS.line} strokeOpacity={total > 0 ? 0.35 : 1} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - share)}
          style={{ transition: "stroke-dashoffset 250ms ease-out" }}
        />
      </svg>
      <span className="mono absolute inset-0 flex items-center justify-center text-xs font-semibold text-fg">
        {Math.round(share * 100)}%
      </span>
    </div>
  );
}

/** Circular risk gauge (score/10), coloured by severity, animating on change. */
export function RiskGauge({ score, severity, size = 136 }) {
  const s = severityOf(severity);
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const value = Math.max(0, Math.min(10, Number(score) || 0));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TOKENS.line} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={s.hex}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 10)}
          style={{
            transition: "stroke-dashoffset 250ms ease-out, stroke 250ms ease-out",
            filter: `drop-shadow(0 0 6px ${s.hex}66)`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className={`mono text-display font-semibold ${s.text}`}>
          <CountUp value={value} duration={250} />
        </p>
        <p className="mono mt-1 text-xs text-subtle">/ 10 risk</p>
      </div>
    </div>
  );
}

/** Ten-segment risk meter coloured by severity (compact lists). */
export function ScoreMeter({ score, severity, className = "" }) {
  const s = severityOf(severity);
  const value = Math.max(0, Math.min(10, Number(score) || 0));
  return (
    <div className={`flex gap-0.5 ${className}`} aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className={`h-1 flex-1 rounded-sm transition-colors duration-200 ${i < value ? s.bar : "bg-line-strong"}`}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- time

const MINUTE = 60_000;
const MAX_BUCKETS = 60;

/**
 * Turn the sparse per-minute timeline into continuous buckets (zero where nothing
 * happened) from the first minute up to now, so gaps read as gaps.
 */
export function buildTimeline(rows) {
  const points = (rows || [])
    .map((row) => ({
      t: Date.parse(row.minute),
      requests: Number(row.requests) || 0,
      incidents: Number(row.incidents) || 0,
    }))
    .filter((p) => !Number.isNaN(p.t))
    .sort((a, b) => a.t - b.t);
  if (points.length === 0) return [];

  const first = points[0].t;
  const lastData = points[points.length - 1].t;
  const nowMinute = Math.floor(Date.now() / MINUTE) * MINUTE;
  const last = nowMinute > lastData && nowMinute - lastData < 3 * 60 * MINUTE ? nowMinute : lastData;

  const minutes = Math.round((last - first) / MINUTE) + 1;
  const step = Math.max(1, Math.ceil(minutes / MAX_BUCKETS)) * MINUTE;
  const buckets = new Map();
  for (let t = first; t <= last; t += step) buckets.set(t, { t, requests: 0, incidents: 0 });
  for (const p of points) {
    const bucket = buckets.get(first + Math.floor((p.t - first) / step) * step);
    if (bucket) {
      bucket.requests += p.requests;
      bucket.incidents += p.incidents;
    }
  }
  return [...buckets.values()];
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
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function formatGap(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return "";
  if (seconds < 60) return `+${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `+${m}m ${String(s).padStart(2, "0")}s` : `+${m}m`;
}

// ---------------------------------------------------------------- highlights

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
