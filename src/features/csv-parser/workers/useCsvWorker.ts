"use client";

/**
 * Comlink-wrapped CSV worker, lazily instantiated and torn down with the
 * component. Mirrors the worker conventions in `src/workers/*` and the
 * `new Worker(new URL(...))` bundler pattern used across the worker hooks.
 */

import * as Comlink from "comlink";
import { useCallback, useEffect, useRef } from "react";
import type { ParseRequest, ParseResult } from "../lib/types";
import type { CsvWorkerApi } from "./csv.worker";

interface CsvWorkerHandle {
  worker: Worker;
  proxy: Comlink.Remote<CsvWorkerApi>;
}

export function useCsvWorker(): {
  parse: (req: ParseRequest) => Promise<ParseResult>;
} {
  const handleRef = useRef<CsvWorkerHandle | null>(null);

  const getHandle = useCallback((): CsvWorkerHandle => {
    if (!handleRef.current) {
      const worker = new Worker(new URL("./csv.worker.ts", import.meta.url), { type: "module" });
      handleRef.current = {
        worker,
        proxy: Comlink.wrap<CsvWorkerApi>(worker),
      };
    }
    return handleRef.current;
  }, []);

  useEffect(() => {
    return () => {
      handleRef.current?.worker.terminate();
      handleRef.current = null;
    };
  }, []);

  const parse = useCallback(
    (req: ParseRequest): Promise<ParseResult> => getHandle().proxy.parse(req),
    [getHandle],
  );

  return { parse };
}
