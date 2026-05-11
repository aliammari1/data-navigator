"use client";

import {
  getTableInfo,
  loadDelimitedCSVFromFile,
  loadJSONFileToDuckDB,
  runQuery,
} from "@/platform/duckdb/duckdb";

export type UploadFileFormat = "csv" | "json";

export interface LoadedUploadTable {
  tableName: string;
  format: UploadFileFormat;
  rowCount: number;
  colCount: number;
  columns: Array<{
    name: string;
    type: string;
    nullCount: number;
    distinctCount: number;
    min?: number;
    max?: number;
    mean?: number;
    sample: unknown[];
  }>;
  previewRows: Record<string, unknown>[];
}

export interface LoadUploadFileOptions {
  tableName?: string;
  delimiter?: "auto" | "," | ";" | "\t" | "|";
  hasHeader?: boolean;
  maxRows?: number | null;
  previewLimit?: number;
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function sanitizeUploadTableName(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .toLowerCase()
      .slice(0, 60) || "dataset"
  );
}

export function getUploadExtension(file: File): string {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

async function sniffDelimiter(file: File, ext: string): Promise<string> {
  if (ext === "tsv") return "\t";

  const sample = await file.slice(0, 4096).text();
  const counts = [
    [",", (sample.match(/,/g) ?? []).length],
    [";", (sample.match(/;/g) ?? []).length],
    ["\t", (sample.match(/\t/g) ?? []).length],
    ["|", (sample.match(/\|/g) ?? []).length],
  ] as const;

  return counts.reduce((best, next) => (next[1] > best[1] ? next : best))[0];
}

function inferSampleType(values: unknown[]): string {
  const nonNull = values.filter(
    (value) => value !== null && value !== undefined && value !== "",
  );
  if (nonNull.length === 0) return "string";

  let numbers = 0;
  let booleans = 0;
  let dates = 0;

  for (const value of nonNull) {
    const text = String(value).trim();
    if (text === "true" || text === "false") booleans++;
    else if (text !== "" && !Number.isNaN(Number(text))) numbers++;
    else if (/^\d{4}-\d{2}-\d{2}/.test(text)) dates++;
  }

  const total = nonNull.length;
  if (numbers / total > 0.8) return "number";
  if (booleans / total > 0.8) return "boolean";
  if (dates / total > 0.8) return "date";
  return "string";
}

function buildColumnMetadata(
  columnNames: string[],
  previewRows: Record<string, unknown>[],
) {
  return columnNames.map((name) => {
    const values = previewRows.map((row) => row[name]);
    const nonNull = values.filter(
      (value) => value !== null && value !== undefined && value !== "",
    );
    const type = inferSampleType(values);
    const numericValues = nonNull
      .map((value) => Number(value))
      .filter((value) => !Number.isNaN(value));

    return {
      name,
      type,
      nullCount: values.length - nonNull.length,
      distinctCount: new Set(nonNull.map((value) => String(value))).size,
      min:
        numericValues.length > 0 && type === "number"
          ? Math.min(...numericValues)
          : undefined,
      max:
        numericValues.length > 0 && type === "number"
          ? Math.max(...numericValues)
          : undefined,
      mean:
        numericValues.length > 0 && type === "number"
          ? numericValues.reduce((sum, value) => sum + value, 0) /
            numericValues.length
          : undefined,
      sample: nonNull.slice(0, 5),
    };
  });
}

export async function loadUploadFileToDuckDB(
  file: File,
  options: LoadUploadFileOptions = {},
): Promise<LoadedUploadTable> {
  const ext = getUploadExtension(file);
  const tableName =
    options.tableName?.trim() || sanitizeUploadTableName(file.name);

  if (ext === "csv" || ext === "tsv" || ext === "txt") {
    const delimiter =
      options.delimiter && options.delimiter !== "auto"
        ? options.delimiter
        : await sniffDelimiter(file, ext);
    await loadDelimitedCSVFromFile(
      tableName,
      file,
      delimiter,
      false,
      options.hasHeader ?? true,
    );
  } else if (ext === "json" || ext === "ndjson" || ext === "jsonl") {
    await loadJSONFileToDuckDB(tableName, file);
  } else {
    throw new Error(`Unsupported fast upload file type: .${ext}`);
  }

  if (options.maxRows && options.maxRows > 0) {
    const quotedName = quoteIdentifier(tableName);
    await runQuery(
      `CREATE OR REPLACE TABLE ${quotedName} AS SELECT * FROM ${quotedName} LIMIT ${Math.floor(options.maxRows)}`,
    );
  }

  const info = await getTableInfo(tableName);
  const previewRows = await runQuery(
    `SELECT * FROM ${quoteIdentifier(tableName)} LIMIT ${options.previewLimit ?? 100}`,
  );
  const columnNames = info.columns.map((column) => column.name);

  return {
    tableName,
    format:
      ext === "json" || ext === "ndjson" || ext === "jsonl" ? "json" : "csv",
    rowCount: info.rowCount,
    colCount: info.columns.length,
    columns: buildColumnMetadata(columnNames, previewRows),
    previewRows,
  };
}
