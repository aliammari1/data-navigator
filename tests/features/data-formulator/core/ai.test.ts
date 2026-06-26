import { describe, it, expect } from "vitest";
import {
  flagOutliers,
  linearTrendline,
} from "@/features/data-formulator/core/ai";

// ─── flagOutliers ─────────────────────────────────────────────────────────────

describe("flagOutliers", () => {
  it("returns all-false for an empty array (length < 4)", () => {
    expect(flagOutliers([])).toEqual([]);
  });

  it("returns all-false for a single-element array (length < 4)", () => {
    expect(flagOutliers([42])).toEqual([false]);
  });

  it("returns all-false for a two-element array (length < 4)", () => {
    expect(flagOutliers([1, 2])).toEqual([false, false]);
  });

  it("returns all-false for a three-element array (length < 4)", () => {
    expect(flagOutliers([1, 2, 3])).toEqual([false, false, false]);
  });

  it("returns all-false when all values are identical (no outliers)", () => {
    // IQR = 0, lo = hi = value; no element is strictly < lo or > hi.
    const result = flagOutliers([5, 5, 5, 5, 5]);
    expect(result).toEqual([false, false, false, false, false]);
  });

  it("returns all-false for tightly clustered values with no outliers", () => {
    // [1, 2, 3, 4]: q1=1, q3=3, iqr=2, lo=-2, hi=6 → no outliers
    const result = flagOutliers([1, 2, 3, 4]);
    expect(result).toEqual([false, false, false, false]);
  });

  it("flags a value that is below the lower fence (v < lo)", () => {
    // Dataset [1, 2, 3, 4, 5, 6, 7, 100] — 100 is a high outlier.
    // Use a low outlier: [-100, 2, 3, 4, 5, 6, 7, 8]
    const values = [-100, 2, 3, 4, 5, 6, 7, 8];
    const result = flagOutliers(values);
    expect(result[0]).toBe(true); // -100 should be flagged
  });

  it("flags a value that is above the upper fence (v > hi)", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 100];
    const result = flagOutliers(values);
    expect(result[7]).toBe(true); // 100 should be flagged
  });

  it("does not flag values that are within the fences", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 100];
    const result = flagOutliers(values);
    // Non-outlier values in the middle should all be false
    expect(result.slice(0, 7).every((v) => v === false)).toBe(true);
  });

  it("returns a boolean array of the same length as input", () => {
    const values = [10, 20, 30, 40, 50];
    const result = flagOutliers(values);
    expect(result).toHaveLength(5);
    result.forEach((v) => expect(typeof v).toBe("boolean"));
  });

  it("does not mutate the original array", () => {
    const values = [3, 1, 4, 1, 5, 9, 2, 6];
    const original = [...values];
    flagOutliers(values);
    expect(values).toEqual(original);
  });

  it("flags both a low and a high outlier simultaneously", () => {
    // Normal range cluster around 50; extremes far outside fences
    const values = [50, 51, 49, 50, 52, 48, 1000, -1000];
    const result = flagOutliers(values);
    // The extreme values should be flagged
    const highIndex = values.indexOf(1000);
    const lowIndex = values.indexOf(-1000);
    expect(result[highIndex]).toBe(true);
    expect(result[lowIndex]).toBe(true);
  });

  it("handles negative numbers correctly without flagging non-outliers", () => {
    const values = [-4, -3, -2, -1];
    const result = flagOutliers(values);
    expect(result).toEqual([false, false, false, false]);
  });

  it("handles exactly 4 elements (minimum for IQR path)", () => {
    const values = [10, 20, 30, 40];
    const result = flagOutliers(values);
    expect(result).toHaveLength(4);
  });
});

// ─── linearTrendline ─────────────────────────────────────────────────────────

describe("linearTrendline", () => {
  it("returns a copy of input for an empty array (n < 2)", () => {
    const result = linearTrendline([]);
    expect(result).toEqual([]);
  });

  it("returns a copy (not same reference) for a single element (n < 2)", () => {
    const input = [42];
    const result = linearTrendline(input);
    expect(result).toEqual([42]);
    expect(result).not.toBe(input);
  });

  it("does not mutate original array when n < 2", () => {
    const input = [7];
    const original = [...input];
    linearTrendline(input);
    expect(input).toEqual(original);
  });

  it("computes correct trendline for two points on a perfect line", () => {
    // [0, 2]: slope=2, intercept=0 → trendline=[0, 2]
    const result = linearTrendline([0, 2]);
    expect(result).toHaveLength(2);
    expect(result[0]).toBeCloseTo(0, 5);
    expect(result[1]).toBeCloseTo(2, 5);
  });

  it("computes correct trendline for a perfectly flat series", () => {
    // All identical values → slope = 0, every output = meanY
    const result = linearTrendline([5, 5, 5, 5]);
    result.forEach((v) => expect(v).toBeCloseTo(5, 5));
  });

  it("handles den === 0 case (all x deviations sum to zero — impossible with distinct xs but den=0 means all xs same, which cannot happen for n>=2 with sequential xs; cover by verifying slope=0 for constant input)", () => {
    // With sequential xs [0,1,...,n-1], den is always > 0 for n>=2.
    // Constant Y → num=0, slope=0/den=0. This exercises the slope=0 path,
    // but den itself won't be 0 with sequential indices. Still verify output.
    const result = linearTrendline([3, 3, 3]);
    result.forEach((v) => expect(v).toBeCloseTo(3, 5));
  });

  it("computes a positive slope trendline correctly", () => {
    // [1, 2, 3, 4, 5]: perfect linear, slope=1, intercept=1
    const result = linearTrendline([1, 2, 3, 4, 5]);
    expect(result[0]).toBeCloseTo(1, 5);
    expect(result[1]).toBeCloseTo(2, 5);
    expect(result[2]).toBeCloseTo(3, 5);
    expect(result[3]).toBeCloseTo(4, 5);
    expect(result[4]).toBeCloseTo(5, 5);
  });

  it("computes a negative slope trendline correctly", () => {
    // [5, 4, 3, 2, 1]: slope=-1, intercept=5
    const result = linearTrendline([5, 4, 3, 2, 1]);
    expect(result[0]).toBeCloseTo(5, 5);
    expect(result[1]).toBeCloseTo(4, 5);
    expect(result[2]).toBeCloseTo(3, 5);
    expect(result[3]).toBeCloseTo(2, 5);
    expect(result[4]).toBeCloseTo(1, 5);
  });

  it("returns an array of the same length as input", () => {
    const input = [10, 20, 15, 25, 30];
    const result = linearTrendline(input);
    expect(result).toHaveLength(input.length);
  });

  it("does not mutate the original array", () => {
    const input = [3, 1, 4, 1, 5];
    const copy = [...input];
    linearTrendline(input);
    expect(input).toEqual(copy);
  });

  it("handles two identical values (flat, n=2)", () => {
    // slope = 0 / den; den = (0-0.5)^2 + (1-0.5)^2 = 0.5 ≠ 0
    const result = linearTrendline([7, 7]);
    expect(result[0]).toBeCloseTo(7, 5);
    expect(result[1]).toBeCloseTo(7, 5);
  });

  it("produces a smoothed trendline for noisy data", () => {
    // Noisy ascending data; trendline should be monotonically non-decreasing
    const values = [1, 3, 2, 4, 3, 5, 4, 6];
    const result = linearTrendline(values);
    expect(result).toHaveLength(8);
    // Trendline should be roughly ascending
    expect(result[result.length - 1]).toBeGreaterThan(result[0]);
  });
});
