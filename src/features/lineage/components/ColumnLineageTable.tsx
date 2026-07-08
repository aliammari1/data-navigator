"use client";

// ─── ColumnLineageTable — virtualized column-level lineage ────────────────────
//
// Replaces the unvirtualized column table + per-row Framer stagger (`i * 0.04`).
// With real SQL→AST column lineage this can be thousands of rows, so rows are
// virtualized with @tanstack/react-virtual. Node ids are shortened to friendly
// names via a passed-in id→name map.

import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowRight } from "lucide-react";
import { useRef } from "react";
import { columnLineageKey } from "../core/build-lineage";
import type { ColumnLineage, LNode } from "../core/types";

const ROW_HEIGHT = 40;

interface ColumnLineageTableProps {
  columnLineage: ColumnLineage[];
  nodeById: Map<string, LNode>;
}

export function ColumnLineageTable({ columnLineage, nodeById }: ColumnLineageTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowV = useVirtualizer({
    count: columnLineage.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 16,
  });

  const nameOf = (id: string) => nodeById.get(id)?.name ?? id;

  return (
    <div className="rounded-xl border border-border overflow-hidden flex flex-col h-full">
      <div
        className="grid sticky top-0 bg-card z-10 border-b border-border"
        style={{
          gridTemplateColumns: "1.4fr 1fr 32px 1.4fr 1fr 1.4fr",
        }}
      >
        {["Source Node", "Source Column", "", "Target Node", "Target Column", "Transform"].map(
          (h, i) => (
            <div key={h || `sep-${i}`} className="py-2 px-3 text-xs text-muted-foreground">
              {h}
            </div>
          ),
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div style={{ height: rowV.getTotalSize(), position: "relative" }}>
          {rowV.getVirtualItems().map((vrow) => {
            const cl = columnLineage[vrow.index];
            return (
              <div
                key={columnLineageKey(cl)}
                className="grid items-center border-b border-border hover:bg-accent"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: vrow.size,
                  transform: `translateY(${vrow.start}px)`,
                  gridTemplateColumns: "1.4fr 1fr 32px 1.4fr 1fr 1.4fr",
                }}
              >
                <div className="py-2 px-3 text-blue-300 font-mono text-xs truncate">
                  {nameOf(cl.sourceNode)}
                </div>
                <div className="py-2 px-3 text-foreground font-mono text-xs truncate">
                  {cl.sourceCol}
                </div>
                <div className="py-2 px-2 text-muted-foreground">
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
                <div className="py-2 px-3 text-emerald-300 font-mono text-xs truncate">
                  {nameOf(cl.targetNode)}
                </div>
                <div className="py-2 px-3 text-foreground font-mono text-xs truncate">
                  {cl.targetCol}
                </div>
                <div className="py-2 px-3 min-w-0">
                  {cl.transform ? (
                    <code className="text-xs bg-muted text-yellow-300 px-1.5 py-0.5 rounded truncate inline-block max-w-full">
                      {cl.transform}
                    </code>
                  ) : (
                    <span className="text-xs text-muted-foreground">passthrough</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
