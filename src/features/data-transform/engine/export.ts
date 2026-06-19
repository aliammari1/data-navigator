/**
 * Offline export of the transform result (§3.7).
 *
 * Two paths, both network-free:
 *  - XLSX: built off the main thread via the shared export.worker
 *    (`getExportProxy().xlsx(ReportDocument)`), then written through the shared
 *    `saveBytes` (Electron save dialog + fs, browser blob fallback). Heavy
 *    workbook generation never blocks the renderer.
 *  - CSV: serialized in-renderer (cheap, bounded by the preview cap) and written
 *    through the Electron fs save dialog when available, with a browser
 *    blob-download fallback — never a raw `<a download>` in Electron.
 *
 * Both consume the already-fetched preview columns/rows; nothing re-queries.
 */

import { hasElectronFS, saveFileDialog, writeLocalFile } from "@/platform/electron/electron-fs";
import { getExportProxy, saveBytes } from "@/platform/viz";
import type { ReportDocument } from "@/workers/export-types";

export interface ExportTable {
  cols: string[];
  rows: Record<string, unknown>[];
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function csvEscape(value: unknown): string {
  const s = cellToString(value);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function toCSV(table: ExportTable): string {
  const header = table.cols.map(csvEscape).join(",");
  const body = table.rows
    .map((row) => table.cols.map((c) => csvEscape(row[c])).join(","))
    .join("\r\n");
  return body ? `${header}\r\n${body}` : header;
}

/**
 * Export the result as a CSV file. Uses the Electron save dialog + fs bridge
 * when available; otherwise falls back to a browser blob download.
 */
export async function exportResultCsv(
  table: ExportTable,
  baseName: string,
): Promise<{ saved: boolean; path?: string }> {
  const csv = toCSV(table);
  const fileName = `${baseName}.csv`;
  const bytes = new TextEncoder().encode(csv);

  if (hasElectronFS()) {
    const filePath = await saveFileDialog({
      defaultPath: fileName,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!filePath) return { saved: false };
    await writeLocalFile(
      filePath,
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    );
    return { saved: true, path: filePath };
  }

  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  return { saved: true };
}

/**
 * Export the result as an XLSX workbook, generated off the main thread by the
 * shared export worker and written via `saveBytes`. Returns `{ saved:false }`
 * when the worker is unavailable (SSR / no Worker support).
 */
export async function exportResultXlsx(
  table: ExportTable,
  baseName: string,
  meta: { title: string; subtitle?: string },
): Promise<{ saved: boolean; path?: string }> {
  const exp = getExportProxy();
  if (!exp) return { saved: false };

  const doc: ReportDocument = {
    title: meta.title,
    subtitle: meta.subtitle,
    sections: [
      {
        title: "Transform result",
        headers: table.cols,
        rows: table.rows.map((row) => table.cols.map((c) => cellToString(row[c]))),
      },
    ],
    includeCharts: false,
  };

  const bytes = await exp.xlsx(doc);
  return saveBytes(bytes as ArrayBuffer, `${baseName}.xlsx`, "xlsx");
}
