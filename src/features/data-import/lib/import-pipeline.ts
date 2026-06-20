"use client";

/**
 * Import pipeline orchestrator.
 *
 * Extracted from the 1154-line `DataImportScreen` so the orchestration logic is
 * framework-light, testable, and free of the bugs the v2 plan flagged:
 *
 *  - No fake progress: the old code did `setTimeout(80)` and hardcoded
 *    `progress: 10/35/75`. Progress is now driven off real pipeline phases
 *    (register -> full-table profiling -> done). Honest byte/row progress needs
 *    a main-process IPC channel (see `sharedChangesNeeded`); until then we emit
 *    truthful phase milestones instead of an invented byte percentage.
 *  - No mid-batch navigation: `router.push` is removed from per-file processing.
 *    `importBatch` navigates exactly once, after the whole batch settles.
 *  - Bounded concurrency: the main process serializes writes, but overlapping
 *    renderer-side profiling/preview work with the next file's COPY still wins.
 *  - Full-table stats: column metadata + quality scores come from DuckDB
 *    SUMMARIZE over the whole Parquet cache, not a 100-row preview.
 */

import type { Dataset } from "@/core/stores/data-store";
import {
  columnInfoToColMeta,
  computeQualityScores,
  detectFileType,
} from "@/features/data-import/model/helpers";
import { useImportSession } from "@/features/data-import/model/import-session-store";
import {
  fetchFullTableColumnInfo,
  mapDuckTypeToColumnInfoType,
} from "@/features/data-import/model/summarize";
import type {
  ColumnInfo,
  ImportEncoding,
  ParsedFileInfo,
  ValidationIssue,
} from "@/features/data-import/model/types";
import {
  getTelecomDatasetProfile,
  TELECOM_REQUIRED_COLUMNS,
} from "@/features/telecom/lib/dataset-detection";
import type { CsvEncoding, RejectSummary } from "@/platform/duckdb/duckdb";
import {
  loadUploadPathToDuckDB,
  sanitizeUploadTableName,
  type UploadFileFormat,
} from "@/platform/duckdb/upload-to-duckdb";

// ─── Path helpers ─────────────────────────────────────────────────────────────

export function fileNameFromPath(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] ?? filePath;
}

export function isSupportedImportPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.endsWith(".csv") ||
    lower.endsWith(".tsv") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".parquet") ||
    lower.endsWith(".pq")
  );
}

function getExtensionFromPath(filePath: string): UploadFileFormat {
  const fileName = fileNameFromPath(filePath);
  const ext = fileName.split(".").pop()?.toLowerCase() || "csv";
  return ext as UploadFileFormat;
}

function isCsvLikeExtension(format: UploadFileFormat): boolean {
  return format === "csv" || format === "tsv" || format === "txt";
}

/**
 * Map a UI encoding label to the DuckDB `read_csv(encoding=…)` value, or
 * `undefined` for `auto` — which leaves the main process to detect the encoding
 * (chardet + BOM sniff) instead of forcing one.
 */
function toCsvEncoding(encoding: ImportEncoding): CsvEncoding | undefined {
  if (encoding === "auto") return undefined;
  return encoding;
}

function makeUploadTableName(fileName: string, id: string): string {
  return `${sanitizeUploadTableName(fileName)}_${id.slice(-6)}`;
}

function makeFileId(): string {
  return `file_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

// ─── DuckDB type mapping ──────────────────────────────────────────────────────

function previewColumnsToColumnInfo(
  loaded: Awaited<ReturnType<typeof loadUploadPathToDuckDB>>,
): ColumnInfo[] {
  return loaded.columns.map((column) => ({
    name: column.name,
    type: mapDuckTypeToColumnInfoType(column.type),
    nullCount: column.nullCount,
    uniqueCount: column.distinctCount,
    sampleValues: column.sample,
    min: column.min,
    max: column.max,
    avg: column.mean,
  }));
}

// ─── Validation ───────────────────────────────────────────────────────────────

function buildValidationIssues(
  loaded: Awaited<ReturnType<typeof loadUploadPathToDuckDB>>,
  columns: ColumnInfo[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (loaded.rowCount === 0) {
    issues.push({
      severity: "error",
      message: "File is empty or has no parseable data.",
    });
  }

  // With full-table stats `nullRate` is exact; otherwise fall back to the
  // preview sample. Either way report columns that are mostly empty.
  const sampleSize = Math.max(loaded.previewRows.length, 1);
  const highNullCols = columns.filter((column) => {
    const rate =
      typeof column.nullRate === "number" ? column.nullRate : column.nullCount / sampleSize;
    return rate > 0.3;
  });

  if (highNullCols.length > 0) {
    const scope = columns.some((c) => typeof c.nullRate === "number")
      ? "the full table"
      : "the preview sample";
    issues.push({
      severity: "warning",
      message: `${highNullCols.length} column(s) have >30% null values in ${scope}.`,
      column: highNullCols.map((column) => column.name).join(", "),
    });
  }

  return issues;
}

/**
 * Turn DuckDB's reject summary (rows coerced/skipped during the lenient
 * `read_csv`) into a warning `ValidationIssue`, so silently dropped rows become
 * visible instead of vanishing. Returns an empty array when nothing was
 * rejected. The first few `reject_errors` samples are folded into the message.
 */
function buildRejectIssues(rejects: RejectSummary | undefined): ValidationIssue[] {
  if (!rejects || rejects.rejectedRowCount <= 0) return [];

  const sample = rejects.sample
    .slice(0, 3)
    .map((entry) => {
      const where = entry.line !== null && entry.line !== undefined ? `ligne ${entry.line}` : null;
      const what = entry.errorMessage ?? entry.errorType ?? "valeur invalide";
      return [where, entry.columnName, what].filter(Boolean).join(" · ");
    })
    .filter((text) => text.length > 0);

  const detail = sample.length > 0 ? ` Exemples : ${sample.join(" ; ")}.` : "";

  return [
    {
      severity: "warning",
      message: `${rejects.rejectedRowCount.toLocaleString()} ligne(s) ont été corrigées ou ignorées par DuckDB pendant la lecture CSV.${detail}`,
      affectedRows: rejects.rejectedRowCount,
    },
  ];
}

// ─── Pipeline context ─────────────────────────────────────────────────────────

export interface ImportPipelineContext {
  isTelecomMode: boolean;
  canUpload: boolean;
  /**
   * Encoding override for CSV-like imports. `auto` (the default) defers to the
   * main-process detector; an explicit value forces DuckDB `read_csv(encoding=…)`.
   */
  encoding: ImportEncoding;
  addDataset: (dataset: Dataset) => void;
  setActiveDataset: (id: string) => void;
  setAppContext: (context: {
    activeDomain: "telecom" | "general";
    activeDatasetId: string;
    activeTableName: string;
  }) => void;
  addActivity: (event: {
    type: "dataset_uploaded";
    message: string;
    datasetId: string;
    tableName: string;
    metadata: Record<string, unknown>;
  }) => void;
}

function baseFileInfo(filePath: string, id: string, encoding: ImportEncoding): ParsedFileInfo {
  const fileName = fileNameFromPath(filePath);
  return {
    id,
    name: fileName,
    size: 0,
    fileType: detectFileType(fileName),
    status: "reading",
    progress: 0,
    rowCount: 0,
    columnCount: 0,
    columns: [],
    previewRows: [],
    issues: [],
    parseTime: 0,
    dbTableName: null,
    uploadedAt: new Date(),
    hasHeader: true,
    encoding,
    skipEmptyLines: true,
    completeness: 0,
    accuracy: 0,
    consistency: 0,
    uniqueness: 0,
    metadataSource: "preview",
  };
}

/**
 * Register a single local file as a DuckDB dataset and wire it into app state.
 *
 * Returns the created file id on success, or null when the import failed or was
 * not permitted. Never navigates — batching/navigation is the caller's job.
 */
export async function processFilePath(
  filePath: string,
  ctx: ImportPipelineContext,
): Promise<string | null> {
  if (!ctx.canUpload) return null;

  const id = makeFileId();
  const fileName = fileNameFromPath(filePath);
  const session = useImportSession.getState();

  session.add(baseFileInfo(filePath, id, ctx.encoding));

  const patch = (next: Partial<ParsedFileInfo>) => useImportSession.getState().patch(id, next);

  try {
    const t0 = performance.now();
    patch({ status: "loading_db", progress: 20 });

    const tableName = makeUploadTableName(fileName, id);
    const extension = getExtensionFromPath(filePath);
    const csvLike = isCsvLikeExtension(extension);

    const loaded = await loadUploadPathToDuckDB(filePath, {
      tableName,
      fileExtension: extension,
      hasHeader: true,
      previewLimit: 100,
      // Encoding + reject capture only apply to the CSV-like read path; Parquet
      // is self-describing and ignores both.
      ...(csvLike
        ? {
            encoding: toCsvEncoding(ctx.encoding),
            storeRejects: true,
          }
        : {}),
    });

    patch({ status: "validating", progress: 70 });

    // Prefer accurate, full-table stats from DuckDB SUMMARIZE; fall back to the
    // preview-derived metadata only if SUMMARIZE is unavailable.
    const previewColumns = previewColumnsToColumnInfo(loaded);
    const previewSamples = new Map<string, unknown[]>(
      previewColumns.map((column) => [column.name, column.sampleValues]),
    );

    const fullColumns = await fetchFullTableColumnInfo(
      loaded.datasetId,
      loaded.rowCount,
      previewSamples,
    );

    const columns = fullColumns ?? previewColumns;
    const metadataSource: ParsedFileInfo["metadataSource"] = fullColumns ? "full" : "preview";

    const issues = [
      ...buildValidationIssues(loaded, columns),
      ...buildRejectIssues(loaded.rejects),
    ];
    const quality = computeQualityScores(columns, Math.max(loaded.rowCount, 1));

    const dsCols = columnInfoToColMeta(columns);
    const telecomProfile = getTelecomDatasetProfile({
      columns: dsCols,
      fileName,
      telecomMode: ctx.isTelecomMode,
    });

    if (ctx.isTelecomMode && !telecomProfile.compatible) {
      issues.push({
        severity: "warning",
        message:
          "This file was uploaded in Telecom mode, but it is missing one or more required telecom columns.",
        column: TELECOM_REQUIRED_COLUMNS.join(", "),
      });
    }

    const dataset: Dataset = {
      id: loaded.datasetId,
      name: loaded.displayName,
      tableName: loaded.tableName,
      viewName: loaded.tableName,
      sourcePath: filePath,
      source: "upload",
      format: loaded.format,
      rowCount: loaded.rowCount,
      colCount: loaded.colCount,
      sizeBytes: 0,
      columns: dsCols,
      tags: telecomProfile.tags,
      description: telecomProfile.description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      qualityScore: quality.completeness,
    };

    ctx.addDataset(dataset);
    ctx.setActiveDataset(dataset.id);
    ctx.setAppContext({
      activeDomain: ctx.isTelecomMode ? "telecom" : "general",
      activeDatasetId: dataset.id,
      activeTableName: loaded.tableName,
    });
    ctx.addActivity({
      type: "dataset_uploaded",
      message: `Imported dataset ${dataset.name}`,
      datasetId: dataset.id,
      tableName: loaded.tableName,
      metadata: {
        rows: loaded.rowCount,
        cols: loaded.colCount,
        format: loaded.format,
        telecomMode: ctx.isTelecomMode,
        sourcePath: filePath,
        metadataSource,
        encoding: ctx.encoding,
        rejectedRows: loaded.rejects?.rejectedRowCount ?? 0,
      },
    });

    patch({
      status: "done",
      progress: 100,
      rowCount: loaded.rowCount,
      columnCount: loaded.colCount,
      columns,
      previewRows: loaded.previewRows.slice(0, 50),
      issues,
      parseTime: Math.round(performance.now() - t0),
      dbTableName: loaded.tableName,
      datasetId: loaded.datasetId,
      metadataSource,
      rejectCount: csvLike ? (loaded.rejects?.rejectedRowCount ?? 0) : undefined,
      ...quality,
    });

    return id;
  } catch (error) {
    patch({
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      progress: 0,
    });
    return null;
  }
}

/**
 * Import a batch of local files with bounded concurrency.
 *
 * Each file is processed independently (a failure never aborts the batch) and
 * navigation is left to the caller via the returned summary — fixing the old
 * mid-loop `router.push` that orphaned every file after the first.
 */
export async function importBatch(
  paths: string[],
  ctx: ImportPipelineContext,
  options: { concurrency?: number } = {},
): Promise<{ doneIds: string[]; failed: number }> {
  // The main-process write connection is serialized, so a small pool is the
  // sweet spot: enough to overlap renderer profiling with the next COPY,
  // without thrashing the single writer.
  const concurrency = Math.max(1, options.concurrency ?? 2);
  const queue = [...paths];
  const doneIds: string[] = [];
  let failed = 0;

  const worker = async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (next === undefined) break;
      const id = await processFilePath(next, ctx);
      if (id) doneIds.push(id);
      else failed += 1;
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, paths.length || 1) }, worker));

  return { doneIds, failed };
}
