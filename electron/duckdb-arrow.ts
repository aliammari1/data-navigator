/**
 * Arrow IPC encoder — Electron MAIN process side.
 *
 * `@duckdb/node-api` (DuckDB Neo) has NO native Arrow / Arrow-IPC export, and the
 * SQL-side `arrow` IPC functions live in a COMMUNITY extension that requires a
 * network `INSTALL` (forbidden offline). So we build the Arrow IPC buffer here in
 * the main process from DuckDB's native columnar output using `apache-arrow`
 * (pure JS, offline), and ship it as a transferable `Uint8Array`/`ArrayBuffer`
 * over IPC. The renderer/worker decodes with `@uwdata/flechette`
 * (see src/platform/duckdb/arrow-ipc.ts).
 *
 * This module is imported only by `electron/duckdb-service.ts`; it pulls
 * `apache-arrow` into MAIN, never the renderer.
 */

import { DuckDBTypeId } from "@duckdb/node-api";
import { tableFromArrays, tableToIPC } from "apache-arrow";

/** Minimal shape of a DuckDB Neo column type (`reader.columnTypes()[i]`). */
export interface DuckDBColumnTypeLike {
  typeId: number;
}

/**
 * Normalize DuckDB→JS column values so `apache-arrow` infers a sane schema.
 *
 * `getColumnsObjectJS()` yields `BigInt` for `BIGINT`/`HUGEINT`, JS `Date` for
 * temporal types, and DuckDB value wrappers for some complex types. We:
 * - keep `Date` (apache-arrow → Timestamp),
 * - down-cast `BigInt` that fits in `2^53` to `number` (the renderer/grid want
 *   plain numbers; values beyond safe-integer range stay `BigInt` to preserve
 *   precision), and
 * - stringify non-plain wrapper objects (LIST/STRUCT/MAP/etc.) so they survive
 *   IPC + flechette decode as readable values rather than throwing.
 *
 * `null`/`undefined`, strings, numbers and booleans pass through untouched.
 */
export function normalizeColumnsForArrow(
  cols: Record<string, unknown[]>,
  _types?: DuckDBColumnTypeLike[],
): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};

  for (const [name, values] of Object.entries(cols)) {
    out[name] = values.map((v) => normalizeValue(v));
  }

  return out;
}

function normalizeValue(v: unknown): unknown {
  if (v === null || v === undefined) return v;

  if (typeof v === "bigint") {
    // Preserve precision beyond 2^53; otherwise hand the renderer plain numbers.
    if (v <= MAX_SAFE_BIGINT && v >= MIN_SAFE_BIGINT) {
      return Number(v);
    }
    return v;
  }

  if (v instanceof Date) return v;

  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean") return v;

  // DuckDB wrapper objects for LIST/STRUCT/MAP/DECIMAL/etc. — render as a
  // stable string so the column has a homogeneous, transferable type. Callers
  // that need structured nested values should read them via the JSON path.
  return stringifyComplex(v);
}

function stringifyComplex(v: unknown): string {
  try {
    return JSON.stringify(v, bigintReplacer);
  } catch {
    return String(v);
  }
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

/**
 * Build an Arrow IPC **stream** buffer from DuckDB column-major output.
 *
 * `columns` is `reader.getColumnsObjectJS()`; `types` is `reader.columnTypes()`.
 * Returns a `Uint8Array` in IPC streaming format (read by both flechette and
 * apache-arrow `tableFromIPC`). Ship `.buffer` as a transferable.
 *
 * Handles the empty-result case (no columns) by returning an empty-table stream
 * so the renderer still gets a valid, decodable buffer.
 */
export function encodeColumnsToArrowIPC(
  columns: Record<string, unknown[]>,
  types?: DuckDBColumnTypeLike[],
): Uint8Array {
  const normalized = normalizeColumnsForArrow(columns, types);
  const table = tableFromArrays(normalized);
  return tableToIPC(table, "stream");
}

/** Re-export so the service can reference DuckDB type ids when needed. */
export { DuckDBTypeId };
