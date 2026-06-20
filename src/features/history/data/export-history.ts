// Offline export of the FULL durable history log (the IndexedDB audit trail).
// CSV/JSON are built in-memory; XLSX is generated off the main thread via the
// shared export worker (getExportProxy) + the Electron fs save dialog
// (saveBytes), with an inline lazy-exceljs fallback when no Worker exists. All
// paths are fully offline — no network.

import { getExportProxy, saveBytes } from "@/platform/viz";
import type { ReportDocument } from "@/workers/export-types";

import type { HistoryExportFormat, HistoryRow } from "../model/types";
import { toTimestamp } from "../model/format";
import { downloadBlob, downloadText } from "./download";
import { type HistoryEvent, readAllHistory } from "./history-db";

const COLUMNS = ["timestamp", "source", "type", "message", "dataset", "table"] as const;

function isoStamp(value: string): string {
  const ts = toTimestamp(value);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : value;
}

function csvCell(value: string): string {
  // RFC-4180 quoting: wrap when the cell contains a comma, quote, or newline.
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toRecord(row: HistoryRow): Record<(typeof COLUMNS)[number], string> {
  return {
    timestamp: isoStamp(row.when),
    source: row.source,
    type: row.type,
    message: row.message,
    dataset: row.dataset ?? "",
    table: row.table ?? "",
  };
}

/** Map a durable Dexie event into the same flat row shape used for in-memory
 *  export, so CSV/JSON/XLSX builders stay source-agnostic. */
function eventToRow(e: HistoryEvent): HistoryRow {
  return {
    id: e.id,
    when: new Date(e.ts).toISOString(),
    type: e.type,
    message: e.message,
    dataset: e.datasetId,
    table: e.tableName,
    source: e.source,
  };
}

function buildCsv(rows: HistoryRow[]): string {
  const lines: string[] = [COLUMNS.join(",")];
  for (const row of rows) {
    const rec = toRecord(row);
    lines.push(COLUMNS.map((c) => csvCell(rec[c])).join(","));
  }
  return lines.join("\r\n");
}

function buildJson(rows: HistoryRow[]): string {
  return JSON.stringify(rows.map(toRecord), null, 2);
}

/** Shape the rows into the neutral {@link ReportDocument} the export worker
 *  consumes (one sheet/section, header row + string cells). */
function toReportDocument(rows: HistoryRow[]): ReportDocument {
  return {
    title: "Workspace History",
    sections: [
      {
        title: "History",
        headers: ["Timestamp", "Source", "Type", "Message", "Dataset", "Table"],
        rows: rows.map((r) => {
          const rec = toRecord(r);
          return [rec.timestamp, rec.source, rec.type, rec.message, rec.dataset, rec.table];
        }),
      },
    ],
  };
}

/** Inline exceljs fallback (used only when the export worker is unavailable,
 *  e.g. no `Worker` in the runtime). Lazy import keeps it off the route bundle. */
async function buildXlsxBlob(rows: HistoryRow[]): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "data-navigator";
  wb.created = new Date();
  const ws = wb.addWorksheet("History");
  ws.columns = [
    { header: "Timestamp", key: "timestamp", width: 24 },
    { header: "Source", key: "source", width: 12 },
    { header: "Type", key: "type", width: 18 },
    { header: "Message", key: "message", width: 60 },
    { header: "Dataset", key: "dataset", width: 24 },
    { header: "Table", key: "table", width: 24 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const row of rows) {
    ws.addRow(toRecord(row));
  }
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * Export the FULL durable history log (the whole IndexedDB audit trail, not just
 * the bounded set currently visible on screen). Falls back to the supplied
 * in-memory `rows` if the durable log is empty/unavailable (e.g. private mode),
 * so export always produces something useful and fully offline.
 */
export async function exportFullHistory(
  fallbackRows: HistoryRow[],
  format: HistoryExportFormat,
): Promise<number> {
  const events = await readAllHistory();
  const rows = events.length > 0 ? events.map(eventToRow) : fallbackRows;
  await exportHistory(rows, format);
  return rows.length;
}

export async function exportHistory(
  rows: HistoryRow[],
  format: HistoryExportFormat,
): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const base = `workspace-history_${stamp}`;

  switch (format) {
    case "csv":
      downloadText(buildCsv(rows), `${base}.csv`, "text/csv;charset=utf-8");
      return;
    case "json":
      downloadText(buildJson(rows), `${base}.json`, "application/json;charset=utf-8");
      return;
    case "xlsx": {
      // Prefer the shared export worker (exceljs off the main thread) + the
      // Electron fs save dialog. Fall back to an inline build + blob download
      // when no Worker is available (e.g. SSR / restricted runtime).
      const fileName = `${base}.xlsx`;
      const proxy = getExportProxy();
      if (proxy) {
        const bytes = await proxy.xlsx(toReportDocument(rows));
        await saveBytes(bytes, fileName, "xlsx");
        return;
      }
      const blob = await buildXlsxBlob(rows);
      downloadBlob(blob, fileName);
      return;
    }
  }
}
