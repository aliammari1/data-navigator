// Shared types for the folders feature.

export type NodeType =
  | "folder"
  | "csv"
  | "tsv"
  | "txt"
  | "excel"
  | "parquet"
  | "pq"
  | "duckdb"
  | "sql"
  | "json";

export interface FSNode {
  id: string;
  name: string;
  type: NodeType;
  parentId: string | null;
  size: number;
  rowCount?: number;
  colCount?: number;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  starred: boolean;
  quality?: number;
  description?: string;
  color?: string;
}

/** A node positioned in the flattened, depth-aware visible tree. */
export interface FlatRow {
  node: FSNode;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

export type ViewMode = "tree-grid" | "grid" | "list";
export type SortKey = "name" | "size" | "updated" | "quality";
export type ActiveTab = "files" | "starred" | "recent" | "stats";
