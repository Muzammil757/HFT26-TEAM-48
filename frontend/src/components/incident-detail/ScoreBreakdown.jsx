import { ListChecks } from "lucide-react";
import { severityOf } from "../../lib/theme.js";
import Card from "../ui/Card.jsx";

// Shade per factor (same hue = the incident's severity), strongest first.
const SEGMENT_ALPHA = [1, 0.78, 0.6, 0.46, 0.34, 0.26, 0.2];

function withAlpha(hex, alpha) {
  return `${hex}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
}

/** Explainable score: every factor with its points, the 10-point scale, and the cap. */
export default function ScoreBreakdown({ incident, newFactors }) {
  const s = severityOf(incident.severity);
  const breakdown = incident.score_breakdown || [];
  const raw = breakdown.reduce((sum, b) => sum + (Number(b.points) || 0), 0);
  const scale = Math.max(raw, 10);

  return (
    <Card title="Risk score breakdown" subtitle="Each factor counted once; the total is capped at 10" icon={ListChecks}>
      <div className="px-4 pb-1 pt-4">
        <div className="relative">
          <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded bg-line">
            {breakdown.map((item, i) => (
              <div
                key={item.factor}
                title={`${item.factor}: +${item.points}`}
                className={`h-full transition-[width] duration-200 ease-out ${newFactors.has(item.factor) ? "enter" : ""}`}
                style={{
                  width: `${((Number(item.points) || 0) / scale) * 100}%`,
                  backgroundColor: withAlpha(s.hex, SEGMENT_ALPHA[i] ?? 0.2),
                }}
              />
            ))}
          </div>
          {raw > 10 && (
            <div className="absolute -top-1 bottom-0" style={{ left: `${(10 / scale) * 100}%` }} aria-hidden="true">
              <div className="h-5 w-0.5 bg-fg" />
            </div>
          )}
        </div>
        <div className="mono relative mt-1.5 flex h-4 justify-between text-2xs text-muted">
          <span>0</span>
          {raw > 10 && (
            <span className="absolute -translate-x-1/2 font-semibold text-fg" style={{ left: `${(10 / scale) * 100}%` }}>
              cap 10
            </span>
          )}
          {/* Near the cap the two labels would collide; the total row still states the raw points. */}
          <span>{raw <= 10 ? "10" : 10 / scale < 0.8 ? `${raw} pts` : ""}</span>
        </div>
      </div>

      <ul className="px-1 pb-1">
        {breakdown.map((item, i) => (
          <li
            key={item.factor}
            className={`flex items-center justify-between gap-3 rounded-md px-3 py-1.5 ${newFactors.has(item.factor) ? "enter flash" : ""}`}
          >
            <span className="flex min-w-0 items-start gap-2.5 text-[13px] leading-5 text-fg">
              <span className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: withAlpha(s.hex, SEGMENT_ALPHA[i] ?? 0.2) }} />
              <span>{item.factor}</span>
            </span>
            <span className="mono shrink-0 text-[13px] font-semibold text-fg">+{item.points}</span>
          </li>
        ))}
        {breakdown.length === 0 && <li className="px-3 py-3 text-sm text-muted">No score factors available.</li>}
      </ul>
      <div className="flex items-center justify-between border-t border-line bg-sunken px-4 py-2.5">
        <span className="text-[13px] font-semibold text-fg">
          Total
          {raw > 10 && <span className="ml-2 text-xs font-normal text-muted">{raw} points, capped at 10</span>}
        </span>
        <span className={`mono text-lg font-semibold ${s.text}`}>{incident.risk_score}/10</span>
      </div>
    </Card>
  );
}
