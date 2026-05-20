"use client";
/**
 * Numeric × numeric correlation matrix via DuckDB CORR().
 */

import { runQuery } from "@/platform/duckdb/duckdb";
import type { ColumnProfile, CorrelationCell } from "./types";

const SAMPLE = 4000;

function quote(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export async function correlationMatrix(
  tableName: string,
  profiles: ColumnProfile[],
): Promise<CorrelationCell[]> {
  const num = profiles.filter((p) => p.semantic === "numeric").slice(0, 8);
  if (num.length < 2) return [];

  const cells: CorrelationCell[] = [];

  // Diagonal cells (r = 1, no query needed)
  for (const p of num) {
    cells.push({ a: p.name, b: p.name, r: 1, n: p.nonNull });
  }

  // Build off-diagonal UNION ALL query
  const sampleParts: string[] = [];
  const limitParts: string[] = [];
  for (let i = 0; i < num.length; i++) {
    for (let j = i + 1; j < num.length; j++) {
      const a = num[i].name;
      const b = num[j].name;
      const qa = quote(a);
      const qb = quote(b);
      const escA = a.replace(/'/g, "''");
      const escB = b.replace(/'/g, "''");
      const samplePart = `SELECT '${escA}' AS a, '${escB}' AS b, CORR(${qa}, ${qb}) AS r, COUNT(*) AS n FROM (SELECT ${qa}, ${qb} FROM ${quote(tableName)} USING SAMPLE ${SAMPLE}) _ WHERE ${qa} IS NOT NULL AND ${qb} IS NOT NULL`;
      const limitPart = `SELECT '${escA}' AS a, '${escB}' AS b, CORR(${qa}, ${qb}) AS r, COUNT(*) AS n FROM (SELECT ${qa}, ${qb} FROM ${quote(tableName)} LIMIT ${SAMPLE}) _ WHERE ${qa} IS NOT NULL AND ${qb} IS NOT NULL`;
      sampleParts.push(samplePart);
      limitParts.push(limitPart);
    }
  }

  if (sampleParts.length === 0) return cells;

  const sampleSql = sampleParts.join("\nUNION ALL\n");
  const limitSql = limitParts.join("\nUNION ALL\n");

  const rows = await runQuery(sampleSql).catch(() => runQuery(limitSql));

  for (const row of rows) {
    const n = Number(row.n);
    if (n < 30) continue;
    const rawR = row.r;
    if (rawR === null || rawR === undefined) continue;
    const r = Number(rawR);
    cells.push({
      a: String(row.a),
      b: String(row.b),
      r: Number.isFinite(r) ? r : 0,
      n,
    });
  }

  return cells;
}
