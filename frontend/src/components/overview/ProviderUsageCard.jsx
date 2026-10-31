import { useMemo } from "react";
import { BarChart3, CircleAlert } from "lucide-react";
import ProviderBreakdownChart, { ShadowHatchDefs, shadowFill } from "../charts/ProviderBreakdownChart.jsx";
import Card from "../ui/Card.jsx";
import { EmptyState, Skeleton } from "../ui/States.jsx";
import { formatNumber } from "../../lib/format.js";
import { CHART } from "../../lib/theme.js";

/** Group stats.by_provider into { provider, approved, shadow } rows, largest first. */
export function providerRows(byProvider) {
  if (!Array.isArray(byProvider)) return [];
  const grouped = new Map();
  for (const item of byProvider) {
    const provider = item.provider || "Unknown";
    const row = grouped.get(provider) || { provider, approved: 0, shadow: 0 };
    if (item.sanctioned === false) row.shadow += Number(item.count) || 0;
    else row.approved += Number(item.count) || 0;
    grouped.set(provider, row);
  }
  return [...grouped.values()].sort((a, b) => b.approved + b.shadow - (a.approved + a.shadow));
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CHART.approved }} />
        Approved
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="10" height="10" aria-hidden="true">
          <rect width="10" height="10" rx="2" fill={shadowFill} />
        </svg>
        Shadow
      </span>
    </div>
  );
}

export default function ProviderUsageCard({ stats, state }) {
  const rows = useMemo(() => providerRows(stats?.by_provider), [stats]);
  const approved = rows.reduce((sum, r) => sum + r.approved, 0);
  const shadow = rows.reduce((sum, r) => sum + r.shadow, 0);
  const total = approved + shadow;

  return (
    <Card title="Provider usage breakdown" subtitle="Requests per AI provider" icon={BarChart3} className="h-full">
      <ShadowHatchDefs />
      {state === "loading" ? (
        <div className="space-y-3 p-4">
          {[80, 55, 35, 20].map((w) => (
            <Skeleton key={w} className="h-5" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : state === "unavailable" ? (
        <EmptyState icon={CircleAlert} title="Statistics unavailable" hint="Waiting for the backend." />
      ) : rows.length === 0 ? (
        <EmptyState icon={BarChart3} title="No AI traffic yet" hint="Load demo data or start the collector." />
      ) : (
        <div className="px-4 pb-3 pt-3">
          {/* Overall split, labelled in text. */}
          <div className="mb-3">
            <div className="mb-1.5 flex items-baseline justify-between text-xs">
              <span className="text-muted">
                <span className="font-semibold text-approved">Approved</span>{" "}
                <span className="mono text-fg">{formatNumber(approved)}</span>
                <span className="text-subtle"> · {total ? Math.round((approved / total) * 100) : 0}%</span>
              </span>
              <span className="text-muted">
                <span className="font-semibold text-shadow">Shadow</span>{" "}
                <span className="mono text-fg">{formatNumber(shadow)}</span>
                <span className="text-subtle"> · {total ? Math.round((shadow / total) * 100) : 0}%</span>
              </span>
            </div>
            <svg className="block h-2 w-full overflow-hidden rounded-full" aria-hidden="true">
              <rect width="100%" height="100%" fill="#e5eaf1" />
              <rect width={`${total ? (approved / total) * 100 : 0}%`} height="100%" fill={CHART.approved} />
              <rect
                x={`${total ? (approved / total) * 100 : 0}%`}
                width={`${total ? (shadow / total) * 100 : 0}%`}
                height="100%"
                fill={shadowFill}
              />
            </svg>
          </div>
          <ProviderBreakdownChart data={rows} />
          <div className="mt-1 flex justify-end">
            <Legend />
          </div>
        </div>
      )}
    </Card>
  );
}
