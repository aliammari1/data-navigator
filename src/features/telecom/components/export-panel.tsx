"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtAmount, fmtN, fmtPct } from "@/features/telecom/lib/format";
import { KPI_FIELDS } from "@/features/telecom/constants";
import type * as Types from "@/features/telecom/types";

/** Pure download helper — no state/props closure, defined outside component */
function dlFile(content: string, name: string, type = "text/csv") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function ExportPanel({
  kpi,
  canals,
  reportDate,
  fileName = "",
  errors = [],
  hourly = [],
  operators = [],
  regions = [],
  statusData = [],
  selectedKpis,
}: {
  kpi: Types.KPISummary | null;
  canals: Types.CanalSummary[];
  reportDate: string;
  fileName?: string;
  errors?: Types.ErrorRow[];
  hourly?: Types.HourlyRow[];
  operators?: Types.OperatorRow[];
  regions?: Types.RegionRow[];
  statusData?: Types.StatusRow[];
  selectedKpis: Set<keyof Types.KPISummary>;
}) {
  const [open, setOpen] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Section toggles — which datasets to include in the export
  const [inclCanals, setInclCanals] = useState(true);
  const [inclErrors, setInclErrors] = useState(true);
  const [inclHourly, setInclHourly] = useState(true);
  const [inclOperators, setInclOperators] = useState(true);
  const [inclRegions, setInclRegions] = useState(true);
  const [inclStatus, setInclStatus] = useState(true);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  /** Filtered KPI rows based on user selection */
  const kpiRows = (): [string, string | number][] => {
    if (!kpi) return [];
    return KPI_FIELDS.filter((f) => selectedKpis.has(f.key)).map((f) => {
      const raw = kpi[f.key];
      return [f.label, f.fmt ? f.fmt(raw as number) : String(raw)];
    });
  };

  const exportKPICSV = useCallback(() => {
    if (!kpi) return;
    const rows = kpiRows();
    const body = rows.map(([k, v]) => `"${k}","${v}"`).join("\n");
    dlFile(`"Métrique","Valeur"\n${body}`, `kpi_${reportDate}.csv`);
    setOpen(false);
  }, [kpi, reportDate, selectedKpis]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportCanalCSV = useCallback(() => {
    if (!canals.length) return;
    const header =
      "Canal,Total,Réussie,Échec,Instance,Annulation,Confirmé,TauxRéussite%,MontantTotal_TND,MontantMoyen_TND,Part%";
    const body = canals
      .map(
        (c) =>
          `"${c.label}",${c.total},${c.success},${c.declined},${c.instance},${c.refund},${c.submitted},${c.successRate.toFixed(2)},${c.amount.toFixed(3)},${c.avgAmount.toFixed(3)},${c.share.toFixed(2)}`,
      )
      .join("\n");
    dlFile(`${header}\n${body}`, `canal_summary_${reportDate}.csv`);
    setOpen(false);
  }, [canals, reportDate]);

  const exportJSON = useCallback(() => {
    const payload: Record<string, unknown> = {
      reportDate,
      fileName,
      generatedAt: new Date().toISOString(),
    };
    if (selectedKpis.size > 0 && kpi) {
      const filtered: Partial<Types.KPISummary> = {};
      for (const f of KPI_FIELDS)
        if (selectedKpis.has(f.key))
          (filtered as Record<string, unknown>)[f.key] = kpi[f.key];
      payload.kpi = filtered;
    }
    if (inclCanals)
      payload.canals = canals.map((c) => ({
        canal: c.label,
        total: c.total,
        success: c.success,
        declined: c.declined,
        instance: c.instance,
        refund: c.refund,
        submitted: c.submitted,
        successRate: c.successRate,
        amount: c.amount,
        avgAmount: c.avgAmount,
        share: c.share,
      }));
    if (inclHourly && hourly.length) payload.hourly = hourly;
    if (inclErrors && errors.length) payload.errors = errors;
    if (inclOperators && operators.length) payload.operators = operators;
    if (inclRegions && regions.length) payload.regions = regions;
    if (inclStatus && statusData.length) payload.statuses = statusData;
    dlFile(
      JSON.stringify(payload, null, 2),
      `telecom_report_${reportDate}.json`,
      "application/json",
    );
    setOpen(false);
  }, [
    kpi,
    canals,
    errors,
    hourly,
    operators,
    regions,
    statusData,
    reportDate,
    fileName,
    selectedKpis,
    inclCanals,
    inclErrors,
    inclHourly,
    inclOperators,
    inclRegions,
    inclStatus,
  ]);

  const exportExcel = useCallback(async () => {
    if (!kpi || exportingXlsx) return;
    setExportingXlsx(true);
    setOpen(false);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Tableau de Bord Télécom";
      wb.created = new Date();

      // Sheet 1: KPI Summary (respects selection)
      const kpiSheet = wb.addWorksheet("KPIs");
      kpiSheet.columns = [
        { header: "Métrique", key: "metric", width: 36 },
        { header: "Valeur", key: "value", width: 22 },
      ];
      kpiSheet.getRow(1).font = { bold: true };
      kpiSheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4F46E5" },
      };
      kpiSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      for (const [metric, value] of kpiRows())
        kpiSheet.addRow({ metric, value });

      // Sheet 2: Canaux
      if (inclCanals && canals.length) {
        const canalSheet = wb.addWorksheet("Canaux");
        canalSheet.columns = [
          { header: "Canal", key: "label", width: 28 },
          { header: "Total", key: "total", width: 12 },
          { header: "Réussie", key: "success", width: 12 },
          { header: "Échec", key: "declined", width: 12 },
          { header: "Instance", key: "instance", width: 12 },
          { header: "Annulation", key: "refund", width: 12 },
          { header: "Confirmé", key: "submitted", width: 12 },
          { header: "Taux (%)", key: "rate", width: 12 },
          { header: "Montant (TND)", key: "amount", width: 16 },
          { header: "Moy. (TND)", key: "avg", width: 14 },
          { header: "Part (%)", key: "share", width: 10 },
        ];
        const hdr = canalSheet.getRow(1);
        hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
        hdr.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF059669" },
        };
        for (const c of canals) {
          const row = canalSheet.addRow({
            label: c.label,
            total: c.total,
            success: c.success,
            declined: c.declined,
            instance: c.instance,
            refund: c.refund,
            submitted: c.submitted,
            rate: Number(c.successRate.toFixed(2)),
            amount: Number(c.amount.toFixed(3)),
            avg: Number(c.avgAmount.toFixed(3)),
            share: Number(c.share.toFixed(2)),
          });
          if (c.successRate < 80) {
            row.getCell("rate").fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFF4444" },
            };
            row.getCell("rate").font = {
              color: { argb: "FFFFFFFF" },
              bold: true,
            };
          } else if (c.successRate >= 95) {
            row.getCell("rate").fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FF22C55E" },
            };
            row.getCell("rate").font = {
              color: { argb: "FFFFFFFF" },
              bold: true,
            };
          }
        }
      }

      // Sheet 3: Statuts
      if (inclStatus && statusData.length) {
        const stSheet = wb.addWorksheet("Statuts");
        stSheet.columns = [
          { header: "Statut", key: "status", width: 20 },
          { header: "Occurrences", key: "count", width: 14 },
          { header: "Montant (TND)", key: "amount", width: 16 },
          { header: "Part (%)", key: "share", width: 12 },
        ];
        const hdr = stSheet.getRow(1);
        hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
        hdr.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF7C3AED" },
        };
        const totalTx = statusData.reduce((s, r) => s + r.count, 0);
        for (const s of statusData)
          stSheet.addRow({
            status: s.status,
            count: s.count,
            amount: Number(s.amount.toFixed(3)),
            share: Number(((s.count / totalTx) * 100).toFixed(2)),
          });
      }

      // Sheet 4: Erreurs
      if (inclErrors && errors.length) {
        const errSheet = wb.addWorksheet("Erreurs");
        errSheet.columns = [
          { header: "Code Erreur", key: "code", width: 20 },
          { header: "Message", key: "message", width: 44 },
          { header: "Occurrences", key: "count", width: 14 },
          { header: "Canal", key: "canal", width: 22 },
        ];
        const hdr = errSheet.getRow(1);
        hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
        hdr.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFDC2626" },
        };
        for (const e of errors)
          errSheet.addRow({
            code: e.error_code,
            message: e.error_message,
            count: e.count,
            canal: e.canal,
          });
      }

      // Sheet 5: Comptes / Opérateurs
      if (inclOperators && operators.length) {
        const opSheet = wb.addWorksheet("Comptes");
        opSheet.columns = [
          { header: "Compte", key: "operator", width: 24 },
          { header: "Type", key: "accountType", width: 14 },
          { header: "Total", key: "total", width: 12 },
          { header: "Réussie", key: "success", width: 12 },
          { header: "Taux (%)", key: "rate", width: 12 },
          { header: "Montant (TND)", key: "amount", width: 16 },
        ];
        const hdr = opSheet.getRow(1);
        hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
        hdr.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF0284C7" },
        };
        for (const o of operators)
          opSheet.addRow({
            operator: o.operator,
            accountType: o.accountType,
            total: o.total,
            success: o.success,
            rate: Number(o.successRate.toFixed(2)),
            amount: Number(o.amount.toFixed(3)),
          });
      }

      // Sheet 6: Régions
      if (inclRegions && regions.length) {
        const regSheet = wb.addWorksheet("Régions");
        regSheet.columns = [
          { header: "Région", key: "region", width: 24 },
          { header: "Total", key: "total", width: 12 },
          { header: "Réussie", key: "success", width: 12 },
          { header: "Taux (%)", key: "rate", width: 12 },
          { header: "Montant (TND)", key: "amount", width: 16 },
        ];
        const hdr = regSheet.getRow(1);
        hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
        hdr.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF0891B2" },
        };
        for (const r of regions)
          regSheet.addRow({
            region: r.region,
            total: r.total,
            success: r.success,
            rate:
              r.total > 0
                ? Number(((r.success / r.total) * 100).toFixed(2))
                : 0,
            amount: Number(r.amount.toFixed(3)),
          });
      }

      // Sheet 7: Horaire
      if (inclHourly && hourly.length) {
        const hSheet = wb.addWorksheet("Horaire");
        hSheet.columns = [
          { header: "Heure", key: "hour", width: 10 },
          { header: "Total", key: "total", width: 12 },
          { header: "Réussie", key: "success", width: 12 },
          { header: "Échec", key: "declined", width: 12 },
          { header: "Montant (TND)", key: "amount", width: 16 },
          { header: "Taux (%)", key: "rate", width: 12 },
        ];
        const hdr = hSheet.getRow(1);
        hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
        hdr.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF0F766E" },
        };
        for (const h of hourly)
          hSheet.addRow({
            hour: `${String(h.hour).padStart(2, "0")}:00`,
            total: h.total,
            success: h.success,
            declined: h.declined,
            amount: Number(h.amount.toFixed(3)),
            rate:
              h.total > 0
                ? Number(((h.success / h.total) * 100).toFixed(2))
                : 0,
          });
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `telecom_report_${reportDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Excel export failed:", err);
    } finally {
      setExportingXlsx(false);
    }
  }, [
    kpi,
    canals,
    errors,
    hourly,
    operators,
    regions,
    statusData,
    reportDate,
    selectedKpis,
    exportingXlsx,
    inclCanals,
    inclErrors,
    inclHourly,
    inclOperators,
    inclRegions,
    inclStatus,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportPDF = useCallback(async () => {
    if (!kpi || exportingPdf) return;
    setExportingPdf(true);
    setOpen(false);
    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 14;

      // ── Header ──────────────────────────────────────────────────────────────
      doc.setFillColor(79, 70, 229); // indigo-600
      doc.rect(0, 0, pageW, 22, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Rapport Télécom Journalier", margin, 14);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const dateLabel = reportDate ? `Date : ${reportDate}` : "";
      const fileLabel = fileName ? `  |  Fichier : ${fileName}` : "";
      doc.text(
        `${dateLabel}${fileLabel}  |  Généré le ${new Date().toLocaleString("fr-TN")}`,
        margin,
        19.5,
      );
      doc.setTextColor(0, 0, 0);

      let y = 30;

      // ── KPIs table ──────────────────────────────────────────────────────────
      const kpiData = kpiRows();
      if (kpiData.length > 0) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Indicateurs Clés (KPIs)", margin, y);
        y += 2;
        autoTable(doc, {
          startY: y,
          head: [["Métrique", "Valeur"]],
          body: kpiData.map(([k, v]) => [k, String(v)]),
          headStyles: {
            fillColor: [79, 70, 229],
            textColor: 255,
            fontStyle: "bold",
            fontSize: 8,
          },
          bodyStyles: { fontSize: 8 },
          alternateRowStyles: { fillColor: [245, 243, 255] },
          margin: { left: margin, right: margin },
          tableWidth: "auto",
          columnStyles: {
            0: { cellWidth: 90 },
            1: { cellWidth: 60, halign: "right" },
          },
        });
        y =
          (doc as unknown as { lastAutoTable: { finalY: number } })
            .lastAutoTable.finalY + 8;
      }

      // ── Canaux table ────────────────────────────────────────────────────────
      if (inclCanals && canals.length) {
        if (y > 240) {
          doc.addPage();
          y = 20;
        }
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Performance par Canal", margin, y);
        y += 2;
        autoTable(doc, {
          startY: y,
          head: [
            [
              "Canal",
              "Total",
              "Réussies",
              "Échecs",
              "Taux %",
              "Montant TND",
              "Part %",
            ],
          ],
          body: canals.map((c) => [
            c.label,
            fmtN(c.total),
            fmtN(c.success),
            fmtN(c.declined),
            c.successRate.toFixed(1),
            c.amount.toFixed(3),
            c.share.toFixed(1),
          ]),
          headStyles: {
            fillColor: [5, 150, 105],
            textColor: 255,
            fontStyle: "bold",
            fontSize: 7,
          },
          bodyStyles: { fontSize: 7 },
          alternateRowStyles: { fillColor: [236, 253, 245] },
          margin: { left: margin, right: margin },
          didParseCell: (data) => {
            if (data.section === "body" && data.column.index === 4) {
              const rate = parseFloat(String(data.cell.raw));
              if (rate < 80) {
                data.cell.styles.fillColor = [254, 202, 202];
                data.cell.styles.textColor = [185, 28, 28];
              } else if (rate >= 95) {
                data.cell.styles.fillColor = [187, 247, 208];
                data.cell.styles.textColor = [21, 128, 61];
              }
            }
          },
        });
        y =
          (doc as unknown as { lastAutoTable: { finalY: number } })
            .lastAutoTable.finalY + 8;
      }

      // ── Statuts table ───────────────────────────────────────────────────────
      if (inclStatus && statusData.length) {
        if (y > 240) {
          doc.addPage();
          y = 20;
        }
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Répartition par Statut", margin, y);
        y += 2;
        const totalTx = statusData.reduce((s, r) => s + r.count, 0);
        autoTable(doc, {
          startY: y,
          head: [["Statut", "Occurrences", "Montant TND", "Part %"]],
          body: statusData.map((s) => [
            s.status,
            fmtN(s.count),
            s.amount.toFixed(3),
            ((s.count / totalTx) * 100).toFixed(1),
          ]),
          headStyles: {
            fillColor: [124, 58, 237],
            textColor: 255,
            fontStyle: "bold",
            fontSize: 8,
          },
          bodyStyles: { fontSize: 8 },
          alternateRowStyles: { fillColor: [245, 243, 255] },
          margin: { left: margin, right: margin },
        });
        y =
          (doc as unknown as { lastAutoTable: { finalY: number } })
            .lastAutoTable.finalY + 8;
      }

      // ── Erreurs table ───────────────────────────────────────────────────────
      if (inclErrors && errors.length) {
        if (y > 240) {
          doc.addPage();
          y = 20;
        }
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Codes d'Erreur", margin, y);
        y += 2;
        autoTable(doc, {
          startY: y,
          head: [["Code", "Message", "Occurrences", "Canal"]],
          body: errors.map((e) => [
            e.error_code,
            e.error_message,
            fmtN(e.count),
            e.canal,
          ]),
          headStyles: {
            fillColor: [220, 38, 38],
            textColor: 255,
            fontStyle: "bold",
            fontSize: 7,
          },
          bodyStyles: { fontSize: 7 },
          alternateRowStyles: { fillColor: [254, 242, 242] },
          margin: { left: margin, right: margin },
          columnStyles: { 1: { cellWidth: 70 } },
        });
        y =
          (doc as unknown as { lastAutoTable: { finalY: number } })
            .lastAutoTable.finalY + 8;
      }

      // ── Opérateurs table ────────────────────────────────────────────────────
      if (inclOperators && operators.length) {
        if (y > 240) {
          doc.addPage();
          y = 20;
        }
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Comptes / Opérateurs", margin, y);
        y += 2;
        autoTable(doc, {
          startY: y,
          head: [
            ["Compte", "Type", "Total", "Réussie", "Taux %", "Montant TND"],
          ],
          body: operators.map((o) => [
            o.operator,
            o.accountType,
            fmtN(o.total),
            fmtN(o.success),
            o.successRate.toFixed(1),
            o.amount.toFixed(3),
          ]),
          headStyles: {
            fillColor: [2, 132, 199],
            textColor: 255,
            fontStyle: "bold",
            fontSize: 7,
          },
          bodyStyles: { fontSize: 7 },
          alternateRowStyles: { fillColor: [240, 249, 255] },
          margin: { left: margin, right: margin },
        });
        y =
          (doc as unknown as { lastAutoTable: { finalY: number } })
            .lastAutoTable.finalY + 8;
      }

      // ── Régions table ────────────────────────────────────────────────────────
      if (inclRegions && regions.length) {
        if (y > 240) {
          doc.addPage();
          y = 20;
        }
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Répartition Régionale", margin, y);
        y += 2;
        autoTable(doc, {
          startY: y,
          head: [["Région", "Total", "Réussies", "Taux %", "Montant TND"]],
          body: regions.map((r) => [
            r.region,
            fmtN(r.total),
            fmtN(r.success),
            r.total > 0 ? ((r.success / r.total) * 100).toFixed(1) : "0.0",
            r.amount.toFixed(3),
          ]),
          headStyles: {
            fillColor: [8, 145, 178],
            textColor: 255,
            fontStyle: "bold",
            fontSize: 7,
          },
          bodyStyles: { fontSize: 7 },
          alternateRowStyles: { fillColor: [236, 254, 255] },
          margin: { left: margin, right: margin },
        });
        y =
          (doc as unknown as { lastAutoTable: { finalY: number } })
            .lastAutoTable.finalY + 8;
      }

      // ── Horaire table ────────────────────────────────────────────────────────
      if (inclHourly && hourly.length) {
        if (y > 240) {
          doc.addPage();
          y = 20;
        }
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Activité Horaire", margin, y);
        y += 2;
        autoTable(doc, {
          startY: y,
          head: [
            ["Heure", "Total", "Réussies", "Échecs", "Taux %", "Montant TND"],
          ],
          body: hourly.map((h) => [
            `${String(h.hour).padStart(2, "0")}:00`,
            fmtN(h.total),
            fmtN(h.success),
            fmtN(h.declined),
            h.total > 0 ? ((h.success / h.total) * 100).toFixed(1) : "0.0",
            h.amount.toFixed(3),
          ]),
          headStyles: {
            fillColor: [15, 118, 110],
            textColor: 255,
            fontStyle: "bold",
            fontSize: 7,
          },
          bodyStyles: { fontSize: 7 },
          alternateRowStyles: { fillColor: [240, 253, 250] },
          margin: { left: margin, right: margin },
        });
      }

      // ── Footer ───────────────────────────────────────────────────────────────
      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(
          `Page ${i} / ${pages}  —  Tableau de Bord Télécom`,
          margin,
          doc.internal.pageSize.getHeight() - 6,
        );
      }

      doc.save(`telecom_report_${reportDate}.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setExportingPdf(false);
    }
  }, [
    kpi,
    canals,
    errors,
    hourly,
    operators,
    regions,
    statusData,
    reportDate,
    fileName,
    selectedKpis,
    exportingPdf,
    inclCanals,
    inclErrors,
    inclHourly,
    inclOperators,
    inclRegions,
    inclStatus,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedKpiCount = KPI_FIELDS.filter((f) =>
    selectedKpis.has(f.key),
  ).length;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 text-indigo-700 dark:bg-indigo-600/15 dark:hover:bg-indigo-600/25 dark:border-indigo-500/25 dark:text-indigo-300 rounded-xl text-xs font-medium transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        Exporter
        <ChevronDown
          className={cn("w-3 h-3 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-80 rounded-2xl border border-border bg-card shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold text-foreground">
              Exporter le rapport
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* KPI selection summary */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-foreground">
                  KPIs sélectionnés
                </span>
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                  {selectedKpiCount} / {KPI_FIELDS.length}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Cochez / décochez les cartes KPI dans la vue{" "}
                <strong>Vue d&apos;ensemble</strong> pour sélectionner les métriques
                à exporter.
              </p>
            </div>

            {/* Data sections */}
            <div>
              <span className="text-xs font-semibold text-foreground block mb-2">
                Données à inclure
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  {
                    label: "Canaux",
                    count: canals.length,
                    val: inclCanals,
                    set: setInclCanals,
                  },
                  {
                    label: "Statuts",
                    count: statusData.length,
                    val: inclStatus,
                    set: setInclStatus,
                  },
                  {
                    label: "Erreurs",
                    count: errors.length,
                    val: inclErrors,
                    set: setInclErrors,
                  },
                  {
                    label: "Opérateurs",
                    count: operators.length,
                    val: inclOperators,
                    set: setInclOperators,
                  },
                  {
                    label: "Régions",
                    count: regions.length,
                    val: inclRegions,
                    set: setInclRegions,
                  },
                  {
                    label: "Horaire",
                    count: hourly.length,
                    val: inclHourly,
                    set: setInclHourly,
                  },
                ].map(({ label, count, val, set }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => set((v) => !v)}
                    disabled={count === 0}
                    className={cn(
                      "flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-colors text-left",
                      val && count > 0
                        ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300"
                        : "border-border bg-muted/40 text-muted-foreground",
                      count === 0 && "opacity-40 cursor-not-allowed",
                    )}
                  >
                    <span
                      className={cn(
                        "w-3.5 h-3.5 rounded flex items-center justify-center border flex-none",
                        val && count > 0
                          ? "bg-indigo-500 border-indigo-500"
                          : "border-border bg-background",
                      )}
                    >
                      {val && count > 0 && (
                        <svg
                          viewBox="0 0 10 10"
                          className="w-2.5 h-2.5 text-white"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <polyline points="1.5,5 4,7.5 8.5,2.5" />
                        </svg>
                      )}
                    </span>
                    <span className="flex-1 font-medium">{label}</span>
                    {count > 0 && (
                      <span className="text-[9px] opacity-60">{count}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Format buttons */}
            <div>
              <span className="text-xs font-semibold text-foreground block mb-2">
                Format
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={exportCanalCSV}
                  disabled={!canals.length}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-700 dark:bg-emerald-600/15 dark:hover:bg-emerald-600/25 dark:border-emerald-500/25 dark:text-emerald-300 rounded-xl text-xs font-medium transition-colors disabled:opacity-40"
                >
                  <Download className="w-3.5 h-3.5" /> CSV Canaux
                </button>
                <button
                  type="button"
                  onClick={exportKPICSV}
                  disabled={!kpi || selectedKpiCount === 0}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-700 dark:bg-blue-600/15 dark:hover:bg-blue-600/25 dark:border-blue-500/25 dark:text-blue-300 rounded-xl text-xs font-medium transition-colors disabled:opacity-40"
                >
                  <Download className="w-3.5 h-3.5" /> CSV KPIs
                </button>
                <button
                  type="button"
                  onClick={exportJSON}
                  disabled={!kpi}
                  className="flex items-center gap-1.5 px-3 py-2 bg-violet-50 hover:bg-violet-100 border border-violet-300 text-violet-700 dark:bg-violet-600/15 dark:hover:bg-violet-600/25 dark:border-violet-500/25 dark:text-violet-300 rounded-xl text-xs font-medium transition-colors disabled:opacity-40"
                >
                  <Download className="w-3.5 h-3.5" /> JSON
                </button>
                <button
                  type="button"
                  onClick={exportExcel}
                  disabled={!kpi || exportingXlsx}
                  className="flex items-center gap-1.5 px-3 py-2 bg-green-700/15 hover:bg-green-700/25 border border-green-600/25 text-green-700 dark:text-green-300 rounded-xl text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  {exportingXlsx ? "…" : "Excel"}
                </button>
                <button
                  type="button"
                  onClick={exportPDF}
                  disabled={!kpi || exportingPdf}
                  className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700 dark:bg-rose-600/15 dark:hover:bg-rose-600/25 dark:border-rose-500/25 dark:text-rose-300 rounded-xl text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <FileText className="w-3.5 h-3.5" />
                  {exportingPdf ? "Génération PDF…" : "Exporter en PDF"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
