"use client";

/**
 * Off-main-thread alert-history export. The previous timeline built a CSV string
 * by hand and triggered a `<a download>` directly. Here we map events onto the
 * platform `ReportDocument` shape and run the heavy serialization in the export
 * worker (`getExportProxy().xlsx/pdf`), embedding a REAL chart image rendered by
 * the chart worker (`renderToSVGString`) — never a DOM screenshot. Bytes are
 * saved via `saveBytes` (Electron save dialog with a browser blob fallback).
 */

import { getChartProxy, getExportProxy, saveBytes, type EChartsOption } from "@/platform/viz";
import type { ChartImage, ReportDocument } from "@/workers/export-types";
import { channelLabel } from "./channels";
import { formatDateTime } from "./format-helpers";
import { metricLabel } from "./ui-helpers";
import type { AlertEvent } from "../store/monitor-store";

function buildEventTable(events: AlertEvent[]) {
  return {
    title: "Alert Events",
    headers: ["Triggered", "Channel", "Severity", "Metric", "Actual", "Threshold", "Acknowledged"],
    rows: events.map((e) => [
      formatDateTime(e.triggeredAt),
      channelLabel(e.channel),
      e.severity,
      metricLabel(e.metric),
      Number(e.actualValue.toFixed(2)),
      e.threshold,
      e.acknowledged ? "yes" : "no",
    ]),
  };
}

/** Render the timeline scatter to a vector chart image for embedding. */
async function buildChartImage(option: EChartsOption): Promise<ChartImage | undefined> {
  const proxy = getChartProxy();
  if (!proxy) return undefined;
  try {
    const svg = await proxy.renderToSVGString(option, 800, 320);
    return { svg, width: 800, height: 320 };
  } catch {
    return undefined;
  }
}

export interface ExportOptions {
  kind: "xlsx" | "pdf";
  scatterOption?: EChartsOption;
}

/**
 * Export the supplied events as XLSX or PDF, off the main thread, with the
 * timeline chart embedded. Returns the save result (or null when no export
 * worker is available in this environment).
 */
export async function exportAlertHistory(
  events: AlertEvent[],
  { kind, scatterOption }: ExportOptions,
): Promise<{ saved: boolean; path?: string } | null> {
  const exp = getExportProxy();
  if (!exp) return null;

  const chart = scatterOption ? await buildChartImage(scatterOption) : undefined;
  const doc: ReportDocument = {
    title: "Channel Alert History",
    subtitle: `${events.length} events — exported ${formatDateTime(Date.now())}`,
    sections: [buildEventTable(events)],
    charts: chart ? [chart] : undefined,
    includeCharts: Boolean(chart),
    paperSize: "a4",
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `alert-history-${stamp}.${kind}`;
  // The export worker returns a transferable ArrayBuffer directly.
  const buf = kind === "pdf" ? await exp.pdf(doc) : await exp.xlsx(doc);
  return saveBytes(buf, fileName, kind);
}
