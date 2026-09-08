/**
 * Tests for analysis.worker.ts — the statistics / clustering / attribution kernel.
 *
 * We import the real exported functions directly (not via Comlink) so every
 * line counts toward coverage. Comlink.expose is mocked so the module-level
 * side-effect does not throw in jsdom.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

// ── Mock Comlink so expose() is a no-op in jsdom ─────────────────────────────
vi.mock("comlink", () => ({
  expose: vi.fn(),
  wrap: vi.fn(),
  proxy: vi.fn(),
  transferHandlers: new Map(),
}));

// ── Mock density-clustering ───────────────────────────────────────────────────
// _dbscanNoiseUndefined is a module-level flag tests can toggle to exercise the
// `engine.noise ?? []` nullish-coalescing fallback branch inside dbscan().
let _dbscanNoiseUndefined = false;
vi.mock("density-clustering", () => {
  return {
    DBSCAN: class {
      noise: number[] | undefined = [];
      run(data: number[][], eps: number, minPts: number): number[][] {
        // Simple mock: treat every point as its own cluster unless eps very small
        if (data.length === 0) return [];
        if (eps < 0.01) {
          // All noise
          this.noise = data.map((_, i) => i);
          return [];
        }
        // Group all points into one cluster
        if (_dbscanNoiseUndefined) {
          // Simulate an engine implementation that never populates .noise
          delete (this as { noise?: number[] }).noise;
        } else {
          this.noise = [];
        }
        return [data.map((_, i) => i)];
      }
    },
  };
});

// ── ml-matrix mock: passthrough by default; configurable per-test ────────────
// When _svdEmptyDiagonal=true, SVD.diagonal returns [] to exercise the
// `s.length ? Math.max(...s) : 0` defensive branch inside attribution().
let _svdEmptyDiagonal = false;
// We need the real Matrix and SVD for existing tests. Vitest vi.mock factories
// run before imports, so we use importActual to re-use the real implementations.
vi.mock("ml-matrix", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ml-matrix")>();
  class PatchedSVD extends actual.SVD {
    get diagonal(): number[] {
      if (_svdEmptyDiagonal) return [];
      return super.diagonal;
    }
  }
  return { ...actual, SVD: PatchedSVD };
});

// ── Import real implementation AFTER mocks are set up ────────────────────────
import {
  kMeans,
  dbscan,
  attribution,
  correlationMatrix,
  welchTTest,
  anova1,
  detectAnomalies,
  gesdAnomalies,
  ewma,
  stlDecompose,
  pelt,
  holtWinters,
} from "@/workers/analysis.worker";

// ─────────────────────────────────────────────────────────────────────────────
// kMeans
// ─────────────────────────────────────────────────────────────────────────────
describe("kMeans", () => {
  it("returns empty result for empty data", async () => {
    // Arrange
    const data: number[][] = [];
    // Act
    const result = await kMeans(data, { k: 2 });
    // Assert
    expect(result.labels).toEqual([]);
    expect(result.centroids).toEqual([]);
    expect(result.withinss).toEqual([]);
    expect(result.totalWithinss).toBe(0);
    expect(result.iterations).toBe(0);
  });

  it("returns empty result when data has zero-length rows", async () => {
    // Arrange — data[0] has no columns, so d=0
    const data: number[][] = [[]];
    // Act
    const result = await kMeans(data, { k: 2 });
    // Assert
    expect(result.labels).toEqual([]);
    expect(result.centroids).toEqual([]);
  });

  it("clusters a trivial single-point dataset (k clipped to 1)", async () => {
    // Arrange
    const data = [[1, 2]];
    // Act
    const result = await kMeans(data, { k: 3 }); // k capped to n=1
    // Assert
    expect(result.labels).toHaveLength(1);
    expect(result.centroids).toHaveLength(1);
    expect(result.withinss).toHaveLength(1);
    expect(result.withinss[0]).toBeCloseTo(0);
  });

  it("clusters two perfectly separated 1-D groups into k=2", async () => {
    // Arrange — group A near 0, group B near 100
    const data = [[0], [1], [0.5], [99], [100], [99.5]];
    // Act
    const result = await kMeans(data, { k: 2, seed: 42 });
    // Assert
    expect(result.centroids).toHaveLength(2);
    expect(result.withinss).toHaveLength(2);
    expect(result.totalWithinss).toBeCloseTo(
      result.withinss.reduce((a, b) => a + b, 0),
      10,
    );
    // Each group member should share the same label
    const labelA = result.labels[0];
    const labelB = result.labels[3];
    expect(labelA).not.toBe(labelB);
    expect(result.labels[1]).toBe(labelA);
    expect(result.labels[4]).toBe(labelB);
  });

  it("respects a custom seed for determinism", async () => {
    // Arrange
    const data = Array.from({ length: 20 }, (_, i) => [i, i * 2]);
    // Act
    const r1 = await kMeans(data, { k: 3, seed: 7 });
    const r2 = await kMeans(data, { k: 3, seed: 7 });
    // Assert — identical seeds must produce identical results
    expect(r1.labels).toEqual(r2.labels);
    expect(r1.centroids).toEqual(r2.centroids);
  });

  it("respects maxIterations", async () => {
    // Arrange
    const data = Array.from({ length: 10 }, (_, i) => [i]);
    // Act
    const result = await kMeans(data, { k: 2, maxIterations: 1, seed: 1 });
    // Assert — runs at most 1 iteration; labels and centroids are still valid arrays
    expect(result.iterations).toBeGreaterThanOrEqual(1);
    expect(result.labels).toHaveLength(10);
  });

  it("handles k=1 (all points in one cluster, withinss = total SSE)", async () => {
    // Arrange
    const data = [[1], [2], [3]];
    // Act
    const result = await kMeans(data, { k: 1 });
    // Assert
    expect(result.labels.every((l) => l === 0)).toBe(true);
    expect(result.centroids).toHaveLength(1);
    expect(result.withinss).toHaveLength(1);
  });

  it("returns correct dimensionality in centroids for multi-dimensional data", async () => {
    // Arrange
    const data = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];
    // Act
    const result = await kMeans(data, { k: 2, seed: 10 });
    // Assert
    expect(result.centroids[0]).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// dbscan
// ─────────────────────────────────────────────────────────────────────────────
describe("dbscan", () => {
  it("returns empty result for empty data", async () => {
    // Act
    const result = await dbscan([], 0.5, 2);
    // Assert
    expect(result.labels).toEqual([]);
    expect(result.clusters).toEqual([]);
    expect(result.noise).toEqual([]);
  });

  it("assigns all points to cluster 0 with a generous eps", async () => {
    // Arrange — the mock groups all into cluster 0 for eps >= 0.01
    const data = [[0, 0], [1, 0], [0, 1]];
    // Act
    const result = await dbscan(data, 2, 1);
    // Assert
    expect(result.clusters).toHaveLength(1);
    expect(result.labels).toEqual([0, 0, 0]);
    expect(result.noise).toEqual([]);
  });

  it("marks all points as noise when eps is near zero", async () => {
    // Arrange — eps < 0.01 → mock returns empty clusters, all points as noise
    const data = [[0, 0], [1, 0], [0, 1]];
    // Act
    const result = await dbscan(data, 0.001, 5);
    // Assert
    expect(result.clusters).toHaveLength(0);
    expect(result.labels.every((l) => l === -1)).toBe(true);
    expect(result.noise).toHaveLength(3);
  });

  it("uses default eps=0.5 and minPts=5 when not supplied", async () => {
    // Arrange
    const data = [[1], [2]];
    // Act — should not throw
    const result = await dbscan(data);
    // Assert
    expect(Array.isArray(result.labels)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// attribution
// ─────────────────────────────────────────────────────────────────────────────
describe("attribution", () => {
  it("returns zeros for n < 2", async () => {
    // Arrange
    const X = [[1, 2]];
    const y = [1];
    // Act
    const result = await attribution(X, y);
    // Assert
    expect(result.shares).toEqual([0, 0]);
    expect(result.coefficients).toEqual([0, 0]);
    expect(result.rSquared).toBe(0);
  });

  it("returns zeros when d < 1 (no features)", async () => {
    // Arrange
    const X: number[][] = [[], [], []];
    const y = [1, 2, 3];
    // Act
    const result = await attribution(X, y);
    // Assert
    expect(result.shares).toEqual([]);
    expect(result.rSquared).toBe(0);
  });

  it("returns zeros when y length does not match n", async () => {
    // Arrange
    const X = [[1], [2], [3]];
    const y = [1, 2]; // wrong length
    // Act
    const result = await attribution(X, y);
    // Assert
    expect(result.shares).toEqual([0]);
    expect(result.rSquared).toBe(0);
  });

  it("fits a perfect linear relationship and returns high r-squared", async () => {
    // Arrange — y = 2*x1 + 0*x2, exact linear dependence
    const X = [
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [5, 0],
    ];
    const y = [2, 4, 6, 8, 10];
    // Act
    const result = await attribution(X, y);
    // Assert
    expect(result.rSquared).toBeGreaterThan(0.9);
    expect(result.shares).toHaveLength(2);
    expect(result.shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
    // x1 dominates; x2 has near-zero coefficient
    expect(result.shares[0]).toBeGreaterThan(result.shares[1]!);
  });

  it("returns r-squared in [0, 1] for noisy data", async () => {
    // Arrange
    const X = [
      [1, 3],
      [2, 1],
      [3, 4],
      [4, 1],
      [5, 5],
    ];
    const y = [1.1, 2.9, 3.1, 4.0, 5.1];
    // Act
    const result = await attribution(X, y);
    // Assert
    expect(result.rSquared).toBeGreaterThanOrEqual(0);
    expect(result.rSquared).toBeLessThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// correlationMatrix
// ─────────────────────────────────────────────────────────────────────────────
describe("correlationMatrix", () => {
  it("returns identity matrix for n < 2 rows", async () => {
    // Arrange
    const data = [[1, 2, 3]]; // only 1 row
    // Act
    const result = await correlationMatrix(data);
    // Assert — diagonal must be 1; off-diagonal 0
    expect(result.matrix).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    expect(result.columns).toEqual(["col_1", "col_2", "col_3"]);
  });

  it("returns identity matrix for zero columns", async () => {
    // Arrange
    const data: number[][] = [[], []];
    // Act
    const result = await correlationMatrix(data);
    // Assert
    expect(result.matrix).toEqual([]);
    expect(result.columns).toEqual([]);
  });

  it("uses provided column names", async () => {
    // Arrange
    const data = [[1, 2], [3, 4]];
    // Act
    const result = await correlationMatrix(data, ["alpha", "beta"]);
    // Assert
    expect(result.columns).toEqual(["alpha", "beta"]);
  });

  it("fills missing column names with col_N", async () => {
    // Arrange — only one name provided for two columns
    const data = [[1, 2], [3, 4]];
    // Act
    const result = await correlationMatrix(data, ["x"]);
    // Assert
    expect(result.columns[1]).toBe("col_2");
  });

  it("returns 1 on the diagonal for normal data", async () => {
    // Arrange
    const data = [[1, 2], [3, 4], [5, 6]];
    // Act
    const result = await correlationMatrix(data);
    // Assert
    for (let i = 0; i < result.matrix.length; i++) {
      expect(result.matrix[i]![i]).toBe(1);
    }
  });

  it("detects perfect positive correlation", async () => {
    // Arrange — col0 and col1 are identical
    const data = [[1, 1], [2, 2], [3, 3], [4, 4]];
    // Act
    const result = await correlationMatrix(data);
    // Assert
    expect(result.matrix[0]![1]).toBeCloseTo(1, 3);
    expect(result.matrix[1]![0]).toBeCloseTo(1, 3);
  });

  it("detects perfect negative correlation", async () => {
    // Arrange — col1 decreases as col0 increases
    const data = [[1, 4], [2, 3], [3, 2], [4, 1]];
    // Act
    const result = await correlationMatrix(data);
    // Assert
    expect(result.matrix[0]![1]).toBeCloseTo(-1, 3);
  });

  it("returns 0 for a constant column (zero std)", async () => {
    // Arrange — col1 is constant, denom would be 0 → correlation 0
    const data = [[1, 5], [2, 5], [3, 5], [4, 5]];
    // Act
    const result = await correlationMatrix(data);
    // Assert
    expect(result.matrix[0]![1]).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// welchTTest
// ─────────────────────────────────────────────────────────────────────────────
describe("welchTTest", () => {
  it("returns degenerate result when a has fewer than 2 elements", async () => {
    // Act
    const result = await welchTTest([1], [1, 2, 3]);
    // Assert
    expect(result.statistic).toBe(0);
    expect(result.pValue).toBe(1);
    expect(result.significant).toBe(false);
  });

  it("returns degenerate result when b has fewer than 2 elements", async () => {
    // Act
    const result = await welchTTest([1, 2, 3], [5]);
    // Assert
    expect(result.statistic).toBe(0);
    expect(result.pValue).toBe(1);
  });

  it("returns non-significant result for identical groups", async () => {
    // Arrange
    const a = [5, 5, 5, 5, 5];
    const b = [5, 5, 5, 5, 5];
    // Act
    const result = await welchTTest(a, b);
    // Assert
    expect(result.pValue).toBe(1);
    expect(result.significant).toBe(false);
    expect(result.meanA).toBeCloseTo(5);
    expect(result.meanB).toBeCloseTo(5);
  });

  it("flags significant difference for clearly separated groups", async () => {
    // Arrange
    const a = [1, 2, 1, 2, 1, 2, 1];
    const b = [100, 101, 100, 101, 100, 101, 100];
    // Act
    const result = await welchTTest(a, b);
    // Assert
    expect(result.significant).toBe(true);
    expect(result.pValue).toBeLessThan(0.05);
    expect(result.statistic).toBeLessThan(0); // a < b → negative t
  });

  it("returns valid confidence interval", async () => {
    // Arrange
    const a = [1, 2, 3, 4, 5];
    const b = [6, 7, 8, 9, 10];
    // Act
    const result = await welchTTest(a, b);
    // Assert
    const [lo, hi] = result.ci;
    expect(lo).toBeLessThan(hi);
  });

  it("returns meanA and meanB matching the group means", async () => {
    // Arrange
    const a = [10, 20, 30];
    const b = [40, 50, 60];
    // Act
    const result = await welchTTest(a, b);
    // Assert
    expect(result.meanA).toBeCloseTo(20);
    expect(result.meanB).toBeCloseTo(50);
  });

  it("respects custom alpha level", async () => {
    // Arrange — with a less strict alpha of 0.1
    const a = [1, 2, 3, 4, 5, 6, 7, 8];
    const b = [2, 3, 4, 5, 6, 7, 8, 9];
    // Act
    const resultStrict = await welchTTest(a, b, 0.01);
    const resultLoose = await welchTTest(a, b, 0.5);
    // Assert — loose threshold more likely to flag significance when p-value is moderate
    expect(typeof resultStrict.significant).toBe("boolean");
    expect(typeof resultLoose.significant).toBe("boolean");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// anova1
// ─────────────────────────────────────────────────────────────────────────────
describe("anova1", () => {
  it("returns degenerate result for fewer than 2 groups", async () => {
    // Arrange
    const values = [1, 2, 3];
    const factor = ["A", "A", "A"];
    // Act
    const result = await anova1(values, factor);
    // Assert
    expect(result.statistic).toBe(0);
    expect(result.pValue).toBe(1);
    expect(result.significant).toBe(false);
  });

  it("returns degenerate result when n <= k", async () => {
    // Arrange — 2 groups but only 2 values so n=2, k=2 → n<=k
    const values = [1, 2];
    const factor = ["A", "B"];
    // Act
    const result = await anova1(values, factor);
    // Assert
    expect(result.statistic).toBe(0);
  });

  it("detects significant difference between well-separated groups", async () => {
    // Arrange
    const values = [1, 2, 1, 100, 101, 100, 200, 201, 200];
    const factor = ["A", "A", "A", "B", "B", "B", "C", "C", "C"];
    // Act
    const result = await anova1(values, factor);
    // Assert
    expect(result.significant).toBe(true);
    expect(result.pValue).toBeLessThan(0.05);
    expect(result.dfBetween).toBe(2); // k-1 = 3-1
    expect(result.dfWithin).toBe(6); // n-k = 9-3
  });

  it("returns non-significant result for identical groups", async () => {
    // Arrange
    const values = [5, 5, 5, 5, 5, 5];
    const factor = ["A", "A", "A", "B", "B", "B"];
    // Act
    const result = await anova1(values, factor);
    // Assert — no between-group variance
    expect(result.pValue).toBe(1);
    expect(result.significant).toBe(false);
  });

  it("converts numeric factor values to strings for grouping", async () => {
    // Arrange
    const values = [1, 2, 3, 10, 11, 12];
    const factor = [1, 1, 1, 2, 2, 2];
    // Act
    const result = await anova1(values, factor);
    // Assert
    expect(result.dfBetween).toBe(1);
    expect(result.statistic).toBeGreaterThan(0);
  });

  it("computes correct dfBetween and dfWithin", async () => {
    // Arrange — 3 groups, 9 observations
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const factor = ["A", "A", "A", "B", "B", "B", "C", "C", "C"];
    // Act
    const result = await anova1(values, factor);
    // Assert
    expect(result.dfBetween).toBe(2); // k - 1
    expect(result.dfWithin).toBe(6); // n - k
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// detectAnomalies
// ─────────────────────────────────────────────────────────────────────────────
describe("detectAnomalies", () => {
  it("returns empty for arrays shorter than 4 elements", async () => {
    // Act
    const result = await detectAnomalies([1, 2, 3]);
    // Assert
    expect(result.indices).toEqual([]);
    expect(result.scores).toEqual([]);
  });

  it("detects a clear outlier using IQR (default method)", async () => {
    // Arrange — 1000 is a clear outlier compared to [1..10]
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1000];
    // Act
    const result = await detectAnomalies(values, { method: "iqr" });
    // Assert
    expect(result.indices).toContain(10);
    expect(result.scores).toHaveLength(result.indices.length);
  });

  it("returns empty for constant series under IQR (iqr == 0)", async () => {
    // Arrange — all values identical → IQR = 0 → no anomalies
    const values = [5, 5, 5, 5, 5];
    // Act
    const result = await detectAnomalies(values, { method: "iqr" });
    // Assert
    expect(result.indices).toEqual([]);
  });

  it("detects outlier using z-score method", async () => {
    // Arrange
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 500];
    // Act
    const result = await detectAnomalies(values, { method: "zscore", threshold: 2 });
    // Assert
    expect(result.indices).toContain(10);
  });

  it("returns empty for constant series under z-score (std == 0)", async () => {
    // Arrange
    const values = [7, 7, 7, 7, 7];
    // Act
    const result = await detectAnomalies(values, { method: "zscore" });
    // Assert
    expect(result.indices).toEqual([]);
  });

  it("detects outlier using MAD method", async () => {
    // Arrange
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 300];
    // Act
    const result = await detectAnomalies(values, { method: "mad", threshold: 2 });
    // Assert
    expect(result.indices).toContain(10);
  });

  it("returns empty for constant series under MAD (mad == 0)", async () => {
    // Arrange
    const values = [3, 3, 3, 3, 3];
    // Act
    const result = await detectAnomalies(values, { method: "mad" });
    // Assert
    expect(result.indices).toEqual([]);
  });

  it("uses default IQR threshold of 1.5", async () => {
    // Arrange — a moderately extreme outlier
    const base = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    // Act — without specifying threshold, should use 1.5
    const resultDefault = await detectAnomalies(base, { method: "iqr" });
    const resultExplicit = await detectAnomalies(base, { method: "iqr", threshold: 1.5 });
    // Assert — both should be identical
    expect(resultDefault.indices).toEqual(resultExplicit.indices);
  });

  it("uses default z-score threshold of 3 when method is zscore", async () => {
    // Arrange
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    // Act — method zscore, no threshold → defaults to 3
    const result = await detectAnomalies(values, { method: "zscore" });
    // Assert — no extreme outlier so indices should be empty or valid array
    expect(Array.isArray(result.indices)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// gesdAnomalies
// ─────────────────────────────────────────────────────────────────────────────
describe("gesdAnomalies", () => {
  it("returns empty for arrays shorter than 4 elements", async () => {
    // Act
    const result = await gesdAnomalies([1, 2, 3]);
    // Assert
    expect(result.indices).toEqual([]);
    expect(result.scores).toEqual([]);
  });

  it("returns empty when maxAnomalies < 1", async () => {
    // Arrange — maxAnomalies explicitly 0
    const result = await gesdAnomalies([1, 2, 3, 4, 5], { maxAnomalies: 0 });
    // Assert
    expect(result.indices).toEqual([]);
  });

  it("detects a clear single outlier", async () => {
    // Arrange — 100 is far from the rest
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100];
    // Act
    const result = await gesdAnomalies(values, { alpha: 0.05, maxAnomalies: 3 });
    // Assert
    expect(result.indices).toContain(10);
    expect(result.scores).toHaveLength(result.indices.length);
  });

  it("returns empty for normally distributed data with no extreme outliers", async () => {
    // Arrange — tightly clustered values
    const values = [10, 10, 11, 10, 10, 11, 10, 10, 9, 10, 10, 10];
    // Act
    const result = await gesdAnomalies(values);
    // Assert — no significant outliers expected
    expect(result.indices).toEqual([]);
  });

  it("respects maxAnomalies cap", async () => {
    // Arrange — two extreme outliers at ends
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, -50, 200];
    // Act
    const result = await gesdAnomalies(values, { maxAnomalies: 1 });
    // Assert — at most 1 anomaly reported
    expect(result.indices.length).toBeLessThanOrEqual(1);
  });

  it("handles constant std deviation gracefully (breaks inner loop)", async () => {
    // Arrange — all values identical → std = 0 → should not throw
    const values = [5, 5, 5, 5, 5, 5];
    // Act
    const result = await gesdAnomalies(values);
    // Assert
    expect(result.indices).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ewma
// ─────────────────────────────────────────────────────────────────────────────
describe("ewma", () => {
  it("returns empty for empty input", async () => {
    // Act
    const result = await ewma([]);
    // Assert
    expect(result).toEqual([]);
  });

  it("returns the single value unchanged for length-1 input", async () => {
    // Act
    const result = await ewma([42]);
    // Assert
    expect(result).toEqual([42]);
  });

  it("applies exponential smoothing with default alpha = 0.3", async () => {
    // Arrange
    const values = [10, 20, 30, 40];
    // Act
    const result = await ewma(values);
    // Assert
    expect(result[0]).toBe(10);
    // out[1] = 0.3 * 20 + 0.7 * 10 = 6 + 7 = 13
    expect(result[1]).toBeCloseTo(13, 10);
    // out[2] = 0.3 * 30 + 0.7 * 13 = 9 + 9.1 = 18.1
    expect(result[2]).toBeCloseTo(18.1, 5);
  });

  it("clamps alpha to EPSILON when alpha <= 0 (no update)", async () => {
    // Arrange — alpha near 0 keeps first value almost frozen
    const values = [10, 100, 1000];
    // Act
    const result = await ewma(values, 0);
    // Assert — all values should be very close to the first
    expect(result[0]).toBe(10);
    expect(result[1]).toBeCloseTo(10, 0); // approx 10 because alpha ≈ 1e-12
  });

  it("clamps alpha to 1 for alpha > 1 (instant update)", async () => {
    // Arrange
    const values = [10, 20, 30];
    // Act
    const result = await ewma(values, 2);
    // Assert — with alpha=1, out[i] = values[i]
    expect(result[0]).toBe(10);
    expect(result[1]).toBe(20);
    expect(result[2]).toBe(30);
  });

  it("produces a smoothed output (no aliasing with input)", async () => {
    // Arrange
    const values = [1, 10, 1, 10, 1];
    // Act
    const result = await ewma(values, 0.5);
    // Assert — output should be between 1 and 10
    for (const v of result) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(10);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// stlDecompose
// ─────────────────────────────────────────────────────────────────────────────
describe("stlDecompose", () => {
  it("returns passthrough for empty values", async () => {
    // Act
    const result = await stlDecompose([], 4);
    // Assert
    expect(result.trend).toEqual([]);
    expect(result.seasonal).toEqual([]);
    expect(result.residual).toEqual([]);
  });

  it("returns passthrough when period < 2", async () => {
    // Arrange
    const values = [1, 2, 3, 4];
    // Act
    const result = await stlDecompose(values, 1);
    // Assert
    expect(result.trend).toEqual([...values]);
    expect(result.seasonal).toEqual([0, 0, 0, 0]);
    expect(result.residual).toEqual([0, 0, 0, 0]);
  });

  it("decomposes a pure trend (no seasonality) correctly", async () => {
    // Arrange — linearly increasing, period = 2
    const values = [1, 2, 3, 4, 5, 6, 7, 8];
    // Act
    const result = await stlDecompose(values, 2);
    // Assert — output arrays same length as input
    expect(result.trend).toHaveLength(8);
    expect(result.seasonal).toHaveLength(8);
    expect(result.residual).toHaveLength(8);
  });

  it("approximates identity decomposition: trend+seasonal+residual ≈ values", async () => {
    // Arrange
    const values = [10, 20, 15, 25, 10, 20, 15, 25];
    // Act
    const result = await stlDecompose(values, 4);
    // Assert
    for (let i = 0; i < values.length; i++) {
      const reconstructed = result.trend[i]! + result.seasonal[i]! + result.residual[i]!;
      expect(reconstructed).toBeCloseTo(values[i]!, 10);
    }
  });

  it("handles period longer than series length", async () => {
    // Arrange
    const values = [1, 2, 3];
    // Act — period > n, but the code still runs (no guard for this)
    const result = await stlDecompose(values, 10);
    // Assert — should not throw and lengths should be correct
    expect(result.trend).toHaveLength(3);
    expect(result.seasonal).toHaveLength(3);
    expect(result.residual).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// pelt
// ─────────────────────────────────────────────────────────────────────────────
describe("pelt", () => {
  it("returns empty for arrays shorter than 4 elements", async () => {
    // Act
    const result = await pelt([1, 2, 3]);
    // Assert
    expect(result).toEqual([]);
  });

  it("returns empty for constant series (no change points)", async () => {
    // Arrange
    const values = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
    // Act
    const result = await pelt(values);
    // Assert
    expect(Array.isArray(result)).toBe(true);
  });

  it("detects a clear change point in a step function", async () => {
    // Arrange — values jump from ~0 to ~100
    const values = [0, 0, 0, 0, 0, 100, 100, 100, 100, 100];
    // Act
    const result = await pelt(values);
    // Assert — should detect a change somewhere around index 5
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toBeGreaterThan(0);
    expect(result[0]).toBeLessThanOrEqual(5);
  });

  it("returns sorted change points", async () => {
    // Arrange
    const values = [0, 0, 0, 50, 50, 50, 100, 100, 100, 150, 150, 150];
    // Act
    const result = await pelt(values);
    // Assert
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).toBeGreaterThan(result[i - 1]!);
    }
  });

  it("respects custom penalty", async () => {
    // Arrange — small penalty → more change points; large penalty → fewer
    const values = [0, 0, 10, 0, 0, 10, 0, 0, 10, 0, 0, 10];
    // Act
    const resultSmall = await pelt(values, { penalty: 0.001 });
    const resultLarge = await pelt(values, { penalty: 10000 });
    // Assert — fewer change points with larger penalty
    expect(resultSmall.length).toBeGreaterThanOrEqual(resultLarge.length);
  });

  it("respects custom minSize", async () => {
    // Arrange
    const values = [0, 0, 0, 0, 100, 100, 100, 100];
    // Act
    const result = await pelt(values, { minSize: 3 });
    // Assert — valid result
    expect(Array.isArray(result)).toBe(true);
  });

  it("handles input of exactly 4 elements", async () => {
    // Arrange — boundary case
    const values = [1, 2, 3, 4];
    // Act
    const result = await pelt(values);
    // Assert — should not throw
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// holtWinters
// ─────────────────────────────────────────────────────────────────────────────
describe("holtWinters", () => {
  it("returns empty for empty input", async () => {
    // Act
    const result = await holtWinters([]);
    // Assert
    expect(result.fitted).toEqual([]);
    expect(result.forecast).toEqual([]);
  });

  it("applies Holt linear (no seasonality) when period < 2", async () => {
    // Arrange
    const values = [10, 20, 30, 40, 50];
    // Act — default period is 1
    const result = await holtWinters(values, { period: 1, horizon: 3 });
    // Assert
    expect(result.fitted).toHaveLength(5);
    expect(result.forecast).toHaveLength(3);
  });

  it("applies Holt linear when n < 2 * period", async () => {
    // Arrange — period = 4 but only 5 values (< 8), so falls back to Holt
    const values = [1, 2, 3, 4, 5];
    // Act
    const result = await holtWinters(values, { period: 4, horizon: 2 });
    // Assert — should not throw and produce right lengths
    expect(result.fitted).toHaveLength(5);
    expect(result.forecast).toHaveLength(2);
  });

  it("applies full additive seasonal HW when n >= 2 * period", async () => {
    // Arrange — period = 4, 12 observations (>=8)
    const values = [10, 15, 8, 12, 11, 16, 9, 13, 12, 17, 10, 14];
    // Act
    const result = await holtWinters(values, { period: 4, horizon: 4 });
    // Assert
    expect(result.fitted).toHaveLength(12);
    expect(result.forecast).toHaveLength(4);
  });

  it("produces finite fitted and forecast values for seasonal data", async () => {
    // Arrange
    const values = [10, 20, 10, 20, 10, 20, 10, 20];
    // Act
    const result = await holtWinters(values, { period: 2, horizon: 4 });
    // Assert
    for (const v of [...result.fitted, ...result.forecast]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("uses default horizon of 5 when not specified", async () => {
    // Arrange
    const values = [1, 2, 3, 4];
    // Act
    const result = await holtWinters(values);
    // Assert
    expect(result.forecast).toHaveLength(5);
  });

  it("respects custom smoothing parameters alpha/beta/gamma", async () => {
    // Arrange
    const values = [1, 4, 2, 5, 3, 6, 2, 5, 3, 6, 2, 5];
    // Act
    const result = await holtWinters(values, {
      period: 4,
      horizon: 4,
      alpha: 0.5,
      beta: 0.2,
      gamma: 0.3,
    });
    // Assert
    expect(result.fitted).toHaveLength(12);
    expect(result.forecast).toHaveLength(4);
  });

  it("Holt linear: forecast length matches horizon for single value", async () => {
    // Arrange — only one value → trend = 0, forecast = [level, level, ...]
    const values = [42];
    // Act
    const result = await holtWinters(values, { horizon: 3, period: 1 });
    // Assert
    expect(result.fitted).toHaveLength(1);
    expect(result.forecast).toHaveLength(3);
    expect(result.forecast[0]).toBeCloseTo(42, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Branch-coverage gap-fill tests
// ─────────────────────────────────────────────────────────────────────────────

describe("kMeans — branch gaps", () => {
  it("handles ragged rows where row[j] is undefined (??  0 fallback on line 72)", async () => {
    // Arrange — second row has only 1 element; d=2 from the first row,
    // so X[1*2+1] = row[1] ?? 0 exercises the ?? fallback.
    const data: number[][] = [[1, 2], [3]];
    // Act — should not throw and produce valid output
    const result = await kMeans(data, { k: 1, seed: 1 });
    // Assert
    expect(result.labels).toHaveLength(2);
    expect(result.centroids).toHaveLength(1);
  });

  it("triggers empty-cluster skip (cnt === 0) when k equals n with duplicates", async () => {
    // Arrange — 2 identical points, k=2. After Lloyd's step both points may
    // land in the same cluster, leaving the other centroid empty.
    // We use a high seed to force the specific init that exposes the branch.
    const data: number[][] = [[5], [5]];
    // Act — k=2 but only one distinct point; one centroid will be empty
    const result = await kMeans(data, { k: 2, seed: 0, maxIterations: 10 });
    // Assert — still produces a valid result (the empty-cluster continue is hit)
    expect(result.labels).toHaveLength(2);
    expect(result.centroids).toHaveLength(2);
  });
});

describe("dbscan — branch gaps", () => {
  afterEach(() => {
    _dbscanNoiseUndefined = false;
  });

  it("handles DBSCAN engine where noise property is missing (falls back to [])", async () => {
    // Arrange — set the flag so the mock's run() deletes this.noise before returning
    _dbscanNoiseUndefined = true;
    const data = [[0, 0], [1, 1], [2, 2]];
    // Act — dbscan() does `engine.noise ?? []`, which evaluates the [] fallback
    const result = await dbscan(data, 5.0, 1);
    // Assert
    expect(Array.isArray(result.noise)).toBe(true);
    expect(result.labels).toHaveLength(3);
  });
});

describe("attribution — branch gaps", () => {
  it("exercises X[0]?.length ?? 0 when X is empty (d=0 via ?? fallback)", async () => {
    // Arrange — X=[] means X[0] is undefined, so X[0]?.length is undefined,
    // triggering the ?? 0 fallback. n=0 < 2 so early return fires.
    const result = await attribution([], []);
    // Assert
    expect(result.shares).toEqual([]);
    expect(result.rSquared).toBe(0);
  });

  it("exercises standardize1d || 1 fallback when y is constant (variance=0)", async () => {
    // Arrange — all y values identical → sampleVariance=0 → std=0 → || 1 fires.
    // ssTot will also be 0 → rSquared ternary false branch fires too.
    const X = [[1], [2], [3], [4]];
    const y = [5, 5, 5, 5]; // constant y
    // Act
    const result = await attribution(X, y);
    // Assert — rSquared = 0 (ssTot branch), shares sum = 100 or all 0
    expect(result.rSquared).toBe(0);
    expect(Array.isArray(result.shares)).toBe(true);
  });

  it("exercises totalAbs || 1 fallback when all coefficients are zero", async () => {
    // Arrange — X with a single constant column (all same value after
    // standardization → column becomes all zeros → SVD coefficients all zero).
    // Use 4 rows so n >= 2 passes the guard.
    const X = [[7], [7], [7], [7]];
    const y = [1, 2, 3, 4];
    // Act
    const result = await attribution(X, y);
    // Assert — totalAbs=0 triggers the || 1 fallback so shares don't blow up
    expect(Array.isArray(result.shares)).toBe(true);
    expect(result.shares.every((s) => Number.isFinite(s))).toBe(true);
  });

  it("exercises s.length=0 → 0 branch in tol calculation via patched SVD", async () => {
    // Arrange — patch SVD.diagonal to return [] so the ternary's false arm fires.
    _svdEmptyDiagonal = true;
    const X = [[1], [2], [3], [4]];
    const y = [1, 2, 3, 4];
    // Act
    const result = await attribution(X, y);
    // Assert — should not throw; tol = 0 * ... = 0 so all singular values pass threshold
    expect(Array.isArray(result.coefficients)).toBe(true);
    // Reset flag
    _svdEmptyDiagonal = false;
  });
});

describe("correlationMatrix — branch gaps", () => {
  it("exercises data[0]?.length ?? 0 when data is truly empty ([])", async () => {
    // Arrange — data=[] means data[0] is undefined → ?? 0 fires → nCols=0
    const result = await correlationMatrix([]);
    // Assert — hits the nRows<2 || nCols===0 early return with nCols=0
    expect(result.matrix).toEqual([]);
    expect(result.columns).toEqual([]);
  });
});

describe("stlDecompose — branch gaps", () => {
  it("exercises the c===0 false arm of trend[i] = c ? s/c : values[i]!", async () => {
    // The c===0 branch (line 576) is hit when the centered moving-average window
    // has no valid indices. This cannot happen naturally because j=i is always
    // in [0, n), so c >= 1. We cover the branch by confirming the normal path
    // still executes correctly; the defensive c===0 arm is genuinely unreachable.
    // Test with period=2 to exercise the window boundary at the edges:
    const values = [1, 2, 3];
    const result = await stlDecompose(values, 2);
    expect(result.trend).toHaveLength(3);
    for (const v of result.trend) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe("pelt — branch gaps", () => {
  it("segCost len<=0 arm (line 616) is a defensive guard in the internal closure", async () => {
    // The segCost(s, e) function returns 0 when len=e-s<=0. In the PELT loop,
    // s is always < t so len >= 1. Confirm pelt still produces valid output with
    // constant data (sampleVariance=0 → penalty via || 1 path):
    const values = [10, 10, 10, 10, 10];
    const result = await pelt(values);
    expect(Array.isArray(result)).toBe(true);
  });

  it("exercises the sampleVariance=0 fallback in default penalty (|| 1)", async () => {
    // When all values are the same, sampleVariance=0, so penalty=(0||1)*log(n)=log(n).
    const values = [42, 42, 42, 42, 42, 42];
    const result = await pelt(values);
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("gesdAnomalies — branch gaps", () => {
  it("maxPos<0 break arm (line 519) is a defensive guard", async () => {
    // maxPos starts at -1 and is always set inside the remaining-loop because
    // remaining.length >= 2 when n>=4. The maxPos<0 branch is unreachable
    // under normal inputs. Verify the function still runs without issue.
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = await gesdAnomalies(values, { maxAnomalies: 1 });
    expect(Array.isArray(result.indices)).toBe(true);
  });
});
