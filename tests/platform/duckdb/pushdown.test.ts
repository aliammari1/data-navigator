import { describe, expect, it } from "vitest";
import {
  buildApproxCountDistinctSQL,
  buildApproxQuantileSQL,
  buildApproxTopKSQL,
  buildCorrelationCrosstabSQL,
  buildCountSQL,
  buildHistogramAggregateSQL,
  buildHistogramTableSQL,
  buildKeysetPageSQL,
  buildOffsetPageSQL,
  buildQuantileContSQL,
  buildReservoirSampleSQL,
  buildShapeSQL,
  buildSummarizeSQL,
  countCacheKey,
  quoteIdent,
  quoteLiteral,
  type KeysetPageInput,
} from "@/platform/duckdb/pushdown";

/**
 * Behavioral suite for the pure DuckDB SQL pushdown builders. Every builder is
 * side-effect-free string construction (no DuckDB import), so these assert the
 * exact emitted SQL shape, identifier/literal quoting, numeric clamping, and the
 * positional-parameter contract for keyset pagination. No mocking is needed.
 *
 * `.trim()` is applied by all builders, so we normalize internal whitespace when
 * asserting on overall structure and assert exact substrings for the parts that
 * carry meaning (quoting, clamping, parameter ordering).
 */

/** Collapse runs of whitespace to a single space so multi-line SQL can be matched structurally. */
function normalize(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

// ─── quoteIdent ───────────────────────────────────────────────────────────────

describe("quoteIdent", () => {
  it("wraps a plain identifier in double quotes", () => {
    expect(quoteIdent("col")).toBe('"col"');
  });

  it("doubles embedded double-quotes to escape them", () => {
    expect(quoteIdent('we"ird')).toBe('"we""ird"');
  });

  it("doubles every embedded double-quote, not just the first", () => {
    expect(quoteIdent('a"b"c')).toBe('"a""b""c"');
  });

  it("quotes an empty identifier as a bare quoted-empty token", () => {
    expect(quoteIdent("")).toBe('""');
  });

  it("preserves single-quotes verbatim (only double-quotes are special here)", () => {
    expect(quoteIdent("o'clock")).toBe(`"o'clock"`);
  });

  it("preserves spaces and SQL-keyword-like names", () => {
    expect(quoteIdent("order by")).toBe('"order by"');
  });
});

// ─── quoteLiteral ─────────────────────────────────────────────────────────────

describe("quoteLiteral", () => {
  it("wraps a plain string in single quotes", () => {
    expect(quoteLiteral("hello")).toBe("'hello'");
  });

  it("doubles embedded single-quotes to escape them", () => {
    expect(quoteLiteral("o'clock")).toBe("'o''clock'");
  });

  it("doubles every embedded single-quote", () => {
    expect(quoteLiteral("a'b'c")).toBe("'a''b''c'");
  });

  it("quotes the empty string", () => {
    expect(quoteLiteral("")).toBe("''");
  });

  it("preserves double-quotes verbatim (only single-quotes are special here)", () => {
    expect(quoteLiteral('say "hi"')).toBe(`'say "hi"'`);
  });
});

// ─── buildSummarizeSQL ────────────────────────────────────────────────────────

describe("buildSummarizeSQL", () => {
  it("wraps a string source as a quoted identifier and selects the profile columns", () => {
    const sql = normalize(buildSummarizeSQL("ds_abc"));
    expect(sql).toContain("FROM (SUMMARIZE SELECT * FROM \"ds_abc\")");
    expect(sql.startsWith("SELECT")).toBe(true);
  });

  it("projects exactly the documented profile columns in order", () => {
    const sql = normalize(buildSummarizeSQL("v"));
    expect(sql).toContain(
      "SELECT column_name, column_type, min, max, approx_unique, avg, std, q25, q50, q75, count, null_percentage",
    );
  });

  it("accepts an SqlSource object and quotes its view", () => {
    const sql = normalize(buildSummarizeSQL({ view: "ds_1" }));
    expect(sql).toContain('SELECT * FROM "ds_1"');
  });

  it("injects a WHERE filter into the summarized input relation when provided", () => {
    const sql = normalize(buildSummarizeSQL("v", "amount > 0"));
    expect(sql).toContain('SELECT * FROM "v" WHERE amount > 0');
  });

  it("omits WHERE when the filter is whitespace-only (treated as absent)", () => {
    const sql = normalize(buildSummarizeSQL("v", "   "));
    expect(sql).not.toContain("WHERE");
    expect(sql).toContain('SUMMARIZE SELECT * FROM "v"');
  });

  it("omits WHERE when no filter is passed", () => {
    expect(buildSummarizeSQL("v")).not.toContain("WHERE");
  });

  it("quotes a view name containing a double-quote", () => {
    const sql = buildSummarizeSQL('we"ird');
    expect(sql).toContain('FROM "we""ird"');
  });
});

// ─── buildApproxTopKSQL ───────────────────────────────────────────────────────

describe("buildApproxTopKSQL", () => {
  it("uses the default k of 10 when omitted", () => {
    const sql = normalize(buildApproxTopKSQL("v", "city"));
    expect(sql).toBe('SELECT approx_top_k("city", 10) AS top_values FROM "v"');
  });

  it("quotes the column identifier", () => {
    expect(buildApproxTopKSQL("v", 'we"ird')).toContain('approx_top_k("we""ird", 10)');
  });

  it("passes a positive integer k through unchanged", () => {
    expect(buildApproxTopKSQL("v", "c", 25)).toContain('approx_top_k("c", 25)');
  });

  it("truncates a fractional k toward zero", () => {
    expect(buildApproxTopKSQL("v", "c", 7.9)).toContain('approx_top_k("c", 7)');
  });

  it("clamps k of zero up to the minimum of 1", () => {
    expect(buildApproxTopKSQL("v", "c", 0)).toContain('approx_top_k("c", 1)');
  });

  it("clamps a negative k up to 1", () => {
    expect(buildApproxTopKSQL("v", "c", -5)).toContain('approx_top_k("c", 1)');
  });

  it("clamps a fractional value below 1 up to 1", () => {
    expect(buildApproxTopKSQL("v", "c", 0.4)).toContain('approx_top_k("c", 1)');
  });
});

// ─── buildApproxCountDistinctSQL ──────────────────────────────────────────────

describe("buildApproxCountDistinctSQL", () => {
  it("builds an approx_count_distinct projection over the quoted column", () => {
    const sql = normalize(buildApproxCountDistinctSQL("v", "msisdn"));
    expect(sql).toBe('SELECT approx_count_distinct("msisdn") AS distinct_approx FROM "v"');
  });

  it("quotes both column and source view", () => {
    const sql = buildApproxCountDistinctSQL({ view: "ds 1" }, "a'b");
    expect(sql).toContain('approx_count_distinct("a\'b")');
    expect(sql).toContain('FROM "ds 1"');
  });
});

// ─── buildHistogramTableSQL ───────────────────────────────────────────────────

describe("buildHistogramTableSQL", () => {
  it("emits the table-macro form with default bins and auto technique", () => {
    const sql = normalize(buildHistogramTableSQL("v", "amount"));
    expect(sql).toBe(
      "FROM histogram(\"v\", \"amount\", bin_count := 20, technique := 'auto')",
    );
  });

  it("quotes the technique as a string literal", () => {
    const sql = buildHistogramTableSQL("v", "amount", 5, "equi-width");
    expect(sql).toContain("technique := 'equi-width'");
    expect(sql).toContain("bin_count := 5");
  });

  it("truncates a fractional bin count", () => {
    expect(buildHistogramTableSQL("v", "c", 12.7)).toContain("bin_count := 12");
  });

  it("clamps a zero bin count up to 1", () => {
    expect(buildHistogramTableSQL("v", "c", 0)).toContain("bin_count := 1");
  });

  it("clamps a negative bin count up to 1", () => {
    expect(buildHistogramTableSQL("v", "c", -3)).toContain("bin_count := 1");
  });

  it("reads the view from an SqlSource object", () => {
    expect(buildHistogramTableSQL({ view: "ds_x" }, "c", 4, "sample")).toContain(
      'histogram("ds_x", "c"',
    );
  });

  it("escapes a single-quote inside a technique value via literal quoting", () => {
    // technique is typed as a union, but quoteLiteral must still escape if abused.
    const sql = buildHistogramTableSQL("v", "c", 3, "a'b" as never);
    expect(sql).toContain("technique := 'a''b'");
  });
});

// ─── buildHistogramAggregateSQL ───────────────────────────────────────────────

describe("buildHistogramAggregateSQL", () => {
  it("builds the bare aggregate form with no boundaries", () => {
    const sql = normalize(buildHistogramAggregateSQL("v", "amount"));
    expect(sql).toBe('SELECT histogram("amount") AS buckets FROM "v"');
  });

  it("embeds an explicit boundaries list when provided", () => {
    const sql = normalize(buildHistogramAggregateSQL("v", "amount", [0, 10, 100]));
    expect(sql).toContain('histogram("amount", [0, 10, 100])');
  });

  it("treats an empty boundaries array as no boundaries", () => {
    const sql = buildHistogramAggregateSQL("v", "amount", []);
    expect(sql).toContain('histogram("amount") AS buckets');
    expect(sql).not.toContain("[");
  });

  it("stringifies negative and fractional boundaries", () => {
    const sql = buildHistogramAggregateSQL("v", "c", [-1.5, 0, 2.25]);
    expect(sql).toContain("[-1.5, 0, 2.25]");
  });
});

// ─── buildApproxQuantileSQL ───────────────────────────────────────────────────

describe("buildApproxQuantileSQL", () => {
  it("defaults to the median (0.5) when q is omitted", () => {
    const sql = normalize(buildApproxQuantileSQL("v", "amount"));
    expect(sql).toBe('SELECT approx_quantile("amount", 0.5) AS approx_quantile FROM "v"');
  });

  it("passes a single scalar fraction through as a bare number", () => {
    expect(buildApproxQuantileSQL("v", "c", 0.9)).toContain('approx_quantile("c", 0.9)');
  });

  it("renders a list of quantiles as a SQL array literal", () => {
    const sql = buildApproxQuantileSQL("v", "c", [0.25, 0.5, 0.75]);
    expect(sql).toContain('approx_quantile("c", [0.25, 0.5, 0.75])');
  });

  it("handles an empty quantile array as an empty array literal", () => {
    expect(buildApproxQuantileSQL("v", "c", [])).toContain('approx_quantile("c", [])');
  });
});

// ─── buildQuantileContSQL ─────────────────────────────────────────────────────

describe("buildQuantileContSQL", () => {
  it("defaults to the exact median", () => {
    const sql = normalize(buildQuantileContSQL("v", "amount"));
    expect(sql).toBe('SELECT quantile_cont("amount", 0.5) AS quantile FROM "v"');
  });

  it("renders an array of fractions", () => {
    expect(buildQuantileContSQL("v", "c", [0.1, 0.9])).toContain('quantile_cont("c", [0.1, 0.9])');
  });

  it("uses quantile_cont (exact), not approx_quantile", () => {
    expect(buildQuantileContSQL("v", "c", 0.5)).not.toContain("approx_quantile");
  });
});

// ─── buildShapeSQL ────────────────────────────────────────────────────────────

describe("buildShapeSQL", () => {
  it("selects skewness and kurtosis over the same quoted column", () => {
    const sql = normalize(buildShapeSQL("v", "amount"));
    expect(sql).toBe(
      'SELECT skewness("amount") AS skewness, kurtosis("amount") AS kurtosis FROM "v"',
    );
  });

  it("quotes a column with special characters once per usage", () => {
    const sql = buildShapeSQL("v", 'a"b');
    expect(sql).toContain('skewness("a""b")');
    expect(sql).toContain('kurtosis("a""b")');
  });
});

// ─── buildCorrelationCrosstabSQL ──────────────────────────────────────────────

describe("buildCorrelationCrosstabSQL", () => {
  it("emits a no-op SELECT and empty pairs for zero columns", () => {
    const { sql, pairs } = buildCorrelationCrosstabSQL("v", []);
    expect(pairs).toEqual([]);
    expect(normalize(sql)).toBe('SELECT 1 AS noop FROM "v"');
  });

  it("emits a no-op SELECT and empty pairs for a single column (no pairs possible)", () => {
    const { sql, pairs } = buildCorrelationCrosstabSQL("v", ["a"]);
    expect(pairs).toEqual([]);
    expect(normalize(sql)).toContain("1 AS noop");
  });

  it("builds one corr() expression for a single pair", () => {
    const { sql, pairs } = buildCorrelationCrosstabSQL("v", ["a", "b"]);
    expect(pairs).toEqual([{ alias: "r__0__1", a: "a", b: "b" }]);
    expect(normalize(sql)).toContain('corr("a", "b") AS "r__0__1"');
  });

  it("builds the full upper triangle for three columns (3 pairs, i<j only)", () => {
    const { sql, pairs } = buildCorrelationCrosstabSQL("v", ["a", "b", "c"]);
    expect(pairs).toEqual([
      { alias: "r__0__1", a: "a", b: "b" },
      { alias: "r__0__2", a: "a", b: "c" },
      { alias: "r__1__2", a: "b", b: "c" },
    ]);
    const n = normalize(sql);
    expect(n).toContain('corr("a", "b") AS "r__0__1"');
    expect(n).toContain('corr("a", "c") AS "r__0__2"');
    expect(n).toContain('corr("b", "c") AS "r__1__2"');
    // No diagonal/self pair.
    expect(n).not.toContain('corr("a", "a")');
  });

  it("uses index-based aliases so duplicate column names stay distinct", () => {
    const { pairs } = buildCorrelationCrosstabSQL("v", ["x", "x"]);
    expect(pairs).toEqual([{ alias: "r__0__1", a: "x", b: "x" }]);
  });

  it("quotes column identifiers inside corr() arguments", () => {
    const { sql } = buildCorrelationCrosstabSQL("v", ['a"1', "b"]);
    expect(sql).toContain('corr("a""1", "b")');
  });
});

// ─── buildReservoirSampleSQL ──────────────────────────────────────────────────

describe("buildReservoirSampleSQL", () => {
  it("selects all columns with reservoir sampling at the requested size", () => {
    const sql = normalize(buildReservoirSampleSQL("v", 1000));
    expect(sql).toBe('SELECT * FROM "v" USING SAMPLE reservoir(1000 ROWS)');
  });

  it("clamps n of zero up to 1", () => {
    expect(buildReservoirSampleSQL("v", 0)).toContain("reservoir(1 ROWS)");
  });

  it("clamps a negative n up to 1", () => {
    expect(buildReservoirSampleSQL("v", -10)).toContain("reservoir(1 ROWS)");
  });

  it("truncates a fractional n", () => {
    expect(buildReservoirSampleSQL("v", 99.9)).toContain("reservoir(99 ROWS)");
  });

  it("projects only the requested columns, quoted", () => {
    const sql = normalize(buildReservoirSampleSQL("v", 50, { columns: ["a", "b"] }));
    expect(sql).toContain('SELECT "a", "b" FROM "v"');
  });

  it("falls back to * when columns is an empty array", () => {
    const sql = normalize(buildReservoirSampleSQL("v", 50, { columns: [] }));
    expect(sql).toContain("SELECT * FROM");
  });

  it("injects a WHERE clause before the SAMPLE clause", () => {
    const sql = normalize(buildReservoirSampleSQL("v", 50, { where: "amount > 0" }));
    expect(sql).toBe(
      'SELECT * FROM "v" WHERE amount > 0 USING SAMPLE reservoir(50 ROWS)',
    );
  });

  it("ignores a whitespace-only where", () => {
    const sql = buildReservoirSampleSQL("v", 50, { where: "   " });
    expect(sql).not.toContain("WHERE");
  });

  it("appends a REPEATABLE clause with a truncated seed for determinism", () => {
    const sql = normalize(buildReservoirSampleSQL("v", 50, { seed: 42 }));
    expect(sql).toContain("USING SAMPLE reservoir(50 ROWS) REPEATABLE (42)");
  });

  it("treats seed 0 as a valid deterministic seed (not falsy-skipped)", () => {
    const sql = buildReservoirSampleSQL("v", 50, { seed: 0 });
    expect(sql).toContain("REPEATABLE (0)");
  });

  it("truncates a fractional seed", () => {
    expect(buildReservoirSampleSQL("v", 50, { seed: 7.8 })).toContain("REPEATABLE (7)");
  });

  it("omits REPEATABLE when no seed is given", () => {
    expect(buildReservoirSampleSQL("v", 50)).not.toContain("REPEATABLE");
  });

  it("composes columns, where, and seed together in order", () => {
    const sql = normalize(
      buildReservoirSampleSQL("v", 25, { columns: ["a"], where: "a IS NOT NULL", seed: 1 }),
    );
    expect(sql).toBe(
      'SELECT "a" FROM "v" WHERE a IS NOT NULL USING SAMPLE reservoir(25 ROWS) REPEATABLE (1)',
    );
  });
});

// ─── buildCountSQL ────────────────────────────────────────────────────────────

describe("buildCountSQL", () => {
  it("counts all rows of a view with no filter", () => {
    expect(buildCountSQL("v")).toBe('SELECT count(*) AS total FROM "v"');
  });

  it("appends a WHERE clause when a filter is provided", () => {
    expect(buildCountSQL("v", "amount > 0")).toBe(
      'SELECT count(*) AS total FROM "v" WHERE amount > 0',
    );
  });

  it("ignores a whitespace-only filter", () => {
    expect(buildCountSQL("v", "  ")).toBe('SELECT count(*) AS total FROM "v"');
  });

  it("reads the view from an SqlSource object and quotes it", () => {
    expect(buildCountSQL({ view: "ds 1" })).toBe('SELECT count(*) AS total FROM "ds 1"');
  });
});

// ─── countCacheKey ────────────────────────────────────────────────────────────

describe("countCacheKey", () => {
  it("joins view and where with the :: separator", () => {
    expect(countCacheKey("v", "amount > 0")).toBe("v::amount > 0");
  });

  it("uses an empty where segment when where is omitted", () => {
    expect(countCacheKey("v")).toBe("v::");
  });

  it("trims surrounding whitespace from the where so equivalent filters collide", () => {
    expect(countCacheKey("v", "  amount > 0  ")).toBe("v::amount > 0");
  });

  it("normalizes undefined and empty-string where to the same key", () => {
    expect(countCacheKey("v", "")).toBe(countCacheKey("v", undefined));
  });

  it("normalizes a whitespace-only where to the empty-where key", () => {
    expect(countCacheKey("v", "   ")).toBe("v::");
  });
});

// ─── buildKeysetPageSQL ───────────────────────────────────────────────────────

describe("buildKeysetPageSQL", () => {
  it("builds a first page (no cursor) with rowid appended to projection and order", () => {
    const { sql, params } = buildKeysetPageSQL({
      source: "v",
      sortKeys: [{ column: "ts" }],
      limit: 100,
    });
    const n = normalize(sql);
    expect(n).toContain("SELECT *, rowid");
    expect(n).toContain('ORDER BY "ts" ASC, rowid ASC');
    expect(n).toContain("LIMIT 100");
    expect(n).not.toContain("WHERE");
    expect(params).toEqual([]);
  });

  it("projects requested columns plus rowid", () => {
    const { sql } = buildKeysetPageSQL({
      source: "v",
      sortKeys: [{ column: "ts" }],
      limit: 10,
      columns: ["a", "b"],
    });
    expect(normalize(sql)).toContain('SELECT "a", "b", rowid');
  });

  it("falls back to *, rowid when columns is empty", () => {
    const { sql } = buildKeysetPageSQL({
      source: "v",
      sortKeys: [{ column: "ts" }],
      limit: 10,
      columns: [],
    });
    expect(normalize(sql)).toContain("SELECT *, rowid");
  });

  it("includes a first-page WHERE when a pre-filter is supplied", () => {
    const { sql } = buildKeysetPageSQL({
      source: "v",
      sortKeys: [{ column: "ts" }],
      limit: 10,
      where: "amount > 0",
    });
    expect(normalize(sql)).toContain("WHERE (amount > 0)");
  });

  it("clamps a limit of zero up to 1", () => {
    const { sql } = buildKeysetPageSQL({ source: "v", sortKeys: [{ column: "ts" }], limit: 0 });
    expect(normalize(sql)).toContain("LIMIT 1");
  });

  it("truncates a fractional limit", () => {
    const { sql } = buildKeysetPageSQL({ source: "v", sortKeys: [{ column: "ts" }], limit: 50.9 });
    expect(normalize(sql)).toContain("LIMIT 50");
  });

  it("honors an explicit DESC direction in ORDER BY and the seek comparator", () => {
    const { sql, params } = buildKeysetPageSQL({
      source: "v",
      sortKeys: [{ column: "ts", direction: "DESC" }],
      limit: 10,
      cursor: { sortValues: [1000], rowid: 5 },
    });
    const n = normalize(sql);
    // DESC key: ORDER BY uses DESC, but the rowid tiebreaker is always ASC.
    expect(n).toContain('ORDER BY "ts" DESC, rowid ASC');
    // Strict comparator for a DESC key is "<".
    expect(n).toContain('"ts" < $1');
    expect(params).toEqual([1000, 1000, 5]);
  });

  it("builds the single-key ASC seek predicate exactly as documented", () => {
    const { sql, params } = buildKeysetPageSQL({
      source: "v",
      sortKeys: [{ column: "ts" }],
      limit: 100,
      cursor: { sortValues: [42], rowid: 7 },
    });
    const n = normalize(sql);
    // (ts > $1) OR (ts = $2 AND rowid > $3)
    expect(n).toContain('WHERE (("ts" > $1) OR ("ts" = $2 AND rowid > $3))');
    // First clause pushes sortValues[0]; tie clause pushes sortValues[0] again then rowid.
    expect(params).toEqual([42, 42, 7]);
  });

  it("builds a lexicographic OR-of-AND seek across two mixed-direction keys", () => {
    const input: KeysetPageInput = {
      source: "v",
      sortKeys: [
        { column: "k1", direction: "ASC" },
        { column: "k2", direction: "DESC" },
      ],
      limit: 20,
      cursor: { sortValues: ["a", 9], rowid: 3 },
    };
    const { sql, params } = buildKeysetPageSQL(input);
    const n = normalize(sql);

    // Clause 0: k1 strictly past cursor (ASC -> ">").
    expect(n).toContain('("k1" > $1)');
    // Clause 1: k1 equal AND k2 strictly past cursor (DESC -> "<").
    expect(n).toContain('("k1" = $2 AND "k2" < $3)');
    // Tie clause: both equal AND rowid >.
    expect(n).toContain('("k1" = $4 AND "k2" = $5 AND rowid > $6)');

    expect(n).toContain('ORDER BY "k1" ASC, "k2" DESC, rowid ASC');

    // Parameter ordering is the contract callers depend on:
    // clause0: sv[0]
    // clause1: sv[0], sv[1]
    // tie:     sv[0], sv[1], rowid
    expect(params).toEqual(["a", "a", 9, "a", 9, 3]);
  });

  it("combines a pre-filter and the seek predicate with AND", () => {
    const { sql, params } = buildKeysetPageSQL({
      source: "v",
      sortKeys: [{ column: "ts" }],
      limit: 10,
      where: "active = true",
      cursor: { sortValues: [1], rowid: 2 },
    });
    const n = normalize(sql);
    expect(n).toContain("WHERE (active = true) AND ((");
    // Pre-filter is not parameterized; only the cursor values are.
    expect(params).toEqual([1, 1, 2]);
  });

  it("quotes sort-key columns with special characters in both ORDER BY and the predicate", () => {
    const { sql } = buildKeysetPageSQL({
      source: "v",
      sortKeys: [{ column: 'a"b' }],
      limit: 10,
      cursor: { sortValues: [1], rowid: 2 },
    });
    expect(sql).toContain('"a""b" > $1');
    expect(sql).toContain('"a""b" ASC');
  });

  it("preserves null/undefined cursor sort values as positional params (never interpolated)", () => {
    const { sql, params } = buildKeysetPageSQL({
      source: "v",
      sortKeys: [{ column: "ts" }],
      limit: 10,
      cursor: { sortValues: [null], rowid: 0 },
    });
    // The value goes into params, the SQL only references $n.
    expect(sql).not.toContain("null");
    expect(params).toEqual([null, null, 0]);
  });
});

// ─── buildOffsetPageSQL ───────────────────────────────────────────────────────

describe("buildOffsetPageSQL", () => {
  it("builds a basic LIMIT/OFFSET page selecting all columns", () => {
    const sql = normalize(buildOffsetPageSQL("v", 100, 200));
    expect(sql).toBe('SELECT * FROM "v" LIMIT 100 OFFSET 200');
  });

  it("projects requested columns when provided", () => {
    const sql = normalize(buildOffsetPageSQL("v", 10, 0, { columns: ["a", "b"] }));
    expect(sql).toContain('SELECT "a", "b" FROM "v"');
  });

  it("falls back to * for an empty columns array", () => {
    const sql = normalize(buildOffsetPageSQL("v", 10, 0, { columns: [] }));
    expect(sql).toContain("SELECT * FROM");
  });

  it("adds WHERE and ORDER BY clauses when supplied", () => {
    const sql = normalize(
      buildOffsetPageSQL("v", 10, 0, { where: "a > 0", orderBy: "a ASC" }),
    );
    expect(sql).toBe('SELECT * FROM "v" WHERE a > 0 ORDER BY a ASC LIMIT 10 OFFSET 0');
  });

  it("ignores whitespace-only where and orderBy", () => {
    const sql = normalize(buildOffsetPageSQL("v", 10, 0, { where: "  ", orderBy: "  " }));
    expect(sql).not.toContain("WHERE");
    expect(sql).not.toContain("ORDER BY");
  });

  it("permits a zero limit (unlike the other builders which clamp up to 1)", () => {
    expect(normalize(buildOffsetPageSQL("v", 0, 0))).toContain("LIMIT 0");
  });

  it("clamps a negative limit up to 0", () => {
    expect(normalize(buildOffsetPageSQL("v", -5, 10))).toContain("LIMIT 0");
  });

  it("clamps a negative offset up to 0", () => {
    expect(normalize(buildOffsetPageSQL("v", 10, -7))).toContain("OFFSET 0");
  });

  it("truncates fractional limit and offset toward zero", () => {
    const sql = normalize(buildOffsetPageSQL("v", 9.9, 5.7));
    expect(sql).toContain("LIMIT 9");
    expect(sql).toContain("OFFSET 5");
  });
});
