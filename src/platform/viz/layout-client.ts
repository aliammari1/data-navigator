"use client";

/**
 * Comlink client for the shared layout.worker (h3 hexbin aggregation, off the
 * main thread). Lazy worker singleton.
 *
 * Usage:
 *   const layout = getLayoutProxy();
 *   const bins = await layout!.hexbin(points, resolution);
 */

import * as Comlink from "comlink";
import type { LayoutWorkerApi } from "@/workers/layout.worker";

let worker: Worker | null = null;
let proxy: Comlink.Remote<LayoutWorkerApi> | null = null;
let unavailable = false;

export function getLayoutProxy(): Comlink.Remote<LayoutWorkerApi> | null {
  if (unavailable) return null;
  if (proxy) return proxy;
  if (typeof Worker === "undefined") {
    unavailable = true;
    return null;
  }
  try {
    worker = new Worker(new URL("../../workers/layout.worker.ts", import.meta.url), {
      type: "module",
      name: "layout",
    });
    proxy = Comlink.wrap<LayoutWorkerApi>(worker);
    return proxy;
  } catch {
    unavailable = true;
    return null;
  }
}

export function disposeLayoutWorker(): void {
  worker?.terminate();
  worker = null;
  proxy = null;
  unavailable = false;
}
