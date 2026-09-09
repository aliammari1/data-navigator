/**
 * Small presentational helpers shared by the topbar popovers. No `"use client"`
 * — pure functions/constants so they tree-shake and can be imported anywhere.
 */

export function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

export const FORMAT_COLORS: Record<string, string> = {
  csv: "bg-green-500/20 text-green-300",
  json: "bg-blue-500/20 text-blue-300",
  excel: "bg-emerald-500/20 text-emerald-300",
  parquet: "bg-blue-500/20 text-blue-300",
  sql: "bg-orange-500/20 text-orange-300",
};
