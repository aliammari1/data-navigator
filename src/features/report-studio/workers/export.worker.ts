/// <reference lib="webworker" />

/**
 * report-studio export worker — runs the RICH, branded generators
 * (10-slide pptx deck, multi-section docx, pdfmake report, multi-sheet xlsx)
 * entirely OFF the renderer main thread. The main thread only marshals a small
 * config object out and an `ArrayBuffer` back, so the UI stays at 60fps and the
 * "Generating…" spinner animates smoothly even on large aggregates.
 *
 * The shared platform `export.worker` only handles generic table documents;
 * report-studio's bespoke deck/branding lives here. Saving still goes through
 * the shared `saveBytes()` (Electron fs bridge / browser fallback).
 *
 * Charts: ECharts SSR → SVG (offline, no DOM) via `lib/charts.ts`; PDF embeds
 * the crisp vector SVG directly, while DOCX/PPTX get a resvg-rasterized PNG
 * (offline wasm). Never DOM-screenshot a chart.
 */

import * as Comlink from "comlink";
import { svgToPng } from "@/workers/resvg-raster";
import { renderHourlyChartSvg } from "../lib/charts";
import type { DocxOptions, PDFOptions, PptxTemplate, ReportData } from "../lib/types";

/** Render + rasterize the hourly chart once; reused across DOCX/PPTX. */
async function chartPngFor(data: ReportData): Promise<Uint8Array | null> {
  const svg = renderHourlyChartSvg(data, data.primaryColor);
  if (!svg) return null;
  try {
    return await svgToPng(svg, 1200);
  } catch {
    return null;
  }
}

const api = {
  async pptx(
    data: ReportData,
    template: PptxTemplate,
    selectedChannels: string[],
  ): Promise<ArrayBuffer> {
    const [{ buildPptx }, png] = await Promise.all([
      import("../lib/pptx-generator"),
      chartPngFor(data),
    ]);
    return buildPptx(data, template, selectedChannels, png);
  },

  async docx(data: ReportData, options: DocxOptions): Promise<ArrayBuffer> {
    const [{ buildDocx }, png] = await Promise.all([
      import("../lib/docx-generator"),
      chartPngFor(data),
    ]);
    return buildDocx(data, options, png);
  },

  async pdf(data: ReportData, options: PDFOptions): Promise<ArrayBuffer> {
    const { buildPdf } = await import("../lib/pdf-report");
    // PDF prefers the crisp vector SVG (no rasterization needed).
    const svg = options.includeCharts ? renderHourlyChartSvg(data, data.primaryColor) : null;
    return buildPdf(data, options, svg);
  },

  async xlsx(data: ReportData): Promise<ArrayBuffer> {
    const { buildXlsx } = await import("../lib/xlsx-generator");
    return buildXlsx(data);
  },
};

export type ReportExportApi = typeof api;

Comlink.expose(api);
