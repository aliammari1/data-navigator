import { bench, describe } from "vitest";
import {
  buildSearchPredicate,
  buildWhereClause,
  composeWhereClause,
  generateCountSQL,
  generateExportSQL,
  generateSQL,
} from "@/features/data-browser/model/helpers";
import type { ColumnDef, FilterGroup, FilterRule, SortConfig } from "@/features/data-browser/model/types";

/**
 * Performance benchmarks for the data-browser SQL-building hot path
 * (run with `pnpm run bench`).
 *
 * `buildWhereClause` / `buildSearchPredicate` / `composeWhereClause` /
 * `generateSQL` run on EVERY filter-pill edit, global-search keystroke (debounced,
 * but still per-query), sort change, and page turn in the data-browser grid —
 * this is quote-escaping + string-building code that also had a real
 * SQL-injection bug fixed here before (see `comparisonOperand`), so a
 * regression on this path is both a perf and a correctness-adjacent risk.
 *
 * All synthetic input is built ONCE at module scope with a deterministic,
 * counter-based generator (NO Math.random / Date.now).
 */

// ─── Deterministic generators (counter-based, index-varied) ─────────────────

const OPERATORS: FilterRule["operator"][] = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "in",
  "between",
];

/** Bounded pseudo-random in [0, mod) derived from a counter (no Math.random). */
function counterMod(i: number, mod: number): number {
  return ((i * 2654435761 + 40503) >>> 0) % mod;
}

function buildRules(n: number): FilterRule[] {
  return Array.from({ length: n }, (_, i) => {
    const op = OPERATORS[i % OPERATORS.length]!;
    // A couple of values intentionally look like injection attempts, so the
    // benched code path always exercises `comparisonOperand`'s literal-quoting
    // branch (never just the fast numeric branch).
    const value =
      i % 11 === 0
        ? `${counterMod(i, 1000)} OR 1=1; --`
        : op === "in"
          ? `v${i}-a,v${i}-b,v${i}-c`
          : String(counterMod(i, 100_000));
    return {
      id: `rule-${i}`,
      column: `col_${i % 25}`,
      operator: op,
      value,
      value2: op === "between" ? String(counterMod(i, 100_000) + 500) : undefined,
      active: i % 13 !== 0, // a few inactive rules, exercising the filter step
    };
  });
}

function buildFilterGroup(ruleCount: number): FilterGroup {
  return {
    id: "bench-group",
    logic: ruleCount % 2 === 0 ? "AND" : "OR",
    rules: buildRules(ruleCount),
    name: "bench",
    saved: false,
  };
}

function buildColumns(n: number): ColumnDef[] {
  const types: ColumnDef["type"][] = ["string", "number", "date", "boolean", "email", "url"];
  return Array.from({ length: n }, (_, i) => ({
    id: `col-${i}`,
    name: `col_${i}`,
    type: types[i % types.length]!,
    width: 120,
    visible: i % 7 !== 0,
    pinned: null,
    sortable: true,
    filterable: true,
    dbType: "VARCHAR",
  }));
}

function buildSorts(n: number): SortConfig[] {
  return Array.from({ length: n }, (_, i) => ({
    column: `col_${i}`,
    direction: i % 2 === 0 ? "asc" : "desc",
    priority: n - i,
  }));
}

// ─── Pre-built deterministic input (module scope) ───────────────────────────

// Realistic: a handful of active filter pills, ~25 grid columns — a typical
// data-browser session. Stress: a large saved filter set + wide schema.
const GROUP_REALISTIC = buildFilterGroup(5);
const GROUP_STRESS = buildFilterGroup(200);

const COLUMNS_REALISTIC = buildColumns(25);
const COLUMNS_STRESS = buildColumns(300);

const SORTS = buildSorts(3);

// ─── Benchmarks ─────────────────────────────────────────────────────────────

describe("buildWhereClause (per-filter-edit predicate build)", () => {
  bench("buildWhereClause — 5 rules (realistic)", () => {
    buildWhereClause(GROUP_REALISTIC);
  });
  bench("buildWhereClause — 200 rules (stress)", () => {
    buildWhereClause(GROUP_STRESS);
  });
});

describe("buildSearchPredicate (global-search ILIKE fan-out)", () => {
  bench("buildSearchPredicate — 25 columns (realistic)", () => {
    buildSearchPredicate("success", COLUMNS_REALISTIC);
  });
  bench("buildSearchPredicate — 300 columns (stress)", () => {
    buildSearchPredicate("success", COLUMNS_STRESS);
  });
});

describe("composeWhereClause (filter + search combined per query)", () => {
  bench("composeWhereClause — 5 rules / 25 columns (realistic)", () => {
    composeWhereClause(GROUP_REALISTIC, "success", COLUMNS_REALISTIC);
  });
  bench("composeWhereClause — 200 rules / 300 columns (stress)", () => {
    composeWhereClause(GROUP_STRESS, "success", COLUMNS_STRESS);
  });
});

describe("generateSQL / generateCountSQL / generateExportSQL (full query build)", () => {
  const whereRealistic = composeWhereClause(GROUP_REALISTIC, "success", COLUMNS_REALISTIC);
  const whereStress = composeWhereClause(GROUP_STRESS, "success", COLUMNS_STRESS);

  bench("generateSQL — realistic page query", () => {
    generateSQL("dataset_view", COLUMNS_REALISTIC, SORTS, whereRealistic, 100, 0);
  });
  bench("generateSQL — stress page query (wide schema, large filter set)", () => {
    generateSQL("dataset_view", COLUMNS_STRESS, SORTS, whereStress, 100, 0);
  });
  bench("generateCountSQL — stress filter set", () => {
    generateCountSQL("dataset_view", whereStress);
  });
  bench("generateExportSQL — stress full-export query", () => {
    generateExportSQL("dataset_view", COLUMNS_STRESS, SORTS, whereStress);
  });
});
