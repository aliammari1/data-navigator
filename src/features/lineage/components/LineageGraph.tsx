"use client";

// ─── LineageGraph — @xyflow/react renderer ───────────────────────────────────
//
// Replaces the hand-rolled SVG canvas + manual React-state pan/zoom. xyflow
// renders only on/near-screen nodes (`onlyRenderVisibleElements`), pans/zooms
// via GPU CSS transforms (no React re-render per frame), and ships a minimap.
// Positions arrive PRE-COMPUTED from the lineage worker (ELK) — no layout math
// here; nodes are not draggable so the authoritative layout stays stable.

import {
  Background,
  Controls,
  type Edge,
  MarkerType,
  MiniMap,
  type Node,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import type { LineageModel } from "../core/snapshot";
import type { LNode } from "../core/types";
import { LineageNode, type LineageNodeData } from "./LineageNode";
import { statusColor } from "./node-style";

const nodeTypes = { lineage: LineageNode };

interface LineageGraphProps {
  model: LineageModel;
  selectedId: string | null;
  /** ids on the upstream/downstream highlight path of the selection */
  highlighted: Set<string> | null;
  onSelect: (node: LNode | null) => void;
}

export function LineageGraph({ model, selectedId, highlighted, onSelect }: LineageGraphProps) {
  const nodeById = useMemo(() => {
    const m = new Map<string, LNode>();
    for (const n of model.nodes) m.set(n.id, n);
    return m;
  }, [model.nodes]);

  const nodes: Node[] = useMemo(
    () =>
      model.nodes.map((n) => {
        const highlight: LineageNodeData["highlight"] = !highlighted
          ? "neutral"
          : n.id === selectedId
            ? "selected"
            : highlighted.has(n.id)
              ? "on-path"
              : "none";
        return {
          id: n.id,
          type: "lineage",
          position: model.positions[n.id] ?? { x: 0, y: 0 },
          data: { node: n, highlight } satisfies LineageNodeData,
          selectable: true,
          draggable: false,
        };
      }),
    [model.nodes, model.positions, selectedId, highlighted],
  );

  const edges: Edge[] = useMemo(
    () =>
      model.edges.map((e) => {
        const onPath =
          !highlighted ||
          e.source === selectedId ||
          e.target === selectedId ||
          (highlighted.has(e.source) && highlighted.has(e.target));
        const stroke =
          e.type === "streaming" ? "#1E40AF" : e.type === "partial" ? "#f59e0b" : "#334155";
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          animated: e.type === "streaming",
          label: e.label,
          labelStyle: { fill: "#64748b", fontSize: 9 },
          labelBgStyle: { fill: "var(--card, #0f172a)" },
          style: {
            stroke: onPath ? stroke : "#334155",
            strokeWidth: onPath ? 2 : 1.25,
            strokeDasharray: e.type === "partial" ? "5 3" : undefined,
            opacity: onPath ? 1 : 0.35,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: onPath ? stroke : "#334155",
          },
        };
      }),
    [model.edges, selectedId, highlighted],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onlyRenderVisibleElements
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.2}
      maxZoom={2}
      nodesDraggable={false}
      colorMode="dark"
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_, node) => {
        const hit = nodeById.get(node.id) ?? null;
        onSelect(hit && hit.id === selectedId ? null : hit);
      }}
      onPaneClick={() => onSelect(null)}
    >
      <Background gap={24} />
      <Controls />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) => statusColor((n.data as LineageNodeData).node.status)}
      />
    </ReactFlow>
  );
}
