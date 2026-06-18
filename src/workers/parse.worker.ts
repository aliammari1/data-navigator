/// <reference lib="webworker" />

/**
 * parse.worker — shared CSV / Arrow parsing OFF the renderer main thread.
 *
 * Engines:
 *  - uDSV (fast default, streaming, typed schema inference). Parsed via STRING
 *    methods + our own cast (CSP-safe — no `unsafe-eval` codegen).
 *  - PapaParse (robustness fallback for messy/embedded-newline CSV).
 *  - flechette (@uwdata/flechette) for zero-copy Arrow IPC decode — the
 *    transport from native DuckDB across the worker boundary.
 *
 * Comlink proxy name (renderer): `parse` (see parse-client.ts).
 *
 * Methods:
 *  - parseString(text, opts)        whole-string parse → columnar ParseResult
 *  - parseStream(stream, opts)      streaming parse of a ReadableStream<string>
 *  - parseWithPapa(text, opts)      explicit PapaParse path (fallback)
 *  - decodeArrowColumns(buffer)     Arrow IPC ArrayBuffer → { columns, rows[] }
 *  - inferColumnTypes(text, opts)   schema-only (no full materialization)
 *
 * Offline: pure JS, no wasm/network. All packages ship their code in the tarball.
 */

import * as Comlink from "comlink";
import { tableFromIPC } from "@uwdata/flechette";
import Papa from "papaparse";
import { inferSchema, initParser } from "udsv";
import { castValue, detectType, mapUdsvType } from "./parse-cast";
import type {
  ParseColumn,
  ParseResult,
  ParseStringOptions,
  RejectRow,
} from "./parse-types";

// ─── uDSV whole-string parse (CSP-safe: stringCols + manual cast) ────────────

function parseStringUdsv(text: string, opts: ParseStringOptions): ParseResult {
  const start = performance.now();
  const schema = inferSchema(text, opts.delimiter ? { col: opts.delimiter } : undefined);
  const parser = initParser(schema);

  const stringCols = parser.stringCols<string[]>(text); // string[][], one per column
  const colNames = schema.cols.map((c) => c.name);
  // Prefer uDSV's inferred type code, refine with our own detector for robustness.
  const columns: ParseColumn[] = stringCols.map((col, i) => {
    const udsvType = mapUdsvType(schema.cols[i]?.type ?? "s");
    const type = udsvType === "string" ? detectType(col) : udsvType;
    return { name: colNames[i] ?? `col_${i + 1}`, type };
  });

  const data: unknown[][] = stringCols.map((col, i) =>
    col.map((v) => castValue(v, columns[i]!.type)),
  );
  const rowCount = stringCols[0]?.length ?? 0;

  return {
    columns,
    data,
    rowCount,
    rejects: [],
    elapsedMs: performance.now() - start,
  };
}

// ─── PapaParse fallback (string path) ───────────────────────────────────────

function parseStringPapa(text: string, opts: ParseStringOptions): ParseResult {
  const start = performance.now();
  const result = Papa.parse<Record<string, string> | string[]>(text, {
    header: opts.hasHeader ?? true,
    delimiter: opts.delimiter || undefined,
    skipEmptyLines: opts.skipEmpty === false ? false : "greedy",
    dynamicTyping: false,
  });

  const rejects: RejectRow[] = (result.errors ?? []).map((e) => ({
    row: e.row ?? -1,
    code: e.code,
    type: e.type,
    message: e.message,
  }));

  const rows = result.data;
  const hasHeader = opts.hasHeader ?? true;
  const colNames: string[] =
    hasHeader && rows.length > 0 && !Array.isArray(rows[0])
      ? Object.keys(rows[0] as Record<string, string>)
      : inferPositionalColumns(rows as string[][]);

  // Build columnar string arrays.
  const colCount = colNames.length;
  const stringCols: string[][] = Array.from({ length: colCount }, () => []);
  for (const row of rows) {
    if (Array.isArray(row)) {
      for (let c = 0; c < colCount; c++) stringCols[c]!.push(String(row[c] ?? ""));
    } else {
      const obj = row as Record<string, string>;
      for (let c = 0; c < colCount; c++) stringCols[c]!.push(String(obj[colNames[c]!] ?? ""));
    }
  }

  const columns: ParseColumn[] = stringCols.map((col, i) => ({
    name: colNames[i] ?? `col_${i + 1}`,
    type: detectType(col),
  }));
  const data = stringCols.map((col, i) => col.map((v) => castValue(v, columns[i]!.type)));

  return {
    columns,
    data,
    rowCount: stringCols[0]?.length ?? 0,
    rejects,
    elapsedMs: performance.now() - start,
  };
}

function inferPositionalColumns(rows: string[][]): string[] {
  const width = rows.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 0), 0);
  return Array.from({ length: width }, (_, i) => `col_${i + 1}`);
}

// ─── Worker API ─────────────────────────────────────────────────────────────

const api = {
  /** Whole-string parse → columnar result. uDSV by default, Papa on failure. */
  parseString(text: string, opts: ParseStringOptions = {}): ParseResult {
    try {
      return parseStringUdsv(text, opts);
    } catch (err) {
      // uDSV chokes on some messy/quoted CSV — fall back to Papa.
      const res = parseStringPapa(text, opts);
      res.rejects.unshift({
        row: -1,
        type: "engine-fallback",
        message: `uDSV failed (${String(err)}); used PapaParse`,
      });
      return res;
    }
  },

  /** Explicit PapaParse path (robustness net). */
  parseWithPapa(text: string, opts: ParseStringOptions = {}): ParseResult {
    return parseStringPapa(text, opts);
  },

  /**
   * Streaming parse of a ReadableStream<string> (e.g. from
   * `file.stream().pipeThrough(new TextDecoderStream())`). Accumulates string
   * columns via uDSV `parser.chunk(..., parser.stringArrs)` (CSP-safe), then
   * casts once at the end. No full-string materialization.
   */
  async parseStream(
    stream: ReadableStream<string>,
    opts: ParseStringOptions = {},
  ): Promise<ParseResult> {
    const start = performance.now();
    let parser: ReturnType<typeof initParser> | null = null;
    let schema: ReturnType<typeof inferSchema> | null = null;
    const reader = stream.getReader();
    try {
      // Read until we have enough for a stable schema (first ~256 KB).
      let prelude = "";
      while (prelude.length < 256 * 1024) {
        const { value, done } = await reader.read();
        if (done) break;
        prelude += value;
      }
      schema = inferSchema(prelude, opts.delimiter ? { col: opts.delimiter } : undefined);
      parser = initParser(schema);
      // Feed the prelude, then the rest. stringArrs accumulates string tuples
      // (CSP-safe — no codegen).
      parser.chunk<string[]>(prelude, parser.stringArrs);
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.chunk<string[]>(value, parser.stringArrs);
      }
    } finally {
      reader.releaseLock();
    }

    const rows = (parser?.end<string[]>() ?? []) as string[][]; // array-of-tuples
    const colNames = schema?.cols.map((c) => c.name) ?? [];
    const colCount = colNames.length || (rows[0]?.length ?? 0);

    // Transpose tuples → columns once.
    const stringCols: string[][] = Array.from({ length: colCount }, () => []);
    for (const row of rows) {
      for (let c = 0; c < colCount; c++) stringCols[c]!.push(String(row[c] ?? ""));
    }
    const columns: ParseColumn[] = stringCols.map((col, i) => {
      const udsvType = mapUdsvType(schema?.cols[i]?.type ?? "s");
      const type = udsvType === "string" ? detectType(col) : udsvType;
      return { name: colNames[i] ?? `col_${i + 1}`, type };
    });
    const data = stringCols.map((col, i) => col.map((v) => castValue(v, columns[i]!.type)));

    return {
      columns,
      data,
      rowCount: stringCols[0]?.length ?? 0,
      rejects: [],
      elapsedMs: performance.now() - start,
    };
  },

  /** Schema-only inference (no full materialization). */
  inferColumnTypes(text: string, opts: ParseStringOptions = {}): ParseColumn[] {
    const schema = inferSchema(text, opts.delimiter ? { col: opts.delimiter } : undefined);
    return schema.cols.map((c) => ({
      name: c.name,
      type: mapUdsvType(c.type),
    }));
  },

  /**
   * Decode an Arrow IPC ArrayBuffer (from native DuckDB `arrowIPCStream`) into
   * column names + row objects. flechette gives zero-copy typed columns; we
   * materialize objects lazily here only for previews — large windows should
   * stay columnar via `decodeArrowColumns`.
   */
  decodeArrowToRows(buffer: ArrayBuffer): { columns: string[]; rows: Record<string, unknown>[] } {
    const table = tableFromIPC(buffer);
    const columns = table.schema.fields.map((f: { name: string }) => f.name);
    const rows = table.toArray() as Record<string, unknown>[];
    return { columns, rows };
  },

  /** Decode Arrow IPC into columnar typed arrays (preferred — no row objects). */
  decodeArrowColumns(buffer: ArrayBuffer): { columns: string[]; data: unknown[][]; rowCount: number } {
    const table = tableFromIPC(buffer);
    const columns = table.schema.fields.map((f: { name: string }) => f.name);
    // toColumns() returns { [name]: array } — one pass, no per-column lookup.
    const cols = table.toColumns() as Record<string, ArrayLike<unknown>>;
    const data = columns.map((name) => Array.from(cols[name] ?? []) as unknown[]);
    return { columns, data, rowCount: table.numRows };
  },
};

export type ParseWorkerApi = typeof api;

Comlink.expose(api);
