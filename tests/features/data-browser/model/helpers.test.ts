import { describe, expect, it } from "vitest";
import {
  buildSearchPredicate,
  buildWhereClause,
  composeWhereClause,
  formatCellValue,
  generateCountSQL,
  generateExportSQL,
  generateSQL,
  inferColType,
} from "@/features/data-browser/model/helpers";
import type {
  ColType,
  ColumnDef,
  FilterGroup,
  FilterRule,
  SortConfig,
} from "@/features/data-browser/model/types";

// ─── Test factories ──────────────────────────────────────────────────────────

function makeColumn(overrides: Partial<ColumnDef> = {}): ColumnDef {
  return {
    id: overrides.id ?? "c1",
    name: overrides.name ?? "col",
    type: overrides.type ?? "string",
    width: overrides.width ?? 100,
    visible: overrides.visible ?? true,
    pinned: overrides.pinned ?? null,
    sortable: overrides.sortable ?? true,
    filterable: overrides.filterable ?? true,
    dbType: overrides.dbType ?? "VARCHAR",
  };
}

function makeRule(overrides: Partial<FilterRule> = {}): FilterRule {
  return {
    id: overrides.id ?? "r1",
    column: overrides.column ?? "col",
    operator: overrides.operator ?? "eq",
    value: overrides.value ?? "x",
    value2: overrides.value2,
    active: overrides.active ?? true,
  };
}

function makeGroup(rules: FilterRule[], logic: "AND" | "OR" = "AND"): FilterGroup {
  return { id: "g1", logic, rules, name: "grp", saved: false };
}

// ─── inferColType ────────────────────────────────────────────────────────────

describe("inferColType", () => {
  it("infers boolean from a real boolean sample", () => {
    expect(inferColType("k", true)).toBe("boolean");
    expect(inferColType("k", false)).toBe("boolean");
  });

  it("infers number from numeric samples including 0, negatives, NaN and Infinity", () => {
    expect(inferColType("k", 42)).toBe("number");
    expect(inferColType("k", 0)).toBe("number");
    expect(inferColType("k", -1.5)).toBe("number");
    // typeof NaN === "number" and typeof Infinity === "number"
    expect(inferColType("k", Number.NaN)).toBe("number");
    expect(inferColType("k", Number.POSITIVE_INFINITY)).toBe("number");
  });

  it("detects email-shaped strings", () => {
    expect(inferColType("k", "user@example.com")).toBe("email");
    expect(inferColType("k", "a.b+c%d-e@sub-domain.io")).toBe("email");
  });

  it("does not classify a malformed email as email", () => {
    // single-letter TLD fails the {2,} requirement -> falls through to string
    expect(inferColType("k", "user@example.c")).toBe("string");
    // missing @ host
    expect(inferColType("k", "userexample.com")).toBe("string");
  });

  it("detects http and https URLs", () => {
    expect(inferColType("k", "http://x.com")).toBe("url");
    expect(inferColType("k", "https://x.com/path?q=1")).toBe("url");
  });

  it("does not treat ftp or scheme-less strings as url", () => {
    expect(inferColType("k", "ftp://x.com")).toBe("string");
    expect(inferColType("k", "www.x.com")).toBe("string");
  });

  it("detects ISO-like date strings by their leading yyyy-mm-dd prefix", () => {
    expect(inferColType("k", "2024-01-15")).toBe("date");
    // regex is anchored at start only, so trailing content still matches
    expect(inferColType("k", "2024-01-15T10:00:00Z")).toBe("date");
    expect(inferColType("k", "2024-01-15 anything")).toBe("date");
  });

  it("does not treat partial or wrongly-shaped dates as date", () => {
    expect(inferColType("k", "2024-1-5")).toBe("string");
    expect(inferColType("k", "24-01-15")).toBe("string");
  });

  it("returns string for plain text", () => {
    expect(inferColType("k", "hello world")).toBe("string");
    expect(inferColType("k", "")).toBe("string");
  });

  it("returns string for null, undefined, objects and arrays", () => {
    expect(inferColType("k", null)).toBe("string");
    expect(inferColType("k", undefined)).toBe("string");
    expect(inferColType("k", {})).toBe("string");
    expect(inferColType("k", [1, 2])).toBe("string");
  });

  it("ignores the column key argument entirely", () => {
    // The key is prefixed `_key` and unused; result depends only on the sample.
    expect(inferColType("email_address", 5)).toBe("number");
  });
});

// ─── formatCellValue ─────────────────────────────────────────────────────────

describe("formatCellValue", () => {
  it("returns empty string for null and undefined regardless of type", () => {
    expect(formatCellValue(null, "number")).toBe("");
    expect(formatCellValue(undefined, "string")).toBe("");
    expect(formatCellValue(null, "boolean")).toBe("");
  });

  it("formats numbers with grouping and max 2 fraction digits (en-US)", () => {
    expect(formatCellValue(1234567, "number")).toBe("1,234,567");
    expect(formatCellValue(1234.5, "number")).toBe("1,234.5");
    // rounds to 2 fraction digits
    expect(formatCellValue(1.23456, "number")).toBe("1.23");
  });

  it("formats zero and negative numbers", () => {
    expect(formatCellValue(0, "number")).toBe("0");
    expect(formatCellValue(-9999.99, "number")).toBe("-9,999.99");
  });

  it("does not Intl-format a numeric value when the column type is not number", () => {
    // type guard requires BOTH type==="number" AND typeof value==="number"
    expect(formatCellValue(1234567, "string")).toBe("1234567");
  });

  it("falls through to String() when type is number but value is a numeric string", () => {
    // typeof "1234" !== "number" so the Intl branch is skipped
    expect(formatCellValue("1234567", "number")).toBe("1234567");
  });

  it("renders boolean true-ish as a check and everything else as a cross", () => {
    expect(formatCellValue(true, "boolean")).toBe("✓");
    expect(formatCellValue(false, "boolean")).toBe("✗");
    // String("true") === "true"
    expect(formatCellValue("true", "boolean")).toBe("✓");
    // any other stringification is a cross
    expect(formatCellValue("True", "boolean")).toBe("✗");
    expect(formatCellValue(1, "boolean")).toBe("✗");
    expect(formatCellValue(0, "boolean")).toBe("✗");
  });

  it("stringifies date, email and url types verbatim", () => {
    expect(formatCellValue("2024-01-15", "date")).toBe("2024-01-15");
    expect(formatCellValue("a@b.com", "email")).toBe("a@b.com");
    expect(formatCellValue("http://x.com", "url")).toBe("http://x.com");
  });

  it("stringifies NaN and Infinity through Intl when type is number", () => {
    expect(formatCellValue(Number.NaN, "number")).toBe("NaN");
    expect(formatCellValue(Number.POSITIVE_INFINITY, "number")).toBe("∞");
  });
});

// ─── buildWhereClause ────────────────────────────────────────────────────────

describe("buildWhereClause", () => {
  it("returns empty string when there are no rules", () => {
    expect(buildWhereClause(makeGroup([]))).toBe("");
  });

  it("returns empty string when every rule is inactive", () => {
    const g = makeGroup([
      makeRule({ active: false }),
      makeRule({ id: "r2", active: false }),
    ]);
    expect(buildWhereClause(g)).toBe("");
  });

  it("skips inactive rules and keeps active ones", () => {
    const g = makeGroup([
      makeRule({ id: "r1", column: "a", operator: "eq", value: "1", active: false }),
      makeRule({ id: "r2", column: "b", operator: "eq", value: "2", active: true }),
    ]);
    expect(buildWhereClause(g)).toBe(`"b" = '2'`);
  });

  it("builds eq / neq with quoted literals", () => {
    expect(buildWhereClause(makeGroup([makeRule({ column: "a", operator: "eq", value: "x" })]))).toBe(
      `"a" = 'x'`,
    );
    expect(
      buildWhereClause(makeGroup([makeRule({ column: "a", operator: "neq", value: "x" })])),
    ).toBe(`"a" != 'x'`);
  });

  it("emits a genuine number unquoted for numeric comparisons", () => {
    expect(buildWhereClause(makeGroup([makeRule({ column: "a", operator: "gt", value: "5" })]))).toBe(
      `"a" > 5`,
    );
    expect(
      buildWhereClause(makeGroup([makeRule({ column: "a", operator: "gte", value: "5" })])),
    ).toBe(`"a" >= 5`);
    expect(buildWhereClause(makeGroup([makeRule({ column: "a", operator: "lt", value: "5" })]))).toBe(
      `"a" < 5`,
    );
    expect(
      buildWhereClause(makeGroup([makeRule({ column: "a", operator: "lte", value: "5" })])),
    ).toBe(`"a" <= 5`);
  });

  it("safely quotes a non-numeric comparison value (regression: no raw SQL injection)", () => {
    // An attacker-controlled / text value must never be interpolated raw.
    expect(
      buildWhereClause(makeGroup([makeRule({ column: "a", operator: "gt", value: "5 OR 1=1" })])),
    ).toBe(`"a" > '5 OR 1=1'`);
    // A date-string comparison is quoted (correct for text/date columns).
    expect(
      buildWhereClause(makeGroup([makeRule({ column: "a", operator: "gte", value: "2024-01-01" })])),
    ).toBe(`"a" >= '2024-01-01'`);
    // A single-quote in the value is doubled, not broken out of.
    expect(
      buildWhereClause(makeGroup([makeRule({ column: "a", operator: "lt", value: "o'brien" })])),
    ).toBe(`"a" < 'o''brien'`);
  });

  it("builds LIKE-based contains / not_contains / starts_with / ends_with", () => {
    expect(
      buildWhereClause(makeGroup([makeRule({ column: "a", operator: "contains", value: "x" })])),
    ).toBe(`"a" LIKE '%x%'`);
    expect(
      buildWhereClause(makeGroup([makeRule({ column: "a", operator: "not_contains", value: "x" })])),
    ).toBe(`"a" NOT LIKE '%x%'`);
    expect(
      buildWhereClause(makeGroup([makeRule({ column: "a", operator: "starts_with", value: "x" })])),
    ).toBe(`"a" LIKE 'x%'`);
    expect(
      buildWhereClause(makeGroup([makeRule({ column: "a", operator: "ends_with", value: "x" })])),
    ).toBe(`"a" LIKE '%x'`);
  });

  it("builds IS NULL and IS NOT NULL (value ignored)", () => {
    expect(
      buildWhereClause(makeGroup([makeRule({ column: "a", operator: "is_null", value: "ignored" })])),
    ).toBe(`"a" IS NULL`);
    expect(
      buildWhereClause(
        makeGroup([makeRule({ column: "a", operator: "is_not_null", value: "ignored" })]),
      ),
    ).toBe(`"a" IS NOT NULL`);
  });

  it("builds IN by splitting on commas, trimming, and quoting each element", () => {
    expect(
      buildWhereClause(makeGroup([makeRule({ column: "a", operator: "in", value: "1, 2 ,3" })])),
    ).toBe(`"a" IN ('1', '2', '3')`);
  });

  it("builds a single-element IN list when the value has no comma", () => {
    expect(
      buildWhereClause(makeGroup([makeRule({ column: "a", operator: "in", value: "only" })])),
    ).toBe(`"a" IN ('only')`);
  });

  it("builds BETWEEN using value and value2", () => {
    expect(
      buildWhereClause(
        makeGroup([makeRule({ column: "a", operator: "between", value: "1", value2: "10" })]),
      ),
    ).toBe(`"a" BETWEEN 1 AND 10`);
  });

  it("falls back to value for the upper bound when value2 is undefined", () => {
    expect(
      buildWhereClause(
        makeGroup([makeRule({ column: "a", operator: "between", value: "7", value2: undefined })]),
      ),
    ).toBe(`"a" BETWEEN 7 AND 7`);
  });

  it("falls back to value for the upper bound when value2 is an empty string (regression: no dangling BETWEEN)", () => {
    // Empty value2 must also fall back (not just null/undefined), else the clause
    // ends with a dangling `BETWEEN 7 AND ` that the engine rejects.
    expect(
      buildWhereClause(
        makeGroup([makeRule({ column: "a", operator: "between", value: "7", value2: "" })]),
      ),
    ).toBe(`"a" BETWEEN 7 AND 7`);
  });

  it("treats a value2 of '0' as a real upper bound (not nullish)", () => {
    expect(
      buildWhereClause(
        makeGroup([makeRule({ column: "a", operator: "between", value: "-5", value2: "0" })]),
      ),
    ).toBe(`"a" BETWEEN -5 AND 0`);
  });

  it("joins multiple active rules with the group's AND logic", () => {
    const g = makeGroup(
      [
        makeRule({ id: "r1", column: "a", operator: "eq", value: "1" }),
        makeRule({ id: "r2", column: "b", operator: "neq", value: "2" }),
      ],
      "AND",
    );
    expect(buildWhereClause(g)).toBe(`"a" = '1' AND "b" != '2'`);
  });

  it("joins multiple active rules with the group's OR logic", () => {
    const g = makeGroup(
      [
        makeRule({ id: "r1", column: "a", operator: "eq", value: "1" }),
        makeRule({ id: "r2", column: "b", operator: "eq", value: "2" }),
      ],
      "OR",
    );
    expect(buildWhereClause(g)).toBe(`"a" = '1' OR "b" = '2'`);
  });

  it("escapes embedded single quotes in literal values (SQL-safe quoting)", () => {
    expect(
      buildWhereClause(makeGroup([makeRule({ column: "a", operator: "eq", value: "O'Brien" })])),
    ).toBe(`"a" = 'O''Brien'`);
  });

  it("escapes embedded double quotes in column identifiers", () => {
    expect(
      buildWhereClause(makeGroup([makeRule({ column: 'we"ird', operator: "is_null", value: "" })])),
    ).toBe(`"we""ird" IS NULL`);
  });
});

// ─── buildSearchPredicate ────────────────────────────────────────────────────

describe("buildSearchPredicate", () => {
  it("returns empty string for an empty or whitespace-only term", () => {
    expect(buildSearchPredicate("", [makeColumn()])).toBe("");
    expect(buildSearchPredicate("   ", [makeColumn()])).toBe("");
  });

  it("returns empty string when there are no columns at all", () => {
    expect(buildSearchPredicate("abc", [])).toBe("");
  });

  it("targets only string/email/url columns and casts them to VARCHAR for ILIKE", () => {
    const cols = [
      makeColumn({ id: "1", name: "name", type: "string" }),
      makeColumn({ id: "2", name: "mail", type: "email" }),
      makeColumn({ id: "3", name: "site", type: "url" }),
      makeColumn({ id: "4", name: "age", type: "number" }),
      makeColumn({ id: "5", name: "born", type: "date" }),
      makeColumn({ id: "6", name: "ok", type: "boolean" }),
    ];
    expect(buildSearchPredicate("foo", cols)).toBe(
      `CAST("name" AS VARCHAR) ILIKE '%foo%' OR ` +
        `CAST("mail" AS VARCHAR) ILIKE '%foo%' OR ` +
        `CAST("site" AS VARCHAR) ILIKE '%foo%'`,
    );
  });

  it("falls back to ALL columns when none are obviously text-like", () => {
    const cols = [
      makeColumn({ id: "1", name: "age", type: "number" }),
      makeColumn({ id: "2", name: "born", type: "date" }),
    ];
    expect(buildSearchPredicate("foo", cols)).toBe(
      `CAST("age" AS VARCHAR) ILIKE '%foo%' OR CAST("born" AS VARCHAR) ILIKE '%foo%'`,
    );
  });

  it("trims the search term before wrapping it in wildcards", () => {
    expect(buildSearchPredicate("  bar  ", [makeColumn({ name: "n", type: "string" })])).toBe(
      `CAST("n" AS VARCHAR) ILIKE '%bar%'`,
    );
  });

  it("escapes single quotes in the search term", () => {
    expect(buildSearchPredicate("O'Hara", [makeColumn({ name: "n", type: "string" })])).toBe(
      `CAST("n" AS VARCHAR) ILIKE '%O''Hara%'`,
    );
  });

  it("escapes double quotes in column names", () => {
    expect(buildSearchPredicate("x", [makeColumn({ name: 'a"b', type: "string" })])).toBe(
      `CAST("a""b" AS VARCHAR) ILIKE '%x%'`,
    );
  });
});

// ─── composeWhereClause ──────────────────────────────────────────────────────

describe("composeWhereClause", () => {
  const stringCol = makeColumn({ name: "n", type: "string" });

  it("returns empty string when neither filter nor search produces a clause", () => {
    expect(composeWhereClause(makeGroup([]), "", [stringCol])).toBe("");
  });

  it("returns only the parenthesized filter when search is empty", () => {
    const g = makeGroup([makeRule({ column: "a", operator: "eq", value: "1" })]);
    expect(composeWhereClause(g, "", [stringCol])).toBe(`("a" = '1')`);
  });

  it("returns only the parenthesized search predicate when no filters are active", () => {
    expect(composeWhereClause(makeGroup([]), "foo", [stringCol])).toBe(
      `(CAST("n" AS VARCHAR) ILIKE '%foo%')`,
    );
  });

  it("ANDs the parenthesized filter and search together", () => {
    const g = makeGroup([makeRule({ column: "a", operator: "eq", value: "1" })]);
    expect(composeWhereClause(g, "foo", [stringCol])).toBe(
      `("a" = '1') AND (CAST("n" AS VARCHAR) ILIKE '%foo%')`,
    );
  });

  it("preserves the inner group OR logic while ANDing with search", () => {
    const g = makeGroup(
      [
        makeRule({ id: "r1", column: "a", operator: "eq", value: "1" }),
        makeRule({ id: "r2", column: "b", operator: "eq", value: "2" }),
      ],
      "OR",
    );
    expect(composeWhereClause(g, "foo", [stringCol])).toBe(
      `("a" = '1' OR "b" = '2') AND (CAST("n" AS VARCHAR) ILIKE '%foo%')`,
    );
  });
});

// ─── generateSQL (covers buildProjection + buildOrderBy) ──────────────────────

describe("generateSQL", () => {
  const visibleCols = [
    makeColumn({ id: "1", name: "a", visible: true }),
    makeColumn({ id: "2", name: "b", visible: true }),
  ];

  it("selects only visible columns, quotes the table, and appends LIMIT/OFFSET", () => {
    const sql = generateSQL("mytable", visibleCols, [], "", 50, 0);
    expect(sql).toBe(`SELECT "a", "b" FROM "mytable" LIMIT 50 OFFSET 0`);
  });

  it("projects * when no columns are visible", () => {
    const hidden = [makeColumn({ name: "a", visible: false })];
    const sql = generateSQL("t", hidden, [], "", 10, 0);
    expect(sql).toBe(`SELECT * FROM "t" LIMIT 10 OFFSET 0`);
  });

  it("omits the WHERE keyword when the clause is empty", () => {
    expect(generateSQL("t", visibleCols, [], "", 10, 0)).not.toContain("WHERE");
  });

  it("inserts the WHERE clause verbatim when provided", () => {
    const sql = generateSQL("t", visibleCols, [], `"a" = '1'`, 10, 5);
    expect(sql).toBe(`SELECT "a", "b" FROM "t" WHERE "a" = '1' LIMIT 10 OFFSET 5`);
  });

  it("builds ORDER BY ordered by ascending priority and uppercases the direction", () => {
    const sorts: SortConfig[] = [
      { column: "b", direction: "desc", priority: 2 },
      { column: "a", direction: "asc", priority: 1 },
    ];
    const sql = generateSQL("t", visibleCols, sorts, "", 10, 0);
    expect(sql).toBe(`SELECT "a", "b" FROM "t" ORDER BY "a" ASC, "b" DESC LIMIT 10 OFFSET 0`);
  });

  it("omits ORDER BY when there are no sorts", () => {
    expect(generateSQL("t", visibleCols, [], "", 10, 0)).not.toContain("ORDER BY");
  });

  it("does not mutate the caller's sorts array while ordering", () => {
    const sorts: SortConfig[] = [
      { column: "b", direction: "desc", priority: 2 },
      { column: "a", direction: "asc", priority: 1 },
    ];
    const snapshot = sorts.map((s) => ({ ...s }));
    generateSQL("t", visibleCols, sorts, "", 10, 0);
    expect(sorts).toEqual(snapshot);
  });

  it("quotes a table name containing a double quote", () => {
    const sql = generateSQL('tab"le', visibleCols, [], "", 1, 0);
    expect(sql).toContain(`FROM "tab""le"`);
  });

  it("emits the limit and offset even when they are zero or negative (characterization)", () => {
    expect(generateSQL("t", visibleCols, [], "", 0, 0)).toContain("LIMIT 0 OFFSET 0");
    expect(generateSQL("t", visibleCols, [], "", -1, -5)).toContain("LIMIT -1 OFFSET -5");
  });
});

// ─── generateCountSQL ────────────────────────────────────────────────────────

describe("generateCountSQL", () => {
  it("counts all rows with no WHERE when the clause is empty", () => {
    expect(generateCountSQL("t", "")).toBe(`SELECT COUNT(*) AS cnt FROM "t"`);
  });

  it("appends the WHERE clause when provided", () => {
    expect(generateCountSQL("t", `"a" = '1'`)).toBe(`SELECT COUNT(*) AS cnt FROM "t" WHERE "a" = '1'`);
  });

  it("quotes the table identifier", () => {
    expect(generateCountSQL('we"ird', "")).toBe(`SELECT COUNT(*) AS cnt FROM "we""ird"`);
  });
});

// ─── generateExportSQL ───────────────────────────────────────────────────────

describe("generateExportSQL", () => {
  const cols = [
    makeColumn({ id: "1", name: "a", visible: true }),
    makeColumn({ id: "2", name: "b", visible: false }),
  ];

  it("projects only visible columns and applies no LIMIT by default", () => {
    const sql = generateExportSQL("t", cols, [], "");
    expect(sql).toBe(`SELECT "a" FROM "t"`);
    expect(sql).not.toContain("LIMIT");
  });

  it("includes WHERE and ORDER BY when supplied", () => {
    const sorts: SortConfig[] = [{ column: "a", direction: "asc", priority: 1 }];
    const sql = generateExportSQL("t", cols, sorts, `"a" = '1'`);
    expect(sql).toBe(`SELECT "a" FROM "t" WHERE "a" = '1' ORDER BY "a" ASC`);
  });

  it("appends a positive hard limit", () => {
    const sql = generateExportSQL("t", cols, [], "", 1000);
    expect(sql).toBe(`SELECT "a" FROM "t" LIMIT 1000`);
  });

  it("ignores a zero or negative hard limit", () => {
    expect(generateExportSQL("t", cols, [], "", 0)).not.toContain("LIMIT");
    expect(generateExportSQL("t", cols, [], "", -10)).not.toContain("LIMIT");
  });

  it("ignores an undefined hard limit", () => {
    expect(generateExportSQL("t", cols, [], "", undefined)).not.toContain("LIMIT");
  });

  it("projects * when no column is visible for export", () => {
    const allHidden = [makeColumn({ name: "a", visible: false })];
    expect(generateExportSQL("t", allHidden, [], "")).toBe(`SELECT * FROM "t"`);
  });
});

// ─── ColType exhaustiveness guard ────────────────────────────────────────────

describe("ColType coverage sanity", () => {
  it("formatCellValue handles every ColType without throwing", () => {
    const types: ColType[] = ["string", "number", "date", "boolean", "email", "url"];
    for (const t of types) {
      expect(typeof formatCellValue("v", t)).toBe("string");
    }
  });
});
