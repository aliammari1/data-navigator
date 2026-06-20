"use client";

import * as Comlink from "comlink";
import type * as AnalyticsWorker from "@/features/deep-analytics/workers/analytics.worker";

type AnalyticsApi = Comlink.Remote<typeof AnalyticsWorker>;

let api: AnalyticsApi | null = null;
let worker: Worker | null = null;

/**
 * Lazily-created singleton Comlink client for the deep-analytics ML worker.
 *
 * One worker multiplexes k-means and attribution across every tab, so the
 * render thread never blocks on ML compute. SSR-safe: callers must invoke
 * this from client effects/handlers only.
 */
export function getMLClient(): AnalyticsApi {
  if (typeof window === "undefined") {
    throw new Error("getMLClient must be called in the browser");
  }
  if (!api) {
    worker = new Worker(new URL("../workers/analytics.worker.ts", import.meta.url), {
      type: "module",
    });
    api = Comlink.wrap<typeof AnalyticsWorker>(worker);
  }
  return api;
}

/** Tear down the worker (used by tests / hot-reload). */
export function disposeMLClient(): void {
  worker?.terminate();
  worker = null;
  api = null;
}
