import { describe, expect, it } from "vitest";
import {
  actColName,
  buildDiffSQL,
  buildMaterialRowsSQL,
  buildPageSQL,
  buildSummarySQL,
  type DiffConfig,
  expColName,
  keyColName,
  quoteIdent,
  slugifyMeasure,
  toNullableNum,
  toNum,
  varColName,
  varPctColName,
} from "@/features/reconciliation/lib/recon-sql";

function baseConfig(overrides: Partial<DiffConfig> = {}): DiffConfig {
  return {
    expectedView: "expected_view",
    actualView: "actual_view",
    keyCols: [{ expected: "channel", actual: "channel" }],
    measures: [{ label: "revenue", expected: "rev", actual: "rev" }],
    ...overrides,
  };
}

describe("quoteIdent", () => {
  it("wraps a plain identifier in double quotes", () => {
    expect(quoteIdent("amount")).toBe('"amount"');
  });

  it("escapes embedded double quotes by doubling them", () => {
    expect(quoteIdent('we"ird')).toBe('"we""ird"');
  });

  it("escapes every embedded quote, preventing identifier breakout", () => {
    expect(quoteIdent('a"; DROP TABLE x; --')).toBe('"a""; DROP TABLE x; --"');
  });

  it("quotes an empty identifier without throwing", () => {
    expect(quoteIdent("")).toBe('""');
  });
});

describe("slugifyMeasure", () => {
  it("lowercases and replaces non-word runs with single underscores", () => {
    expect(slugifyMeasure("Total Revenue")).toBe("total_revenue");
  });

  it("trims leading and trailing underscores", () => {
    expect(slugifyMeasure("  $$amount$$ ")).toBe("amount");
  });

  it("collapses consecutive separators into one underscore", () => {
    expect(slugifyMeasure("a---b   c")).toBe("a_b_c");
  });

  it("falls back to 'm' when the label has no word characters", () => {
    expect(slugifyMeasure("$$$")).toBe("m");
    expect(slugifyMeasure("")).toBe("m");
  });

  it("normalizes accented characters via NFKD, dropping combining marks", () => {
    // "é" decomposes to "e" + a combining accent; the accent is stripped as a
    // non-word run, leaving the base letter "e".
    expect(slugifyMeasure("café")).toBe("cafe");
  });
});

describe("generated column-name helpers", () => {
  it("derives the expected/actual/variance/variance%% column names from a label", () => {
    expect(expColName("rev")).toBe("exp_rev");
    expect(actColName("rev")).toBe("act_rev");
    expect(varColName("rev")).toBe("var_rev");
    expect(varPctColName("rev")).toBe("varpct_rev");
  });

  it("indexes coalesced key columns by position", () => {
    expect(keyColName(0)).toBe("key_0");
    expect(keyColName(2)).toBe("key_2");
  });
});

describe("buildDiffSQL", () => {
  it("throws when no key mappings are provided", () => {
    expect(() => buildDiffSQL(baseConfig({ keyCols: [] }))).toThrow(/at least one key mapping/i);
  });

  it("throws when no measure mappings are provided", () => {
    expect(() => buildDiffSQL(baseConfig({ measures: [] }))).toThrow(
      /at least one measure mapping/i,
    );
  });

  it("emits a FULL OUTER JOIN between the two registered views", () => {
    const sql = buildDiffSQL(baseConfig());
    expect(sql).toContain('FROM "expected_view" e');
    expect(sql).toContain('FULL OUTER JOIN "actual_view" a');
    expect(sql).toContain('e."channel" = a."channel"');
  });

  it("classifies ADDED / REMOVED / CHANGED / UNCHANGED in the diff_status case", () => {
    const sql = buildDiffSQL(baseConfig());
    expect(sql).toContain("THEN 'ADDED'");
    expect(sql).toContain("THEN 'REMOVED'");
    expect(sql).toContain("THEN 'CHANGED'");
    expect(sql).toContain("ELSE 'UNCHANGED'");
    expect(sql).toContain("AS diff_status");
  });

  it("emits per-measure expected/actual/variance/variance%% projections", () => {
    const sql = buildDiffSQL(baseConfig());
    expect(sql).toContain('AS "exp_revenue"');
    expect(sql).toContain('AS "act_revenue"');
    expect(sql).toContain('AS "var_revenue"');
    expect(sql).toContain('AS "varpct_revenue"');
  });

  it("guards variance%% against divide-by-zero and null expected values", () => {
    const sql = buildDiffSQL(baseConfig());
    // The variance% CASE must null out when the expected denominator is 0/NULL.
    expect(sql).toMatch(/CASE WHEN .* IS NULL OR .* = 0 THEN NULL/);
  });

  it("joins composite keys with AND and coalesces each into its own key column", () => {
    const sql = buildDiffSQL(
      baseConfig({
        keyCols: [
          { expected: "channel", actual: "chan" },
          { expected: "day", actual: "date" },
        ],
      }),
    );
    expect(sql).toContain('e."channel" = a."chan" AND e."day" = a."date"');
    expect(sql).toContain('AS "key_0"');
    expect(sql).toContain('AS "key_1"');
  });

  it("ORs the changed-detection across every mapped measure (NULL-safe)", () => {
    const sql = buildDiffSQL(
      baseConfig({
        measures: [
          { label: "rev", expected: "rev_e", actual: "rev_a" },
          { label: "qty", expected: "qty_e", actual: "qty_a" },
        ],
      }),
    );
    expect(sql).toContain("IS DISTINCT FROM");
    // two measures → an OR between the two distinct-from comparisons
    expect(sql.match(/IS DISTINCT FROM/g)?.length).toBe(2);
  });

  it("escapes a quote-containing column name into the join predicate", () => {
    const sql = buildDiffSQL(baseConfig({ keyCols: [{ expected: 'we"ird', actual: "ok" }] }));
    expect(sql).toContain('e."we""ird" = a."ok"');
  });
});

describe("buildSummarySQL", () => {
  it("wraps the diff in a CTE and aggregates status counts", () => {
    const sql = buildSummarySQL(baseConfig(), 5);
    expect(sql).toContain("WITH recon_diff AS (");
    expect(sql).toContain("AS rows_total");
    expect(sql).toContain("FILTER (WHERE diff_status = 'CHANGED')");
    expect(sql).toContain("FILTER (WHERE diff_status = 'ADDED')");
    expect(sql).toContain("FILTER (WHERE diff_status = 'REMOVED')");
    expect(sql).toContain("FILTER (WHERE diff_status = 'UNCHANGED')");
  });

  it("uses the primary measure's variance%% and the numeric tolerance for rows_material", () => {
    const sql = buildSummarySQL(baseConfig(), 7.5);
    expect(sql).toContain('ABS("varpct_revenue") > 7.5');
    expect(sql).toContain("AS rows_material");
  });

  it("coerces a non-numeric tolerance to a safe SQL number", () => {
    // Number(undefined) → NaN; the builder interpolates Number(tolerancePct).
    const sql = buildSummarySQL(baseConfig(), Number("not-a-number"));
    expect(sql).toContain("> NaN");
    // critically, no raw user string is interpolated
    expect(sql).not.toContain("not-a-number");
  });

  it("emits expected/actual/variance sums for each measure", () => {
    const sql = buildSummarySQL(
      baseConfig({
        measures: [
          { label: "rev", expected: "e", actual: "a" },
          { label: "qty", expected: "qe", actual: "qa" },
        ],
      }),
      5,
    );
    expect(sql).toContain('AS "sum_exp_rev"');
    expect(sql).toContain('AS "sum_act_rev"');
    expect(sql).toContain('AS "sum_var_rev"');
    expect(sql).toContain('AS "sum_exp_qty"');
  });
});

describe("buildPageSQL", () => {
  it("orders by status priority then by absolute primary variance", () => {
    const sql = buildPageSQL(baseConfig(), { limit: 50, offset: 0 });
    expect(sql).toContain("WHEN 'CHANGED' THEN 0");
    expect(sql).toContain("WHEN 'ADDED'   THEN 1");
    expect(sql).toContain("WHEN 'REMOVED' THEN 2");
    expect(sql).toContain('ABS(COALESCE("var_revenue", 0)) DESC');
  });

  it("omits the WHERE clause by default and adds it when onlyChanged is set", () => {
    const all = buildPageSQL(baseConfig(), { limit: 10, offset: 0 });
    expect(all).not.toContain("diff_status <> 'UNCHANGED'");

    const changed = buildPageSQL(baseConfig(), {
      limit: 10,
      offset: 0,
      onlyChanged: true,
    });
    expect(changed).toContain("WHERE diff_status <> 'UNCHANGED'");
  });

  it("floors and clamps limit/offset so negatives and fractions can't inject SQL", () => {
    const sql = buildPageSQL(baseConfig(), { limit: -5, offset: -10 });
    expect(sql).toContain("LIMIT 0 OFFSET 0");

    const sql2 = buildPageSQL(baseConfig(), { limit: 25.9, offset: 100.7 });
    expect(sql2).toContain("LIMIT 25 OFFSET 100");
  });
});

describe("buildMaterialRowsSQL", () => {
  it("filters out unchanged rows and orders by absolute primary variance", () => {
    const sql = buildMaterialRowsSQL(baseConfig(), 20);
    expect(sql).toContain("WHERE diff_status <> 'UNCHANGED'");
    expect(sql).toContain('ORDER BY ABS(COALESCE("var_revenue", 0)) DESC');
    expect(sql).toContain("LIMIT 20");
  });

  it("clamps a negative or fractional limit to a floored non-negative integer", () => {
    expect(buildMaterialRowsSQL(baseConfig(), -3)).toContain("LIMIT 0");
    expect(buildMaterialRowsSQL(baseConfig(), 9.9)).toContain("LIMIT 9");
  });
});

describe("toNum", () => {
  it("returns 0 for null and undefined", () => {
    expect(toNum(null)).toBe(0);
    expect(toNum(undefined)).toBe(0);
  });

  it("passes through finite numbers", () => {
    expect(toNum(42)).toBe(42);
    expect(toNum(-3.5)).toBe(-3.5);
  });

  it("converts a BigInt aggregate to a plain number", () => {
    expect(toNum(123n)).toBe(123);
  });

  it("unwraps the first element of a typed array (DuckDB aggregate shape)", () => {
    expect(toNum(new Float64Array([7.5]))).toBe(7.5);
    expect(toNum(new Int32Array([12]))).toBe(12);
  });

  it("returns 0 for non-finite results (NaN / Infinity)", () => {
    expect(toNum(Number.NaN)).toBe(0);
    expect(toNum(Number.POSITIVE_INFINITY)).toBe(0);
    expect(toNum("not-a-number")).toBe(0);
  });

  it("does not treat a DataView as an unwrappable typed array", () => {
    const view = new DataView(new ArrayBuffer(8));
    // DataView is explicitly excluded; Number(DataView) → NaN → 0.
    expect(toNum(view)).toBe(0);
  });
});

describe("toNullableNum", () => {
  it("preserves null for null/undefined input", () => {
    expect(toNullableNum(null)).toBeNull();
    expect(toNullableNum(undefined)).toBeNull();
  });

  it("returns the numeric value for finite input", () => {
    expect(toNullableNum(8.25)).toBe(8.25);
    expect(toNullableNum(0)).toBe(0);
  });

  it("collapses a non-finite scalar to 0 (toNum runs first, then the finite check passes)", () => {
    // toNum("nope") → 0 (finite) → toNullableNum returns 0, not null. Only
    // null/undefined preserve null; non-finite scalars are normalized to 0.
    expect(toNullableNum("nope")).toBe(0);
    expect(toNullableNum(Number.NaN)).toBe(0);
    expect(toNullableNum(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("unwraps a typed-array variance% cell", () => {
    expect(toNullableNum(new Float64Array([-12.5]))).toBe(-12.5);
  });
});
