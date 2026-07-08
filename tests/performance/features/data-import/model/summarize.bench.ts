import { bench, describe, vi } from "vitest";

/**
 * The module under test imports `summarizeDataset` from the Electron IPC bridge
 * (`@/platform/electron/electron-fs`, a `"use client"` boundary). The pure
 * hot-path functions we benchmark — `mapDuckTypeToColumnInfoType` and
 * `summarizeRowsToColumnInfo` — never touch IPC, so we stub the boundary to keep
 * the bench isolated from Electron / DuckDB.
 */
vi.mock("@/platform/electron/electron-fs", () => ({
  summarizeDataset: vi.fn(async () => []),
}));

import {
  mapDuckTypeToColumnInfoType,
  summarizeRowsToColumnInfo,
} from "@/features/data-import/model/summarize";

/**
 * Performance benchmarks for the DuckDB SUMMARIZE → ColumnInfo mapping
 * (run with `pnpm run bench`).
 *
 * `summarizeRowsToColumnInfo` runs once per import over one row PER COLUMN, and
 * `mapDuckTypeToColumnInfoType` runs once per column. On a wide schema (200–1000
 * columns) this is the per-ingest profiling hot path that turns raw SUMMARIZE
 * rows into the column metadata the UI renders.
 *
 * Inputs are built ONCE at module scope with a deterministic counter-based
 * generator (no Math.random / Date.now) so the bench measures the mapping, not
 * data generation. Width is varied across cases to surface per-column cost.
 */

// ─── Deterministic synthetic SUMMARIZE rows ──────────────────────────────────

/** A spread of real DuckDB `column_type` strings the mapper must classify. */
const DUCK_TYPES = [
  "BIGINT",
  "INTEGER",
  "DOUBLE",
  "FLOAT",
  "DECIMAL(18,2)",
  "HUGEINT",
  "VARCHAR",
  "TIMESTAMP",
  "TIMESTAMP WITH TIME ZONE",
  "DATE",
  "TIME",
  "BOOLEAN",
  "UUID",
  "BLOB",
  "NUMERIC(10,4)",
] as const;

/**
 * Build `count` SUMMARIZE rows with a deterministic, index-varied shape that
 * exercises every branch of the mapping (numeric vs string vs date columns,
 * `%`-suffixed and numeric null_percentage, bigint approx_unique, empty-string
 * "absent" fields).
 */
function buildSummaryRows(count: number): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const duckType = DUCK_TYPES[i % DUCK_TYPES.length];
    const nullPct = i % 4 === 0 ? `${(i % 100) + 0.5}%` : (i % 100) + 0.25;
    rows[i] = {
      column_name: `col_${i}`,
      column_type: duckType,
      min: i % 3 === 0 ? `min_${i}` : i * 1.5,
      max: i % 3 === 0 ? `max_${i}` : i * 7.5 + 10,
      approx_unique: BigInt(i + 1) * 31n,
      avg: i % 5 === 0 ? "" : i * 0.123, // "" exercises the empty→undefined path
      std: i * 0.01,
      q25: i * 0.25,
      q50: i * 0.5,
      q75: i * 0.75,
      count: BigInt(1_000_000 + i),
      null_percentage: nullPct,
    };
  }
  return rows;
}

/** Preview samples keyed by column name (Map lookup is part of the hot path). */
function buildPreviewSamples(count: number): Map<string, unknown[]> {
  const map = new Map<string, unknown[]>();
  for (let i = 0; i < count; i++) {
    // Populate only ~half so the `?? []` fallback path is also exercised.
    if (i % 2 === 0) {
      map.set(`col_${i}`, [i, `s_${i}`, i * 2, null, `s2_${i}`]);
    }
  }
  return map;
}

const ROW_COUNT = 5_000_000; // full-table row count used for nullCount math

const ROWS_200 = buildSummaryRows(200);
const ROWS_1000 = buildSummaryRows(1_000);
const SAMPLES_200 = buildPreviewSamples(200);
const SAMPLES_1000 = buildPreviewSamples(1_000);

// Flat list of just the type strings for the type-mapper micro-bench.
const TYPE_STRINGS_10K: string[] = Array.from(
  { length: 10_000 },
  (_, i) => DUCK_TYPES[i % DUCK_TYPES.length],
);

describe("mapDuckTypeToColumnInfoType (per-column type classification)", () => {
  bench("mapDuckTypeToColumnInfoType over 10k type strings", () => {
    let strings = 0;
    for (const t of TYPE_STRINGS_10K) {
      if (mapDuckTypeToColumnInfoType(t) === "string") strings++;
    }
    if (strings < 0) throw new Error("unreachable");
  });
});

describe("summarizeRowsToColumnInfo (wide-schema SUMMARIZE mapping)", () => {
  bench("summarizeRowsToColumnInfo over 200 columns", () => {
    summarizeRowsToColumnInfo(ROWS_200, ROW_COUNT, SAMPLES_200);
  });

  bench("summarizeRowsToColumnInfo over 1000 columns", () => {
    summarizeRowsToColumnInfo(ROWS_1000, ROW_COUNT, SAMPLES_1000);
  });
});
