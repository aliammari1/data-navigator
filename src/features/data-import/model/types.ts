// ─── Types ───────────────────────────────────────────────────────────────────

import type { RejectError } from "@/platform/duckdb/duckdb";

export type UploadStatus =
  | "idle"
  | "reading"
  | "parsing"
  | "validating"
  | "loading_db"
  | "done"
  | "error";

/**
 * Display file type for a session import row.
 *
 * Covers every extension the path-based pipeline accepts (`isSupportedImportPath`)
 * plus `unknown` for anything `detectFileType` cannot classify. Previously this
 * was `"csv"` only, which mistyped every parquet/tsv/txt row in the session list.
 */
export type FileType = "csv" | "tsv" | "txt" | "parquet" | "unknown";

/**
 * Text encoding override for CSV-like imports, mapped to DuckDB's
 * `read_csv(encoding=…)` parameter. The UI offers human-readable labels
 * (`UTF-8` / `ISO-8859-1` / `UTF-16`); `auto` lets the main process detect
 * the encoding (chardet + BOM sniff) instead of forcing one.
 */
export type ImportEncoding = "auto" | "utf-8" | "latin-1" | "utf-16";

export interface ColumnInfo {
  name: string;
  type: "string" | "number" | "date" | "boolean" | "mixed";
  nullCount: number;
  uniqueCount: number;
  sampleValues: unknown[];
  min?: number | string;
  max?: number | string;
  avg?: number;
  /**
   * Null rate as a 0..1 fraction over the FULL table when available
   * (DuckDB SUMMARIZE), falling back to the preview sample otherwise.
   */
  nullRate?: number;
}

export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  message: string;
  affectedRows?: number;
  column?: string;
}

export interface ParsedFileInfo {
  id: string;
  name: string;
  size: number;
  fileType: FileType;
  status: UploadStatus;
  progress: number;
  rowCount: number;
  columnCount: number;
  columns: ColumnInfo[];
  previewRows: Record<string, unknown>[];
  issues: ValidationIssue[];
  parseTime: number;
  dbTableName: string | null;
  datasetId?: string;
  error?: string;
  uploadedAt: Date;
  hasHeader: boolean;
  /**
   * Encoding label requested for this import (`auto` when the main process
   * was left to detect it). Plumbed to DuckDB `read_csv(encoding=…)`.
   */
  encoding: ImportEncoding;
  skipEmptyLines: boolean;
  /**
   * Number of rows DuckDB coerced/skipped during the CSV read, captured via
   * `store_rejects`. `undefined` when reject capture did not run (e.g. Parquet).
   */
  rejectCount?: number;
  /**
   * Up to `REJECT_SAMPLE_LIMIT` (50) rejected rows — row/column/error detail —
   * for a data-quality dialog. Same source as `rejectCount`; `undefined` when
   * reject capture did not run.
   */
  rejectSample?: RejectError[];
  completeness: number;
  accuracy: number;
  consistency: number;
  uniqueness: number;
  /**
   * Source of the column/quality metadata shown for this file.
   * `full` means it came from a DuckDB SUMMARIZE over the whole table;
   * `preview` means it was derived from the preview sample only.
   */
  metadataSource: "preview" | "full";
}

export interface UploadSettings {
  hasHeader: boolean;
  encoding: ImportEncoding;
  skipEmptyLines: boolean;
  trimWhitespace: boolean;
  maxRows: number | null;
  autoDetectTypes: boolean;
  loadToDuckDB: boolean;
}

/** Human-readable label for an encoding option, for the settings select. */
export const ENCODING_LABELS: Record<ImportEncoding, string> = {
  auto: "Détection auto",
  "utf-8": "UTF-8",
  "latin-1": "ISO-8859-1 / Latin-1",
  "utf-16": "UTF-16",
};

/**
 * The ordered list of selectable encodings (auto first — the safe default that
 * defers to the main-process chardet/BOM detector).
 */
export const ENCODING_OPTIONS: ImportEncoding[] = ["auto", "utf-8", "latin-1", "utf-16"];
