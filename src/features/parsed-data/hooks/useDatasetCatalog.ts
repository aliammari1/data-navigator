"use client";

/**
 * Dataset catalog loading, extracted from the screen. Loads the registered
 * datasets over IPC, mirrors them into the Zustand data store, and auto-selects
 * the first dataset when none is active. `refreshKey` re-triggers the load.
 */

import { useCallback, useEffect, useState } from "react";
import { useDataStore } from "@/core/stores/data-store";
import { listRegisteredDatasets, type RegisteredDataset } from "@/platform/duckdb/duckdb";

export interface DatasetCatalogState {
  catalog: RegisteredDataset[];
  activeDataset: RegisteredDataset | null;
  activeDatasetId: string | null;
  loading: boolean;
  error: string | null;
  setActiveDataset: (datasetId: string) => void;
}

export function useDatasetCatalog(refreshKey: number): DatasetCatalogState {
  const { activeDatasetId, setActiveDataset, replaceDatasetsFromCatalog } = useDataStore();

  const [catalog, setCatalog] = useState<RegisteredDataset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextCatalog = await listRegisteredDatasets();
      setCatalog(nextCatalog);
      replaceDatasetsFromCatalog(nextCatalog);

      if (!activeDatasetId && nextCatalog[0]) {
        setActiveDataset(nextCatalog[0].id);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [activeDatasetId, replaceDatasetsFromCatalog, setActiveDataset]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is an intentional refetch trigger.
  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog, refreshKey]);

  const activeDataset =
    catalog.find((dataset) => dataset.id === activeDatasetId) ?? catalog[0] ?? null;

  return {
    catalog,
    activeDataset,
    activeDatasetId,
    loading,
    error,
    setActiveDataset,
  };
}
