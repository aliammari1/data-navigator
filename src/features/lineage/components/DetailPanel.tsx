"use client";

// ─── DetailPanel — selected-node sidebar ─────────────────────────────────────
//
// Extracted from the old monolith. Uses the pre-built id→node Map and the
// column-lineage index (O(1) lookups, no `nodes.find()` scans). Adds the
// §4.5 "trace column upstream" provenance walk — the single most valuable
// lineage UX, now possible because real column lineage exists.

import { ArrowRight, ChevronRight, X } from "lucide-react";
import { useMemo, useState } from "react";
import { columnLineageKey } from "../core/build-lineage";
import type { ColumnIndex } from "../core/graph";
import { traceColumnUpstream } from "../core/graph";
import type { LNode } from "../core/types";
import { statusColor, typeStyle } from "./node-style";

interface DetailPanelProps {
  node: LNode;
  nodeById: Map<string, LNode>;
  colIndex: ColumnIndex;
  onSelect: (node: LNode) => void;
  onClose: () => void;
}

type DetailTab = "info" | "upstreams" | "downstreams" | "columns";

export function DetailPanel({ node, nodeById, colIndex, onSelect, onClose }: DetailPanelProps) {
  const [tab, setTab] = useState<DetailTab>("info");
  const [traceCol, setTraceCol] = useState<string | null>(null);

  const incoming = colIndex.incoming.get(node.id) ?? [];
  const outgoing = colIndex.outgoing.get(node.id) ?? [];

  const trace = useMemo(() => {
    if (!traceCol) return [];
    return traceColumnUpstream(node.id, traceCol, colIndex.incoming);
  }, [traceCol, node.id, colIndex.incoming]);

  const nameOf = (id: string) => nodeById.get(id)?.name ?? id;

  return (
    <div className="border-l border-border bg-card overflow-y-auto shrink-0 w-80">
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ backgroundColor: statusColor(node.status) }}
              />
              <h3 className="text-base font-bold text-foreground">{node.name}</h3>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {node.subtype} · {node.type}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-1 mb-3">
          {(["info", "upstreams", "downstreams", "columns"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 py-1 text-xs rounded-lg transition-all ${
                tab === t
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "info" && (
          <div className="space-y-3">
            <p className="text-xs text-foreground">{node.description}</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  l: "Rows",
                  v: node.rowCount > 0 ? node.rowCount.toLocaleString() : "N/A",
                },
                {
                  l: "Columns",
                  v: node.colCount > 0 ? String(node.colCount) : "N/A",
                },
                { l: "Owner", v: node.owner },
                { l: "Updated", v: node.lastUpdated },
                { l: "Duration", v: node.duration ?? "—" },
                {
                  l: "Quality",
                  v: node.quality > 0 ? `${(node.quality * 100).toFixed(0)}%` : "—",
                },
              ].map((item) => (
                <div key={item.l} className="bg-muted rounded-lg p-2">
                  <div className="text-xs text-muted-foreground">{item.l}</div>
                  <div className="text-sm font-mono text-foreground mt-0.5 truncate">{item.v}</div>
                </div>
              ))}
            </div>
            {node.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {node.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "upstreams" && (
          <NeighborList
            ids={node.upstreams}
            nodeById={nodeById}
            empty="No upstream dependencies"
            onSelect={onSelect}
          />
        )}

        {tab === "downstreams" && (
          <NeighborList
            ids={node.downstreams}
            nodeById={nodeById}
            empty="No downstream consumers"
            onSelect={onSelect}
          />
        )}

        {tab === "columns" && (
          <div className="space-y-3">
            {incoming.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-2">
                  Incoming column lineage
                </div>
                <div className="space-y-1.5">
                  {incoming.map((cl) => (
                    <div key={columnLineageKey(cl)} className="bg-muted rounded-lg p-2 text-xs">
                      <div className="flex items-center gap-1 text-foreground">
                        <span className="font-mono text-blue-300">{cl.sourceCol}</span>
                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        <span className="font-mono text-foreground">{cl.targetCol}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setTraceCol(traceCol === cl.targetCol ? null : cl.targetCol)
                          }
                          className="ml-auto text-[10px] text-indigo-300 hover:text-indigo-200 flex items-center gap-0.5"
                          title="Trace this column upstream"
                        >
                          trace
                          <ChevronRight
                            className={`w-3 h-3 transition-transform ${traceCol === cl.targetCol ? "rotate-90" : ""}`}
                          />
                        </button>
                      </div>
                      {cl.transform && (
                        <div className="text-yellow-300/90 mt-0.5 font-mono truncate">
                          {cl.transform}
                        </div>
                      )}
                      <div className="text-muted-foreground mt-0.5 truncate">
                        from: {nameOf(cl.sourceNode)}
                      </div>
                      {traceCol === cl.targetCol && trace.length > 0 && (
                        <div className="mt-1.5 border-l-2 border-indigo-500/40 pl-2 space-y-1">
                          {trace.map((hop) => (
                            <div
                              key={`${hop.node}:${hop.column}:${hop.depth}`}
                              className="text-[11px] text-muted-foreground"
                            >
                              <span className="text-muted-foreground">↑{hop.depth}</span>{" "}
                              <span className="font-mono text-blue-300">{hop.column}</span>{" "}
                              <span className="text-muted-foreground/70">@ {nameOf(hop.node)}</span>
                              {hop.transform && (
                                <span className="font-mono text-yellow-300/80">
                                  {" "}
                                  · {hop.transform}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {outgoing.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-2">
                  Outgoing column lineage
                </div>
                <div className="space-y-1.5">
                  {outgoing.map((cl) => (
                    <div key={columnLineageKey(cl)} className="bg-muted rounded-lg p-2 text-xs">
                      <div className="flex items-center gap-1 text-foreground">
                        <span className="font-mono text-foreground">{cl.sourceCol}</span>
                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        <span className="font-mono text-emerald-300">{cl.targetCol}</span>
                      </div>
                      <div className="text-muted-foreground mt-0.5 truncate">
                        to: {nameOf(cl.targetNode)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {incoming.length === 0 && outgoing.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">
                No column lineage tracked for this node
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function NeighborList({
  ids,
  nodeById,
  empty,
  onSelect,
}: {
  ids: string[];
  nodeById: Map<string, LNode>;
  empty: string;
  onSelect: (node: LNode) => void;
}) {
  if (ids.length === 0) {
    return <div className="text-xs text-muted-foreground text-center py-4">{empty}</div>;
  }
  return (
    <div className="space-y-2">
      {ids.map((id) => {
        const n = nodeById.get(id);
        if (!n) return null;
        const st = typeStyle(n.type);
        const Icon = st.icon;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(n)}
            className={`w-full text-left p-2.5 rounded-xl border transition-colors ${st.bg} ${st.border} hover:opacity-80`}
          >
            <div className="flex items-center gap-2">
              <Icon className={`w-3.5 h-3.5 ${st.iconColor}`} />
              <span className="text-sm text-foreground truncate">{n.name}</span>
              <span
                className="w-2 h-2 rounded-full inline-block ml-auto"
                style={{ backgroundColor: statusColor(n.status) }}
              />
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {n.rowCount > 0 ? `${n.rowCount.toLocaleString()} rows` : n.type}
            </div>
          </button>
        );
      })}
    </div>
  );
}
