/// <reference lib="webworker" />

/**
 * CSV parse + profile worker.
 *
 * Runs parsing, whitespace-trim, type detection, value casting AND full-column
 * profiling entirely off the main thread, then returns a COLUMNAR result so the
 * renderer never re-walks rows on filter/config changes.
 *
 * Engine: uDSV is the plan's preferred fast engine and is installed. We use its
 * CSP-safe string methods (`stringCols` — no `new Function()` codegen) and cast
 * with our own `castValue`, so a strict CSP without `unsafe-eval` still parses.
 * PapaParse remains the robustness fallback (messy/embedded-newline CSVs) and is
 * the engine that surfaces structured reject rows.
 */

import * as Comlink from "comlink";
import Papa from "papaparse";
import { inferSchema, initParser } from "udsv";
import { castValue, detectType, profileColumn } from "../lib/profile";
import type { ColType, ParseRequest, ParseResult, RejectRow } from "../lib/types";

interface ColumnarParse {
  columns: string[];
  /** Raw (trimmed) string columns, one array per column. */
  rawColumnar: string[][];
  rowCount: number;
  rejects: RejectRow[];
  engine: "udsv" | "papaparse";
}

/** uDSV path: CSP-safe `stringCols`, manual cast downstream. */
function parseUdsv(req: ParseRequest): ColumnarParse {
  const schema = inferSchema(req.text, req.delimiter ? { col: req.delimiter } : undefined);
  const parser = initParser(schema);
  const stringCols = parser.stringCols<string[]>(req.text);

  const columns = schema.cols.map((c, i) => c.name ?? `column_${i + 1}`);
  const rawColumnar = stringCols.map((col) =>
    req.trimWS ? col.map((v) => (typeof v === "string" ? v.trim() : v)) : col,
  );

  return {
    columns,
    rawColumnar,
    rowCount: rawColumnar[0]?.length ?? 0,
    rejects: [],
    engine: "udsv",
  };
}

/** PapaParse fallback path: tolerant of messy CSVs, captures reject rows. */
function parsePapa(req: ParseRequest): ColumnarParse {
  const result = Papa.parse<Record<string, unknown>>(req.text, {
    header: req.hasHeader,
    delimiter: req.delimiter || undefined,
    skipEmptyLines: req.skipEmpty ? "greedy" : false,
    dynamicTyping: false,
  });

  const rawRows = result.data;
  const columns =
    rawRows.length > 0 && req.hasHeader ? Object.keys(rawRows[0]) : inferPositionalColumns(rawRows);

  const colCount = columns.length;
  const rowCount = rawRows.length;
  const rawColumnar: string[][] = columns.map(() => new Array(rowCount));

  for (let r = 0; r < rowCount; r++) {
    const row = rawRows[r] as Record<string, unknown>;
    const isArray = Array.isArray(row);
    for (let c = 0; c < colCount; c++) {
      const value = isArray ? (row as unknown[])[c] : row[columns[c]];
      const text = value == null ? "" : String(value);
      rawColumnar[c][r] = req.trimWS ? text.trim() : text;
    }
  }

  const rejects: RejectRow[] = result.errors.slice(0, 500).map((error) => ({
    row: typeof error.row === "number" ? error.row + 1 : null,
    type: error.type ?? error.code ?? "error",
    message: error.message,
  }));

  return { columns, rawColumnar, rowCount, rejects, engine: "papaparse" };
}

const api = {
  parse(req: ParseRequest): ParseResult {
    const start = performance.now();

    let parsed: ColumnarParse;
    // uDSV always treats the first row as the header. For headerless input,
    // PapaParse's positional-column handling is correct, so route there.
    if (!req.hasHeader) {
      parsed = parsePapa(req);
    } else {
      try {
        parsed = parseUdsv(req);
        // uDSV occasionally collapses pathological/messy files to a single
        // column; fall back to PapaParse's more tolerant tokenizer in that case.
        if (parsed.columns.length <= 1 && req.text.includes("\n")) {
          const papa = parsePapa(req);
          if (papa.columns.length > parsed.columns.length) parsed = papa;
        }
      } catch {
        parsed = parsePapa(req);
      }
    }

    const { columns, rawColumnar, rowCount, rejects, engine } = parsed;

    // Detect types over the WHOLE column (not a 200-row sample), then cast once.
    const types: ColType[] = rawColumnar.map((col) => detectType(col));
    const columnar: unknown[][] = rawColumnar.map((col, index) =>
      col.map((value) => castValue(value, types[index])),
    );

    const profiles = columns.map((name, index) =>
      profileColumn(name, columnar[index], types[index]),
    );

    const errors = rejects.slice(0, 50).map((reject) => {
      const where = reject.row != null ? ` (row ${reject.row})` : "";
      return `${reject.message}${where}`;
    });

    return {
      columns,
      columnar,
      rowCount,
      profiles,
      errors,
      rejects,
      parseMs: Math.round(performance.now() - start),
      engine,
    };
  },
};

function inferPositionalColumns(rows: unknown[]): string[] {
  const first = rows[0];
  if (Array.isArray(first)) {
    return first.map((_, index) => `column_${index + 1}`);
  }
  if (first && typeof first === "object") {
    return Object.keys(first as Record<string, unknown>);
  }
  return [];
}

export type CsvWorkerApi = typeof api;

Comlink.expose(api);
