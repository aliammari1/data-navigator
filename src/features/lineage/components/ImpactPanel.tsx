"use client";

// ─── ImpactPanel — downstream blast-radius ───────────────────────────────────
//
// Uses `computeImpact` (O(V+E) BFS over the forward adjacency map) instead of
// the old recursive `nodes.find()` walk capped at depth 5. Virtualized so a
// wide blast radius doesn't mount hundreds of cards at once.

import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useRef } from "react";
import type { ImpactNode } from "../core/graph";
import type { LNode } from "../core/types";
import { statusColor, typeStyle } from "./node-style";

interface ImpactPanelProps {
  selected: LNode | null;
  impact: ImpactNode[];
}

export function ImpactPanel({ selected, impact }: ImpactPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowV = useVirtualizer({
    count: impact.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 96,
    overscan: 8,
  });

  if (!selected) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <AlertTriangle className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-lg">Select a node in the graph to see impact analysis</p>
        <p className="text-sm mt-1 text-muted-foreground">
          Click any node on the Graph tab, then switch here
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-full">
      <div className="bg-card border border-border rounded-xl p-4 mb-4 shrink-0">
        <h2 className="text-base font-bold text-foreground mb-1 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-400" />
          Impact Analysis: <span className="font-mono text-indigo-300">{selected.name}</span>
        </h2>
        <p className="text-sm text-muted-foreground">
          If <strong className="text-foreground">{selected.name}</strong> changes or fails, the
          following {impact.length} downstream node
          {impact.length === 1 ? "" : "s"} would be affected:
        </p>
      </div>

      {impact.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <CheckCircle2 className="w-8 h-8 mb-2 mx-auto text-green-400" />
          No downstream impact — this is a terminal node
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <div style={{ height: rowV.getTotalSize(), position: "relative" }}>
            {rowV.getVirtualItems().map((vrow) => {
              const item = impact[vrow.index];
              const st = typeStyle(item.node.type);
              const Icon = st.icon;
              return (
                <div
                  key={item.node.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vrow.start}px)`,
                    paddingBottom: 8,
                  }}
                >
                  <div
                    className={`bg-card border rounded-xl p-4 ${
                      item.risk === "high"
                        ? "border-red-500/30"
                        : item.risk === "medium"
                          ? "border-yellow-500/30"
                          : "border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className={`w-4 h-4 shrink-0 ${st.iconColor}`} />
                        <span className="text-foreground font-mono font-semibold truncate">
                          {item.node.name}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          ({item.node.type})
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                            item.risk === "high"
                              ? "bg-red-500/20 text-red-300"
                              : item.risk === "medium"
                                ? "bg-yellow-500/20 text-yellow-300"
                                : "bg-muted text-foreground"
                          }`}
                        >
                          {item.risk} risk
                        </span>
                        <span className="text-xs text-muted-foreground">
                          +{item.distance} hop{item.distance > 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                      {item.node.description}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>
                        Owner: <span className="text-foreground">{item.node.owner}</span>
                      </span>
                      <span
                        className="w-2 h-2 rounded-full inline-block"
                        style={{ backgroundColor: statusColor(item.node.status) }}
                      />
                      <span className="text-foreground">{item.node.status}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
