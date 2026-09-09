/**
 * Shared parse types for the parse.worker. Kept in the worker subsystem dir
 * (NOT src/shared) to avoid collisions with sibling agents.
 */

export type ColType = "string" | "number" | "boolean" | "date";

export interface ParseColumn {
  name: string;
  type: ColType;
}

export interface RejectRow {
  row: number;
  code?: string;
  type?: string;
  message: string;
}

/** Columnar parse result — never re-walk rows on the renderer. */
export interface ParseResult {
  columns: ParseColumn[];
  /** One array per column (columnar), values cast to the inferred type. */
  data: unknown[][];
  rowCount: number;
  /** Rejected/malformed rows captured across all chunks. */
  rejects: RejectRow[];
  /** Parse wall-clock in ms (worker side). */
  elapsedMs: number;
}

export interface ParseStringOptions {
  /** Explicit delimiter; omit/empty for auto-detect. */
  delimiter?: string;
  /** Whether the first row is a header (papaparse path). */
  hasHeader?: boolean;
  /** Skip empty lines. */
  skipEmpty?: boolean;
}
