import { bench, describe } from "vitest";
import {
  anova1,
  attribution,
  correlationMatrix,
  dbscan,
  detectAnomalies,
  ewma,
  gesdAnomalies,
  holtWinters,
  kMeans,
  pelt,
  stlDecompose,
  welchTTest,
} from "@/workers/analysis.worker";

/**
 * Performance benchmarks for `analysis.worker.ts` — the shared statistics /
 * clustering / attribution kernel (run with `pnpm run bench`).
 *
 * These are the exported, directly-importable pure functions behind the
 * worker's Comlink surface (see the module doc comment: `analysis.worker.ts`'s
 * exported math is unit-tested directly, not through the Worker realm). They
 * run OFF the renderer main thread today, but the exact same numeric kernels
 * back every "Analytics" panel action (k-means/DBSCAN clustering, attribution,
 * correlation matrices, anomaly detection, change-point/forecast panels) — a
 * throughput regression here directly lengthens the worker round-trip the
 * renderer is waiting on.
 *
 * All synthetic input is built ONCE at module scope with a deterministic,
 * counter-based generator (NO Math.random / Date.now — this worker's OWN
 * seeded PRNG, `mulberry32`, is reused for the clustering input so the shape
 * is realistic without reaching for a nondeterministic source). Each bench
 * callback only exercises the kernel under test, never data generation.
 */

// ─── Deterministic generators (counter-based, index-varied) ─────────────────

/** Bounded pseudo-random in [0, mod) derived from a counter (no Math.random). */
function counterMod(i: number, mod: number): number {
  return ((i * 2654435761 + 40503) >>> 0) % mod;
}

/** Deterministic unit-ish value in [-1, 1] from a counter. */
function counterUnit(i: number): number {
  return (counterMod(i, 2000) - 1000) / 1000;
}

/** n x d numeric matrix with a few well-separated blobs (realistic clustering input). */
function buildBlobs(n: number, d: number, blobs: number): number[][] {
  const out: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    const blob = i % blobs;
    const row: number[] = new Array(d);
    for (let j = 0; j < d; j++) {
      row[j] = blob * 20 + counterUnit(i * d + j) * 3;
    }
    out[i] = row;
  }
  return out;
}

/** A trend + periodic + noise series, reused across the 1-D kernels below. */
function buildSeries(n: number): number[] {
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const trend = i * 0.02;
    const seasonal = Math.sin((i % 24) * ((2 * Math.PI) / 24)) * 8;
    const noise = counterUnit(i) * 2;
    const spike = i % 337 === 0 ? 60 : 0;
    out[i] = 100 + trend + seasonal + noise + spike;
  }
  return out;
}

function buildFactor(n: number, groups: number): (string | number)[] {
  return Array.from({ length: n }, (_, i) => `g${i % groups}`);
}

// ─── Pre-built deterministic input (module scope) ───────────────────────────

const REALISTIC_N = 1_000;
const STRESS_N = 5_000;

const BLOBS_REALISTIC = buildBlobs(REALISTIC_N, 5, 4);
const BLOBS_STRESS = buildBlobs(STRESS_N, 8, 4);

const SERIES_REALISTIC = buildSeries(REALISTIC_N);
const SERIES_STRESS = buildSeries(STRESS_N);

const FACTOR_REALISTIC = buildFactor(REALISTIC_N, 4);

const Y_REALISTIC = SERIES_REALISTIC.map((v, i) => v * 0.5 + counterUnit(i * 7));
const A_GROUP = SERIES_REALISTIC.slice(0, 500);
const B_GROUP = SERIES_REALISTIC.slice(500, 1000).map((v) => v + 15);

// ─── Benchmarks ─────────────────────────────────────────────────────────────

describe("kMeans (seeded typed-array k-means)", () => {
  bench("kMeans k=4 over 1k rows x 5 dims (realistic)", async () => {
    await kMeans(BLOBS_REALISTIC, { k: 4 });
  });
  bench("kMeans k=4 over 5k rows x 8 dims (stress)", async () => {
    await kMeans(BLOBS_STRESS, { k: 4 });
  });
});

describe("dbscan (density-clustering)", () => {
  bench("dbscan over 1k rows x 5 dims (realistic)", async () => {
    await dbscan(BLOBS_REALISTIC, 5, 5);
  });
  bench("dbscan over 5k rows x 8 dims (stress)", async () => {
    await dbscan(BLOBS_STRESS, 5, 5);
  });
});

describe("attribution (SVD pseudo-inverse standardized regression)", () => {
  bench("attribution over 1k rows x 5 dims (realistic)", async () => {
    await attribution(BLOBS_REALISTIC, Y_REALISTIC);
  });
  bench("attribution over 5k rows x 8 dims (stress)", async () => {
    await attribution(
      BLOBS_STRESS,
      BLOBS_STRESS.map((row, i) => row[0]! * 0.5 + counterUnit(i)),
    );
  });
});

describe("correlationMatrix (Pearson r matrix)", () => {
  bench("correlationMatrix over 1k rows x 5 dims (realistic)", async () => {
    await correlationMatrix(BLOBS_REALISTIC, ["a", "b", "c", "d", "e"]);
  });
  bench("correlationMatrix over 5k rows x 8 dims (stress)", async () => {
    await correlationMatrix(BLOBS_STRESS, ["a", "b", "c", "d", "e", "f", "g", "h"]);
  });
});

describe("welchTTest / anova1 (significance tests)", () => {
  bench("welchTTest over two 500-point groups", async () => {
    await welchTTest(A_GROUP, B_GROUP);
  });
  bench("anova1 over 1k points across 4 factor groups", async () => {
    await anova1(SERIES_REALISTIC, FACTOR_REALISTIC);
  });
});

describe("detectAnomalies / gesdAnomalies (outlier detection)", () => {
  bench("detectAnomalies (iqr) over 1k points (realistic)", async () => {
    await detectAnomalies(SERIES_REALISTIC, { method: "iqr" });
  });
  bench("detectAnomalies (zscore) over 5k points (stress)", async () => {
    await detectAnomalies(SERIES_STRESS, { method: "zscore" });
  });
  bench("gesdAnomalies over 1k points (realistic)", async () => {
    await gesdAnomalies(SERIES_REALISTIC);
  });
});

describe("ewma / stlDecompose (smoothing + decomposition)", () => {
  bench("ewma over 5k points", async () => {
    await ewma(SERIES_STRESS, 0.3);
  });
  bench("stlDecompose (period=24) over 1k points (realistic)", async () => {
    await stlDecompose(SERIES_REALISTIC, 24);
  });
  bench("stlDecompose (period=24) over 5k points (stress)", async () => {
    await stlDecompose(SERIES_STRESS, 24);
  });
});

describe("pelt (exact L2 change-point detection)", () => {
  bench("pelt over 1k points (realistic)", async () => {
    await pelt(SERIES_REALISTIC);
  });
  bench("pelt over 5k points (stress)", async () => {
    await pelt(SERIES_STRESS);
  });
});

describe("holtWinters (additive seasonal forecast)", () => {
  bench("holtWinters (period=24) over 1k points (realistic)", async () => {
    await holtWinters(SERIES_REALISTIC, { period: 24, horizon: 24 });
  });
  bench("holtWinters (period=24) over 5k points (stress)", async () => {
    await holtWinters(SERIES_STRESS, { period: 24, horizon: 24 });
  });
});
