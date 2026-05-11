// ─── Types ───────────────────────────────────────────────────────────────────

export type UploadStatus =
  | "idle"
  | "reading"
  | "parsing"
  | "validating"
  | "loading_db"
  | "done"
  | "error";
export type FileType = "csv" | "json" | "xlsx" | "tsv" | "parquet" | "unknown";

export interface ColumnInfo {
  name: string;
  type: "string" | "number" | "date" | "boolean" | "mixed";
  nullCount: number;
  uniqueCount: number;
  sampleValues: unknown[];
  min?: number;
  max?: number;
  avg?: number;
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
  error?: string;
  uploadedAt: Date;
  delimiter: string;
  hasHeader: boolean;
  encoding: string;
  skipEmptyLines: boolean;
  completeness: number;
  accuracy: number;
  consistency: number;
  uniqueness: number;
}

export interface UploadSettings {
  delimiter: "auto" | "," | ";" | "\t" | "|";
  hasHeader: boolean;
  encoding: "UTF-8" | "ISO-8859-1" | "UTF-16";
  skipEmptyLines: boolean;
  trimWhitespace: boolean;
  maxRows: number | null;
  autoDetectTypes: boolean;
  loadToDuckDB: boolean;
}
