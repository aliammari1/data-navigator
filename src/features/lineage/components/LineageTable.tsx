"use client";

// ─── LineageTable — virtualized node table ───────────────────────────────────
//
// Replaces the unvirtualized <table> + per-row Framer Motion stagger
// (`idx * 0.02`) that thrashed layout on large workspaces. Rows are virtualized
// with @tanstack/react-virtual so only on-screen rows mount.

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import type { LNode } from "../core/types";
import { statusColor, typeStyle } from "./node-style";

const ROW_HEIGHT = 44;

interface LineageTableProps {
  nodes: LNode[];
  onSelect: (node: LNode) => void;
}

const COLUMNS = ["Node", "Type", "Status", "Rows", "Columns", "Quality", "Owner", "Updated"];

export function LineageTable({ nodes, onSelect }: LineageTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowV = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  return (
    <div className="flex-1 overflow-hidden rounded-xl border border-border flex flex-col">
      {/* Header (grid keeps columns aligned with virtualized rows) */}
      <div
        className="grid sticky top-0 bg-card z-10 border-b border-border"
        style={{
          gridTemplateColumns: "minmax(180px,2fr) 1fr 1fr 1fr 0.8fr 1.2fr 1fr 1fr",
        }}
      >
        {COLUMNS.map((h) => (
          <div key={h} className="py-3 px-4 text-xs font-semibold text-muted-foreground">
            {h}
          </div>
        ))}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div style={{ height: rowV.getTotalSize(), position: "relative" }}>
          {rowV.getVirtualItems().map((vrow) => {
            const node = nodes[vrow.index];
            const st = typeStyle(node.type);
            const Icon = st.icon;
            return (
              <button
                type="button"
                key={node.id}
                onClick={() => onSelect(node)}
                className="grid items-center text-left border-b border-border hover:bg-accent cursor-pointer transition-colors w-full"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: vrow.size,
                  transform: `translateY(${vrow.start}px)`,
                  gridTemplateColumns: "minmax(180px,2fr) 1fr 1fr 1fr 0.8fr 1.2fr 1fr 1fr",
                }}
              >
                <div className="py-2 px-4 flex items-center gap-2 min-w-0">
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${st.iconColor}`} />
                  <span className="text-foreground font-mono text-sm truncate">{node.name}</span>
                </div>
                <div className="py-2 px-4">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${st.bg} ${st.iconColor}`}>
                    {node.type}
                  </span>
                </div>
                <div className="py-2 px-4 flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full inline-block"
                    style={{ backgroundColor: statusColor(node.status) }}
                  />
                  <span className="text-xs text-foreground">{node.status}</span>
                </div>
                <div className="py-2 px-4 text-foreground font-mono text-sm">
                  {node.rowCount > 0 ? node.rowCount.toLocaleString() : "—"}
                </div>
                <div className="py-2 px-4 text-foreground font-mono text-sm">
                  {node.colCount > 0 ? node.colCount : "—"}
                </div>
                <div className="py-2 px-4">
                  {node.quality > 0 ? (
                    <div className="flex items-center gap-1.5">
                      <div className="w-12 h-1.5 bg-accent rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${node.quality * 100}%`,
                            backgroundColor:
                              node.quality >= 0.9
                                ? "#22c55e"
                                : node.quality >= 0.7
                                  ? "#f59e0b"
                                  : "#ef4444",
                          }}
                        />
                      </div>
                      <span className="text-xs font-mono text-foreground">
                        {(node.quality * 100).toFixed(0)}%
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                <div className="py-2 px-4 text-muted-foreground text-xs truncate">{node.owner}</div>
                <div className="py-2 px-4 text-muted-foreground text-xs truncate">
                  {node.lastUpdated}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
