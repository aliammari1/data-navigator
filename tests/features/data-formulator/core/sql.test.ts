import { describe, it, expect } from "vitest";
import type { ChartSpec, FilterDef, Encoding } from "@/features/data-formulator/core/types";
import { buildSQL } from "@/features/data-formulator/core/sql";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEncoding(overrides: Partial<Encoding>): Encoding {
  return {
    id: "e1",
    channel: "x",
    field: "amount",
    ...overrides,
  };
}

function makeFilter(overrides: Partial<FilterDef>): FilterDef {
  return {
    id: "f1",
    field: "amount",
    op: "=",
    value: "100",
    ...overrides,
  };
}

function makeSpec(overrides: Partial<ChartSpec> = {}): ChartSpec {
  return {
    id: "c1",
    type: "bar",
    encodings: [],
    filters: [],
    limit: 100,
    title: "Test",
    ...overrides,
  };
}

// ── quote() (tested indirectly via buildSQL) ──────────────────────────────────

describe("quote — derived map lookup", () => {
  it("uses the derived SQL expression when the field has a sql property", () => {
    const spec = makeSpec({
      encodings: [makeEncoding({ channel: "x", field: "derived_field" })],
    });
    const derived = [{ name: "derived_field", sql: "amount * 2" }];
    const sql = buildSQL(spec, "tx", derived);
    expect(sql).toContain("(amount * 2)");
  });

  it("quotes the field name when the derived entry has no sql property", () => {
    const spec = makeSpec({
      encodings: [makeEncoding({ channel: "x", field: "no_sql_field" })],
    });
    const derived = [{ name: "no_sql_field" }];
    const sql = buildSQL(spec, "tx", derived);
    expect(sql).toContain('"no_sql_field"');
  });

  it("quotes the field name when there is no derived entry at all", () => {
    const spec = makeSpec({
      encodings: [makeEncoding({ channel: "x", field: "plain_field" })],
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain('"plain_field"');
  });
});

// ── buildWhereClause() ────────────────────────────────────────────────────────

describe("buildWhereClause — filter operations", () => {
  it("returns a query without WHERE when filters array is empty", () => {
    const spec = makeSpec({
      encodings: [makeEncoding({ channel: "x", field: "amount" })],
      filters: [],
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).not.toContain("WHERE");
  });

  it("generates IS NULL for op IS NULL", () => {
    const spec = makeSpec({
      encodings: [makeEncoding({ channel: "x", field: "amount" })],
      filters: [makeFilter({ op: "IS NULL", value: "" })],
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain('"amount" IS NULL');
  });

  it("generates IS NOT NULL for op NOT NULL", () => {
    const spec = makeSpec({
      encodings: [makeEncoding({ channel: "x", field: "amount" })],
      filters: [makeFilter({ op: "NOT NULL", value: "" })],
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain('"amount" IS NOT NULL');
  });

  it("generates IN clause for op IN with comma-separated values", () => {
    const spec = makeSpec({
      encodings: [makeEncoding({ channel: "x", field: "channel" })],
      filters: [makeFilter({ field: "channel", op: "IN", value: "USSD, APP, WEB" })],
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain('"channel" IN (\'USSD\',\'APP\',\'WEB\')');
  });

  it("escapes single quotes in IN values", () => {
    const spec = makeSpec({
      encodings: [makeEncoding({ channel: "x", field: "name" })],
      filters: [makeFilter({ field: "name", op: "IN", value: "O'Brien, Smith" })],
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain("''Brien");
  });

  it("generates BETWEEN clause for op BETWEEN", () => {
    const spec = makeSpec({
      encodings: [makeEncoding({ channel: "x", field: "amount" })],
      filters: [makeFilter({ op: "BETWEEN", value: "10, 100" })],
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain('TRY_CAST("amount" AS DOUBLE) BETWEEN 10 AND 100');
  });

  it("generates LIKE clause for op LIKE", () => {
    const spec = makeSpec({
      encodings: [makeEncoding({ channel: "x", field: "name" })],
      filters: [makeFilter({ field: "name", op: "LIKE", value: "%foo%" })],
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain('CAST("name" AS VARCHAR) LIKE \'%foo%\'');
  });

  it("escapes single quotes in LIKE values", () => {
    const spec = makeSpec({
      encodings: [makeEncoding({ channel: "x", field: "name" })],
      filters: [makeFilter({ field: "name", op: "LIKE", value: "%O'Brien%" })],
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain("LIKE '%O''Brien%'");
  });

  it("uses TRY_CAST comparison when value is numeric", () => {
    const spec = makeSpec({
      encodings: [makeEncoding({ channel: "x", field: "amount" })],
      filters: [makeFilter({ op: ">", value: "42" })],
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain('TRY_CAST("amount" AS DOUBLE) > 42');
  });

  it("uses TRY_CAST comparison for negative numeric values", () => {
    const spec = makeSpec({
      encodings: [makeEncoding({ channel: "x", field: "amount" })],
      filters: [makeFilter({ op: "<", value: "-5.5" })],
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain('TRY_CAST("amount" AS DOUBLE) < -5.5');
  });

  it("uses CAST to VARCHAR comparison when value is a string", () => {
    const spec = makeSpec({
      encodings: [makeEncoding({ channel: "x", field: "channel" })],
      filters: [makeFilter({ field: "channel", op: "=", value: "USSD" })],
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain("CAST(\"channel\" AS VARCHAR) = 'USSD'");
  });

  it("escapes single quotes in string comparison values", () => {
    const spec = makeSpec({
      encodings: [makeEncoding({ channel: "x", field: "name" })],
      filters: [makeFilter({ field: "name", op: "=", value: "O'Brien" })],
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain("= 'O''Brien'");
  });

  it("joins multiple filters with AND", () => {
    const spec = makeSpec({
      encodings: [makeEncoding({ channel: "x", field: "amount" })],
      filters: [
        makeFilter({ op: ">", value: "10" }),
        makeFilter({ op: "<", value: "100" }),
      ],
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain(" AND ");
  });

  it("uses derived SQL expression in filter WHERE clause", () => {
    const spec = makeSpec({
      encodings: [makeEncoding({ channel: "x", field: "amount" })],
      filters: [makeFilter({ field: "derived_field", op: ">", value: "5" })],
    });
    const derived = [{ name: "derived_field", sql: "amount * 2" }];
    const sql = buildSQL(spec, "tx", derived);
    expect(sql).toContain("TRY_CAST((amount * 2) AS DOUBLE) > 5");
  });
});

// ── buildAgg() ────────────────────────────────────────────────────────────────

describe("buildAgg — aggregation expressions", () => {
  it("uses TRY_CAST with no aggregate function when agg is undefined", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "dim" }),
        makeEncoding({ id: "e2", channel: "y", field: "amount", aggregate: undefined }),
      ],
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain('TRY_CAST("amount" AS DOUBLE) as y_val');
  });

  it("uses TRY_CAST with no aggregate function when agg is none", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "dim" }),
        makeEncoding({ id: "e2", channel: "y", field: "amount", aggregate: "none" }),
      ],
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain('TRY_CAST("amount" AS DOUBLE) as y_val');
  });

  it("uses COUNT() for agg count", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "dim" }),
        makeEncoding({ id: "e2", channel: "y", field: "amount", aggregate: "count" }),
      ],
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain('COUNT("amount") as y_val');
  });

  it("uses COUNT(DISTINCT) for agg distinct", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "dim" }),
        makeEncoding({ id: "e2", channel: "y", field: "amount", aggregate: "distinct" }),
      ],
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain('COUNT(DISTINCT "amount") as y_val');
  });

  it("uses MEDIAN(TRY_CAST(...)) for agg median", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "dim" }),
        makeEncoding({ id: "e2", channel: "y", field: "amount", aggregate: "median" }),
      ],
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain('MEDIAN(TRY_CAST("amount" AS DOUBLE)) as y_val');
  });

  it("uses uppercase aggregate name with TRY_CAST for sum", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "dim" }),
        makeEncoding({ id: "e2", channel: "y", field: "amount", aggregate: "sum" }),
      ],
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain('SUM(TRY_CAST("amount" AS DOUBLE)) as y_val');
  });

  it("uses uppercase aggregate name with TRY_CAST for avg", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "dim" }),
        makeEncoding({ id: "e2", channel: "y", field: "amount", aggregate: "avg" }),
      ],
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain('AVG(TRY_CAST("amount" AS DOUBLE)) as y_val');
  });

  it("uses uppercase aggregate name with TRY_CAST for min", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "dim" }),
        makeEncoding({ id: "e2", channel: "y", field: "amount", aggregate: "min" }),
      ],
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain('MIN(TRY_CAST("amount" AS DOUBLE)) as y_val');
  });

  it("uses uppercase aggregate name with TRY_CAST for max", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "dim" }),
        makeEncoding({ id: "e2", channel: "y", field: "amount", aggregate: "max" }),
      ],
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain('MAX(TRY_CAST("amount" AS DOUBLE)) as y_val');
  });
});

// ── buildSQL() — histogram path ───────────────────────────────────────────────

describe("buildSQL — histogram (bin + count)", () => {
  it("builds a WIDTH_BUCKET histogram query when xEnc has bin=true and aggregate=count", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "amount", bin: true, aggregate: "count" }),
      ],
      limit: 50,
    });
    const sql = buildSQL(spec, "my_table");
    expect(sql).toContain("WIDTH_BUCKET");
    expect(sql).toContain('"my_table"');
    expect(sql).toContain("COUNT(*) as y_val");
    expect(sql).toContain("GROUP BY x_val ORDER BY x_val LIMIT 50");
  });

  it("includes WHERE clause in histogram query when filters are present", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "amount", bin: true, aggregate: "count" }),
      ],
      filters: [makeFilter({ op: ">", value: "0" })],
      limit: 30,
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain("WHERE");
    expect(sql).toContain("AND");
    expect(sql).toContain("IS NOT NULL");
  });

  it("omits WHERE keyword when histogram has no filters (uses plain WHERE)", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "amount", bin: true, aggregate: "count" }),
      ],
      filters: [],
      limit: 30,
    });
    const sql = buildSQL(spec, "tx");
    // Without filters the template uses the else branch: just "WHERE"
    expect(sql).toContain("WHERE");
    expect(sql).toContain("IS NOT NULL");
  });

  it("uses derived SQL expression for the bin field in histogram", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "derived_amt", bin: true, aggregate: "count" }),
      ],
      limit: 10,
    });
    const derived = [{ name: "derived_amt", sql: "amount * 2" }];
    const sql = buildSQL(spec, "tx", derived);
    expect(sql).toContain("(amount * 2)");
    expect(sql).toContain("WIDTH_BUCKET");
  });

  it("does NOT enter histogram path when bin=true but aggregate is not count", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "amount", bin: true, aggregate: "sum" }),
      ],
      limit: 20,
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).not.toContain("WIDTH_BUCKET");
  });

  it("does NOT enter histogram path when aggregate=count but bin is not set", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "amount", bin: false, aggregate: "count" }),
      ],
      limit: 20,
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).not.toContain("WIDTH_BUCKET");
  });
});

// ── buildSQL() — main SELECT path ────────────────────────────────────────────

describe("buildSQL — main select path", () => {
  it("returns SELECT * when no encodings produce select parts", () => {
    const spec = makeSpec({
      encodings: [],
      limit: 20,
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toBe('SELECT * FROM "tx" LIMIT 20');
  });

  it("uses topN instead of limit when topN is provided", () => {
    const spec = makeSpec({
      encodings: [makeEncoding({ channel: "x", field: "amount" })],
      limit: 100,
      topN: 5,
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain("LIMIT 5");
    expect(sql).not.toContain("LIMIT 100");
  });

  it("uses limit when topN is not provided", () => {
    const spec = makeSpec({
      encodings: [makeEncoding({ channel: "x", field: "amount" })],
      limit: 50,
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain("LIMIT 50");
  });

  it("includes x encoding as x_val", () => {
    const spec = makeSpec({
      encodings: [makeEncoding({ channel: "x", field: "channel" })],
      limit: 10,
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain('"channel" as x_val');
  });

  it("includes y encoding as y_val", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "dim" }),
        makeEncoding({ id: "e2", channel: "y", field: "amount" }),
      ],
      limit: 10,
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain("as y_val");
  });

  it("includes color encoding as color_val", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "dim" }),
        makeEncoding({ id: "e2", channel: "color", field: "category" }),
      ],
      limit: 10,
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain('"category" as color_val');
  });

  it("includes size encoding as size_val", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "dim" }),
        makeEncoding({ id: "e2", channel: "size", field: "amount" }),
      ],
      limit: 10,
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain("as size_val");
  });

  it("omits x from query when no x encoding is present", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ id: "e2", channel: "y", field: "amount" }),
      ],
      limit: 10,
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).not.toContain("x_val");
    expect(sql).toContain("y_val");
  });

  it("omits y from query when no y encoding is present", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "dim" }),
      ],
      limit: 10,
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).not.toContain("y_val");
    expect(sql).toContain("x_val");
  });

  it("omits color from query when no color encoding is present", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "dim" }),
      ],
      limit: 10,
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).not.toContain("color_val");
  });

  it("omits size from query when no size encoding is present", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "dim" }),
      ],
      limit: 10,
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).not.toContain("size_val");
  });

  it("adds WHERE clause when filters are present", () => {
    const spec = makeSpec({
      encodings: [makeEncoding({ channel: "x", field: "amount" })],
      filters: [makeFilter({ op: ">", value: "10" })],
      limit: 10,
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain("WHERE");
  });

  it("omits WHERE clause when filters are empty", () => {
    const spec = makeSpec({
      encodings: [makeEncoding({ channel: "x", field: "amount" })],
      filters: [],
      limit: 10,
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).not.toContain("WHERE");
  });

  it("adds GROUP BY when hasAgg is true and there are x encodings", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "channel" }),
        makeEncoding({ id: "e2", channel: "y", field: "amount", aggregate: "sum" }),
      ],
      limit: 10,
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain('"channel"');
  });

  it("adds GROUP BY including color when hasAgg is true and color encoding is present", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "channel" }),
        makeEncoding({ id: "e2", channel: "y", field: "amount", aggregate: "sum" }),
        makeEncoding({ id: "e3", channel: "color", field: "region" }),
      ],
      limit: 10,
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain('"region"');
  });

  it("does NOT add GROUP BY when hasAgg is false", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "channel" }),
        makeEncoding({ id: "e2", channel: "y", field: "amount" }),
      ],
      limit: 10,
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).not.toContain("GROUP BY");
  });

  it("does NOT add color to GROUP BY when hasAgg is false", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "channel" }),
        makeEncoding({ id: "e3", channel: "color", field: "region" }),
      ],
      limit: 10,
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).not.toContain("GROUP BY");
    expect(sql).toContain('"region" as color_val');
  });
});

// ── buildSQL() — ORDER BY ─────────────────────────────────────────────────────

describe("buildSQL — ORDER BY", () => {
  it("orders DESC when sortEnc.sort is desc", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "channel" }),
        makeEncoding({ id: "e2", channel: "y", field: "amount", aggregate: "sum", sort: "desc" }),
      ],
      limit: 10,
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain("ORDER BY y_val DESC");
  });

  it("orders ASC when sortEnc.sort is asc", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "channel" }),
        makeEncoding({ id: "e2", channel: "y", field: "amount", aggregate: "sum", sort: "asc" }),
      ],
      limit: 10,
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain("ORDER BY y_val ASC");
  });

  it("orders DESC by default when hasAgg is true and yEnc exists (no explicit sort)", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "channel" }),
        makeEncoding({ id: "e2", channel: "y", field: "amount", aggregate: "sum" }),
      ],
      limit: 10,
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain("ORDER BY y_val DESC");
  });

  it("does NOT add ORDER BY when no sort encoding and no hasAgg+yEnc condition", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "channel" }),
      ],
      limit: 10,
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).not.toContain("ORDER BY");
  });

  it("does NOT add ORDER BY when hasAgg is true but yEnc is absent", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "channel" }),
        makeEncoding({ id: "e2", channel: "color", field: "region", aggregate: "count" }),
      ],
      limit: 10,
    });
    const sql = buildSQL(spec, "tx");
    // hasAgg is true (color has count) but yEnc is absent, so no ORDER BY y_val DESC
    expect(sql).not.toContain("ORDER BY y_val DESC");
  });

  it("skips sort encoding with sort=none and falls back to hasAgg+yEnc default", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "channel" }),
        makeEncoding({ id: "e2", channel: "y", field: "amount", aggregate: "sum", sort: "none" }),
      ],
      limit: 10,
    });
    const sql = buildSQL(spec, "tx");
    // sort="none" means sortEnc won't be found (encodings.find(e => e.sort && e.sort !== "none"))
    // but hasAgg=true and yEnc exists → ORDER BY y_val DESC
    expect(sql).toContain("ORDER BY y_val DESC");
  });
});

// ── buildSQL() — derived expressions end-to-end ──────────────────────────────

describe("buildSQL — derived expressions", () => {
  it("uses derived SQL in x_val", () => {
    const spec = makeSpec({
      encodings: [makeEncoding({ channel: "x", field: "my_derived" })],
      limit: 10,
    });
    const derived = [{ name: "my_derived", sql: "col_a + col_b" }];
    const sql = buildSQL(spec, "tx", derived);
    expect(sql).toContain("(col_a + col_b) as x_val");
  });

  it("uses derived SQL in aggregation (y_val)", () => {
    const spec = makeSpec({
      encodings: [
        makeEncoding({ channel: "x", field: "dim" }),
        makeEncoding({ id: "e2", channel: "y", field: "my_derived", aggregate: "sum" }),
      ],
      limit: 10,
    });
    const derived = [{ name: "my_derived", sql: "price * qty" }];
    const sql = buildSQL(spec, "tx", derived);
    expect(sql).toContain("SUM(TRY_CAST((price * qty) AS DOUBLE)) as y_val");
  });

  it("defaults derived to empty array when not provided", () => {
    const spec = makeSpec({
      encodings: [makeEncoding({ channel: "x", field: "amount" })],
      limit: 10,
    });
    const sql = buildSQL(spec, "tx");
    expect(sql).toContain('"amount" as x_val');
  });
});

// ── buildSQL() — table name quoting ──────────────────────────────────────────

describe("buildSQL — table name", () => {
  it("quotes the table name in double quotes", () => {
    const spec = makeSpec({
      encodings: [makeEncoding({ channel: "x", field: "col" })],
      limit: 10,
    });
    const sql = buildSQL(spec, "my table");
    expect(sql).toContain('"my table"');
  });

  it("SELECT * also quotes the table name", () => {
    const spec = makeSpec({ encodings: [], limit: 10 });
    const sql = buildSQL(spec, "special_table");
    expect(sql).toBe('SELECT * FROM "special_table" LIMIT 10');
  });
});
