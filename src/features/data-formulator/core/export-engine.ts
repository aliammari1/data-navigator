"use client";

/**
 * Export Engine
 * Multi-format export for dashboards and individual charts.
 * Supports: PDF (html2canvas + jspdf), PNG/SVG images.
 *
 * 2026 Pattern: One-click export to presentation-ready formats with
 * automatic layout adaptation.
 */

import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { DashboardSpec, DashboardWidget } from "./auto-dashboard";
import { safeJsonStringify } from "./json";
import type { QueryResult } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExportFormat = "pdf" | "png" | "csv" | "json";

export interface ExportOptions {
  format: ExportFormat;
  filename?: string;
  includeTitle?: boolean;
  includeTimestamp?: boolean;
  pageSize?: "a4" | "letter" | "wide";
  orientation?: "portrait" | "landscape";
  quality?: number; // 0-1 for images
}

// ─── PDF Export ───────────────────────────────────────────────────────────────

export async function exportToPDF(
  element: HTMLElement,
  options: ExportOptions,
): Promise<Blob> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#0a0a0a",
    logging: false,
  });

  const imgData = canvas.toDataURL("image/png", options.quality ?? 0.95);
  const orientation = options.orientation ?? "landscape";
  const pageSize = options.pageSize ?? "a4";

  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: pageSize,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;

  let y = margin;

  // Title
  if (options.includeTitle !== false) {
    pdf.setFontSize(18);
    pdf.setTextColor(255, 255, 255);
    pdf.text("Data Navigator Export", margin, y + 5);
    y += 12;
  }

  // Timestamp
  if (options.includeTimestamp !== false) {
    pdf.setFontSize(9);
    pdf.setTextColor(180, 180, 180);
    pdf.text(new Date().toLocaleString(), margin, y);
    y += 8;
  }

  // Main image
  const imgWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  if (y + imgHeight > pageHeight - margin) {
    // Multi-page: scale to fit width, split across pages
    pdf.addImage(imgData, "PNG", margin, y, imgWidth, imgHeight);
  } else {
    pdf.addImage(imgData, "PNG", margin, y, imgWidth, imgHeight);
  }

  return pdf.output("blob");
}

export async function exportDashboardToPDF(
  dashboard: DashboardSpec,
  options: ExportOptions,
): Promise<Blob> {
  const pdf = new jsPDF({
    orientation: options.orientation ?? "landscape",
    unit: "mm",
    format: options.pageSize ?? "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 10;
  let y = margin;

  // Header
  pdf.setFillColor(10, 10, 10);
  pdf.rect(0, 0, pageWidth, 25, "F");
  pdf.setFontSize(20);
  pdf.setTextColor(255, 255, 255);
  pdf.text(dashboard.title, margin, 15);
  pdf.setFontSize(9);
  pdf.setTextColor(160, 160, 160);
  pdf.text(
    `Generated: ${new Date(dashboard.generatedAt).toLocaleString()} | Model: ${dashboard.modelUsed}`,
    margin,
    22,
  );
  y = 30;

  // Widgets
  for (const widget of dashboard.widgets) {
    // Check page break
    if (y > 250) {
      pdf.addPage();
      y = margin;
    }

    pdf.setFontSize(12);
    pdf.setTextColor(255, 255, 255);
    pdf.text(widget.title, margin, y + 5);
    y += 10;

    if (widget.type === "kpi" && widget.kpiValue) {
      pdf.setFontSize(24);
      pdf.setTextColor(100, 200, 150);
      pdf.text(String(widget.kpiValue.value), margin, y + 8);
      pdf.setFontSize(10);
      pdf.setTextColor(180, 180, 180);
      pdf.text(widget.kpiValue.label, margin, y + 15);
      y += 25;
    } else if (widget.type === "text" && widget.textContent) {
      pdf.setFontSize(9);
      pdf.setTextColor(200, 200, 200);
      const lines = pdf.splitTextToSize(
        widget.textContent,
        pageWidth - margin * 2,
      );
      pdf.text(lines, margin, y + 5);
      y += lines.length * 4 + 10;
    } else if (widget.type === "chart" && widget.queryResult) {
      // Add table representation of chart data
      const data = widget.queryResult.data.slice(0, 20);
      if (data.length > 0) {
        const headers = Object.keys(data[0]);
        const body = data.map((row) =>
          headers.map((h) => String(row[h] ?? "")),
        );

        autoTable(pdf, {
          head: [headers],
          body,
          startY: y,
          margin: { left: margin, right: margin },
          theme: "grid",
          headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255] },
          bodyStyles: { fillColor: [15, 15, 15], textColor: [200, 200, 200] },
          alternateRowStyles: { fillColor: [20, 20, 20] },
          styles: { fontSize: 8, cellPadding: 2 },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        y = (pdf as any).lastAutoTable?.finalY ?? y + 40;
      }
    }

    y += 8;
  }

  return pdf.output("blob");
}

// ─── Image Export ─────────────────────────────────────────────────────────────

export async function exportToPNG(
  element: HTMLElement,
  quality = 0.95,
): Promise<Blob> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#0a0a0a",
    logging: false,
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob: Blob | null) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob failed"));
      },
      "image/png",
      quality,
    );
  });
}

// ─── Data Export ──────────────────────────────────────────────────────────────

export function exportToCSV(
  data: Record<string, unknown>[],
  filename = "export.csv",
): Blob {
  if (data.length === 0) return new Blob([""], { type: "text/csv" });

  const headers = Object.keys(data[0]);
  const escaper = (val: unknown) => {
    const str = String(val ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace('"', '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.join(","),
    ...data.map((row) => headers.map((h) => escaper(row[h])).join(",")),
  ];

  return new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
}

export function exportToJSON(data: unknown, filename = "export.json"): Blob {
  return new Blob([safeJsonStringify(data, 2)], { type: "application/json" });
}

// ─── Unified Export Function ──────────────────────────────────────────────────

export async function exportDashboard(
  dashboard: DashboardSpec,
  element: HTMLElement | null,
  options: ExportOptions,
): Promise<Blob> {
  switch (options.format) {
    case "pdf":
      if (element) {
        return exportToPDF(element, options);
      }
      return exportDashboardToPDF(dashboard, options);
    case "png":
      if (!element) throw new Error("PNG export requires a DOM element");
      return exportToPNG(element, options.quality);
    case "csv": {
      // Combine all chart data
      const allData: Record<string, unknown>[] = [];
      for (const w of dashboard.widgets) {
        if (w.queryResult?.data) {
          allData.push(...w.queryResult.data);
        }
      }
      return exportToCSV(allData, `${options.filename ?? "export"}.csv`);
    }
    case "json":
      return exportToJSON(dashboard, `${options.filename ?? "export"}.json`);
    default:
      throw new Error(`Unsupported export format: ${options.format}`);
  }
}

// ─── Download Helper ──────────────────────────────────────────────────────────

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
