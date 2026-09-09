/**
 * Deterministic seeded PRNG — the single source of truth for every ML/viz kernel
 * that must be reproducible (same dataset + same seed ⇒ identical result).
 *
 * `mulberry32` is fast, allocation-free, and deterministic. NEVER use bare
 * `Math.random()` in a compute kernel — it silently breaks reproducibility and
 * the offline "persist {seed,result}; reload reproduces" guarantee.
 */

/** Default seed used across the app for reproducible clustering/sampling. */
export const DEFAULT_SEED = 42;

/** A 32-bit seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded integer in [0, n). */
export function randInt(rand: () => number, n: number): number {
  return Math.floor(rand() * n);
}

/**
 * Deterministic reservoir sample of `k` indices from `[0, n)` using a seeded
 * PRNG. Unbiased (Algorithm R) — unlike `LIMIT n` which is positionally biased.
 */
export function reservoirSampleIndices(
  n: number,
  k: number,
  seed: number = DEFAULT_SEED,
): number[] {
  if (k >= n) return Array.from({ length: n }, (_, i) => i);
  const rand = mulberry32(seed);
  const out = Array.from({ length: k }, (_, i) => i);
  for (let i = k; i < n; i++) {
    const j = randInt(rand, i + 1);
    if (j < k) out[j] = i;
  }
  return out;
}
