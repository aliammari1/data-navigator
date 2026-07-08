import { bench, describe } from "vitest";
import { nullRateFromSummary, numberOrUndefined } from "@/shared/duckdb-summary";

/**
 * Performance benchmarks for the shared DuckDB SUMMARIZE coercion helpers
 * (run with `pnpm run bench`).
 *
 * `numberOrUndefined` and `nullRateFromSummary` run once per SUMMARIZE field,
 * i.e. ~10 fields × (columns) per import. On a wide schema (hundreds of columns)
 * or when these helpers are reused across re-profiling passes, they sit on the
 * ingest hot path, so a throughput regression here is meaningful.
 *
 * Inputs are built ONCE at module scope with a deterministic counter-based
 * generator (no Math.random / Date.now — both unavailable / non-deterministic)
 * so the bench measures the coercion, not data generation.
 */

// ─── Deterministic synthetic SUMMARIZE-field inputs ──────────────────────────

/**
 * Build a mixed bag of values that exercise every branch of
 * `numberOrUndefined`: plain numbers, numeric strings, bigints (large
 * COUNT/approx_unique), null/undefined, and non-finite/garbage values.
 */
function buildNumericFieldInputs(count: number): unknown[] {
  const out: unknown[] = new Array(count);
  for (let i = 0; i < count; i++) {
    switch (i % 6) {
      case 0:
        out[i] = i * 1.234; // plain finite number
        break;
      case 1:
        out[i] = String(i * 9.87); // numeric string
        break;
      case 2:
        out[i] = BigInt(i) * 1_000_003n; // large bigint (COUNT/approx_unique)
        break;
      case 3:
        out[i] = i % 12 === 3 ? null : undefined; // nullish
        break;
      case 4:
        out[i] = "not-a-number"; // garbage → NaN → undefined
        break;
      default:
        out[i] = i % 7 === 0 ? Infinity : -i; // non-finite + negative
        break;
    }
  }
  return out;
}

/**
 * Build `null_percentage` shapes: plain numbers, `%`-suffixed strings,
 * whitespace-padded strings, nullish, and out-of-range values to exercise the
 * clamp.
 */
function buildNullPercentageInputs(count: number): unknown[] {
  const out: unknown[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const pct = (i % 101) + (i % 1000) / 1000; // 0..101.999 spread
    switch (i % 5) {
      case 0:
        out[i] = pct; // numeric
        break;
      case 1:
        out[i] = `${pct}%`; // %-suffixed string
        break;
      case 2:
        out[i] = `  ${pct}%  `; // whitespace-padded
        break;
      case 3:
        out[i] = i % 9 === 3 ? null : undefined; // nullish → 0
        break;
      default:
        out[i] = i % 8 === 0 ? "garbage%" : String(pct); // unparseable + bare
        break;
    }
  }
  return out;
}

const NUMERIC_10K = buildNumericFieldInputs(10_000);
const NUMERIC_100K = buildNumericFieldInputs(100_000);
const NULLPCT_10K = buildNullPercentageInputs(10_000);
const NULLPCT_100K = buildNullPercentageInputs(100_000);

describe("numberOrUndefined (per-field SUMMARIZE coercion)", () => {
  bench("numberOrUndefined over 10k mixed fields", () => {
    let acc = 0;
    for (const v of NUMERIC_10K) {
      const n = numberOrUndefined(v);
      if (n !== undefined) acc += n;
    }
    if (acc === Number.POSITIVE_INFINITY) throw new Error("unreachable");
  });

  bench("numberOrUndefined over 100k mixed fields", () => {
    let acc = 0;
    for (const v of NUMERIC_100K) {
      const n = numberOrUndefined(v);
      if (n !== undefined) acc += n;
    }
    if (acc === Number.POSITIVE_INFINITY) throw new Error("unreachable");
  });
});

describe("nullRateFromSummary (per-column null_percentage parse)", () => {
  bench("nullRateFromSummary over 10k mixed fields", () => {
    let acc = 0;
    for (const v of NULLPCT_10K) acc += nullRateFromSummary(v);
    if (acc < 0) throw new Error("unreachable");
  });

  bench("nullRateFromSummary over 100k mixed fields", () => {
    let acc = 0;
    for (const v of NULLPCT_100K) acc += nullRateFromSummary(v);
    if (acc < 0) throw new Error("unreachable");
  });
});
