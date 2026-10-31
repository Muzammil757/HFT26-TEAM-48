import { severityOf } from "../../lib/theme.js";

/** Ten-segment meter coloured by severity. */
export function ScoreMeter({ score, severity, className = "", height = "h-1" }) {
  const s = severityOf(severity);
  const value = Math.max(0, Math.min(10, Number(score) || 0));
  return (
    <div className={`flex gap-[2px] ${className}`} aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className={`${height} flex-1 rounded-[1px] transition-colors duration-200`}
          style={{ backgroundColor: i < value ? s.hex : "#e5eaf1" }}
        />
      ))}
    </div>
  );
}

/** "8/10" with a meter underneath, for tables. */
export function ScoreCell({ score, severity, pop = false }) {
  const s = severityOf(severity);
  return (
    <div className="w-[68px]" aria-label={`Risk score ${score} out of 10`}>
      <p className="mono text-sm font-semibold leading-5 text-fg">
        <span key={score} className={`${s.text} ${pop ? "score-pop" : ""}`}>
          {score}
        </span>
        <span className="text-xs font-normal text-subtle">/10</span>
      </p>
      <ScoreMeter score={score} severity={severity} className="mt-1" />
    </div>
  );
}
