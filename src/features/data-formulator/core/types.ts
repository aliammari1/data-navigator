import type { ChartType } from "@/features/agent-canvas/core/types";

export type ColType = "number" | "string" | "date" | "boolean" | "unknown";

export interface ColumnInfo {
  name: string;
  type: ColType;
  dbType: string;
  derived?: boolean;
  derivedFrom?: string[];
  sql?: string; // SQL expression for derived columns
  prompt?: string; // NL prompt that produced this derived column
}

export type AggregateFn =
  | "none"
  | "count"
  | "sum"
  | "avg"
  | "min"
  | "max"
  | "median"
  | "distinct";

export interface Encoding {
  id: string;
  channel: "x" | "y" | "color" | "size" | "facet" | "tooltip";
  field: string;
  aggregate?: AggregateFn;
  sort?: "asc" | "desc" | "none";
  bin?: boolean;
}

export type FilterOp =
  | "="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "LIKE"
  | "IN"
  | "NOT NULL"
  | "IS NULL"
  | "BETWEEN";

export interface FilterDef {
  id: string;
  field: string;
  op: FilterOp;
  value: string;
}

export interface ChartSpec {
  id: string;
  type: ChartType;
  encodings: Encoding[];
  filters: FilterDef[];
  limit: number;
  title: string;
  topN?: number;
  showTrendline?: boolean;
  showOutliers?: boolean;
  insight?: string;
  pinnedAt?: number;
}

export interface QueryResult {
  sql: string;
  data: Record<string, unknown>[];
  duration: number;
  rowCount: number;
}

export interface DerivedField {
  id: string;
  name: string;
  sql: string;
  prompt: string;
  parents: string[];
  createdAt: number;
}

export interface DataThreadEntry {
  id: string;
  kind: "derive" | "chart" | "refine" | "filter" | "sandbox";
  message: string;
  detail?: string;
  ts: number;
  chartId?: string;
  fieldId?: string;
}
