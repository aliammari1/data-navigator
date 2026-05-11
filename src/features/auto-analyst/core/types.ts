// Shared types for the Auto-Analyst engine.

export type SemanticType =
  | "id"
  | "datetime"
  | "numeric"
  | "boolean"
  | "categorical"
  | "text";

export interface ColumnProfile {
  name: string;
  duckType: string;
  semantic: SemanticType;
  nonNull: number;
  nullRate: number;
  cardinality: number;
  rowCount: number;
  min?: number | string;
  max?: number | string;
  avg?: number;
  median?: number;
  stddev?: number;
  topValues?: Array<{ value: unknown; count: number }>;
  histogram?: Array<{ bucket: string; count: number }>;
}

export interface QualityAxis {
  name:
    | "completeness"
    | "uniqueness"
    | "validity"
    | "consistency"
    | "freshness";
  score: number; // 0-100
  detail: string;
  issues: string[];
}

export interface QualityReport {
  score: number; // 0-100 composite
  axes: QualityAxis[];
  recommendations: Array<{
    severity: "info" | "warning" | "danger";
    title: string;
    detail: string;
    fix?: string;
  }>;
}

export interface Hypothesis {
  id: string;
  question: string;
  rationale: string;
  priority: "high" | "medium" | "low";
  parents: string[];
  status?: "open" | "accepted" | "dismissed";
}

export interface StatTest {
  id: string;
  kind: "t-test" | "chi-square" | "pearson" | "spearman" | "anova";
  vars: string[];
  statistic: number;
  pValue: number;
  effectSize?: number;
  effectSizeName?: string;
  n: number;
  significant: boolean;
  caveats: string[];
}

export interface CorrelationCell {
  a: string;
  b: string;
  r: number; // Pearson
  n: number;
}

export interface AnomalyHit {
  id: string;
  rowId?: number | string;
  column: string;
  value: number;
  zScore: number;
  reason: "z-score" | "iqr" | "hampel" | "ml" | "ts";
}

export interface ClusterResult {
  k: number;
  labels: number[];
  centroids: number[][];
  features: string[];
  sizePerCluster: number[];
  sse?: number;
}

export interface ForecastPoint {
  t: number; // unix-ms or step idx
  yhat: number;
  yLow80: number;
  yHigh80: number;
  yLow95: number;
  yHigh95: number;
}

export interface ForecastSeries {
  column: string;
  history: Array<{ t: number; y: number }>;
  forecast: ForecastPoint[];
  source: "linear" | "onnx";
}

export interface CohortMatrix {
  cohorts: string[];
  periods: number[];
  values: number[][];
}

export interface FunnelStage {
  name: string;
  count: number;
  conversion: number;
}

export interface RFMSegment {
  segment: string;
  count: number;
  meanRecency: number;
  meanFrequency: number;
  meanMonetary: number;
}

export interface NarrativeBullet {
  id: string;
  severity: "info" | "warning" | "danger" | "success" | "accent";
  title: string;
  detail: string;
  evidence?: string; // SQL or chart spec ref
}

export interface Recommendation {
  id: string;
  severity: "info" | "warning" | "danger";
  action: string;
  why: string;
  evidence?: string;
}

export interface LineageEntry {
  id: string;
  step: AnalystStepId;
  message: string;
  detail?: string;
  ts: number;
  durationMs?: number;
}

export interface KPISnapshot {
  table: string;
  ts: number;
  values: Record<string, number>;
}

export type AnalystStepId =
  | "brief"
  | "profile"
  | "quality"
  | "hypotheses"
  | "statistics"
  | "distributions"
  | "anomalies"
  | "correlations"
  | "segmentation"
  | "forecast"
  | "cohort"
  | "funnel"
  | "rfm"
  | "narrative"
  | "recommendations"
  | "sandbox"
  | "sql"
  | "report"
  | "lineage";

export type StepStatus = "idle" | "running" | "done" | "error";

export interface StepState<T = unknown> {
  status: StepStatus;
  result?: T;
  error?: string;
  durationMs?: number;
  ranAt?: number;
}

export interface AnalystState {
  table: string;
  question?: string;
  brief?: { dataset: string; question: string; targetMetric?: string };
  profile?: StepState<ColumnProfile[]>;
  quality?: StepState<QualityReport>;
  hypotheses?: StepState<Hypothesis[]>;
  statistics?: StepState<StatTest[]>;
  distributions?: StepState<Record<string, string>>;
  anomalies?: StepState<AnomalyHit[]>;
  correlations?: StepState<CorrelationCell[]>;
  segmentation?: StepState<ClusterResult>;
  forecast?: StepState<ForecastSeries[]>;
  cohort?: StepState<CohortMatrix>;
  funnel?: StepState<FunnelStage[]>;
  rfm?: StepState<RFMSegment[]>;
  narrative?: StepState<NarrativeBullet[]>;
  recommendations?: StepState<Recommendation[]>;
  lineage: LineageEntry[];
  isTelecom?: boolean;
}
