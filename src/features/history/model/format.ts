import {
  Diff,
  GitCommit,
  GitMerge,
  Layers,
  Minus,
  Plus,
  RotateCcw,
  Zap,
} from "lucide-react";
import type { VersionEntry } from "./types";
// ─── Utilities ─────────────────────────────────────────────────────────────

export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

export function formatAge(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d ago`;
  return d.toLocaleDateString();
}

export function typeColor(type: VersionEntry["type"]): string {
  switch (type) {
    case "create":
      return "bg-green-500/20 text-green-300 border-green-500/30";
    case "update":
      return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    case "delete":
      return "bg-red-500/20 text-red-300 border-red-500/30";
    case "restore":
      return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
    case "merge":
      return "bg-purple-500/20 text-purple-300 border-purple-500/30";
    case "transform":
      return "bg-indigo-500/20 text-indigo-300 border-indigo-500/30";
    case "schema":
      return "bg-orange-500/20 text-orange-300 border-orange-500/30";
    default:
      return "bg-muted text-foreground border-border";
  }
}

export function typeIcon(type: VersionEntry["type"]) {
  switch (type) {
    case "create":
      return Plus;
    case "update":
      return Diff;
    case "delete":
      return Minus;
    case "restore":
      return RotateCcw;
    case "merge":
      return GitMerge;
    case "transform":
      return Zap;
    case "schema":
      return Layers;
    default:
      return GitCommit;
  }
}
