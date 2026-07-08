/**
 * Shared types for the CSV parser feature.
 *
 * The worker returns a COLUMNAR result (one array per column) plus per-column
 * profiles computed off the main thread, so the renderer never re-walks the
 * whole dataset on every keystroke.
 */

export type ColType = "string" | "number" | "date" | "boolean";

export interface ColConfig {
  original: string;
  alias: string;
  type: ColType;
  include: boolean;
}

export interface RejectRow {
  /** Source row number (1-based when known). */
  row: number | null;
  column?: string | null;
  type?: string | null;
  message: string;
}

export interface ColProfile {
  name: string;
  type: ColType;
  /** Number of null / empty cells. */
  nullCount: number;
  /** Approximate distinct count (capped to bound memory). */
  distinctApprox: number;
  /** Total non-null cells used for numeric stats. */
  numericCount: number;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  stdev?: number;
  /** Histogram buckets for numeric columns. */
  hist?: { x0: number; x1: number; n: number }[];
}

/** Columnar parse result. `columnar[i]` holds the already-cast values for `columns[i]`. */
export interface ParseResult {
  columns: string[];
  columnar: unknown[][];
  rowCount: number;
  profiles: ColProfile[];
  /** Human-readable parse error summaries (kept for backward compatibility). */
  errors: string[];
  /** Structured rejected/malformed rows for the data-quality panel. */
  rejects: RejectRow[];
  parseMs: number;
  /** Which engine produced this result. */
  engine: "udsv" | "papaparse";
}

export interface ParseRequest {
  text: string;
  delimiter?: string;
  hasHeader: boolean;
  skipEmpty: boolean;
  trimWS: boolean;
}
