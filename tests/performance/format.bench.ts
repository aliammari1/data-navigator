import { bench, describe } from "vitest";
import {
  fmtAmount,
  fmtCompact,
  fmtN,
  fmtPct,
  movingAverage,
  safeNum,
} from "@/features/telecom/lib/format";

/**
 * Performance benchmarks (run with `pnpm run bench`).
 *
 * These exercise hot paths that run per-row / per-cell during dataset ingest
 * and rendering. Tinybench (via Vitest) reports mean / p99 / ops-per-second so
 * regressions show up as a throughput drop. Wire `pnpm run bench` into a
 * CodSpeed (or similar) CI job to fail on statistically-significant slowdowns.
 */

const NUMS = Array.from({ length: 10_000 }, (_, i) => i * 1.234);

describe("format helpers (per-cell hot paths)", () => {
  bench("fmtN over 10k values", () => {
    for (const n of NUMS) fmtN(n, 2);
  });
  bench("fmtAmount over 10k values", () => {
    for (const n of NUMS) fmtAmount(n);
  });
  bench("fmtCompact over 10k values", () => {
    for (const n of NUMS) fmtCompact(n);
  });
  bench("fmtPct over 10k values", () => {
    for (const n of NUMS) fmtPct(n % 100);
  });
  bench("safeNum coercion over 10k values", () => {
    for (const n of NUMS) safeNum(String(n));
  });
});

describe("statistics (per-window hot paths)", () => {
  bench("movingAverage window=20 over 10k", () => {
    movingAverage(NUMS, 20);
  });
});
