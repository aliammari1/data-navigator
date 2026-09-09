import { describe, expect, it } from "vitest";
import {
  type CatalogFilter,
  filterFileNodes,
  LOW_QUALITY_THRESHOLD,
  matchesFilter,
  RECENT_DAYS,
} from "@/features/folders/lib/catalog-filters";
import type { FSNode } from "@/features/folders/types";

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function makeNode(over: Partial<FSNode> & Pick<FSNode, "id" | "type">): FSNode {
  return {
    name: over.id,
    parentId: null,
    size: 0,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    tags: [],
    starred: false,
    ...over,
  };
}

const ctx = { isUnclassified: (id: string) => id === "lonely", now: NOW };

describe("matchesFilter", () => {
  // "all" filter — always true regardless of node type
  it('returns true for any node when filter is "all"', () => {
    expect(matchesFilter(makeNode({ id: "f", type: "folder" }), "all", ctx)).toBe(true);
    expect(matchesFilter(makeNode({ id: "a", type: "csv" }), "all", ctx)).toBe(true);
    expect(matchesFilter(makeNode({ id: "b", type: "parquet" }), "all", ctx)).toBe(true);
  });

  // folder short-circuit for non-"all" filters
  it('returns false for a folder node on any non-"all" filter', () => {
    const folder = makeNode({ id: "dir", type: "folder" });
    const filters: CatalogFilter[] = ["csv", "parquet", "unclassified", "low-quality", "recent"];
    for (const f of filters) {
      expect(matchesFilter(folder, f, ctx)).toBe(false);
    }
  });

  // csv filter — matches csv, tsv, txt; not others
  it('matches csv-family types for "csv" filter', () => {
    expect(matchesFilter(makeNode({ id: "a", type: "csv" }), "csv", ctx)).toBe(true);
    expect(matchesFilter(makeNode({ id: "b", type: "tsv" }), "csv", ctx)).toBe(true);
    expect(matchesFilter(makeNode({ id: "c", type: "txt" }), "csv", ctx)).toBe(true);
  });

  it('rejects non-csv types for "csv" filter', () => {
    expect(matchesFilter(makeNode({ id: "a", type: "parquet" }), "csv", ctx)).toBe(false);
    expect(matchesFilter(makeNode({ id: "b", type: "pq" }), "csv", ctx)).toBe(false);
    expect(matchesFilter(makeNode({ id: "c", type: "json" }), "csv", ctx)).toBe(false);
  });

  // parquet filter — matches parquet, pq; not others
  it('matches parquet-family types for "parquet" filter', () => {
    expect(matchesFilter(makeNode({ id: "a", type: "parquet" }), "parquet", ctx)).toBe(true);
    expect(matchesFilter(makeNode({ id: "b", type: "pq" }), "parquet", ctx)).toBe(true);
  });

  it('rejects non-parquet types for "parquet" filter', () => {
    expect(matchesFilter(makeNode({ id: "a", type: "csv" }), "parquet", ctx)).toBe(false);
    expect(matchesFilter(makeNode({ id: "b", type: "json" }), "parquet", ctx)).toBe(false);
  });

  // unclassified filter
  it('matches unclassified nodes via ctx.isUnclassified for "unclassified" filter', () => {
    expect(matchesFilter(makeNode({ id: "lonely", type: "csv" }), "unclassified", ctx)).toBe(true);
    expect(matchesFilter(makeNode({ id: "filed", type: "csv" }), "unclassified", ctx)).toBe(false);
  });

  // low-quality filter
  it('matches nodes with quality below threshold for "low-quality" filter', () => {
    expect(
      matchesFilter(
        makeNode({ id: "a", type: "csv", quality: LOW_QUALITY_THRESHOLD - 0.01 }),
        "low-quality",
        ctx,
      ),
    ).toBe(true);
  });

  it('rejects nodes at or above the quality threshold for "low-quality" filter', () => {
    expect(
      matchesFilter(
        makeNode({ id: "b", type: "csv", quality: LOW_QUALITY_THRESHOLD }),
        "low-quality",
        ctx,
      ),
    ).toBe(false);
    expect(
      matchesFilter(makeNode({ id: "c", type: "csv", quality: 0.99 }), "low-quality", ctx),
    ).toBe(false);
  });

  it('rejects nodes without a quality field for "low-quality" filter', () => {
    // quality === undefined branch
    expect(matchesFilter(makeNode({ id: "d", type: "csv" }), "low-quality", ctx)).toBe(false);
  });

  // recent filter — within RECENT_DAYS window
  it('matches nodes created within the recent window for "recent" filter', () => {
    const justWithin = makeNode({
      id: "new",
      type: "csv",
      createdAt: new Date(NOW - RECENT_DAYS * DAY),
    });
    expect(matchesFilter(justWithin, "recent", ctx)).toBe(true);
  });

  it('rejects nodes created before the recent window for "recent" filter', () => {
    const old = makeNode({
      id: "old",
      type: "csv",
      createdAt: new Date(NOW - (RECENT_DAYS + 1) * DAY),
    });
    expect(matchesFilter(old, "recent", ctx)).toBe(false);
  });

  it('matches a node created right now for "recent" filter (boundary = 0 ms ago)', () => {
    const fresh = makeNode({ id: "fresh", type: "csv", createdAt: new Date(NOW) });
    expect(matchesFilter(fresh, "recent", ctx)).toBe(true);
  });

  // default branch — reached with an unknown filter value cast at runtime
  it("returns true for an unknown filter value (default switch branch)", () => {
    // Cast through unknown to bypass TypeScript's exhaustiveness check
    const unknownFilter = "unknown-type" as unknown as CatalogFilter;
    expect(matchesFilter(makeNode({ id: "x", type: "csv" }), unknownFilter, ctx)).toBe(true);
  });
});

describe("filterFileNodes", () => {
  const nodes: FSNode[] = [
    makeNode({ id: "lonely", type: "csv" }),
    makeNode({ id: "filed", type: "parquet" }),
    makeNode({ id: "dir", type: "folder" }),
  ];

  it('returns the same array reference for "all" filter', () => {
    expect(filterFileNodes(nodes, "all", ctx)).toBe(nodes);
  });

  it('filters to csv nodes only for "csv" filter', () => {
    expect(filterFileNodes(nodes, "csv", ctx).map((n) => n.id)).toEqual(["lonely"]);
  });

  it('filters to parquet nodes for "parquet" filter', () => {
    expect(filterFileNodes(nodes, "parquet", ctx).map((n) => n.id)).toEqual(["filed"]);
  });

  it('filters to unclassified nodes for "unclassified" filter', () => {
    expect(filterFileNodes(nodes, "unclassified", ctx).map((n) => n.id)).toEqual(["lonely"]);
  });

  it('returns empty array when no nodes match "low-quality" filter (none have quality field)', () => {
    expect(filterFileNodes(nodes, "low-quality", ctx)).toHaveLength(0);
  });

  it('filters to recent nodes for "recent" filter', () => {
    // All base nodes have createdAt = NOW and now = NOW, so delta = 0 ≤ 7 days
    const result = filterFileNodes(nodes, "recent", ctx);
    // folder never matches; only the two file nodes are recent
    expect(result.map((n) => n.id)).toEqual(["lonely", "filed"]);
  });

  it("accepts every documented CatalogFilter value without throwing", () => {
    const all: CatalogFilter[] = ["all", "csv", "parquet", "unclassified", "low-quality", "recent"];
    for (const f of all) {
      expect(Array.isArray(filterFileNodes(nodes, f, ctx))).toBe(true);
    }
  });

  it("returns empty array when input list is empty", () => {
    expect(filterFileNodes([], "csv", ctx)).toHaveLength(0);
  });
});
