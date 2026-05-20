"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { runQuery, getTableInfo } from "@/platform/duckdb/duckdb";
import { queryKeys } from "./keys";

/**
 * Run a DuckDB SQL query with React Query caching.
 *
 * Performance best practices:
 * - staleTime: 2 minutes (DuckDB data doesn't change unless explicitly modified)
 * - gcTime: 10 minutes (keep query results in cache)
 * - refetchOnWindowFocus: false (offline-first app)
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
      return runQuery(sql, params as { cache?: boolean; priority?: string });
    },
    enabled: options?.enabled !== false && sql.trim().length > 0,
    staleTime: options?.staleTime ?? 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Get table schema/info with caching.
 */
export function useTableSchema(tableName: string | null) {
  return useQuery({
    queryKey: tableName ? queryKeys.duckdb.schema(tableName) : ["duckdb", "schema", "null"],
    queryFn: async () => {
      if (!tableName) return null;
      return getTableInfo(tableName);
    },
    enabled: !!tableName,
    staleTime: 5 * 60 * 1000, // 5 minutes (schema rarely changes)
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Get a preview of table data (first N rows).
 */
export function useTablePreview(tableName: string | null, limit = 100) {
  return useDuckDBQuery(
    tableName ? `SELECT * FROM "${tableName}" LIMIT ${limit}` : "",
    [],
    {
      enabled: !!tableName,
      staleTime: 60 * 1000, // 1 minute
    },
  );
}

/**
 * Count rows in a table.
 */
export function useTableRowCount(tableName: string | null) {
  return useQuery({
    queryKey: tableName ? ["duckdb", "count", tableName] : ["duckdb", "count", "null"],
    queryFn: async () => {
      if (!tableName) return 0;
      const result = await runQuery(
        `SELECT COUNT(*) as count FROM "${tableName}"`,
      ) as { count: number }[];
      return result[0]?.count ?? 0;
    },
    enabled: !!tableName,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Invalidate all DuckDB-related queries.
 * Call this after any data-modifying operation (INSERT, UPDATE, DELETE, CREATE TABLE, etc.)
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
      // Also invalidate any custom queries that reference this table
      queryClient.invalidateQueries({ queryKey: ["duckdb", "query"] });
    },
  };
}

/**
 * Prefetch a DuckDB query result into the cache.
 * Useful for preloading data before the user navigates to a page.
 */
export function usePrefetchDuckDBQuery() {
  const queryClient = useQueryClient();

  return {
    prefetch: async (
      sql: string,
      params?: unknown[],
    ) => {
      if (!sql.trim()) return;
      await queryClient.prefetchQuery({
        queryKey: queryKeys.duckdb.query(sql, params),
        queryFn: () => runQuery(sql, params as { cache?: boolean; priority?: string }),
        staleTime: 2 * 60 * 1000,
      });
    },
    prefetchSchema: async (tableName: string) => {
      await queryClient.prefetchQuery({
        queryKey: queryKeys.duckdb.schema(tableName),
        queryFn: () => getTableInfo(tableName),
        staleTime: 5 * 60 * 1000,
      });
    },
    prefetchPreview: async (tableName: string, limit = 100) => {
      const sql = `SELECT * FROM "${tableName}" LIMIT ${limit}`;
      await queryClient.prefetchQuery({
        queryKey: queryKeys.duckdb.preview(tableName, limit),
        queryFn: () => runQuery(sql),
        staleTime: 60 * 1000,
      });
    },
  };
}
