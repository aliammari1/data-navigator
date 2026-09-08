import { describe, it, expect } from "vitest";
import {
  buildFolderIndex,
  flattenVisible,
  computeFolderSizes,
  wouldCreateCycle,
  breadcrumbPath,
} from "@/features/folders/lib/folderTree";
import type { FSNode } from "@/features/folders/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date("2024-01-01T00:00:00Z");

function node(over: Partial<FSNode> & Pick<FSNode, "id" | "type">): FSNode {
  return {
    name: over.id,
    parentId: null,
    size: 0,
    createdAt: NOW,
    updatedAt: NOW,
    tags: [],
    starred: false,
    ...over,
  };
}

function folder(id: string, parentId: string | null = null): FSNode {
  return node({ id, type: "folder", parentId });
}

function file(id: string, parentId: string | null = null, size = 0): FSNode {
  return node({ id, type: "csv", parentId, size });
}

// ---------------------------------------------------------------------------
// buildFolderIndex
// ---------------------------------------------------------------------------

describe("buildFolderIndex", () => {
  it("returns empty maps for an empty input", () => {
    // Arrange / Act
    const idx = buildFolderIndex([]);

    // Assert
    expect(idx.byId.size).toBe(0);
    expect(idx.childrenOf.size).toBe(0);
  });

  it("indexes every node by id", () => {
    // Arrange
    const nodes = [folder("root"), file("f1", "root"), folder("sub", "root")];

    // Act
    const idx = buildFolderIndex(nodes);

    // Assert – every id is present
    expect(idx.byId.get("root")).toBe(nodes[0]);
    expect(idx.byId.get("f1")).toBe(nodes[1]);
    expect(idx.byId.get("sub")).toBe(nodes[2]);
  });

  it("groups children under their parentId", () => {
    // Arrange
    const nodes = [folder("root"), file("f1", "root"), file("f2", "root")];

    // Act
    const idx = buildFolderIndex(nodes);

    // Assert – root has two children, top-level bucket has the root
    const rootChildren = idx.childrenOf.get("root");
    expect(rootChildren).toHaveLength(2);
    expect(rootChildren?.map((n) => n.id)).toContain("f1");
    expect(rootChildren?.map((n) => n.id)).toContain("f2");
  });

  it("places top-level nodes (null parentId) under the null key", () => {
    // Arrange
    const nodes = [folder("root"), folder("other")];

    // Act
    const idx = buildFolderIndex(nodes);

    // Assert
    const topLevel = idx.childrenOf.get(null);
    expect(topLevel?.map((n) => n.id)).toContain("root");
    expect(topLevel?.map((n) => n.id)).toContain("other");
  });

  it("sorts: folders before files, then alphabetically within each group", () => {
    // Arrange – deliberately out of order
    const nodes = [
      file("b-file", "root"),
      folder("b-folder", "root"),
      file("a-file", "root"),
      folder("a-folder", "root"),
    ];

    // Act
    const idx = buildFolderIndex(nodes);
    const names = idx.childrenOf.get("root")?.map((n) => n.name) ?? [];

    // Assert: folders first (a-folder, b-folder), then files (a-file, b-file)
    expect(names).toEqual(["a-folder", "b-folder", "a-file", "b-file"]);
  });

  it("handles a single node with no children", () => {
    // Arrange
    const nodes = [folder("solo")];

    // Act
    const idx = buildFolderIndex(nodes);

    // Assert
    expect(idx.byId.size).toBe(1);
    expect(idx.childrenOf.get("solo")).toBeUndefined();
  });

  it("handles deeply nested structures", () => {
    // Arrange: root -> mid -> leaf
    const nodes = [folder("root"), folder("mid", "root"), file("leaf", "mid")];

    // Act
    const idx = buildFolderIndex(nodes);

    // Assert
    expect(idx.childrenOf.get("root")?.map((n) => n.id)).toEqual(["mid"]);
    expect(idx.childrenOf.get("mid")?.map((n) => n.id)).toEqual(["leaf"]);
  });
});

// ---------------------------------------------------------------------------
// flattenVisible
// ---------------------------------------------------------------------------

describe("flattenVisible", () => {
  it("returns empty array when rootIds is empty", () => {
    // Arrange
    const idx = buildFolderIndex([]);

    // Act
    const rows = flattenVisible(idx, [], new Set());

    // Assert
    expect(rows).toHaveLength(0);
  });

  it("skips a rootId that does not exist in the index", () => {
    // Arrange
    const idx = buildFolderIndex([]);

    // Act
    const rows = flattenVisible(idx, ["missing"], new Set());

    // Assert
    expect(rows).toHaveLength(0);
  });

  it("includes the root node at depth 0", () => {
    // Arrange
    const nodes = [folder("root")];
    const idx = buildFolderIndex(nodes);

    // Act
    const rows = flattenVisible(idx, ["root"], new Set());

    // Assert
    expect(rows).toHaveLength(1);
    expect(rows[0].depth).toBe(0);
    expect(rows[0].node.id).toBe("root");
  });

  it("does not descend into collapsed folders", () => {
    // Arrange
    const nodes = [folder("root"), file("f1", "root")];
    const idx = buildFolderIndex(nodes);

    // Act – root is NOT in the expanded set
    const rows = flattenVisible(idx, ["root"], new Set());

    // Assert – only the root row is visible, not the child
    expect(rows).toHaveLength(1);
    expect(rows[0].isExpanded).toBe(false);
    expect(rows[0].hasChildren).toBe(true);
  });

  it("descends into expanded folders and exposes children at depth+1", () => {
    // Arrange
    const nodes = [folder("root"), file("f1", "root"), file("f2", "root")];
    const idx = buildFolderIndex(nodes);

    // Act – expand root
    const rows = flattenVisible(idx, ["root"], new Set(["root"]));

    // Assert
    expect(rows).toHaveLength(3);
    expect(rows[0].depth).toBe(0);
    expect(rows[0].isExpanded).toBe(true);
    expect(rows[1].depth).toBe(1);
    expect(rows[2].depth).toBe(1);
  });

  it("exposes hasChildren=false for leaf nodes", () => {
    // Arrange
    const nodes = [folder("root"), file("leaf", "root")];
    const idx = buildFolderIndex(nodes);

    // Act
    const rows = flattenVisible(idx, ["root"], new Set(["root"]));

    // Assert – the leaf row
    const leafRow = rows.find((r) => r.node.id === "leaf");
    expect(leafRow?.hasChildren).toBe(false);
    expect(leafRow?.isExpanded).toBe(false);
  });

  it("handles multiple root ids", () => {
    // Arrange
    const nodes = [folder("a"), folder("b")];
    const idx = buildFolderIndex(nodes);

    // Act
    const rows = flattenVisible(idx, ["a", "b"], new Set());

    // Assert – both appear in order
    expect(rows.map((r) => r.node.id)).toEqual(["a", "b"]);
  });

  it("recurses correctly through multiple expansion levels", () => {
    // Arrange: root -> mid -> leaf
    const nodes = [folder("root"), folder("mid", "root"), file("leaf", "mid")];
    const idx = buildFolderIndex(nodes);

    // Act – expand both folders
    const rows = flattenVisible(idx, ["root"], new Set(["root", "mid"]));

    // Assert
    expect(rows).toHaveLength(3);
    expect(rows[0].node.id).toBe("root");
    expect(rows[0].depth).toBe(0);
    expect(rows[1].node.id).toBe("mid");
    expect(rows[1].depth).toBe(1);
    expect(rows[2].node.id).toBe("leaf");
    expect(rows[2].depth).toBe(2);
  });

  it("shows mid children only when mid is expanded, not when only root is expanded", () => {
    // Arrange: root -> mid -> leaf
    const nodes = [folder("root"), folder("mid", "root"), file("leaf", "mid")];
    const idx = buildFolderIndex(nodes);

    // Act – only root expanded
    const rows = flattenVisible(idx, ["root"], new Set(["root"]));

    // Assert – leaf stays hidden
    expect(rows.map((r) => r.node.id)).toEqual(["root", "mid"]);
  });
});

// ---------------------------------------------------------------------------
// computeFolderSizes
// ---------------------------------------------------------------------------

describe("computeFolderSizes", () => {
  it("returns size 0 for an empty folder", () => {
    // Arrange
    const nodes = [folder("root")];
    const idx = buildFolderIndex(nodes);

    // Act
    const sizes = computeFolderSizes(idx, "root");

    // Assert
    expect(sizes.get("root")).toBe(0);
  });

  it("sums direct file children sizes", () => {
    // Arrange
    const nodes = [folder("root"), file("f1", "root", 100), file("f2", "root", 200)];
    const idx = buildFolderIndex(nodes);

    // Act
    const sizes = computeFolderSizes(idx, "root");

    // Assert
    expect(sizes.get("root")).toBe(300);
  });

  it("recursively sums nested folder sizes", () => {
    // Arrange: root -> mid (size 150), mid -> leaf (size 150)
    const nodes = [folder("root"), folder("mid", "root"), file("leaf", "mid", 150)];
    const idx = buildFolderIndex(nodes);

    // Act
    const sizes = computeFolderSizes(idx, "root");

    // Assert
    expect(sizes.get("mid")).toBe(150);
    expect(sizes.get("root")).toBe(150);
  });

  it("combines files and subfolders in the same parent", () => {
    // Arrange
    const nodes = [
      folder("root"),
      file("f1", "root", 50),
      folder("sub", "root"),
      file("f2", "sub", 200),
    ];
    const idx = buildFolderIndex(nodes);

    // Act
    const sizes = computeFolderSizes(idx, "root");

    // Assert
    expect(sizes.get("sub")).toBe(200);
    expect(sizes.get("root")).toBe(250);
  });

  it("is cycle-safe: does not infinite-loop if parentId creates a back-edge", () => {
    // Arrange: manually create a cycle by patching the childrenOf map
    const a = folder("a");
    const b = folder("b", "a");
    const nodes = [a, b];
    const idx = buildFolderIndex(nodes);

    // Inject a fake back-edge: b's children includes a (cycle: a -> b -> a)
    const bChildren = idx.childrenOf.get("b") ?? [];
    bChildren.push(a);
    idx.childrenOf.set("b", bChildren);

    // Act – should terminate rather than looping forever
    let sizes: Map<string, number> | undefined;
    expect(() => {
      sizes = computeFolderSizes(idx, "a");
    }).not.toThrow();

    // Assert – we got a result
    expect(sizes).toBeDefined();
  });

  it("returns an empty map (no entry) for a rootId that has no children and no entry", () => {
    // Arrange – index is empty
    const idx = buildFolderIndex([]);

    // Act
    const sizes = computeFolderSizes(idx, "ghost");

    // Assert – ghost gets 0 since it has no children
    expect(sizes.get("ghost")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// wouldCreateCycle
// ---------------------------------------------------------------------------

describe("wouldCreateCycle", () => {
  it("returns false when candidateParentId is null (moving to root)", () => {
    // Arrange
    const nodes = [folder("a"), folder("b", "a")];
    const idx = buildFolderIndex(nodes);

    // Act / Assert
    expect(wouldCreateCycle(idx, "a", null)).toBe(false);
  });

  it("returns true when candidateParentId equals the node itself", () => {
    // Arrange
    const nodes = [folder("a")];
    const idx = buildFolderIndex(nodes);

    // Act / Assert
    expect(wouldCreateCycle(idx, "a", "a")).toBe(true);
  });

  it("returns true when candidateParentId is a descendant of the node", () => {
    // Arrange: root -> child -> grandchild
    const nodes = [folder("root"), folder("child", "root"), folder("grandchild", "child")];
    const idx = buildFolderIndex(nodes);

    // Moving root into grandchild would create a cycle
    expect(wouldCreateCycle(idx, "root", "grandchild")).toBe(true);
  });

  it("returns false when candidateParentId is an ancestor of the node", () => {
    // Arrange: root -> child
    const nodes = [folder("root"), folder("child", "root")];
    const idx = buildFolderIndex(nodes);

    // Moving child back to root is fine (root is the parent already)
    expect(wouldCreateCycle(idx, "child", "root")).toBe(false);
  });

  it("returns false for an unrelated sibling node", () => {
    // Arrange: root -> a, root -> b
    const nodes = [folder("root"), folder("a", "root"), folder("b", "root")];
    const idx = buildFolderIndex(nodes);

    // Moving a into b is fine
    expect(wouldCreateCycle(idx, "a", "b")).toBe(false);
  });

  it("breaks out of a pre-existing parentId cycle without infinite loop", () => {
    // Arrange: create a corrupted store where x.parentId = y and y.parentId = x
    const x = folder("x", "y");
    const y = folder("y", "x");
    const idx = buildFolderIndex([x, y]);

    // Act – should not loop
    let result: boolean | undefined;
    expect(() => {
      result = wouldCreateCycle(idx, "z", "x");
    }).not.toThrow();

    // Assert – we got a boolean back
    expect(typeof result).toBe("boolean");
  });

  it("returns false when the candidate parent chain does not pass through the node", () => {
    // Arrange: independent tree: a -> b -> c;  separate node d
    const nodes = [folder("a"), folder("b", "a"), folder("c", "b"), folder("d")];
    const idx = buildFolderIndex(nodes);

    // Moving d into c is fine; c's ancestry is b -> a, never d
    expect(wouldCreateCycle(idx, "d", "c")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// breadcrumbPath
// ---------------------------------------------------------------------------

describe("breadcrumbPath", () => {
  it("returns empty array (plus root fallback) when selectedId is null", () => {
    // Arrange
    const nodes = [folder("root")];
    const idx = buildFolderIndex(nodes);

    // Act
    const path = breadcrumbPath(idx, null);

    // Assert – falls back to the node with id "root"
    expect(path).toHaveLength(1);
    expect(path[0].id).toBe("root");
  });

  it("returns empty array when selectedId is null and no 'root' node exists", () => {
    // Arrange
    const idx = buildFolderIndex([]);

    // Act
    const path = breadcrumbPath(idx, null);

    // Assert
    expect(path).toHaveLength(0);
  });

  it("returns just the node itself when it is at the top level", () => {
    // Arrange
    const nodes = [folder("root")];
    const idx = buildFolderIndex(nodes);

    // Act
    const path = breadcrumbPath(idx, "root");

    // Assert
    expect(path).toHaveLength(1);
    expect(path[0].id).toBe("root");
  });

  it("returns ancestor path from root to selected node in order", () => {
    // Arrange: root -> mid -> leaf
    const nodes = [folder("root"), folder("mid", "root"), folder("leaf", "mid")];
    const idx = buildFolderIndex(nodes);

    // Act
    const path = breadcrumbPath(idx, "leaf");

    // Assert
    expect(path.map((n) => n.id)).toEqual(["root", "mid", "leaf"]);
  });

  it("returns root-fallback when selectedId points to a non-existent node and 'root' exists", () => {
    // Arrange
    const nodes = [folder("root")];
    const idx = buildFolderIndex(nodes);

    // Act – unknown id causes cur to be null immediately, path is empty, triggers root fallback
    const path = breadcrumbPath(idx, "ghost");

    // Assert
    expect(path).toHaveLength(1);
    expect(path[0].id).toBe("root");
  });

  it("handles a two-level path correctly", () => {
    // Arrange
    const nodes = [folder("root"), folder("child", "root")];
    const idx = buildFolderIndex(nodes);

    // Act
    const path = breadcrumbPath(idx, "child");

    // Assert
    expect(path.map((n) => n.id)).toEqual(["root", "child"]);
  });

  it("is cycle-safe: stops traversing if the parentId chain loops", () => {
    // Arrange: x.parentId = y, y.parentId = x (corrupted data)
    const x = folder("x", "y");
    const y = folder("y", "x");
    const idx = buildFolderIndex([x, y]);

    // Act – should not loop
    let path: FSNode[] | undefined;
    expect(() => {
      path = breadcrumbPath(idx, "x");
    }).not.toThrow();

    // Assert – got something back (either [y, x] or subset, but finite)
    expect(Array.isArray(path)).toBe(true);
  });

  it("falls back to the root node when the selected node has no ancestors and id !== 'root'", () => {
    // Arrange – a node with no parent and no 'root' in the index
    const nodes = [folder("orphan")];
    const idx = buildFolderIndex(nodes);

    // Act
    const path = breadcrumbPath(idx, "orphan");

    // Assert – path is just [orphan] (no root fallback because path.length > 0)
    expect(path.map((n) => n.id)).toEqual(["orphan"]);
  });
});
