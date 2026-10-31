import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Link2 } from "lucide-react";
import { formatDateTime, shortId } from "../../lib/format.js";
import { severityOf } from "../../lib/theme.js";
import { ApprovalLabel, ProviderName, SeverityBadge } from "../ui/Badges.jsx";
import { SortHeader } from "../ui/Controls.jsx";
import { ScoreCell } from "../ui/RiskScore.jsx";

/**
 * Incident rows; the whole row opens the incident. `compact` (Overview) drops the
 * approval column. `sort` = { key: "score" | "recent", dir }, `onSort(key)` makes
 * the score and time headers clickable.
 */
export default function IncidentsTable({ incidents, highlighted = new Set(), compact = false, sort, onSort }) {
  const navigate = useNavigate();
  const open = (incident) => navigate(`/incidents/${encodeURIComponent(incident.incident_id)}`);
  const dirFor = (key) => (sort?.key === key ? sort.dir : null);

  return (
    <div className="overflow-x-auto">
      <table className="data-table min-w-[860px]">
        <thead>
          <tr>
            <th className="w-[104px]">Severity</th>
            {!compact &&
              (onSort ? (
                <SortHeader direction={dirFor("score")} onClick={() => onSort("score")}>Risk</SortHeader>
              ) : (
                <th>Risk</th>
              ))}
            <th>Incident</th>
            <th className="w-[150px]">Provider</th>
            <th className="w-[140px]">Source</th>
            {!compact && <th className="w-[112px]">Approval</th>}
            {compact && <th>Risk</th>}
            {onSort ? (
              <SortHeader direction={dirFor("recent")} onClick={() => onSort("recent")}>Detected</SortHeader>
            ) : (
              <th className="w-[150px]">Detected</th>
            )}
            <th className="w-8" aria-label="Open" />
          </tr>
        </thead>
        <tbody>
          {incidents.map((incident) => {
            const flash = highlighted.has(incident.incident_id);
            const s = severityOf(incident.severity);
            const critical = String(incident.severity).toLowerCase() === "critical";
            return (
              <tr
                key={incident.incident_id}
                className={`row-link group ${flash ? "flash" : ""}`}
                onClick={() => open(incident)}
                onKeyDown={(event) => event.key === "Enter" && open(incident)}
                tabIndex={0}
                style={critical ? { boxShadow: `inset 3px 0 0 ${s.hex}` } : undefined}
              >
                <td>
                  <SeverityBadge severity={incident.severity} />
                </td>
                {!compact && (
                  <td className="w-[92px]">
                    <ScoreCell score={incident.risk_score} severity={incident.severity} pop={flash} />
                  </td>
                )}
                <td className="w-full max-w-0">
                  <div className="flex min-w-0 items-start gap-2">
                    {incident.is_chain && (
                      <span
                        title="Agent exfiltration chain"
                        className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded border border-critical-line bg-critical-soft px-1 py-px text-2xs font-semibold text-critical"
                      >
                        <Link2 size={11} strokeWidth={2.5} />
                        Chain
                      </span>
                    )}
                    <Link
                      to={`/incidents/${encodeURIComponent(incident.incident_id)}`}
                      onClick={(event) => event.stopPropagation()}
                      title={incident.agent_context}
                      className="line-clamp-2 font-medium text-fg group-hover:text-accent-strong"
                      tabIndex={-1}
                    >
                      {incident.agent_context || "Security incident"}
                    </Link>
                  </div>
                  <p className="mono mt-0.5 text-2xs text-subtle">{shortId(incident.incident_id)}</p>
                </td>
                <td>
                  <ProviderName provider={incident.provider} />
                </td>
                <td>
                  <span className="mono block max-w-[140px] truncate text-xs text-fg" title={incident.source}>
                    {incident.source}
                  </span>
                </td>
                {!compact && (
                  <td>
                    <ApprovalLabel sanctioned={incident.sanctioned} />
                  </td>
                )}
                {compact && (
                  <td className="w-[92px]">
                    <ScoreCell score={incident.risk_score} severity={incident.severity} pop={flash} />
                  </td>
                )}
                <td className="whitespace-nowrap text-xs text-muted">{formatDateTime(incident.timestamp)}</td>
                <td className="pr-3 text-subtle">
                  <ChevronRight size={16} className="transition-colors duration-150 group-hover:text-accent" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
