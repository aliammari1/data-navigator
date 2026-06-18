import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterAll, beforeAll, bench, describe } from "vitest";

/**
 * REAL DuckDB ingestion + SUMMARIZE profiling benchmarks (run with
 * `pnpm run bench:duckdb`).
 *
 * Unlike the in-repo `tests/performance/**` benches — which mock the DuckDB IPC
 * boundary (`@/platform/electron/electron-fs`) so they can run under jsdom —
 * this suite loads the REAL `@duckdb/node-api` native addon in a Node
 * environment (see `vitest.duckdb-bench.config.ts`, `environment: "node"`) and
 * exercises the actual data-onboarding hot path end to end:
 *
 *   1. CSV ingestion throughput — mirrors `electron/duckdb-service.ts`
 *      `registerCSVPathDataset`: a synthetic CSV is written to a temp file and
 *      ingested with the SAME SQL the app runs:
 *
 *        COPY (SELECT * FROM read_csv(<path>, auto_detect = true, header = true,
 *              strict_mode = false, null_padding = true, sample_size = 20480,
 *              max_line_size = 10000000))
 *        TO <cache>.parquet (FORMAT parquet, COMPRESSION zstd, COMPRESSION_LEVEL 1)
 *
 *      then `CREATE OR REPLACE VIEW … read_parquet(<cache>)`. We measure rows/sec.
 *
 *   2. Dataset profiling latency — mirrors the `summarize.ts` /
 *      `fetchFullTableColumnInfo` path which runs `summarizeDataset` =
 *
 *        SUMMARIZE SELECT * FROM <view>
 *
 *      over the ingested table at wide schemas (20 and 60 columns) and large row
 *      counts. We measure ms (the repeatable `bench`).
 *
 *   3. Parquet round-trip — re-registers the COPY-produced parquet through
 *      `read_parquet` (the `registerParquetPathDataset` path) and measures
 *      ingestion rows/sec for the already-columnar format.
 *
 * Synthetic data is generated DETERMINISTICALLY with a counter-based index
 * varied generator (NO Math.random / Date.now), so the corpus is byte-identical
 * across runs and the numbers are comparable.
 *
 * Heavy ingestion (writing the CSV, the COPY-to-parquet scan, the view + row
 * count) is done ONCE per size in `beforeAll`, where ingestion rows/sec is
 * measured directly and logged. The repeated `bench` body only runs SUMMARIZE,
 * which is the genuinely repeatable profiling cost.
 */

// ─── SQL helpers (mirrored from electron/duckdb-service.ts) ──────────────────

const DEFAULT_CSV_SAMPLE_SIZE = 20_480;

function quoteSqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/** Exactly the option list `buildCsvOptions` emits for a header CSV import. */
function buildCsvOptions(): string {
  return [
    "auto_detect = true",
    "header = true",
    "strict_mode = false",
    "null_padding = true",
    `sample_size = ${DEFAULT_CSV_SAMPLE_SIZE}`,
    "max_line_size = 10000000",
  ].join(", ");
}

// ─── Deterministic synthetic CSV generation (counter-based, no RNG) ──────────

/**
 * A realistic mixed-type column template. We cycle through these so a wide
 * schema exercises numeric, string, boolean, and date columns — the same spread
 * DuckDB type-detection + SUMMARIZE must handle on a real telecom upload.
 */
type ColKind = "int" | "double" | "string" | "bool" | "date";
const COL_KINDS: ColKind[] = ["int", "double", "string", "bool", "date"];

const CATEGORIES = [
  "alpha",
  "bravo",
  "charlie",
  "delta",
  "echo",
  "foxtrot",
  "golf",
  "hotel",
] as const;

function columnName(index: number): string {
  return `c${index.toString().padStart(2, "0")}_${COL_KINDS[index % COL_KINDS.length]}`;
}

/** Deterministic cell value for (row, column) — pure function of indices. */
function cellValue(row: number, col: number): string {
  const kind = COL_KINDS[col % COL_KINDS.length];
  // A couple of cheap, deterministic hashes to spread values without RNG.
  const a = (row * 2654435761 + col * 40503) >>> 0;

  switch (kind) {
    case "int":
      return String((a % 1_000_000) - 500_000);
    case "double": {
      // Fixed 4-dp double, deterministic.
      const v = (a % 10_000_000) / 1000;
      return v.toFixed(4);
    }
    case "string":
      return `${CATEGORIES[a % CATEGORIES.length]}_${row % 9973}`;
    case "bool":
      return a % 2 === 0 ? "true" : "false";
    case "date": {
      // Deterministic date in 2020..2024 — string DuckDB will type-detect.
      const year = 2020 + (a % 5);
      const month = (a % 12) + 1;
      const day = (a % 28) + 1;
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
}

/**
 * Write a deterministic CSV with `rows` data rows and `cols` columns to `file`.
 * Built as one large string in chunked appends to keep memory bounded for 1M
 * rows. Returns the byte length written.
 */
function writeSyntheticCsv(file: string, rows: number, cols: number): number {
  const FLUSH_ROWS = 50_000;
  const header = Array.from({ length: cols }, (_, c) => columnName(c)).join(",");

  let buffer = `${header}\n`;
  let bytes = 0;
  // Truncate/create on first write, then append.
  writeFileSync(file, "");

  for (let r = 0; r < rows; r++) {
    const cells = new Array<string>(cols);
    for (let c = 0; c < cols; c++) cells[c] = cellValue(r, c);
    buffer += `${cells.join(",")}\n`;

    if ((r + 1) % FLUSH_ROWS === 0) {
      writeFileSync(file, buffer, { flag: "a" });
      bytes += Buffer.byteLength(buffer);
      buffer = "";
    }
  }
  if (buffer.length > 0) {
    writeFileSync(file, buffer, { flag: "a" });
    bytes += Buffer.byteLength(buffer);
  }
  return bytes;
}

// ─── Ingestion: the production COPY → parquet → view path ────────────────────

interface IngestResult {
  rowCount: number;
  colCount: number;
  cachePath: string;
  viewName: string;
  ingestMs: number;
  rowsPerSec: number;
  csvBytes: number;
}

/**
 * Mirror `registerCSVPathDataset`: COPY (read_csv) → parquet, then a view over
 * read_parquet. Measures wall-clock for the COPY ingestion scan (the dominant,
 * representative cost) and derives rows/sec.
 */
async function ingestCsv(
  instance: DuckDBInstance,
  csvPath: string,
  cachePath: string,
  viewName: string,
  expectedRows: number,
  cols: number,
): Promise<IngestResult> {
  const conn = await instance.connect();

  const copySql = `
    COPY (
      SELECT *
      FROM read_csv(${quoteSqlString(csvPath)}, ${buildCsvOptions()})
    )
    TO ${quoteSqlString(cachePath)}
    (
      FORMAT parquet,
      COMPRESSION zstd,
      COMPRESSION_LEVEL 1
    )
  `;

  const start = performance.now();
  await conn.run(copySql);
  const ingestMs = performance.now() - start;

  await conn.run(`
    CREATE OR REPLACE VIEW ${quoteIdentifier(viewName)} AS
    SELECT *
    FROM read_parquet(${quoteSqlString(cachePath)})
  `);

  const countResult = await conn.run(
    `SELECT count(*) AS row_count FROM ${quoteIdentifier(viewName)}`,
  );
  const countRows = await countResult.getRowObjectsJS();
  const rowCount = Number(countRows[0]?.row_count ?? 0);

  if (rowCount !== expectedRows) {
    throw new Error(
      `Ingest row mismatch: expected ${expectedRows}, got ${rowCount}`,
    );
  }

  conn.closeSync();

  return {
    rowCount,
    colCount: cols,
    cachePath,
    viewName,
    ingestMs,
    rowsPerSec: rowCount / (ingestMs / 1000),
    csvBytes: 0,
  };
}

/** Mirror `registerParquetPathDataset`: a view straight over read_parquet. */
async function ingestParquet(
  instance: DuckDBInstance,
  parquetPath: string,
  viewName: string,
  expectedRows: number,
): Promise<{ rowsPerSec: number; ingestMs: number }> {
  const conn = await instance.connect();

  const start = performance.now();
  await conn.run(`
    CREATE OR REPLACE VIEW ${quoteIdentifier(viewName)} AS
    SELECT *
    FROM read_parquet(${quoteSqlString(parquetPath)})
  `);
  const countResult = await conn.run(
    `SELECT count(*) AS row_count FROM ${quoteIdentifier(viewName)}`,
  );
  const ingestMs = performance.now() - start;

  const countRows = await countResult.getRowObjectsJS();
  const rowCount = Number(countRows[0]?.row_count ?? 0);
  conn.closeSync();

  if (rowCount !== expectedRows) {
    throw new Error(
      `Parquet view row mismatch: expected ${expectedRows}, got ${rowCount}`,
    );
  }

  return { rowsPerSec: rowCount / (ingestMs / 1000), ingestMs };
}

// ─── SUMMARIZE: the production profiling path ────────────────────────────────

async function summarize(
  conn: Awaited<ReturnType<DuckDBInstance["connect"]>>,
  viewName: string,
): Promise<number> {
  const result = await conn.run(`
    SUMMARIZE
    SELECT *
    FROM ${quoteIdentifier(viewName)}
  `);
  const rows = await result.getRowObjectsJS();
  return rows.length;
}

// ─── Bench scenarios ─────────────────────────────────────────────────────────

interface Scenario {
  label: string;
  rows: number;
  cols: number;
}

/**
 * Ingestion throughput scenarios (task §1): 100k and 1M rows, at a moderate
 * 20-col schema (the typical telecom DailyTransactions width).
 */
const INGEST_SCENARIOS: Scenario[] = [
  { label: "csv-ingest-100k-x20", rows: 100_000, cols: 20 },
  { label: "csv-ingest-1m-x20", rows: 1_000_000, cols: 20 },
];

/**
 * Profiling scenarios (task §2): wide schemas (20 and 60 cols) over a large
 * row count. SUMMARIZE cost scales with BOTH width and depth, so we hold rows
 * large and vary width.
 */
const SUMMARIZE_SCENARIOS: Scenario[] = [
  { label: "summarize-500k-x20", rows: 500_000, cols: 20 },
  { label: "summarize-500k-x60", rows: 500_000, cols: 60 },
];

let tmpDir = "";
let instance: DuckDBInstance;

// Ingested-table registry, keyed by scenario label, populated in beforeAll.
const ingested = new Map<string, IngestResult>();
// One persistent read connection per summarized view (reused across bench runs).
const summarizeConns = new Map<
  string,
  Awaited<ReturnType<DuckDBInstance["connect"]>>
>();

/** Ensure a CSV exists + is ingested to a parquet-backed view; returns result. */
async function ensureIngested(scn: Scenario): Promise<IngestResult> {
  const existing = ingested.get(scn.label);
  if (existing) return existing;

  const csvPath = path.join(tmpDir, `${scn.label}.csv`);
  const cachePath = path.join(tmpDir, `${scn.label}.parquet`);
  const viewName = `v_${scn.label.replaceAll("-", "_")}`;

  const csvBytes = writeSyntheticCsv(csvPath, scn.rows, scn.cols);
  const result = await ingestCsv(
    instance,
    csvPath,
    cachePath,
    viewName,
    scn.rows,
    scn.cols,
  );
  result.csvBytes = csvBytes;
  ingested.set(scn.label, result);

  // eslint-disable-next-line no-console
  console.log(
    `[INGEST] ${scn.label}: ${result.rowCount.toLocaleString()} rows x ${scn.cols} cols | ` +
      `csv=${(csvBytes / 1024 / 1024).toFixed(1)}MB | ${result.ingestMs.toFixed(0)}ms | ` +
      `${Math.round(result.rowsPerSec).toLocaleString()} rows/sec`,
  );

  return result;
}

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "dn-duckdb-bench-"));
  // In-memory instance is what the engine uses for ephemeral scans; the on-disk
  // parquet cache (which IS the app's persistence) is written to tmpDir.
  instance = await DuckDBInstance.create(":memory:");

  // ── §1 + §3: CSV ingestion throughput (+ parquet round-trip). ─────────────
  for (const scn of INGEST_SCENARIOS) {
    const result = await ensureIngested(scn);

    // §3 parquet round-trip on the COPY-produced file (quick: it's columnar).
    const rt = await ingestParquet(
      instance,
      result.cachePath,
      `${result.viewName}_pq`,
      result.rowCount,
    );
    // eslint-disable-next-line no-console
    console.log(
      `[PARQUET-RT] ${scn.label}: ${rt.ingestMs.toFixed(1)}ms | ` +
        `${Math.round(rt.rowsPerSec).toLocaleString()} rows/sec (read_parquet view)`,
    );
  }

  // ── §2: ingest the wide-schema tables once, open a read conn per view. ────
  for (const scn of SUMMARIZE_SCENARIOS) {
    const result = await ensureIngested(scn);
    const conn = await instance.connect();
    // Warm + correctness check: SUMMARIZE must yield one row per column.
    const colCount = await summarize(conn, result.viewName);
    if (colCount !== scn.cols) {
      throw new Error(
        `SUMMARIZE col mismatch for ${scn.label}: expected ${scn.cols}, got ${colCount}`,
      );
    }
    summarizeConns.set(scn.label, conn);
  }
}, 600_000);

afterAll(() => {
  for (const conn of summarizeConns.values()) {
    try {
      conn.closeSync();
    } catch {
      // best-effort cleanup
    }
  }
  try {
    instance?.closeSync();
  } catch {
    // best-effort cleanup
  }
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── §2: SUMMARIZE profiling latency (the repeatable measurement) ────────────

describe("DuckDB SUMMARIZE profiling latency (real engine)", () => {
  for (const scn of SUMMARIZE_SCENARIOS) {
    bench(
      `SUMMARIZE ${scn.rows.toLocaleString()} rows x ${scn.cols} cols`,
      async () => {
        const result = ingested.get(scn.label);
        const conn = summarizeConns.get(scn.label);
        if (!result || !conn) {
          throw new Error(`Scenario not ingested: ${scn.label}`);
        }
        await summarize(conn, result.viewName);
      },
      { iterations: 5, warmupIterations: 1, time: 0 },
    );
  }
});
