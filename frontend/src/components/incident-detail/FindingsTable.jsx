import { Fingerprint } from "lucide-react";
import { plural } from "../../lib/format.js";
import { CategoryBadge } from "../ui/Badges.jsx";
import Card from "../ui/Card.jsx";
import { EmptyState } from "../ui/States.jsx";

const AGENT_EVENT_TYPES = new Set(["file_read", "shell_exec"]);

function Evidence({ rule, value }) {
  return (
    <div className="min-w-0">
      <p className="mono text-xs text-muted">{rule}</p>
      <code className="mono mt-1 inline-block max-w-full break-all rounded border border-line bg-sunken px-1.5 py-0.5 text-xs text-fg">
        {value || "—"}
      </code>
    </div>
  );
}

function Origin({ fingerprint, eventId }) {
  return (
    <div className="mono text-xs">
      <p className={fingerprint ? "text-fg" : "text-subtle"} title={fingerprint ? "Keyed HMAC fingerprint" : "No fingerprint"}>
        {fingerprint || "—"}
      </p>
      <p className="mt-0.5 text-2xs text-muted">{eventId || "—"}</p>
    </div>
  );
}

/**
 * Scanner findings (redacted evidence + keyed fingerprint), then the agent's file
 * reads and shell commands from the session events, which are evidence too. The
 * two are counted separately so the totals match the API.
 */
export default function FindingsTable({ incident }) {
  const findings = incident.findings || [];
  const agentEvents = (incident.events || []).filter((e) => AGENT_EVENT_TYPES.has(e.event_type));
  const counts = [plural(findings.length, "finding"), agentEvents.length ? plural(agentEvents.length, "agent event") : null]
    .filter(Boolean)
    .join(" + ");

  return (
    <Card
      title="Security findings"
      subtitle="Redacted evidence only · fingerprints are keyed HMACs"
      icon={Fingerprint}
      actions={<span className="text-xs text-muted">{counts}</span>}
    >
      {findings.length + agentEvents.length === 0 ? (
        <EmptyState icon={Fingerprint} title="No findings in this session yet" hint="Agent actions alone can still raise the score." />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table min-w-[540px]">
            <thead>
              <tr>
                <th className="w-[120px]">Category</th>
                <th>Detection rule · redacted evidence</th>
                <th className="w-[140px]">Fingerprint · event</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((finding, index) => (
                <tr key={`${finding.rule}-${finding.event_id}-${index}`}>
                  <td className="align-top">
                    <CategoryBadge category={finding.category} />
                  </td>
                  <td>
                    <Evidence rule={finding.rule} value={finding.redacted_evidence} />
                  </td>
                  <td className="align-top">
                    <Origin fingerprint={finding.fingerprint} eventId={finding.event_id} />
                  </td>
                </tr>
              ))}
              {agentEvents.length > 0 && (
                <tr>
                  <td colSpan={3} className="bg-sunken py-1.5 text-2xs font-semibold uppercase tracking-wide text-muted">
                    Agent events in this session
                  </td>
                </tr>
              )}
              {agentEvents.map((event) => (
                <tr key={`event-${event.event_id}`}>
                  <td className="align-top">
                    <CategoryBadge category="AgentEvent" />
                  </td>
                  <td>
                    <Evidence rule={event.event_type} value={event.destination} />
                  </td>
                  <td className="align-top">
                    <Origin fingerprint={null} eventId={event.event_id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
