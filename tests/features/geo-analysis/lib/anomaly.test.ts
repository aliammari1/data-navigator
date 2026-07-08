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

  it("uses 'Inconnu' when the flagged index is beyond the names array length", async () => {
    // names has 4 entries but GESD flags index 5 (out of bounds).
    // series has 6 entries; median of sorted [10,80,90,95,98,99] at index 3 = 95.
    // series[5] = 10 which is below the median so the anomaly should be kept.
    const names = ["A", "B", "C", "D"];
    const series = [80, 90, 95, 98, 99, 10];
    gesdAnomalies.mockResolvedValue({ indices: [5], scores: [4.2] });

    const result = await detectRegionAnomalies(names, series);

    expect(result).toHaveLength(1);
    expect(result[0].region).toBe("Inconnu");
    expect(result[0].successRate).toBe(10);
  });

  it("uses 0 as successRate when the flagged series index is out of bounds", async () => {
    // GESD returns an index beyond the series array.
    // series has 4 entries; sorted [10,80,90,95] median index 2 = 90.
    // series[10] is undefined -> successRate = 0, which is below median.
    const names = ["A", "B", "C", "D"];
    const series = [80, 90, 10, 95];
    gesdAnomalies.mockResolvedValue({ indices: [10], scores: [5.0] });

    const result = await detectRegionAnomalies(names, series);

    expect(result).toHaveLength(1);
    expect(result[0].successRate).toBe(0);
    expect(result[0].region).toBe("Inconnu");
  });

  it("uses 0 as score when the scores array is shorter than indices", async () => {
    // GESD returns an indices array longer than its scores array.
    // series sorted [10,80,90,95] median at index 2 = 90; series[2]=10 < median.
    const names = ["A", "B", "C", "D"];
    const series = [80, 90, 10, 95];
    // scores has only one entry but indices has two; i=1 -> scores[1] undefined -> 0.
    gesdAnomalies.mockResolvedValue({ indices: [2, 0], scores: [3.3] });

    const result = await detectRegionAnomalies(names, series);

    // series[2]=10 < 90 (median): kept with score 3.3
    // series[0]=80 < 90 (median): kept with score 0 (scores[1] is undefined)
    expect(result).toHaveLength(2);
    const r10 = result.find((a) => a.successRate === 10);
    const r80 = result.find((a) => a.successRate === 80);
    expect(r10?.score).toBe(3.3);
    expect(r80?.score).toBe(0);
  });

  it("uses 0 as median when all series values are undefined (sparse array)", async () => {
    // Passing undefined-filled array of length 4 triggers sorted[mid] ?? 0.
    // With median = 0, successRate (also 0 from ?? 0) is NOT below median (0 >= 0),
    // so the anomaly is filtered out and the result is empty.
    const names = ["A", "B", "C", "D"];
    const series = [undefined, undefined, undefined, undefined] as unknown as number[];
    gesdAnomalies.mockResolvedValue({ indices: [0], scores: [1.0] });

    const result = await detectRegionAnomalies(names, series);

    // successRate=0 >= median=0, so filtered out as "not a low-side outlier"
    expect(result).toEqual([]);
  });
});
