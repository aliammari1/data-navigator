import type { FlatRow, FSNode } from "../types";

/**
 * Pre-computed indices over a flat `FSNode[]` so the tree can be walked,
 * searched and aggregated in O(N) instead of the previous O(N^2)
 * `allNodes.filter(...)`-per-node pattern.
 */
export interface FolderIndex {
  /** id -> node */
  byId: Map<string, FSNode>;
  /** parentId -> children, pre-sorted (folders first, then by name) */
  childrenOf: Map<string | null, FSNode[]>;
}

function compareNodes(a: FSNode, b: FSNode): number {
  if (a.type === "folder" && b.type !== "folder") return -1;
  if (a.type !== "folder" && b.type === "folder") return 1;
  return a.name.localeCompare(b.name);
}

export function buildFolderIndex(nodes: FSNode[]): FolderIndex {
  const byId = new Map<string, FSNode>();
  const childrenOf = new Map<string | null, FSNode[]>();
  for (const n of nodes) {
    byId.set(n.id, n);
    const bucket = childrenOf.get(n.parentId);
    if (bucket) bucket.push(n);
    else childrenOf.set(n.parentId, [n]);
  }
  for (const bucket of childrenOf.values()) bucket.sort(compareNodes);
  return { byId, childrenOf };
}

/**
 * Walk the visible (expanded) tree depth-first into a flat row list that the
 * virtualizer can render. Only expanded branches are descended, so the row
 * count is bounded by what the user can actually see.
 */
export function flattenVisible(
  index: FolderIndex,
  rootIds: string[],
  expanded: Set<string>,
  foldersOnly = false,
): FlatRow[] {
  const out: FlatRow[] = [];
  const walk = (id: string, depth: number) => {
    const node = index.byId.get(id);
    if (!node) return;
    if (foldersOnly && node.type !== "folder") return;
    const allChildren = index.childrenOf.get(id) ?? [];
    const children = foldersOnly ? allChildren.filter((c) => c.type === "folder") : allChildren;
    const isExpanded = expanded.has(id);
    out.push({
      node,
      depth,
      hasChildren: children.length > 0,
      isExpanded,
    });
    if (isExpanded) {
      for (const c of children) walk(c.id, depth + 1);
    }
  };
  for (const r of rootIds) walk(r, 0);
  return out;
}

/**
 * Single post-order pass computing the recursive byte size of every folder
 * subtree (datasets contribute their own `size`). Replaces the old
 * `getFolderSize` that re-filtered the whole node array at each recursion level.
 *
 * Cycle-safe: a `visiting` guard prevents infinite recursion even if the
 * persisted store somehow contains a parent cycle.
 */
export function computeFolderSizes(index: FolderIndex, rootId: string): Map<string, number> {
  const sizes = new Map<string, number>();
  const visiting = new Set<string>();
  const visit = (id: string): number => {
    if (visiting.has(id)) return sizes.get(id) ?? 0;
    visiting.add(id);
    let total = 0;
    for (const c of index.childrenOf.get(id) ?? []) {
      total += c.type === "folder" ? visit(c.id) : c.size;
    }
    sizes.set(id, total);
    visiting.delete(id);
    return total;
  };
  visit(rootId);
  return sizes;
}

/**
 * Returns true if `candidateParentId` is the node itself or one of its
 * descendants — i.e. re-parenting `id` there would create a cycle.
 *
 * Mirrors the guard that belongs in `folders-store.moveFolder`; used by the
 * drop handler so the UI never asks the store to create a cycle.
 */
export function wouldCreateCycle(
  index: FolderIndex,
  id: string,
  candidateParentId: string | null,
): boolean {
  if (candidateParentId === null) return false;
  if (candidateParentId === id) return true;
  let cur: string | null = candidateParentId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === id) return true;
    if (seen.has(cur)) break; // pre-existing cycle: stop scanning
    seen.add(cur);
    cur = index.byId.get(cur)?.parentId ?? null;
  }
  return false;
}

/** Path from root to the given node id (inclusive), for breadcrumbs. */
export function breadcrumbPath(index: FolderIndex, selectedId: string | null): FSNode[] {
  const path: FSNode[] = [];
  let cur = selectedId ? (index.byId.get(selectedId) ?? null) : null;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.unshift(cur);
    cur = cur.parentId ? (index.byId.get(cur.parentId) ?? null) : null;
  }
  if (path.length === 0) {
    const root = index.byId.get("root");
    if (root) path.push(root);
  }
  return path;
}
