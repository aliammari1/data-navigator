import Fuse from "fuse.js";
import { useDeferredValue, useMemo } from "react";
import type { FSNode } from "../types";

/**
 * Ranked, typo-tolerant fuzzy search over the catalog using fuse.js
 * (already a project dependency). The index is rebuilt only when `nodes`
 * changes; `useDeferredValue` keeps typing responsive on large catalogs.
 *
 * Returns `null` when there is no query (caller should show the unfiltered
 * list), otherwise a `Set` of matching node ids ordered by relevance.
 */
export function useFolderSearch(nodes: FSNode[], query: string): Set<string> | null {
  const fuse = useMemo(
    () =>
      new Fuse(nodes, {
        keys: [
          { name: "name", weight: 2 },
          { name: "tags", weight: 1 },
          { name: "description", weight: 0.5 },
        ],
        threshold: 0.35,
        ignoreLocation: true,
        minMatchCharLength: 2,
      }),
    [nodes],
  );

  const deferredQuery = useDeferredValue(query);

  return useMemo(() => {
    const q = deferredQuery.trim();
    if (!q) return null;
    return new Set(fuse.search(q).map((r) => r.item.id));
  }, [fuse, deferredQuery]);
}
