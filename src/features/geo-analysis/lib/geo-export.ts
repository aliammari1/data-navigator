"use client";

/**
 * Off-main-thread geo report export.
 *
 * Builds a neutral `ReportDocument` from the real DuckDB aggregates and ships it
 * to the shared export worker (`getExportProxy()` → pdf/xlsx) so the heavy
 * pdfmake/exceljs work never blocks the renderer. The PDF embeds a *real*
 * rasterised heatmap (rendered to a vector SVG by the chart worker, not a DOM
 * screenshot). Bytes are written through `saveBytes()` (Electron save dialog,
 * browser anchor fallback).
 */

import { getChartProxy, getExportProxy, saveBytes } from "@/platform/viz";
import type { EChartsOption } from "@/platform/viz";
import { fmtN, fmtPct } from "@/features/telecom/lib/format";
import type { ReportDocument, TableSection } from "@/workers/export-types";
import type { GeoInsight } from "./ai-insights";
import type { ChannelMatrix, GeoRegion, UseGeoDataResult } from "../hooks/use-geo-data";

export interface GeoExportInput {
  datasetName: string | null;
  regions: GeoRegion[];
  totalTransactions: number;
  totalRevenue: number;
  avgSuccessRate: number;
  matrix: ChannelMatrix;
  dominantChannels: UseGeoDataResult["dominantChannels"];
  insight: GeoInsight | null;
}

function regionSection(regions: GeoRegion[]): TableSection {
  return {
    title: "Regions by volume",
    headers: ["Rank", "Region", "Transactions", "Revenue", "Success rate"],
    rows: regions.map((r) => [
      r.rank,
      r.name,
      fmtN(r.transactions),
      fmtN(r.revenue),
      fmtPct(r.successRate),
    ]),
    widths: ["auto", "*", "auto", "auto", "auto"],
  };
}

function matrixSection(matrix: ChannelMatrix): TableSection | null {
  if (matrix.regions.length === 0) return null;
  return {
    title: "Channel distribution by region (%)",
    headers: ["Region", ...matrix.channels],
    rows: matrix.regions.map((region, ri) => [
      region,
      ...matrix.channels.map((_, ci) => `${(matrix.shares[ri]?.[ci] ?? 0).toFixed(1)}%`),
    ]),
  };
}

function insightSection(insight: GeoInsight): TableSection {
  const rows: (string | number)[][] = [["Headline", insight.headline]];
  for (const t of insight.topRegions) rows.push([`Standout · ${t.region}`, t.note]);
  for (const r of insight.riskRegions) rows.push([`At risk · ${r.region}`, r.reason]);
  rows.push(["Channel observation", insight.channelObservation]);
  rows.push(["Recommendation", insight.recommendation]);
  return { title: "AI regional insights", headers: ["Topic", "Detail"], rows };
}

/** Build the heatmap ECharts option used for the embedded export chart. */
function heatmapOption(matrix: ChannelMatrix): EChartsOption {
  const data: [number, number, number][] = [];
  let max = 0;
  matrix.shares.forEach((row, ri) => {
    row.forEach((val, ci) => {
      const v = Math.round(val * 10) / 10;
      data.push([ci, ri, v]);
      if (v > max) max = v;
    });
  });
  return {
    grid: { top: 30, bottom: 80, left: 140, right: 30 },
    xAxis: { type: "category", data: matrix.channels, axisLabel: { rotate: 38, fontSize: 11 } },
    yAxis: { type: "category", data: matrix.regions, axisLabel: { fontSize: 11 } },
    visualMap: {
      min: 0,
      max: Math.max(10, Math.ceil(max)),
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      inRange: { color: ["#1e3a5f", "#1d4ed8", "#60a5fa", "#93c5fd", "#dbeafe"] },
    },
    series: [{ type: "heatmap", data, name: "Channel Share" }],
  } as EChartsOption;
}

/** Render the heatmap to a vector SVG off the main thread, when available. */
async function renderHeatmapSvg(matrix: ChannelMatrix): Promise<string | undefined> {
  if (matrix.regions.length === 0) return undefined;
  const chart = getChartProxy();
  if (!chart) return undefined;
  try {
    const width = 900;
    const height = Math.max(360, matrix.regions.length * 26 + 140);
    return await chart.renderToSVGString(heatmapOption(matrix), width, height);
  } catch {
    return undefined;
  }
}

function buildDocument(input: GeoExportInput, chartSvg?: string): ReportDocument {
  const sections: TableSection[] = [regionSection(input.regions)];
  const mtx = matrixSection(input.matrix);
  if (mtx) sections.push(mtx);
  if (input.insight) sections.push(insightSection(input.insight));

  const subtitle =
    `${fmtN(input.totalTransactions)} transactions · ` +
    `revenue ${fmtN(input.totalRevenue)} · ` +
    `weighted success ${fmtPct(input.avgSuccessRate)}` +
    (input.datasetName ? ` · ${input.datasetName}` : "");

  return {
    title: "Geographic & Network Analysis",
    subtitle,
    sections,
    charts: chartSvg ? [{ svg: chartSvg, width: 900 }] : undefined,
    includeCharts: Boolean(chartSvg),
    paperSize: "a4",
  };
}

function timestampedName(ext: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `geo-analysis-${stamp}.${ext}`;
}

export type GeoExportFormat = "pdf" | "xlsx";

/**
 * Generate and save the geo report in the requested format. Returns the saved
 * path (Electron) or `null` when the user cancelled the save dialog.
 */
export async function exportGeoReport(
  input: GeoExportInput,
  format: GeoExportFormat,
): Promise<string | null> {
  const exp = getExportProxy();
  if (!exp) throw new Error("Export worker is unavailable in this environment.");

  // XLSX has no chart embedding; only pay the chart render cost for PDF.
  const chartSvg = format === "pdf" ? await renderHeatmapSvg(input.matrix) : undefined;
  const doc = buildDocument(input, chartSvg);

  const bytes = format === "pdf" ? await exp.pdf(doc) : await exp.xlsx(doc);
  const result = await saveBytes(bytes, timestampedName(format), format);
  return result.saved ? (result.path ?? null) : null;
}
