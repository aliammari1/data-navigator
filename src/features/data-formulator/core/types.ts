/**
 * Chart type union — the canonical home for every renderable chart kind in
 * this app (Formulator's manual shelf, the swarm agents, and Moudir chat's
 * `make_chart` tool artifacts all compile down to one of these).
 */
export type ChartType =
  | "bar"
  | "horizontal-bar"
  | "stacked-bar"
  | "stacked-horizontal-bar"
  | "line"
  | "area"
  | "multi-line"
  | "pie"
  | "donut"
  | "scatter"
  | "bubble"
  | "heatmap"
  | "treemap"
  | "radar"
  | "gauge"
  | "funnel"
  | "kpi-grid"
  | "data-table";

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

export type AggregateFn = "none" | "count" | "sum" | "avg" | "min" | "max" | "median" | "distinct";

export type TimeUnit = "hour" | "day" | "week" | "month" | "quarter" | "year";

export interface Encoding {
  id: string;
  channel: "x" | "y" | "color" | "size" | "facet" | "tooltip";
  field: string;
  aggregate?: AggregateFn;
  sort?: "asc" | "desc" | "none";
  bin?: boolean;
  // Temporal bucketing applied via DATE_TRUNC when the field is a date/timestamp
  timeUnit?: TimeUnit;
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
