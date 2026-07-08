// ─── Types ────────────────────────────────────────────────────────────────────

export interface ColStat {
  name: string;
  type: "numeric" | "categorical" | "datetime" | "boolean";
  min?: number;
  max?: number;
  avg?: number;
  stddev?: number;
  median?: number;
  /** First quartile (25th percentile), DuckDB `quantile_cont`. */
  q1?: number;
  /** Third quartile (75th percentile), DuckDB `quantile_cont`. */
  q3?: number;
  /** 1st percentile — robust lower bound for chart/anomaly framing. */
  p01?: number;
  /** 99th percentile — robust upper bound for chart/anomaly framing. */
  p99?: number;
  nullCount: number;
  distinctCount: number;
  rowCount: number;
  histogram?: number[];
  topValues?: { value: string; count: number }[];
  skewness?: number;
  kurtosis?: number;
}

export interface Anomaly {
  id: string;
  column: string;
  type: "outlier" | "spike" | "missing" | "invalid" | "distribution_shift";
  description: string;
  severity: "critical" | "warning" | "info";
  affectedRows: number;
  score: number;
  values?: number[];
  threshold?: number;
  /** Detection method used (e.g. "IQR (Tukey fence)") for transparency. */
  method?: string;
}

export interface ForecastMeta {
  metricCol: string | null;
  dateCol: string | null;
  method: string;
}

export interface Correlation {
  col1: string;
  col2: string;
  pearson: number;
  strength: "very_strong" | "strong" | "moderate" | "weak" | "none";
  direction: "positive" | "negative" | "none";
}

export interface ForecastPoint {
  period: string;
  actual?: number;
  predicted: number;
  lower: number;
  upper: number;
}

export interface Insight {
  id: string;
  category: "anomaly" | "trend" | "correlation" | "quality" | "pattern" | "forecast";
  title: string;
  description: string;
  severity: "critical" | "warning" | "info" | "success";
  confidence: number;
  impact: "high" | "medium" | "low";
  metric?: string;
  value?: string;
  change?: number;
  acknowledged: boolean;
}

export interface ClusterGroup {
  id: number;
  label: string;
  size: number;
  centroid: Record<string, number>;
  characteristics: string[];
  color: string;
}

export interface AnalysisState {
  status: "idle" | "running" | "done" | "error";
  progress: number;
  stage: string;
}
