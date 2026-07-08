import { describe, expect, it } from "vitest";
import {
  bfs,
  buildAdjacency,
  computeImpact,
  indexColumnLineage,
  indexNodes,
  traceColumnUpstream,
} from "@/features/lineage/core/graph";
import type { ColumnLineage, LEdge, LNode } from "@/features/lineage/core/types";

function node(id: string): LNode {
  return {
    id,
    name: id,
    type: "source",
    subtype: "test",
    status: "active",
    rowCount: 0,
    colCount: 0,
    owner: "test",
    description: "",
    quality: 1,
    tags: [],
    lastUpdated: "now",
    upstreams: [],
    downstreams: [],
  };
}

function edge(source: string, target: string): LEdge {
  return { id: `${source}->${target}`, source, target, type: "full" };
}

describe("indexNodes", () => {
  it("returns an empty map for no nodes", () => {
    expect(indexNodes([]).size).toBe(0);
  });

  it("indexes nodes by id for O(1) lookup", () => {
    const map = indexNodes([node("a"), node("b")]);
    expect(map.get("a")?.id).toBe("a");
    expect(map.get("missing")).toBeUndefined();
    expect(map.size).toBe(2);
  });

  it("keeps the last node when ids collide", () => {
    const first = node("dup");
    const second = { ...node("dup"), name: "winner" };
    const map = indexNodes([first, second]);
    expect(map.get("dup")?.name).toBe("winner");
  });
});

describe("buildAdjacency", () => {
  it("returns empty forward/back maps for no edges", () => {
    const { fwd, back } = buildAdjacency([]);
    expect(fwd.size).toBe(0);
    expect(back.size).toBe(0);
  });

  it("records downstream targets in fwd and upstream sources in back", () => {
    const { fwd, back } = buildAdjacency([edge("a", "b"), edge("a", "c")]);
    expect(fwd.get("a")).toEqual(["b", "c"]);
    expect(back.get("b")).toEqual(["a"]);
    expect(back.get("c")).toEqual(["a"]);
  });

  it("accumulates multiple parents for a fan-in target", () => {
    const { back } = buildAdjacency([edge("a", "z"), edge("b", "z")]);
    expect(back.get("z")).toEqual(["a", "b"]);
  });
});

describe("bfs", () => {
  it("returns an empty set for an isolated start node", () => {
    const { fwd } = buildAdjacency([edge("a", "b")]);
    expect(bfs("z", fwd).size).toBe(0);
  });

  it("collects all forward-reachable nodes, excluding the start", () => {
    const { fwd } = buildAdjacency([edge("a", "b"), edge("b", "c"), edge("c", "d")]);
    const reached = bfs("a", fwd);
    expect([...reached].sort()).toEqual(["b", "c", "d"]);
    expect(reached.has("a")).toBe(false);
  });

  it("walks upstream when given the back adjacency", () => {
    const { back } = buildAdjacency([edge("a", "b"), edge("b", "c")]);
    expect([...bfs("c", back).values()].sort()).toEqual(["a", "b"]);
  });

  it("terminates on cycles without revisiting nodes", () => {
    const { fwd } = buildAdjacency([edge("a", "b"), edge("b", "c"), edge("c", "a")]);
    const reached = bfs("a", fwd);
    // a → b → c → (back to a, already seen) ; start excluded from the result
    expect([...reached].sort()).toEqual(["b", "c"]);
  });
});

describe("computeImpact", () => {
  it("returns no impact when the root has no downstream nodes", () => {
    const { fwd } = buildAdjacency([edge("a", "b")]);
    const byId = indexNodes([node("a"), node("b")]);
    expect(computeImpact("leaf", fwd, byId)).toEqual([]);
  });

  it("assigns hop distance and risk tiers by distance", () => {
    const edges = [edge("root", "h1"), edge("h1", "h2"), edge("h2", "h3")];
    const { fwd } = buildAdjacency(edges);
    const byId = indexNodes(["root", "h1", "h2", "h3"].map(node));
    const impact = computeImpact("root", fwd, byId);

    expect(impact.map((i) => i.node.id)).toEqual(["h1", "h2", "h3"]);
    expect(impact.map((i) => i.distance)).toEqual([1, 2, 3]);
    expect(impact.map((i) => i.risk)).toEqual(["high", "medium", "low"]);
  });

  it("keeps the first-visit (shortest) distance for diamond fan-in", () => {
    // root → a → c and root → c (direct). c should be distance 1, not 2.
    const edges = [edge("root", "a"), edge("a", "c"), edge("root", "c")];
    const { fwd } = buildAdjacency(edges);
    const byId = indexNodes(["root", "a", "c"].map(node));
    const impact = computeImpact("root", fwd, byId);
    const c = impact.find((i) => i.node.id === "c");
    expect(c?.distance).toBe(1);
  });

  it("respects maxDepth and stops expanding beyond it", () => {
    const edges = [edge("root", "a"), edge("a", "b"), edge("b", "c")];
    const { fwd } = buildAdjacency(edges);
    const byId = indexNodes(["root", "a", "b", "c"].map(node));
    const impact = computeImpact("root", fwd, byId, 2);
    // depth 0 expands to a(1); depth 1 expands to b(2); depth 2 >= max, stop.
    expect(impact.map((i) => i.node.id)).toEqual(["a", "b"]);
  });

  it("skips downstream ids with no matching node in the index", () => {
    const edges = [edge("root", "ghost"), edge("root", "real")];
    const { fwd } = buildAdjacency(edges);
    const byId = indexNodes([node("root"), node("real")]);
    const impact = computeImpact("root", fwd, byId);
    expect(impact.map((i) => i.node.id)).toEqual(["real"]);
  });

  it("does not revisit nodes in a cycle", () => {
    const edges = [edge("root", "a"), edge("a", "root")];
    const { fwd } = buildAdjacency(edges);
    const byId = indexNodes(["root", "a"].map(node));
    const impact = computeImpact("root", fwd, byId);
    expect(impact.map((i) => i.node.id)).toEqual(["a"]);
  });
});

describe("indexColumnLineage", () => {
  const cl = (
    sourceNode: string,
    sourceCol: string,
    targetNode: string,
    targetCol: string,
    transform?: string,
  ): ColumnLineage => ({ sourceNode, sourceCol, targetNode, targetCol, transform });

  it("groups lineage by target node (incoming) and source node (outgoing)", () => {
    const lineage = [cl("A", "x", "B", "x"), cl("A", "y", "B", "y"), cl("B", "x", "C", "x")];
    const { incoming, outgoing } = indexColumnLineage(lineage);
    expect(incoming.get("B")).toHaveLength(2);
    expect(incoming.get("C")).toHaveLength(1);
    expect(outgoing.get("A")).toHaveLength(2);
    expect(outgoing.get("B")).toHaveLength(1);
  });

  it("returns empty maps for no lineage", () => {
    const { incoming, outgoing } = indexColumnLineage([]);
    expect(incoming.size).toBe(0);
    expect(outgoing.size).toBe(0);
  });
});

describe("traceColumnUpstream", () => {
  const cl = (
    sourceNode: string,
    sourceCol: string,
    targetNode: string,
    targetCol: string,
    transform?: string,
  ): ColumnLineage => ({ sourceNode, sourceCol, targetNode, targetCol, transform });

  it("returns no hops for a column with no upstream lineage", () => {
    const { incoming } = indexColumnLineage([cl("A", "x", "B", "x")]);
    expect(traceColumnUpstream("A", "x", incoming)).toEqual([]);
  });

  it("walks a single output column back through its provenance chain", () => {
    const lineage = [
      cl("A", "amount", "B", "rev", "SUM(amount)"),
      cl("B", "rev", "C", "total", "rev * 1.0"),
    ];
    const { incoming } = indexColumnLineage(lineage);
    const hops = traceColumnUpstream("C", "total", incoming);
    expect(hops).toEqual([
      { node: "B", column: "rev", transform: "rev * 1.0", depth: 1 },
      { node: "A", column: "amount", transform: "SUM(amount)", depth: 2 },
    ]);
  });

  it("follows wildcard targetCol ('*') lineage entries", () => {
    const lineage = [cl("A", "raw", "B", "*", "passthrough")];
    const { incoming } = indexColumnLineage(lineage);
    const hops = traceColumnUpstream("B", "anything", incoming);
    expect(hops).toEqual([{ node: "A", column: "raw", transform: "passthrough", depth: 1 }]);
  });

  it("ignores lineage entries whose targetCol does not match", () => {
    const lineage = [cl("A", "x", "B", "x"), cl("A", "y", "B", "y")];
    const { incoming } = indexColumnLineage(lineage);
    const hops = traceColumnUpstream("B", "x", incoming);
    expect(hops).toEqual([{ node: "A", column: "x", transform: undefined, depth: 1 }]);
  });

  it("is guarded against cycles in column lineage", () => {
    const lineage = [cl("A", "x", "B", "x"), cl("B", "x", "A", "x")];
    const { incoming } = indexColumnLineage(lineage);
    const hops = traceColumnUpstream("B", "x", incoming);
    // Walk B←A←B... but the (node:col:depth) seen-guard plus maxDepth bound it.
    expect(hops.length).toBeGreaterThan(0);
    expect(hops.length).toBeLessThanOrEqual(12);
  });

  it("stops at maxDepth on a long chain", () => {
    const lineage: ColumnLineage[] = [];
    for (let i = 0; i < 20; i++) {
      lineage.push(cl(`n${i + 1}`, "c", `n${i}`, "c"));
    }
    const { incoming } = indexColumnLineage(lineage);
    const hops = traceColumnUpstream("n0", "c", incoming, 5);
    expect(hops).toHaveLength(5);
    expect(hops[hops.length - 1].depth).toBe(5);
  });
});
