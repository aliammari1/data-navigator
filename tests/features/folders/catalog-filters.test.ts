import { describe, expect, it } from "vitest";
import {
  type CatalogFilter,
  filterFileNodes,
  LOW_QUALITY_THRESHOLD,
  matchesFilter,
} from "@/features/folders/lib/catalog-filters";
import type { FSNode } from "@/features/folders/types";

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function node(over: Partial<FSNode> & Pick<FSNode, "id" | "type">): FSNode {
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
  it("matches by csv-family format", () => {
    expect(matchesFilter(node({ id: "a", type: "csv" }), "csv", ctx)).toBe(true);
    expect(matchesFilter(node({ id: "b", type: "tsv" }), "csv", ctx)).toBe(true);
    expect(matchesFilter(node({ id: "c", type: "parquet" }), "csv", ctx)).toBe(false);
  });

  it("matches by parquet-family format", () => {
    expect(matchesFilter(node({ id: "a", type: "parquet" }), "parquet", ctx)).toBe(true);
    expect(matchesFilter(node({ id: "b", type: "pq" }), "parquet", ctx)).toBe(true);
    expect(matchesFilter(node({ id: "c", type: "csv" }), "parquet", ctx)).toBe(false);
  });

  it("matches unclassified datasets via the context predicate", () => {
    expect(matchesFilter(node({ id: "lonely", type: "csv" }), "unclassified", ctx)).toBe(true);
    expect(matchesFilter(node({ id: "filed", type: "csv" }), "unclassified", ctx)).toBe(false);
  });

  it("matches only datasets below the low-quality threshold", () => {
    expect(
      matchesFilter(
        node({ id: "a", type: "csv", quality: LOW_QUALITY_THRESHOLD - 0.01 }),
        "low-quality",
        ctx,
      ),
    ).toBe(true);
    expect(matchesFilter(node({ id: "b", type: "csv", quality: 0.95 }), "low-quality", ctx)).toBe(
      false,
    );
    expect(matchesFilter(node({ id: "c", type: "csv" }), "low-quality", ctx)).toBe(false);
  });

  it("matches recently created datasets only", () => {
    expect(
      matchesFilter(
        node({ id: "new", type: "csv", createdAt: new Date(NOW - DAY) }),
        "recent",
        ctx,
      ),
    ).toBe(true);
    expect(
      matchesFilter(
        node({ id: "old", type: "csv", createdAt: new Date(NOW - 30 * DAY) }),
        "recent",
        ctx,
      ),
    ).toBe(false);
  });

  it("never matches folders for a non-'all' filter, but 'all' matches everything", () => {
    const folder = node({ id: "f", type: "folder" });
    expect(matchesFilter(folder, "csv", ctx)).toBe(false);
    expect(matchesFilter(folder, "all", ctx)).toBe(true);
    expect(matchesFilter(node({ id: "d", type: "parquet" }), "all", ctx)).toBe(true);
  });
});

describe("filterFileNodes", () => {
  const nodes = [node({ id: "lonely", type: "csv" }), node({ id: "filed", type: "parquet" })];

  it("returns the input unchanged for the 'all' filter", () => {
    expect(filterFileNodes(nodes, "all", ctx)).toBe(nodes);
  });

  it("filters by the active chip", () => {
    expect(filterFileNodes(nodes, "csv", ctx).map((n) => n.id)).toEqual(["lonely"]);
    expect(filterFileNodes(nodes, "unclassified", ctx).map((n) => n.id)).toEqual(["lonely"]);
  });

  it("accepts every documented filter id", () => {
    const all: CatalogFilter[] = ["all", "csv", "parquet", "unclassified", "low-quality", "recent"];
    for (const f of all) {
      expect(Array.isArray(filterFileNodes(nodes, f, ctx))).toBe(true);
    }
  });
});
