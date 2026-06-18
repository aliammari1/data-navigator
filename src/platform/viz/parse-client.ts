"use client";

/**
 * Comlink client for the shared parse.worker (CSV/Arrow parsing off the main
 * thread). Lazy worker singleton.
 *
 * Usage:
 *   const parse = getParseProxy();
 *   const result = await parse?.parseString(text, { delimiter: "," });
 *   const { columns, data } = await parse!.decodeArrowColumns(arrowBuffer);
 */

import * as Comlink from "comlink";
import type { ParseWorkerApi } from "@/workers/parse.worker";

let worker: Worker | null = null;
let proxy: Comlink.Remote<ParseWorkerApi> | null = null;
let unavailable = false;

export function getParseProxy(): Comlink.Remote<ParseWorkerApi> | null {
  if (unavailable) return null;
  if (proxy) return proxy;
  if (typeof Worker === "undefined") {
    unavailable = true;
    return null;
  }
  try {
    worker = new Worker(new URL("../../workers/parse.worker.ts", import.meta.url), {
      type: "module",
      name: "parse",
    });
    proxy = Comlink.wrap<ParseWorkerApi>(worker);
    return proxy;
  } catch {
    unavailable = true;
    return null;
  }
}

export function disposeParseWorker(): void {
  worker?.terminate();
  worker = null;
  proxy = null;
  unavailable = false;
}
