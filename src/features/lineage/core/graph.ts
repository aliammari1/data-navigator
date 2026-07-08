import type { ColumnLineage, LEdge, LNode } from "./types";

// ─── Indexing ───────────────────────────────────────────────────────────────
// All traversal/lookup helpers index the graph ONCE into Maps so the screen
// stops doing O(n²)/O(n³) `nodes.find()` scans inside render/selection loops.

// `LineageModel` (with worker-computed `positions`) is defined in `./snapshot`;
// re-exported here so consumers can import graph helpers + the model type
// together.
export type { LineageModel } from "./snapshot";

export function indexNodes(nodes: LNode[]): Map<string, LNode> {
  const map = new Map<string, LNode>();
  for (const n of nodes) map.set(n.id, n);
  return map;
}

export interface Adjacency {
  /** node id → downstream (target) node ids */
  fwd: Map<string, string[]>;
  /** node id → upstream (source) node ids */
  back: Map<string, string[]>;
}

export function buildAdjacency(edges: LEdge[]): Adjacency {
  const fwd = new Map<string, string[]>();
  const back = new Map<string, string[]>();
  for (const e of edges) {
    const f = fwd.get(e.source);
    if (f) f.push(e.target);
    else fwd.set(e.source, [e.target]);
    const b = back.get(e.target);
    if (b) b.push(e.source);
    else back.set(e.target, [e.source]);
  }
  return { fwd, back };
}

/**
 * Breadth-first reachable set from `start` along `adj`, excluding `start`.
 * O(V + E) — replaces the recursive `nodes.find()` walkUp/walkDown.
 */
export function bfs(start: string, adj: Map<string, string[]>): Set<string> {
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    const next = adj.get(id);
    if (!next) continue;
    for (const nx of next) {
      if (!seen.has(nx)) {
        seen.add(nx);
        queue.push(nx);
      }
    }
  }
  seen.delete(start);
  return seen;
}

export interface ImpactNode {
  node: LNode;
  distance: number;
  risk: "high" | "medium" | "low";
}

/**
 * Downstream impact with hop distance, O(V + E) BFS (was recursive find-walk
 * capped at depth 5 with O(n) per-hop lookups). First-visit distance wins.
 */
export function computeImpact(
  rootId: string,
  fwd: Map<string, string[]>,
  nodeById: Map<string, LNode>,
  maxDepth = 8,
): ImpactNode[] {
  const dist = new Map<string, number>([[rootId, 0]]);
  const queue: Array<{ id: string; d: number }> = [{ id: rootId, d: 0 }];
  const out: ImpactNode[] = [];
  while (queue.length > 0) {
    const { id, d } = queue.shift() as { id: string; d: number };
    if (d >= maxDepth) continue;
    for (const nx of fwd.get(id) ?? []) {
      if (dist.has(nx)) continue;
      const nd = d + 1;
      dist.set(nx, nd);
      const node = nodeById.get(nx);
      if (node) {
        out.push({
          node,
          distance: nd,
          risk: nd === 1 ? "high" : nd === 2 ? "medium" : "low",
        });
      }
      queue.push({ id: nx, d: nd });
    }
  }
  return out.sort((a, b) => a.distance - b.distance);
}

// ─── Column lineage indexing ────────────────────────────────────────────────

export interface ColumnIndex {
  incoming: Map<string, ColumnLineage[]>;
  outgoing: Map<string, ColumnLineage[]>;
}

export function indexColumnLineage(columnLineage: ColumnLineage[]): ColumnIndex {
  const incoming = new Map<string, ColumnLineage[]>();
  const outgoing = new Map<string, ColumnLineage[]>();
  for (const cl of columnLineage) {
    const inc = incoming.get(cl.targetNode);
    if (inc) inc.push(cl);
    else incoming.set(cl.targetNode, [cl]);
    const out = outgoing.get(cl.sourceNode);
    if (out) out.push(cl);
    else outgoing.set(cl.sourceNode, [cl]);
  }
  return { incoming, outgoing };
}

/**
 * Walk a single output column back through `incoming` column lineage to expose
 * its full provenance chain. O(chain length); guarded against cycles.
 */
export interface ProvenanceHop {
  node: string;
  column: string;
  transform?: string;
  depth: number;
}

export function traceColumnUpstream(
  targetNode: string,
  targetCol: string,
  incoming: Map<string, ColumnLineage[]>,
  maxDepth = 12,
): ProvenanceHop[] {
  const out: ProvenanceHop[] = [];
  const seen = new Set<string>();
  const queue: Array<{ node: string; col: string; depth: number }> = [
    { node: targetNode, col: targetCol, depth: 0 },
  ];
  while (queue.length > 0) {
    const { node, col, depth } = queue.shift() as {
      node: string;
      col: string;
      depth: number;
    };
    if (depth >= maxDepth) continue;
    for (const cl of incoming.get(node) ?? []) {
      if (cl.targetCol !== col && cl.targetCol !== "*") continue;
      const key = `${cl.sourceNode}:${cl.sourceCol}:${depth}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        node: cl.sourceNode,
        column: cl.sourceCol,
        transform: cl.transform,
        depth: depth + 1,
      });
      queue.push({ node: cl.sourceNode, col: cl.sourceCol, depth: depth + 1 });
    }
  }
  return out;
}
