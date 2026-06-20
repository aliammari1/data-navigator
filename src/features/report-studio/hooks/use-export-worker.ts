"use client";

/**
 * Worker lifecycle + save glue for report-studio exports.
 *
 * - Lazy singleton Comlink worker (module-worker pattern used repo-wide), warmed
 *   on idle so the first export doesn't pay the parse/eval stall.
 * - Inline fallback when `Worker` is unavailable (SSR / unsupported): the SAME
 *   generators run on the calling thread (correctness identical; only the
 *   off-main-thread benefit is lost).
 * - Saving routes through the shared platform `saveBytes()` — Electron fs
 *   saveDialog + writeFile, with a browser blob-download fallback. Never a raw
 *   `<a download>` in Electron.
 */

import { useCallback, useEffect } from "react";
import * as Comlink from "comlink";
import { saveBytes, type SaveResult } from "@/platform/viz";
import type { ReportExportApi } from "../workers/export.worker";
import type { DocxOptions, PDFOptions, PptxTemplate, ReportData } from "../lib/types";

type Api = Pick<ReportExportApi, "pptx" | "docx" | "pdf" | "xlsx">;

let worker: Worker | null = null;
let proxy: Comlink.Remote<ReportExportApi> | null = null;
let inlinePromise: Promise<Api> | null = null;
let triedWorker = false;

function getProxy(): Comlink.Remote<ReportExportApi> | null {
  if (proxy) return proxy;
  if (triedWorker || typeof Worker === "undefined") return null;
  triedWorker = true;
  try {
    worker = new Worker(new URL("../workers/export.worker.ts", import.meta.url), {
      type: "module",
      name: "report-export",
    });
    proxy = Comlink.wrap<ReportExportApi>(worker);
    return proxy;
  } catch {
    return null;
  }
}

/** Inline fallback API — imports the generators directly on the main thread. */
function getInline(): Promise<Api> {
  inlinePromise ??= (async (): Promise<Api> => {
    const [{ buildPptx }, { buildDocx }, { buildPdf }, { buildXlsx }, charts] = await Promise.all([
      import("../lib/pptx-generator"),
      import("../lib/docx-generator"),
      import("../lib/pdf-report"),
      import("../lib/xlsx-generator"),
      import("../lib/charts"),
    ]);
    return {
      pptx: (data, template, channels) => buildPptx(data, template, channels),
      docx: (data, options) => buildDocx(data, options),
      pdf: (data, options) =>
        buildPdf(
          data,
          options,
          options.includeCharts ? charts.renderHourlyChartSvg(data, data.primaryColor) : null,
        ),
      xlsx: (data) => buildXlsx(data),
    };
  })();
  return inlinePromise;
}

async function getApi(): Promise<Api> {
  return (getProxy() as unknown as Api) ?? (await getInline());
}

export function useExportWorker() {
  // Warm the worker on idle so the first export is instant.
  useEffect(() => {
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(() => void getProxy());
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(() => void getProxy(), 0);
    return () => clearTimeout(t);
  }, []);

  const exportPptx = useCallback(
    async (data: ReportData, template: PptxTemplate, channels: string[]): Promise<SaveResult> => {
      const api = await getApi();
      const bytes = await api.pptx(data, template, channels);
      return saveBytes(bytes, `transaction-report-${data.date}.pptx`, "pptx");
    },
    [],
  );

  const exportDocx = useCallback(
    async (data: ReportData, options: DocxOptions): Promise<SaveResult> => {
      const api = await getApi();
      const bytes = await api.docx(data, options);
      return saveBytes(bytes, `transaction-report-${data.date}.docx`, "docx");
    },
    [],
  );

  const exportPdf = useCallback(
    async (data: ReportData, options: PDFOptions): Promise<SaveResult> => {
      const api = await getApi();
      const bytes = await api.pdf(data, options);
      return saveBytes(bytes, `transaction-report-${data.date}.pdf`, "pdf");
    },
    [],
  );

  const exportXlsx = useCallback(async (data: ReportData): Promise<SaveResult> => {
    const api = await getApi();
    const bytes = await api.xlsx(data);
    return saveBytes(bytes, `transaction-report-${data.date}.xlsx`, "xlsx");
  }, []);

  return { exportPptx, exportDocx, exportPdf, exportXlsx };
}
