import { Cloud, FileText, Network, Terminal, Waypoints } from "lucide-react";
import { formatDuration, formatGap, formatTime, plural, secondsBetween } from "../../lib/format.js";
import { ApprovalLabel, CategoryBadge, ProviderName } from "../ui/Badges.jsx";
import Card from "../ui/Card.jsx";
import { EmptyState } from "../ui/States.jsx";

const EVENT_TYPES = {
  file_read: { label: "File read", icon: FileText, node: "border-[#e8c98a] bg-[#fdf6e7] text-[#8a6100]" },
  shell_exec: { label: "Shell execution", icon: Terminal, node: "border-[#c3cad6] bg-[#eef1f5] text-[#344054]" },
  ai_request: { label: "AI request", icon: Cloud, node: "border-[#c9d7ea] bg-accent-soft text-accent" },
  connection: { label: "Connection", icon: Network, node: "border-[#c9d7ea] bg-accent-soft text-accent" },
};

const AGENT_TYPES = new Set(["file_read", "shell_exec"]);

/**
 * The correlated session in time order: what the agent touched, what it ran, and
 * what it sent where. Each step shows its absolute time, its offset from the first
 * event (T+), the gap from the previous step, and the findings it carried.
 */
export default function EventTimeline({ incident, newEvents }) {
  const events = incident.events || [];
  const findingsByEvent = new Map();
  for (const f of incident.findings || []) {
    if (!f.event_id) continue;
    if (!findingsByEvent.has(f.event_id)) findingsByEvent.set(f.event_id, []);
    findingsByEvent.get(f.event_id).push(f);
  }
  // The exfiltration step of a chain: the last event that carried findings.
  const exfil = incident.is_chain ? [...events].reverse().find((e) => findingsByEvent.has(e.event_id)) : null;
  const firstAgent = events.find((e) => AGENT_TYPES.has(e.event_type));
  const start = events[0]?.timestamp;
  const span = events.length > 1 ? secondsBetween(start, events[events.length - 1].timestamp) : 0;
  const chainWindow = exfil && firstAgent ? secondsBetween(firstAgent.timestamp, exfil.timestamp) : null;

  return (
    <Card
      title="Event correlation timeline"
      subtitle={
        events.length
          ? `${plural(events.length, "correlated event")} that raised the score · ${formatDuration(span) || "0s"} span`
          : "Correlated events in time order"
      }
      icon={Waypoints}

    >
      {events.length === 0 ? (
        <EmptyState icon={Waypoints} title="No event details for this incident" />
      ) : (
        <>
          <ol className="px-4 py-3">
            {events.map((event, index) => {
              const type = EVENT_TYPES[event.event_type] || { label: event.event_type, icon: Network, node: "border-line bg-sunken text-muted" };
              const Icon = type.icon;
              const findings = findingsByEvent.get(event.event_id) || [];
              const isExfil = exfil?.event_id === event.event_id;
              const isNew = newEvents.has(event.event_id);
              const last = index === events.length - 1;
              const gap = last ? null : secondsBetween(event.timestamp, events[index + 1].timestamp);
              const offset = secondsBetween(start, event.timestamp);
              return (
                <li key={event.event_id} className={`grid grid-cols-[64px_32px_1fr] gap-x-3 ${isNew ? "enter" : ""}`}>
                  {/* time column */}
                  <div className="pt-1.5 text-right">
                    <p className="mono text-xs text-fg">{formatTime(event.timestamp)}</p>
                    <p className="mono text-2xs text-muted">T+{formatDuration(offset) || "0s"}</p>
                  </div>

                  {/* rail */}
                  <div className="flex flex-col items-center">
                    <span
                      className={`relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${type.node} ${
                        findings.length ? "ring-2 ring-critical/70 ring-offset-2 ring-offset-card" : ""
                      }`}
                    >
                      <Icon size={15} />
                    </span>
                    {!last && (
                      <span className="flex w-full flex-1 justify-center py-1" aria-hidden="true">
                        <span className={`h-full w-0.5 rounded-full ${events[index + 1].event_id === exfil?.event_id ? "bg-critical/60" : "bg-line-strong"} ${isNew ? "grow-y" : ""}`} />
                      </span>
                    )}
                  </div>

                  {/* content */}
                  <div className={`min-w-0 ${last ? "pb-1" : "pb-2"}`}>
                    <div
                      className={`rounded-lg border px-3 py-2 ${
                        isExfil ? "border-critical-line bg-critical-soft/60" : "border-line bg-card"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[13px] font-semibold text-fg">{type.label}</span>
                        {isExfil && (
                          <span className="rounded border border-critical-line bg-card px-1.5 text-2xs font-semibold uppercase tracking-wide text-critical">
                            Data sent
                          </span>
                        )}
                        {event.provider && (
                          <span className="ml-auto flex items-center gap-2 text-xs">
                            <ProviderName provider={event.provider} />
                            <ApprovalLabel sanctioned={event.sanctioned} />
                          </span>
                        )}
                      </div>
                      <p className="mono mt-1 break-all rounded bg-sunken px-2 py-1 text-xs text-fg">{event.destination || "No destination recorded"}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <span>
                          by <span className="mono text-fg">{event.source}</span>
                        </span>
                        {findings.length > 0 && (
                          <>
                            <span className="text-subtle">·</span>
                            <span className="font-medium text-critical">{plural(findings.length, "finding")}:</span>
                            {[...new Set(findings.map((f) => `${f.category}|${f.rule}`))].map((key) => {
                              const [category, rule] = key.split("|");
                              return <CategoryBadge key={key} category={category} label={rule} />;
                            })}
                          </>
                        )}
                      </div>
                    </div>
                    {!last && gap != null && (
                      <p className="mono py-1.5 pl-1 text-2xs text-muted" aria-label={`${gap} seconds later`}>
                        {formatGap(gap)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {incident.is_chain && chainWindow != null && (
            <p className="border-t border-line bg-sunken px-4 py-2 text-xs text-muted">
              <span className="font-semibold text-critical">Correlated chain:</span> first file or shell action to data sent in{" "}
              <span className="mono font-semibold text-fg">{formatDuration(chainWindow) || "0s"}</span> (rule: sensitive read → credential sent
              within 60 s, same session).
            </p>
          )}
        </>
      )}
    </Card>
  );
}
