import { formatNumber } from "../../lib/format.js";

/** One tooltip for every chart: title + series rows with a colour key and the value in text ink. */
export default function ChartTooltip({ active, payload, label, labelFormatter, rows }) {
  if (!active || !payload?.length) return null;
  const items = rows ? rows(payload) : payload.map((entry) => ({ key: entry.dataKey, name: entry.name, color: entry.color, value: entry.value }));
  return (
    <div className="min-w-[160px] rounded-md border border-line bg-card px-3 py-2 shadow-[var(--shadow-pop)]">
      <p className="mb-1 text-xs font-medium text-fg">{labelFormatter ? labelFormatter(label, payload) : label}</p>
      {items.map((item) => (
        <div key={item.key} className="flex items-center justify-between gap-5 text-xs leading-5">
          <span className="flex items-center gap-1.5 text-muted">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: item.color }} aria-hidden="true" />
            {item.name}
          </span>
          <span className="mono font-medium text-fg">{typeof item.value === "number" ? formatNumber(item.value) : item.value}</span>
        </div>
      ))}
    </div>
  );
}
