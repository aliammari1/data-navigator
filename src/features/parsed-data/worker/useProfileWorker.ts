"use client";

/**
 * Comlink-wrapped profiling worker, lazily instantiated and torn down with the
 * component. Mirrors `@/features/csv-parser/workers/useCsvWorker` and the
 * `new Worker(new URL(...))` bundler pattern already used across the app.
 */

import * as Comlink from "comlink";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { DetailQueryResult, ProfileQuery } from "../model/summary-map";
import type { ColProfile, ColumnDetail } from "../model/types";
import type { BuildProfilesResult, ProfileWorkerApi } from "./profile.worker";

export interface ProfileWorkerClient {
  buildProfiles(rows: unknown[]): Promise<BuildProfilesResult>;
  filterSort(profiles: ColProfile[], query: ProfileQuery): Promise<ColProfile[]>;
  parseDetail(result: DetailQueryResult): Promise<ColumnDetail>;
}

interface ProfileWorkerHandle {
  worker: Worker;
  proxy: Comlink.Remote<ProfileWorkerApi>;
}

export function useProfileWorker(): ProfileWorkerClient {
  const handleRef = useRef<ProfileWorkerHandle | null>(null);

  const getProxy = useCallback((): Comlink.Remote<ProfileWorkerApi> => {
    if (!handleRef.current) {
      const worker = new Worker(new URL("./profile.worker.ts", import.meta.url), {
        type: "module",
      });
      handleRef.current = {
        worker,
        proxy: Comlink.wrap<ProfileWorkerApi>(worker),
      };
    }
    return handleRef.current.proxy;
  }, []);

  useEffect(() => {
    return () => {
      handleRef.current?.worker.terminate();
      handleRef.current = null;
    };
  }, []);

  return useMemo<ProfileWorkerClient>(
    () => ({
      buildProfiles: (rows) => getProxy().buildProfiles(rows as never),
      filterSort: (profiles, query) => getProxy().filterSort(profiles, query),
      parseDetail: (result) => getProxy().parseDetail(result),
    }),
    [getProxy],
  );
}
