import { Database, File, FileSpreadsheet, Folder, Hash } from "lucide-react";
import type { ComponentType } from "react";
import type { NodeType } from "../types";

export function formatBytes(b: number): string {
  if (b === 0) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function formatAge(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d ago`;
  return d.toLocaleDateString();
}

export interface FileTypeStyle {
  icon: ComponentType<{ className?: string }>;
  color: string;
  bg: string;
}

export function fileTypeStyle(type: NodeType): FileTypeStyle {
  switch (type) {
    case "folder":
      return { icon: Folder, color: "text-yellow-400", bg: "bg-yellow-500/15" };
    case "csv":
    case "tsv":
    case "txt":
      return {
        icon: FileSpreadsheet,
        color: "text-green-400",
        bg: "bg-green-500/15",
      };
    case "excel":
      return {
        icon: FileSpreadsheet,
        color: "text-emerald-400",
        bg: "bg-emerald-500/15",
      };
    case "parquet":
    case "pq":
      return {
        icon: Database,
        color: "text-indigo-400",
        bg: "bg-indigo-500/15",
      };
    case "duckdb":
      return {
        icon: Database,
        color: "text-purple-400",
        bg: "bg-purple-500/15",
      };
    case "sql":
      return { icon: Hash, color: "text-orange-400", bg: "bg-orange-500/15" };
    default:
      return { icon: File, color: "text-muted-foreground", bg: "bg-muted" };
  }
}

export function qualityColor(q: number): string {
  if (q >= 0.9) return "#22c55e";
  if (q >= 0.7) return "#f59e0b";
  return "#ef4444";
}

/** Palette offered by the folder "Set color" submenu. */
export const FOLDER_COLORS: { name: string; value: string }[] = [
  { name: "Bleu", value: "#1E40AF" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Vert", value: "#22c55e" },
  { name: "Ambre", value: "#f59e0b" },
  { name: "Rouge", value: "#ef4444" },
  { name: "Violet", value: "#a855f7" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Rose", value: "#ec4899" },
];
