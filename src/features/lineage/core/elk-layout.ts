// ─── ELK layered DAG layout (worker-side, offline) ───────────────────────────
//
// Replaces the hand-rolled O(n²) `computeLayout` and the deprecated `dagre`
// dependency with elkjs (0.11.1, installed). elkjs is pure JS (GWT-compiled,
// zero wasm/assets/network) and runs SYNCHRONOUSLY inside our own Comlink
// worker — we import `elk.bundled.js` and do NOT pass `workerUrl`/`workerFactory`
// (which would spawn ELK's own nested worker and hit the `_Worker is not a
// constructor` / pnpm-hoist path bugs).
//
// elkjs handles layer assignment, ordering, crossing minimization and cycles
// far better than the old topological column assignment.

import ELK from "elkjs/lib/elk.bundled.js";
import type { LEdge, LNode } from "./types";

export const LINEAGE_NODE_WIDTH = 200;
export const LINEAGE_NODE_HEIGHT = 96;

// A single ELK instance is reused across layout calls inside the worker.
const elk = new ELK();

interface ElkChild {
  id: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
}

interface ElkGraph {
  id: string;
  layoutOptions: Record<string, string>;
  children: ElkChild[];
  edges: Array<{ id: string; sources: string[]; targets: string[] }>;
}

interface ElkLaidGraph {
  children?: Array<{ id: string; x?: number; y?: number }>;
}

function toElkGraph(nodes: LNode[], edges: LEdge[]): ElkGraph {
  const nodeIds = new Set(nodes.map((n) => n.id));
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.layered.spacing.nodeNodeBetweenLayers": "120",
      "elk.spacing.nodeNode": "40",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      // Keep disconnected components from stacking on top of each other.
      "elk.layered.spacing.baseValue": "40",
      "elk.separateConnectedComponents": "true",
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: LINEAGE_NODE_WIDTH,
      height: LINEAGE_NODE_HEIGHT,
    })),
    // ELK throws on edges that reference unknown nodes — filter dangling edges.
    edges: edges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
}

function fromElkGraph(g: ElkLaidGraph): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  for (const c of g.children ?? []) {
    positions[c.id] = { x: c.x ?? 0, y: c.y ?? 0 };
  }
  return positions;
}

/**
 * Lay out the graph with ELK. Async (elk.layout returns a Promise); awaited by
 * the worker before returning positions. xyflow positions nodes by their
 * top-left corner and ELK already returns top-left coords, so no shift is
 * needed.
 */
export async function layoutGraph(
  nodes: LNode[],
  edges: LEdge[],
): Promise<Record<string, { x: number; y: number }>> {
  if (nodes.length === 0) return {};
  try {
    const laid = (await elk.layout(toElkGraph(nodes, edges))) as ElkLaidGraph;
    return fromElkGraph(laid);
  } catch {
    // ELK should not fail on a well-formed DAG, but never let layout break the
    // feature — fall back to a deterministic grid so nodes are still placed.
    return gridLayout(nodes);
  }
}

/** Deterministic grid fallback (no overlap) if ELK throws. */
function gridLayout(nodes: LNode[]): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const perRow = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  nodes.forEach((n, i) => {
    positions[n.id] = {
      x: (i % perRow) * (LINEAGE_NODE_WIDTH + 60),
      y: Math.floor(i / perRow) * (LINEAGE_NODE_HEIGHT + 60),
    };
  });
  return positions;
}
