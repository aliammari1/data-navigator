"use client";

/**
 * Comlink-wrapped transform worker (offline SQL validation), lazily created and
 * torn down with the component. Same conventions as
 * src/features/csv-parser/workers/useCsvWorker.ts.
 *
 * Validation is intentionally fire-and-forget tolerant: if the worker cannot be
 * constructed (e.g. SSR / Storybook), callers fall back to treating SQL as
 * unvalidated-OK rather than blocking the pipeline.
 */

import * as Comlink from "comlink";
import { useCallback, useEffect, useRef } from "react";
import type { SqlValidation } from "../engine/validate";
import type { TransformWorkerApi } from "./transform.worker";

interface Handle {
  worker: Worker;
  proxy: Comlink.Remote<TransformWorkerApi>;
}

export function useTransformWorker(): {
  validateSql: (sql: string) => Promise<SqlValidation>;
  validateFragment: (
    fragment: string,
    kind: "where" | "projection" | "groupby",
  ) => Promise<SqlValidation>;
} {
  const handleRef = useRef<Handle | null>(null);
  const unavailableRef = useRef(false);

  const getHandle = useCallback((): Handle | null => {
    if (unavailableRef.current) return null;
    if (handleRef.current) return handleRef.current;
    if (typeof Worker === "undefined") {
      unavailableRef.current = true;
      return null;
    }
    try {
      const worker = new Worker(new URL("./transform.worker.ts", import.meta.url), {
        type: "module",
        name: "transform-validate",
      });
      handleRef.current = { worker, proxy: Comlink.wrap<TransformWorkerApi>(worker) };
      return handleRef.current;
    } catch {
      unavailableRef.current = true;
      return null;
    }
  }, []);

  useEffect(() => {
    return () => {
      handleRef.current?.worker.terminate();
      handleRef.current = null;
    };
  }, []);

  const validateSql = useCallback(
    async (sql: string): Promise<SqlValidation> => {
      const handle = getHandle();
      if (!handle) return { ok: true };
      try {
        return await handle.proxy.validateSql(sql);
      } catch {
        return { ok: true };
      }
    },
    [getHandle],
  );

  const validateFragment = useCallback(
    async (fragment: string, kind: "where" | "projection" | "groupby"): Promise<SqlValidation> => {
      const handle = getHandle();
      if (!handle) return { ok: true };
      try {
        return await handle.proxy.validateFragment(fragment, kind);
      } catch {
        return { ok: true };
      }
    },
    [getHandle],
  );

  return { validateSql, validateFragment };
}
