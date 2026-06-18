/** Shared formatting helpers for deep-analytics. */

export function fmtRevenue(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${Math.round(n)}`;
}

export function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("fr-FR");
}

export function fmtPct(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

/** Short label for a date_trunc bucket value coming back from DuckDB. */
export function fmtBucket(value: unknown): string {
  if (value == null) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD, stable + sortable
}

/** Pick the first matching column name from a list, by case-insensitive regex. */
export function pickColumn(
  columns: string[],
  patterns: RegExp[],
): string | undefined {
  for (const pattern of patterns) {
    const hit = columns.find((c) => pattern.test(c));
    if (hit) return hit;
  }
  return undefined;
}
