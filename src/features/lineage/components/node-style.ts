// ─── Shared lineage node styling ─────────────────────────────────────────────
// Single source of truth for node status colors + per-type styling, consumed by
// the xyflow custom node, the minimap, and the table/detail panels.

import { BarChart3, Database, GitMerge, type LucideIcon, Share2, Zap } from "lucide-react";
import type { LNode } from "../core/types";

export function statusColor(s: LNode["status"]): string {
  switch (s) {
    case "active":
      return "#22c55e";
    case "stale":
      return "#f59e0b";
    case "error":
      return "#ef4444";
    case "pending":
      return "#94a3b8";
    case "running":
      return "#1E40AF";
    default:
      return "#94a3b8";
  }
}

export interface TypeStyle {
  bg: string;
  border: string;
  icon: LucideIcon;
  iconColor: string;
}

export function typeStyle(t: LNode["type"]): TypeStyle {
  switch (t) {
    case "source":
      return {
        bg: "bg-blue-500/15",
        border: "border-blue-500/40",
        icon: Database,
        iconColor: "text-blue-400",
      };
    case "transform":
      return {
        bg: "bg-indigo-500/15",
        border: "border-indigo-500/40",
        icon: Zap,
        iconColor: "text-indigo-400",
      };
    case "model":
      return {
        bg: "bg-purple-500/15",
        border: "border-purple-500/40",
        icon: GitMerge,
        iconColor: "text-purple-400",
      };
    case "output":
      return {
        bg: "bg-emerald-500/15",
        border: "border-emerald-500/40",
        icon: BarChart3,
        iconColor: "text-emerald-400",
      };
    default:
      return {
        bg: "bg-muted",
        border: "border-border",
        icon: Share2,
        iconColor: "text-muted-foreground",
      };
  }
}
