import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber } from "../../lib/format.js";
import { CHART, TOKENS } from "../../lib/theme.js";
import ChartTooltip from "./ChartTooltip.jsx";

const HATCH_ID = "sg-hatch-shadow";
const ROW = 30;

/** SVG pattern for shadow bars: texture as a second cue next to colour and label. */
export function ShadowHatchDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        <pattern id={HATCH_ID} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill={CHART.shadow} />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="2" />
        </pattern>
      </defs>
    </svg>
  );
}

export const shadowFill = `url(#${HATCH_ID})`;

/** "61 · Shadow" at the end of each bar, in text ink (never the series colour). */
function EndLabel({ x, y, width, height, payload }) {
  if (!payload || x == null) return null;
  const total = (payload.approved || 0) + (payload.shadow || 0);
  const status = payload.shadow > 0 ? "Shadow" : "Approved";
  return (
    <text x={x + width + 8} y={y + height / 2} dominantBaseline="central" fontSize={11} fontFamily="Inter, sans-serif">
      <tspan fill={TOKENS.fg} fontWeight={600}>{formatNumber(total)}</tspan>
      <tspan fill={payload.shadow > 0 ? "#b42318" : "#067647"} dx={6}>{status}</tspan>
    </text>
  );
}

const tooltipRows = (payload) => {
  const p = payload[0]?.payload || {};
  const rows = [];
  if (p.approved) rows.push({ key: "a", name: "Approved", color: CHART.approved, value: p.approved });
  if (p.shadow) rows.push({ key: "s", name: "Shadow", color: CHART.shadow, value: p.shadow });
  return rows;
};

/**
 * Horizontal stacked bars, one row per provider: approved vs shadow requests.
 * `data` rows: { provider, approved, shadow }.
 */
export default function ProviderBreakdownChart({ data }) {
  const height = Math.max(2, data.length) * ROW + 24;
  const rowFor = (provider, segment) => {
    const row = data.find((d) => d.provider === provider);
    if (!row) return null;
    const last = row.shadow > 0 ? "shadow" : "approved";
    return last === segment && row[segment] > 0 ? row : null;
  };
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 96, left: 0, bottom: 0 }} barCategoryGap={8}>
          <CartesianGrid stroke={TOKENS.line} horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fill: TOKENS.muted, fontSize: 11 }} tickLine={false} axisLine={false} height={20} />
          <YAxis
            type="category"
            dataKey="provider"
            width={112}
            tick={{ fill: TOKENS.fg, fontSize: 12, fontFamily: "Inter, sans-serif" }}
            tickLine={false}
            axisLine={{ stroke: TOKENS.lineStrong }}
            interval={0}
          />
          <Tooltip content={<ChartTooltip rows={tooltipRows} />} cursor={{ fill: TOKENS.accentSoft }} />
          {/* Each row is labelled at the end of its last non-empty segment. Labels are keyed
              by provider name: recharts skips zero-width segments, so indexes shift. */}
          <Bar dataKey="approved" name="Approved" stackId="p" fill={CHART.approved} radius={[0, 3, 3, 0]} isAnimationActive={false}>
            <LabelList dataKey="provider" content={(props) => <EndLabel {...props} payload={rowFor(props.value, "approved")} />} />
          </Bar>
          <Bar dataKey="shadow" name="Shadow" stackId="p" fill={shadowFill} radius={[0, 3, 3, 0]} isAnimationActive={false}>
            <LabelList dataKey="provider" content={(props) => <EndLabel {...props} payload={rowFor(props.value, "shadow")} />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
