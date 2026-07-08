import { describe, expect, it } from "vitest";
import {
  buildCountQuery,
  buildCTE,
  buildReadableSQL,
  quoteIdent,
  quoteString,
  stepToSQL,
  type TransformStep,
} from "@/features/data-transform/engine/sql";

// Helper to build a step with sensible defaults.
function step(
  type: TransformStep["type"],
  config: Record<string, unknown> = {},
  overrides: Partial<TransformStep> = {},
): TransformStep {
  return {
    id: "s1",
    type,
    label: `${type} step`,
    enabled: true,
    config,
    ...overrides,
  };
}

describe("quoteIdent", () => {
  it("wraps a bare identifier in double quotes", () => {
    expect(quoteIdent("amount")).toBe('"amount"');
  });

  it("escapes every embedded double-quote (not just the first)", () => {
    // Regression guard: legacy .replace('"','""') only escaped the first quote.
    expect(quoteIdent('a"b"c')).toBe('"a""b""c"');
  });

  it("coerces non-string input to a string before quoting", () => {
    expect(quoteIdent(123 as unknown as string)).toBe('"123"');
  });
});

describe("quoteString", () => {
  it("wraps a value in single quotes", () => {
    expect(quoteString("hello")).toBe("'hello'");
  });

  it("escapes every embedded single-quote", () => {
    expect(quoteString("O'Brien's")).toBe("'O''Brien''s'");
  });
});

describe("stepToSQL", () => {
  it("builds a WHERE clause for filter steps", () => {
    const sql = stepToSQL(step("filter", { condition: "amount > 100" }), "src");
    expect(sql).toBe("SELECT * FROM src WHERE amount > 100");
  });

  it("falls back to a no-op predicate when filter condition is missing", () => {
    const sql = stepToSQL(step("filter", {}), "src");
    expect(sql).toBe("SELECT * FROM src WHERE 1=1");
  });

  it("projects an explicit column list for select steps", () => {
    const sql = stepToSQL(step("select", { columns: "a, b" }), "src");
    expect(sql).toBe("SELECT a, b FROM src");
  });

  it("selects all columns when select column list is empty", () => {
    const sql = stepToSQL(step("select", { columns: "" }), "src");
    expect(sql).toBe("SELECT * FROM src");
  });

  it("appends a derived column with a quoted alias for derive steps", () => {
    const sql = stepToSQL(step("derive", { expression: "a + b", alias: "sum_ab" }), "src");
    expect(sql).toBe('SELECT *, a + b AS "sum_ab" FROM src');
  });

  it("uses the 'derived' default alias for derive steps without an alias", () => {
    const sql = stepToSQL(step("derive", { expression: "1+1" }), "src");
    expect(sql).toBe('SELECT *, 1+1 AS "derived" FROM src');
  });

  it("uses the 'new_col' default alias for rename steps without an alias", () => {
    const sql = stepToSQL(step("rename", { expression: "a" }), "src");
    expect(sql).toBe('SELECT *, a AS "new_col" FROM src');
  });

  it("groups and aggregates when a groupBy is provided", () => {
    const sql = stepToSQL(
      step("aggregate", { groupBy: "region", agg: "SUM(amt) AS total" }),
      "src",
    );
    expect(sql).toBe("SELECT region, SUM(amt) AS total FROM src GROUP BY region");
  });

  it("aggregates without a GROUP BY clause when groupBy is blank", () => {
    const sql = stepToSQL(step("aggregate", { groupBy: "  ", agg: "COUNT(*) AS n" }), "src");
    expect(sql).toBe("SELECT COUNT(*) AS n FROM src");
  });

  it("defaults the aggregation to COUNT(*) when agg is missing", () => {
    const sql = stepToSQL(step("aggregate", { groupBy: "g" }), "src");
    expect(sql).toBe("SELECT g, COUNT(*) AS count FROM src GROUP BY g");
  });

  it("sorts ascending by a quoted column by default", () => {
    const sql = stepToSQL(step("sort", { column: "name" }), "src");
    expect(sql).toBe('SELECT * FROM src ORDER BY "name" ASC');
  });

  it("honours a DESC direction case-insensitively", () => {
    const sql = stepToSQL(step("sort", { column: "name", direction: "desc" }), "src");
    expect(sql).toBe('SELECT * FROM src ORDER BY "name" DESC');
  });

  it("treats any non-DESC direction as ASC", () => {
    const sql = stepToSQL(step("sort", { column: "name", direction: "garbage" }), "src");
    expect(sql).toBe('SELECT * FROM src ORDER BY "name" ASC');
  });

  it("returns a passthrough SELECT when the sort column is empty", () => {
    const sql = stepToSQL(step("sort", { column: "  " }), "src");
    expect(sql).toBe("SELECT * FROM src");
  });

  it("emits SELECT DISTINCT for deduplicate steps", () => {
    expect(stepToSQL(step("deduplicate"), "src")).toBe("SELECT DISTINCT * FROM src");
  });

  it("floors a positive numeric limit", () => {
    expect(stepToSQL(step("limit", { count: 25.9 }), "src")).toBe("SELECT * FROM src LIMIT 25");
  });

  it("falls back to a 1000-row limit for non-numeric counts", () => {
    expect(stepToSQL(step("limit", { count: "abc" }), "src")).toBe("SELECT * FROM src LIMIT 1000");
  });

  it("falls back to a 1000-row limit for a negative count", () => {
    expect(stepToSQL(step("limit", { count: -5 }), "src")).toBe("SELECT * FROM src LIMIT 1000");
  });

  it("allows an explicit zero-row limit", () => {
    expect(stepToSQL(step("limit", { count: 0 }), "src")).toBe("SELECT * FROM src LIMIT 0");
  });

  it("builds a LEFT JOIN by default with quoted table and keys", () => {
    const sql = stepToSQL(step("join", { table: "other", leftKey: "id", rightKey: "fk" }), "src");
    expect(sql).toBe('SELECT t1.*, t2.* FROM src t1 LEFT JOIN "other" t2 ON t1."id" = t2."fk"');
  });

  it("maps the joinType keyword to the SQL join keyword", () => {
    const sql = stepToSQL(
      step("join", {
        table: "other",
        leftKey: "id",
        rightKey: "id",
        joinType: "inner",
      }),
      "src",
    );
    expect(sql).toContain("INNER JOIN");
  });

  it("falls back to LEFT for an unknown joinType", () => {
    const sql = stepToSQL(
      step("join", {
        table: "other",
        leftKey: "id",
        rightKey: "id",
        joinType: "weird",
      }),
      "src",
    );
    expect(sql).toContain("LEFT JOIN");
  });

  it("reuses the left key as the right key when rightKey is absent", () => {
    const sql = stepToSQL(step("join", { table: "other", leftKey: "id" }), "src");
    expect(sql).toContain('ON t1."id" = t2."id"');
  });

  it("returns a passthrough SELECT when a join is missing required config", () => {
    expect(stepToSQL(step("join", { table: "other" }), "src")).toBe("SELECT * FROM src");
  });

  it("builds a DuckDB PIVOT with quoted ON column", () => {
    const sql = stepToSQL(step("pivot", { onColumn: "month", usingAgg: "SUM(amt)" }), "src");
    expect(sql).toBe('SELECT * FROM (PIVOT src ON "month" USING SUM(amt))');
  });

  it("adds a GROUP BY clause to a pivot when groupBy is provided", () => {
    const sql = stepToSQL(
      step("pivot", { onColumn: "month", usingAgg: "SUM(amt)", groupBy: "region" }),
      "src",
    );
    expect(sql).toBe('SELECT * FROM (PIVOT src ON "month" USING SUM(amt) GROUP BY region)');
  });

  it("defaults the pivot aggregation to COUNT(*)", () => {
    const sql = stepToSQL(step("pivot", { onColumn: "month" }), "src");
    expect(sql).toBe('SELECT * FROM (PIVOT src ON "month" USING COUNT(*))');
  });

  it("returns a passthrough SELECT when the pivot onColumn is missing", () => {
    expect(stepToSQL(step("pivot", {}), "src")).toBe("SELECT * FROM src");
  });

  it("returns a passthrough SELECT for an unknown step type", () => {
    const sql = stepToSQL(step("mystery" as unknown as TransformStep["type"]), "src");
    expect(sql).toBe("SELECT * FROM src");
  });
});

describe("buildCTE", () => {
  it("returns a plain SELECT over the quoted source when there are no steps", () => {
    const out = buildCTE([], "my table");
    expect(out.hasSteps).toBe(false);
    expect(out.sql).toBe('SELECT * FROM "my table"');
    expect(out.stepCtes).toEqual([]);
  });

  it("ignores disabled steps", () => {
    const out = buildCTE([step("deduplicate", {}, { id: "a", enabled: false })], "t");
    expect(out.hasSteps).toBe(false);
    expect(out.sql).toBe('SELECT * FROM "t"');
  });

  it("chains a single step off the quoted source table", () => {
    const out = buildCTE([step("filter", { condition: "x > 0" }, { id: "abc" })], "t");
    expect(out.hasSteps).toBe(true);
    expect(out.stepCtes).toEqual([{ id: "abc", name: "s_abc" }]);
    expect(out.sql).toContain('s_abc AS (\n  SELECT * FROM "t" WHERE x > 0\n)');
    expect(out.sql).toMatch(/SELECT \* FROM s_abc$/);
  });

  it("nests each step CTE off the previous one in order", () => {
    const out = buildCTE(
      [
        step("filter", { condition: "x > 0" }, { id: "one" }),
        step("limit", { count: 10 }, { id: "two" }),
      ],
      "t",
    );
    expect(out.stepCtes).toEqual([
      { id: "one", name: "s_one" },
      { id: "two", name: "s_two" },
    ]);
    // second CTE reads from the first CTE, not the base table.
    expect(out.sql).toContain("s_two AS (\n  SELECT * FROM s_one LIMIT 10\n)");
    expect(out.sql).toMatch(/SELECT \* FROM s_two$/);
  });

  it("normalizes unsafe characters in step ids into the CTE alias", () => {
    const out = buildCTE([step("deduplicate", {}, { id: "a-b.c 1" })], "t");
    expect(out.stepCtes[0].name).toBe("s_a_b_c_1");
  });
});

describe("buildCountQuery", () => {
  it("counts the source directly when there are no enabled steps", () => {
    const compiled = buildCTE([], "t");
    const q = buildCountQuery([], "t", compiled);
    expect(q).toBe(`SELECT '__source__' AS step_id, COUNT(*) AS n FROM "t"`);
  });

  it("emits a UNION ALL count for the source and every enabled step", () => {
    const steps = [
      step("filter", { condition: "x > 0" }, { id: "one" }),
      step("limit", { count: 5 }, { id: "two" }),
    ];
    const compiled = buildCTE(steps, "t");
    const q = buildCountQuery(steps, "t", compiled);

    expect(q).toContain(`SELECT '__source__' AS step_id, COUNT(*) AS n FROM "t"`);
    expect(q).toContain(`SELECT 'one' AS step_id, COUNT(*) AS n FROM s_one`);
    expect(q).toContain(`SELECT 'two' AS step_id, COUNT(*) AS n FROM s_two`);
    // 2 step counts + 1 source count = 3 SELECTs => 2 UNION ALLs.
    expect(q.match(/UNION ALL/g)).toHaveLength(2);
    expect(q.startsWith("WITH ")).toBe(true);
  });

  it("escapes single-quotes in the step id literal", () => {
    const steps = [step("deduplicate", {}, { id: "o'ne" })];
    const compiled = buildCTE(steps, "t");
    const q = buildCountQuery(steps, "t", compiled);
    expect(q).toContain(`SELECT 'o''ne' AS step_id`);
  });
});

describe("buildReadableSQL", () => {
  it("prefixes the compiled SQL with a commented header and trailing semicolon", () => {
    const out = buildReadableSQL([], "transactions", 12345);
    expect(out).toContain("-- Transform Pipeline");
    expect(out).toContain("-- Source: transactions (12,345 rows)");
    expect(out.trimEnd().endsWith(";")).toBe(true);
    expect(out).toContain('SELECT * FROM "transactions"');
  });

  it("includes the nested CTE for a pipeline with steps", () => {
    const out = buildReadableSQL([step("filter", { condition: "x > 0" }, { id: "one" })], "t", 10);
    expect(out).toContain("WITH s_one AS");
    expect(out).toContain("SELECT * FROM s_one;");
  });
});
