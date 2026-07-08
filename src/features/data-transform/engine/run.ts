/**
 * Pipeline execution + profiling, all through the read-only DuckDB IPC channel.
 *
 * Latency model (vs the legacy 2N IPC + N*60ms artificial sleep):
 *   - 1 IPC: per-step UNION-ALL count query (single nested CTE prefix)
 *   - 1 IPC: preview SELECT off the final CTE
 * => 2 IPC calls total, zero materialization, zero artificial delay.
 */

import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import {
  buildCountQuery,
  buildCTE,
  type CompiledPipeline,
  quoteIdent,
  type TransformStep,
} from "./sql";

export const PREVIEW_LIMIT = 1000;

export interface StepRuntime {
  status: "idle" | "running" | "done" | "error";
  inputRows?: number;
  outputRows?: number;
  error?: string;
}

export interface RunResult {
  finalRows: number;
  /** Per-step row counts keyed by step id (only for enabled steps). */
  perStep: Record<string, { input: number; output: number }>;
  preview: { cols: string[]; rows: Record<string, unknown>[] };
  sql: string;
  durationMs: number;
}

export interface RunPipelineInput {
  steps: TransformStep[];
  sourceTable: string;
  sourceRowCount: number;
}

/**
 * Run the compiled pipeline. Throws on SQL/DuckDB error (caller surfaces it on
 * the offending step) — the error message names the failing step where possible.
 */
export async function runPipeline({
  steps,
  sourceTable,
  sourceRowCount,
}: RunPipelineInput): Promise<RunResult> {
  const t0 = performance.now();
  const compiled = buildCTE(steps, sourceTable);
  const enabled = steps.filter((s) => s.enabled);

  // ── IPC 1: all per-step counts in one round-trip ──────────────────────────
  const countRows = await runReadOnlyQuery(buildCountQuery(steps, sourceTable, compiled));
  const countById = new Map<string, number>();
  for (const row of countRows) {
    countById.set(String(row.step_id), Number(row.n ?? 0));
  }

  // Walk the enabled steps in order to derive input -> output per step.
  const perStep: Record<string, { input: number; output: number }> = {};
  let prevCount = countById.get("__source__") ?? sourceRowCount;
  for (const step of enabled) {
    const output = countById.get(step.id) ?? prevCount;
    perStep[step.id] = { input: prevCount, output };
    prevCount = output;
  }
  const finalRows = enabled.length > 0 ? prevCount : sourceRowCount;

  // ── IPC 2: bounded preview off the final CTE ──────────────────────────────
  const previewSql = compiled.hasSteps
    ? `${compiled.sql}\nLIMIT ${PREVIEW_LIMIT}`
    : `SELECT * FROM ${quoteIdent(sourceTable)} LIMIT ${PREVIEW_LIMIT}`;
  const previewRows = await runReadOnlyQuery(previewSql);
  const cols = previewRows.length > 0 ? Object.keys(previewRows[0]) : [];

  return {
    finalRows,
    perStep,
    preview: { cols, rows: previewRows },
    sql: compiled.sql,
    durationMs: Math.round(performance.now() - t0),
  };
}

export interface ColumnProfile {
  column: string;
  type: string;
  nullPct: number;
  approxUnique: number;
  min: string | null;
  max: string | null;
}

/**
 * Profile a relation with DuckDB-native `SUMMARIZE` (one read-only query, no
 * network). Drives the profile strip + suggested-step hints.
 *
 * `relation` is the bare table/view name; it is quoted here.
 */
export async function profileTable(relation: string): Promise<ColumnProfile[]> {
  const rows = await runReadOnlyQuery(`SUMMARIZE ${quoteIdent(relation)}`);
  return rows.map((row) => {
    const count = Number(row.count ?? 0);
    const nullPercentage = row.null_percentage;
    // DuckDB returns null_percentage as a numeric/decimal; coerce robustly.
    const nullPct =
      nullPercentage != null
        ? Number(nullPercentage)
        : count > 0
          ? (Number(row.null_count ?? 0) / count) * 100
          : 0;
    return {
      column: String(row.column_name ?? ""),
      type: String(row.column_type ?? ""),
      nullPct: Number.isFinite(nullPct) ? nullPct : 0,
      approxUnique: Number(row.approx_unique ?? 0),
      min: row.min != null ? String(row.min) : null,
      max: row.max != null ? String(row.max) : null,
    };
  });
}

export type { CompiledPipeline };
