/**
 * Pure column-profiling helpers.
 *
 * These run inside the CSV worker (off the main thread) over the FULL column,
 * not a 200-row preview sample, closing the "metadataSource: preview" gap noted
 * in the feature plan. Math is delegated to `simple-statistics` rather than
 * ad-hoc reductions.
 */

import {
  max as ssMax,
  mean as ssMean,
  median as ssMedian,
  min as ssMin,
  standardDeviation as ssStdev,
} from "simple-statistics";
import type { ColProfile, ColType } from "./types";

const DISTINCT_CAP = 50_000;
const TRUE_TOKENS = new Set(["true", "1", "yes", "oui"]);
const FALSE_TOKENS = new Set(["false", "0", "no", "non"]);
const BOOL_TOKENS = new Set([...TRUE_TOKENS, ...FALSE_TOKENS]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const DATE_SLASH_RE = /^\d{2}\/\d{2}\/\d{4}/;

function isNullish(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/**
 * Infer a column type from raw string values (whole column, cheap single pass).
 * Mirrors the legacy `detectType` thresholds but operates on the full column.
 */
export function detectType(values: unknown[]): ColType {
  let total = 0;
  let nums = 0;
  let dates = 0;
  let bools = 0;

  for (const value of values) {
    if (isNullish(value)) continue;
    total += 1;

    const text = String(value).trim().toLowerCase();

    if (BOOL_TOKENS.has(text)) {
      bools += 1;
    } else if (text !== "" && !Number.isNaN(Number(text.replace(/,/g, "")))) {
      nums += 1;
    } else if (DATE_RE.test(text) || DATE_SLASH_RE.test(text)) {
      dates += 1;
    }
  }

  if (total === 0) return "string";
  if (nums / total > 0.85) return "number";
  if (dates / total > 0.85) return "date";
  if (bools / total > 0.85) return "boolean";

  return "string";
}

/** Cast a single raw value to the requested type. */
export function castValue(value: unknown, type: ColType): unknown {
  if (isNullish(value)) return null;

  const text = String(value).trim();

  if (type === "number") {
    const numberValue = Number(text.replace(/,/g, ""));
    return Number.isNaN(numberValue) ? null : numberValue;
  }

  if (type === "boolean") {
    const normalized = text.toLowerCase();
    if (TRUE_TOKENS.has(normalized)) return true;
    if (FALSE_TOKENS.has(normalized)) return false;
    return null;
  }

  if (type === "date") {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? text : date.toISOString().slice(0, 10);
  }

  return text;
}

function histogram(sorted: number[], buckets: number): { x0: number; x1: number; n: number }[] {
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  if (lo === hi) {
    return [{ x0: lo, x1: hi, n: sorted.length }];
  }

  const width = (hi - lo) / buckets;
  const bins = Array.from({ length: buckets }, (_, i) => ({
    x0: lo + i * width,
    x1: lo + (i + 1) * width,
    n: 0,
  }));

  for (const value of sorted) {
    let index = Math.floor((value - lo) / width);
    if (index >= buckets) index = buckets - 1;
    if (index < 0) index = 0;
    bins[index].n += 1;
  }

  return bins;
}

/**
 * Profile a single (already-cast) column. Numeric stats use the cast numbers
 * directly; distinct counting is capped to bound memory on huge columns.
 */
export function profileColumn(name: string, values: unknown[], type: ColType): ColProfile {
  let nullCount = 0;
  const seen = new Set<string>();
  const nums: number[] = [];

  for (const value of values) {
    if (value === null || value === undefined || value === "") {
      nullCount += 1;
      continue;
    }

    if (seen.size < DISTINCT_CAP) {
      seen.add(typeof value === "string" ? value : String(value));
    }

    if (type === "number" && typeof value === "number") {
      nums.push(value);
    }
  }

  const profile: ColProfile = {
    name,
    type,
    nullCount,
    distinctApprox: seen.size,
    numericCount: nums.length,
  };

  if (nums.length > 0) {
    nums.sort((a, b) => a - b);
    profile.min = ssMin(nums);
    profile.max = ssMax(nums);
    profile.mean = ssMean(nums);
    profile.median = ssMedian(nums);
    profile.stdev = nums.length > 1 ? ssStdev(nums) : 0;
    profile.hist = histogram(nums, Math.min(24, Math.max(1, nums.length)));
  }

  return profile;
}
