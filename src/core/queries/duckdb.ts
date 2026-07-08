"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listRegisteredDatasets,
  type RegisteredDataset,
  runReadOnlyQuery,
} from "@/platform/duckdb/duckdb";
import { queryKeys } from "./keys";

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function resolveDatasetByViewName(
  datasets: RegisteredDataset[],
  viewName: string,
): RegisteredDataset | null {
  return (
    datasets.find(
      (dataset) =>
        dataset.id === viewName ||
        dataset.viewName === viewName ||
        dataset.displayName === viewName,
    ) ?? null
  );
}

/**
 * Run a read-only DuckDB SQL query with React Query caching.
 *
 * Important:
 * - `runReadOnlyQuery` accepts only SQL.
 * - `params` are only part of the React Query cache key here.
 * - If you need real parameter binding later, add a separate safe API.
 */
export function useDuckDBQuery(
  sql: string,
  params?: unknown[],
  options?: { enabled?: boolean; staleTime?: number },
) {
  return useQuery({
    queryKey: queryKeys.duckdb.query(sql, params),
    queryFn: async () => {
      if (!sql.trim()) return [] as Record<string, unknown>[];
      return runReadOnlyQuery(sql);
    },
    enabled: options?.enabled !== false && sql.trim().length > 0,
    staleTime: options?.staleTime ?? 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Get dataset schema/info from the DuckDB dataset catalog.
 *
 * `tableName` is now treated as a view name / dataset id for compatibility.
 */
export function useTableSchema(tableName: string | null) {
  return useQuery({
    queryKey: tableName ? queryKeys.duckdb.schema(tableName) : ["duckdb", "schema", "null"],
    queryFn: async () => {
      if (!tableName) return null;

      const datasets = await listRegisteredDatasets();
      const dataset = resolveDatasetByViewName(datasets, tableName);

      if (!dataset) {
        throw new Error(`Dataset/view not found: ${tableName}`);
      }

      return {
        columns: dataset.columns,
        rowCount: dataset.rowCount,
      };
    },
    enabled: Boolean(tableName),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Get a preview of dataset/view data.
 */
export function useTablePreview(tableName: string | null, limit = 100) {
  return useDuckDBQuery(
    tableName ? `SELECT * FROM ${quoteIdentifier(tableName)} LIMIT ${Math.floor(limit)}` : "",
    [],
    {
      enabled: Boolean(tableName),
      staleTime: 60 * 1000,
    },
  );
}

/**
 * Count rows in a dataset/view.
 */
export function useTableRowCount(tableName: string | null) {
  return useQuery({
    queryKey: tableName ? ["duckdb", "count", tableName] : ["duckdb", "count", "null"],
    queryFn: async () => {
      if (!tableName) return 0;

      const rows = await runReadOnlyQuery(
        `SELECT COUNT(*) AS count FROM ${quoteIdentifier(tableName)}`,
      );

      return Number(rows[0]?.count ?? 0);
    },
    enabled: Boolean(tableName),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Invalidate all DuckDB-related queries.
 *
 * Call this after dataset registration, deletion, import, export, or any
 * operation that changes the DuckDB catalog/cache.
 */
export function useInvalidateDuckDBQueries() {
  const queryClient = useQueryClient();

  return {
    invalidateAll: () => {
      queryClient.invalidateQueries({ queryKey: ["duckdb"] });
    },

    invalidateTable: (tableName: string) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.duckdb.schema(tableName),
      });

      queryClient.invalidateQueries({
        queryKey: queryKeys.duckdb.preview(tableName),
      });

      queryClient.invalidateQueries({
        queryKey: ["duckdb", "count", tableName],
      });

      queryClient.invalidateQueries({
        queryKey: ["duckdb", "query"],
      });
    },

    invalidateDataset: (datasetId: string) => {
      queryClient.invalidateQueries({
        queryKey: ["duckdb"],
      });

      queryClient.invalidateQueries({
        queryKey: ["datasets"],
      });

      queryClient.invalidateQueries({
        queryKey: ["dataset", datasetId],
      });
    },
  };
}

/**
 * Prefetch a DuckDB read-only query result into the cache.
 */
export function usePrefetchDuckDBQuery() {
  const queryClient = useQueryClient();

  return {
    prefetch: async (sql: string, params?: unknown[]) => {
      if (!sql.trim()) return;

      await queryClient.prefetchQuery({
        queryKey: queryKeys.duckdb.query(sql, params),
        queryFn: () => runReadOnlyQuery(sql),
        staleTime: 2 * 60 * 1000,
      });
    },

    prefetchSchema: async (tableName: string) => {
      await queryClient.prefetchQuery({
        queryKey: queryKeys.duckdb.schema(tableName),
        queryFn: async () => {
          const datasets = await listRegisteredDatasets();
          const dataset = resolveDatasetByViewName(datasets, tableName);

          if (!dataset) {
            throw new Error(`Dataset/view not found: ${tableName}`);
          }

          return {
            columns: dataset.columns,
            rowCount: dataset.rowCount,
          };
        },
        staleTime: 5 * 60 * 1000,
      });
    },

    prefetchPreview: async (tableName: string, limit = 100) => {
      const sql = `SELECT * FROM ${quoteIdentifier(tableName)} LIMIT ${Math.floor(limit)}`;

      await queryClient.prefetchQuery({
        queryKey: queryKeys.duckdb.preview(tableName, limit),
        queryFn: () => runReadOnlyQuery(sql),
        staleTime: 60 * 1000,
      });
    },
  };
}
