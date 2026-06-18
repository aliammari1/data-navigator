// Pure predicates for the catalogue's smart filter chips.
//
// These let the Catalogue surface quick triage views (by format, unclassified,
// low quality, recent) WITHOUT duplicating the Explorer (full table) or Profil
// (column profiling). Kept dependency-free and pure so they are unit-testable.

import type { FSNode } from "../types";

export type CatalogFilter = "all" | "csv" | "parquet" | "unclassified" | "low-quality" | "recent";

/** Quality below this fraction (0–1) counts as "low quality". */
export const LOW_QUALITY_THRESHOLD = 0.7;
/** Datasets created within this many days count as "recent". */
export const RECENT_DAYS = 7;

const CSV_TYPES = new Set<FSNode["type"]>(["csv", "tsv", "txt"]);
const PARQUET_TYPES = new Set<FSNode["type"]>(["parquet", "pq"]);

export interface CatalogFilterCtx {
  /** True when the dataset is not filed under any folder. */
  isUnclassified: (id: string) => boolean;
  /** Current epoch ms (injected so the predicate stays pure/testable). */
  now: number;
}

/** True when `node` (a file/dataset node) matches `filter`. Folders never match a non-"all" filter. */
export function matchesFilter(node: FSNode, filter: CatalogFilter, ctx: CatalogFilterCtx): boolean {
  if (filter === "all") return true;
  if (node.type === "folder") return false;

  switch (filter) {
    case "csv":
      return CSV_TYPES.has(node.type);
    case "parquet":
      return PARQUET_TYPES.has(node.type);
    case "unclassified":
      return ctx.isUnclassified(node.id);
    case "low-quality":
      return node.quality !== undefined && node.quality < LOW_QUALITY_THRESHOLD;
    case "recent":
      return ctx.now - node.createdAt.getTime() <= RECENT_DAYS * 24 * 60 * 60 * 1000;
    default:
      return true;
  }
}

/** Filter a list of file nodes; returns the input unchanged for the "all" filter. */
export function filterFileNodes(
  fileNodes: FSNode[],
  filter: CatalogFilter,
  ctx: CatalogFilterCtx,
): FSNode[] {
  if (filter === "all") return fileNodes;
  return fileNodes.filter((node) => matchesFilter(node, filter, ctx));
}
