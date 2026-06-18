"use client";

/**
 * Loads the real briefing context from the user's active dataset.
 *
 * This is the wiring that replaces `SAMPLE_DATA`: it reads `useDataStore`'s
 * active dataset and pushes all aggregation into DuckDB. When no dataset is
 * loaded, `context` is null and the UI shows an empty state instead of fake
 * numbers.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDataStore } from "@/core/stores/data-store";
import { type BriefingContext, buildBriefingContext } from "../core/briefing-context";

export interface BriefingContextState {
  context: BriefingContext | null;
  loading: boolean;
  error: string | null;
  hasDataset: boolean;
  datasetName: string | null;
  reload: () => void;
}

export function useBriefingContext(): BriefingContextState {
  // Select primitives/arrays independently and derive the active dataset with a
  // memo (matching the established pattern in other features) so the selector
  // doesn't return a fresh object on every render.
  const datasets = useDataStore((s) => s.datasets);
  const activeDatasetId = useDataStore((s) => s.activeDatasetId);
  const activeDataset = useMemo(
    () => datasets.find((d) => d.id === activeDatasetId) ?? null,
    [datasets, activeDatasetId],
  );
  const datasetId = activeDataset?.id ?? null;

  const [context, setContext] = useState<BriefingContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    if (!activeDataset) {
      setContext(null);
      setError(null);
      setLoading(false);
      return;
    }
    const reqId = ++reqRef.current;
    setLoading(true);
    setError(null);
    try {
      const ctx = await buildBriefingContext(activeDataset);
      if (reqRef.current === reqId) setContext(ctx);
    } catch (err) {
      if (reqRef.current === reqId) {
        setContext(null);
        setError(err instanceof Error ? err.message : "Could not read the active dataset.");
      }
    } finally {
      if (reqRef.current === reqId) setLoading(false);
    }
  }, [activeDataset]);

  // Re-derive whenever the active dataset (by id) changes. We intentionally key
  // off the dataset id, not `load`/the object reference, so the context isn't
  // rebuilt on unrelated store updates. `load` is recreated with the fresh
  // dataset in the same render the id changes, so we read the latest via a ref.
  const loadRef = useRef(load);
  loadRef.current = load;
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed off datasetId by design; load is read via ref to avoid rebuilds on unrelated store updates
  useEffect(() => {
    void loadRef.current();
  }, [datasetId]);

  return {
    context,
    loading,
    error,
    hasDataset: Boolean(activeDataset),
    datasetName: activeDataset?.name ?? null,
    reload: load,
  };
}
