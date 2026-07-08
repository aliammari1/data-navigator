/**
 * Neutral export types for export.worker. Kept in the worker subsystem dir (NOT
 * src/shared) to avoid collisions with sibling agents. Feature code maps its own
 * report models onto these shapes.
 */

export type ExportKind = "pdf" | "xlsx" | "docx" | "pptx";

export interface TableSection {
  /** Section heading rendered above the table. */
  title?: string;
  /** Column headers. */
  headers: string[];
  /** Row cells (already string-formatted by the caller). */
  rows: (string | number)[][];
  /** Optional relative column widths (pdf): "*", "auto", or a number. */
  widths?: (string | number)[];
}

export interface ChartImage {
  /** ECharts SVG string (from chart.worker.renderToSVGString). */
  svg?: string;
  /** Pre-rasterized PNG bytes (skip resvg if provided). */
  png?: Uint8Array;
  /** Target render width in px. */
  width?: number;
  /** Target render height in px (derived from aspect if omitted). */
  height?: number;
}

export interface ReportDocument {
  title: string;
  subtitle?: string;
  /** Optional logo as a base64 data URI (offline; from Dexie/local picker). */
  logoDataUri?: string;
  /** Optional logo as raw PNG bytes (docx path). */
  logoPng?: Uint8Array;
  sections: TableSection[];
  charts?: ChartImage[];
  paperSize?: "a4" | "letter";
  /** Whether to include charts (rasterized) in the export. */
  includeCharts?: boolean;
}
