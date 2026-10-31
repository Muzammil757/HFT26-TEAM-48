import { Bot, Cloud, Link2, Server, ShieldCheck, ShieldX } from "lucide-react";
import { categoryOf, severityOf } from "../../lib/theme.js";

const chipBase = "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border font-medium leading-4";
const chip = `${chipBase} px-1.5 py-0.5 text-xs`;

export function SeverityBadge({ severity, size = "md" }) {
  const s = severityOf(severity);
  return (
    <span className={`${size === "lg" ? `${chipBase} px-2 py-1 text-[13px]` : chip} ${s.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.label}
    </span>
  );
}

/** Approved (green) / Shadow (red): always icon + text, never colour alone. */
export function ApprovalLabel({ sanctioned, noun = "" }) {
  if (sanctioned == null) return <span className="text-xs text-subtle">—</span>;
  return sanctioned ? (
    <span className={`${chip} border-approved-line bg-approved-soft text-approved`}>
      <ShieldCheck size={12} strokeWidth={2.25} />
      Approved{noun && ` ${noun}`}
    </span>
  ) : (
    <span className={`${chip} border-shadow-line bg-shadow-soft text-shadow`}>
      <ShieldX size={12} strokeWidth={2.25} />
      Shadow{noun && ` ${noun}`}
    </span>
  );
}

export function ChainIndicator({ compact = false }) {
  return (
    <span
      title="Agent exfiltration chain: sensitive read followed by a credential sent within 60 s"
      className={`${chip} border-critical-line bg-card text-critical`}
    >
      <Link2 size={12} strokeWidth={2.25} />
      {compact ? "Chain" : "Agent chain"}
    </span>
  );
}

export function CategoryBadge({ category, label }) {
  const c = categoryOf(category);
  return <span className={`${chip} ${c.badge}`}>{label || c.label}</span>;
}

const LOCAL_PROVIDERS = new Set(["Ollama", "LM Studio"]);

/** Provider name with a generic icon (no brand logos): local server vs cloud API. */
export function ProviderName({ provider, className = "" }) {
  if (!provider) return <span className="text-subtle">—</span>;
  const Icon = LOCAL_PROVIDERS.has(provider) ? Server : provider.startsWith("Unknown") ? Bot : Cloud;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 text-fg ${className}`}>
      <Icon size={14} className="shrink-0 text-muted" />
      <span className="truncate">{provider}</span>
    </span>
  );
}
