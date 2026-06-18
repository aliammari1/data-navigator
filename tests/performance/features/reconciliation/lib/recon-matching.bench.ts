import { bench, describe } from "vitest";
import {
  fitMateriality,
  isMaterialRow,
  type MaterialityModel,
} from "@/features/reconciliation/lib/materiality";
import {
  buildDiffSQL,
  buildPageSQL,
  buildSummarySQL,
  toNullableNum,
  toNum,
  type DiffConfig,
  type DiffStatus,
} from "@/features/reconciliation/lib/recon-sql";

/**
 * Performance benchmarks for reconciliation matching + variance materiality.
 *
 * Hot path: after DuckDB returns the row-level diff, the client unwraps every
 * scalar (`toNum`/`toNullableNum`), fits a robust MAD-based materiality model
 * over the whole variance% distribution (`fitMateriality`), then classifies
 * every paired row (`isMaterialRow`). These run per-row over 10k–100k diff rows
 * on the renderer thread, so a throughput regression is directly user-visible.
 *
 * Synthetic input is built ONCE at module scope with a deterministic,
 * counter-based generator (no Math.random / Date.now). Each bench callback only
 * exercises the function under test, never data generation.
 */

// ─── Deterministic generators (counter-based, index-varied) ─────────────────

const STATUSES: DiffStatus[] = ["UNCHANGED", "CHANGED", "ADDED", "REMOVED"];

/** Deterministic pseudo-variance%: a bounded, index-varied spread with outliers. */
function syntheticVariancePct(i: number): number {
  // Mix two strides so the distribution has a dense center plus periodic
  // outliers (every 97th row), exercising the MAD outlier branch.
  const base = ((i * 37) % 211) / 21.1 - 5; // roughly [-5, +5]
  const spike = i % 97 === 0 ? (i % 7) * 18 : 0; // periodic fat tail
  return base + spike;
}

function buildVariancePcts(n: number): Array<number | null> {
  const out: Array<number | null> = new Array(n);
  for (let i = 0; i < n; i++) {
    // ~5% nulls (no expected value / zero base) to exercise the null filter.
    out[i] = i % 19 === 0 ? null : syntheticVariancePct(i);
  }
  return out;
}

interface DiffRow {
  status: DiffStatus;
  variancePct: number | null;
}

function buildDiffRows(n: number): DiffRow[] {
  const out: DiffRow[] = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = {
      status: STATUSES[i % STATUSES.length],
      variancePct: i % 19 === 0 ? null : syntheticVariancePct(i),
    };
  }
  return out;
}

/** Raw DuckDB-ish scalars: bigint, typed-array singletons, null, plain number. */
function buildRawScalars(n: number): unknown[] {
  const out: unknown[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const m = i % 5;
    if (m === 0) out[i] = null;
    else if (m === 1) out[i] = BigInt(i * 3);
    else if (m === 2) out[i] = Float64Array.of(i * 1.5);
    else if (m === 3) out[i] = i * 2.25;
    else out[i] = String(i); // numeric string -> Number()
  }
  return out;
}

const VARIANCE_10K = buildVariancePcts(10_000);
const VARIANCE_100K = buildVariancePcts(100_000);

const ROWS_10K = buildDiffRows(10_000);
const ROWS_100K = buildDiffRows(100_000);

const SCALARS_100K = buildRawScalars(100_000);

const TOLERANCE_PCT = 5;

// Pre-fit models so the per-row classification bench measures only isMaterialRow.
const MODEL_10K: MaterialityModel = fitMateriality(VARIANCE_10K, TOLERANCE_PCT);
const MODEL_100K: MaterialityModel = fitMateriality(VARIANCE_100K, TOLERANCE_PCT);

// ─── Wide DiffConfig for the SQL builders ───────────────────────────────────

function buildDiffConfig(measureCount: number): DiffConfig {
  const measures = Array.from({ length: measureCount }, (_, i) => ({
    label: `m_${i}`,
    expected: `exp_col_${i}`,
    actual: `act_col_${i}`,
  }));
  return {
    expectedView: "ds_expected_view",
    actualView: "ds_actual_view",
    keyCols: [
      { expected: "msisdn", actual: "phone" },
      { expected: "period", actual: "month" },
    ],
    measures,
  };
}

const CFG_WIDE = buildDiffConfig(50);

// ─── Benchmarks ─────────────────────────────────────────────────────────────

describe("materiality model fit (whole-distribution hot path)", () => {
  bench("fitMateriality over 10k variance% rows", () => {
    fitMateriality(VARIANCE_10K, TOLERANCE_PCT);
  });
  bench("fitMateriality over 100k variance% rows", () => {
    fitMateriality(VARIANCE_100K, TOLERANCE_PCT);
  });
});

describe("per-row materiality classification (per-row hot path)", () => {
  bench("isMaterialRow over 10k paired rows", () => {
    for (const row of ROWS_10K) {
      isMaterialRow(row.status, row.variancePct, MODEL_10K);
    }
  });
  bench("isMaterialRow over 100k paired rows", () => {
    for (const row of ROWS_100K) {
      isMaterialRow(row.status, row.variancePct, MODEL_100K);
    }
  });
});

describe("scalar unwrap (per-cell hot path over DuckDB results)", () => {
  bench("toNum over 100k mixed scalars", () => {
    for (const v of SCALARS_100K) toNum(v);
  });
  bench("toNullableNum over 100k mixed scalars", () => {
    for (const v of SCALARS_100K) toNullableNum(v);
  });
});

describe("diff SQL builders (wide 50-measure schema)", () => {
  bench("buildDiffSQL with 50 measures", () => {
    buildDiffSQL(CFG_WIDE);
  });
  bench("buildSummarySQL with 50 measures", () => {
    buildSummarySQL(CFG_WIDE, TOLERANCE_PCT);
  });
  bench("buildPageSQL with 50 measures", () => {
    buildPageSQL(CFG_WIDE, { limit: 100, offset: 0, onlyChanged: true });
  });
});
