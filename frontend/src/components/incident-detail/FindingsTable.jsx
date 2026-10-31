import { Fragment, useState } from "react";
import { ChevronRight, Fingerprint } from "lucide-react";
import { plural } from "../../lib/format.js";
import { CategoryBadge } from "../ui/Badges.jsx";
import Card from "../ui/Card.jsx";
import { EmptyState } from "../ui/States.jsx";

const AGENT_EVENT_TYPES = new Set(["file_read", "shell_exec"]);

function Evidence({ value }) {
  return (
    <code className="mono inline-block max-w-full break-all rounded border border-line bg-sunken px-1.5 py-0.5 text-xs text-fg">{value || "—"}</code>
  );
}

/**
 * Scanner findings plus the agent's file reads and shell commands (session
 * events, evidence too). Fingerprint and event id stay in an expandable row.
 */
export default function FindingsTable({ incident }) {
  const [open, setOpen] = useState(() => new Set());
  const findings = incident.findings || [];
  const agentEvents = (incident.events || []).filter((e) => AGENT_EVENT_TYPES.has(e.event_type));
  const counts = [plural(findings.length, "finding"), agentEvents.length ? plural(agentEvents.length, "agent event") : null]
    .filter(Boolean)
    .join(" + ");

  const rows = [
    ...findings.map((f, i) => ({
      key: `f-${f.rule}-${f.event_id}-${i}`,
      category: f.category,
      rule: f.rule,
      evidence: f.redacted_evidence,
      fingerprint: f.fingerprint,
      eventId: f.event_id,
    })),
    ...agentEvents.map((e) => ({
      key: `e-${e.event_id}`,
      category: "AgentEvent",
      rule: e.event_type,
      evidence: e.destination,
      fingerprint: null,
      eventId: e.event_id,
    })),
  ];
  const toggle = (key) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Card
      title="Findings"
      subtitle="Evidence is redacted · expand a row for its fingerprint and event"
      icon={Fingerprint}
      actions={<span className="text-xs text-muted">{counts}</span>}
    >
      {rows.length === 0 ? (
        <EmptyState icon={Fingerprint} title="No findings in this session yet" hint="Agent actions alone can still raise the score." />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table min-w-[560px]">
            <thead>
              <tr>
                <th className="w-8" aria-label="Details" />
                <th className="w-[130px]">Category</th>
                <th className="w-[230px]">Rule</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const expanded = open.has(row.key);
                return (
                  <Fragment key={row.key}>
                    <tr className="row-link" onClick={() => toggle(row.key)}>
                      <td className="pr-0">
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-label={expanded ? "Hide details" : "Show fingerprint and event"}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggle(row.key);
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-hover hover:text-fg"
                        >
                          <ChevronRight size={14} className={`transition-transform duration-150 ${expanded ? "rotate-90" : ""}`} />
                        </button>
                      </td>
                      <td>
                        <CategoryBadge category={row.category} />
                      </td>
                      <td className="mono text-xs text-fg">{row.rule}</td>
                      <td>
                        <Evidence value={row.evidence} />
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-sunken">
                        <td />
                        <td colSpan={3} className="text-xs">
                          <dl className="flex flex-wrap gap-x-8 gap-y-1">
                            <div className="flex gap-2">
                              <dt className="text-muted">Fingerprint</dt>
                              <dd className="mono text-fg">
                                {row.fingerprint || <span className="text-muted">none (event metadata, not a matched value)</span>}
                              </dd>
                            </div>
                            <div className="flex gap-2">
                              <dt className="text-muted">Event</dt>
                              <dd className="mono text-fg">{row.eventId || "—"}</dd>
                            </div>
                          </dl>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
