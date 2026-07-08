"use client";

/**
 * Whole-dataset profile orchestration.
 *
 * Replaces the old O(columns × scans) per-column loop with:
 *   cache (Dexie) → 1 SUMMARIZE scan (IPC) → worker post-process → state → persist
 *
 * - On a cache hit the screen renders instantly with **zero** DuckDB scans.
 * - On a miss exactly one `SUMMARIZE SELECT *` scan profiles every column at
 *   once (min/max/avg/std/approx_unique/quantiles/null%), mapped off the main
 *   thread in the Comlink worker, then persisted keyed by `datasetId:updatedAt`.
 * - `refreshKey` busts the cache for an explicit Refresh.
 */

import { useEffect, useState } from "react";
import {
  cancelQueries,
  profileDataset,
  type RegisteredDataset,
  resetCancelToken,
} from "@/platform/duckdb/duckdb";
import type { SummarizeRow } from "../model/summary-map";
import type { ColProfile, QualityDimension } from "../model/types";
import {
  invalidateProfile,
  loadCachedProfile,
  profileCacheKey,
  saveProfile,
} from "../store/profile-cache";
import type { ProfileWorkerClient } from "../worker/useProfileWorker";

export type ProfileStatus = "idle" | "loading" | "ready" | "error";

export interface DatasetProfileState {
  profiles: ColProfile[];
  dimensions: QualityDimension[];
  status: ProfileStatus;
  error: string | null;
  /** True when the current result was served from the persistent cache. */
  fromCache: boolean;
}

interface ActiveDataset {
  id: string;
  updatedAt: string;
}

function toActive(dataset: RegisteredDataset | null): ActiveDataset | null {
  if (!dataset) return null;
  return { id: dataset.id, updatedAt: dataset.updatedAt };
}

export function useDatasetProfile(
  dataset: RegisteredDataset | null,
  worker: ProfileWorkerClient,
  refreshKey: number,
): DatasetProfileState {
  const [state, setState] = useState<DatasetProfileState>({
    profiles: [],
    dimensions: [],
    status: "idle",
    error: null,
    fromCache: false,
  });

  const active = toActive(dataset);
  const datasetId = active?.id ?? null;
  const updatedAt = active?.updatedAt ?? "";

  useEffect(() => {
    if (!datasetId) {
      setState({
        profiles: [],
        dimensions: [],
        status: "idle",
        error: null,
        fromCache: false,
      });
      return;
    }

    let cancelled = false;
    // Cancel token scoped to this dataset version: a dataset switch (cleanup)
    // aborts the queued/in-flight SUMMARIZE scan across the IPC boundary, not
    // just a local flag — closing the "queued scans keep running" offline gap.
    const cancelToken = `parsed-data:profile:${datasetId}:${updatedAt}:${refreshKey}`;

    async function run(id: string, version: string): Promise<void> {
      setState((prev) => ({ ...prev, status: "loading", error: null }));

      // A Refresh (refreshKey bump) must bust the persisted key, not reuse it.
      if (refreshKey > 0) {
        await invalidateProfile(id);
      } else {
        const cached = await loadCachedProfile(id, version);
        if (cancelled) return;
        if (cached) {
          setState({
            profiles: cached.profiles,
            dimensions: cached.dimensions,
            status: "ready",
            error: null,
            fromCache: true,
          });
          return;
        }
      }

      try {
        await resetCancelToken(cancelToken);
        // 1 cancel-aware scan for the entire dataset (SUMMARIZE pushdown).
        const summary = (await profileDataset({
          datasetId: id,
          cancelToken,
        })) as SummarizeRow[];
        if (cancelled) return;

        // Post-process (map + quality dimensions) off the main thread.
        const { profiles, dimensions } = await worker.buildProfiles(summary);
        if (cancelled) return;

        setState({
          profiles,
          dimensions,
          status: "ready",
          error: null,
          fromCache: false,
        });

        void saveProfile({
          key: profileCacheKey(id, version),
          datasetId: id,
          updatedAt: version,
          profiles,
          dimensions,
          computedAt: Date.now(),
        });
      } catch (error) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    }

    void run(datasetId, updatedAt);

    return () => {
      cancelled = true;
      // Abort any queued/in-flight scan for this dataset version on switch.
      void cancelQueries(cancelToken);
    };
  }, [datasetId, updatedAt, refreshKey, worker]);

  return state;
}
