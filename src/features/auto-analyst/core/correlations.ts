"use client";
/**
 * Numeric × numeric correlation matrix via DuckDB sample.
 */

import { sampleCorrelation } from "simple-statistics";
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
  const cols = num.map((p) => quote(p.name)).join(", ");
  const sample = await runQuery(
    `SELECT ${cols} FROM ${quote(tableName)} USING SAMPLE ${SAMPLE}`,
  ).catch(() =>
    runQuery(`SELECT ${cols} FROM ${quote(tableName)} LIMIT ${SAMPLE}`),
  );

  const cells: CorrelationCell[] = [];
  for (let i = 0; i < num.length; i++) {
    for (let j = i; j < num.length; j++) {
      const a = num[i].name;
      const b = num[j].name;
      const xs: number[] = [];
      const ys: number[] = [];
      for (const r of sample) {
        const x = Number(r[a]);
        const y = Number(r[b]);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          xs.push(x);
          ys.push(y);
        }
      }
      if (xs.length < 30) continue;
      const r = i === j ? 1 : sampleCorrelation(xs, ys);
      cells.push({ a, b, r: Number.isFinite(r) ? r : 0, n: xs.length });
    }
  }
  return cells;
}
