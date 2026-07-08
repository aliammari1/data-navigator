"use client";

import { ChevronDown, Download, FileSpreadsheet, FileText, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KPI_FIELDS } from "@/features/telecom/constants";
import { buildCanalCsv, buildKpiCsv } from "@/features/telecom/export/csv";
import { downloadTextFile } from "@/features/telecom/export/download";
import { generateTelecomDeckBrief } from "@/features/telecom/lib/deck-ai";
import { fmtN } from "@/features/telecom/lib/format";
import { computeAIInsights } from "@/features/telecom/lib/insights";
import type * as Types from "@/features/telecom/types";
import { useAI } from "@/platform/ai/provider";
import { saveBytes, warmExportWorker } from "@/platform/viz";
import { cn } from "@/shared/utils";

export function ExportPanel({
  kpi,
  canals,
  reportDate,
  fileName = "",
  hourly = [],
  operators = [],
  regions = [],
  statusData = [],
  selectedKpis,
  selectedOverviewSections,
  fetchDailyTrend,
}: {
  kpi: Types.KPISummary | null;
  canals: Types.CanalSummary[];
  reportDate: string;
  fileName?: string;
  hourly?: Types.HourlyRow[];
  operators?: Types.OperatorRow[];
  regions?: Types.RegionRow[];
  statusData?: Types.StatusRow[];
  selectedKpis: Set<keyof Types.KPISummary>;
  selectedOverviewSections: Set<Types.OverviewExportSectionKey>;
  fetchDailyTrend?: () => Promise<Types.DailyTrendRow[]>;
}) {
  const [open, setOpen] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [_exportingPpt, _setExportingPpt] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Offline AI provider (llamacpp grammar-constrained JSON by default). Bound
  // into the deck brief generator so the LLM lane routes through the unified
  // provider registry — no direct web-llm / agent-canvas dependency.
  const ai = useAI();

  // Section toggles — which datasets to include in the export
  const [inclCanals, setInclCanals] = useState(true);
  const [inclHourly, setInclHourly] = useState(true);
  const [inclOperators, setInclOperators] = useState(true);
  const [inclRegions, setInclRegions] = useState(true);
  const [inclStatus, setInclStatus] = useState(true);

  const hasOverviewSection = useCallback(
    (key: Types.OverviewExportSectionKey) => selectedOverviewSections.has(key),
    [selectedOverviewSections],
  );

  const includeCanalDataset =
    inclCanals &&
    (hasOverviewSection("revenueGroups") ||
      hasOverviewSection("canalShare") ||
      hasOverviewSection("canalAmount") ||
      hasOverviewSection("successRate") ||
      hasOverviewSection("canalTable"));
  const includeHourlyDataset = inclHourly && hasOverviewSection("hourly");
  const includeStatusDataset = inclStatus && hasOverviewSection("status");
  const includeAssistantDataset = hasOverviewSection("assistant");
  const includeDailyTrendDataset = hasOverviewSection("dailyTrend");

  const insights = useMemo(
    () => (kpi ? computeAIInsights(kpi, canals, hourly, statusData).slice(0, 6) : []),
    [kpi, canals, hourly, statusData],
  );

  const revenueGroupRows = useMemo(() => {
    const groups: Record<string, Types.CanalKey[]> = {
      "Bill Payment": ["bill_payment"],
      Recharge: [
        "voice_fixed_ttcash",
        "voice_fixed_voucher",
        "voice_mobile_ttcash",
        "voice_mobile_voucher",
        "data_sabba",
        "data_evoucher",
      ],
      "Voucher For Payment": ["voucher_for_payment"],
      "Credit Transfer": ["credit_transfer"],
      "Voucher Convergent": ["voucher_convergent"],
    };

    return Object.entries(groups).map(([group, keys]) => {
      const matching = canals.filter((c) => keys.includes(c.key));
      const total = matching.reduce((sum, c) => sum + c.total, 0);
      const success = matching.reduce((sum, c) => sum + c.success, 0);
      const amount = matching.reduce((sum, c) => sum + c.amount, 0);
      return {
        group,
        total,
        success,
        amount,
        successRate: total > 0 ? (success / total) * 100 : 0,
      };
    });
  }, [canals]);

  const getDailyTrendRows = useCallback(async () => {
    if (!(includeDailyTrendDataset && fetchDailyTrend)) return [];
    try {
      return await fetchDailyTrend();
    } catch (err) {
      console.error("Daily trend export failed:", err);
      return [];
    }
  }, [fetchDailyTrend, includeDailyTrendDataset]);

  /** Filtered KPI rows based on user selection */
  const kpiRows = useCallback((): [string, string | number][] => {
    if (!kpi) return [];
    return KPI_FIELDS.filter((f) => selectedKpis.has(f.key)).map((f) => {
      const raw = kpi[f.key];
      return [f.label, f.fmt ? f.fmt(raw as number) : String(raw)];
    });
  }, [kpi, selectedKpis]);

  const getDeckBrief = useCallback(async () => {
    if (!kpi) return null;
    return generateTelecomDeckBrief(
      {
        reportDate,
        fileName,
        kpi,
        canals,
        hourly,
        statusData,
        revenueGroups: revenueGroupRows,
        selectedKpis: kpiRows().map(([label, value]) => ({ label, value })),
      },
      // Route the deck narrative through the offline provider registry. If no
      // provider is ready the generator falls back to the deterministic brief.
      ai.generateStructured,
    );
  }, [
    kpi,
    reportDate,
    fileName,
    canals,
    hourly,
    statusData,
    revenueGroupRows,
    kpiRows,
    ai.generateStructured,
  ]);

  // Close on outside click; warm the off-main-thread export worker on open so
  // the first heavy export does not pay the worker cold-start parse stall.
  useEffect(() => {
    if (!open) return;
    warmExportWorker();
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selectedKpiPayload = useMemo(() => {
    if (!(selectedKpis.size > 0 && kpi)) return null;
    const filtered: Partial<Types.KPISummary> = {};
    for (const f of KPI_FIELDS) {
      if (selectedKpis.has(f.key)) (filtered as Record<string, unknown>)[f.key] = kpi[f.key];
    }
    return filtered;
  }, [kpi, selectedKpis]);

  const exportKPICSV = useCallback(() => {
    if (!kpi) return;
    downloadTextFile(buildKpiCsv(kpiRows()), `kpi_${reportDate}.csv`);
    setOpen(false);
  }, [kpi, reportDate, kpiRows]);

  const exportCanalCSV = useCallback(() => {
    if (!(includeCanalDataset && canals.length)) return;
    downloadTextFile(buildCanalCsv(canals), `canal_summary_${reportDate}.csv`);
    setOpen(false);
  }, [canals, reportDate, includeCanalDataset]);

  const exportJSON = useCallback(async () => {
    const payload: Record<string, unknown> = {
      reportDate,
      fileName,
      generatedAt: new Date().toISOString(),
    };
    if (selectedKpiPayload) payload.kpi = selectedKpiPayload;
    const deckBrief = await getDeckBrief();
    if (deckBrief) payload.narrative = deckBrief;
    if (includeAssistantDataset && insights.length) payload.assistant = insights;
    if (hasOverviewSection("revenueGroups") && revenueGroupRows.length)
      payload.revenueGroups = revenueGroupRows;
    if (includeCanalDataset)
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
    if (includeHourlyDataset && hourly.length) payload.hourly = hourly;
    if (inclOperators && operators.length) payload.operators = operators;
    if (inclRegions && regions.length) payload.regions = regions;
    if (includeStatusDataset && statusData.length) payload.statuses = statusData;
    const dailyTrend = await getDailyTrendRows();
    if (dailyTrend.length) payload.dailyTrend = dailyTrend;
    downloadTextFile(
      JSON.stringify(payload, null, 2),
      `telecom_report_${reportDate}.json`,
      "application/json",
    );
    setOpen(false);
  }, [
    canals,
    hourly,
    operators,
    regions,
    statusData,
    reportDate,
    fileName,
    selectedKpiPayload,
    getDeckBrief,
    includeAssistantDataset,
    includeCanalDataset,
    includeHourlyDataset,
    includeStatusDataset,
    insights,
    revenueGroupRows,
    hasOverviewSection,
    getDailyTrendRows,
    inclOperators,
    inclRegions,
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
      for (const [metric, value] of kpiRows()) kpiSheet.addRow({ metric, value });

      const deckBrief = await getDeckBrief();
      if (deckBrief) {
        const narrativeSheet = wb.addWorksheet("Narrative");
        narrativeSheet.columns = [
          { header: "Section", key: "section", width: 22 },
          { header: "Contenu", key: "content", width: 110 },
        ];
        const hdr = narrativeSheet.getRow(1);
        hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
        hdr.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: {
            argb: deckBrief.source === "ai" ? "FFFF7A1A" : "FF0F766E",
          },
        };
        narrativeSheet.addRow({
          section: deckBrief.source === "ai" ? "Brief IA" : "Brief local",
          content: deckBrief.brief.executiveSummary,
        });
        for (const finding of deckBrief.brief.keyFindings) {
          narrativeSheet.addRow({
            section: `${finding.risk.toUpperCase()} · ${finding.title}`,
            content: `${finding.summary}\n${finding.bullets.join("\n")}`,
          });
        }
        narrativeSheet.addRow({
          section: "Actions",
          content: deckBrief.brief.recommendedActions.join("\n"),
        });
        narrativeSheet.addRow({
          section: "Speaker notes",
          content: deckBrief.brief.speakerNotes.join("\n"),
        });
      }

      if (includeAssistantDataset && insights.length) {
        const aiSheet = wb.addWorksheet("Assistant");
        aiSheet.columns = [
          { header: "Sévérité", key: "severity", width: 16 },
          { header: "Titre", key: "title", width: 36 },
          { header: "Contrôle", key: "body", width: 72 },
          { header: "Métrique", key: "metric", width: 20 },
        ];
        const hdr = aiSheet.getRow(1);
        hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
        hdr.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF4F46E5" },
        };
        for (const insight of insights) aiSheet.addRow(insight);
      }

      if (hasOverviewSection("revenueGroups") && revenueGroupRows.length) {
        const groupSheet = wb.addWorksheet("Groupes");
        groupSheet.columns = [
          { header: "Groupe", key: "group", width: 28 },
          { header: "Total", key: "total", width: 12 },
          { header: "Réussie", key: "success", width: 12 },
          { header: "Montant (TND)", key: "amount", width: 16 },
          { header: "Taux (%)", key: "successRate", width: 12 },
        ];
        const hdr = groupSheet.getRow(1);
        hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
        hdr.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF0F766E" },
        };
        for (const group of revenueGroupRows)
          groupSheet.addRow({
            ...group,
            amount: Number(group.amount.toFixed(3)),
            successRate: Number(group.successRate.toFixed(2)),
          });
      }

      // Sheet 2: Canaux
      if (includeCanalDataset && canals.length) {
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
      if (includeStatusDataset && statusData.length) {
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
            rate: r.total > 0 ? Number(((r.success / r.total) * 100).toFixed(2)) : 0,
            amount: Number(r.amount.toFixed(3)),
          });
      }

      // Sheet 7: Horaire
      if (includeHourlyDataset && hourly.length) {
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
            rate: h.total > 0 ? Number(((h.success / h.total) * 100).toFixed(2)) : 0,
          });
      }

      const dailyTrend = await getDailyTrendRows();
      if (dailyTrend.length) {
        const dtSheet = wb.addWorksheet("Daily Trend");
        dtSheet.columns = [
          { header: "Jour", key: "day", width: 16 },
          { header: "Total", key: "total", width: 12 },
          { header: "Réussie", key: "success", width: 12 },
          { header: "Échec", key: "declined", width: 12 },
          { header: "Montant (TND)", key: "amount", width: 16 },
        ];
        const hdr = dtSheet.getRow(1);
        hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
        hdr.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF7C3AED" },
        };
        for (const row of dailyTrend)
          dtSheet.addRow({
            ...row,
            amount: Number(row.amount.toFixed(3)),
          });
      }

      const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
      // Save through the platform bridge: Electron fs save-dialog when available
      // (off the renderer's blob path), browser <a download> fallback otherwise.
      await saveBytes(buffer, `telecom_report_${reportDate}.xlsx`, "xlsx");
    } catch (err) {
      console.error("Excel export failed:", err);
    } finally {
      setExportingXlsx(false);
    }
  }, [
    kpi,
    canals,
    hourly,
    operators,
    regions,
    statusData,
    reportDate,
    exportingXlsx,
    includeAssistantDataset,
    includeCanalDataset,
    includeHourlyDataset,
    includeStatusDataset,
    insights,
    revenueGroupRows,
    hasOverviewSection,
    getDailyTrendRows,
    getDeckBrief,
    inclOperators,
    inclRegions,
    kpiRows,
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
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      }

      const deckBrief = await getDeckBrief();
      if (deckBrief) {
        if (y > 225) {
          doc.addPage();
          y = 20;
        }
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(
          deckBrief.source === "ai" ? "Synthèse exécutive IA" : "Synthèse exécutive locale",
          margin,
          y,
        );
        y += 2;
        autoTable(doc, {
          startY: y,
          head: [["Section", "Analyse"]],
          body: [
            ["Résumé", deckBrief.brief.executiveSummary],
            ...deckBrief.brief.keyFindings
              .slice(0, 5)
              .map((finding) => [
                `${finding.risk.toUpperCase()} · ${finding.title}`,
                `${finding.summary}\n${finding.bullets.join("\n")}`,
              ]),
            ["Actions", deckBrief.brief.recommendedActions.join("\n")],
          ],
          headStyles: {
            fillColor: deckBrief.source === "ai" ? [255, 122, 26] : [15, 118, 110],
            textColor: 255,
            fontStyle: "bold",
            fontSize: 7,
          },
          bodyStyles: { fontSize: 7, cellPadding: 2 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: margin, right: margin },
          columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 138 } },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      }

      if (includeAssistantDataset && insights.length) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Assistant métier", margin, y);
        y += 2;
        autoTable(doc, {
          startY: y,
          head: [["Sévérité", "Titre", "Contrôle"]],
          body: insights.map((insight) => [insight.severity, insight.title, insight.body]),
          headStyles: {
            fillColor: [79, 70, 229],
            textColor: 255,
            fontStyle: "bold",
            fontSize: 7,
          },
          bodyStyles: { fontSize: 7 },
          alternateRowStyles: { fillColor: [245, 243, 255] },
          margin: { left: margin, right: margin },
          columnStyles: { 2: { cellWidth: 86 } },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      }

      if (hasOverviewSection("revenueGroups") && revenueGroupRows.length) {
        if (y > 240) {
          doc.addPage();
          y = 20;
        }
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Groupes Métier", margin, y);
        y += 2;
        autoTable(doc, {
          startY: y,
          head: [["Groupe", "Total", "Réussies", "Montant TND", "Taux %"]],
          body: revenueGroupRows.map((group) => [
            group.group,
            fmtN(group.total),
            fmtN(group.success),
            group.amount.toFixed(3),
            group.successRate.toFixed(1),
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
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      }

      // ── Canaux table ────────────────────────────────────────────────────────
      if (includeCanalDataset && canals.length) {
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
          head: [["Canal", "Total", "Réussies", "Échecs", "Taux %", "Montant TND", "Part %"]],
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
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      }

      // ── Statuts table ───────────────────────────────────────────────────────
      if (includeStatusDataset && statusData.length) {
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
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
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
          head: [["Compte", "Type", "Total", "Réussie", "Taux %", "Montant TND"]],
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
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
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
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      }

      // ── Horaire table ────────────────────────────────────────────────────────
      if (includeHourlyDataset && hourly.length) {
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
          head: [["Heure", "Total", "Réussies", "Échecs", "Taux %", "Montant TND"]],
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

      const dailyTrend = await getDailyTrendRows();
      if (dailyTrend.length) {
        if (y > 240) {
          doc.addPage();
          y = 20;
        }
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Daily Trend", margin, y);
        y += 2;
        autoTable(doc, {
          startY: y,
          head: [["Jour", "Total", "Réussies", "Échecs", "Montant TND"]],
          body: dailyTrend.map((row) => [
            row.day,
            fmtN(row.total),
            fmtN(row.success),
            fmtN(row.declined),
            row.amount.toFixed(3),
          ]),
          headStyles: {
            fillColor: [124, 58, 237],
            textColor: 255,
            fontStyle: "bold",
            fontSize: 7,
          },
          bodyStyles: { fontSize: 7 },
          alternateRowStyles: { fillColor: [245, 243, 255] },
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

      // Save through the platform bridge (Electron fs save-dialog / browser
      // fallback) instead of jsPDF's renderer-side <a download>.
      const pdfBytes = doc.output("arraybuffer") as ArrayBuffer;
      await saveBytes(pdfBytes, `telecom_report_${reportDate}.pdf`, "pdf");
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setExportingPdf(false);
    }
  }, [
    kpi,
    canals,
    hourly,
    operators,
    regions,
    statusData,
    reportDate,
    fileName,
    exportingPdf,
    includeAssistantDataset,
    includeCanalDataset,
    includeHourlyDataset,
    includeStatusDataset,
    insights,
    revenueGroupRows,
    hasOverviewSection,
    getDailyTrendRows,
    getDeckBrief,
    inclOperators,
    inclRegions,
    kpiRows,
  ]); // includeAssistantDataset and insights used by exportPdf callback — intentionally in deps

  const selectedKpiCount = KPI_FIELDS.filter((f) => selectedKpis.has(f.key)).length;
  const selectedOverviewCount = selectedOverviewSections.size;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 hover:bg-primary/15 border border-primary/30 text-primary rounded-xl text-xs font-medium transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        Exporter
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-80 rounded-2xl border border-border bg-card shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold text-foreground">Exporter le rapport</span>
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
                <span className="text-xs font-semibold text-foreground">KPIs sélectionnés</span>
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                  {selectedKpiCount} / {KPI_FIELDS.length}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Cochez / décochez les cartes KPI dans la vue <strong>Vue d&apos;ensemble</strong>{" "}
                pour sélectionner les métriques à exporter.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-foreground">
                  Widgets Vue d&apos;ensemble
                </span>
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                  {selectedOverviewCount} / 9
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Les checkboxes sur les widgets de la vue d&apos;ensemble contrôlent les sections
                incluses dans JSON, Excel, PDF et CSV Canaux.
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
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border bg-muted/40 text-muted-foreground",
                      count === 0 && "opacity-40 cursor-not-allowed",
                    )}
                  >
                    <span
                      className={cn(
                        "w-3.5 h-3.5 rounded flex items-center justify-center border flex-none",
                        val && count > 0
                          ? "bg-primary border-primary"
                          : "border-border bg-background",
                      )}
                    >
                      {val && count > 0 && (
                        <svg
                          aria-hidden="true"
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
                    {count > 0 && <span className="text-[9px] opacity-60">{count}</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Format buttons */}
            <div>
              <span className="text-xs font-semibold text-foreground block mb-2">Format</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={exportCanalCSV}
                  disabled={!(includeCanalDataset && canals.length)}
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
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700 dark:bg-rose-600/15 dark:hover:bg-rose-600/25 dark:border-rose-500/25 dark:text-rose-300 rounded-xl text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <FileText className="w-3.5 h-3.5" />
                  {exportingPdf ? "PDF…" : "PDF"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
