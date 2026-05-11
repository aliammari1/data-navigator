import {
  Check,
  File,
  FileJson,
  FileSpreadsheet,
  FileText,
  Loader2,
  X,
} from "lucide-react";
import type { ColMeta } from "@/core/stores/data-store";
import { cn } from "@/shared/utils";
import type { ColumnInfo, FileType } from "./types";
// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

export function detectFileType(name: string): FileType {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, FileType> = {
    csv: "csv",
    tsv: "tsv",
    txt: "csv",
    json: "json",
    xlsx: "xlsx",
    xls: "xlsx",
    parquet: "parquet",
  };
  return map[ext] ?? "unknown";
}

export function getFileIcon(type: FileType) {
  switch (type) {
    case "csv":
    case "tsv":
      return <FileText className="h-5 w-5 text-emerald-400" />;
    case "json":
      return <FileJson className="h-5 w-5 text-blue-400" />;
    case "xlsx":
      return <FileSpreadsheet className="h-5 w-5 text-green-400" />;
    default:
      return <File className="h-5 w-5 text-zinc-400" />;
  }
}

export function inferColumnType(values: unknown[]): ColumnInfo["type"] {
  const nonNull = values.filter(
    (v) => v !== null && v !== undefined && v !== "",
  );
  if (nonNull.length === 0) return "string";
  let numCount = 0,
    dateCount = 0,
    boolCount = 0;
  for (const v of nonNull) {
    const s = String(v).trim();
    if (s === "true" || s === "false") boolCount++;
    else if (!Number.isNaN(Number(s)) && s !== "") numCount++;
    else if (/^\d{4}-\d{2}-\d{2}/.test(s)) dateCount++;
  }
  const total = nonNull.length;
  if (numCount / total > 0.8) return "number";
  if (dateCount / total > 0.8) return "date";
  if (boolCount / total > 0.8) return "boolean";
  return "string";
}

export function computeColumnStats(
  name: string,
  values: unknown[],
): ColumnInfo {
  const nonNull = values.filter(
    (v) => v !== null && v !== undefined && v !== "",
  );
  const type = inferColumnType(values);
  const nullCount = values.length - nonNull.length;
  const uniqueSet = new Set(nonNull.map((v) => String(v)));
  const info: ColumnInfo = {
    name,
    type,
    nullCount,
    uniqueCount: uniqueSet.size,
    sampleValues: nonNull.slice(0, 5),
  };
  if (type === "number") {
    const nums = nonNull.map((v) => Number(v)).filter((n) => !Number.isNaN(n));
    if (nums.length > 0) {
      info.min = nums.reduce((a, b) => (a < b ? a : b));
      info.max = nums.reduce((a, b) => (a > b ? a : b));
      info.avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    }
  }
  return info;
}

export function computeQualityScores(columns: ColumnInfo[], rowCount: number) {
  if (rowCount === 0)
    return {
      completeness: 100,
      accuracy: 100,
      consistency: 100,
      uniqueness: 100,
    };
  const totalCells = columns.length * rowCount;
  const nullCells = columns.reduce((a, c) => a + c.nullCount, 0);
  const completeness = Math.round(
    ((totalCells - nullCells) / totalCells) * 100,
  );
  const accuracy = Math.round(
    (columns.reduce((acc, c) => acc + (rowCount - c.nullCount > 0 ? 1 : 0), 0) /
      columns.length) *
      100,
  );
  const mixedCols = columns.filter((c) => c.type === "mixed").length;
  const consistency = Math.round(
    (1 - mixedCols / Math.max(1, columns.length)) * 100,
  );
  const avgUnique =
    columns.reduce(
      (acc, c) => acc + Math.min(1, c.uniqueCount / Math.max(1, rowCount)),
      0,
    ) / Math.max(1, columns.length);
  const uniqueness = Math.round(avgUnique * 100);
  return { completeness, accuracy, consistency, uniqueness };
}

export function columnInfoToColMeta(columns: ColumnInfo[]): ColMeta[] {
  return columns.map((column) => ({
    name: column.name,
    type:
      column.type === "mixed"
        ? "string"
        : column.type === "boolean"
          ? "boolean"
          : column.type,
    nullCount: column.nullCount,
    distinctCount: column.uniqueCount,
    min: column.min,
    max: column.max,
    mean: column.avg,
    sample: column.sampleValues.slice(0, 5),
  }));
}

export function StatusStep({
  label,
  status,
  duration,
}: {
  label: string;
  status: "pending" | "active" | "done" | "error";
  duration?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "h-5 w-5 rounded-full flex items-center justify-center flex-none",
          status === "pending" && "bg-zinc-800 border border-zinc-700",
          status === "active" && "bg-blue-500/20 border border-blue-500/50",
          status === "done" && "bg-emerald-500/20 border border-emerald-500/50",
          status === "error" && "bg-red-500/20 border border-red-500/50",
        )}
      >
        {status === "active" && (
          <Loader2 className="h-3 w-3 text-blue-400 animate-spin" />
        )}
        {status === "done" && <Check className="h-3 w-3 text-emerald-400" />}
        {status === "error" && <X className="h-3 w-3 text-red-400" />}
        {status === "pending" && (
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
        )}
      </div>
      <span
        className={cn(
          "text-xs",
          status === "pending" && "text-zinc-600",
          status === "active" && "text-blue-300",
          status === "done" && "text-zinc-300",
          status === "error" && "text-red-300",
        )}
      >
        {label}
      </span>
      {duration !== undefined && status === "done" && (
        <span className="text-[10px] text-zinc-600 ml-auto">{duration}ms</span>
      )}
    </div>
  );
}
