/**
 * Unit tests for useFolderSearch hook.
 *
 * Strategy:
 * - No external mocks needed — fuse.js is a pure library with no IO.
 * - Exercise every branch:
 *   1. Empty query (after trim) → returns null
 *   2. Whitespace-only query → returns null (trim makes it empty)
 *   3. Non-empty query with no matches → returns empty Set
 *   4. Non-empty query with matches → returns Set of matching ids
 *   5. Fuse index rebuilt when nodes change (useMemo dep)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFolderSearch } from "@/features/folders/hooks/useFolderSearch";
import type { FSNode } from "@/features/folders/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNode(over: Partial<FSNode> = {}): FSNode {
  return {
    id: "node-1",
    name: "Sales Report",
    type: "csv",
    parentId: null,
    size: 1024,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-02"),
    tags: ["finance", "sales"],
    starred: false,
    ...over,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // No global state to reset — hook is pure
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useFolderSearch – empty / blank query returns null", () => {
  it("returns null when query is an empty string", () => {
    // Arrange
    const nodes = [makeNode()];

    // Act
    const { result } = renderHook(() => useFolderSearch(nodes, ""));

    // Assert
    expect(result.current).toBeNull();
  });

  it("returns null when query is whitespace only", () => {
    // Arrange
    const nodes = [makeNode()];

    // Act
    const { result } = renderHook(() => useFolderSearch(nodes, "   "));

    // Assert
    expect(result.current).toBeNull();
  });

  it("returns null when query is a tab character", () => {
    // Arrange
    const nodes = [makeNode()];

    // Act
    const { result } = renderHook(() => useFolderSearch(nodes, "\t"));

    // Assert
    expect(result.current).toBeNull();
  });

  it("returns null with an empty nodes array and empty query", () => {
    // Arrange + Act
    const { result } = renderHook(() => useFolderSearch([], ""));

    // Assert
    expect(result.current).toBeNull();
  });
});

describe("useFolderSearch – non-empty query with matches", () => {
  it("returns a Set containing matching node id when name matches query", () => {
    // Arrange
    const node = makeNode({ id: "node-sales", name: "Sales Report" });
    const nodes = [node];

    // Act
    const { result } = renderHook(() => useFolderSearch(nodes, "Sales"));

    // Assert
    expect(result.current).toBeInstanceOf(Set);
    expect(result.current!.has("node-sales")).toBe(true);
  });

  it("returns a Set with all matching node ids for a fuzzy match", () => {
    // Arrange
    const nodeA = makeNode({ id: "a", name: "Revenue Summary", tags: [], description: undefined });
    const nodeB = makeNode({ id: "b", name: "Revenue Detail", tags: [], description: undefined });
    const nodeC = makeNode({ id: "c", name: "Inventory List", tags: [], description: undefined });
    const nodes = [nodeA, nodeB, nodeC];

    // Act
    const { result } = renderHook(() => useFolderSearch(nodes, "Revenue"));

    // Assert
    expect(result.current).toBeInstanceOf(Set);
    expect(result.current!.has("a")).toBe(true);
    expect(result.current!.has("b")).toBe(true);
    expect(result.current!.has("c")).toBe(false);
  });

  it("matches on tags field (weight=1)", () => {
    // Arrange
    const node = makeNode({ id: "tagged", name: "Random File", tags: ["telecom", "billing"] });
    const nodes = [node];

    // Act
    const { result } = renderHook(() => useFolderSearch(nodes, "telecom"));

    // Assert
    expect(result.current).toBeInstanceOf(Set);
    expect(result.current!.has("tagged")).toBe(true);
  });

  it("matches on description field (weight=0.5)", () => {
    // Arrange
    const node = makeNode({
      id: "desc-node",
      name: "Unrelated Name",
      tags: [],
      description: "quarterly financial overview",
    });
    const nodes = [node];

    // Act
    const { result } = renderHook(() => useFolderSearch(nodes, "quarterly"));

    // Assert
    expect(result.current).toBeInstanceOf(Set);
    expect(result.current!.has("desc-node")).toBe(true);
  });

  it("returns a Set (possibly empty) when query has no matches", () => {
    // Arrange
    const node = makeNode({ id: "node-1", name: "Sales Report", tags: [], description: undefined });
    const nodes = [node];

    // Act — query is long enough (>=2 chars) but doesn't match anything
    const { result } = renderHook(() => useFolderSearch(nodes, "zzzzzzunmatched"));

    // Assert: returns a Set, not null; but it contains no matching ids
    expect(result.current).toBeInstanceOf(Set);
    expect(result.current!.size).toBe(0);
  });

  it("returns an empty Set when nodes list is empty but query is non-empty", () => {
    // Arrange: no nodes to search

    // Act
    const { result } = renderHook(() => useFolderSearch([], "search term"));

    // Assert
    expect(result.current).toBeInstanceOf(Set);
    expect(result.current!.size).toBe(0);
  });
});

describe("useFolderSearch – query trimming", () => {
  it("trims leading and trailing spaces before searching (returns results for padded match)", () => {
    // Arrange
    const node = makeNode({ id: "n1", name: "Customer Data", tags: [], description: undefined });
    const nodes = [node];

    // Act — query with surrounding spaces that after trim matches a node
    const { result } = renderHook(() => useFolderSearch(nodes, "  Customer  "));

    // Assert: after trim, the word 'Customer' is long enough and matches
    expect(result.current).toBeInstanceOf(Set);
    expect(result.current!.has("n1")).toBe(true);
  });
});

describe("useFolderSearch – reactivity (nodes change rebuilds index)", () => {
  it("updates the index when the nodes array changes", () => {
    // Arrange: start with one node
    const nodeA = makeNode({ id: "a", name: "Alpha Data", tags: [] });
    let nodes = [nodeA];

    const { result, rerender } = renderHook(
      ({ n, q }: { n: FSNode[]; q: string }) => useFolderSearch(n, q),
      { initialProps: { n: nodes, q: "Alpha" } },
    );

    // Assert: initially finds node a
    expect(result.current).toBeInstanceOf(Set);
    expect(result.current!.has("a")).toBe(true);

    // Act: replace nodes with a different set
    const nodeB = makeNode({ id: "b", name: "Beta Reports", tags: [] });
    nodes = [nodeB];

    act(() => {
      rerender({ n: nodes, q: "Beta" });
    });

    // Assert: now finds node b instead
    expect(result.current).toBeInstanceOf(Set);
    expect(result.current!.has("b")).toBe(true);
    expect(result.current!.has("a")).toBe(false);
  });

  it("returns null when query is cleared after a previous non-null result", () => {
    // Arrange
    const node = makeNode({ id: "x", name: "Export File", tags: [] });
    const nodes = [node];

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useFolderSearch(nodes, q),
      { initialProps: { q: "Export" } },
    );

    // Initially returns a Set
    expect(result.current).toBeInstanceOf(Set);

    // Act: clear the query
    act(() => {
      rerender({ q: "" });
    });

    // Assert: returns null now
    expect(result.current).toBeNull();
  });

  it("returns a Set when a query is set after being empty", () => {
    // Arrange
    const node = makeNode({ id: "y", name: "Import Logs", tags: [] });
    const nodes = [node];

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useFolderSearch(nodes, q),
      { initialProps: { q: "" } },
    );

    // Initially null
    expect(result.current).toBeNull();

    // Act: provide a query
    act(() => {
      rerender({ q: "Import" });
    });

    // Assert: now returns a Set
    expect(result.current).toBeInstanceOf(Set);
    expect(result.current!.has("y")).toBe(true);
  });
});

describe("useFolderSearch – multiple nodes, mixed match/no-match", () => {
  it("returns only the ids of matching nodes, not all nodes", () => {
    // Arrange
    const match1 = makeNode({ id: "m1", name: "Finance Q1", tags: [] });
    const match2 = makeNode({ id: "m2", name: "Finance Q2", tags: [] });
    const noMatch = makeNode({ id: "nm", name: "HR Policies", tags: [] });
    const nodes = [match1, match2, noMatch];

    // Act
    const { result } = renderHook(() => useFolderSearch(nodes, "Finance"));

    // Assert
    expect(result.current).toBeInstanceOf(Set);
    expect(result.current!.has("m1")).toBe(true);
    expect(result.current!.has("m2")).toBe(true);
    expect(result.current!.has("nm")).toBe(false);
  });
});
