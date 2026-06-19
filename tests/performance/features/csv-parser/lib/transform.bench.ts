import { bench, describe } from "vitest";
import { compileFilter, type RowRecord } from "@/features/csv-parser/lib/filter";
import { castValue, detectType, profileColumn } from "@/features/csv-parser/lib/profile";

/**
 * Performance benchmarks for the in-memory transform hot paths that run inside
 * the CSV worker / filter loop over a full dataset (not a preview sample):
 *
 *  - `compileFilter` (src/features/csv-parser/lib/filter.ts) compiles a filter
 *    expression ONCE into a row predicate; the predicate is then applied to
 *    every row. We bench BOTH the compile cost and the per-row apply cost
 *    (the actual "filter over N rows" hot path) at 10k and 100k rows.
 *  - `detectType` / `castValue` / `profileColumn`
 *    (src/features/csv-parser/lib/profile.ts) are the type-inference, per-cell
 *    cast (derive), and per-column aggregate/distinct passes — also benched at
 *    10k and 100k.
 *
 * All inputs are built ONCE at module scope with a deterministic, counter-based
 * generator (no Math.random / Date.now) so the bench measures the function, not
 * data generation. Run with `pnpm run bench`.
 */

const CITIES = ["Tunis", "Sfax", "Sousse", "Gabes", "Bizerte", "Nabeul"] as const;
const STATUSES = ["active", "pending", "closed", "error"] as const;

interface SyntheticRow extends RowRecord {
  id: number;
  amount: number;
  city: string;
  status: string;
  flag: boolean;
}

/**
 * Deterministic row generator. Field values vary by index (no randomness) so
 * predicates match a realistic, stable fraction of rows.
 */
function makeRows(n: number): SyntheticRow[] {
  const rows: SyntheticRow[] = new Array(n);
  for (let i = 0; i < n; i++) {
    rows[i] = {
      id: i,
      amount: (i * 37) % 5000,
      city: CITIES[i % CITIES.length],
      status: STATUSES[i % STATUSES.length],
      flag: i % 3 === 0,
    };
  }
  return rows;
}

const ROWS_10K = makeRows(10_000);
const ROWS_100K = makeRows(100_000);

// Compile predicates ONCE so the apply benches measure only predicate eval.
const NUMERIC_PRED = compileFilter("amount >= 2500");
const EQ_PRED = compileFilter("status = active");
const LIKE_PRED = compileFilter("city LIKE %ous%");

// Raw (string) column values feeding detectType / castValue, varied by index.
function makeNumericStrings(n: number): string[] {
  const out: string[] = new Array(n);
  for (let i = 0; i < n; i++) {
    // Mostly numeric, with thousands separators and a sprinkle of nulls.
    out[i] = i % 17 === 0 ? "" : `${(i * 123) % 1_000},${(i % 900) + 100}`;
  }
  return out;
}

function makeMixedStrings(n: number): string[] {
  const out: string[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const bucket = i % 4;
    out[i] =
      bucket === 0
        ? `${(i * 7) % 10_000}`
        : bucket === 1
          ? `2024-0${(i % 9) + 1}-15`
          : bucket === 2
            ? CITIES[i % CITIES.length]
            : i % 2 === 0
              ? "true"
              : "false";
  }
  return out;
}

const NUMERIC_STRINGS_10K = makeNumericStrings(10_000);
const NUMERIC_STRINGS_100K = makeNumericStrings(100_000);
const MIXED_STRINGS_10K = makeMixedStrings(10_000);
const MIXED_STRINGS_100K = makeMixedStrings(100_000);

// Already-cast numeric column (numbers) feeding profileColumn's stats path.
function makeNumberColumn(n: number): number[] {
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * 31) % 25_000;
  return out;
}
const NUMBER_COLUMN_10K = makeNumberColumn(10_000);
const NUMBER_COLUMN_100K = makeNumberColumn(100_000);

describe("compileFilter (compile-once cost)", () => {
  bench("compile numeric comparison expression", () => {
    compileFilter("amount >= 2500");
  });
  bench("compile equality expression", () => {
    compileFilter("status = active");
  });
  bench("compile LIKE expression", () => {
    compileFilter("city LIKE %ous%");
  });
});

describe("filter apply (predicate over N rows)", () => {
  bench("numeric predicate over 10k rows", () => {
    let kept = 0;
    for (const row of ROWS_10K) if (NUMERIC_PRED?.(row)) kept++;
    if (kept < 0) throw new Error("unreachable");
  });
  bench("numeric predicate over 100k rows", () => {
    let kept = 0;
    for (const row of ROWS_100K) if (NUMERIC_PRED?.(row)) kept++;
    if (kept < 0) throw new Error("unreachable");
  });
  bench("equality predicate over 10k rows", () => {
    let kept = 0;
    for (const row of ROWS_10K) if (EQ_PRED?.(row)) kept++;
    if (kept < 0) throw new Error("unreachable");
  });
  bench("equality predicate over 100k rows", () => {
    let kept = 0;
    for (const row of ROWS_100K) if (EQ_PRED?.(row)) kept++;
    if (kept < 0) throw new Error("unreachable");
  });
  bench("LIKE predicate over 10k rows", () => {
    let kept = 0;
    for (const row of ROWS_10K) if (LIKE_PRED?.(row)) kept++;
    if (kept < 0) throw new Error("unreachable");
  });
  bench("LIKE predicate over 100k rows", () => {
    let kept = 0;
    for (const row of ROWS_100K) if (LIKE_PRED?.(row)) kept++;
    if (kept < 0) throw new Error("unreachable");
  });
});

describe("detectType (type inference over full column)", () => {
  bench("detectType over 10k numeric strings", () => {
    detectType(NUMERIC_STRINGS_10K);
  });
  bench("detectType over 100k numeric strings", () => {
    detectType(NUMERIC_STRINGS_100K);
  });
  bench("detectType over 10k mixed strings", () => {
    detectType(MIXED_STRINGS_10K);
  });
  bench("detectType over 100k mixed strings", () => {
    detectType(MIXED_STRINGS_100K);
  });
});

describe("castValue (per-cell derive / coercion)", () => {
  bench("castValue -> number over 10k cells", () => {
    for (const value of NUMERIC_STRINGS_10K) castValue(value, "number");
  });
  bench("castValue -> number over 100k cells", () => {
    for (const value of NUMERIC_STRINGS_100K) castValue(value, "number");
  });
  bench("castValue -> date over 10k cells", () => {
    for (const value of MIXED_STRINGS_10K) castValue(value, "date");
  });
});

describe("profileColumn (per-column aggregate + distinct)", () => {
  bench("profileColumn numeric over 10k values", () => {
    profileColumn("amount", NUMBER_COLUMN_10K, "number");
  });
  bench("profileColumn numeric over 100k values", () => {
    profileColumn("amount", NUMBER_COLUMN_100K, "number");
  });
  bench("profileColumn string (distinct) over 10k values", () => {
    profileColumn("city", MIXED_STRINGS_10K, "string");
  });
  bench("profileColumn string (distinct) over 100k values", () => {
    profileColumn("city", MIXED_STRINGS_100K, "string");
  });
});
