"use client";

/**
 * Catalog export — turns the live folder/dataset catalog into an XLSX workbook
 * or a PDF manifest, generated entirely OFF the main thread via the shared
 * export.worker (`getExportProxy`) and saved through the Electron fs bridge /
 * browser blob path (`saveBytes`). Heavy document encoding (exceljs / pdfmake)
 * never runs on the render thread.
 *
 * The PDF embeds the real "Storage by Folder" chart as a vector SVG produced by
 * the chart.worker (`renderToSVGString`) — no DOM screenshotting.
 */

import { type EChartsOption, getChartProxy, getExportProxy, saveBytes } from "@/platform/viz";
import type { ReportDocument, TableSection } from "@/workers/export-types";
import type { FSNode } from "../types";
import { formatBytes } from "./format";

export interface CatalogExportInput {
  /** All file nodes (datasets) in the catalog. */
  fileNodes: FSNode[];
  /** Folder name keyed by folder id, for the manifest. */
  folderNameById: Map<string, string>;
  /** parentId for each file node (folder placement). */
  parentOf: (id: string) => string | null;
  totalSize: number;
  totalRows: number;
}

function buildSections(input: CatalogExportInput): TableSection[] {
  const { fileNodes, folderNameById, parentOf, totalSize, totalRows } = input;

  const fileRows: (string | number)[][] = fileNodes.map((n) => {
    const parentId = parentOf(n.id);
    const folder =
      parentId && parentId !== "root" ? (folderNameById.get(parentId) ?? "—") : "(root)";
    return [
      n.name,
      n.type,
      folder,
      n.rowCount ?? 0,
      n.colCount ?? 0,
      formatBytes(n.size),
      n.quality !== undefined ? `${Math.round(n.quality * 100)}%` : "—",
      n.tags.join(", "),
    ];
  });

  const summary: TableSection = {
    title: "Catalog Summary",
    headers: ["Metric", "Value"],
    rows: [
      ["Total datasets", fileNodes.length],
      ["Total folders", folderNameById.size],
      ["Total size", formatBytes(totalSize)],
      ["Total rows", totalRows.toLocaleString()],
      ["Exported", new Date().toLocaleString()],
    ],
  };

  const files: TableSection = {
    title: "Datasets",
    headers: ["Name", "Type", "Folder", "Rows", "Cols", "Size", "Quality", "Tags"],
    rows: fileRows,
  };

  return [summary, files];
}

/** Render an ECharts option to an SVG string via the chart worker (offscreen). */
async function renderChartSvg(
  option: EChartsOption,
  width: number,
  height: number,
): Promise<string | undefined> {
  const proxy = getChartProxy();
  if (!proxy) return undefined;
  try {
    return await proxy.renderToSVGString(option, width, height);
  } catch {
    return undefined;
  }
}

/** Export the catalog as an XLSX workbook (off-main-thread, saved via fs/blob). */
export async function exportCatalogXlsx(input: CatalogExportInput): Promise<boolean> {
  const exp = getExportProxy();
  if (!exp) return false;
  const doc: ReportDocument = {
    title: "Data Catalog",
    subtitle: `${input.fileNodes.length} datasets`,
    sections: buildSections(input),
    includeCharts: false,
  };
  const bytes = await exp.xlsx(doc);
  const result = await saveBytes(bytes, "data-catalog.xlsx", "xlsx");
  return result.saved;
}

/** Export the catalog as a PDF manifest with the storage chart embedded. */
export async function exportCatalogPdf(
  input: CatalogExportInput,
  storageChartOption: EChartsOption,
): Promise<boolean> {
  const exp = getExportProxy();
  if (!exp) return false;

  const svg = await renderChartSvg(storageChartOption, 520, 280);

  const doc: ReportDocument = {
    title: "Data Catalog",
    subtitle: `${input.fileNodes.length} datasets · ${formatBytes(input.totalSize)}`,
    sections: buildSections(input),
    charts: svg ? [{ svg, width: 520, height: 280 }] : undefined,
    includeCharts: Boolean(svg),
    paperSize: "a4",
  };

  const bytes = await exp.pdf(doc);
  const result = await saveBytes(bytes, "data-catalog.pdf", "pdf");
  return result.saved;
}
