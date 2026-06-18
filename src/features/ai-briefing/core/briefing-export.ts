"use client";

/**
 * Offline, branded report export for the AI briefing feature.
 *
 * Replaces the old plain-text `Blob` + `<a download>` flow. Heavy document
 * generation (PDF / DOCX) runs off the main thread in the shared export worker
 * (`getExportProxy`), charts are rasterized to real PNGs via the chart worker
 * (`renderToSVGString`) + export worker (`svgToPng`) — never DOM-screenshotted —
 * and bytes are written through `saveBytes` (Electron save dialog, browser
 * download fallback). Fully offline; no CDN, no network.
 */

import { buildBarOption, getChartProxy, getExportProxy, saveBytes } from "@/platform/viz";
import type { ExportKind, ReportDocument, TableSection } from "@/workers/export-types";
import type { BriefingContext, HistogramBin } from "./briefing-context";

/** Split prose into paragraph cells for a single-column narrative table. */
function proseSection(title: string, text: string): TableSection {
  const paras = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    title,
    headers: [title],
    rows: (paras.length ? paras : [text.trim() || "—"]).map((p) => [p]),
    widths: ["*"],
  };
}

/** A metrics table built from the real (DuckDB-aggregated) briefing context. */
function metricsSection(ctx: BriefingContext): TableSection {
  const rows: (string | number)[][] = [
    ["Rows", ctx.rowCount.toLocaleString()],
    ["Numeric columns", String(ctx.numericCols.length)],
  ];
  for (const c of ctx.numericCols.slice(0, 8)) {
    rows.push([
      `${c.name} (mean ± σ)`,
      `${Number(c.mean.toFixed(2))} ± ${Number(c.std.toFixed(2))}`,
    ]);
  }
  if (ctx.topCategory) {
    const top = ctx.topCategory.values[0];
    if (top)
      rows.push([`Top ${ctx.topCategory.dimension}`, `${top.label} (${top.pct.toFixed(1)}%)`]);
  }
  return { title: "Dataset metrics", headers: ["Metric", "Value"], rows };
}

/**
 * Rasterize a distribution histogram to PNG bytes via the worker chart/export
 * pipeline. Returns undefined when off-main-thread rendering is unavailable so
 * the export still succeeds (text + tables, no chart).
 */
async function renderHistogramPng(
  bins: HistogramBin[],
  title: string,
): Promise<Uint8Array | undefined> {
  if (bins.length === 0) return undefined;
  const chart = getChartProxy();
  const exp = getExportProxy();
  if (!chart || !exp) return undefined;
  const option = buildBarOption(
    bins.map((b) => b.label),
    [{ name: "Count", data: bins.map((b) => b.count), color: "#6366f1" }],
    { title },
  );
  try {
    const svg = await chart.renderToSVGString(option, 720, 320);
    if (!svg) return undefined;
    return await exp.svgToPng(svg, 720);
  } catch {
    return undefined;
  }
}

export interface BriefingReportInput {
  context: BriefingContext;
  kind: ExportKind;
  title: string;
  /** Narrative sections (label → prose) included after the metrics table. */
  narrative: { label: string; text: string }[];
  /** Optional histogram bins to embed as a real chart PNG. */
  histogram?: { bins: HistogramBin[]; title: string };
  fileBase: string;
}

/**
 * Build and save a branded briefing report. Returns the save result so callers
 * can surface "saved to <path>" without re-implementing the fs/download dance.
 */
export async function exportBriefingReport(input: BriefingReportInput) {
  const exp = getExportProxy();
  const sections: TableSection[] = [metricsSection(input.context)];
  for (const n of input.narrative) {
    if (n.text.trim()) sections.push(proseSection(n.label, n.text));
  }

  const chartPng = input.histogram
    ? await renderHistogramPng(input.histogram.bins, input.histogram.title)
    : undefined;

  const doc: ReportDocument = {
    title: input.title,
    subtitle: `${input.context.datasetName} · ${input.context.rowCount.toLocaleString()} rows · ${new Date().toLocaleString(
      "en-GB",
    )}`,
    sections,
    includeCharts: Boolean(chartPng),
    charts: chartPng ? [{ png: chartPng, width: 720, height: 320 }] : undefined,
    paperSize: "a4",
  };

  const fileName = `${input.fileBase}-${input.context.datasetName}`.replace(/[^\w.-]+/g, "_");

  // Worker path (off main thread) — fall back to nothing if unavailable; the
  // caller's text export remains as a last resort.
  if (!exp) throw new Error("Export worker is unavailable in this environment.");
  const bytes =
    input.kind === "pdf"
      ? await exp.pdf(doc)
      : input.kind === "docx"
        ? await exp.docx(doc)
        : input.kind === "xlsx"
          ? await exp.xlsx(doc)
          : await exp.pptx(doc);

  return saveBytes(bytes, `${fileName}.${input.kind}`, input.kind);
}
