"use client";

// ─── LineageNode — memoized @xyflow/react custom node ─────────────────────────
//
// Ports the old absolutely-positioned `motion.div` NodeCard into an xyflow
// custom node. Memoized so selection/highlight changes elsewhere don't re-render
// every node; the dimmed/highlighted state is applied via CSS classes (NOT a
// per-render Framer `animate`) so non-selected nodes never re-run animation.
//
// Handles: target on the LEFT, source on the RIGHT — matches the ELK
// `elk.direction: RIGHT` layout so edges anchor to the correct sides.

import { Handle, type NodeProps, Position } from "@xyflow/react";
import { BarChart3, Database, GitMerge, Share2, Zap } from "lucide-react";
import { memo } from "react";
import type { LNode } from "../core/types";
import { statusColor, typeStyle } from "./node-style";

const ICONS = {
  source: Database,
  transform: Zap,
  model: GitMerge,
  output: BarChart3,
  external: Share2,
} as const;

export interface LineageNodeData extends Record<string, unknown> {
  node: LNode;
  /** "none" → dimmed (not on the highlight path), "selected" → ring */
  highlight: "selected" | "on-path" | "none" | "neutral";
}

function LineageNodeImpl({ data }: NodeProps) {
  const { node, highlight } = data as LineageNodeData;
  const style = typeStyle(node.type);
  const Icon = ICONS[node.type];
  const dimmed = highlight === "none";
  const selected = highlight === "selected";

  return (
    <div
      className={`rounded-xl border select-none transition-shadow ${style.bg} ${style.border} ${
        selected
          ? "ring-2 ring-indigo-400 shadow-lg shadow-indigo-500/25"
          : "hover:shadow-md hover:shadow-black/30"
      } ${dimmed ? "opacity-35" : "opacity-100"}`}
      style={{ width: 200 }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="bg-slate-600! border-0! w-2! h-2!"
      />
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <div className={`p-1 rounded ${style.bg}`}>
            <Icon className={`w-3.5 h-3.5 ${style.iconColor}`} />
          </div>
          <span className="text-xs font-bold text-foreground truncate flex-1">{node.name}</span>
          <span
            className="w-2 h-2 rounded-full shrink-0 inline-block"
            style={{ backgroundColor: statusColor(node.status) }}
          />
        </div>
        <div className="text-xs text-muted-foreground mb-2 truncate">{node.subtype}</div>
        <div className="flex items-center gap-2 text-xs">
          {node.rowCount > 0 && (
            <span className="text-foreground font-mono">{node.rowCount.toLocaleString()}r</span>
          )}
          {node.colCount > 0 && <span className="text-muted-foreground">{node.colCount}c</span>}
          {node.duration && (
            <span
              className={`ml-auto font-mono ${node.duration === "ERR" ? "text-red-400" : "text-muted-foreground"}`}
            >
              {node.duration}
            </span>
          )}
        </div>
        {node.quality > 0 && (
          <div className="mt-2 h-1 bg-accent rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${node.quality * 100}%`,
                backgroundColor:
                  node.quality >= 0.9 ? "#22c55e" : node.quality >= 0.7 ? "#f59e0b" : "#ef4444",
              }}
            />
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="bg-slate-600! border-0! w-2! h-2!"
      />
    </div>
  );
}

export const LineageNode = memo(LineageNodeImpl);
