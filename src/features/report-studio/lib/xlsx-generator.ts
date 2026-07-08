import type { ReportData } from "./types";

/**
 * Build a multi-sheet XLSX workbook and return raw bytes (no download side
 * effect). Runs inside the export worker via exceljs's in-memory `writeBuffer`
 * (fine for the few-thousand-row reports report-studio produces; truly large
 * exports stream from Electron main). exceljs uses ~6x less heap than SheetJS
 * and is fully offline (pure JS, no assets).
 */
export async function buildXlsx(data: ReportData): Promise<ArrayBuffer> {
  const ExcelJSMod = await import("exceljs");
  const ExcelJS =
    (ExcelJSMod as unknown as { default?: typeof import("exceljs") }).default ?? ExcelJSMod;
  const wb = new ExcelJS.Workbook();
  wb.creator = data.companyName || "Telecom Analytics";
  wb.created = new Date();

  const headerFill = (ws: import("exceljs").Worksheet) => {
    const row = ws.getRow(1);
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF003087" } };
  };

  // ── Summary sheet ──────────────────────────────────────────────────────────
  const summary = wb.addWorksheet("Summary");
  summary.columns = [
    { header: "Metric", key: "metric", width: 28 },
    { header: "Value", key: "value", width: 22 },
  ];
  headerFill(summary);
  summary.addRow({ metric: "Report Date", value: data.date });
  summary.addRow({ metric: "Total Transactions", value: Math.round(data.totalTransactions) });
  summary.addRow({ metric: "Success Rate (%)", value: Number(data.successRate.toFixed(2)) });
  summary.addRow({ metric: "Failed Transactions", value: Math.round(data.failedTransactions) });
  summary.addRow({ metric: "Total Revenue", value: Number(data.totalRevenue.toFixed(3)) });

  // ── Channels sheet ─────────────────────────────────────────────────────────
  const channels = wb.addWorksheet("Channels");
  channels.columns = [
    { header: "Channel", key: "name", width: 30 },
    { header: "Volume", key: "volume", width: 16 },
    { header: "Success %", key: "successRate", width: 14 },
    { header: "Revenue", key: "revenue", width: 18 },
  ];
  headerFill(channels);
  for (const ch of data.topChannels) {
    channels
      .addRow({
        name: ch.name,
        volume: Math.round(ch.volume),
        successRate: Number(ch.successRate.toFixed(2)),
        revenue: Number(ch.revenue.toFixed(3)),
      })
      .commit(); // free the row incrementally
  }

  // ── Hourly sheet ───────────────────────────────────────────────────────────
  if (data.hourlyData.length) {
    const hourly = wb.addWorksheet("Hourly");
    hourly.columns = [
      { header: "Hour", key: "hour", width: 10 },
      { header: "Volume", key: "count", width: 16 },
      { header: "Success %", key: "successRate", width: 14 },
    ];
    headerFill(hourly);
    for (const h of data.hourlyData) {
      hourly
        .addRow({
          hour: `${h.hour}:00`,
          count: Math.round(h.count),
          successRate: Number(h.successRate.toFixed(2)),
        })
        .commit();
    }
  }

  // ── Anomalies sheet (seeded GESD) ──────────────────────────────────────────
  if (data.anomalies?.length) {
    const anom = wb.addWorksheet("Anomalies");
    anom.columns = [
      { header: "Hour", key: "hour", width: 10 },
      { header: "Volume", key: "count", width: 16 },
      { header: "Success %", key: "successRate", width: 14 },
      { header: "GESD Score", key: "score", width: 14 },
    ];
    headerFill(anom);
    for (const a of data.anomalies) {
      anom
        .addRow({
          hour: `${a.hour}:00`,
          count: Math.round(a.count),
          successRate: Number(a.successRate.toFixed(2)),
          score: Number(a.score.toFixed(3)),
        })
        .commit();
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}
