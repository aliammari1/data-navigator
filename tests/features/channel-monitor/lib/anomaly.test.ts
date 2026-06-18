import { detectChannelAnomalies } from "@/features/channel-monitor/lib/anomaly";

/**
 * Unit tests for the channel anomaly orchestration.
 *
 * The math kernels (GESD / MAD / EWMA) live in the analysis worker and are
 * separately tested. Here we MOCK that boundary and assert the orchestration:
 * the short-series guard, the GESD->MAD fallback, the EWMA baseline join and
 * the shape of the emitted anomalies. No real worker, no real RNG.
 */

const gesdAnomalies = vi.fn();
const ewma = vi.fn();
const detectAnomalies = vi.fn();

// getAnalysisProxy() returns null in tests so the code takes the inline-kernel
// path: `await import("@/workers/analysis.worker")`. We mock that module.
vi.mock("@/platform/viz", () => ({
  getAnalysisProxy: () => null,
}));

vi.mock("@/workers/analysis.worker", () => ({
  gesdAnomalies: (...args: unknown[]) => gesdAnomalies(...args),
  ewma: (...args: unknown[]) => ewma(...args),
  detectAnomalies: (...args: unknown[]) => detectAnomalies(...args),
}));

beforeEach(() => {
  gesdAnomalies.mockReset();
  ewma.mockReset();
  detectAnomalies.mockReset();
});

describe("detectChannelAnomalies — guards", () => {
  it("returns an empty array for a series shorter than 4 without calling kernels", async () => {
    const result = await detectChannelAnomalies("c1", "Channel One", [1, 2, 3]);

    expect(result).toEqual([]);
    expect(gesdAnomalies).not.toHaveBeenCalled();
    expect(ewma).not.toHaveBeenCalled();
  });
});

describe("detectChannelAnomalies — GESD path", () => {
  it("maps GESD hits and joins the EWMA baseline at each anomalous index", async () => {
    // Arrange
    const series = [100, 100, 5, 100, 100, 99];
    gesdAnomalies.mockResolvedValue({ indices: [2], scores: [4.2] });
    ewma.mockResolvedValue([100, 100, 80, 90, 95, 97]);

    // Act
    const result = await detectChannelAnomalies("voice", "Voice", series);

    // Assert
    expect(detectAnomalies).not.toHaveBeenCalled(); // GESD found something
    expect(result).toEqual([
      {
        channel: "voice",
        displayName: "Voice",
        index: 2,
        value: 5,
        score: 4.2,
        baseline: 80,
        method: "gesd",
      },
    ]);
  });

  it("passes alpha 0.05 to GESD and 0.3 smoothing to EWMA", async () => {
    const series = [10, 11, 12, 13, 14];
    gesdAnomalies.mockResolvedValue({ indices: [0], scores: [3] });
    ewma.mockResolvedValue([10, 10, 11, 12, 13]);

    await detectChannelAnomalies("c", "C", series);

    expect(gesdAnomalies).toHaveBeenCalledWith(series, { alpha: 0.05 });
    expect(ewma).toHaveBeenCalledWith(series, 0.3);
  });
});

describe("detectChannelAnomalies — MAD fallback", () => {
  it("falls back to MAD when GESD finds nothing, tagging the method", async () => {
    const series = [50, 50, 50, 50, 50, 9];
    gesdAnomalies.mockResolvedValue({ indices: [], scores: [] });
    ewma.mockResolvedValue([50, 50, 50, 50, 50, 40]);
    detectAnomalies.mockResolvedValue({ indices: [5], scores: [3.9] });

    const result = await detectChannelAnomalies("c", "C", series);

    expect(detectAnomalies).toHaveBeenCalledWith(series, {
      method: "mad",
      threshold: 3.5,
    });
    expect(result).toHaveLength(1);
    expect(result[0].method).toBe("mad");
    expect(result[0].index).toBe(5);
    expect(result[0].value).toBe(9);
    expect(result[0].baseline).toBe(40);
  });

  it("returns an empty array when both GESD and MAD find nothing", async () => {
    const series = [1, 2, 3, 4, 5];
    gesdAnomalies.mockResolvedValue({ indices: [], scores: [] });
    ewma.mockResolvedValue(series);
    detectAnomalies.mockResolvedValue({ indices: [], scores: [] });

    const result = await detectChannelAnomalies("c", "C", series);

    expect(result).toEqual([]);
  });
});

describe("detectChannelAnomalies — defensive joins", () => {
  it("falls back to the series value when the baseline index is missing", async () => {
    const series = [100, 100, 5, 100];
    gesdAnomalies.mockResolvedValue({ indices: [2], scores: [4] });
    // EWMA shorter than the series — baseline[2] is undefined.
    ewma.mockResolvedValue([100, 100]);

    const result = await detectChannelAnomalies("c", "C", series);

    expect(result[0].baseline).toBe(5); // falls back to series[index]
  });

  it("defaults a missing score to 0", async () => {
    const series = [100, 100, 5, 100];
    gesdAnomalies.mockResolvedValue({ indices: [2], scores: [] });
    ewma.mockResolvedValue([100, 100, 80, 90]);

    const result = await detectChannelAnomalies("c", "C", series);

    expect(result[0].score).toBe(0);
  });
});
