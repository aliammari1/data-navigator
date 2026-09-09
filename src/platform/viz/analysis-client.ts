"use client";

/**
 * Comlink client for the shared analysis.worker. Lazy worker singleton with an
 * inline fallback: when Worker is unavailable the SAME pure kernels run inline
 * (correctness identical; only the off-main-thread benefit is lost).
 *
 * Usage:
 *   const analysis = getAnalysisProxy();
 *   const { labels, totalWithinss } = await analysis.kMeans(data, { k, seed: 42 });
 */

import * as Comlink from "comlink";
import type { AnalysisWorkerApi } from "@/workers/analysis.worker";

let worker: Worker | null = null;
let proxy: Comlink.Remote<AnalysisWorkerApi> | null = null;
let unavailable = false;

/**
 * Returns the Comlink-wrapped analysis worker, or null when no module-worker
 * support exists (callers then import the kernels inline — see analysis.worker).
 */
export function getAnalysisProxy(): Comlink.Remote<AnalysisWorkerApi> | null {
  if (unavailable) return null;
  if (proxy) return proxy;
  if (typeof Worker === "undefined") {
    unavailable = true;
    return null;
  }
  try {
    worker = new Worker(new URL("../../workers/analysis.worker.ts", import.meta.url), {
      type: "module",
      name: "analysis",
    });
    proxy = Comlink.wrap<AnalysisWorkerApi>(worker);
    return proxy;
  } catch {
    unavailable = true;
    return null;
  }
}

/** Tear down the worker (e.g. on app teardown / HMR). */
export function disposeAnalysisWorker(): void {
  worker?.terminate();
  worker = null;
  proxy = null;
  unavailable = false;
}
