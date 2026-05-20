"use client";
/**
 * Profile every column of a DuckDB table using a small set of fast queries.
 *
 * Strategy:
 * 1. One SUMMARIZE query gets base stats for every column.
 * 2. Histogram / top-values queries are fired in parallel with Promise.all.
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

async function fetchHistogram(
  tableName: string,
  colName: string,
  min: number,
  max: number,
): Promise<ColumnProfile["histogram"]> {
  const q = quote(colName);
  const t = quote(tableName);
  const histRows = await runQuery(`
    SELECT
      WIDTH_BUCKET(TRY_CAST(${q} AS DOUBLE), ${min}, ${max}, 30) AS b,
      COUNT(*) AS c
    FROM ${t}
    WHERE ${q} IS NOT NULL
    GROUP BY b
    ORDER BY b
  `);
  return histRows.map((r) => ({
    bucket: String(r.b ?? ""),
    count: Number(r.c ?? 0),
  }));
}

async function fetchTopValues(
  tableName: string,
  colName: string,
): Promise<ColumnProfile["topValues"]> {
  const q = quote(colName);
  const t = quote(tableName);
  const tv = await runQuery(`
    SELECT ${q} AS v, COUNT(*) AS c
    FROM ${t}
    WHERE ${q} IS NOT NULL
    GROUP BY v
    ORDER BY c DESC
    LIMIT 10
  `);
  return tv.map((r) => ({ value: r.v, count: Number(r.c ?? 0) }));
}

export async function profileTable(
  tableName: string,
): Promise<ColumnProfile[]> {
  const info = await getTableInfo(tableName);
  const rowCount = info.rowCount;
  const t = quote(tableName);

  /* ── 1. Base stats for every column in one query ─────────────────────── */
  const summarizeRows = await runQuery(`SUMMARIZE ${t}`);

  const summarizeMap = new Map<string, Record<string, unknown>>();
  for (const row of summarizeRows) {
    const colName = String(row.column_name ?? "");
    if (colName) {
      summarizeMap.set(colName, row);
    }
  }

  /* ── 2. Build base ColumnProfile from SUMMARIZE ──────────────────────── */
  const baseProfiles: ColumnProfile[] = info.columns.map((col) => {
    const stats = summarizeMap.get(col.name);
    const semantic = classifyDuckType(col.type);

    const count = Number(stats?.count ?? rowCount);
    const nullPercentage = stats?.null_percentage;
    const nullCount = stats?.null_count;

    let nonNull: number;
    let nullRate: number;
    if (nullCount !== undefined) {
      nonNull = count - Number(nullCount);
      nullRate = count > 0 ? Number(nullCount) / count : 0;
    } else if (nullPercentage !== undefined) {
      nullRate = Number(nullPercentage);
      nonNull = Math.round(count * (1 - nullRate));
    } else {
      nonNull = count;
      nullRate = 0;
    }

    const cardinality = Number(
      stats?.distinct_count ?? stats?.approx_unique ?? 0,
    );

    /* Promote / demote heuristics */
    let actualSemantic = semantic;
    if (
      semantic !== "datetime" &&
      cardinality >= rowCount * 0.95 &&
      rowCount > 100
    ) {
      actualSemantic = "id";
    }
    if (semantic === "categorical" && cardinality > rowCount * 0.5) {
      actualSemantic = "text";
    }

    let min: number | string | undefined;
    let max: number | string | undefined;
    let avg: number | undefined;
    let median: number | undefined;
    let stddev: number | undefined;

    if (actualSemantic === "numeric") {
      min = Number(stats?.min);
      max = Number(stats?.max);
      avg = Number(stats?.avg);
      median = Number(stats?.q50);
      stddev = Number(stats?.std);
      if (Number.isNaN(min)) min = undefined;
      if (Number.isNaN(max)) max = undefined;
      if (Number.isNaN(avg)) avg = undefined;
      if (Number.isNaN(median)) median = undefined;
      if (Number.isNaN(stddev)) stddev = undefined;
    } else if (actualSemantic === "datetime") {
      if (stats?.min !== undefined) min = String(stats.min);
      if (stats?.max !== undefined) max = String(stats.max);
    }

    return {
      name: col.name,
      duckType: col.type,
      semantic: actualSemantic,
      nonNull,
      nullRate: Math.max(0, Math.min(1, nullRate)),
      cardinality,
      rowCount,
      min,
      max,
      avg,
      median,
      stddev,
    };
  });

  /* ── 3. Histogram / top-values in parallel ───────────────────────────── */
  const detailPromises = baseProfiles.map(async (profile) => {
    if (profile.semantic === "numeric") {
      const minNum = profile.min;
      const maxNum = profile.max;
      if (
        typeof minNum === "number" &&
        typeof maxNum === "number" &&
        Number.isFinite(minNum) &&
        Number.isFinite(maxNum) &&
        maxNum > minNum
      ) {
        try {
          const histogram = await fetchHistogram(
            tableName,
            profile.name,
            minNum,
            maxNum,
          );
          return {
            name: profile.name,
            histogram,
            topValues: undefined,
          };
        } catch {
          return {
            name: profile.name,
            histogram: undefined,
            topValues: undefined,
          };
        }
      }
    } else if (
      profile.semantic === "categorical" ||
      profile.semantic === "boolean"
    ) {
      try {
        const topValues = await fetchTopValues(tableName, profile.name);
        return {
          name: profile.name,
          histogram: undefined,
          topValues,
        };
      } catch {
        return {
          name: profile.name,
          histogram: undefined,
          topValues: undefined,
        };
      }
    }
    return { name: profile.name, histogram: undefined, topValues: undefined };
  });

  const detailResults = await Promise.all(detailPromises);

  const detailMap = new Map(
    detailResults.map((r) => [
      r.name,
      { histogram: r.histogram, topValues: r.topValues },
    ]),
  );

  /* ── 4. Merge and return ─────────────────────────────────────────────── */
  return baseProfiles.map((profile) => {
    const detail = detailMap.get(profile.name);
    return {
      ...profile,
      histogram: detail?.histogram,
      topValues: detail?.topValues,
    };
  });
}
