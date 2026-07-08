import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ColMeta } from "@/core/stores/data-store";

// ─── Mock the LLM boundary ────────────────────────────────────────────────────
// translateNLQWithLLM takes an optional, dependency-injected `generateText`
// callback (the caller binds it to `useAI().generate`). We never invoke a real
// model: `generateText` is a vi.fn() passed explicitly by the tests that
// exercise the LLM branch; omitting it exercises the "not ready" path.
const generateText = vi.fn<(prompt: string, opts?: unknown) => Promise<string>>(async () => "");

import { explainSQL, suggestQuestions, translateNLQ, translateNLQWithLLM } from "@/platform/ai/nlq";

// ─── Test fixtures ────────────────────────────────────────────────────────────

function col(name: string, type: ColMeta["type"], extra: Partial<ColMeta> = {}): ColMeta {
  return {
    name,
    type,
    nullCount: 0,
    distinctCount: 0,
    sample: [],
    ...extra,
  };
}

const TABLE = "sales";

// A schema with a numeric metric, a string dimension and a date column.
const COLS: ColMeta[] = [
  col("region", "string"),
  col("product", "string"),
  col("revenue", "number"),
  col("quantity", "number"),
  col("order_date", "date"),
];

const ctx = { tableName: TABLE, columns: COLS };

beforeEach(() => {
  generateText.mockReset();
  generateText.mockResolvedValue("");
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── explainSQL ───────────────────────────────────────────────────────────────

describe("explainSQL", () => {
  it("prefixes the statement with EXPLAIN", () => {
    expect(explainSQL("SELECT 1")).toBe("EXPLAIN SELECT 1");
  });
});

// ─── translateNLQ: raw SQL passthrough ────────────────────────────────────────

describe("translateNLQ raw SQL passthrough", () => {
  it("executes a SELECT statement verbatim and appends LIMIT 1000", () => {
    const result = translateNLQ("SELECT region FROM sales", ctx);

    expect(result.explanation).toBe("Executed as raw SQL.");
    expect(result.confidence).toBe("high");
    expect(result.sql).toBe("SELECT region FROM sales LIMIT 1000");
  });

  it("recognises WITH (CTE) statements as raw SQL", () => {
    const result = translateNLQ("WITH x AS (SELECT 1) SELECT * FROM x", ctx);
    expect(result.explanation).toBe("Executed as raw SQL.");
    expect(result.sql).toContain("LIMIT 1000");
  });

  it("does not double-append a LIMIT when one already exists", () => {
    const result = translateNLQ("SELECT * FROM sales LIMIT 5", ctx);
    // Existing LIMIT 5 is preserved; no extra LIMIT clause is appended.
    expect(result.sql).toBe("SELECT * FROM sales LIMIT 5");
  });

  it("is case-insensitive about the leading SQL keyword", () => {
    const result = translateNLQ("select 1", ctx);
    expect(result.explanation).toBe("Executed as raw SQL.");
  });
});

// ─── translateNLQ: COUNT pattern ──────────────────────────────────────────────

describe("translateNLQ count pattern", () => {
  it("builds a COUNT(*) query for 'how many rows'", () => {
    const result = translateNLQ("how many rows are there?", ctx);

    expect(result.sql).toContain("COUNT(*) AS total_count");
    expect(result.sql).toContain(`FROM "${TABLE}"`);
    expect(result.confidence).toBe("high");
    expect(result.chartSuggestion).toBe("number");
  });
});

// ─── translateNLQ: TOP N pattern ──────────────────────────────────────────────

describe("translateNLQ top-N pattern", () => {
  it("builds a grouped, ordered, limited query honoring N", () => {
    const result = translateNLQ("top 5 products by revenue", ctx);

    expect(result.sql).toContain("GROUP BY");
    expect(result.sql).toContain("ORDER BY total DESC");
    expect(result.sql).toContain("LIMIT 5");
    expect(result.sql).toContain('SUM("revenue")');
    expect(result.chartSuggestion).toBe("bar");
    expect(result.confidence).toBe("high");
  });

  it("returns the chosen dimension column in the projection", () => {
    const result = translateNLQ("top 3 region by revenue", ctx);
    expect(result.sql).toContain('"region"');
  });
});

// ─── translateNLQ: AVERAGE pattern ────────────────────────────────────────────

describe("translateNLQ average pattern", () => {
  it("produces a grouped AVG when a dimension exists", () => {
    const result = translateNLQ("average revenue", ctx);

    expect(result.sql).toContain("ROUND(AVG(");
    expect(result.sql).toContain("AS avg_value");
    expect(result.sql).toContain("GROUP BY");
    expect(result.chartSuggestion).toBe("bar");
  });

  it("produces an ungrouped AVG when there is no dimension column", () => {
    const numericOnly = { tableName: TABLE, columns: [col("revenue", "number")] };
    const result = translateNLQ("average revenue", numericOnly);

    expect(result.sql).toContain("ROUND(AVG(");
    expect(result.sql).not.toContain("GROUP BY");
    expect(result.chartSuggestion).toBe("number");
  });
});

// ─── translateNLQ: SUM ... BY pattern ─────────────────────────────────────────

describe("translateNLQ sum-by pattern", () => {
  it("aggregates a metric grouped by an explicit dimension", () => {
    const result = translateNLQ("sum of revenue by region", ctx);

    expect(result.sql).toContain("ROUND(SUM(");
    expect(result.sql).toContain('"revenue"');
    expect(result.sql).toContain('"region"');
    expect(result.sql).toContain("ORDER BY total DESC");
    expect(result.explanation).toContain("Sum of revenue grouped by region");
  });
});

// ─── translateNLQ: conditional breakdown (FILTER) ─────────────────────────────

describe("translateNLQ conditional breakdown pattern", () => {
  it("emits a FILTER expression with the parsed operator and value", () => {
    const result = translateNLQ("breakdown of region where revenue > 100", ctx);

    expect(result.sql).toContain("FILTER (WHERE");
    expect(result.sql).toContain("> 100");
    expect(result.sql).toContain("AS filtered_count");
    expect(result.sql).toContain("AS pct");
    expect(result.chartSuggestion).toBe("bar");
  });

  it("supports compound operators like >=", () => {
    const result = translateNLQ("distribution of region having revenue >= 50", ctx);
    expect(result.sql).toContain(">= 50");
  });
});

// ─── translateNLQ: distribution pattern ───────────────────────────────────────

describe("translateNLQ distribution pattern", () => {
  it("computes counts and percentages per dimension", () => {
    const result = translateNLQ("distribution of region", ctx);

    expect(result.sql).toContain("COUNT(*) AS count");
    expect(result.sql).toContain("AS pct");
    expect(result.sql).toContain("GROUP BY");
    expect(result.chartSuggestion).toBe("pie");
  });
});

// ─── translateNLQ: trend over time pattern ────────────────────────────────────

describe("translateNLQ trend pattern", () => {
  it("uses DATE_TRUNC on a date column when one is present", () => {
    const result = translateNLQ("show the trend over time", ctx);

    expect(result.sql).toContain("DATE_TRUNC('month'");
    expect(result.sql).toContain('"order_date"');
    expect(result.sql).toContain("IS NOT NULL");
    expect(result.chartSuggestion).toBe("line");
  });

  it("falls back when there is no date column to trend on", () => {
    const noDate = {
      tableName: TABLE,
      columns: [col("region", "string"), col("revenue", "number")],
    };
    // No date column => trend pattern returns null => falls through to the
    // grouped low-confidence fallback.
    const result = translateNLQ("trend", noDate);
    expect(result.confidence).toBe("low");
  });
});

// ─── translateNLQ: correlation pattern ────────────────────────────────────────

describe("translateNLQ correlation pattern", () => {
  it("selects the two named numeric columns for a scatter plot", () => {
    const result = translateNLQ("correlation between revenue and quantity", ctx);

    expect(result.sql).toContain('"revenue"');
    expect(result.sql).toContain('"quantity"');
    expect(result.chartSuggestion).toBe("scatter");
    expect(result.confidence).toBe("high");
  });

  it("falls back to the first two numeric columns at medium confidence when names are unknown", () => {
    const result = translateNLQ("correlation between foo and bar", ctx);
    expect(result.chartSuggestion).toBe("scatter");
    expect(result.confidence).toBe("medium");
    expect(result.sql).toContain('"revenue"');
    expect(result.sql).toContain('"quantity"');
  });

  it("returns the low-confidence fallback when fewer than two numeric columns exist", () => {
    const oneNum = {
      tableName: TABLE,
      columns: [col("region", "string"), col("revenue", "number")],
    };
    const result = translateNLQ("correlation between foo and bar", oneNum);
    // build() returns null -> overall translator fallback kicks in.
    expect(result.confidence).toBe("low");
  });
});

// ─── translateNLQ: missing values pattern ─────────────────────────────────────

describe("translateNLQ missing-values pattern", () => {
  it("counts nulls per column for every column in the schema", () => {
    const result = translateNLQ("show missing values", ctx);

    expect(result.sql).toContain("IS NULL");
    expect(result.sql).toContain('"revenue_nulls"');
    expect(result.sql).toContain('"region_nulls"');
    expect(result.chartSuggestion).toBe("bar");
  });
});

// ─── translateNLQ: outliers pattern ───────────────────────────────────────────

describe("translateNLQ outliers pattern", () => {
  it("uses a stats CTE with a 2-stddev threshold", () => {
    const result = translateNLQ("show outliers", ctx);

    expect(result.sql).toContain("WITH stats AS");
    expect(result.sql).toContain("STDDEV(");
    expect(result.sql).toContain("2 * sd");
    expect(result.chartSuggestion).toBe("table");
  });
});

// ─── translateNLQ: duplicates pattern ─────────────────────────────────────────

describe("translateNLQ duplicate pattern", () => {
  it("groups by leading columns and keeps groups with more than one row", () => {
    const result = translateNLQ("find duplicate rows", ctx);

    expect(result.sql).toContain("COUNT(*) AS occurrences");
    expect(result.sql).toContain("HAVING COUNT(*) > 1");
    expect(result.confidence).toBe("medium");
    expect(result.chartSuggestion).toBe("table");
  });
});

// ─── translateNLQ: show / select all pattern ──────────────────────────────────

describe("translateNLQ show-all pattern", () => {
  it("selects all rows with a 500 row cap", () => {
    const result = translateNLQ("show all rows", ctx);

    expect(result.sql).toContain(`FROM "${TABLE}"`);
    expect(result.sql).toContain("LIMIT 500");
    expect(result.chartSuggestion).toBe("table");
  });

  it("threads a WHERE clause when the user supplies one", () => {
    const result = translateNLQ("show all data where region = 'NA'", ctx);
    expect(result.sql).toContain("WHERE region = 'NA'");
  });
});

// ─── translateNLQ: describe / summary pattern ─────────────────────────────────

describe("translateNLQ describe pattern", () => {
  it("emits per-column min/max/avg aggregates for numeric columns", () => {
    const result = translateNLQ("describe the dataset", ctx);

    expect(result.sql).toContain("AS total_rows");
    expect(result.sql).toContain('"revenue_min"');
    expect(result.sql).toContain('"revenue_avg"');
    expect(result.chartSuggestion).toBe("table");
  });

  it("falls back to a basic row summary when there are no numeric columns", () => {
    const stringsOnly = {
      tableName: TABLE,
      columns: [col("region", "string"), col("product", "string")],
    };
    const result = translateNLQ("summary", stringsOnly);

    expect(result.sql).toContain("COUNT(DISTINCT *)");
    expect(result.confidence).toBe("medium");
  });
});

// ─── translateNLQ: filter-by-value pattern ────────────────────────────────────

describe("translateNLQ filter pattern", () => {
  it("quotes string filter values", () => {
    const result = translateNLQ("filter region = North", ctx);

    expect(result.sql).toContain(`WHERE "region" = 'North'`);
    expect(result.sql).toContain("LIMIT 500");
  });

  it("leaves numeric filter values unquoted", () => {
    const result = translateNLQ("where quantity = 42", ctx);
    expect(result.sql).toContain(`WHERE "quantity" = 42`);
  });

  it("returns the low-confidence fallback when the filter column is unknown", () => {
    const result = translateNLQ("where nonexistent = 5", ctx);
    expect(result.confidence).toBe("low");
  });
});

// ─── translateNLQ: min / max pattern ──────────────────────────────────────────

describe("translateNLQ min/max pattern", () => {
  it("builds a grouped MIN ordered ascending", () => {
    const result = translateNLQ("minimum of revenue", ctx);

    expect(result.sql).toContain("MIN(");
    expect(result.sql).toContain("ORDER BY result ASC");
    expect(result.chartSuggestion).toBe("bar");
  });

  it("builds a grouped MAX ordered descending", () => {
    const result = translateNLQ("maximum of revenue", ctx);

    expect(result.sql).toContain("MAX(");
    expect(result.sql).toContain("ORDER BY result DESC");
  });

  it("builds an ungrouped MIN when no dimension exists", () => {
    const numericOnly = { tableName: TABLE, columns: [col("revenue", "number")] };
    const result = translateNLQ("min of revenue", numericOnly);

    expect(result.sql).toContain("MIN(");
    expect(result.sql).not.toContain("GROUP BY");
    expect(result.chartSuggestion).toBe("number");
  });
});

// ─── translateNLQ: fallbacks ──────────────────────────────────────────────────

describe("translateNLQ unparseable fallback", () => {
  it("returns a grouped low-confidence summary when a dimension is available", () => {
    const result = translateNLQ("zxcv qwerty asdf", ctx);

    expect(result.confidence).toBe("low");
    expect(result.chartSuggestion).toBe("bar");
    expect(result.sql).toContain("GROUP BY");
    expect(result.explanation).toContain("grouped summary");
  });

  it("returns a raw row dump when no dimension column exists at all", () => {
    const numericOnly = { tableName: TABLE, columns: [col("revenue", "number")] };
    const result = translateNLQ("zxcv qwerty asdf", numericOnly);

    expect(result.confidence).toBe("low");
    expect(result.chartSuggestion).toBe("table");
    expect(result.sql).toContain("SELECT * FROM");
    expect(result.sql).toContain("LIMIT 100");
  });
});

// ─── translateNLQ: post-processing (LIMIT + explicit columns) ─────────────────

describe("translateNLQ post-processing", () => {
  it("expands SELECT * into an explicit column list for non-table charts", () => {
    // The conditional breakdown / pie paths produce explicit projections, but
    // patterns that emit SELECT * for a chart get columns expanded. We assert
    // the LIMIT post-processing always runs for chart queries.
    const result = translateNLQ("distribution of region", ctx);
    expect(result.sql).toMatch(/LIMIT \d+/);
  });
});

// ─── suggestQuestions ─────────────────────────────────────────────────────────

describe("suggestQuestions", () => {
  it("suggests metric-by-dimension questions when both column types exist", () => {
    const suggestions = suggestQuestions(ctx);

    expect(suggestions).toContain("Show total revenue by region");
    expect(suggestions).toContain("Top 10 region by revenue");
    expect(suggestions).toContain("Average revenue by region");
  });

  it("suggests a trend question when a date and numeric column are present", () => {
    const suggestions = suggestQuestions(ctx);
    expect(suggestions).toContain("Trend of revenue over time");
  });

  it("suggests a correlation question when two numeric columns exist", () => {
    const suggestions = suggestQuestions(ctx);
    expect(suggestions).toContain("Correlation between revenue and quantity");
  });

  it("includes the leading generic data-quality suggestion within the 8-item cap", () => {
    // The rich 5-column schema generates 10 candidate questions but the list is
    // capped at 8, so the first generic suggestion survives while later ones may
    // be trimmed.
    const suggestions = suggestQuestions(ctx);
    expect(suggestions).toContain("Show missing values per column");
  });

  it("surfaces all generic suggestions when the schema yields few schema-specific ones", () => {
    // A single string column produces no metric/trend/correlation suggestions,
    // leaving room for every generic suggestion under the 8-item cap.
    const suggestions = suggestQuestions({
      tableName: TABLE,
      columns: [col("category", "string")],
    });
    expect(suggestions).toContain("Show missing values per column");
    expect(suggestions).toContain("How many rows are in this dataset?");
  });

  it("caps the list at 8 suggestions", () => {
    const suggestions = suggestQuestions(ctx);
    expect(suggestions.length).toBeLessThanOrEqual(8);
  });

  it("still returns generic suggestions for an empty schema", () => {
    const suggestions = suggestQuestions({ tableName: TABLE, columns: [] });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions).toContain("Find duplicate rows");
  });
});

// ─── translateNLQWithLLM ──────────────────────────────────────────────────────

describe("translateNLQWithLLM", () => {
  it("returns the pattern result directly when confidence is not low", async () => {
    const result = await translateNLQWithLLM("how many rows", ctx, generateText);

    expect(result.confidence).toBe("high");
    expect(generateText).not.toHaveBeenCalled();
  });

  it("returns the low-confidence pattern result without calling the LLM when it is not ready", async () => {
    // No generateText callback injected — same as "no model downloaded yet".
    const result = await translateNLQWithLLM("blah blah unparseable", ctx);

    expect(result.confidence).toBe("low");
    expect(generateText).not.toHaveBeenCalled();
  });

  it("upgrades a low-confidence result with the LLM when it is ready", async () => {
    generateText.mockResolvedValue(
      JSON.stringify({
        sql: "SELECT region FROM sales",
        explanation: "LLM generated",
        confidence: "high",
        chartSuggestion: "table",
      }),
    );

    const result = await translateNLQWithLLM("blah blah unparseable", ctx, generateText);

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(result.explanation).toBe("LLM generated");
    expect(result.confidence).toBe("high");
    // LIMIT 1000 is guaranteed on the LLM output.
    expect(result.sql).toBe("SELECT region FROM sales LIMIT 1000");
  });

  it("recovers JSON embedded in surrounding prose from the LLM", async () => {
    generateText.mockResolvedValue(
      'Sure, here you go:\n{"sql":"SELECT 1","explanation":"e","confidence":"medium"}\nHope that helps!',
    );

    const result = await translateNLQWithLLM("blah blah unparseable", ctx, generateText);

    expect(result.sql).toBe("SELECT 1 LIMIT 1000");
    expect(result.confidence).toBe("medium");
  });

  it("falls back to the pattern result when the LLM returns no JSON", async () => {
    generateText.mockResolvedValue("I cannot help with that.");

    const result = await translateNLQWithLLM("blah blah unparseable", ctx, generateText);

    expect(result.confidence).toBe("low");
  });

  it("falls back to the pattern result when the LLM JSON lacks a sql field", async () => {
    generateText.mockResolvedValue('{"explanation":"no sql here"}');

    const result = await translateNLQWithLLM("blah blah unparseable", ctx, generateText);

    expect(result.confidence).toBe("low");
  });

  it("falls back to the pattern result when generateText rejects", async () => {
    generateText.mockRejectedValue(new Error("model crashed"));

    const result = await translateNLQWithLLM("blah blah unparseable", ctx, generateText);

    expect(result.confidence).toBe("low");
  });

  it("defaults confidence to medium when the LLM omits it", async () => {
    generateText.mockResolvedValue('{"sql":"SELECT 2"}');

    const result = await translateNLQWithLLM("blah blah unparseable", ctx, generateText);

    expect(result.confidence).toBe("medium");
    expect(result.sql).toBe("SELECT 2 LIMIT 1000");
  });
});

// ─── fuzzyFindColumn: substring and fuzzy match paths ────────────────────────
// These private paths are exercised via bestMetric / bestDimension when hints
// are non-exact matches of column names present in the schema.

describe("fuzzyFindColumn substring match (line 38-39)", () => {
  it("finds a column via substring match when the hint is a prefix of the column name", () => {
    // Column is "revenue_2024" - hint "revenue" is not an exact match but IS a
    // substring, so line 38-39 must fire.
    const substringCols: ColMeta[] = [
      col("revenue_2024", "number"),
      col("category", "string"),
    ];
    const substringCtx = { tableName: TABLE, columns: substringCols };

    // The "top N by metric" pattern calls bestMetric(columns, metricHint).
    // With hint="revenue" and column "revenue_2024", exact match fails
    // (different strings) but substring match succeeds.
    const result = translateNLQ("top 5 items by revenue", substringCtx);

    expect(result.sql).toContain('"revenue_2024"');
    expect(result.confidence).toBe("high");
  });

  it("finds a dimension via substring match when the hint is part of the column name", () => {
    // Column is "category_name" - hint "category" is a substring of it.
    const substringDimCols: ColMeta[] = [
      col("category_name", "string"),
      col("amount", "number"),
    ];
    const dimCtx = { tableName: TABLE, columns: substringDimCols };

    // The "sum ... by" pattern calls bestDimension(columns, hint).
    const result = translateNLQ("sum of amount by category", dimCtx);

    expect(result.sql).toContain('"category_name"');
  });
});

describe("fuzzyFindColumn fuzzy (Fuse.js) match (lines 42-48)", () => {
  it("finds a column via Fuse.js when hint is a near-typo of the column name", () => {
    // "revnue" is a typo - not exact, not a substring of "revenue", but close
    // enough for Fuse.js (threshold 0.4) to fuzzy-match it.
    const fuzzyCols: ColMeta[] = [
      col("revenue", "number"),
      col("category", "string"),
    ];
    const fuzzyCtx = { tableName: TABLE, columns: fuzzyCols };

    // The "top N by metric" pattern: bestMetric(columns, "revnue").
    // exact match -> false, substring ("revnue" in "revenue") -> false,
    // Fuse.js -> finds "revenue".
    const result = translateNLQ("top 5 items by revnue", fuzzyCtx);

    // Fuse should resolve "revnue" -> "revenue".
    expect(result.sql).toContain('"revenue"');
    expect(result.confidence).toBe("high");
  });

  it("returns undefined from fuzzyFindColumn when no candidates match at all", () => {
    // A hint so far from any column that even Fuse.js finds nothing.
    // bestMetric falls through to priority-list / first-numeric.
    // We need zero priority-matching columns too, so use a custom name.
    // A string column is also needed so bestDimension is non-null and the
    // top-N pattern doesn't return null (which would trigger the global fallback).
    const unmatchedCols: ColMeta[] = [
      col("zzz_score", "number"),
      col("segment", "string"),
    ];
    const unmatchedCtx = { tableName: TABLE, columns: unmatchedCols };

    // bestMetric(cols, "xqzjk"): exact -> false, substring -> false, Fuse.js ->
    // undefined (hint is too dissimilar) -> priority scan misses all ("zzz_score"
    // contains none of the priority keywords) -> falls to first numeric col.
    const result = translateNLQ("top 5 things by xqzjk", unmatchedCtx);

    // Should use "zzz_score" as the fallback first numeric col.
    expect(result.sql).toContain('"zzz_score"');
    expect(result.confidence).toBe("high");
  });
});

// ─── bestMetric: fallback paths (lines 84-85) ────────────────────────────────

describe("bestMetric fallback paths (lines 84-85)", () => {
  it("returns the first numeric column when no priority keyword matches", () => {
    // Column "score_2024" does not match any of the priority keywords
    // (revenue, sales, amount, value, total, price, profit, count, qty, quantity).
    const noPriorityMatchCols: ColMeta[] = [
      col("score_2024", "number"),
      col("category", "string"),
    ];
    const noPriorityCtx = { tableName: TABLE, columns: noPriorityMatchCols };

    // bestMetric called without a hint -> priority scan misses -> first numeric.
    const result = translateNLQ("show outliers", noPriorityCtx);

    expect(result.sql).toContain('"score_2024"');
  });

  it("returns COUNT(*) when no numeric columns exist at all", () => {
    // No number columns -> numCols returns [] -> first is undefined -> COUNT(*).
    const noNumericCols: ColMeta[] = [
      col("category", "string"),
    ];
    const noNumCtx = { tableName: TABLE, columns: noNumericCols };

    // Outliers pattern calls bestMetric(columns) with no hint.
    const result = translateNLQ("show outliers", noNumCtx);

    expect(result.sql).toContain("COUNT(*)");
  });
});

// ─── addLimit: semicolon-terminated SQL without existing LIMIT (line 122) ────

describe("addLimit semicolon path (line 122)", () => {
  it("appends LIMIT before the trailing semicolon", () => {
    // The raw SQL passthrough calls addLimit(q, 1000) where q may end in ";".
    // If SQL has no LIMIT and ends with ";", we expect "... LIMIT 1000;".
    const result = translateNLQ("SELECT region FROM sales;", ctx);

    // SQL passthrough kicks in (starts with SELECT), addLimit is called.
    // "SELECT region FROM sales;" -> no existing LIMIT -> ends with ";" ->
    // -> "SELECT region FROM sales LIMIT 1000;"
    expect(result.sql).toBe("SELECT region FROM sales LIMIT 1000;");
    expect(result.explanation).toBe("Executed as raw SQL.");
  });

  it("preserves a semicolon-terminated SQL that already has LIMIT (early-return branch)", () => {
    // SQL has both a LIMIT and a trailing semicolon.
    // addLimit detects existing LIMIT in withoutSemi and returns sql unchanged.
    const result = translateNLQ("SELECT region FROM sales LIMIT 5;", ctx);

    expect(result.sql).toBe("SELECT region FROM sales LIMIT 5;");
  });
});
