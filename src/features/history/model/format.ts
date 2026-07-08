// ─── History formatting helpers ───────────────────────────────────────────────
//
// All formatters operate on precomputed numeric timestamps (epoch ms) so the
// timeline never re-parses ISO strings or spins up a fresh Intl formatter per
// row per render. The `Intl.DateTimeFormat` instances are created once at module
// load and reused for every label.

const dayLabelFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

/** Sortable `YYYY-MM-DD` key from epoch ms; `"unknown"` for invalid input. */
export function dayKey(ts: number): string {
  if (!Number.isFinite(ts)) return "unknown";
  // Local-time day key (matches what the user sees), not UTC.
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Human day label, formatted once per group (not per row). */
export function dayLabel(ts: number): string {
  if (!Number.isFinite(ts)) return "Unknown";
  return dayLabelFmt.format(ts);
}

/** Absolute clock time for a row, e.g. `14:32`. */
export function clockTime(ts: number): string {
  if (!Number.isFinite(ts)) return "";
  return timeFmt.format(ts);
}

/**
 * Relative "time ago" label. Pure arithmetic on the precomputed timestamp plus
 * a `now` reference — no `new Date(string)` parsing in the hot path.
 */
export function formatAgo(ts: number, now: number = Date.now()): string {
  if (!Number.isFinite(ts)) return "unknown";
  const diff = now - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** Parse an ISO/date-ish string to epoch ms, or `NaN` if unparseable. */
export function toTimestamp(value: string): number {
  return new Date(value).getTime();
}
