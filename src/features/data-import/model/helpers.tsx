import {
  Check,
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
  // `.txt` stays `unknown` on purpose: it is ambiguous (it can be a pipe/tab
  // export or free text), and the import pipeline detects its real dialect at
  // read time. CSV/TSV/Parquet are unambiguous and labelled directly.
  const map: Record<string, FileType> = {
    csv: "csv",
    tsv: "tsv",
    parquet: "parquet",
    pq: "parquet",
  };
  return map[ext] ?? "unknown";
}

export function getFileIcon(_type: FileType) {
  return <FileText className="h-5 w-5 text-emerald-400" />;
}

/**
 * Per-column null fraction (0..1).
 *
 * Prefers the full-table `nullRate` from DuckDB SUMMARIZE when present, and
 * falls back to `nullCount / rowCount` (preview sample) otherwise.
 */
function columnNullRate(column: ColumnInfo, rowCount: number): number {
  if (typeof column.nullRate === "number") {
    return Math.min(1, Math.max(0, column.nullRate));
  }
  return Math.min(1, column.nullCount / Math.max(1, rowCount));
}

export function computeQualityScores(columns: ColumnInfo[], rowCount: number) {
  if (rowCount === 0 || columns.length === 0)
    return {
      completeness: 100,
      accuracy: 100,
      consistency: 100,
      uniqueness: 100,
    };

  const completeness = Math.round(
    (1 -
      columns.reduce((acc, c) => acc + columnNullRate(c, rowCount), 0) /
        columns.length) *
      100,
  );

  // A column is "usable" when it has at least one non-null value.
  const accuracy = Math.round(
    (columns.reduce(
      (acc, c) => acc + (columnNullRate(c, rowCount) < 1 ? 1 : 0),
      0,
    ) /
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
