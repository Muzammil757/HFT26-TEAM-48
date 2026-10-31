const MINUTE = 60_000;
const MAX_BUCKETS = 60;

/**
 * Turn the sparse per-minute timeline into continuous buckets (zero where nothing
 * happened) from the first minute to the last, so gaps read as gaps.
 */
export function buildTimeline(rows) {
  const points = (rows || [])
    .map((row) => ({
      t: Date.parse(row.minute),
      requests: Number(row.requests) || 0,
      incidents: Number(row.incidents) || 0,
    }))
    .filter((p) => !Number.isNaN(p.t))
    .sort((a, b) => a.t - b.t);
  if (points.length === 0) return [];

  const first = points[0].t;
  const lastData = points[points.length - 1].t;
  // Extend to the current minute only while activity is recent (live demo), so a
  // quiet tail doesn't squash the real activity.
  const nowMinute = Math.floor(Date.now() / MINUTE) * MINUTE;
  const last = nowMinute > lastData && nowMinute - lastData <= 2 * MINUTE ? nowMinute : lastData;

  const minutes = Math.round((last - first) / MINUTE) + 1;
  const step = Math.max(1, Math.ceil(minutes / MAX_BUCKETS)) * MINUTE;
  const buckets = new Map();
  for (let t = first; t <= last; t += step) buckets.set(t, { t, requests: 0, incidents: 0 });
  for (const p of points) {
    const bucket = buckets.get(first + Math.floor((p.t - first) / step) * step);
    if (bucket) {
      bucket.requests += p.requests;
      bucket.incidents += p.incidents;
    }
  }
  return [...buckets.values()].map((b) => ({ ...b, step: step / MINUTE }));
}
