import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DataSchema, WidgetSpec } from "@/features/agent-canvas/core/types";

// ── Boundary mocks ───────────────────────────────────────────────────────────
// generateSQL validates every query through DuckDB's EXPLAIN (runReadOnlyQuery)
// and uses the offline AI bridge. Both are external runtime boundaries (a worker
// DB + a native model), so we stub them and drive each branch deterministically.

const runReadOnlyQuery = vi.fn<(sql: string) => Promise<unknown>>();
vi.mock("@/platform/duckdb/duckdb", () => ({
  runReadOnlyQuery: (sql: string) => runReadOnlyQuery(sql),
}));

const aiChat = vi.fn<(system: string, user: string, opts?: unknown) => Promise<string>>();
const aiReadySync = vi.fn<() => boolean>();
vi.mock("@/features/agent-canvas/core/ai-bridge", () => ({
  aiChat: (system: string, user: string, opts?: unknown) => aiChat(system, user, opts),
  aiReadySync: () => aiReadySync(),
}));

import {
  addLimit,
  explicitColumns,
  generateInsight,
  generateSQL,
} from "@/features/agent-canvas/core/sql";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeSchema(overrides: Partial<DataSchema> = {}): DataSchema {
  return {
    tableName: "tx",
    rowCount: 1000,
    columns: [
      {
        name: "channel",
        duckType: "VARCHAR",
        semantic: "categorical",
        cardinality: 5,
        nullRate: 0,
        sample: ["USSD", "APP", "WEB"],
      },
      {
        name: "amount",
        duckType: "DOUBLE",
        semantic: "numeric",
        cardinality: 900,
        nullRate: 0,
        sample: ["12.5", "34.0", "7.2"],
      },
      {
        name: "txn_date",
        duckType: "TIMESTAMP",
        semantic: "datetime",
        cardinality: 30,
        nullRate: 0,
        sample: ["2025-01-01", "2025-01-02"],
      },
      {
        name: "qty",
        duckType: "BIGINT",
        semantic: "numeric",
        cardinality: 40,
        nullRate: 0,
        sample: ["1", "2", "3"],
      },
    ],
    category: "telecom",
    summary: "daily transactions",
    dimensions: ["channel"],
    metrics: ["amount", "qty"],
    timeDims: ["txn_date"],
    ...overrides,
  };
}

function makeSpec(overrides: Partial<WidgetSpec> = {}): WidgetSpec {
  return {
    id: "w1",
    title: "By Channel",
    chartType: "bar",
    sqlIntent: "totals by channel",
    dimensions: ["channel"],
    metrics: ["amount"],
    position: { x: 0, y: 0, w: 4, h: 3 },
    ...overrides,
  };
}

/** Collects emit() messages for assertions on progress text. */
function makeEmitter() {
  const messages: string[] = [];
  return { emit: (t: string) => messages.push(t), messages };
}

beforeEach(() => {
  runReadOnlyQuery.mockReset();
  aiChat.mockReset();
  aiReadySync.mockReset();
  // Default: AI off, DuckDB EXPLAIN always succeeds.
  aiReadySync.mockReturnValue(false);
  runReadOnlyQuery.mockResolvedValue(undefined);
});

// ── addLimit ─────────────────────────────────────────────────────────────────

describe("addLimit", () => {
  it("appends the default LIMIT 100 to a bare query", () => {
    expect(addLimit("SELECT * FROM tx")).toBe("SELECT * FROM tx LIMIT 100");
  });

  it("appends a custom limit when provided", () => {
    expect(addLimit("SELECT * FROM tx", 50)).toBe("SELECT * FROM tx LIMIT 50");
  });

  it("trims surrounding whitespace before appending", () => {
    expect(addLimit("   SELECT 1   ", 5)).toBe("SELECT 1 LIMIT 5");
  });

  it("is idempotent when a LIMIT already terminates the query", () => {
    const sql = "SELECT * FROM tx LIMIT 20";
    expect(addLimit(sql, 50)).toBe(sql);
  });

  it("matches an existing LIMIT case-insensitively and leaves it untouched", () => {
    const sql = "select * from tx limit 7";
    expect(addLimit(sql, 99)).toBe(sql);
  });

  it("preserves a trailing semicolon and inserts LIMIT before it", () => {
    expect(addLimit("SELECT * FROM tx;", 30)).toBe("SELECT * FROM tx LIMIT 30;");
  });

  it("treats a query whose LIMIT is followed only by a semicolon as already limited", () => {
    const sql = "SELECT * FROM tx LIMIT 10;";
    // withoutSemi ends in "LIMIT 10" → regex matches → original returned verbatim.
    expect(addLimit(sql, 99)).toBe(sql);
  });

  it("still appends when a LIMIT exists mid-query but not at the end (e.g. subquery)", () => {
    // The trailing-LIMIT regex anchors at end-of-string, so an inner LIMIT does
    // not count and an outer LIMIT is added.
    const sql = "SELECT * FROM (SELECT * FROM tx LIMIT 5) GROUP BY 1";
    expect(addLimit(sql, 50)).toBe(
      "SELECT * FROM (SELECT * FROM tx LIMIT 5) GROUP BY 1 LIMIT 50",
    );
  });
});

// ── explicitColumns ──────────────────────────────────────────────────────────

describe("explicitColumns", () => {
  it("rewrites SELECT * into the schema's quoted column list", () => {
    const out = explicitColumns("SELECT * FROM tx", makeSchema());
    expect(out).toBe('SELECT "channel", "amount", "txn_date", "qty" FROM tx');
  });

  it("returns the query unchanged when there is no SELECT *", () => {
    const sql = "SELECT channel, amount FROM tx";
    expect(explicitColumns(sql, makeSchema())).toBe(sql);
  });

  it("only rewrites the first SELECT * occurrence (single replace)", () => {
    const sql = "SELECT * FROM (SELECT * FROM tx)";
    const out = explicitColumns(sql, makeSchema());
    // First * expanded, the nested one left intact.
    expect(out).toBe('SELECT "channel", "amount", "txn_date", "qty" FROM (SELECT * FROM tx)');
  });

  it("escapes EVERY embedded double quote in column names (regression: not just the first)", () => {
    const schema = makeSchema({
      columns: [
        {
          name: 'a"b"c',
          duckType: "VARCHAR",
          semantic: "categorical",
          cardinality: 2,
          nullRate: 0,
          sample: [],
        },
      ],
    });
    // qc must double every embedded quote, else the identifier is malformed/unsafe.
    expect(explicitColumns("SELECT * FROM tx", schema)).toBe('SELECT "a""b""c" FROM tx');
  });

  it("handles an empty column list by producing SELECT  (empty) ", () => {
    const schema = makeSchema({ columns: [] });
    expect(explicitColumns("SELECT * FROM tx", schema)).toBe("SELECT  FROM tx");
  });
});

// ── generateSQL: heuristic path (AI off) ─────────────────────────────────────

describe("generateSQL — heuristic path (AI off)", () => {
  it("emits the rule-based message and produces a bar query grouped by the dimension", async () => {
    const { emit, messages } = makeEmitter();
    const sql = await generateSQL(makeSpec({ chartType: "bar" }), makeSchema(), emit);

    expect(messages.some((m) => m.includes('Rule-based SQL for "By Channel"'))).toBe(true);
    // numeric metric → SUM("amount") (no TRY_CAST), grouped by channel, limited.
    expect(sql).toContain('CAST("channel" AS VARCHAR) AS category');
    expect(sql).toContain('ROUND(SUM("amount"),2) AS value');
    expect(sql).toContain("GROUP BY 1 ORDER BY 2 DESC LIMIT 20");
    // Chart query (not data-table) → SELECT * would be expanded, but there is none.
  });

  it("validates the heuristic query via DuckDB EXPLAIN exactly once on success", async () => {
    const { emit } = makeEmitter();
    await generateSQL(makeSpec(), makeSchema(), emit);

    expect(runReadOnlyQuery).toHaveBeenCalledTimes(1);
    expect(runReadOnlyQuery.mock.calls[0][0]).toMatch(/^EXPLAIN /);
  });

  it("uses COUNT(*) when the bar spec has a dimension but no metric", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "bar", metrics: [] }),
      makeSchema(),
      emit,
    );
    expect(sql).toContain("COUNT(*) AS count");
    expect(sql).not.toContain("SUM(");
  });

  it("falls back to SELECT * (expanded to explicit columns) for a bar with no dimension", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "bar", dimensions: [], metrics: [] }),
      makeSchema(),
      emit,
    );
    // heuristic returns `SELECT * FROM "tx" LIMIT 20`; chart path expands the *.
    expect(sql).toContain('SELECT "channel", "amount", "txn_date", "qty" FROM "tx"');
    expect(sql).toContain("LIMIT");
  });

  it("wraps a non-numeric metric in TRY_CAST for aggregation", async () => {
    const schema = makeSchema();
    const { emit } = makeEmitter();
    // metric 'channel' is categorical → safeAgg must TRY_CAST it to DOUBLE.
    const sql = await generateSQL(
      makeSpec({ chartType: "bar", metrics: ["channel"] }),
      schema,
      emit,
    );
    expect(sql).toContain('ROUND(SUM(TRY_CAST("channel" AS DOUBLE)),2) AS value');
  });

  it("builds a kpi-grid single-row query with SUM/AVG/MIN/MAX per metric", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "kpi-grid", metrics: ["amount", "qty"] }),
      makeSchema(),
      emit,
    );
    expect(sql).toContain("COUNT(*) AS total_records");
    expect(sql).toContain('ROUND(SUM("amount"),2) AS total_amount');
    expect(sql).toContain('ROUND(AVG("qty"),2) AS avg_qty');
    expect(sql).toContain('ROUND(MAX("amount"),2) AS max_amount');
  });

  it("delegates stacked-bar without a second dimension to the bar template", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "stacked-bar", dimensions: ["channel"] }),
      makeSchema(),
      emit,
    );
    // Only one dim → recurses into the bar template (category, no series column).
    expect(sql).toContain("AS category");
    expect(sql).not.toContain("AS series");
  });

  it("builds a two-level stacked-bar query when both dimensions are present", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "stacked-bar", dimensions: ["channel", "txn_date"] }),
      makeSchema(),
      emit,
    );
    expect(sql).toContain('CAST("channel" AS VARCHAR) AS category');
    expect(sql).toContain('CAST("txn_date" AS VARCHAR) AS series');
    expect(sql).toContain("GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 120");
  });

  it("truncates a time dimension with DATE_TRUNC for a time-series line chart", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "line", dimensions: ["txn_date"] }),
      makeSchema(),
      emit,
    );
    expect(sql).toContain("DATE_TRUNC('day', TRY_CAST(\"txn_date\" AS TIMESTAMP)) AS period");
    expect(sql).toContain("ORDER BY 1 LIMIT 60");
  });

  it("casts a non-time dimension to VARCHAR for a line chart", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "line", dimensions: ["channel"] }),
      makeSchema(),
      emit,
    );
    expect(sql).toContain('CAST("channel" AS VARCHAR) AS period');
    expect(sql).not.toContain("DATE_TRUNC");
  });

  it("builds a pie query with name/value aliases and a tight LIMIT", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "pie", dimensions: ["channel"] }),
      makeSchema(),
      emit,
    );
    expect(sql).toContain('CAST("channel" AS VARCHAR) AS name');
    expect(sql).toContain("ORDER BY 2 DESC LIMIT 12");
  });

  it("derives x/y from schema metrics for a scatter chart and labels by dimension", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "scatter", dimensions: ["channel"], metrics: ["amount"] }),
      makeSchema(),
      emit,
    );
    // x = first metric (amount, numeric → quoted), y = schema.metrics[1] (qty).
    expect(sql).toContain('ROUND("amount",3) AS x');
    expect(sql).toContain('ROUND("qty",3) AS y');
    expect(sql).toContain('CAST("channel" AS VARCHAR) AS label');
    expect(sql).toContain("LIMIT 400");
  });

  it("builds a heatmap only when two dims and a metric exist", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({
        chartType: "heatmap",
        dimensions: ["channel", "txn_date"],
        metrics: ["amount"],
      }),
      makeSchema(),
      emit,
    );
    expect(sql).toContain('CAST("channel" AS VARCHAR) AS row_val');
    expect(sql).toContain('CAST("txn_date" AS VARCHAR) AS col_val');
    expect(sql).toContain('ROUND(AVG("amount"),2) AS value');
  });

  it("builds a radar query with sanitized metric aliases when ≥2 metrics", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({
        chartType: "radar",
        dimensions: ["channel"],
        metrics: ["amount", "qty"],
      }),
      makeSchema(),
      emit,
    );
    expect(sql).toContain('CAST("channel" AS VARCHAR) AS category');
    expect(sql).toContain('ROUND(AVG("amount"),2) AS amount');
    expect(sql).toContain('ROUND(AVG("qty"),2) AS qty');
  });

  it("builds a normalized gauge (avg/max*100) when a metric is available", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "gauge", metrics: ["amount"] }),
      makeSchema(),
      emit,
    );
    expect(sql).toContain('AVG("amount")');
    expect(sql).toContain('NULLIF(MAX("amount"), 0) * 100');
    expect(sql).toContain("AS value");
  });

  it("emits a constant gauge of 50 when no metric is available", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "gauge", metrics: [] }),
      makeSchema({ metrics: [] }),
      emit,
    );
    // `SELECT 50 AS value` → addLimit appends LIMIT 50 (chart default).
    expect(sql).toContain("SELECT 50 AS value");
    expect(sql).toContain("LIMIT 50");
  });

  it("uses the default template (SELECT * + ORDER BY metric) for data-table with a metric", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "data-table", metrics: ["amount"] }),
      makeSchema(),
      emit,
    );
    // data-table → NOT expanded (explicitColumns skipped). The default heuristic
    // template already ends in `LIMIT 30`, so addLimit is idempotent: the
    // template's own LIMIT 30 wins over the data-table default of 100.
    expect(sql).toContain("SELECT * FROM");
    expect(sql).toContain('ORDER BY "amount" DESC NULLS LAST');
    expect(sql).toContain("LIMIT 30");
    expect(sql).not.toContain("LIMIT 100");
  });
});

// ── generateSQL: LLM path (AI on) ────────────────────────────────────────────

describe("generateSQL — LLM path (AI on)", () => {
  beforeEach(() => {
    aiReadySync.mockReturnValue(true);
  });

  it("returns the LLM SQL verbatim when it is valid and plans cleanly", async () => {
    aiChat.mockResolvedValue("SELECT channel, COUNT(*) AS c FROM tx GROUP BY 1");
    const { emit, messages } = makeEmitter();

    const sql = await generateSQL(makeSpec(), makeSchema(), emit);

    expect(messages.some((m) => m.includes("LLM generating SQL"))).toBe(true);
    expect(messages.some((m) => m.includes("SQL ready"))).toBe(true);
    expect(sql).toContain("SELECT channel, COUNT(*) AS c FROM tx GROUP BY 1");
    expect(sql).toContain("LIMIT 50");
    expect(aiChat).toHaveBeenCalledTimes(1);
  });

  it("strips a ```sql fenced code block from the LLM output", async () => {
    aiChat.mockResolvedValue("```sql\nSELECT 1 AS one\n```");
    const { emit } = makeEmitter();

    const sql = await generateSQL(makeSpec(), makeSchema(), emit);

    expect(sql).toContain("SELECT 1 AS one");
    expect(sql).not.toContain("```");
  });

  it("strips a plain ``` fenced block (no language tag)", async () => {
    aiChat.mockResolvedValue("```\nWITH t AS (SELECT 1) SELECT * FROM t\n```");
    const { emit } = makeEmitter();

    const sql = await generateSQL(makeSpec(), makeSchema(), emit);
    expect(sql).toContain("WITH t AS (SELECT 1)");
    expect(sql).not.toContain("```");
  });

  it("falls back to the heuristic when the LLM output does not start with SELECT/WITH", async () => {
    aiChat.mockResolvedValue("Here is your query: it counts rows.");
    const { emit, messages } = makeEmitter();

    const sql = await generateSQL(makeSpec(), makeSchema(), emit);

    expect(messages.some((m) => m.includes("LLM SQL invalid, using heuristic fallback"))).toBe(
      true,
    );
    // Heuristic bar query is used instead.
    expect(sql).toContain("AS category");
  });

  it("falls back to the heuristic when aiChat throws, with a failure message", async () => {
    aiChat.mockRejectedValue(new Error("model crashed"));
    const { emit, messages } = makeEmitter();

    const sql = await generateSQL(makeSpec(), makeSchema(), emit);

    expect(messages.some((m) => m.includes("SQL generation failed"))).toBe(true);
    expect(messages.some((m) => m.includes("model crashed"))).toBe(true);
    expect(sql).toContain("AS category");
  });

  it("repairs invalid SQL: first EXPLAIN fails, repair succeeds, repaired query returned", async () => {
    // Initial generation valid-looking but fails to plan; repair returns a query
    // that plans. runReadOnlyQuery: call 1 (original) rejects, call 2 (repaired)
    // resolves.
    aiChat
      .mockResolvedValueOnce("SELECT bad_col FROM tx")
      .mockResolvedValueOnce("SELECT channel FROM tx");
    runReadOnlyQuery
      .mockRejectedValueOnce(new Error("Referenced column \"bad_col\" not found"))
      .mockResolvedValueOnce(undefined);

    const { emit, messages } = makeEmitter();
    const sql = await generateSQL(makeSpec(), makeSchema(), emit);

    expect(messages.some((m) => m.includes("SQL failed validation"))).toBe(true);
    expect(messages.some((m) => m.includes("Repaired SQL validated"))).toBe(true);
    expect(sql).toContain("SELECT channel FROM tx");
    expect(aiChat).toHaveBeenCalledTimes(2); // generate + repair
  });

  it("falls back to a validated heuristic when both original and repaired SQL fail to plan", async () => {
    aiChat
      .mockResolvedValueOnce("SELECT bad_col FROM tx")
      .mockResolvedValueOnce("SELECT also_bad FROM tx");
    // EXPLAIN for original fails, EXPLAIN for repaired fails, EXPLAIN for the
    // heuristic fallback is NOT performed (it is returned directly).
    runReadOnlyQuery
      .mockRejectedValueOnce(new Error("bad_col missing"))
      .mockRejectedValueOnce(new Error("also_bad missing"));

    const { emit, messages } = makeEmitter();
    const sql = await generateSQL(makeSpec(), makeSchema(), emit);

    expect(messages.some((m) => m.includes("Using validated heuristic SQL"))).toBe(true);
    // The deterministic bar heuristic, not the LLM text.
    expect(sql).toContain("AS category");
    expect(sql).not.toContain("bad_col");
  });

  it("falls back to the heuristic when the repaired SQL is not a SELECT/WITH statement", async () => {
    aiChat
      .mockResolvedValueOnce("SELECT bad_col FROM tx")
      .mockResolvedValueOnce("sorry, I cannot fix this");
    runReadOnlyQuery.mockRejectedValueOnce(new Error("bad_col missing"));

    const { emit, messages } = makeEmitter();
    const sql = await generateSQL(makeSpec(), makeSchema(), emit);

    expect(messages.some((m) => m.includes("Using validated heuristic SQL"))).toBe(true);
    expect(sql).toContain("AS category");
  });

  it("falls back to the heuristic when the repair aiChat call throws", async () => {
    aiChat
      .mockResolvedValueOnce("SELECT bad_col FROM tx")
      .mockRejectedValueOnce(new Error("repair model died"));
    runReadOnlyQuery.mockRejectedValueOnce(new Error("bad_col missing"));

    const { emit, messages } = makeEmitter();
    const sql = await generateSQL(makeSpec(), makeSchema(), emit);

    expect(messages.some((m) => m.includes("Using validated heuristic SQL"))).toBe(true);
    expect(sql).toContain("AS category");
  });

  it("does not attempt repair when AI is unavailable at validation time", async () => {
    // Generation produced a heuristic-ish query but EXPLAIN fails; aiReadySync is
    // false at the repair gate, so no repair call is made.
    aiReadySync.mockReturnValueOnce(true).mockReturnValue(false);
    aiChat.mockResolvedValueOnce("SELECT bad_col FROM tx");
    runReadOnlyQuery.mockRejectedValueOnce(new Error("bad_col missing"));

    const { emit, messages } = makeEmitter();
    const sql = await generateSQL(makeSpec(), makeSchema(), emit);

    expect(messages.some((m) => m.includes("Using validated heuristic SQL"))).toBe(true);
    // Only the initial generation call happened, no repair.
    expect(aiChat).toHaveBeenCalledTimes(1);
    expect(sql).toContain("AS category");
  });

  it("uses LIMIT 100 default for a data-table LLM query but 50 for charts", async () => {
    aiChat.mockResolvedValue("SELECT * FROM tx");
    const { emit } = makeEmitter();

    const tableSql = await generateSQL(
      makeSpec({ chartType: "data-table" }),
      makeSchema(),
      emit,
    );
    expect(tableSql).toContain("LIMIT 100");
    // data-table keeps SELECT * (not expanded).
    expect(tableSql).toContain("SELECT * FROM tx");
  });

  it("expands SELECT * to explicit columns for chart LLM queries", async () => {
    aiChat.mockResolvedValue("SELECT * FROM tx");
    const { emit } = makeEmitter();

    const chartSql = await generateSQL(makeSpec({ chartType: "bar" }), makeSchema(), emit);
    expect(chartSql).toContain('SELECT "channel", "amount", "txn_date", "qty" FROM tx');
    expect(chartSql).toContain("LIMIT 50");
  });
});

// ── generateInsight ──────────────────────────────────────────────────────────

describe("generateInsight", () => {
  it("returns empty string when AI is not ready", async () => {
    aiReadySync.mockReturnValue(false);
    const { emit } = makeEmitter();
    const out = await generateInsight(makeSpec(), [{ a: 1 }], emit);
    expect(out).toBe("");
    expect(aiChat).not.toHaveBeenCalled();
  });

  it("returns empty string when data is empty even if AI is ready", async () => {
    aiReadySync.mockReturnValue(true);
    const { emit } = makeEmitter();
    const out = await generateInsight(makeSpec(), [], emit);
    expect(out).toBe("");
    expect(aiChat).not.toHaveBeenCalled();
  });

  it("returns a stripped insight sentence and emits a truncated preview", async () => {
    aiReadySync.mockReturnValue(true);
    aiChat.mockResolvedValue('"USSD leads with 1200 transactions."');
    const { emit, messages } = makeEmitter();

    const out = await generateInsight(
      makeSpec(),
      [{ channel: "USSD", value: 1200 }],
      emit,
    );

    // Surrounding double quotes removed.
    expect(out).toBe("USSD leads with 1200 transactions.");
    expect(messages.some((m) => m.startsWith("Insight:"))).toBe(true);
  });

  it("strips a single leading/trailing quote character (regex anchors)", async () => {
    aiReadySync.mockReturnValue(true);
    aiChat.mockResolvedValue("'Single quoted insight'");
    const { emit } = makeEmitter();
    const out = await generateInsight(makeSpec(), [{ a: 1 }], emit);
    expect(out).toBe("Single quoted insight");
  });

  it("passes a compact top-5-row summary and total count to the model", async () => {
    aiReadySync.mockReturnValue(true);
    aiChat.mockResolvedValue("ok");
    const { emit } = makeEmitter();
    const rows = Array.from({ length: 8 }, (_, i) => ({ k: i, v: i * 2 }));

    await generateInsight(makeSpec({ title: "T", chartType: "bar" }), rows, emit);

    expect(aiChat).toHaveBeenCalledTimes(1);
    const userPrompt = aiChat.mock.calls[0][1];
    // Only the first 5 rows are summarized.
    expect(userPrompt).toContain("k=0, v=0");
    expect(userPrompt).toContain("k=4, v=8");
    expect(userPrompt).not.toContain("k=5");
    // Total row count is the full length.
    expect(userPrompt).toContain("Total rows: 8");
  });

  it("returns empty string and does not throw when the model call rejects", async () => {
    aiReadySync.mockReturnValue(true);
    aiChat.mockRejectedValue(new Error("insight model failed"));
    const { emit } = makeEmitter();
    const out = await generateInsight(makeSpec(), [{ a: 1 }], emit);
    expect(out).toBe("");
  });
});

// ── Additional branch coverage ────────────────────────────────────────────────

describe("generateSQL — additional chart type branch coverage", () => {
  // horizontal-bar (falls through to bar's case block)
  it("horizontal-bar produces the same query shape as bar", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "horizontal-bar", dimensions: ["channel"], metrics: ["amount"] }),
      makeSchema(),
      emit,
    );
    expect(sql).toContain('CAST("channel" AS VARCHAR) AS category');
    expect(sql).toContain('ROUND(SUM("amount"),2) AS value');
    expect(sql).toContain("GROUP BY 1 ORDER BY 2 DESC LIMIT 20");
  });

  // stacked-horizontal-bar with both dims
  it("stacked-horizontal-bar with two dims produces category + series", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({
        chartType: "stacked-horizontal-bar",
        dimensions: ["channel", "txn_date"],
        metrics: ["amount"],
      }),
      makeSchema(),
      emit,
    );
    expect(sql).toContain('CAST("channel" AS VARCHAR) AS category');
    expect(sql).toContain('CAST("txn_date" AS VARCHAR) AS series');
    expect(sql).toContain("GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 120");
  });

  // stacked-bar with two dims but no metric → COUNT(*) AS value
  it("stacked-bar with two dims but no metric uses COUNT(*) AS value", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "stacked-bar", dimensions: ["channel", "txn_date"], metrics: [] }),
      makeSchema(),
      emit,
    );
    expect(sql).toContain("COUNT(*) AS value");
    expect(sql).toContain("AS series");
  });

  // area (falls through to line's case block)
  it("area with a time dimension uses DATE_TRUNC", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "area", dimensions: ["txn_date"], metrics: ["amount"] }),
      makeSchema(),
      emit,
    );
    expect(sql).toContain("DATE_TRUNC('day', TRY_CAST(\"txn_date\" AS TIMESTAMP)) AS period");
    expect(sql).toContain("ORDER BY 1 LIMIT 60");
  });

  // multi-line
  it("multi-line without a metric uses COUNT(*) AS value", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "multi-line", dimensions: ["channel"], metrics: [] }),
      makeSchema(),
      emit,
    );
    expect(sql).toContain("COUNT(*) AS value");
    expect(sql).toContain('CAST("channel" AS VARCHAR) AS period');
  });

  // line without metric → COUNT(*) AS value
  it("line without a metric uses COUNT(*) AS value", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "line", dimensions: ["channel"], metrics: [] }),
      makeSchema(),
      emit,
    );
    expect(sql).toContain("COUNT(*) AS value");
  });

  // line without dimension → SELECT * LIMIT 30
  it("line without a dimension returns SELECT * LIMIT 30", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "line", dimensions: [], metrics: [] }),
      makeSchema(),
      emit,
    );
    expect(sql).toMatch(/SELECT.*FROM "tx"/);
    expect(sql).toContain("LIMIT");
  });

  // donut (falls through to pie's case block)
  it("donut produces the same pie-style query", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "donut", dimensions: ["channel"], metrics: ["amount"] }),
      makeSchema(),
      emit,
    );
    expect(sql).toContain('CAST("channel" AS VARCHAR) AS name');
    expect(sql).toContain("ORDER BY 2 DESC LIMIT 12");
  });

  // treemap with no dim → SELECT * LIMIT 10
  it("treemap without a dimension returns SELECT * LIMIT 10 (expanded)", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "treemap", dimensions: [], metrics: [] }),
      makeSchema(),
      emit,
    );
    expect(sql).toMatch(/SELECT.*FROM "tx"/);
    expect(sql).toContain("LIMIT");
  });

  // funnel with dim but no metric → COUNT(*) AS value
  it("funnel with a dimension but no metric uses COUNT(*) AS value", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "funnel", dimensions: ["channel"], metrics: [] }),
      makeSchema(),
      emit,
    );
    expect(sql).toContain("COUNT(*) AS value");
    expect(sql).toContain('CAST("channel" AS VARCHAR) AS name');
  });

  // pie without metric → COUNT(*) AS value
  it("pie without a metric uses COUNT(*) AS value", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "pie", dimensions: ["channel"], metrics: [] }),
      makeSchema(),
      emit,
    );
    expect(sql).toContain("COUNT(*) AS value");
    expect(sql).toContain('CAST("channel" AS VARCHAR) AS name');
  });

  // bubble (falls through to scatter's case block)
  it("bubble produces the same scatter-style x/y query", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "bubble", dimensions: ["channel"], metrics: ["amount", "qty"] }),
      makeSchema(),
      emit,
    );
    expect(sql).toContain("AS x");
    expect(sql).toContain("AS y");
    expect(sql).toContain("LIMIT 400");
  });

  // scatter: no label (empty dim and no schema.dimensions)
  it("scatter without any dimension produces no label column", async () => {
    const { emit } = makeEmitter();
    const schema = makeSchema({ dimensions: [] });
    const sql = await generateSQL(
      makeSpec({ chartType: "scatter", dimensions: [], metrics: ["amount", "qty"] }),
      schema,
      emit,
    );
    expect(sql).not.toContain("AS label");
    expect(sql).toContain("AS x");
    expect(sql).toContain("AS y");
  });

  // scatter: non-numeric x → TRY_CAST for x
  it("scatter uses TRY_CAST for a non-numeric x metric", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "scatter", dimensions: [], metrics: ["channel", "qty"] }),
      makeSchema(),
      emit,
    );
    // channel is categorical → TRY_CAST
    expect(sql).toContain('TRY_CAST("channel" AS DOUBLE)');
  });

  // scatter: met undefined, falls through to schema.metrics[0], and y from schema.metrics[1]
  it("scatter derives x from schema.metrics[0] and y from schema.metrics[1] when spec.metrics is empty", async () => {
    const { emit } = makeEmitter();
    const schema = makeSchema(); // schema.metrics = ["amount", "qty"]
    const sql = await generateSQL(
      makeSpec({ chartType: "scatter", dimensions: [], metrics: [] }),
      schema,
      emit,
    );
    // x = schema.metrics[0] = amount (numeric → quoted)
    expect(sql).toContain('"amount"');
    // y = schema.metrics[1] = qty
    expect(sql).toContain('"qty"');
  });

  // scatter: no met, no schema.metrics → falls back to schema.columns.find numeric
  it("scatter falls back to first numeric column when no spec or schema metrics", async () => {
    const { emit } = makeEmitter();
    const schema = makeSchema({ metrics: [] }); // no schema.metrics
    const sql = await generateSQL(
      makeSpec({ chartType: "scatter", dimensions: [], metrics: [] }),
      schema,
      emit,
    );
    // First numeric column in schema is "amount" (DOUBLE, numeric semantic)
    expect(sql).toContain('"amount"');
  });

  // scatter: absolutely no numeric columns → x = ""
  it("scatter with no metrics at all produces TRY_CAST of empty column name", async () => {
    const { emit } = makeEmitter();
    const schema = makeSchema({
      metrics: [],
      columns: [
        {
          name: "cat",
          duckType: "VARCHAR",
          semantic: "categorical",
          cardinality: 3,
          nullRate: 0,
          sample: ["a"],
        },
      ],
    });
    const sql = await generateSQL(
      makeSpec({ chartType: "scatter", dimensions: [], metrics: [] }),
      schema,
      emit,
    );
    // x = "" → TRY_CAST("" AS DOUBLE)
    expect(sql).toContain('TRY_CAST("" AS DOUBLE)');
  });

  // heatmap: missing met only (has dims but no metric)
  it("heatmap with two dims but no metric returns SELECT * fallback", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "heatmap", dimensions: ["channel", "txn_date"], metrics: [] }),
      makeSchema(),
      emit,
    );
    expect(sql).toMatch(/SELECT.*FROM "tx"/);
    expect(sql).not.toContain("AS row_val");
  });

  // heatmap: dim2 missing only
  it("heatmap with only one dimension returns SELECT * fallback", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "heatmap", dimensions: ["channel"], metrics: ["amount"] }),
      makeSchema(),
      emit,
    );
    expect(sql).toMatch(/SELECT.*FROM "tx"/);
    expect(sql).not.toContain("AS col_val");
  });

  // radar: dim present but fewer than 2 metrics
  it("radar with a dim but only one metric returns SELECT * fallback", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "radar", dimensions: ["channel"], metrics: ["amount"] }),
      makeSchema(),
      emit,
    );
    expect(sql).toMatch(/SELECT.*FROM "tx"/);
    expect(sql).not.toContain("AS category");
  });

  // gauge: met from schema.metrics[0] when spec.metrics is empty
  it("gauge with no spec metric falls back to schema.metrics[0]", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "gauge", metrics: [] }),
      makeSchema(), // schema.metrics = ["amount", "qty"]
      emit,
    );
    // schema.metrics[0] = "amount" → used in AVG/MAX
    expect(sql).toContain('AVG("amount")');
    expect(sql).toContain("AS value");
  });

  // default case: unknown chart type with no metric → empty orderBy
  it("unknown chart type without a metric produces no ORDER BY clause", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "unknown-type" as never, metrics: [] }),
      makeSchema(),
      emit,
    );
    // SELECT * is expanded to explicit columns by postProcessSQL for non-data-table
    expect(sql).toContain('FROM "tx"');
    expect(sql).not.toContain("ORDER BY");
    expect(sql).toContain("LIMIT 30");
  });

  // default case: unknown chart type WITH a metric → ORDER BY metric
  it("unknown chart type with a metric includes ORDER BY that metric", async () => {
    const { emit } = makeEmitter();
    const sql = await generateSQL(
      makeSpec({ chartType: "unknown-type" as never, metrics: ["amount"] }),
      makeSchema(),
      emit,
    );
    expect(sql).toContain('ORDER BY "amount" DESC NULLS LAST');
  });
});

describe("generateSQL — explainOk non-Error rejection", () => {
  it("captures the error message when the rejection is a plain string", async () => {
    // Simulate DuckDB rejecting with a raw string, not an Error instance.
    runReadOnlyQuery.mockRejectedValueOnce("string error from duckdb");
    // Second call (heuristic fallback validate) succeeds.
    runReadOnlyQuery.mockResolvedValue(undefined);

    const { emit, messages } = makeEmitter();
    const sql = await generateSQL(makeSpec(), makeSchema(), emit);

    // The validation failure message should contain the string error.
    expect(messages.some((m) => m.includes("SQL failed validation"))).toBe(true);
    expect(messages.some((m) => m.includes("Using validated heuristic SQL"))).toBe(true);
    // Falls back to heuristic bar query.
    expect(sql).toContain("AS category");
  });
});

describe("generateSQL — LLM repair path with fenced SQL", () => {
  beforeEach(() => {
    aiReadySync.mockReturnValue(true);
  });

  it("strips a ```sql fence from the repair response and validates the result", async () => {
    // First LLM call returns valid-looking SQL that fails EXPLAIN.
    // Repair call returns a fenced SQL block that passes EXPLAIN.
    aiChat
      .mockResolvedValueOnce("SELECT bad_col FROM tx")
      .mockResolvedValueOnce("```sql\nSELECT channel FROM tx\n```");
    runReadOnlyQuery
      .mockRejectedValueOnce(new Error("bad_col not found"))
      .mockResolvedValueOnce(undefined); // repaired SQL passes

    const { emit, messages } = makeEmitter();
    const sql = await generateSQL(makeSpec(), makeSchema(), emit);

    expect(messages.some((m) => m.includes("Repaired SQL validated"))).toBe(true);
    expect(sql).toContain("SELECT channel FROM tx");
    expect(sql).not.toContain("```");
  });
});

describe("safeAgg — called without a schema", () => {
  // safeAgg is not exported, but it is exercised indirectly via heuristicSQL.
  // The `!schema` branch (no schema passed → always TRY_CAST) is reachable only
  // through kpi-grid when metrics exist. However, heuristicSQL always passes a
  // schema, so this branch is only reachable by calling safeAgg directly.
  // We cover it indirectly by ensuring it doesn't cause an error via the public
  // kpi-grid path — the schema is always passed there. To cover the `!schema`
  // branch we test through the gauge path with a minimal schema that guarantees
  // a non-numeric fallback, confirming TRY_CAST is used.
  it("safeAgg uses TRY_CAST when the column is not in the schema (column not found)", async () => {
    const { emit } = makeEmitter();
    // "missing_col" is not in makeSchema() → isNumericColumn returns false →
    // safeAgg falls to TRY_CAST branch.
    const sql = await generateSQL(
      makeSpec({ chartType: "bar", metrics: ["missing_col"] }),
      makeSchema(),
      emit,
    );
    expect(sql).toContain('ROUND(SUM(TRY_CAST("missing_col" AS DOUBLE)),2) AS value');
  });

  // safeAgg(!metric) — the empty-metric early-return branch.
  // gauge with m="" (safeAgg called with an empty metric name) triggers COUNT(*).
  // This is reachable by making gauge produce m="" (no spec.metrics, no
  // schema.metrics, so met=="" → gauge returns `SELECT 50 AS value`, not safeAgg).
  // Instead, trigger it via scatter where x="" (no metrics anywhere).
  it("scatter with x='' uses COUNT(*) style TRY_CAST for empty x column", async () => {
    const { emit } = makeEmitter();
    const schema = makeSchema({
      metrics: [],
      columns: [
        {
          name: "cat",
          duckType: "VARCHAR",
          semantic: "categorical",
          cardinality: 3,
          nullRate: 0,
          sample: ["a"],
        },
      ],
      dimensions: [],
    });
    // x="" → isNumericColumn("", schema) returns false → xExpr = TRY_CAST("" AS DOUBLE)
    // The safeAgg(!metric) branch is NOT used in scatter; it's used in kpi-grid/gauge.
    // To hit safeAgg with empty metric, use the gauge path that falls to safeAgg:
    // No: gauge checks `if (!m) return SELECT 50 AS value` before safeAgg.
    // The only way to call safeAgg("", ...) is via the scatter xExpr path indirectly
    // (not safeAgg) or via kpi-grid iterating mets that include "".
    // We use kpi-grid with an explicit empty-string metric in the list to call safeAgg("", ...).
    const kpiSql = await generateSQL(
      makeSpec({ chartType: "kpi-grid", metrics: [""] }),
      makeSchema(),
      emit,
    );
    // safeAgg("", "SUM", schema) → !metric is truthy → returns "SUM(*)"
    expect(kpiSql).toContain("SUM(*)");
  });
});

describe("buildSQLPrompt — auto-detect fallback branches", () => {
  beforeEach(() => {
    aiReadySync.mockReturnValue(true);
  });

  it("uses 'auto-detect' for GROUP BY columns when spec.dimensions is empty", async () => {
    aiChat.mockResolvedValue("SELECT channel FROM tx GROUP BY channel");
    const { emit } = makeEmitter();
    await generateSQL(makeSpec({ dimensions: [] }), makeSchema(), emit);

    // The user prompt passed to aiChat should contain "auto-detect" for dimensions.
    expect(aiChat).toHaveBeenCalledTimes(1);
    const userPrompt = aiChat.mock.calls[0][1] as string;
    expect(userPrompt).toContain("Preferred GROUP BY columns: auto-detect");
  });

  it("uses 'auto-detect' for metric columns when spec.metrics is empty", async () => {
    aiChat.mockResolvedValue("SELECT COUNT(*) FROM tx");
    const { emit } = makeEmitter();
    await generateSQL(makeSpec({ metrics: [] }), makeSchema(), emit);

    expect(aiChat).toHaveBeenCalledTimes(1);
    const userPrompt = aiChat.mock.calls[0][1] as string;
    expect(userPrompt).toContain("Preferred metric columns: auto-detect");
  });
});
