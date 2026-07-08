"use client";

/**
 * Chart-data resolver — turns the focused table + encoding shelf into an
 * ECharts option. Chart specs compile deterministically from shelf state
 * (never AI-generated); this hook only routes the DATA:
 *
 *   - sql-eligible lineage → buildSQL over the leaf placeholder, inlined
 *     through the WITH chain by buildLineageSQL, run on the read-only DuckDB
 *     lane. The compiled SQL is exposed as a verification affordance.
 *   - python-lane tables → the buildSQL-shaped in-memory twin
 *     (aggregateRowsInMemory) over the node's materialized rows. Rehydrated
 *     nodes without rows surface "Réexécuter la dérivation" instead.
 *
 * Async safety: a requestId ref guards against stale DuckDB responses
 * committing over a newer shelf state.
 */

import { useEffect, useRef, useState } from "react";
import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import type { EChartsOption } from "@/platform/viz";
import { buildOption } from "../../core/chart-options";
import {
  aggregateRowsInMemory,
  resolveAutoChartType,
  shelfToChartSpec,
} from "../../core/formulator/chart-data";
import { buildLineageSQL, LEAF_PLACEHOLDER, sqlChainEligible } from "../../core/formulator/lineage";
import type { Row } from "../../core/formulator/model";
import { buildSQL } from "../../core/sql";
import type { ChartSpec } from "../../core/types";
import {
  needsRerun,
  useFormFocusedTable,
  useFormShelf,
  useFormTables,
} from "../../store/formulator-store";

export interface ChartDataState {
  option: EChartsOption | null;
  rows: Row[];
  sql: string | null;
  loading: boolean;
  error: string | null;
  resolvedChartType: string | null;
  /** The deterministic spec the option was compiled from — pin-to-dashboard persists it. */
  spec: ChartSpec | null;
}

const EMPTY_STATE: ChartDataState = {
  option: null,
  rows: [],
  sql: null,
  loading: false,
  error: null,
  resolvedChartType: null,
  spec: null,
};

/** Error shown when a rehydrated python node has no rows to chart from. */
export const RERUN_MESSAGE = "Réexécuter la dérivation";

function toOption(spec: ChartSpec, rows: Row[]): EChartsOption | null {
  // buildOption returns a structural Record; the tree-shaken EChartsOption
  // union describes the same shape but TS cannot prove the overlap.
  return buildOption(spec, rows) as unknown as EChartsOption | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useChartData(): ChartDataState {
  const tables = useFormTables();
  const shelf = useFormShelf();
  const focused = useFormFocusedTable();
  const [state, setState] = useState<ChartDataState>(EMPTY_STATE);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const commit = (next: ChartDataState) => {
      if (requestIdRef.current === requestId) setState(next);
    };

    const hasX = shelf.encodings.some((e) => e.channel === "x" && e.field);
    const hasY = shelf.encodings.some((e) => e.channel === "y" && e.field);
    if (!focused || (!hasX && !hasY)) {
      commit(EMPTY_STATE);
      return;
    }

    const resolvedChartType =
      shelf.chartType === "auto" ? resolveAutoChartType(shelf, focused.columns) : shelf.chartType;
    const spec = shelfToChartSpec(shelf, resolvedChartType);

    // ── SQL lane: original tables and pure-sql lineages query DuckDB ─────────
    if (sqlChainEligible(tables, focused.id)) {
      let sql: string;
      try {
        sql = buildLineageSQL(tables, focused.id, buildSQL(spec, LEAF_PLACEHOLDER));
      } catch (error) {
        commit({ ...EMPTY_STATE, error: errorMessage(error), resolvedChartType });
        return;
      }
      commit({ ...EMPTY_STATE, sql, loading: true, resolvedChartType, spec });
      void runReadOnlyQuery(sql)
        .then((rows) => {
          commit({
            option: toOption(spec, rows),
            rows,
            sql,
            loading: false,
            error: null,
            resolvedChartType,
            spec,
          });
        })
        .catch((error) => {
          commit({ ...EMPTY_STATE, sql, error: errorMessage(error), resolvedChartType, spec });
        });
      return;
    }

    // ── Python lane: aggregate the node's materialized rows in memory ────────
    if (needsRerun(focused)) {
      commit({ ...EMPTY_STATE, error: RERUN_MESSAGE, resolvedChartType, spec });
      return;
    }
    try {
      const rows = aggregateRowsInMemory(focused.rows ?? [], spec);
      commit({
        option: toOption(spec, rows),
        rows,
        sql: null,
        loading: false,
        error: null,
        resolvedChartType,
        spec,
      });
    } catch (error) {
      commit({ ...EMPTY_STATE, error: errorMessage(error), resolvedChartType, spec });
    }
  }, [tables, shelf, focused]);

  return state;
}
