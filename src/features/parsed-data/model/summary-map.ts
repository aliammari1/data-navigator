/**
 * Pure, React-free mapping from DuckDB `SUMMARIZE` output to `ColProfile`, plus
 * dataset-level quality aggregation, lazy column-detail parsing, and a real
 * (locally computed) validity score.
 *
 * These functions are intentionally side-effect free so they can run either on
 * the main thread or inside the profiling Web Worker (see
 * `../worker/profile.worker.ts`).
 */

import { medianAbsoluteDeviation, median as ssMedian } from "simple-statistics";
import { nullRateFromSummary, numberOrUndefined } from "@/shared/duckdb-summary";
import type { ColProfile, ColumnDetail, ColValidityDetail, QualityDimension } from "./types";

// Re-exported so existing `@/features/parsed-data/model/summary-map` consumers
// keep importing these from one place, while the implementations live in the
// shared, pure `@/shared/duckdb-summary` module.
export { nullRateFromSummary, numberOrUndefined };

// ─── SUMMARIZE row shape ──────────────────────────────────────────────────────

/**
 * One `SUMMARIZE` row as returned by DuckDB. Field presence varies by DuckDB
 * version and by column type, so every field is read defensively.
 */
export interface SummarizeRow {
  column_name?: unknown;
  column_type?: unknown;
  min?: unknown;
  max?: unknown;
  approx_unique?: unknown;
  avg?: unknown;
  std?: unknown;
  q25?: unknown;
  q50?: unknown;
  q75?: unknown;
  count?: unknown;
  null_percentage?: unknown;
}

// ─── Primitive coercion ───────────────────────────────────────────────────────

function numberOr(value: unknown, fallback: number): number {
  const parsed = numberOrUndefined(value);
  return parsed ?? fallback;
}

// ─── Type inference ───────────────────────────────────────────────────────────

export function toProfileType(sqlType: string): ColProfile["type"] {
  const type = sqlType.toUpperCase();

  if (/TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT/.test(type)) {
    return "integer";
  }

  if (/DECIMAL|DOUBLE|FLOAT|REAL|NUMERIC/.test(type)) return "float";
  if (/BOOL/.test(type)) return "boolean";
  if (/DATE|TIME|TIMESTAMP|INTERVAL/.test(type)) return "date";
  if (/VARCHAR|TEXT|CHAR|STRING|UUID|BLOB/.test(type)) return "string";

  return "unknown";
}

export function isNumericType(type: ColProfile["type"]): boolean {
  return type === "integer" || type === "float";
}

// ─── SUMMARIZE row → ColProfile ───────────────────────────────────────────────

/**
 * Map one `SUMMARIZE` row straight into a `ColProfile`. This collapses what was
 * previously 2–4 sequential per-column scans into a single whole-dataset scan.
 *
 * `validity` is initialised from a type-based prior here; it is upgraded to a
 * measured score by {@link applyValidityDetail} once a reservoir sample arrives.
 */
export function summaryRowToProfile(row: SummarizeRow, index: number): ColProfile {
  const sqlType = String(row.column_type ?? "");
  const type = toProfileType(sqlType);
  const total = numberOr(row.count, 0);
  const nullRate = nullRateFromSummary(row.null_percentage);
  const nullCount = Math.round(total * nullRate);
  const distinctCount = numberOr(row.approx_unique, 0);
  const numeric = isNumericType(type);

  return {
    name: String(row.column_name ?? `column_${index + 1}`),
    index,
    type,
    sqlType,
    rowCount: total,
    nullCount,
    nullRate,
    distinctCount,
    uniquenessRate: total > 0 ? distinctCount / total : 0,
    min: numeric ? numberOrUndefined(row.min) : undefined,
    max: numeric ? numberOrUndefined(row.max) : undefined,
    avg: numeric ? numberOrUndefined(row.avg) : undefined,
    stddev: numeric ? numberOrUndefined(row.std) : undefined,
    median: numeric ? numberOrUndefined(row.q50) : undefined,
    p25: numeric ? numberOrUndefined(row.q25) : undefined,
    p75: numeric ? numberOrUndefined(row.q75) : undefined,
    topValues: [],
    completeness: 1 - nullRate,
    uniqueness: Math.min(1, distinctCount / Math.max(total * 0.5, 1)),
    // Type-based prior; replaced by a measured score from the sample.
    validity: type !== "unknown" ? 0.9 : 0.5,
  };
}

export function profilesFromSummary(rows: SummarizeRow[]): ColProfile[] {
  return rows.map((row, index) => summaryRowToProfile(row, index));
}

export function profileScore(profile: ColProfile): number {
  return profile.completeness * 0.5 + profile.uniqueness * 0.25 + profile.validity * 0.25;
}

// ─── Filtering & sorting (off-main-thread) ────────────────────────────────────

export type ProfileSortKey = "name" | "nullRate" | "distinctCount" | "quality";

export type ProfileTypeFilter = ColProfile["type"] | "all";

export type ProfileQualityFilter = "all" | "excellent" | "good" | "fair" | "poor";

export interface ProfileQuery {
  search: string;
  typeFilter: ProfileTypeFilter;
  qualityFilter: ProfileQualityFilter;
  sortBy: ProfileSortKey;
  sortAsc: boolean;
}

export const defaultProfileQuery: ProfileQuery = {
  search: "",
  typeFilter: "all",
  qualityFilter: "all",
  sortBy: "quality",
  sortAsc: false,
};

function matchesQualityFilter(filter: ProfileQualityFilter, score: number): boolean {
  switch (filter) {
    case "excellent":
      return score >= 0.9;
    case "good":
      return score >= 0.7 && score < 0.9;
    case "fair":
      return score >= 0.5 && score < 0.7;
    case "poor":
      return score < 0.5;
    default:
      return true;
  }
}

/**
 * Pure filter + sort over the profile list. Lives here (React-free) so it can
 * run inside the profiling worker on every keystroke without ever touching the
 * renderer main thread.
 */
export function filterSortProfiles(profiles: ColProfile[], query: ProfileQuery): ColProfile[] {
  let list = profiles;

  const search = query.search.trim().toLowerCase();
  if (search) {
    list = list.filter(
      (profile) =>
        profile.name.toLowerCase().includes(search) ||
        profile.type.includes(search) ||
        profile.sqlType.toLowerCase().includes(search),
    );
  }

  if (query.typeFilter !== "all") {
    list = list.filter((profile) => profile.type === query.typeFilter);
  }

  if (query.qualityFilter !== "all") {
    list = list.filter((profile) =>
      matchesQualityFilter(query.qualityFilter, profileScore(profile)),
    );
  }

  const sorted = list.slice();
  const { sortBy, sortAsc } = query;

  sorted.sort((a, b) => {
    if (sortBy === "name") {
      return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    }

    let first = 0;
    let second = 0;
    if (sortBy === "nullRate") {
      first = a.nullRate;
      second = b.nullRate;
    } else if (sortBy === "distinctCount") {
      first = a.distinctCount;
      second = b.distinctCount;
    } else {
      first = profileScore(a);
      second = profileScore(b);
    }

    return sortAsc ? first - second : second - first;
  });

  return sorted;
}

// ─── Quality dimensions ───────────────────────────────────────────────────────

export function buildQualityDimensions(profiles: ColProfile[]): QualityDimension[] {
  const profileCount = Math.max(profiles.length, 1);
  const avgCompleteness =
    profiles.reduce((sum, profile) => sum + profile.completeness, 0) / profileCount;
  const avgUniqueness =
    profiles.reduce((sum, profile) => sum + profile.uniquenessRate, 0) / profileCount;
  const avgValidity = profiles.reduce((sum, profile) => sum + profile.validity, 0) / profileCount;
  const consistency = profiles.filter((profile) => profile.nullRate < 0.01).length / profileCount;

  return [
    {
      name: "Completeness",
      score: avgCompleteness,
      description: "Proportion of non-null values across all columns",
      affected: profiles
        .filter((profile) => profile.completeness < 0.95)
        .map((profile) => profile.name),
    },
    {
      name: "Uniqueness",
      score: Math.min(1, avgUniqueness * 2),
      description: "How unique values are relative to total rows",
      affected: profiles
        .filter((profile) => profile.uniquenessRate < 0.1)
        .map((profile) => profile.name),
    },
    {
      name: "Validity",
      score: avgValidity,
      description: "Values conform to expected type and format",
      affected: profiles.filter((profile) => profile.validity < 0.8).map((profile) => profile.name),
    },
    {
      name: "Consistency",
      score: consistency,
      description: "Columns with less than 1% null values",
      affected: profiles
        .filter((profile) => profile.nullRate >= 0.01)
        .map((profile) => profile.name),
    },
  ];
}

// ─── Real validity scoring (runs on a bounded sample) ─────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URL_RE = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const NUMERIC_RE = /^[+-]?(\d{1,3}(,\d{3})*|\d+)(\.\d+)?([eE][+-]?\d+)?$/;
const BOOL_VALUES = new Set(["true", "false", "t", "f", "yes", "no", "y", "n", "0", "1"]);

function fractionMatching(values: string[], re: RegExp): number {
  if (values.length === 0) return 0;
  let hits = 0;
  for (const value of values) {
    if (re.test(value)) hits += 1;
  }
  return hits / values.length;
}

function inferSemanticType(
  type: ColProfile["type"],
  sample: string[],
): ColValidityDetail["semanticType"] | undefined {
  if (sample.length === 0) return undefined;
  if (type === "boolean") return "boolean";
  if (type === "date") return "date";
  if (isNumericType(type)) return "numeric";

  if (fractionMatching(sample, EMAIL_RE) >= 0.9) return "email";
  if (fractionMatching(sample, UUID_RE) >= 0.9) return "uuid";
  if (fractionMatching(sample, URL_RE) >= 0.9) return "url";
  if (fractionMatching(sample, DATE_RE) >= 0.9) return "date";
  if (fractionMatching(sample, NUMERIC_RE) >= 0.9) return "numeric";

  const lowered = sample.map((value) => value.toLowerCase());
  if (lowered.every((value) => BOOL_VALUES.has(value))) return "boolean";

  return "categorical";
}

/**
 * Compute a measured validity score for a column from a bounded reservoir
 * sample of its **non-null string-cast** values plus, for numeric columns, the
 * raw numeric sample. Returns a 0..1 score and a breakdown.
 *
 * - numeric: conformance = fraction parseable as finite numbers;
 *   outlierRate = MAD-based outlier fraction (robust to skew).
 * - date: conformance = fraction matching an ISO-ish date pattern OR parseable.
 * - string: conformance = format consistency for the inferred semantic type.
 * - boolean: conformance = fraction in the recognised boolean vocabulary.
 */
export function computeValidityDetail(
  type: ColProfile["type"],
  sample: string[],
): ColValidityDetail {
  const cleaned = sample.filter((value) => value.length > 0);
  const sampleSize = cleaned.length;

  if (sampleSize === 0) {
    return {
      conformanceRate: type === "unknown" ? 0.5 : 0.9,
      outlierRate: 0,
      sampleSize: 0,
      semanticType: undefined,
    };
  }

  const semanticType = inferSemanticType(type, cleaned);
  let conformanceRate = 1;
  let outlierRate = 0;

  if (isNumericType(type)) {
    const nums = cleaned.map((value) => Number(value)).filter((value) => Number.isFinite(value));
    conformanceRate = nums.length / sampleSize;
    outlierRate = madOutlierRate(nums);
  } else if (type === "date") {
    let ok = 0;
    for (const value of cleaned) {
      if (DATE_RE.test(value) || Number.isFinite(Date.parse(value))) ok += 1;
    }
    conformanceRate = ok / sampleSize;
  } else if (type === "boolean") {
    conformanceRate = fractionMatching(cleaned, /.*/) // base
      ? cleaned.filter((value) => BOOL_VALUES.has(value.toLowerCase())).length / sampleSize
      : 0;
  } else if (semanticType === "email") {
    conformanceRate = fractionMatching(cleaned, EMAIL_RE);
  } else if (semanticType === "uuid") {
    conformanceRate = fractionMatching(cleaned, UUID_RE);
  } else if (semanticType === "url") {
    conformanceRate = fractionMatching(cleaned, URL_RE);
  } else {
    // Generic string: penalise length instability (coefficient of variation).
    conformanceRate = lengthStability(cleaned);
  }

  return {
    conformanceRate: clamp01(conformanceRate),
    outlierRate: clamp01(outlierRate),
    semanticType,
    sampleSize,
  };
}

/** MAD-based outlier fraction. Values > 3.5 modified z-scores are outliers. */
function madOutlierRate(nums: number[]): number {
  if (nums.length < 8) return 0;
  const med = ssMedian(nums);
  const mad = medianAbsoluteDeviation(nums);
  if (mad === 0) return 0;
  // 0.6745 scales MAD to be a consistent estimator of the standard deviation.
  let outliers = 0;
  for (const value of nums) {
    const modifiedZ = Math.abs((0.6745 * (value - med)) / mad);
    if (modifiedZ > 3.5) outliers += 1;
  }
  return outliers / nums.length;
}

/** 0..1 length-consistency score: 1 for uniform length, lower for high spread. */
function lengthStability(values: string[]): number {
  const lengths = values.map((value) => value.length);
  const mean = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
  if (mean === 0) return 1;
  const variance = lengths.reduce((sum, value) => sum + (value - mean) ** 2, 0) / lengths.length;
  const cv = Math.sqrt(variance) / mean;
  // Map coefficient of variation 0→1 score, saturating around cv≈1.
  return clamp01(1 - cv);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Fold a measured {@link ColValidityDetail} into a profile's `validity` score
 * and propagate the detail for the Quality tab.
 */
export function applyValidityDetail(profile: ColProfile, detail: ColValidityDetail): ColProfile {
  const validity = clamp01(detail.conformanceRate * (1 - detail.outlierRate));
  return { ...profile, validity, validityDetail: detail };
}

// ─── Lazy column detail (top-k + histogram) ───────────────────────────────────

/** Raw rows returned by the lazy detail queries (see `useColumnDetail`). */
export interface DetailQueryResult {
  column: string;
  type: ColProfile["type"];
  rowCount: number;
  /** Rows: `{ val: string | null, cnt: number }`. */
  topRows: Array<{ val: unknown; cnt: unknown }>;
  /** Rows: `{ lo: number, cnt: number }` (numeric only). */
  histogramRows: Array<{ lo: unknown; hi: unknown; cnt: unknown }>;
  /** String-length stats `{ min_len, max_len, avg_len }` (string only). */
  lengthStats?: { min_len: unknown; max_len: unknown; avg_len: unknown };
  /** Reservoir sample of non-null string-cast values for validity scoring. */
  validitySample: string[];
}

export function parseColumnDetail(result: DetailQueryResult): ColumnDetail {
  const total = result.rowCount;

  const topValues = result.topRows.map((row) => {
    const count = numberOr(row.cnt, 0);
    return {
      value: row.val === null || row.val === undefined ? "" : String(row.val),
      count,
      pct: total > 0 ? count / total : 0,
    };
  });

  let histogram: ColumnDetail["histogram"];
  if (isNumericType(result.type) && result.histogramRows.length > 0) {
    histogram = result.histogramRows.map((row) => {
      const lo = numberOr(row.lo, 0);
      const hi = numberOrUndefined(row.hi);
      return {
        lo,
        hi: hi ?? lo,
        count: numberOr(row.cnt, 0),
      };
    });
  }

  const validityDetail = computeValidityDetail(result.type, result.validitySample);

  return {
    column: result.column,
    topValues,
    histogram,
    minLen: result.lengthStats ? numberOrUndefined(result.lengthStats.min_len) : undefined,
    maxLen: result.lengthStats ? numberOrUndefined(result.lengthStats.max_len) : undefined,
    avgLen: result.lengthStats ? numberOrUndefined(result.lengthStats.avg_len) : undefined,
    validityDetail,
  };
}
