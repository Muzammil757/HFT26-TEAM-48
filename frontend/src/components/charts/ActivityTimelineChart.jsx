import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatClock } from "../../lib/format.js";
import { CHART, TOKENS } from "../../lib/theme.js";
import ChartTooltip from "./ChartTooltip.jsx";

const tick = { fill: TOKENS.muted, fontSize: 11, fontFamily: "Inter, sans-serif" };
const Y_WIDTH = 36;
const MARGIN = { top: 6, right: 12, left: 0, bottom: 0 };

function bucketLabel(t, payload) {
  const step = payload?.[0]?.payload?.step || 1;
  return step > 1 ? `${formatClock(t)}–${formatClock(t + step * 60_000)}` : formatClock(t);
}

const tooltipRows = (payload) => {
  const p = payload[0]?.payload || {};
  return [
    { key: "requests", name: "AI requests", color: CHART.requests, value: p.requests ?? 0 },
    { key: "incidents", name: "Incidents", color: CHART.incidents, value: p.incidents ?? 0 },
  ];
};

/**
 * Two aligned panels sharing one time axis (no dual y-axis): AI requests as an
 * area, incidents as a strip of bars underneath. Empty minutes are zero and the
 * line is straight (no smoothing), so quiet periods show as gaps.
 */
export default function ActivityTimelineChart({ data, height = 230 }) {
  const stripHeight = 74;
  const mainHeight = height - stripHeight;
  const maxIncidents = Math.max(1, ...data.map((d) => d.incidents));
  return (
    <div style={{ height }}>
      <div style={{ height: mainHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ ...MARGIN, bottom: 6 }} syncId="sg-activity">
            <CartesianGrid stroke={TOKENS.line} vertical={false} />
            <XAxis dataKey="t" hide />
            <YAxis allowDecimals={false} width={Y_WIDTH} tick={tick} tickLine={false} axisLine={false} interval={0} />
            <Tooltip
              content={<ChartTooltip labelFormatter={bucketLabel} rows={tooltipRows} />}
              cursor={{ stroke: TOKENS.lineStrong, strokeWidth: 1 }}
            />
            <Area
              type="linear"
              dataKey="requests"
              name="AI requests"
              stroke={CHART.requests}
              strokeWidth={2}
              fill={CHART.requests}
              fillOpacity={0.08}
              dot={false}
              activeDot={{ r: 4, stroke: TOKENS.card, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="border-t border-dashed border-line" style={{ height: stripHeight }}>
        <p className="h-4 text-2xs font-medium leading-4 text-muted" style={{ paddingLeft: Y_WIDTH }}>
          Incidents
        </p>
        <div style={{ height: stripHeight - 16 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ ...MARGIN, top: 2 }} syncId="sg-activity" barCategoryGap={1}>
              <XAxis
                dataKey="t"
                tickFormatter={formatClock}
                tick={tick}
                tickLine={false}
                axisLine={{ stroke: TOKENS.lineStrong }}
                minTickGap={40}
              />
              <YAxis
                allowDecimals={false}
                width={Y_WIDTH}
                tick={tick}
                tickLine={false}
                axisLine={false}
                ticks={[maxIncidents]}
                domain={[0, maxIncidents]}
              />
              {/* The upper panel's tooltip shows both series; this one only draws the cursor. */}
              <Tooltip content={() => null} cursor={{ fill: TOKENS.accentSoft }} />
              {/* A single incident still gets a visible bar; empty minutes stay empty. */}
              <Bar
                dataKey="incidents"
                name="Incidents"
                fill={CHART.incidents}
                radius={[2, 2, 0, 0]}
                maxBarSize={10}
                minPointSize={(value) => (value > 0 ? 6 : 0)}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
