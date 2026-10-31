import { ArrowRight, ChevronRight, Cloud, FileText, ListChecks, Network, ScrollText, Sparkles, Terminal } from "lucide-react";
import { formatDuration, plural, secondsBetween } from "../../lib/format.js";
import Card from "../ui/Card.jsx";
import { AnalyzeButton } from "./AnalysisPanel.jsx";

const STEP = {
  file_read: { label: "File read", icon: FileText },
  shell_exec: { label: "Shell", icon: Terminal },
  ai_request: { label: "AI request", icon: Cloud },
  connection: { label: "Connection", icon: Network },
};

const CATEGORY_WORDS = {
  Credential: ["credential", "credentials"],
  PII: ["personal-data item", "personal-data items"],
  HighEntropy: ["secret-like string", "secret-like strings"],
  AgentAction: ["risky agent action", "risky agent actions"],
};

/** 2-4 plain sentences built only from the incident's own fields. */
function whatHappened(incident) {
  const events = incident.events || [];
  const findings = incident.findings || [];
  const lines = [];

  const span = events.length > 1 ? secondsBetween(events[0].timestamp, events[events.length - 1].timestamp) : null;
  const approval = incident.sanctioned ? "an approved provider" : "an unapproved (shadow) provider";
  lines.push(
    `${incident.source} used ${incident.provider}, ${approval}` +
      (events.length > 1 ? `, across ${events.length} correlated events over ${formatDuration(span) || "0s"}.` : "."),
  );

  const files = events.filter((e) => e.event_type === "file_read").map((e) => e.destination);
  const shells = events.filter((e) => e.event_type === "shell_exec").map((e) => e.destination);
  if (files.length || shells.length) {
    const parts = [];
    if (files.length) parts.push(`read ${files.join(", ")}`);
    if (shells.length) parts.push(`ran ${shells.map((c) => `\`${c}\``).join(", ")}`);
    lines.push(`Before that, it ${parts.join(" and ")}.`);
  }

  if (findings.length) {
    const byCategory = new Map();
    for (const f of findings) {
      if (!byCategory.has(f.category)) byCategory.set(f.category, new Set());
      byCategory.get(f.category).add(f.rule);
    }
    const parts = [...byCategory].map(([category, rules]) => {
      const n = findings.filter((f) => f.category === category).length;
      const [one, many] = CATEGORY_WORDS[category] || ["finding", "findings"];
      return `${n} ${n === 1 ? one : many} (${[...rules].join(", ")})`;
    });
    lines.push(`The detector found ${parts.join(", ")} in the outgoing request.`);
  }

  if (incident.is_chain) {
    lines.push("This matches the exfiltration-chain rule: a sensitive read followed by a credential sent within 60 s in the same session.");
  }
  return lines;
}

function ChainRow({ events, onOpenTimeline }) {
  const start = events[0]?.timestamp;
  return (
    <button
      type="button"
      onClick={onOpenTimeline}
      title="Open the full timeline"
      className="mt-3 flex w-full flex-wrap items-center gap-1.5 rounded-lg border border-critical-line bg-critical-soft/50 px-3 py-2 text-left transition-colors duration-150 hover:bg-critical-soft"
    >
      {events.map((event, i) => {
        const step = STEP[event.event_type] || STEP.connection;
        const Icon = step.icon;
        return (
          <span key={event.event_id} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight size={14} className="text-critical/60" aria-hidden="true" />}
            <span className="flex items-center gap-1.5 rounded-md border border-line bg-card px-2 py-1 text-xs text-fg">
              <Icon size={13} className="text-muted" />
              {step.label}
              <span className="mono text-2xs text-muted">T+{formatDuration(secondsBetween(start, event.timestamp)) || "0s"}</span>
            </span>
          </span>
        );
      })}
    </button>
  );
}

function firstSentence(text) {
  const match = String(text || "").match(/^.*?[.!?](\s|$)/);
  return (match ? match[0] : String(text || "")).trim();
}

export default function SummaryTab({ incident, analysisState, offline, openTab }) {
  const events = incident.events || [];
  const factors = [...(incident.score_breakdown || [])].sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0));
  const { analysis, stale, analyzing, error } = analysisState;

  return (
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-12">
      <Card title="What happened" icon={ScrollText} className="lg:col-span-7">
        <div className="px-4 py-3">
          <ul className="space-y-1.5">
            {whatHappened(incident).map((line) => (
              <li key={line} className="flex gap-2 text-[13px] leading-5 text-fg">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" aria-hidden="true" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          {incident.is_chain && events.length > 0 && <ChainRow events={events} onOpenTimeline={() => openTab("timeline")} />}
        </div>
      </Card>

      <div className="space-y-3 lg:col-span-5">
        <Card
          title="Top risk factors"
          icon={ListChecks}
          actions={
            <button type="button" onClick={() => openTab("score")} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-strong">
              Full breakdown <ArrowRight size={12} />
            </button>
          }
        >
          <ul className="px-4 py-2">
            {factors.slice(0, 3).map((f) => (
              <li key={f.factor} className="flex justify-between gap-3 py-1 text-[13px] text-fg">
                <span>{f.factor}</span>
                <span className="mono font-semibold">+{f.points}</span>
              </li>
            ))}
            {factors.length > 3 && <li className="py-1 text-xs text-muted">+ {plural(factors.length - 3, "more factor")}</li>}
            {factors.length === 0 && <li className="py-1 text-xs text-muted">No score factors available.</li>}
          </ul>
        </Card>

        <Card title="AI analysis" icon={Sparkles}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            {analyzing ? (
              <p className="text-[13px] text-muted">Analyzing redacted evidence…</p>
            ) : analysis && !stale ? (
              <p className="min-w-0 flex-1 text-[13px] leading-5 text-fg">{firstSentence(analysis.summary) || "Analysis ready."}</p>
            ) : stale ? (
              <p className="min-w-0 flex-1 text-[13px] text-medium">The incident changed since the last analysis.</p>
            ) : offline ? (
              <p className="min-w-0 flex-1 text-[13px] text-muted">AI analysis is unavailable while the backend is offline.</p>
            ) : (
              <p className="min-w-0 flex-1 text-[13px] text-muted">AI analysis has not been generated for this incident.</p>
            )}
            {analysis && !stale && !analyzing ? (
              <button type="button" onClick={() => openTab("analysis")} className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-strong">
                View analysis <ArrowRight size={12} />
              </button>
            ) : (
              <AnalyzeButton state={analysisState} offline={offline} size="sm" />
            )}
            {error && !analyzing && <p className="w-full text-xs text-critical">Analysis failed. {error}</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
