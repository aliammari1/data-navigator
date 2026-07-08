import { bench, describe } from "vitest";
import { aggregateRowsInMemory } from "@/features/data-formulator/core/formulator/chart-data";
import type { Row } from "@/features/data-formulator/core/formulator/model";
import type { ChartSpec } from "@/features/data-formulator/core/types";

/**
 * Performance benchmarks for the Formulator "python-lane" chart-data
 * aggregation (run with `pnpm run bench`).
 *
 * Hot path: `aggregateRowsInMemory` is the pandas-lane twin of `buildSQL`
 * (core/sql.ts) — every time a python-derived table (materialized rows, capped
 * at `MAX_DERIVED_ROWS` = 10,000 per core/formulator/model.ts) is bound to a
 * chart shelf, this runs SYNCHRONOUSLY on the render thread: filter, group-by,
 * per-group aggregate, sort, and cap to the chart row limit. It re-runs on
 * every shelf-encoding change (switching x/y/color, toggling an aggregate,
 * adding a filter pill), so a throughput regression here is directly
 * user-visible as chart-refresh lag for python-derived threads.
 *
 * All synthetic input is built ONCE at module scope with a deterministic,
 * counter-based generator (NO Math.random / Date.now). Each bench callback
 * only exercises `aggregateRowsInMemory`, never row generation.
 */

// ─── Deterministic generators (counter-based, index-varied) ─────────────────

const REGIONS = ["North", "South", "East", "West", "Central"];
const CATEGORIES = Array.from({ length: 20 }, (_, i) => `Category ${i}`);

/** Bounded pseudo-random in [0, mod) derived from a counter (no Math.random). */
function counterMod(i: number, mod: number): number {
  return ((i * 2654435761 + 40503) >>> 0) % mod;
}

function buildRows(n: number): Row[] {
  const out: Row[] = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = {
      category: CATEGORIES[i % CATEGORIES.length],
      region: REGIONS[i % REGIONS.length],
      amount: 10 + counterMod(i, 9990) / 10,
      qty: 1 + counterMod(i, 500),
    };
  }
  return out;
}

// ─── Pre-built deterministic input (module scope) ───────────────────────────

// 1k = a typical python-derivation preview; 10k = MAX_DERIVED_ROWS stress ceiling.
const ROWS_1K = buildRows(1_000);
const ROWS_10K = buildRows(10_000);

function spec(overrides: Partial<ChartSpec>): ChartSpec {
  return {
    id: "bench",
    type: "bar",
    encodings: [],
    filters: [],
    limit: 500,
    title: "bench",
    ...overrides,
  };
}

const GROUP_BY_CATEGORY_SUM = spec({
  encodings: [
    { id: "x", channel: "x", field: "category" },
    { id: "y", channel: "y", field: "amount", aggregate: "sum" },
  ],
});

const GROUP_BY_CATEGORY_REGION_AVG = spec({
  encodings: [
    { id: "x", channel: "x", field: "category" },
    { id: "color", channel: "color", field: "region" },
    { id: "y", channel: "y", field: "amount", aggregate: "avg" },
  ],
});

// No aggregate bound anywhere -> the raw per-row projection branch (scatter).
const RAW_SCATTER = spec({
  type: "scatter",
  encodings: [
    { id: "x", channel: "x", field: "amount" },
    { id: "y", channel: "y", field: "qty" },
  ],
});

// Group-by with a filter pill applied first (exercises applyFilters + matchesFilter).
const GROUP_WITH_FILTER = spec({
  encodings: [
    { id: "x", channel: "x", field: "category" },
    { id: "y", channel: "y", field: "amount", aggregate: "sum" },
  ],
  filters: [{ id: "f1", field: "region", op: "=", value: "North" }],
});

// ─── Benchmarks ─────────────────────────────────────────────────────────────

describe("aggregateRowsInMemory (python-lane chart aggregation)", () => {
  bench("group by category, sum(amount) — 1k rows (typical preview)", () => {
    aggregateRowsInMemory(ROWS_1K, GROUP_BY_CATEGORY_SUM);
  });

  bench("group by category, sum(amount) — 10k rows (MAX_DERIVED_ROWS stress)", () => {
    aggregateRowsInMemory(ROWS_10K, GROUP_BY_CATEGORY_SUM);
  });

  bench("group by category + color, avg(amount) — 10k rows", () => {
    aggregateRowsInMemory(ROWS_10K, GROUP_BY_CATEGORY_REGION_AVG);
  });

  bench("raw (no aggregation) scatter projection — 10k rows", () => {
    aggregateRowsInMemory(ROWS_10K, RAW_SCATTER);
  });

  bench("filtered group by (one active filter pill) — 10k rows", () => {
    aggregateRowsInMemory(ROWS_10K, GROUP_WITH_FILTER);
  });
});
