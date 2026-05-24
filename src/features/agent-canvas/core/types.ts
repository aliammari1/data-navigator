// ─── Chart & Widget Types ─────────────────────────────────────────────────────

import type { NonEmptyArray } from "@/shared/types";

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

// ─── LLM Models ───────────────────────────────────────────────────────────────

export type ModelTier = "nano" | "small" | "medium";

export interface LLMModelDef {
  id: string;
  label: string;
  tier: ModelTier;
  description: string;
  sizeLabel: string;
  downloadMB: number;
  badge?: string;
}

export const MODEL_CATALOG: NonEmptyArray<LLMModelDef> = [
  {
    id: "HuggingFaceTB/SmolLM2-360M-Instruct",
    label: "SmolLM2 360M",
    tier: "nano",
    description:
      "Fastest — 360M params, great for SQL & planning. Loads in ~30s.",
    sizeLabel: "~400 MB",
    downloadMB: 400,
    badge: "Fastest",
  },
  {
    id: "HuggingFaceTB/SmolLM2-1.7B-Instruct",
    label: "SmolLM2 1.7B",
    tier: "small",
    description: "Balanced — 1.7B params, better reasoning & JSON accuracy.",
    sizeLabel: "~1.1 GB",
    downloadMB: 1100,
    badge: "Recommended",
  },
  {
    id: "Qwen/Qwen2.5-0.5B-Instruct",
    label: "Qwen 2.5 500M",
    tier: "nano",
    description:
      "Tiny but sharp — 500M params, excellent instruction following.",
    sizeLabel: "~600 MB",
    downloadMB: 600,
  },
  {
    id: "onnx-community/Qwen2.5-1.5B-Instruct",
    label: "Qwen 2.5 1.5B",
    tier: "small",
    description: "Smart — 1.5B params, strong multi-step JSON reasoning.",
    sizeLabel: "~1.2 GB",
    downloadMB: 1200,
  },
];

// ─── Schema & Profiling ───────────────────────────────────────────────────────

export type ColumnSemantic =
  | "numeric"
  | "categorical"
  | "datetime"
  | "boolean"
  | "id"
  | "text";

export interface ColumnProfile {
  name: string;
  duckType: string;
  semantic: ColumnSemantic;
  cardinality: number;
  nullRate: number;
  sample: string[];
  min?: number;
  max?: number;
  avg?: number;
}

export interface DataSchema {
  tableName: string;
  rowCount: number;
  columns: ColumnProfile[];
  category: string;
  summary: string;
  dimensions: string[]; // good GROUP BY cols (categorical, cardinality < 200)
  metrics: string[]; // good aggregate cols (numeric)
  timeDims: string[]; // temporal cols
}

// ─── Dashboard Plan ───────────────────────────────────────────────────────────

export interface WidgetPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetSpec {
  id: string;
  title: string;
  chartType: ChartType;
  sqlIntent: string; // NL description of what SQL should produce
  dimensions: string[]; // GROUP BY columns
  metrics: string[]; // aggregate columns
  position: WidgetPosition;
  reasoning?: string;
}

export interface DashboardPlan {
  title: string;
  description: string;
  widgets: WidgetSpec[];
}

// ─── Agent Thoughts ───────────────────────────────────────────────────────────

export type ThoughtKind =
  | "think"
  | "plan"
  | "sql"
  | "exec"
  | "chart"
  | "insight"
  | "ok"
  | "warn"
  | "err";

export interface AgentThought {
  id: string;
  agent: string;
  kind: ThoughtKind;
  text: string;
  ts: number;
}

// ─── Widget State ─────────────────────────────────────────────────────────────

export type WidgetStatus =
  | "pending"
  | "querying"
  | "building"
  | "done"
  | "error";

export interface KPICard {
  label: string;
  value: string;
  sub?: string;
  colorClass: string;
  iconHint?: string;
}

export interface WidgetState {
  spec: WidgetSpec;
  status: WidgetStatus;
  sql?: string;
  rawData?: Record<string, unknown>[];
  echartsOption?: Record<string, unknown>;
  kpis?: KPICard[];
  tableHeaders?: string[];
  tableRows?: string[][];
  insight?: string;
  error?: string;
}

// ─── Pipeline Events ──────────────────────────────────────────────────────────

export type PipelineEvent =
  | { kind: "thought"; thought: AgentThought }
  | { kind: "plan"; plan: DashboardPlan }
  | { kind: "widget-update"; widget: WidgetState }
  | { kind: "done" }
  | { kind: "error"; message: string };

export type PipelineCallback = (event: PipelineEvent) => void;

export type AgentPhase =
  | "idle"
  | "model-load"
  | "schema"
  | "plan"
  | "build"
  | "done"
  | "error";
