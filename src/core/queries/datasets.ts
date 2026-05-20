"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  useDataStore,
  type Dataset,
  type QueryHistoryItem,
  type SavedChart,
  type DataTransform,
} from "@/core/stores/data-store";
import { queryKeys } from "./keys";

// ─── Datasets ────────────────────────────────────────────────────────────────

/**
 * Hook to get all datasets with React Query caching.
 * Reads from the Zustand store but provides RQ benefits (caching, suspense, etc.)
 */
export function useDatasets(filters?: { source?: string; format?: string }) {
  const datasets = useDataStore((s) => s.datasets);

  return useQuery({
    queryKey: queryKeys.datasets.list(filters),
    queryFn: () => {
      let result = datasets;
      if (filters?.source) {
        result = result.filter((d) => d.source === filters.source);
      }
      if (filters?.format) {
        result = result.filter((d) => d.format === filters.format);
      }
      return result;
    },
    // Data is always fresh since it comes from local Zustand store
    staleTime: Infinity,
    // No need to refetch — Zustand is the source of truth
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to get a single dataset by ID.
 */
export function useDataset(id: string | null) {
  const getDatasetById = useDataStore((s) => s.getDatasetById);

  return useQuery({
    queryKey: id ? queryKeys.datasets.detail(id) : ["datasets", "null"],
    queryFn: () => (id ? getDatasetById(id) ?? null : null),
    enabled: !!id,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to get a dataset by its DuckDB table name.
 */
export function useDatasetByTable(tableName: string | null) {
  const getDatasetByTable = useDataStore((s) => s.getDatasetByTable);

  return useQuery({
    queryKey: tableName
      ? queryKeys.datasets.byTable(tableName)
      : ["datasets", "null-table"],
    queryFn: () => (tableName ? getDatasetByTable(tableName) ?? null : null),
    enabled: !!tableName,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to get the active dataset.
 */
export function useActiveDataset() {
  const getActiveDataset = useDataStore((s) => s.getActiveDataset);
  const activeDatasetId = useDataStore((s) => s.activeDatasetId);

  return useQuery({
    queryKey: activeDatasetId
      ? queryKeys.datasets.detail(activeDatasetId)
      : ["datasets", "active", "null"],
    queryFn: () => getActiveDataset() ?? null,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * Add a dataset with React Query mutation (optimistic updates + error handling).
 */
export function useAddDataset() {
  const queryClient = useQueryClient();
  const addDataset = useDataStore((s) => s.addDataset);

  return useMutation({
    mutationFn: async (dataset: Dataset) => {
      addDataset(dataset);
      return dataset;
    },
    onSuccess: (dataset) => {
      // Invalidate dataset lists and set the new dataset detail
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.lists() });
      queryClient.setQueryData(
        queryKeys.datasets.detail(dataset.id),
        dataset,
      );
      queryClient.setQueryData(
        queryKeys.datasets.byTable(dataset.tableName),
        dataset,
      );
    },
  });
}

/**
 * Update a dataset with React Query mutation.
 */
export function useUpdateDataset() {
  const queryClient = useQueryClient();
  const updateDataset = useDataStore((s) => s.updateDataset);

  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Dataset>;
    }) => {
      updateDataset(id, patch);
      return { id, patch };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.datasets.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.lists() });
    },
  });
}

/**
 * Remove a dataset with React Query mutation.
 */
export function useRemoveDataset() {
  const queryClient = useQueryClient();
  const removeDataset = useDataStore((s) => s.removeDataset);

  return useMutation({
    mutationFn: async (id: string) => {
      removeDataset(id);
      return id;
    },
    onSuccess: (id) => {
      queryClient.removeQueries({ queryKey: queryKeys.datasets.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.lists() });
    },
  });
}

/**
 * Set the active dataset.
 */
export function useSetActiveDataset() {
  const queryClient = useQueryClient();
  const setActiveDataset = useDataStore((s) => s.setActiveDataset);

  return useMutation({
    mutationFn: async (id: string | null) => {
      setActiveDataset(id);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.all() });
    },
  });
}

// ─── Query History ───────────────────────────────────────────────────────────

/**
 * Hook to get query history with optional dataset filtering.
 */
export function useQueryHistory(datasetId?: string) {
  const queryHistory = useDataStore((s) => s.queryHistory);

  return useQuery({
    queryKey: queryKeys.queryHistory.list(datasetId),
    queryFn: () => {
      if (!datasetId) return queryHistory;
      return queryHistory.filter((q) => q.datasetId === datasetId);
    },
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Add a query history item.
 */
export function useAddQueryHistory() {
  const queryClient = useQueryClient();
  const addQueryHistory = useDataStore((s) => s.addQueryHistory);

  return useMutation({
    mutationFn: async (item: QueryHistoryItem) => {
      addQueryHistory(item);
      return item;
    },
    onSuccess: (item) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.queryHistory.list(item.datasetId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.queryHistory.lists(),
      });
    },
  });
}

/**
 * Clear query history.
 */
export function useClearQueryHistory() {
  const queryClient = useQueryClient();
  const clearQueryHistory = useDataStore((s) => s.clearQueryHistory);

  return useMutation({
    mutationFn: async () => {
      clearQueryHistory();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.queryHistory.all(),
      });
    },
  });
}

// ─── Saved Charts ────────────────────────────────────────────────────────────

/**
 * Hook to get saved charts.
 */
export function useSavedCharts(datasetId?: string) {
  const savedCharts = useDataStore((s) => s.savedCharts);

  return useQuery({
    queryKey: queryKeys.savedCharts.list(datasetId),
    queryFn: () => {
      if (!datasetId) return savedCharts;
      return savedCharts.filter((c) => c.datasetId === datasetId);
    },
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Save a chart.
 */
export function useSaveChart() {
  const queryClient = useQueryClient();
  const saveChart = useDataStore((s) => s.saveChart);

  return useMutation({
    mutationFn: async (chart: SavedChart) => {
      saveChart(chart);
      return chart;
    },
    onSuccess: (chart) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.savedCharts.list(chart.datasetId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.savedCharts.lists(),
      });
    },
  });
}

/**
 * Remove a chart.
 */
export function useRemoveChart() {
  const queryClient = useQueryClient();
  const removeChart = useDataStore((s) => s.removeChart);

  return useMutation({
    mutationFn: async (id: string) => {
      removeChart(id);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.savedCharts.all(),
      });
    },
  });
}

// ─── Transforms ──────────────────────────────────────────────────────────────

/**
 * Hook to get transforms.
 */
export function useTransforms(datasetId?: string) {
  const transforms = useDataStore((s) => s.transforms);

  return useQuery({
    queryKey: queryKeys.transforms.list(datasetId),
    queryFn: () => {
      if (!datasetId) return transforms;
      return transforms.filter((t) => t.inputDatasetId === datasetId);
    },
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Add a transform.
 */
export function useAddTransform() {
  const queryClient = useQueryClient();
  const addTransform = useDataStore((s) => s.addTransform);

  return useMutation({
    mutationFn: async (transform: DataTransform) => {
      addTransform(transform);
      return transform;
    },
    onSuccess: (transform) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.transforms.list(transform.inputDatasetId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.transforms.lists(),
      });
    },
  });
}

// ─── Table Loading ───────────────────────────────────────────────────────────

/**
 * Hook to get loaded table names (session-only, not persisted).
 */
export function useLoadedTableNames() {
  const loadedTableNames = useDataStore((s) => s.loadedTableNames);

  return useQuery({
    queryKey: ["duckdb", "loadedTables"],
    queryFn: () => loadedTableNames,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Mark a table as loaded.
 */
export function useMarkTableLoaded() {
  const queryClient = useQueryClient();
  const markTableLoaded = useDataStore((s) => s.markTableLoaded);

  return useMutation({
    mutationFn: async (tableName: string) => {
      markTableLoaded(tableName);
      return tableName;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["duckdb", "loadedTables"],
      });
    },
  });
}

// ─── Prefetch Helpers ────────────────────────────────────────────────────────

/**
 * Prefetch dataset details into the React Query cache.
 * Useful for route preloading or when you know a dataset will be needed soon.
 */
export function usePrefetchDataset() {
  const queryClient = useQueryClient();
  const getDatasetById = useDataStore((s) => s.getDatasetById);

  return useCallback(
    (id: string) => {
      const dataset = getDatasetById(id);
      if (dataset) {
        queryClient.setQueryData(queryKeys.datasets.detail(id), dataset);
      }
    },
    [queryClient, getDatasetById],
  );
}
