import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LEdge, LNode } from "@/features/lineage/core/types";

// ─── Mock elkjs ──────────────────────────────────────────────────────────────
// elk-layout constructs `new ELK()` at import time and calls `elk.layout(graph)`.
// We mock the default export so layout never spawns the real GWT-compiled ELK
// and we can capture the graph it is handed + control the laid-out result.

const { layoutMock } = vi.hoisted(() => ({ layoutMock: vi.fn() }));

vi.mock("elkjs/lib/elk.bundled.js", () => ({
  default: class FakeELK {
    layout = layoutMock;
  },
}));

import {
  LINEAGE_NODE_HEIGHT,
  LINEAGE_NODE_WIDTH,
  layoutGraph,
} from "@/features/lineage/core/elk-layout";

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

describe("layoutGraph", () => {
  beforeEach(() => {
    layoutMock.mockReset();
  });

  it("exposes the fixed lineage node dimensions", () => {
    expect(LINEAGE_NODE_WIDTH).toBe(200);
    expect(LINEAGE_NODE_HEIGHT).toBe(96);
  });

  it("short-circuits to an empty result without calling ELK for no nodes", async () => {
    const positions = await layoutGraph([], []);
    expect(positions).toEqual({});
    expect(layoutMock).not.toHaveBeenCalled();
  });

  it("returns ELK-supplied top-left coordinates keyed by node id", async () => {
    layoutMock.mockResolvedValue({
      children: [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 320, y: 0 },
      ],
    });
    const positions = await layoutGraph([node("a"), node("b")], [edge("a", "b")]);
    expect(positions).toEqual({
      a: { x: 0, y: 0 },
      b: { x: 320, y: 0 },
    });
  });

  it("defaults missing ELK coordinates to 0", async () => {
    layoutMock.mockResolvedValue({ children: [{ id: "a" }] });
    const positions = await layoutGraph([node("a")], []);
    expect(positions).toEqual({ a: { x: 0, y: 0 } });
  });

  it("builds an ELK graph with node dimensions and a layered RIGHT layout", async () => {
    layoutMock.mockResolvedValue({ children: [] });
    await layoutGraph([node("a")], []);

    expect(layoutMock).toHaveBeenCalledTimes(1);
    const graph = layoutMock.mock.calls[0][0];
    expect(graph.id).toBe("root");
    expect(graph.layoutOptions["elk.algorithm"]).toBe("layered");
    expect(graph.layoutOptions["elk.direction"]).toBe("RIGHT");
    expect(graph.children).toEqual([
      { id: "a", width: LINEAGE_NODE_WIDTH, height: LINEAGE_NODE_HEIGHT },
    ]);
  });

  it("drops edges that reference unknown nodes before handing the graph to ELK", async () => {
    layoutMock.mockResolvedValue({ children: [] });
    await layoutGraph(
      [node("a"), node("b")],
      [edge("a", "b"), edge("a", "ghost"), edge("ghost", "b")],
    );
    const graph = layoutMock.mock.calls[0][0];
    expect(graph.edges).toEqual([{ id: "a->b", sources: ["a"], targets: ["b"] }]);
  });

  it("falls back to a deterministic non-overlapping grid when ELK throws", async () => {
    layoutMock.mockRejectedValue(new Error("ELK exploded"));
    const nodes = ["a", "b", "c", "d"].map(node);
    const positions = await layoutGraph(nodes, []);

    // 4 nodes → ceil(sqrt(4)) = 2 per row.
    expect(positions).toEqual({
      a: { x: 0, y: 0 },
      b: { x: LINEAGE_NODE_WIDTH + 60, y: 0 },
      c: { x: 0, y: LINEAGE_NODE_HEIGHT + 60 },
      d: { x: LINEAGE_NODE_WIDTH + 60, y: LINEAGE_NODE_HEIGHT + 60 },
    });
  });

  it("places a single node at the origin in the grid fallback", async () => {
    layoutMock.mockRejectedValue(new Error("boom"));
    const positions = await layoutGraph([node("solo")], []);
    expect(positions).toEqual({ solo: { x: 0, y: 0 } });
  });

  it("returns an empty object when ELK yields no children array", async () => {
    layoutMock.mockResolvedValue({});
    const positions = await layoutGraph([node("a")], []);
    expect(positions).toEqual({});
  });
});
