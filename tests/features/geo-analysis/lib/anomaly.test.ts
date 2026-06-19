import { beforeEach, describe, expect, it, vi } from "vitest";
import { detectRegionAnomalies } from "@/features/geo-analysis/lib/anomaly";

/**
 * Unit tests for the region anomaly orchestration.
 *
 * The statistical kernels are mocked (separately tested in the worker suite).
 * The interesting orchestration here is: the short-series guard, the GESD->MAD
 * fallback, dropping high-side outliers (only the under-performing tail is a
 * risk), name/index alignment and ascending sort by success rate.
 */

const gesdAnomalies = vi.fn();
const detectAnomalies = vi.fn();

vi.mock("@/platform/viz", () => ({
  getAnalysisProxy: () => null,
}));

vi.mock("@/workers/analysis.worker", () => ({
  gesdAnomalies: (...args: unknown[]) => gesdAnomalies(...args),
  detectAnomalies: (...args: unknown[]) => detectAnomalies(...args),
}));

beforeEach(() => {
  gesdAnomalies.mockReset();
  detectAnomalies.mockReset();
});

describe("detectRegionAnomalies — guards", () => {
  it("returns an empty array for fewer than 4 regions without calling kernels", async () => {
    const result = await detectRegionAnomalies(["A", "B", "C"], [90, 91, 92]);

    expect(result).toEqual([]);
    expect(gesdAnomalies).not.toHaveBeenCalled();
  });
});

describe("detectRegionAnomalies — tail filtering", () => {
  it("keeps only below-median (under-performing) outliers and drops high-side ones", async () => {
    // series median (sorted [40,90,95,98,99]) = 95.
    const names = ["Low", "B", "C", "D", "High"];
    const series = [40, 90, 95, 98, 99];
    // GESD flags both the low (idx 0) and the high (idx 4) outliers.
    gesdAnomalies.mockResolvedValue({ indices: [0, 4], scores: [5.1, 3.2] });

    const result = await detectRegionAnomalies(names, series);

    expect(detectAnomalies).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].region).toBe("Low");
    expect(result[0].successRate).toBe(40);
    expect(result[0].score).toBe(5.1);
    expect(result[0].method).toBe("gesd");
  });

  it("sorts surviving anomalies ascending by success rate (worst first)", async () => {
    const names = ["R0", "R1", "R2", "R3", "R4", "R5"];
    // median of [20,30,50,80,90,95] sorted = index 3 -> 80.
    const series = [50, 30, 20, 80, 90, 95];
    gesdAnomalies.mockResolvedValue({
      indices: [0, 1, 2],
      scores: [2, 3, 4],
    });

    const result = await detectRegionAnomalies(names, series);

    expect(result.map((a) => a.successRate)).toEqual([20, 30, 50]);
    expect(result.map((a) => a.region)).toEqual(["R2", "R1", "R0"]);
  });
});

describe("detectRegionAnomalies — MAD fallback and alignment", () => {
  it("falls back to MAD when GESD returns nothing", async () => {
    const names = ["A", "B", "C", "D", "E"];
    const series = [95, 96, 97, 98, 10]; // median 96, idx 4 is the low outlier
    gesdAnomalies.mockResolvedValue({ indices: [], scores: [] });
    detectAnomalies.mockResolvedValue({ indices: [4], scores: [4.4] });

    const result = await detectRegionAnomalies(names, series);

    expect(detectAnomalies).toHaveBeenCalledWith(series, {
      method: "mad",
      threshold: 3.5,
    });
    expect(result).toHaveLength(1);
    expect(result[0].region).toBe("E");
    expect(result[0].method).toBe("mad");
  });

  it("labels an out-of-range name index as 'Inconnu'", async () => {
    const names = ["A", "B", "C", "D"]; // shorter than the flagged index
    const series = [50, 90, 95, 98];
    // median sorted [50,90,95,98] -> index 2 = 95. idx 0 (50) is below median.
    gesdAnomalies.mockResolvedValue({ indices: [0], scores: [3] });

    const result = await detectRegionAnomalies(names, series);

    expect(result[0].region).toBe("A");
  });
});
