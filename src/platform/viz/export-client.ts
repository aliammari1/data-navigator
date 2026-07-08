"use client";

/**
 * Comlink client for the shared export.worker (PDF/XLSX/DOCX/PPTX generation off
 * the main thread, web build path). Lazy worker singleton + warm-on-idle so the
 * first export does not pay the parse stall.
 *
 * Usage:
 *   const exp = getExportProxy();
 *   const bytes = await exp!.pdf(reportDocument);
 *   await saveBytes(bytes, "report.pdf", "pdf");
 */

import * as Comlink from "comlink";
import type { ExportWorkerApi } from "@/workers/export.worker";

let worker: Worker | null = null;
let proxy: Comlink.Remote<ExportWorkerApi> | null = null;
let unavailable = false;

export function getExportProxy(): Comlink.Remote<ExportWorkerApi> | null {
  if (unavailable) return null;
  if (proxy) return proxy;
  if (typeof Worker === "undefined") {
    unavailable = true;
    return null;
  }
  try {
    worker = new Worker(new URL("../../workers/export.worker.ts", import.meta.url), {
      type: "module",
      name: "export",
    });
    proxy = Comlink.wrap<ExportWorkerApi>(worker);
    return proxy;
  } catch {
    unavailable = true;
    return null;
  }
}

/** Construct the worker ahead of the first export to avoid a cold-start stall. */
export function warmExportWorker(): void {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => void getExportProxy());
  } else {
    setTimeout(() => void getExportProxy(), 0);
  }
}

export function disposeExportWorker(): void {
  worker?.terminate();
  worker = null;
  proxy = null;
  unavailable = false;
}
