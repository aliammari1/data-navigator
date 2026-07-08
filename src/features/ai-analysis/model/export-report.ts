"use client";

// ─── Analysis report export (off-main-thread, real document formats) ──────────
//
// Replaces the old `URL.createObjectURL(JSON blob)` download with a real,
// multi-section report built OFF the main thread via the shared export worker
// (`getExportProxy`) and saved through the Electron fs dialog / browser download
// (`saveBytes`). Charts are embedded as crisp vector SVG rendered by the shared
// chart worker (`getChartProxy().renderToSVGString`) and rasterized by resvg
// inside the export worker — never a DOM screenshot.

import { getChartProxy, getExportProxy, saveBytes } from "@/platform/viz";
import type { EChartsOption } from "@/platform/viz";
import type { ExportKind, ReportDocument, TableSection } from "@/workers/export-types";
import type { Anomaly, ColStat, Correlation, ForecastMeta, Insight } from "./types";

export interface ReportInput {
  datasetName: string;
  rowCount: number;
  insights: Insight[];
  anomalies: Anomaly[];
  correlations: Correlation[];
  colStats: ColStat[];
  forecastMeta: ForecastMeta;
  /** ECharts options for the charts to embed (already built by the screen). */
  charts: { title: string; option: EChartsOption; width: number; height: number }[];
}

function fmt(v: number | undefined, digits = 2): string {
  if (v === undefined || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

function buildSections(input: ReportInput): TableSection[] {
  const sections: TableSection[] = [];

  if (input.insights.length > 0) {
    sections.push({
      title: "Key Insights",
      headers: ["Category", "Title", "Severity", "Impact", "Confidence", "Description"],
      rows: input.insights.map((i) => [
        i.category,
        i.title,
        i.severity,
        i.impact,
        `${(i.confidence * 100).toFixed(0)}%`,
        i.description,
      ]),
    });
  }

  if (input.anomalies.length > 0) {
    sections.push({
      title: "Anomalies",
      headers: ["Column", "Type", "Method", "Severity", "Affected rows", "Score"],
      rows: input.anomalies.map((a) => [
        a.column,
        a.type,
        a.method ?? "—",
        a.severity,
        a.affectedRows.toLocaleString(),
        `${(a.score * 100).toFixed(1)}%`,
      ]),
    });
  }

  if (input.correlations.length > 0) {
    sections.push({
      title: "Correlations",
      headers: ["Column A", "Column B", "Pearson r", "Strength", "Direction"],
      rows: input.correlations.map((c) => [
        c.col1,
        c.col2,
        fmt(c.pearson, 3),
        c.strength.replace("_", " "),
        c.direction,
      ]),
    });
  }

  const numericStats = input.colStats.filter((s) => s.type === "numeric");
  if (numericStats.length > 0) {
    sections.push({
      title: "Column Statistics",
      headers: ["Column", "Min", "Max", "Avg", "Std dev", "Median", "Skewness", "Nulls"],
      rows: numericStats.map((s) => [
        s.name,
        fmt(s.min),
        fmt(s.max),
        fmt(s.avg),
        fmt(s.stddev),
        fmt(s.median),
        fmt(s.skewness, 3),
        s.nullCount.toLocaleString(),
      ]),
    });
  }

  return sections;
}

/**
 * Render the screen's ECharts options to crisp SVG strings via the shared chart
 * worker so the export worker can rasterize them with resvg (offline). Skips
 * silently when off-thread chart rendering is unavailable (text-only report).
 */
async function renderChartSvgs(
  charts: ReportInput["charts"],
): Promise<{ svg: string; width: number; height: number }[]> {
  const proxy = getChartProxy();
  if (!proxy) return [];
  const out: { svg: string; width: number; height: number }[] = [];
  for (const c of charts) {
    try {
      const svg = await proxy.renderToSVGString(c.option, c.width, c.height);
      if (svg) out.push({ svg, width: c.width, height: c.height });
    } catch {
      // One bad chart shouldn't sink the whole report.
    }
  }
  return out;
}

/**
 * Build and save an analysis report. Defaults to XLSX (tabular, lossless); pass
 * "pdf"/"docx"/"pptx" for a narrative document with embedded charts. Runs entirely
 * off the main thread and offline.
 */
export async function exportAnalysisReport(
  input: ReportInput,
  kind: ExportKind = "xlsx",
): Promise<{ saved: boolean }> {
  const exp = getExportProxy();
  if (!exp) {
    // No export worker (SSR / exotic runtime) — nothing to do.
    return { saved: false };
  }

  const sections = buildSections(input);
  const includeCharts = kind !== "xlsx";
  const chartSvgs = includeCharts ? await renderChartSvgs(input.charts) : [];

  const doc: ReportDocument = {
    title: `AI Analysis — ${input.datasetName}`,
    subtitle: `${input.rowCount.toLocaleString()} rows · ${input.colStats.length} columns · generated offline`,
    sections,
    includeCharts,
    charts: chartSvgs.map((c) => ({ svg: c.svg, width: c.width, height: c.height })),
    paperSize: "a4",
  };

  const bytes =
    kind === "pdf"
      ? await exp.pdf(doc)
      : kind === "docx"
        ? await exp.docx(doc)
        : kind === "pptx"
          ? await exp.pptx(doc)
          : await exp.xlsx(doc);
  const fileName = `ai-analysis-${input.datasetName.replace(/[^\w.-]+/g, "_")}.${kind}`;
  const res = await saveBytes(bytes, fileName, kind);
  return { saved: res.saved };
}
