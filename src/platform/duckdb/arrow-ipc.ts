"use client";

/**
 * Arrow IPC transport — renderer / worker side.
 *
 * Contract (see docs/planning/v2/impl-briefs/duckdb-arrow.md §0–§4):
 * - The Electron MAIN process builds an Arrow IPC *stream* buffer from DuckDB's
 *   native columnar output (apache-arrow `tableToIPC(table, "stream")`) and ships
 *   it across IPC as a transferable `ArrayBuffer` (carried as a `Uint8Array`).
 * - This module decodes that stream buffer here, in the renderer or a Web Worker,
 *   using `@uwdata/flechette` (≈14 kB gzip, 2–11× faster extraction than
 *   apache-arrow, lazy columns) — never on the renderer main thread for large
 *   windows; hand the buffer to a worker and decode there.
 *
 * This is the offline-correct replacement for the missing native Arrow export in
 * `@duckdb/node-api` (DuckDB Neo). No network, no DuckDB `arrow` community
 * extension. apache-arrow stays on the MAIN (write) side; flechette is the
 * default renderer (read) side. Both consume the same `"stream"`-format bytes.
 */

import {
  type Column,
  type ExtractionOptions,
  type Table as FlechetteTable,
  tableFromIPC,
} from "@uwdata/flechette";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Bytes accepted by {@link decodeArrowIPC}. The main process returns a
 * `Uint8Array` over IPC; a worker hand-off transfers the underlying
 * `ArrayBuffer`. flechette also accepts a list of chunked buffers.
 */
export type ArrowIpcBytes = ArrayBuffer | Uint8Array | Uint8Array[];

/** Re-exported flechette table/column types so consumers need one import. */
export type ArrowTable = FlechetteTable;
export type ArrowColumn<T = unknown> = Column<T>;

/**
 * Decode options. Defaults coerce 64-bit ints to plain numbers (`useBigInt:
 * false`) and temporal values to JS `Date` — the grid/charts want numbers, not
 * BigInt, and this resolves the main-side BigInt/temporal ambiguity (§2.2) at
 * the decode boundary (§4.1).
 */
export type DecodeArrowOptions = ExtractionOptions;

const DEFAULT_DECODE_OPTIONS: DecodeArrowOptions = {
  useBigInt: false,
  useDate: true,
};

// ─── Decode ─────────────────────────────────────────────────────────────────

/**
 * Decode Arrow IPC stream bytes into a lazy, column-major flechette table.
 *
 * Prefer reading columns lazily — `getArrowColumn(table, name)` then `col.at(i)`
 * inside a virtualizer loop — over materializing the whole table to row objects.
 */
export function decodeArrowIPC(bytes: ArrowIpcBytes, options?: DecodeArrowOptions): ArrowTable {
  return tableFromIPC(bytes, { ...DEFAULT_DECODE_OPTIONS, ...options });
}

/** Lazy column accessor; returns `null` when the column is absent. */
export function getArrowColumn<T = unknown>(
  table: ArrowTable,
  name: string,
): ArrowColumn<T> | null {
  return (table.getChild(name) as ArrowColumn<T> | undefined) ?? null;
}

/** Column names in schema order. */
export function arrowColumnNames(table: ArrowTable): string[] {
  // `names` is a property (the schema's column-name list), not a method.
  return table.names as string[];
}

/**
 * Column-major extraction: `{ columnName: ValueArray }`. Feed the typed value
 * arrays straight to uPlot / ECharts without a row↔object transposition.
 */
export function arrowToColumns(table: ArrowTable): Record<string, ArrayLike<unknown>> {
  return table.toColumns() as Record<string, ArrayLike<unknown>>;
}

/**
 * Row-major materialization: `Record<string, unknown>[]`. Use ONLY when a caller
 * genuinely needs row objects (e.g. handing back to legacy JSON-shaped APIs).
 * For large windows, read lazily by column instead — this allocates one object
 * per row.
 */
export function arrowToRows(table: ArrowTable): Record<string, unknown>[] {
  return table.toArray() as Record<string, unknown>[];
}

/** Single row as an object (lazy random access by row index). */
export function arrowRowAt(table: ArrowTable, rowIndex: number): Record<string, unknown> {
  return table.at(rowIndex) as Record<string, unknown>;
}

/** Number of rows in the decoded table. */
export function arrowRowCount(table: ArrowTable): number {
  return table.numRows;
}

/** Number of columns in the decoded table. */
export function arrowColumnCount(table: ArrowTable): number {
  return table.numCols;
}

// ─── Worker hand-off ──────────────────────────────────────────────────────────

/**
 * Transfer list for a Comlink (or raw `postMessage`) hand-off of decoded IPC
 * bytes to a worker, so the underlying buffer moves zero-copy:
 *
 * ```ts
 * import * as Comlink from "comlink";
 * const bytes = await runReadOnlyQueryArrow(sql);            // Uint8Array
 * await worker.decode(Comlink.transfer(bytes, arrowTransferList(bytes)));
 * ```
 */
export function arrowTransferList(bytes: Uint8Array): [ArrayBuffer] {
  return [bytes.buffer as ArrayBuffer];
}

/** Coerce IPC payload to a `Uint8Array` (handles `ArrayBuffer` returns). */
export function asUint8Array(bytes: ArrayBuffer | Uint8Array): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}
