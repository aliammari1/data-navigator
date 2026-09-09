"use client";

/**
 * Comlink client for the shared chart.worker — a lazy worker singleton with a
 * capability guard. Returns null when Worker / OffscreenCanvas is unavailable so
 * callers can fall back to a main-thread `echarts-for-react` render (fed the same
 * tree-shaken `echarts` core instance — never the full build).
 */

import * as Comlink from "comlink";
import type { ChartWorkerApi } from "@/workers/chart.worker";

let worker: Worker | null = null;
let proxy: Comlink.Remote<ChartWorkerApi> | null = null;
let unavailable = false;

/** True only when off-main-thread chart rendering is actually possible. */
export function supportsOffscreenChart(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.transferControlToOffscreen === "function"
  );
}

export function getChartProxy(): Comlink.Remote<ChartWorkerApi> | null {
  if (unavailable) return null;
  if (proxy) return proxy;
  if (!supportsOffscreenChart()) {
    unavailable = true;
    return null;
  }
  try {
    worker = new Worker(new URL("../../workers/chart.worker.ts", import.meta.url), {
      type: "module",
      name: "echarts",
    });
    proxy = Comlink.wrap<ChartWorkerApi>(worker);
    return proxy;
  } catch {
    unavailable = true;
    return null;
  }
}

/** Monotonic id allocator for chart instances. */
let nextId = 1;
export function nextChartId(): number {
  return nextId++;
}
