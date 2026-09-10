"use client";

/**
 * Real import history, hydrated from the DuckDB dataset catalog.
 *
 * This replaces the hardcoded `INITIAL_UPLOAD_HISTORY` mock (now deleted). The
 * main process already persists every registered dataset in `app_datasets` and
 * restores the views on init, so `listDatasets()` is the source of truth that
 * survives reload — no separate Dexie store is needed for this view.
 */

import { useCallback, useEffect, useState } from "react";
import { duckdbClient } from "@/platform/duckdb/duckdb-client";
import { isElectron, type RegisteredDataset } from "@/platform/electron/electron-fs";

export interface ImportHistoryEntry {
  id: string;
  name: string;
  rows: number;
  cols: number;
  format: string;
  createdAt: string;
}

function toHistoryEntry(dataset: RegisteredDataset): ImportHistoryEntry {
  return {
    id: dataset.id,
    name: dataset.displayName,
    rows: dataset.rowCount,
    cols: dataset.columns.length,
    format: dataset.sourceFormat,
    createdAt: dataset.createdAt,
  };
}

interface ImportHistoryState {
  history: ImportHistoryEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Load previously imported datasets from the DuckDB catalog.
 *
 * Returns an empty, non-erroring result outside Electron (no catalog bridge).
 */
export function useImportHistory(): ImportHistoryState {
  const [history, setHistory] = useState<ImportHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isElectron()) {
      setHistory([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const datasets = await duckdbClient.listDatasets();
      const entries = datasets
        .map(toHistoryEntry)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setHistory(entries);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { history, loading, error, refresh };
}
