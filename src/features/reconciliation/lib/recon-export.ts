"use client";

/**
 * Offline reconciliation export (XLSX / PDF), off the main thread.
 *
 * The legacy "Download PDF Report" button was a dead no-op; a naive wiring of
 * jspdf-autotable would OOM past a few thousand rows. Here we map the diff onto
 * the platform `ReportDocument` shape and hand it to the export worker via
 * `getExportProxy()` (`pdf`/`xlsx` → transferable ArrayBuffer), then save with
 * `saveBytes()` (Electron save dialog, browser blob fallback). No DOM
 * screenshots, no main-thread serialization.
 *
 * Rows are pulled from DuckDB in keyset-friendly pages (the diff CTE is ordered
 * + LIMIT/OFFSET) rather than materializing the whole result set in JS, so the
 * export scales to large diffs while staying bounded in memory.
 */

import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import { getExportProxy, saveBytes } from "@/platform/viz";
import type { ReportDocument, TableSection } from "@/workers/export-types";
import { buildPageSQL, type DiffConfig } from "./recon-sql";
import {
  type DiffRow,
  type DiffSummary,
  mapDiffRow,
} from "./use-reconciliation";
import type { RowAnnotation } from "../stores/annotations-store";

/** Hard cap on rows embedded in a single export document (memory safety). */
const MAX_EXPORT_ROWS = 50_000;
const PAGE_SIZE = 5_000;

/** Page through changed/added/removed rows from DuckDB without materializing all of them. */
async function* streamDiffRows(
  cfg: DiffConfig,
): AsyncGenerator<DiffRow, void, unknown> {
  let offset = 0;
  while (offset < MAX_EXPORT_ROWS) {
    const rows = await runReadOnlyQuery(
      buildPageSQL(cfg, { limit: PAGE_SIZE, offset, onlyChanged: true }),
    );
    if (rows.length === 0) return;
    for (const raw of rows) yield mapDiffRow(cfg, raw);
    if (rows.length < PAGE_SIZE) return;
    offset += PAGE_SIZE;
  }
}

function fmt(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

function buildSummarySection(
  summary: DiffSummary,
  measureLabels: string[],
): TableSection {
  const rows: (string | number)[][] = [
    ["Rows total", summary.rowsTotal],
    ["Changed", summary.rowsChanged],
    ["Added (actual only)", summary.rowsAdded],
    ["Removed (expected only)", summary.rowsRemoved],
    ["Unchanged", summary.rowsUnchanged],
    ["Material (threshold)", summary.rowsMaterial],
  ];
  for (const label of measureLabels) {
    const t = summary.totals[label];
    if (!t) continue;
    rows.push([`Σ expected · ${label}`, fmt(t.sumExpected)]);
    rows.push([`Σ actual · ${label}`, fmt(t.sumActual)]);
    rows.push([`Σ variance · ${label}`, fmt(t.sumVariance)]);
  }
  return { title: "Reconciliation Summary", headers: ["Metric", "Value"], rows };
}

export interface ReconExportInput {
  cfg: DiffConfig;
  summary: DiffSummary;
  annotations: Record<string, RowAnnotation>;
  expectedLabel: string;
  actualLabel: string;
  kind: "xlsx" | "pdf";
}

/**
 * Build and save a reconciliation report. Returns the save result, or `null`
 * when no export worker is available in this environment.
 */
export async function exportReconciliation(
  input: ReconExportInput,
): Promise<{ saved: boolean; path?: string } | null> {
  const exp = getExportProxy();
  if (!exp) return null;

  const { cfg, summary, annotations, kind } = input;
  const measureLabels = cfg.measures.map((m) => m.label);

  const headers = [
    "Key",
    "Status",
    ...measureLabels.flatMap((l) => [`Exp ${l}`, `Act ${l}`, `Δ ${l}`, `Δ% ${l}`]),
    "Reason",
    "Notes",
    "Escalated",
  ];

  const diffRows: (string | number)[][] = [];
  for await (const row of streamDiffRows(cfg)) {
    const ann = annotations[row.key];
    diffRows.push([
      row.key,
      row.status,
      ...row.measures.flatMap((m) => [
        fmt(m.expected),
        fmt(m.actual),
        fmt(m.variance),
        m.variancePct === null ? "—" : `${m.variancePct.toFixed(1)}%`,
      ]),
      ann?.reasonCode ?? "",
      ann?.notes ?? "",
      ann?.escalated ? "yes" : "",
    ]);
  }

  const sections: TableSection[] = [
    buildSummarySection(summary, measureLabels),
    {
      title: "Differences",
      headers,
      rows: diffRows,
    },
  ];

  const doc: ReportDocument = {
    title: "Data Reconciliation Report",
    subtitle: `${input.expectedLabel} (expected) vs ${input.actualLabel} (actual) — ${diffRows.length} differences`,
    sections,
    paperSize: "a4",
    includeCharts: false,
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `reconciliation-${stamp}.${kind}`;
  const buf = kind === "pdf" ? await exp.pdf(doc) : await exp.xlsx(doc);
  return saveBytes(buf, fileName, kind);
}
