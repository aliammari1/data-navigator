/**
 * Unit tests for useFolderIndex hook.
 *
 * Strategy:
 * - No external IO deps to mock; buildFolderIndex and useMemo are both pure.
 * - Use renderHook to exercise the hook in a React context so useMemo fires.
 * - Cover: empty array, single node, multiple nodes (folders + files),
 *   memoization stability, and re-computation on nodes change.
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFolderIndex } from "@/features/folders/hooks/use-folder-index";
import type { FSNode } from "@/features/folders/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(over: Partial<FSNode> = {}): FSNode {
  return {
    id: "node-1",
    name: "My File",
    type: "csv",
    parentId: null,
    size: 1024,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
    tags: [],
    starred: false,
    ...over,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useFolderIndex – empty nodes array", () => {
  it("returns a FolderIndex with empty byId and childrenOf maps for an empty array", () => {
    // Arrange
    const nodes: FSNode[] = [];

    // Act
    const { result } = renderHook(() => useFolderIndex(nodes));

    // Assert
    expect(result.current.byId).toBeInstanceOf(Map);
    expect(result.current.childrenOf).toBeInstanceOf(Map);
    expect(result.current.byId.size).toBe(0);
    expect(result.current.childrenOf.size).toBe(0);
  });
});

describe("useFolderIndex – single node", () => {
  it("indexes a single root-level file node", () => {
    // Arrange
    const node = makeNode({ id: "f1", name: "data.csv", type: "csv", parentId: null });
    const nodes = [node];

    // Act
    const { result } = renderHook(() => useFolderIndex(nodes));

    // Assert
    expect(result.current.byId.get("f1")).toBe(node);
    expect(result.current.childrenOf.get(null)).toEqual([node]);
  });

  it("indexes a single folder node", () => {
    // Arrange
    const folder = makeNode({ id: "folder-1", name: "Reports", type: "folder", parentId: null });
    const nodes = [folder];

    // Act
    const { result } = renderHook(() => useFolderIndex(nodes));

    // Assert
    expect(result.current.byId.get("folder-1")).toBe(folder);
    expect(result.current.childrenOf.get(null)).toEqual([folder]);
  });
});

describe("useFolderIndex – multiple nodes", () => {
  it("builds correct byId mapping for multiple nodes", () => {
    // Arrange
    const folder = makeNode({ id: "folder-1", name: "Finance", type: "folder", parentId: null });
    const file1 = makeNode({ id: "file-1", name: "report.csv", type: "csv", parentId: "folder-1" });
    const file2 = makeNode({ id: "file-2", name: "data.json", type: "json", parentId: "folder-1" });
    const nodes = [folder, file1, file2];

    // Act
    const { result } = renderHook(() => useFolderIndex(nodes));

    // Assert
    expect(result.current.byId.get("folder-1")).toBe(folder);
    expect(result.current.byId.get("file-1")).toBe(file1);
    expect(result.current.byId.get("file-2")).toBe(file2);
    expect(result.current.byId.size).toBe(3);
  });

  it("groups child nodes under their parent in childrenOf", () => {
    // Arrange
    const folder = makeNode({ id: "folder-1", name: "Finance", type: "folder", parentId: null });
    const file1 = makeNode({ id: "file-1", name: "b.csv", type: "csv", parentId: "folder-1" });
    const file2 = makeNode({ id: "file-2", name: "a.csv", type: "csv", parentId: "folder-1" });
    const nodes = [folder, file1, file2];

    // Act
    const { result } = renderHook(() => useFolderIndex(nodes));

    // Assert: children are sorted by name (a before b)
    const children = result.current.childrenOf.get("folder-1");
    expect(children).toHaveLength(2);
    expect(children![0].id).toBe("file-2"); // a.csv comes first
    expect(children![1].id).toBe("file-1"); // b.csv comes second
  });

  it("sorts folder nodes before file nodes among siblings", () => {
    // Arrange
    const subfolder = makeNode({ id: "sub", name: "Sub", type: "folder", parentId: "root" });
    const file = makeNode({ id: "f", name: "AAA.csv", type: "csv", parentId: "root" });
    // Even though AAA sorts before Sub alphabetically, folder comes first
    const nodes = [file, subfolder];

    // Act
    const { result } = renderHook(() => useFolderIndex(nodes));

    // Assert: subfolder before file
    const children = result.current.childrenOf.get("root");
    expect(children![0].type).toBe("folder");
    expect(children![1].type).toBe("csv");
  });

  it("handles nodes at multiple nesting levels", () => {
    // Arrange
    const root = makeNode({ id: "root", name: "Root", type: "folder", parentId: null });
    const child = makeNode({ id: "child", name: "Child", type: "folder", parentId: "root" });
    const grandchild = makeNode({ id: "gc", name: "leaf.csv", type: "csv", parentId: "child" });
    const nodes = [root, child, grandchild];

    // Act
    const { result } = renderHook(() => useFolderIndex(nodes));

    // Assert
    expect(result.current.childrenOf.get(null)).toEqual([root]);
    expect(result.current.childrenOf.get("root")).toEqual([child]);
    expect(result.current.childrenOf.get("child")).toEqual([grandchild]);
  });
});

describe("useFolderIndex – memoization", () => {
  it("returns the same FolderIndex reference when the same nodes array is passed on rerender", () => {
    // Arrange
    const nodes = [makeNode({ id: "n1", name: "file.csv", parentId: null })];

    // Act
    const { result, rerender } = renderHook(({ n }: { n: FSNode[] }) => useFolderIndex(n), {
      initialProps: { n: nodes },
    });

    const firstResult = result.current;

    // Rerender with the identical array reference
    rerender({ n: nodes });

    // Assert: useMemo returns the same object reference
    expect(result.current).toBe(firstResult);
  });

  it("recomputes and returns a new FolderIndex when a different nodes array is passed", () => {
    // Arrange
    const nodesA = [makeNode({ id: "n1", name: "file-a.csv", parentId: null })];
    const nodesB = [makeNode({ id: "n2", name: "file-b.csv", parentId: null })];

    // Act
    const { result, rerender } = renderHook(({ n }: { n: FSNode[] }) => useFolderIndex(n), {
      initialProps: { n: nodesA },
    });

    const firstResult = result.current;

    // Rerender with a different array reference
    rerender({ n: nodesB });

    // Assert: new index computed with the updated nodes
    expect(result.current).not.toBe(firstResult);
    expect(result.current.byId.has("n2")).toBe(true);
    expect(result.current.byId.has("n1")).toBe(false);
  });

  it("returns an updated index that reflects the new nodes after rerender", () => {
    // Arrange
    const initial = [makeNode({ id: "a", name: "a.csv", parentId: null })];
    const updated = [
      makeNode({ id: "a", name: "a.csv", parentId: null }),
      makeNode({ id: "b", name: "b.csv", parentId: null }),
    ];

    // Act
    const { result, rerender } = renderHook(({ n }: { n: FSNode[] }) => useFolderIndex(n), {
      initialProps: { n: initial },
    });

    expect(result.current.byId.size).toBe(1);

    rerender({ n: updated });

    // Assert
    expect(result.current.byId.size).toBe(2);
    expect(result.current.byId.has("b")).toBe(true);
  });
});

describe("useFolderIndex – various node types", () => {
  it("correctly indexes nodes of different file types", () => {
    // Arrange: one node of each supported type
    const types = [
      "folder",
      "csv",
      "tsv",
      "txt",
      "excel",
      "parquet",
      "pq",
      "duckdb",
      "sql",
      "json",
    ] as const;

    const nodes = types.map((t, i) =>
      makeNode({ id: `node-${i}`, name: `file-${i}`, type: t, parentId: null }),
    );

    // Act
    const { result } = renderHook(() => useFolderIndex(nodes));

    // Assert: all nodes indexed
    expect(result.current.byId.size).toBe(types.length);
    for (let i = 0; i < types.length; i++) {
      expect(result.current.byId.has(`node-${i}`)).toBe(true);
    }
  });

  it("handles starred and tagged nodes without errors", () => {
    // Arrange
    const node = makeNode({
      id: "starred-1",
      name: "important.csv",
      type: "csv",
      parentId: null,
      starred: true,
      tags: ["finance", "q1"],
      quality: 0.95,
      description: "Q1 revenue data",
      color: "#ff0000",
    });

    // Act
    const { result } = renderHook(() => useFolderIndex([node]));

    // Assert
    expect(result.current.byId.get("starred-1")).toBe(node);
  });
});
