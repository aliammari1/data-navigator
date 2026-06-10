import { describe, expect, it } from "vitest";
import {
  buildHistogram,
  correlationStrength,
  detectIQRAnomalies,
  detectZScoreAnomalies,
  linearRegression,
  mean,
  pearsonCorrelation,
  stdDev,
} from "@/features/ai-analysis/model/stats";

describe("mean", () => {
  it("returns 0 for an empty array", () => {
    expect(mean([])).toBe(0);
  });
  it("averages values", () => {
    expect(mean([1, 2, 3])).toBe(2);
  });
});

describe("stdDev", () => {
  it("returns 0 with fewer than two values", () => {
    expect(stdDev([])).toBe(0);
    expect(stdDev([5])).toBe(0);
  });
  it("computes sample standard deviation", () => {
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 2);
  });
});

describe("pearsonCorrelation", () => {
  it("returns 0 for mismatched or too-short input", () => {
    expect(pearsonCorrelation([1, 2], [1, 2])).toBe(0);
    expect(pearsonCorrelation([1, 2, 3], [1, 2])).toBe(0);
  });
  it("detects a perfect positive correlation", () => {
    expect(pearsonCorrelation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
  });
  it("detects a perfect negative correlation", () => {
    expect(pearsonCorrelation([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
  });
});

describe("linearRegression", () => {
  it("returns a flat default for too-short input", () => {
    expect(linearRegression([1], [1])).toEqual({ slope: 0, intercept: 0, r2: 0 });
  });
  it("recovers a known line y = 2x + 1", () => {
    const { slope, intercept, r2 } = linearRegression([0, 1, 2, 3], [1, 3, 5, 7]);
    expect(slope).toBeCloseTo(2);
    expect(intercept).toBeCloseTo(1);
    expect(r2).toBeCloseTo(1);
  });
});

describe("detectZScoreAnomalies", () => {
  it("flags an extreme outlier", () => {
    const values = [10, 11, 9, 10, 12, 11, 100];
    const anomalies = detectZScoreAnomalies(values, 2);
    expect(anomalies.some((a) => a.idx === 6)).toBe(true);
  });
  it("returns nothing when the spread is zero", () => {
    expect(detectZScoreAnomalies([5, 5, 5, 5])).toEqual([]);
  });
});

describe("detectIQRAnomalies", () => {
  it("flags points outside the IQR fences", () => {
    const values = [10, 11, 12, 13, 14, 15, 200];
    const anomalies = detectIQRAnomalies(values);
    expect(anomalies.some((a) => a.idx === 6)).toBe(true);
  });
});

describe("correlationStrength", () => {
  it("buckets by absolute magnitude", () => {
    expect(correlationStrength(0.95)).toBe("very_strong");
    expect(correlationStrength(-0.7)).toBe("strong");
    expect(correlationStrength(0.5)).toBe("moderate");
    expect(correlationStrength(-0.3)).toBe("weak");
    expect(correlationStrength(0.1)).toBe("none");
  });
});

describe("buildHistogram", () => {
  it("returns zero-filled bins for empty input", () => {
    expect(buildHistogram([], 4)).toEqual([0, 0, 0, 0]);
  });
  it("returns zero-filled bins when all values are equal", () => {
    expect(buildHistogram([5, 5, 5], 3)).toEqual([0, 0, 0]);
  });
  it("distributes values across bins and conserves count", () => {
    const counts = buildHistogram([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 5);
    expect(counts).toHaveLength(5);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(10);
  });
});
