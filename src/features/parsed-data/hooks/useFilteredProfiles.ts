"use client";

/**
 * Debounced, off-main-thread filter + sort of the profile list.
 *
 * The search box used to re-filter and re-sort a fresh `[...profiles]` copy on
 * every keystroke, on the render thread. This hook instead defers the query and
 * runs the pipeline in the Comlink worker, so typing never blocks paint even on
 * very wide datasets. Until the first worker result arrives it falls back to the
 * full list so the UI is never empty.
 */

import { useDeferredValue, useEffect, useRef, useState } from "react";
import type { ProfileQuery } from "../model/summary-map";
import type { ColProfile } from "../model/types";
import type { ProfileWorkerClient } from "../worker/useProfileWorker";

export function useFilteredProfiles(
  profiles: ColProfile[],
  query: ProfileQuery,
  worker: ProfileWorkerClient,
): ColProfile[] {
  const [filtered, setFiltered] = useState<ColProfile[]>(profiles);
  const deferredQuery = useDeferredValue(query);
  const requestRef = useRef(0);

  useEffect(() => {
    requestRef.current += 1;
    const requestId = requestRef.current;

    // Fast path: an unfiltered, default-sorted-by-quality query is the common
    // initial state — keep it on the main thread to avoid a worker round-trip
    // flicker, while every interactive filter/sort goes to the worker.
    const isPristine =
      deferredQuery.search.trim() === "" &&
      deferredQuery.typeFilter === "all" &&
      deferredQuery.qualityFilter === "all";

    let cancelled = false;

    (async () => {
      const result = await worker.filterSort(profiles, deferredQuery);
      if (cancelled || requestId !== requestRef.current) return;
      setFiltered(result);
    })().catch(() => {
      // On worker failure, fall back to the unprocessed list.
      if (!cancelled && requestId === requestRef.current && isPristine) {
        setFiltered(profiles);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [profiles, deferredQuery, worker]);

  return filtered;
}
