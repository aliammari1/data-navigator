"use client";

/**
 * Reconciliation data hooks.
 *
 * Every number rendered by the reconciliation wizard flows through these hooks,
 * which push the diff into DuckDB (`runReadOnlyQuery`) and cache results with
 * React Query. There is no sample data and no JS-side diff loop: the FULL OUTER
 * JOIN, COALESCE, variance math, and rollups all run in DuckDB.
 */

import { useQuery } from "@tanstack/react-query";
import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import {
  actColName,
  buildMaterialRowsSQL,
  buildPageSQL,
  buildSummarySQL,
  type DiffConfig,
  type DiffStatus,
  expColName,
  keyColName,
  toNullableNum,
  toNum,
  varColName,
  varPctColName,
} from "./recon-sql";

export interface DiffMeasureCell {
  label: string;
  expected: number | null;
  actual: number | null;
  variance: number;
  variancePct: number | null;
}

export interface DiffRow {
  /** Composite key joined into a single display string. */
  key: string;
  /** Raw per-key parts in mapping order. */
  keyParts: string[];
  status: DiffStatus;
  measures: DiffMeasureCell[];
  /** Convenience accessor for the primary (first) measure variance. */
  primaryVariance: number;
  primaryVariancePct: number | null;
}

export interface DiffSummary {
  rowsTotal: number;
  rowsChanged: number;
  rowsAdded: number;
  rowsRemoved: number;
  rowsUnchanged: number;
  rowsMaterial: number;
  /** Per-measure expected/actual/variance sums, keyed by measure label. */
  totals: Record<string, { sumExpected: number; sumActual: number; sumVariance: number }>;
}

function configReady(cfg: DiffConfig | null): cfg is DiffConfig {
  return (
    cfg !== null &&
    !!cfg.expectedView &&
    !!cfg.actualView &&
    cfg.keyCols.length > 0 &&
    cfg.measures.length > 0
  );
}

export function mapDiffRow(cfg: DiffConfig, raw: Record<string, unknown>): DiffRow {
  const keyParts = cfg.keyCols.map((_, i) => String(raw[keyColName(i)] ?? "∅"));
  const measures: DiffMeasureCell[] = cfg.measures.map((m) => ({
    label: m.label,
    expected: toNullableNum(raw[expColName(m.label)]),
    actual: toNullableNum(raw[actColName(m.label)]),
    variance: toNum(raw[varColName(m.label)]),
    variancePct: toNullableNum(raw[varPctColName(m.label)]),
  }));
  const primary = measures[0];
  return {
    key: keyParts.join(" · "),
    keyParts,
    status: (raw.diff_status as DiffStatus) ?? "UNCHANGED",
    measures,
    primaryVariance: primary?.variance ?? 0,
    primaryVariancePct: primary?.variancePct ?? null,
  };
}

const reconKey = (cfg: DiffConfig) => [cfg.expectedView, cfg.actualView, cfg.keyCols, cfg.measures];

/** Aggregate rollup (status counts + per-measure sums) computed in DuckDB. */
export function useDiffSummary(cfg: DiffConfig | null, tolerancePct: number, enabled = true) {
  return useQuery({
    queryKey: ["reconciliation", "summary", cfg && reconKey(cfg), tolerancePct],
    enabled: enabled && configReady(cfg),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<DiffSummary> => {
      if (!configReady(cfg)) throw new Error("Reconciliation config incomplete.");
      const rows = await runReadOnlyQuery(buildSummarySQL(cfg, tolerancePct));
      const r = rows[0] ?? {};
      const totals: DiffSummary["totals"] = {};
      for (const m of cfg.measures) {
        totals[m.label] = {
          sumExpected: toNum(r[`sum_exp_${m.label}`]),
          sumActual: toNum(r[`sum_act_${m.label}`]),
          sumVariance: toNum(r[`sum_var_${m.label}`]),
        };
      }
      return {
        rowsTotal: toNum(r.rows_total),
        rowsChanged: toNum(r.rows_changed),
        rowsAdded: toNum(r.rows_added),
        rowsRemoved: toNum(r.rows_removed),
        rowsUnchanged: toNum(r.rows_unchanged),
        rowsMaterial: toNum(r.rows_material),
        totals,
      };
    },
  });
}

/** A single keyset page of diff rows, ordered by status + absolute variance. */
export function useDiffPage(
  cfg: DiffConfig | null,
  opts: { limit: number; offset: number; onlyChanged?: boolean },
  enabled = true,
) {
  return useQuery({
    queryKey: [
      "reconciliation",
      "page",
      cfg && reconKey(cfg),
      opts.limit,
      opts.offset,
      opts.onlyChanged ?? false,
    ],
    enabled: enabled && configReady(cfg),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<DiffRow[]> => {
      if (!configReady(cfg)) throw new Error("Reconciliation config incomplete.");
      const rows = await runReadOnlyQuery(buildPageSQL(cfg, opts));
      return rows.map((raw) => mapDiffRow(cfg, raw));
    },
  });
}

/**
 * Fetch the top-N most material changed rows directly (outside React Query
 * caching) for LLM hypothesis generation.
 */
export async function fetchMaterialRows(cfg: DiffConfig, limit: number): Promise<DiffRow[]> {
  const rows = await runReadOnlyQuery(buildMaterialRowsSQL(cfg, limit));
  return rows.map((raw) => mapDiffRow(cfg, raw));
}
