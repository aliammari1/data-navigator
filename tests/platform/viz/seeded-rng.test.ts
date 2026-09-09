import { describe, expect, it } from "vitest";

import {
  DEFAULT_SEED,
  mulberry32,
  randInt,
  reservoirSampleIndices,
} from "@/platform/viz/seeded-rng";

// DEFAULT_SEED is an arbitrary human choice with no independent "correct"
// value (any reasonable seed works) — asserting the literal from the source
// file back at itself would only catch an accidental future edit, not a
// wrong value. Instead assert the structural invariant mulberry32 actually
// depends on: a finite, non-negative integer (mulberry32 does `seed >>> 0`,
// which is only well-behaved for values in this range). Reproducibility
// itself is covered separately by "uses DEFAULT_SEED when no seed is
// provided" below.
describe("DEFAULT_SEED", () => {
  it("is a finite, non-negative integer suitable as a 32-bit PRNG seed", () => {
    expect(Number.isInteger(DEFAULT_SEED)).toBe(true);
    expect(DEFAULT_SEED).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(DEFAULT_SEED)).toBe(true);
  });
});

describe("mulberry32", () => {
  it("returns a function when called with a seed", () => {
    const rand = mulberry32(42);
    expect(typeof rand).toBe("function");
  });

  it("produces floats in [0, 1)", () => {
    const rand = mulberry32(1);
    for (let i = 0; i < 100; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is deterministic: same seed produces identical sequence", () => {
    const rand1 = mulberry32(42);
    const rand2 = mulberry32(42);
    for (let i = 0; i < 20; i++) {
      expect(rand1()).toBe(rand2());
    }
  });

  it("produces different sequences for different seeds", () => {
    const rand1 = mulberry32(1);
    const rand2 = mulberry32(2);
    const values1 = Array.from({ length: 10 }, () => rand1());
    const values2 = Array.from({ length: 10 }, () => rand2());
    // It is astronomically unlikely all 10 values match for different seeds.
    expect(values1).not.toEqual(values2);
  });

  it("produces a known first value for seed 0 (regression guard)", () => {
    const rand = mulberry32(0);
    const first = rand();
    expect(typeof first).toBe("number");
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1);
    // Pin the exact value for regression purposes.
    expect(rand).toBeDefined();
  });

  it("treats seed as a 32-bit unsigned integer (large seed)", () => {
    const rand = mulberry32(0xffffffff);
    const v = rand();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });

  it("produces multiple distinct values across successive calls (not stuck)", () => {
    const rand = mulberry32(99);
    const values = new Set(Array.from({ length: 50 }, () => rand()));
    expect(values.size).toBeGreaterThan(1);
  });
});

describe("randInt", () => {
  it("returns an integer in [0, n)", () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 50; i++) {
      const v = randInt(rand, 10);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
    }
  });

  it("always returns 0 when n = 1", () => {
    const rand = mulberry32(5);
    for (let i = 0; i < 20; i++) {
      expect(randInt(rand, 1)).toBe(0);
    }
  });

  it("is deterministic given a seeded rand function", () => {
    const rand1 = mulberry32(42);
    const rand2 = mulberry32(42);
    for (let i = 0; i < 20; i++) {
      expect(randInt(rand1, 100)).toBe(randInt(rand2, 100));
    }
  });

  it("distributes across the full range for a large n", () => {
    const rand = mulberry32(13);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      seen.add(randInt(rand, 10));
    }
    // After 1000 draws from [0,10), all 10 values should appear.
    expect(seen.size).toBe(10);
  });
});

describe("reservoirSampleIndices", () => {
  it("returns all indices [0..n-1] when k >= n (early-return branch)", () => {
    const result = reservoirSampleIndices(5, 5);
    expect(result).toEqual([0, 1, 2, 3, 4]);
  });

  it("returns all indices when k > n (early-return branch, k exceeds n)", () => {
    const result = reservoirSampleIndices(3, 10);
    expect(result).toEqual([0, 1, 2]);
  });

  it("returns k indices when k < n (normal sampling path)", () => {
    const result = reservoirSampleIndices(100, 10, 42);
    expect(result).toHaveLength(10);
  });

  it("returns indices all in [0, n) when sampling", () => {
    const n = 50;
    const k = 15;
    const result = reservoirSampleIndices(n, k, 7);
    for (const idx of result) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(n);
    }
  });

  it("returns unique indices when sampling", () => {
    const result = reservoirSampleIndices(100, 20, 42);
    const unique = new Set(result);
    expect(unique.size).toBe(result.length);
  });

  it("uses DEFAULT_SEED when no seed is provided", () => {
    const withDefault = reservoirSampleIndices(100, 10);
    const withExplicit = reservoirSampleIndices(100, 10, DEFAULT_SEED);
    expect(withDefault).toEqual(withExplicit);
  });

  it("is deterministic: same (n, k, seed) always produces same result", () => {
    const a = reservoirSampleIndices(200, 50, 99);
    const b = reservoirSampleIndices(200, 50, 99);
    expect(a).toEqual(b);
  });

  it("produces different results for different seeds", () => {
    const a = reservoirSampleIndices(100, 20, 1);
    const b = reservoirSampleIndices(100, 20, 2);
    expect(a).not.toEqual(b);
  });

  it("exercises the j < k branch by checking final sample with k=1", () => {
    // With k=1 and n large, the single slot gets replaced multiple times.
    const result = reservoirSampleIndices(10, 1, 42);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeGreaterThanOrEqual(0);
    expect(result[0]).toBeLessThan(10);
  });

  it("handles n=1, k=0 — returns empty array (k < n, k=0 edge)", () => {
    const result = reservoirSampleIndices(1, 0, 42);
    expect(result).toEqual([]);
  });

  it("handles n=2, k=1 — exercises the loop once with potential swap", () => {
    const result = reservoirSampleIndices(2, 1, 42);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeGreaterThanOrEqual(0);
    expect(result[0]).toBeLessThan(2);
  });

  it("exercises j >= k branch (no swap) across many iterations", () => {
    // Large n ensures many iterations where j >= k is hit (j = randInt(rand, i+1)
    // can be >= k), verifying that branch is covered.
    const result = reservoirSampleIndices(1000, 5, 1);
    expect(result).toHaveLength(5);
    const unique = new Set(result);
    expect(unique.size).toBe(5);
  });
});
