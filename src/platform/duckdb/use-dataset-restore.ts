"use client";

import { useEffect, useRef } from "react";
import { useDataStore } from "@/core/stores/data-store";
import { loadTableFromFS } from "@/platform/duckdb/duckdb-fs";
import { sharedDuckDB } from "@/platform/duckdb/shared-duckdb";

/**
 * Runs once per dashboard session (after Zustand hydrates from localStorage).
 *
 * Strategy:
 *   1. Ask the worker which tables DuckDB already has — the OPFS-backed .duckdb
 *      file re-opens on every worker start, so previously loaded tables are
 *      already there without any extra work.
 *   2. For any dataset whose table is NOT in DuckDB (OPFS DB was cleared or the
 *      browser doesn't support OPFS), fall back to the Parquet snapshot.
 *   3. Call markTableLoaded for every successfully found/restored table.
 *
 * This eliminates the "table not found — reload from Upload" error that appeared
 * on every page refresh even though the data was intact.
 */
export function useDatasetRestore() {
  const datasets = useDataStore((state) => state.datasets);
  const markTableLoaded = useDataStore((state) => state.markTableLoaded);
  const restoredRef = useRef(false);

  useEffect(() => {
    // Wait for the store to hydrate from localStorage before running.
    if (datasets.length === 0 || restoredRef.current) return;
    restoredRef.current = true;

    const snapshot = datasets;

    sharedDuckDB
      .init()
      .then(() => sharedDuckDB.listTables())
      .then(async (existingTables) => {
        const inDb = new Set(existingTables);

        for (const dataset of snapshot) {
          if (inDb.has(dataset.tableName)) {
            // Table already in DuckDB (OPFS DB retained it) — just mark it.
            markTableLoaded(dataset.tableName);
          } else {
            // OPFS DB was cleared — try the Parquet snapshot fallback.
            const restored = await loadTableFromFS(dataset.tableName).catch(
              () => false,
            );
            if (restored) markTableLoaded(dataset.tableName);
          }
        }
      })
      .catch(() => {
        // Worker unavailable (SSR, unsupported browser) — silent.
      });
  }, [datasets, markTableLoaded]);
}
