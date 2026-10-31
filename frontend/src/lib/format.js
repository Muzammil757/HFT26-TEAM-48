const numberFormat = new Intl.NumberFormat("en-IN");
export const formatNumber = (value) => numberFormat.format(Number(value) || 0);

export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

function toDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "31 Oct, 10:00:05" in local time. */
export function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return value ? String(value) : "Unknown time";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Local HH:MM. */
export function formatClock(value) {
  const date = toDate(value);
  if (!date) return "";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Local HH:MM:SS. */
export function formatTime(value) {
  const date = toDate(value);
  if (!date) return "";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function relativeTime(value, now = Date.now()) {
  const date = toDate(value);
  if (!date) return value ? "Unknown" : "Never";
  const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

export function secondsBetween(a, b) {
  const x = toDate(a);
  const y = toDate(b);
  return x && y ? Math.round((y.getTime() - x.getTime()) / 1000) : null;
}

/** "+7s", "+1m 05s" */
export function formatGap(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return "";
  if (seconds < 60) return `+${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `+${m}m ${String(s).padStart(2, "0")}s` : `+${m}m`;
}

/** "31s", "2m 05s" */
export function formatDuration(seconds) {
  return formatGap(seconds).replace(/^\+/, "");
}

export const shortId = (id) => String(id || "").slice(0, 8);

/** Plain-language message for a failed request (no raw "Failed to fetch"). */
export function errorMessage(error) {
  if (!error) return "";
  if (error.status === 404) return "Not found. The database may have been reset.";
  if (error.status) return error.message || `Request failed (${error.status})`;
  return "Backend unreachable. Retrying automatically.";
}
