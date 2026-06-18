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
  validity: number; // real local validity score (see validity-detail)
  validityDetail?: ColValidityDetail;
}

/**
 * Real, locally-computed validity signal for a column. Replaces the old
 * `type !== "unknown" ? 0.95 : 0.5` heuristic with a measured score derived
 * from a bounded reservoir sample of the column.
 */
export interface ColValidityDetail {
  /** 0..1 fraction of sampled non-null values that conform to the column type. */
  conformanceRate: number;
  /** 0..1 fraction of sampled numeric values flagged as outliers (MAD-based). */
  outlierRate: number;
  /** Inferred semantic type from format inference, if a strong match was found. */
  semanticType?:
    | "email"
    | "uuid"
    | "url"
    | "date"
    | "numeric"
    | "boolean"
    | "categorical";
  /** Number of non-null values inspected for this score. */
  sampleSize: number;
}

export interface QualityDimension {
  name: string;
  score: number;
  description: string;
  affected: string[];
}

/** Lazily-fetched, per-selected-column detail (distribution + frequencies). */
export interface ColumnDetail {
  column: string;
  topValues: { value: string; count: number; pct: number }[];
  histogram?: { lo: number; hi: number; count: number }[];
  minLen?: number;
  maxLen?: number;
  avgLen?: number;
  validityDetail?: ColValidityDetail;
}
