/**
 * threadGlimpse — pure series extraction for the ThreadCard sparkline
 * (formulator2). No React, no store: takes a `TableNode` and returns the
 * first numeric column of `node.rows` as a short trend series, or null when
 * the node has nothing to show (sql-lane preview absent, python needsRerun,
 * or no numeric column yields enough finite points). Null means the card
 * renders no glimpse at all — no placeholder box.
 */

import type { TableNode } from "../../core/formulator/model";

/** Max leading rows sampled into the glimpse series. */
export const GLIMPSE_MAX_POINTS = 24;

/** A single point can't draw a trend — below this the glimpse is omitted. */
const MIN_POINTS = 2;

export interface ThreadGlimpse {
  /** Name of the numeric column the series was read from (tooltip label). */
  column: string;
  values: number[];
}

/** Coerce a cell to a finite number; DuckDB can hand back bigint or numeric strings. */
function toFinite(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Series for a derived node's inline data glimpse. Scans `node.columns` in
 * order and returns the first number-typed column whose leading rows (≤
 * GLIMPSE_MAX_POINTS) yield at least MIN_POINTS finite values.
 */
export function threadGlimpse(node: TableNode): ThreadGlimpse | null {
  if (node.kind !== "derived" || !node.rows || node.rows.length === 0) return null;

  const sample = node.rows.slice(0, GLIMPSE_MAX_POINTS);
  for (const col of node.columns) {
    if (col.type !== "number") continue;
    const values = sample
      .map((row) => toFinite(row[col.name]))
      .filter((v): v is number => v !== null);
    if (values.length >= MIN_POINTS) return { column: col.name, values };
  }
  return null;
}
