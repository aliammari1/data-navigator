"use client";
/**
 * Profile every column of a DuckDB table using a small set of fast queries.
 */

import { getTableInfo, runQuery } from "@/platform/duckdb/duckdb";
import type { ColumnProfile, SemanticType } from "./types";

function classifyDuckType(t: string): SemanticType {
  const u = t.toUpperCase();
  if (/INT|BIGINT|FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL|HUGEINT/.test(u))
    return "numeric";
  if (/DATE|TIME|TIMESTAMP/.test(u)) return "datetime";
  if (/BOOL/.test(u)) return "boolean";
  return "categorical";
}

function quote(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function profileColumn(
  tableName: string,
  rowCount: number,
  col: { name: string; type: string },
): Promise<ColumnProfile> {
  const semantic = classifyDuckType(col.type);
  const q = quote(col.name);
  const t = quote(tableName);

  // Common stats
  const baseSQL = `
    SELECT
      COUNT(*) FILTER (WHERE ${q} IS NOT NULL) AS non_null,
      COUNT(DISTINCT ${q}) AS cardinality
    FROM ${t}
  `;
  const baseRow = (await runQuery(baseSQL))[0] ?? {};
  const nonNull = Number(baseRow.non_null ?? 0);
  const cardinality = Number(baseRow.cardinality ?? 0);
  const nullRate =
    rowCount > 0 ? Math.max(0, Math.min(1, 1 - nonNull / rowCount)) : 0;

  // Promote to id when cardinality ~= rowCount
  let actualSemantic = semantic;
  if (
    semantic !== "datetime" &&
    cardinality >= rowCount * 0.95 &&
    rowCount > 100
  ) {
    actualSemantic = "id";
  }
  // Demote categorical → text if super-long strings (heuristic on top samples)
  if (semantic === "categorical" && cardinality > rowCount * 0.5) {
    actualSemantic = "text";
  }

  let min: number | string | undefined;
  let max: number | string | undefined;
  let avg: number | undefined;
  let median: number | undefined;
  let stddev: number | undefined;
  let histogram: ColumnProfile["histogram"];
  let topValues: ColumnProfile["topValues"];

  if (actualSemantic === "numeric") {
    try {
      const numStats = (
        await runQuery(`
        SELECT
          MIN(TRY_CAST(${q} AS DOUBLE)) AS mn,
          MAX(TRY_CAST(${q} AS DOUBLE)) AS mx,
          AVG(TRY_CAST(${q} AS DOUBLE)) AS av,
          MEDIAN(TRY_CAST(${q} AS DOUBLE)) AS md,
          STDDEV_POP(TRY_CAST(${q} AS DOUBLE)) AS sd
        FROM ${t}
      `)
      )[0];
      min = Number(numStats?.mn);
      max = Number(numStats?.mx);
      avg = Number(numStats?.av);
      median = Number(numStats?.md);
      stddev = Number(numStats?.sd);

      // 30-bin histogram
      if (
        Number.isFinite(min) &&
        Number.isFinite(max) &&
        (max as number) > (min as number)
      ) {
        const histRows = await runQuery(`
          SELECT
            WIDTH_BUCKET(TRY_CAST(${q} AS DOUBLE), ${min}, ${max}, 30) AS b,
            COUNT(*) AS c
          FROM ${t}
          WHERE ${q} IS NOT NULL
          GROUP BY b
          ORDER BY b
        `);
        histogram = histRows.map((r) => ({
          bucket: String(r.b ?? ""),
          count: Number(r.c ?? 0),
        }));
      }
    } catch {
      /* ignore numeric profile errors */
    }
  } else if (actualSemantic === "datetime") {
    try {
      const dStats = (
        await runQuery(`
        SELECT
          MIN(TRY_CAST(${q} AS TIMESTAMP)) AS mn,
          MAX(TRY_CAST(${q} AS TIMESTAMP)) AS mx
        FROM ${t}
      `)
      )[0];
      min = String(dStats?.mn ?? "");
      max = String(dStats?.mx ?? "");
    } catch {
      /* ignore */
    }
  } else if (actualSemantic === "categorical" || actualSemantic === "boolean") {
    try {
      const tv = await runQuery(`
        SELECT ${q} AS v, COUNT(*) AS c
        FROM ${t}
        WHERE ${q} IS NOT NULL
        GROUP BY v
        ORDER BY c DESC
        LIMIT 10
      `);
      topValues = tv.map((r) => ({ value: r.v, count: Number(r.c ?? 0) }));
    } catch {
      /* */
    }
  }

  return {
    name: col.name,
    duckType: col.type,
    semantic: actualSemantic,
    nonNull,
    nullRate,
    cardinality,
    rowCount,
    min,
    max,
    avg,
    median,
    stddev,
    histogram,
    topValues,
  };
}

export async function profileTable(
  tableName: string,
): Promise<ColumnProfile[]> {
  const info = await getTableInfo(tableName);
  const profiles = await Promise.all(
    info.columns.map((c) =>
      profileColumn(tableName, info.rowCount, c).catch(
        (e) =>
          ({
            name: c.name,
            duckType: c.type,
            semantic: classifyDuckType(c.type),
            nonNull: 0,
            nullRate: 1,
            cardinality: 0,
            rowCount: info.rowCount,
            topValues: [],
            histogram: [],
            // tag failures so the UI can show them
            // (only present in the fallback path)
            // @ts-expect-error: optional debug field
            error: e instanceof Error ? e.message : String(e),
          }) satisfies ColumnProfile,
      ),
    ),
  );
  return profiles;
}
