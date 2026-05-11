"use client";
/**
 * SchemaAgent — profiles a DuckDB table into a rich DataSchema.
 * Deterministic DuckDB queries + optional LLM summary enrichment.
 */

import { runQuery, getTableInfo } from "@/platform/duckdb/duckdb";
import { chat, isLoaded } from "./llm";
import type { ColumnProfile, ColumnSemantic, DataSchema } from "./types";

// ─── Column Semantic Inference ────────────────────────────────────────────────

function inferSemantic(
  colName: string,
  duckType: string,
  cardinality: number,
  rowCount: number,
): ColumnSemantic {
  const t = duckType.toLowerCase();
  const n = colName.toLowerCase();

  if (t.includes("bool")) return "boolean";
  if (t.includes("date") || t.includes("time") || t.includes("timestamp"))
    return "datetime";

  const numTypes = [
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
  const isNum = numTypes.some((x) => t.includes(x));
  if (isNum) {
    // High-cardinality numbers with "id" in name → id
    if (n.includes("id") && cardinality / rowCount > 0.8) return "id";
    // Boolean-like numerics
    if (cardinality <= 2) return "boolean";
    return "numeric";
  }

  // Text columns
  if (n.match(/\bid\b|_id$|^id_/) && cardinality / rowCount > 0.9) return "id";
  if (cardinality / rowCount > 0.95 || cardinality > 50_000) return "text";
  return "categorical";
}

// ─── Data Category Detection ──────────────────────────────────────────────────

function detectCategory(cols: ColumnProfile[]): string {
  const names = cols.map((c) => c.name.toLowerCase()).join(" ");
  if (names.match(/transaction|status|channel|msisdn|service_class/))
    return "telecom";
  if (names.match(/revenue|profit|invoice|payment|balance|account/))
    return "finance";
  if (names.match(/product|order|cart|sku|price|customer|shipping/))
    return "ecommerce";
  if (names.match(/sensor|device|temperature|humidity|voltage|iot/))
    return "iot";
  if (names.match(/employee|salary|department|hire|position|hr/)) return "hr";
  if (names.match(/patient|diagnosis|treatment|medication|hospital/))
    return "healthcare";
  if (names.match(/click|session|pageview|bounce|conversion|funnel/))
    return "web-analytics";
  return "generic";
}

// ─── Main Analysis ────────────────────────────────────────────────────────────

export async function analyzeSchema(
  tableName: string,
  emit: (text: string) => void,
): Promise<DataSchema> {
  emit(`Fetching column metadata for "${tableName}"…`);
  const info = await getTableInfo(tableName);
  const { columns, rowCount } = info;

  emit(
    `Profiling ${columns.length} columns × ${rowCount.toLocaleString()} rows…`,
  );

  const profiles: ColumnProfile[] = await Promise.all(
    columns.map(async (col): Promise<ColumnProfile> => {
      try {
        const qn = `"${col.name.replace(/"/g, '""')}"`;
        const rows = await runQuery(`
          SELECT
            COUNT(DISTINCT ${qn})                                            AS cardinality,
            COUNT(*) - COUNT(${qn})                                         AS null_count,
            MIN(TRY_CAST(${qn} AS DOUBLE))                                  AS min_val,
            MAX(TRY_CAST(${qn} AS DOUBLE))                                  AS max_val,
            AVG(TRY_CAST(${qn} AS DOUBLE))                                  AS avg_val
          FROM "${tableName}"
        `);
        const r = rows[0] ?? {};
        const cardinality = Number(r.cardinality) || 0;
        const nullRate = rowCount > 0 ? Number(r.null_count) / rowCount : 0;

        // Sample values
        const sampleRows = await runQuery(
          `SELECT DISTINCT CAST(${qn} AS VARCHAR) AS v FROM "${tableName}" WHERE ${qn} IS NOT NULL LIMIT 6`,
        );
        const sample = sampleRows.map((x) => String(x.v ?? "")).filter(Boolean);

        const semantic = inferSemantic(
          col.name,
          col.type,
          cardinality,
          rowCount,
        );
        return {
          name: col.name,
          duckType: col.type,
          semantic,
          cardinality,
          nullRate,
          sample,
          min: r.min_val != null ? Number(r.min_val) : undefined,
          max: r.max_val != null ? Number(r.max_val) : undefined,
          avg: r.avg_val != null ? Number(r.avg_val) : undefined,
        };
      } catch {
        return {
          name: col.name,
          duckType: col.type,
          semantic: "text",
          cardinality: 0,
          nullRate: 0,
          sample: [],
        };
      }
    }),
  );

  const category = detectCategory(profiles);
  emit(`Detected data category: ${category.toUpperCase()}`);

  const dimensions = profiles
    .filter(
      (c) =>
        c.semantic === "categorical" &&
        c.cardinality >= 2 &&
        c.cardinality <= 200,
    )
    .sort((a, b) => a.cardinality - b.cardinality)
    .map((c) => c.name)
    .slice(0, 8);

  const metrics = profiles
    .filter(
      (c) => c.semantic === "numeric" && !c.name.toLowerCase().includes("id"),
    )
    .map((c) => c.name)
    .slice(0, 8);

  const timeDims = profiles
    .filter((c) => c.semantic === "datetime")
    .map((c) => c.name);

  // LLM-powered summary (optional enrichment)
  let summary = `A ${category} dataset with ${rowCount.toLocaleString()} rows and ${columns.length} columns.`;

  if (isLoaded()) {
    emit("Asking LLM to summarise the dataset…");
    try {
      const colList = profiles
        .map((c) => `${c.name}(${c.semantic},card=${c.cardinality})`)
        .join(", ");
      summary = await chat(
        "You are a data analyst. Summarise the dataset in ONE sentence (max 25 words). Be specific about what the data represents.",
        `Columns: ${colList}. Row count: ${rowCount}.`,
        { maxTokens: 60 },
      );
      summary = summary.replace(/^["']|["']$/g, "").trim();
    } catch {
      /* keep heuristic summary */
    }
  }

  emit(
    `Schema ready — ${dimensions.length} dims, ${metrics.length} metrics, ${timeDims.length} time cols`,
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
