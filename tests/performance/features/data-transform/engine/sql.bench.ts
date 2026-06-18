import { bench, describe } from "vitest";
import {
  buildCountQuery,
  buildCTE,
  buildReadableSQL,
  quoteIdent,
  quoteString,
  stepToSQL,
  type TransformStep,
} from "@/features/data-transform/engine/sql";

/**
 * Performance benchmarks for the transform-pipeline SQL compiler
 * (`src/features/data-transform/engine/sql.ts`).
 *
 * These are the pure, IO-free hot paths that recompile on every recipe edit:
 * each filter / aggregate / pivot / derive / sort / deduplicate step is turned
 * into a SELECT fragment and the enabled steps are fused into a single nested
 * CTE (`buildCTE`) plus a UNION-ALL count query (`buildCountQuery`). A large
 * pipeline (deep step list) recompiles end-to-end per keystroke, so throughput
 * here directly bounds editor responsiveness.
 *
 * Run with `pnpm run bench`. Tinybench (via Vitest) reports mean / p99 /
 * ops-per-second so a regression shows up as a throughput drop.
 */

const SOURCE_TABLE = "daily_transactions";

const STEP_TYPES = [
  "filter",
  "select",
  "rename",
  "derive",
  "aggregate",
  "sort",
  "deduplicate",
  "limit",
  "join",
  "pivot",
] as const;

/**
 * Deterministic, counter-based step generator (no Math.random / Date.now).
 * Cycles through every step type and varies the config by index so the
 * compiled SQL is realistically diverse (different columns, ops, expressions).
 */
function makeStep(i: number): TransformStep {
  const type = STEP_TYPES[i % STEP_TYPES.length];
  const col = `col_${i % 37}`;
  const other = `col_${(i + 13) % 37}`;
  return {
    id: `s${i}`,
    type,
    label: `${type} #${i}`,
    enabled: i % 11 !== 0, // ~9% disabled, exercising the enabled filter
    config: {
      condition: `${col} >= ${i % 1000} AND ${other} != 'x${i % 7}'`,
      columns: `${col}, ${other}, col_${(i + 5) % 37}`,
      alias: `derived_${i}`,
      expression: `(${col} + ${other}) * ${1 + (i % 4)}`,
      groupBy: `${col}, ${other}`,
      agg: `SUM(${other}) AS total_${i}, COUNT(*) AS n_${i}`,
      column: col,
      direction: i % 2 === 0 ? "ASC" : "DESC",
      count: 100 + (i % 900),
      table: `dim_${i % 9}`,
      leftKey: col,
      rightKey: other,
      joinType: ["inner", "left", "right", "full"][i % 4],
      onColumn: col,
      usingAgg: `SUM(${other})`,
    },
  };
}

function makePipeline(length: number): TransformStep[] {
  return Array.from({ length }, (_, i) => makeStep(i));
}

// Built ONCE so the bench measures the compiler, not pipeline generation.
const PIPELINE_8 = makePipeline(8);
const PIPELINE_50 = makePipeline(50);
const PIPELINE_200 = makePipeline(200);

// A wide set of one-step-per-type pipelines for per-step fragment benching.
const SINGLE_STEPS = STEP_TYPES.map((_, i) => makeStep(i));

// Identifiers / literals with embedded quotes to exercise the escape path.
const IDENTS = Array.from(
  { length: 10_000 },
  (_, i) => `weird"col"${i}_${i % 5}'name`,
);

describe("identifier / literal quoting (per-cell hot path)", () => {
  bench("quoteIdent over 10k names (with embedded quotes)", () => {
    for (const name of IDENTS) quoteIdent(name);
  });
  bench("quoteString over 10k values (with embedded quotes)", () => {
    for (const value of IDENTS) quoteString(value);
  });
});

describe("per-step SQL fragment compilation", () => {
  bench("stepToSQL across all 10 step types, 10k iterations", () => {
    for (let i = 0; i < 1000; i++) {
      for (const step of SINGLE_STEPS) {
        stepToSQL(step, "src");
      }
    }
  });
});

describe("full pipeline compilation (buildCTE)", () => {
  bench("buildCTE over 8-step pipeline", () => {
    buildCTE(PIPELINE_8, SOURCE_TABLE);
  });
  bench("buildCTE over 50-step pipeline", () => {
    buildCTE(PIPELINE_50, SOURCE_TABLE);
  });
  bench("buildCTE over 200-step pipeline", () => {
    buildCTE(PIPELINE_200, SOURCE_TABLE);
  });
});

describe("count-query compilation (buildCountQuery)", () => {
  bench("buildCountQuery over 50-step pipeline", () => {
    const compiled = buildCTE(PIPELINE_50, SOURCE_TABLE);
    buildCountQuery(PIPELINE_50, SOURCE_TABLE, compiled);
  });
  bench("buildCountQuery over 200-step pipeline", () => {
    const compiled = buildCTE(PIPELINE_200, SOURCE_TABLE);
    buildCountQuery(PIPELINE_200, SOURCE_TABLE, compiled);
  });
});

describe("readable-SQL export (buildReadableSQL)", () => {
  bench("buildReadableSQL over 50-step pipeline", () => {
    buildReadableSQL(PIPELINE_50, SOURCE_TABLE, 1_000_000);
  });
  bench("buildReadableSQL over 200-step pipeline", () => {
    buildReadableSQL(PIPELINE_200, SOURCE_TABLE, 1_000_000);
  });
});
