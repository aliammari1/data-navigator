"use client";

import { useMemo } from "react";
import { useDataStore } from "@/core/stores/data-store";
import type { ColMeta } from "@/core/stores/data-store";

export interface AnalyticsSource {
  /** Stable app dataset id, or undefined when no dataset is active. */
  datasetId: string | undefined;
  /** DuckDB view name to query against. */
  viewName: string | undefined;
  /** Human-readable dataset name. */
  datasetName: string | undefined;
  rowCount: number;
  columns: ColMeta[];
  numericColumns: string[];
  categoricalColumns: string[];
  dateColumns: string[];
  /** True only when there is an active dataset with a resolvable view. */
  enabled: boolean;
}

/**
 * Single source of truth for deep-analytics data access.
 *
 * Resolves the active DuckDB dataset from the data store and pre-categorises
 * its columns so every tab can build real SQL aggregations instead of
 * fabricating in-memory arrays.
 */
export function useAnalyticsSource(): AnalyticsSource {
  const dataset = useDataStore((s) => s.getActiveDataset());

  return useMemo(() => {
    const columns = dataset?.columns ?? [];
    const numericColumns = columns.filter((c) => c.type === "number").map((c) => c.name);
    const categoricalColumns = columns
      .filter((c) => c.type === "string" || c.type === "boolean")
      .map((c) => c.name);
    const dateColumns = columns.filter((c) => c.type === "date").map((c) => c.name);

    const viewName = dataset?.viewName ?? dataset?.tableName;

    return {
      datasetId: dataset?.id,
      viewName,
      datasetName: dataset?.name,
      rowCount: dataset?.rowCount ?? 0,
      columns,
      numericColumns,
      categoricalColumns,
      dateColumns,
      enabled: Boolean(viewName),
    };
  }, [dataset]);
}
