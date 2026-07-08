"use client";

/**
 * Report-studio local persistence (IndexedDB via Dexie) for saved report
 * definitions. The branding profile used to live here too — it moved to
 * `@/core/branding` since it's an app-wide default edited from Settings, not a
 * report-studio-local concern.
 *
 * Mirrors the Dexie conventions already used by
 * `@/features/help/lib/onboarding-db` and `@/platform/storage/app-db`.
 */

import Dexie, { type Table } from "dexie";

export interface SavedReport {
  id: string;
  name: string;
  format: "pptx" | "docx" | "pdf" | "xlsx";
  templateId?: string;
  /** Opaque per-format config (sections, paper size, selected channels, etc.). */
  config: Record<string, unknown>;
  updatedAt: number;
}

class ReportStudioDatabase extends Dexie {
  savedReports!: Table<SavedReport, string>;

  constructor() {
    super("data-navigator-report-studio-v1");

    this.version(1).stores({
      savedReports: "id, updatedAt",
    });
  }
}

export const reportStudioDb = new ReportStudioDatabase();
