"use client";

/**
 * Reactive onboarding state + a router-bound tour runner.
 *
 * `dexie-react-hooks` (`useLiveQuery`) is not installed in this workspace, so
 * this reads the Dexie `tours` table with plain async queries and exposes a
 * `refresh()` so callers can re-pull after a tour completes / resets. The
 * runner persists progress itself (see `tour-runner.ts`); the hook is the read
 * + control surface for UI.
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ALL_TOURS, type TourDefinition } from "../data/tours";
import { getAllTourStates, resetAllTours, resetTour, type TourState } from "./onboarding-db";
import { createTourRunner, type TourRunner } from "./tour-runner";

export interface UseOnboarding {
  /** Persisted state keyed by tourId (empty until first load resolves). */
  states: Map<string, TourState>;
  /** True until the first Dexie read resolves. */
  loading: boolean;
  /** Convenience: has this tour been completed? */
  isCompleted: (tourId: string) => boolean;
  /** Start (or replay) a tour. Re-pulls state when it ends. */
  startTour: (tour: TourDefinition) => Promise<void>;
  /** Forget one tour's progress and re-pull. */
  reset: (tourId: string) => Promise<void>;
  /** Forget every tour's progress and re-pull. */
  resetAll: () => Promise<void>;
  /** Force a re-read of persisted state. */
  refresh: () => Promise<void>;
  /** Stop the active tour, if any. */
  stop: () => void;
  /** The underlying runner (e.g. to wire into a command palette). */
  runner: TourRunner;
}

export function useOnboarding(): UseOnboarding {
  const router = useRouter();
  const [states, setStates] = useState<Map<string, TourState>>(new Map());
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const runner = useMemo(() => createTourRunner((href) => router.push(href)), [router]);

  const refresh = useCallback(async () => {
    try {
      const map = await getAllTourStates();
      if (mounted.current) setStates(map);
    } catch {
      // IndexedDB unavailable (e.g. SSR / private mode) — treat as empty.
      if (mounted.current) setStates(new Map());
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      runner.stop();
    };
  }, [refresh, runner]);

  const startTour = useCallback(
    async (tour: TourDefinition) => {
      await runner.start(tour);
      // driver.js is imperative; re-pull once the user leaves the tour so the
      // launcher reflects new completion state.
      const onLeave = () => {
        if (!runner.isActive()) {
          window.removeEventListener("focus", onLeave);
          void refresh();
        }
      };
      // Poll-free re-sync: re-read shortly after start ends. A short delayed
      // refresh covers the common "ran to completion / closed" path.
      window.setTimeout(() => {
        if (!runner.isActive()) void refresh();
        else window.addEventListener("focus", onLeave);
      }, 500);
    },
    [runner, refresh],
  );

  const reset = useCallback(
    async (tourId: string) => {
      await resetTour(tourId);
      await refresh();
    },
    [refresh],
  );

  const resetAll = useCallback(async () => {
    await resetAllTours();
    await refresh();
  }, [refresh]);

  const isCompleted = useCallback(
    (tourId: string) => states.get(tourId)?.completed ?? false,
    [states],
  );

  return {
    states,
    loading,
    isCompleted,
    startTour,
    reset,
    resetAll,
    refresh,
    stop: runner.stop,
    runner,
  };
}

/** All tours, for the launcher UI. Re-exported for convenience. */
export { ALL_TOURS };
