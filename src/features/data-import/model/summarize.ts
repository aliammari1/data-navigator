"use client";

/**
 * Full-table column statistics from DuckDB `SUMMARIZE`.
 *
 * The renderer previously profiled columns twice: once in JS over the 100-row
 * preview (upload-to-duckdb.ts `buildPreviewColumnMetadata`) and again via
 * `computeColumnStats`/`computeQualityScores`. Both were preview-only and
 * therefore statistically wrong on large files.
 *
 * DuckDB already computes accurate, full-table stats cheaply over the managed
 * Parquet cache. `summarizeDataset({ datasetId })` runs:
 *
 *   SUMMARIZE SELECT * FROM <view>
 *
 * which returns one row per column with the shape:
 *   column_name, column_type, min, max, approx_unique, avg, std,
 *   q25, q50, q75, count, null_percentage
 *
 * This module turns those rows into `ColumnInfo[]` so quality scores and the
 * column metadata reflect the WHOLE dataset, not a sample.
 */

import { summarizeDataset } from "@/platform/electron/electron-fs";
import {
  nullRateFromSummary,
  numberOrUndefined,
} from "@/shared/duckdb-summary";
import type { ColumnInfo } from "./types";

interface SummarizeRow {
  column_name?: unknown;
  column_type?: unknown;
  min?: unknown;
  max?: unknown;
  approx_unique?: unknown;
  avg?: unknown;
  null_percentage?: unknown;
}

function asString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value);
  return text.length > 0 ? text : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  // Treat empty strings as missing (DuckDB occasionally emits "" for absent
  // numeric summary fields); otherwise defer to the shared coercion which also
  // handles BigInt COUNT/approx_unique over large tables.
  if (value === "") return undefined;
  return numberOrUndefined(value);
}

/**
 * Canonical DuckDB type-name → `ColumnInfo["type"]` mapper.
 *
 * Shared by the SUMMARIZE path here and by the preview path in
 * `import-pipeline.ts` (both produce the same `ColumnInfo` union), so the mapping
 * lives in exactly one place. The `"mixed"` sentinel is honoured for the preview
 * path; SUMMARIZE never emits it.
 */
export function mapDuckTypeToColumnInfoType(duckType: string): ColumnInfo["type"] {
  const normalized = duckType.toLowerCase();

  if (
    normalized.includes("int") ||
    normalized.includes("double") ||
    normalized.includes("float") ||
    normalized.includes("decimal") ||
    normalized.includes("numeric") ||
    normalized.includes("real") ||
    normalized.includes("hugeint")
  ) {
    return "number";
  }

  if (
    normalized.includes("timestamp") ||
    normalized.includes("date") ||
    normalized.includes("time")
  ) {
    return "date";
  }

  if (normalized.includes("bool")) {
    return "boolean";
  }

  if (normalized === "mixed") return "mixed";

  return "string";
}

/**
 * Convert DuckDB SUMMARIZE rows to `ColumnInfo[]`, mapped onto the preview-order
 * column list so existing UI ordering and sample values are preserved.
 *
 * @param summaryRows  raw rows from `summarizeDataset`
 * @param rowCount     full-table row count (for null/unique counts)
 * @param previewSamples per-column sample values from the preview, keyed by name
 */
export function summarizeRowsToColumnInfo(
  summaryRows: Record<string, unknown>[],
  rowCount: number,
  previewSamples: Map<string, unknown[]>,
): ColumnInfo[] {
  return summaryRows.map((raw) => {
    const row = raw as SummarizeRow;
    const name = asString(row.column_name) ?? "";
    const duckType = asString(row.column_type) ?? "VARCHAR";
    const type = mapDuckTypeToColumnInfoType(duckType);

    const nullRate = nullRateFromSummary(row.null_percentage);
    const nullCount = Math.round(nullRate * Math.max(0, rowCount));
    const uniqueCount = asFiniteNumber(row.approx_unique) ?? 0;
    const avg = type === "number" ? asFiniteNumber(row.avg) : undefined;

    const min =
      type === "number" ? asFiniteNumber(row.min) : asString(row.min);
    const max =
      type === "number" ? asFiniteNumber(row.max) : asString(row.max);

    return {
      name,
      type,
      nullCount,
      uniqueCount,
      sampleValues: previewSamples.get(name) ?? [],
      min,
      max,
      avg,
      nullRate,
    } satisfies ColumnInfo;
  });
}

/**
 * Fetch and map full-table statistics for a registered dataset.
 *
 * Returns `null` when SUMMARIZE is unavailable (e.g. the Electron bridge is not
 * present or the query fails) so the caller can fall back to preview metadata.
 */
export async function fetchFullTableColumnInfo(
  datasetId: string,
  rowCount: number,
  previewSamples: Map<string, unknown[]>,
): Promise<ColumnInfo[] | null> {
  try {
    const rows = await summarizeDataset({ datasetId });
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return summarizeRowsToColumnInfo(rows, rowCount, previewSamples);
  } catch {
    return null;
  }
}
