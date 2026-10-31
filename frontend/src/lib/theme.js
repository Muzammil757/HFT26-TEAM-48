// Hex mirrors of the CSS tokens in index.css, for SVG / recharts attributes.
export const TOKENS = {
  bg: "#f5f7fa",
  card: "#ffffff",
  sunken: "#f8fafc",
  line: "#e5eaf1",
  lineStrong: "#d3dbe6",
  fg: "#17243a",
  muted: "#667085",
  subtle: "#8a94a6",
  accent: "#315e9b",
  accentSoft: "#eef3fa",
};

// Chart series colours, checked with the dataviz palette validator (light surface):
// requests vs incidents, and approved vs shadow (CVD-separated by lightness; shadow
// bars also carry a hatch texture and a text label).
export const CHART = {
  requests: "#315e9b",
  incidents: "#c2410c",
  approved: "#3e9f78",
  shadow: "#a3221a",
};

// One severity palette for every page. Incidents are only created at score >= 3,
// so "low" exists as a fallback.
export const SEVERITY = {
  critical: {
    label: "Critical",
    hex: "#b42318",
    soft: "#fef3f2",
    badge: "border-critical-line bg-critical-soft text-critical",
    text: "text-critical",
    dot: "bg-critical",
  },
  high: {
    label: "High",
    hex: "#c2410c",
    soft: "#fff6ed",
    badge: "border-high-line bg-high-soft text-high",
    text: "text-high",
    dot: "bg-high",
  },
  medium: {
    label: "Medium",
    hex: "#b88600",
    soft: "#fefbe8",
    badge: "border-medium-line bg-medium-soft text-medium",
    text: "text-medium",
    dot: "bg-[#b88600]",
  },
  low: {
    label: "Low",
    hex: "#067647",
    soft: "#ecfdf3",
    badge: "border-low-line bg-low-soft text-low",
    text: "text-low",
    dot: "bg-low",
  },
};

export const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

export function severityOf(severity) {
  return SEVERITY[String(severity || "").toLowerCase()] || SEVERITY.low;
}

// Finding categories (Section 6.2) plus agent events shown as evidence.
export const CATEGORY = {
  Credential: { label: "Credential", badge: "border-critical-line bg-critical-soft text-critical" },
  PII: { label: "PII", badge: "border-high-line bg-high-soft text-high" },
  HighEntropy: { label: "High entropy", badge: "border-medium-line bg-medium-soft text-medium" },
  AgentAction: { label: "Agent action", badge: "border-[#c9d7ea] bg-accent-soft text-accent" },
  AgentEvent: { label: "Agent event", badge: "border-line-strong bg-sunken text-fg" },
};

export function categoryOf(category) {
  return CATEGORY[category] || { label: category || "Other", badge: "border-line-strong bg-sunken text-muted" };
}
