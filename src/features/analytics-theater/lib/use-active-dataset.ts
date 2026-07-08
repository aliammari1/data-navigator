"use client";

import { useMemo } from "react";
import { useDataStore } from "@/core/stores/data-store";
import { type ColumnRoles, detectColumnRoles } from "./columns";

export interface ActiveDatasetContext {
  /** Stable dataset id, or null when nothing is active. */
  datasetId: string | null;
  /** Display name for headers. */
  name: string | null;
  /** DuckDB view name to query against (`viewName` falls back to `tableName`). */
  view: string | null;
  /** Row count of the active dataset (0 when unknown). */
  rowCount: number;
  /** Detected column roles for scene SQL building. */
  roles: ColumnRoles;
  /** Whether a usable dataset + view is available. */
  ready: boolean;
}

/**
 * Resolve the currently active dataset and derive the column roles every scene
 * needs. Re-computes only when the active dataset identity or its columns
 * change.
 */
export function useActiveDataset(): ActiveDatasetContext {
  const datasets = useDataStore((state) => state.datasets);
  const activeDatasetId = useDataStore((state) => state.activeDatasetId);

  return useMemo(() => {
    const dataset = datasets.find((d) => d.id === activeDatasetId) ?? datasets[0];
    const view = dataset?.viewName || dataset?.tableName || null;
    const roles = detectColumnRoles(dataset);
    return {
      datasetId: dataset?.id ?? null,
      name: dataset?.name ?? null,
      view,
      rowCount: dataset?.rowCount ?? 0,
      roles,
      ready: Boolean(view),
    };
  }, [datasets, activeDatasetId]);
}
