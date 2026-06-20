/**
 * Shared report-studio data + option types.
 *
 * Extracted from `pptx-generator.ts` so the generators, the export worker, the
 * Dexie persistence layer, and the DuckDB aggregate query can all depend on one
 * canonical shape without importing a heavy generator module just for a type.
 */

export interface ReportChannel {
  name: string;
  volume: number;
  successRate: number;
  revenue: number;
}

export interface ReportHourly {
  hour: number;
  count: number;
  successRate: number;
}

/**
 * A flagged anomaly hour, derived from a SEEDED analysis-worker run
 * (`gesdAnomalies` / `detectAnomalies`) over the real hourly volume series —
 * never `Math.random` and never a hand-rolled threshold.
 */
export interface ReportAnomaly {
  hour: number;
  count: number;
  successRate: number;
  /** Detector score (S-H-ESD lambda ratio or z/IQR magnitude). */
  score: number;
}

/**
 * Period-over-period comparison computed from a real previous-period DuckDB
 * aggregate. `significant`/`pValue` come from a Welch two-sample t-test on the
 * hourly volume series; `null` when there is no comparable previous period.
 */
export interface ReportComparison {
  /** Previous-period totals (same shape, fewer fields). */
  prev: {
    date: string;
    totalTransactions: number;
    successRate: number;
    totalRevenue: number;
    failedTransactions: number;
  };
  /** Welch t-test on hourly volume: current vs previous period. */
  volumeTrend: {
    pValue: number;
    significant: boolean;
    meanCurrent: number;
    meanPrev: number;
  } | null;
}

export interface ReportData {
  date: string;
  totalTransactions: number;
  successRate: number;
  totalRevenue: number;
  failedTransactions: number;
  topChannels: ReportChannel[];
  hourlyData: ReportHourly[];
  /** Anomalous hours flagged by the seeded analysis worker (optional). */
  anomalies?: ReportAnomaly[];
  /** Real previous-period comparison + significance test (optional). */
  comparison?: ReportComparison;
  /** AI-generated executive narrative (provider registry, grammar-valid). */
  aiNarrative?: ReportNarrative;
  companyName?: string;
  primaryColor?: string;
  footerText?: string;
  /**
   * Logo bytes embedded into exports (PPTX/DOCX/PDF). Stored locally in Dexie
   * as raw bytes; never a remote URL, so exports work fully offline.
   */
  logoBytes?: ArrayBuffer;
  /** MIME of `logoBytes`, e.g. `image/png`. Used to build a data URI for jsPDF. */
  logoMime?: string;
}

/**
 * Structured AI narrative produced by `provider.generateStructured(schema, …)`
 * (GBNF-constrained JSON — valid by construction, no regex repair loop).
 */
export interface ReportNarrative {
  executiveSummary: string;
  keyFindings: string[];
  recommendations: string[];
}

export type PptxTemplate = "corporate-blue" | "modern-dark" | "clean-white";

export interface DocxOptions {
  includeSections: {
    executiveSummary: boolean;
    keyMetrics: boolean;
    channelPerformance: boolean;
    issues: boolean;
    recommendations: boolean;
  };
}

export interface PDFOptions {
  paperSize: "a4" | "letter";
  includeCharts: boolean;
}

/** Branding profile persisted in IndexedDB (Dexie). */
export interface BrandingProfile {
  /** Fixed singleton id, currently always `'active'`. */
  id: string;
  companyName: string;
  primaryColor: string;
  footerText: string;
  applyToAll: boolean;
  /** Local logo bytes (offline). Replaces the old remote `logoUrl`. */
  logoBytes?: ArrayBuffer;
  logoMime?: string;
  logoName?: string;
}

/** MIME types used by the export pipeline + save dialog filters. */
export const EXPORT_MIME = {
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

export type ExportFormat = keyof typeof EXPORT_MIME;
