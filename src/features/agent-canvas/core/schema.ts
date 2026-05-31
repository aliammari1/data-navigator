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
  type RegisteredDataset,
  runReadOnlyQuery,
} from "@/platform/duckdb/duckdb";
import { chat, isLoaded } from "./llm";
import type { ColumnProfile, ColumnSemantic, DataSchema } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ResolvedSchema {
  tableName: string;
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

function quoteSqlString(value: string): string {
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

async function profileColumn(input: {
  tableName: string;
  rowCount: number;
  column: {
    name: string;
    type: string;
  };
}): Promise<ColumnProfile> {
  const { tableName, rowCount, column } = input;
  const quotedTable = quoteIdentifier(tableName);
  const quotedColumn = quoteIdentifier(column.name);

  try {
    const rows = await runReadOnlyQuery(`
      SELECT
        COUNT(DISTINCT ${quotedColumn}) AS cardinality,
        COUNT(*) - COUNT(${quotedColumn}) AS null_count,
        MIN(TRY_CAST(${quotedColumn} AS DOUBLE)) AS min_val,
        MAX(TRY_CAST(${quotedColumn} AS DOUBLE)) AS max_val,
        AVG(TRY_CAST(${quotedColumn} AS DOUBLE)) AS avg_val
      FROM ${quotedTable}
    `);

    const stats = rows[0] ?? {};
    const cardinality = numberFrom(stats.cardinality, 0);
    const nullCount = numberFrom(stats.null_count, 0);
    const nullRate = rowCount > 0 ? nullCount / rowCount : 0;

    const sampleRows = await runReadOnlyQuery(`
      SELECT DISTINCT CAST(${quotedColumn} AS VARCHAR) AS value
      FROM ${quotedTable}
      WHERE ${quotedColumn} IS NOT NULL
      LIMIT 6
    `);

    const sample = sampleRows
      .map((row) => String(row.value ?? ""))
      .filter(Boolean);

    const semantic = inferSemantic(
      column.name,
      column.type,
      cardinality,
      rowCount,
    );

    return {
      name: column.name,
      duckType: column.type,
      semantic,
      cardinality,
      nullRate,
      sample,
      min: optionalNumber(stats.min_val),
      max: optionalNumber(stats.max_val),
      avg: optionalNumber(stats.avg_val),
    };
  } catch {
    return {
      name: column.name,
      duckType: column.type,
      semantic: "text",
      cardinality: 0,
      nullRate: 0,
      sample: [],
    };
  }
}

async function profileColumnsSequentially(input: {
  tableName: string;
  rowCount: number;
  columns: Array<{
    name: string;
    type: string;
  }>;
  emit: (text: string) => void;
}): Promise<ColumnProfile[]> {
  const profiles: ColumnProfile[] = [];

  for (let index = 0; index < input.columns.length; index += 1) {
    const column = input.columns[index];

    input.emit(
      `Profiling column ${index + 1}/${input.columns.length}: ${column.name}`,
    );

    const profile = await profileColumn({
      tableName: input.tableName,
      rowCount: input.rowCount,
      column,
    });

    profiles.push(profile);
  }

  return profiles;
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

  const profiles = await profileColumnsSequentially({
    tableName,
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

  if (isLoaded()) {
    emit("Asking LLM to summarize the dataset…");

    try {
      const columnList = profiles
        .map(
          (column) =>
            `${column.name}(${column.semantic}, card=${column.cardinality})`,
        )
        .join(", ");

      summary = await chat(
        "You are a data analyst. Summarize the dataset in one sentence, max 25 words. Be specific about what the data represents.",
        `Dataset: ${resolved.displayName}. View: ${tableName}. Columns: ${columnList}. Row count: ${rowCount}.`,
        { maxTokens: 60 },
      );

      summary = summary.replace(/^["']|["']$/g, "").trim();
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
