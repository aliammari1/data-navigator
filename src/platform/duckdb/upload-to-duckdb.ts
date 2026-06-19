"use client";

/**
 * Upload dataset loader.
 *
 * New dataset model:
 * - Electron imports should be path-based, not File/ArrayBuffer-based.
 * - DuckDB main process registers the local file as a dataset.
 * - CSV/TSV/TXT files are converted to managed Parquet cache.
 * - Parquet files are copied into managed Parquet cache.
 * - Renderer receives a dataset/view descriptor plus preview rows.
 *
 * Important:
 * Browser `File` objects do not expose trusted local filesystem paths.
 * For Electron, use `openLocalFileDialog()` and then `loadUploadPathToDuckDB()`.
 */

import {
  type CsvEncoding,
  type RegisteredDatasetColumn,
  type RegisteredDatasetWithPreview,
  type RejectSummary,
  registerCSVPathDataset,
  registerParquetPathDataset,
} from "@/platform/duckdb/duckdb";
import type { SupportedExtensions } from "@/shared/types";

export type UploadFileFormat = "csv" | "tsv" | "txt" | "parquet" | "pq";

export interface LoadedUploadTable {
  /**
   * Kept because the rest of the app likely still expects `tableName`.
   * In the new model this is the DuckDB view name, not a physical table.
   */
  tableName: string;

  /**
   * Stable dataset id from the DuckDB dataset catalog.
   */
  datasetId: string;

  /**
   * Human-readable dataset name.
   */
  displayName: string;

  format: UploadFileFormat;
  rowCount: number;
  colCount: number;

  columns: Array<{
    name: string;
    type: string;

    /**
     * These are preview-derived values, not full-table statistics.
     * Use `summarizeRegisteredDataset({ datasetId })` for real profiling.
     */
    nullCount: number;
    distinctCount: number;
    min?: number;
    max?: number;
    mean?: number;
    sample: unknown[];
  }>;

  previewRows: Record<string, unknown>[];

  /**
   * Makes it explicit that the stats in `columns` are based only on preview rows.
   */
  metadataSource: "preview";

  /**
   * Rejected/coerced rows captured when `storeRejects` was enabled on a CSV
   * import. Present only for CSV imports run with `storeRejects: true`; surface
   * in a data-quality panel.
   */
  rejects?: RejectSummary;
}

export interface LoadUploadPathOptions {
  /**
   * Old callers may pass `tableName`; in the new dataset model it becomes
   * the display name, not a physical DuckDB table name.
   */
  tableName?: string;

  /**
   * Prefer this for new code.
   */
  displayName?: string;

  fileExtension: SupportedExtensions | UploadFileFormat;
  hasHeader?: boolean;
  delimiter?: string;
  sampleSize?: number;
  previewLimit?: number;

  /**
   * Text encoding for CSV-like imports. The data-import cluster detects this
   * (chardet/BOM sniff); this layer just plumbs it to `read_csv(encoding=…)`.
   */
  encoding?: CsvEncoding;

  /**
   * Capture coerced/skipped rows into a reject summary surfaced on the result.
   */
  storeRejects?: boolean;
}

export interface LoadUploadFileOptions {
  tableName?: string;
  displayName?: string;
  fileExtension: SupportedExtensions | UploadFileFormat;
  hasHeader?: boolean;
  delimiter?: string;
  sampleSize?: number;
  maxRows?: number | null;
  previewLimit?: number;
}

function getExtension(filePathOrName: string): UploadFileFormat | string {
  const clean = filePathOrName.split(/[?#]/)[0] ?? filePathOrName;
  const ext = clean.split(".").pop();

  return ext ? ext.toLowerCase() : "";
}

function basename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || "dataset";
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function defaultDisplayName(filePath: string): string {
  return stripExtension(basename(filePath)) || "dataset";
}

function normalizeExtension(
  filePath: string,
  explicitExtension?: SupportedExtensions | UploadFileFormat,
): UploadFileFormat {
  const ext = String(explicitExtension || getExtension(filePath)).toLowerCase();

  if (ext === "csv" || ext === "tsv" || ext === "txt" || ext === "parquet" || ext === "pq") {
    return ext;
  }

  throw new Error(
    `Unsupported dataset file type ".${ext || "unknown"}". Supported files: .csv, .tsv, .txt, .parquet, .pq.`,
  );
}

function isCsvLikeFormat(format: UploadFileFormat): format is "csv" | "tsv" | "txt" {
  return format === "csv" || format === "tsv" || format === "txt";
}

function isParquetFormat(format: UploadFileFormat): format is "parquet" | "pq" {
  return format === "parquet" || format === "pq";
}

function inferDelimiter(format: UploadFileFormat, explicitDelimiter?: string): string | undefined {
  if (explicitDelimiter) return explicitDelimiter;
  if (format === "tsv") return "\t";
  return undefined;
}

export function sanitizeUploadTableName(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .replace(/\W/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .toLowerCase()
      .slice(0, 60) || "dataset"
  );
}

function inferPreviewType(values: unknown[]): string {
  const nonNull = values.filter((value) => value !== null && value !== undefined && value !== "");

  if (nonNull.length === 0) return "string";

  let numbers = 0;
  let booleans = 0;
  let dates = 0;

  for (const value of nonNull) {
    const text = String(value).trim().toLowerCase();

    if (text === "true" || text === "false") {
      booleans += 1;
    } else if (text !== "" && !Number.isNaN(Number(text))) {
      numbers += 1;
    } else if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
      dates += 1;
    }
  }

  const total = nonNull.length;

  if (numbers / total > 0.8) return "number";
  if (booleans / total > 0.8) return "boolean";
  if (dates / total > 0.8) return "date";

  return "string";
}

function buildPreviewColumnMetadata(
  columns: RegisteredDatasetColumn[],
  previewRows: Record<string, unknown>[],
): LoadedUploadTable["columns"] {
  return columns.map((column) => {
    const values = previewRows.map((row) => row[column.name]);
    const nonNull = values.filter((value) => value !== null && value !== undefined && value !== "");

    const previewType = inferPreviewType(values);
    const numericValues = nonNull
      .map((value) => Number(value))
      .filter((value) => !Number.isNaN(value));

    return {
      name: column.name,
      type: column.type || previewType,
      nullCount: values.length - nonNull.length,
      distinctCount: new Set(nonNull.map((value) => String(value))).size,
      min:
        numericValues.length > 0 && previewType === "number"
          ? Math.min(...numericValues)
          : undefined,
      max:
        numericValues.length > 0 && previewType === "number"
          ? Math.max(...numericValues)
          : undefined,
      mean:
        numericValues.length > 0 && previewType === "number"
          ? numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length
          : undefined,
      sample: nonNull.slice(0, 5),
    };
  });
}

function toLoadedUploadTable(
  dataset: RegisteredDatasetWithPreview,
  format: UploadFileFormat,
  previewLimit: number,
): LoadedUploadTable {
  const previewRows = dataset.previewRows.slice(0, previewLimit);

  return {
    tableName: dataset.viewName,
    datasetId: dataset.id,
    displayName: dataset.displayName,
    format,
    rowCount: dataset.rowCount,
    colCount: dataset.columns.length,
    columns: buildPreviewColumnMetadata(dataset.columns, previewRows),
    previewRows,
    metadataSource: "preview",
    ...(dataset.rejects ? { rejects: dataset.rejects } : {}),
  };
}

/**
 * Main Electron import path.
 *
 * Use this after selecting a file through Electron's open dialog.
 */
export async function loadUploadPathToDuckDB(
  filePath: string,
  options: LoadUploadPathOptions,
): Promise<LoadedUploadTable> {
  const format = normalizeExtension(filePath, options.fileExtension);
  const previewLimit = options.previewLimit ?? 100;

  const displayName =
    options.displayName?.trim() || options.tableName?.trim() || defaultDisplayName(filePath);

  if (isCsvLikeFormat(format)) {
    const dataset = await registerCSVPathDataset({
      filePath,
      displayName,
      hasHeader: options.hasHeader ?? true,
      delimiter: inferDelimiter(format, options.delimiter),
      sampleSize: options.sampleSize,
      previewLimit,
      encoding: options.encoding,
      storeRejects: options.storeRejects,
    });

    return toLoadedUploadTable(dataset, format, previewLimit);
  }

  if (isParquetFormat(format)) {
    const dataset = await registerParquetPathDataset({
      filePath,
      displayName,
      previewLimit,
    });

    return toLoadedUploadTable(dataset, format, previewLimit);
  }

  throw new Error(`Unsupported dataset format: ${format}`);
}

/**
 * Browser File objects do not provide a trusted native file path.
 *
 * In the Electron dataset model, importing by File/ArrayBuffer is intentionally
 * not supported because it reintroduces the large IPC-buffer bottleneck.
 *
 * Correct flow:
 * 1. Use `openLocalFileDialog()` from `duckdb-fs.ts`.
 * 2. Pass the selected path to `loadUploadPathToDuckDB()`.
 */
export async function loadUploadFileToDuckDB(
  file: File,
  options: LoadUploadFileOptions,
): Promise<LoadedUploadTable> {
  const fileName = file.name || "dataset";
  const ext = normalizeExtension(fileName, options.fileExtension);

  throw new Error(
    [
      `File-based upload for ".${ext}" is disabled in the Electron DuckDB pipeline.`,
      "Use a path-based import instead:",
      "const [filePath] = await openLocalFileDialog(...);",
      "await loadUploadPathToDuckDB(filePath, { fileExtension: ext, ...options });",
    ].join(" "),
  );
}
