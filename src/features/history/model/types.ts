// ─── Types ─────────────────────────────────────────────────────────────────

export interface VersionEntry {
  id: string;
  version: string;
  timestamp: Date;
  author: string;
  email: string;
  message: string;
  type:
    | "create"
    | "update"
    | "delete"
    | "restore"
    | "merge"
    | "transform"
    | "schema";
  changes: {
    added: number;
    modified: number;
    deleted: number;
    schema?: number;
  };
  rowCount: number;
  colCount: number;
  fileSize: number; // bytes
  tags: string[];
  isCurrent: boolean;
  parentId?: string;
  branch: string;
  hash: string;
  stats?: {
    avgRevenue: number;
    totalRevenue: number;
    rowsWithNulls: number;
  };
}

export interface DiffLine {
  type: "added" | "removed" | "context" | "header" | "hunk";
  oldLine?: number;
  newLine?: number;
  content: string;
}

export interface ColumnDiff {
  name: string;
  changeType: "added" | "removed" | "modified" | "unchanged";
  oldValue?: string;
  newValue?: string;
}
