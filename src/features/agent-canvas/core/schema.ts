"use client";

/**
 * SchemaAgent — profiles a DuckDB dataset/view into a rich DataSchema.
 *
 * New DuckDB model:
 * - Prefer dataset catalog metadata from listRegisteredDatasets().
 * - Accept dataset id, view name, display name, or legacy table name.
 * - Use runReadOnlyQuery() only.
 * - Never use renderer-side write SQL.
 * - Avoid unbounded Promise.all profiling across many columns.
 */

import {
  listRegisteredDatasets,
  profileDataset,
  type RegisteredDataset,
  runReadOnlyQuery,
} from "@/platform/duckdb/duckdb";
import { aiReadySync, aiStructured } from "./ai-bridge";
import { SummarySchema } from "./plan-schema";
import type { ColumnProfile, ColumnSemantic, DataSchema } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ResolvedSchema {
  /** DuckDB view name to query. */
  tableName: string;
  /** Registered dataset id, when resolved from the catalog (for profileDataset). */
  datasetId?: string;
  displayName: string;
  rowCount: number;
  columns: Array<{
    name: string;
    type: string;
  }>;
}

// ─── SQL helpers ──────────────────────────────────────────────────────────────

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function _quoteSqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function numberFrom(value: unknown, fallback = 0): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function normalizeDuckDescribeRow(row: Record<string, unknown>): {
  name: string;
  type: string;
} {
  return {
    name: String(row.column_name ?? row.name ?? ""),
    type: String(row.column_type ?? row.type ?? "VARCHAR"),
  };
}

// ─── Dataset resolution ───────────────────────────────────────────────────────

function findDataset(
  catalog: RegisteredDataset[],
  tableNameOrDatasetId: string,
): RegisteredDataset | null {
  return (
    catalog.find(
      (dataset) =>
        dataset.id === tableNameOrDatasetId ||
        dataset.viewName === tableNameOrDatasetId ||
        dataset.displayName === tableNameOrDatasetId,
    ) ?? null
  );
}

async function resolveSchema(
  tableNameOrDatasetId: string,
): Promise<ResolvedSchema> {
  const catalog = await listRegisteredDatasets().catch(() => []);
  const dataset = findDataset(catalog, tableNameOrDatasetId);

  if (dataset) {
    return {
      tableName: dataset.viewName,
      datasetId: dataset.id,
      displayName: dataset.displayName,
      rowCount: dataset.rowCount,
      columns: dataset.columns.map((column) => ({
        name: column.name,
        type: column.type,
      })),
    };
  }

  /**
   * Fallback for old callers that still pass a DuckDB view/table name.
   * This stays read-only and keeps migration from breaking agent screens.
   */
  const quotedTable = quoteIdentifier(tableNameOrDatasetId);

  const [describeRows, countRows] = await Promise.all([
    runReadOnlyQuery(`DESCRIBE ${quotedTable}`),
    runReadOnlyQuery(`SELECT COUNT(*) AS row_count FROM ${quotedTable}`),
  ]);

  const columns = describeRows
    .map(normalizeDuckDescribeRow)
    .filter((column) => column.name.length > 0);

  return {
    tableName: tableNameOrDatasetId,
    displayName: tableNameOrDatasetId,
    rowCount: numberFrom(countRows[0]?.row_count, 0),
    columns,
  };
}

// ─── Column Semantic Inference ────────────────────────────────────────────────

function inferSemantic(
  colName: string,
  duckType: string,
  cardinality: number,
  rowCount: number,
): ColumnSemantic {
  const type = duckType.toLowerCase();
  const name = colName.toLowerCase();
  const safeRowCount = Math.max(rowCount, 1);
  const cardinalityRatio = cardinality / safeRowCount;

  if (type.includes("bool")) return "boolean";

  if (
    type.includes("date") ||
    type.includes("time") ||
    type.includes("timestamp")
  ) {
    return "datetime";
  }

  const numericTypes = [
    "int",
    "bigint",
    "hugeint",
    "double",
    "float",
    "decimal",
    "numeric",
    "real",
    "smallint",
    "tinyint",
  ];

  const isNumeric = numericTypes.some((numericType) =>
    type.includes(numericType),
  );

  if (isNumeric) {
    if (name.includes("id") && cardinalityRatio > 0.8) return "id";
    if (cardinality <= 2) return "boolean";
    return "numeric";
  }

  if (/\bid\b|_id$|^id_/.test(name) && cardinalityRatio > 0.9) {
    return "id";
  }

  if (cardinalityRatio > 0.95 || cardinality > 50_000) {
    return "text";
  }

  return "categorical";
}

// ─── Data Category Detection ──────────────────────────────────────────────────

function detectCategory(cols: ColumnProfile[]): string {
  const names = cols.map((column) => column.name.toLowerCase()).join(" ");

  if (/transaction|status|channel|msisdn|service_class/.test(names)) {
    return "telecom";
  }

  if (/revenue|profit|invoice|payment|balance|account/.test(names)) {
    return "finance";
  }

  if (/product|order|cart|sku|price|customer|shipping/.test(names)) {
    return "ecommerce";
  }

  if (/sensor|device|temperature|humidity|voltage|iot/.test(names)) {
    return "iot";
  }

  if (/employee|salary|department|hire|position|hr/.test(names)) {
    return "hr";
  }

  if (/patient|diagnosis|treatment|medication|hospital/.test(names)) {
    return "healthcare";
  }

  if (/click|session|pageview|bounce|conversion|funnel/.test(names)) {
    return "web-analytics";
  }

  return "generic";
}

// ─── Profiling ────────────────────────────────────────────────────────────────

/**
 * One `SUMMARIZE` row as returned by DuckDB. Field presence varies by DuckDB
 * version (and by column type), so every field is read defensively.
 */
interface SummarizeRow {
  column_name?: unknown;
  column_type?: unknown;
  min?: unknown;
  max?: unknown;
  approx_unique?: unknown;
  avg?: unknown;
  null_percentage?: unknown;
}

/**
 * Parse the `null_percentage` column from SUMMARIZE into a 0..1 rate. DuckDB
 * emits this either as a percentage number (e.g. `12.5`) or a string with a
 * trailing `%`, depending on version — handle both.
 */
function nullRateFromSummary(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const numeric = Number(String(value).replace("%", "").trim());
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(1, Math.max(0, numeric / 100));
}

/**
 * Profile every column with a SINGLE `SUMMARIZE` over the table plus ONE
 * bounded `USING SAMPLE` scan for example values, instead of two full-table
 * scans per column. SUMMARIZE uses HyperLogLog for `approx_unique`, so column
 * cardinality no longer requires a `COUNT(DISTINCT)` per column. This collapses
 * O(2·columns) round-trips into 2 total and removes the dominant schema-phase
 * stall on wide tables.
 */
async function profileColumnsBatched(input: {
  tableName: string;
  datasetId?: string;
  rowCount: number;
  columns: Array<{
    name: string;
    type: string;
  }>;
  emit: (text: string) => void;
}): Promise<ColumnProfile[]> {
  const { tableName, datasetId, rowCount, columns, emit } = input;
  const quotedTable = quoteIdentifier(tableName);

  // 1) ONE whole-dataset profile (min/max/avg/approx_unique/null%) in a single
  //    SUMMARIZE scan. Prefer the foundation `profileDataset()` (runs in the
  //    shared DuckDB worker, cached) when this is a registered dataset; fall
  //    back to an inline SUMMARIZE for legacy raw-view callers. Either way it is
  //    2 round-trips total, NOT O(2·columns).
  emit(`Summarizing ${columns.length} columns…`);
  const summaryByName = new Map<string, SummarizeRow>();
  try {
    const summaryRows: SummarizeRow[] = datasetId
      ? ((await profileDataset({ datasetId })) as SummarizeRow[])
      : ((await runReadOnlyQuery(
          `SUMMARIZE SELECT * FROM ${quotedTable}`,
        )) as SummarizeRow[]);
    for (const row of summaryRows) {
      const name = String(row.column_name ?? "");
      if (name) summaryByName.set(name, row);
    }
  } catch {
    // SUMMARIZE unavailable (rare) — fall back to empty stats; semantics are
    // still inferable from the column type + sampled distinct values below.
  }

  // 2) One bounded sample scan for representative distinct values per column.
  emit(`Sampling representative values…`);
  const sampleByName = new Map<string, string[]>();
  try {
    const sampledRows = await runReadOnlyQuery(
      `SELECT * FROM ${quotedTable} USING SAMPLE 500 ROWS`,
    );
    for (const column of columns) {
      const seen = new Set<string>();
      for (const row of sampledRows) {
        const value = row[column.name];
        if (value === null || value === undefined) continue;
        const text = String(value);
        if (!text) continue;
        seen.add(text);
        if (seen.size >= 6) break;
      }
      sampleByName.set(column.name, Array.from(seen));
    }
  } catch {
    // Sampling failed (e.g. tiny table without sampling support) — leave empty.
  }

  return columns.map((column) => {
    const summary = summaryByName.get(column.name);
    const cardinality = numberFrom(summary?.approx_unique, 0);
    const nullRate = nullRateFromSummary(summary?.null_percentage);
    const sample = sampleByName.get(column.name) ?? [];

    return {
      name: column.name,
      duckType: column.type,
      semantic: inferSemantic(column.name, column.type, cardinality, rowCount),
      cardinality,
      nullRate,
      sample,
      min: optionalNumber(summary?.min),
      max: optionalNumber(summary?.max),
      avg: optionalNumber(summary?.avg),
    } satisfies ColumnProfile;
  });
}

// ─── Main Analysis ────────────────────────────────────────────────────────────

export async function analyzeSchema(
  tableNameOrDatasetId: string,
  emit: (text: string) => void,
): Promise<DataSchema> {
  emit(`Resolving dataset "${tableNameOrDatasetId}"…`);

  const resolved = await resolveSchema(tableNameOrDatasetId);
  const { tableName, rowCount, columns } = resolved;

  emit(
    `Profiling ${columns.length} columns × ${rowCount.toLocaleString()} rows…`,
  );

  const profiles = await profileColumnsBatched({
    tableName,
    datasetId: resolved.datasetId,
    rowCount,
    columns,
    emit,
  });

  const category = detectCategory(profiles);
  emit(`Detected data category: ${category.toUpperCase()}`);

  const dimensions = profiles
    .filter(
      (column) =>
        column.semantic === "categorical" &&
        column.cardinality >= 2 &&
        column.cardinality <= 200,
    )
    .sort((a, b) => a.cardinality - b.cardinality)
    .map((column) => column.name)
    .slice(0, 8);

  const metrics = profiles
    .filter(
      (column) =>
        column.semantic === "numeric" &&
        !column.name.toLowerCase().includes("id"),
    )
    .map((column) => column.name)
    .slice(0, 8);

  const timeDims = profiles
    .filter((column) => column.semantic === "datetime")
    .map((column) => column.name);

  let summary = `A ${category} dataset with ${rowCount.toLocaleString()} rows and ${columns.length} columns.`;

  if (aiReadySync()) {
    emit("Asking LLM to summarize the dataset…");

    try {
      const columnList = profiles
        .map(
          (column) =>
            `${column.name}(${column.semantic}, card=${column.cardinality})`,
        )
        .join(", ");

      // Structured output: the model returns { summary } — guaranteed valid by
      // the provider grammar / Zod fallback, no string-quote scrubbing needed.
      const result = await aiStructured(
        "You are a data analyst. Summarize the dataset in one sentence, max 25 words. Be specific about what the data represents.",
        `Dataset: ${resolved.displayName}. View: ${tableName}. Columns: ${columnList}. Row count: ${rowCount}.`,
        SummarySchema,
        { maxTokens: 80 },
      );

      summary = result.summary.trim();
    } catch {
      // Keep deterministic heuristic summary.
    }
  }

  emit(
    `Schema ready — ${dimensions.length} dimensions, ${metrics.length} metrics, ${timeDims.length} time columns`,
  );

  return {
    tableName,
    rowCount,
    columns: profiles,
    category,
    summary,
    dimensions,
    metrics,
    timeDims,
  };
}
