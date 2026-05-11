// ─── Types ─────────────────────────────────────────────────────────────────

export interface ColProfile {
  name: string;
  index: number;
  type: "integer" | "float" | "string" | "boolean" | "date" | "unknown";
  sqlType: string;
  rowCount: number;
  nullCount: number;
  nullRate: number;
  distinctCount: number;
  uniquenessRate: number;
  // numeric
  min?: number;
  max?: number;
  avg?: number;
  stddev?: number;
  median?: number;
  p25?: number;
  p75?: number;
  sum?: number;
  // string
  minLen?: number;
  maxLen?: number;
  avgLen?: number;
  // top values
  topValues: { value: string; count: number; pct: number }[];
  // histogram bins (numeric)
  histogram?: { lo: number; hi: number; count: number }[];
  // quality scores
  completeness: number; // 1 - nullRate
  uniqueness: number; // uniquenessRate
  validity: number; // heuristic based on type consistency
}

export interface QualityDimension {
  name: string;
  score: number;
  description: string;
  affected: string[];
}
