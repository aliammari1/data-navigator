// ─── Types ───────────────────────────────────────────────────────────────────

export type ColType = "string" | "number" | "date" | "boolean" | "email" | "url";

export interface ColumnDef {
  id: string;
  name: string;
  type: ColType;
  width: number;
  visible: boolean;
  pinned: "left" | "right" | null;
  sortable: boolean;
  filterable: boolean;
  dbType: string;
}

export interface FilterRule {
  id: string;
  column: string;
  operator:
    | "eq"
    | "neq"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "contains"
    | "not_contains"
    | "starts_with"
    | "ends_with"
    | "is_null"
    | "is_not_null"
    | "in"
    | "between";
  value: string;
  value2?: string; // for between
  active: boolean;
}

export interface FilterGroup {
  id: string;
  logic: "AND" | "OR";
  rules: FilterRule[];
  name: string;
  saved: boolean;
}

export interface SortConfig {
  column: string;
  direction: "asc" | "desc";
  priority: number;
}

export interface ColumnStats {
  min: unknown;
  max: unknown;
  avg: unknown;
  nullCount: number;
  distinctCount: number;
  histogram: Array<{ bucket: string; count: number }>;
  loading: boolean;
}

export interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  createdAt: Date;
  rowCount?: number;
}

export interface CellSelection {
  rowIdx: number;
  colId: string;
}

export type ViewMode = "table" | "cards" | "analytics" | "sql";
