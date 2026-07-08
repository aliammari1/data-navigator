import { describe, it, expect } from "vitest";

/**
 * Unit tests for the pure SQL builder functions and coercion helpers in
 * src/features/analytics-theater/lib/queries.ts.
 *
 * All functions are pure — no IO, no DOM, no external services — so we keep
 * the real implementations intact and exercise every branch directly.
 *
 * Conventions:
 * - Arrange / Act / Assert with brief comments.
 * - Descriptive it() names that state the expected behaviour.
 * - ColumnRoles fixtures use null for unset roles.
 */

import {
  buildCalendarSql,
  buildRaceSql,
  buildSankeySql,
  buildGanttSql,
  buildWordCloudSql,
  buildSunburstSql,
  asStr,
  asNum,
  type SceneSql,
} from "@/features/analytics-theater/lib/queries";
import type { ColumnRoles } from "@/features/analytics-theater/lib/columns";

// ─── ColumnRoles fixture helpers ──────────────────────────────────────────────

function col(name: string) {
  return { name, type: "string" as const, distinctCount: 5 };
}

function numCol(name: string) {
  return { name, type: "number" as const, distinctCount: 100 };
}

/** Empty roles — every role set to null / empty arrays. */
const EMPTY_ROLES: ColumnRoles = {
  date: null,
  measure: null,
  category: null,
  category2: null,
  text: null,
  numeric: [],
  strings: [],
};

// ─── buildCalendarSql ─────────────────────────────────────────────────────────

describe("buildCalendarSql", () => {
  it("returns null when no date role is present", () => {
    // Act
    const result = buildCalendarSql("my_view", EMPTY_ROLES);

    // Assert
    expect(result).toBeNull();
  });

  it("returns a SceneSql with COUNT(*) measure when no measure column is assigned", () => {
    // Arrange
    const roles: ColumnRoles = { ...EMPTY_ROLES, date: col("transaction_date") };

    // Act
    const result = buildCalendarSql("sales_view", roles) as SceneSql;

    // Assert
    expect(result).not.toBeNull();
    expect(result.sql).toContain("COUNT(*)");
    expect(result.sql).toContain("AS v");
    expect(result.note).toContain("transaction_date");
    expect(result.note).toContain("Daily row count");
  });

  it("uses SUM of the measure column when a measure is provided", () => {
    // Arrange
    const roles: ColumnRoles = {
      ...EMPTY_ROLES,
      date: col("call_date"),
      measure: numCol("revenue"),
    };

    // Act
    const result = buildCalendarSql("telecom_view", roles) as SceneSql;

    // Assert
    expect(result.sql).toContain('SUM("revenue")');
    expect(result.note).toContain("SUM(revenue)");
    expect(result.note).toContain("call_date");
  });

  it("quotes the view name and date column name correctly", () => {
    // Arrange
    const roles: ColumnRoles = { ...EMPTY_ROLES, date: col("order date") };

    // Act
    const result = buildCalendarSql("my view", roles) as SceneSql;

    // Assert — view name and column name should be double-quoted.
    expect(result.sql).toContain('"my view"');
    expect(result.sql).toContain('"order date"');
  });

  it("wraps the date column in TRY_CAST(... AS DATE)", () => {
    // Arrange
    const roles: ColumnRoles = { ...EMPTY_ROLES, date: col("dt") };

    // Act
    const result = buildCalendarSql("v", roles) as SceneSql;

    // Assert
    expect(result.sql).toContain('TRY_CAST("dt" AS DATE)');
  });

  it("filters out null dates with WHERE d IS NOT NULL", () => {
    // Arrange
    const roles: ColumnRoles = { ...EMPTY_ROLES, date: col("dt") };

    // Act
    const result = buildCalendarSql("v", roles) as SceneSql;

    // Assert
    expect(result.sql).toContain("WHERE");
    expect(result.sql).toContain("IS NOT NULL");
  });

  it("groups by 1 and orders by 1 for a proper time series", () => {
    // Arrange
    const roles: ColumnRoles = { ...EMPTY_ROLES, date: col("dt") };

    // Act
    const result = buildCalendarSql("v", roles) as SceneSql;

    // Assert
    expect(result.sql).toContain("GROUP BY 1");
    expect(result.sql).toContain("ORDER BY 1");
  });

  it("escapes double-quotes in column names", () => {
    // Arrange — column name contains a double-quote character.
    const roles: ColumnRoles = { ...EMPTY_ROLES, date: col('col"name') };

    // Act
    const result = buildCalendarSql("v", roles) as SceneSql;

    // Assert — quoteIdent doubles inner quotes.
    expect(result.sql).toContain('"col""name"');
  });
});

// ─── buildRaceSql ─────────────────────────────────────────────────────────────

describe("buildRaceSql", () => {
  it("returns null when date role is missing", () => {
    // Arrange
    const roles: ColumnRoles = { ...EMPTY_ROLES, category: col("channel") };

    // Act
    expect(buildRaceSql("v", roles)).toBeNull();
  });

  it("returns null when category role is missing", () => {
    // Arrange
    const roles: ColumnRoles = { ...EMPTY_ROLES, date: col("dt") };

    // Act
    expect(buildRaceSql("v", roles)).toBeNull();
  });

  it("returns null when both date and category are missing", () => {
    // Act
    expect(buildRaceSql("v", EMPTY_ROLES)).toBeNull();
  });

  it("builds a valid CTE-based query when date and category are present (no measure)", () => {
    // Arrange
    const roles: ColumnRoles = {
      ...EMPTY_ROLES,
      date: col("call_date"),
      category: col("channel"),
    };

    // Act
    const result = buildRaceSql("txn_view", roles) as SceneSql;

    // Assert
    expect(result).not.toBeNull();
    expect(result.sql).toContain("WITH ranked AS");
    expect(result.sql).toContain("COUNT(*)");
    expect(result.sql).toContain("LIMIT 12"); // MAX_CATEGORIES constant
    expect(result.note).toContain("count");
    expect(result.note).toContain("channel");
  });

  it("uses SUM of measure when a measure column is provided", () => {
    // Arrange
    const roles: ColumnRoles = {
      ...EMPTY_ROLES,
      date: col("dt"),
      category: col("region"),
      measure: numCol("amount"),
    };

    // Act
    const result = buildRaceSql("v", roles) as SceneSql;

    // Assert
    expect(result.sql).toContain('SUM("amount")');
    expect(result.note).toContain("SUM(amount)");
    expect(result.note).toContain("top 12");
  });

  it("restricts to top-N categories via the ranked CTE and IN subquery", () => {
    // Arrange
    const roles: ColumnRoles = {
      ...EMPTY_ROLES,
      date: col("dt"),
      category: col("cat"),
    };

    // Act
    const result = buildRaceSql("v", roles) as SceneSql;

    // Assert — the outer SELECT must filter by the ranked CTE.
    expect(result.sql).toContain("IN (SELECT cat FROM ranked)");
  });

  it("groups and orders by date then category", () => {
    // Arrange
    const roles: ColumnRoles = {
      ...EMPTY_ROLES,
      date: col("dt"),
      category: col("cat"),
    };

    // Act
    const result = buildRaceSql("v", roles) as SceneSql;

    // Assert
    expect(result.sql).toContain("GROUP BY 1, 2");
    expect(result.sql).toContain("ORDER BY 1, 2");
  });

  it("quotes view name with spaces correctly", () => {
    // Arrange
    const roles: ColumnRoles = {
      ...EMPTY_ROLES,
      date: col("dt"),
      category: col("cat"),
    };

    // Act
    const result = buildRaceSql("my data view", roles) as SceneSql;

    // Assert
    expect(result.sql).toContain('"my data view"');
  });
});

// ─── buildSankeySql ───────────────────────────────────────────────────────────

describe("buildSankeySql", () => {
  it("returns null when category role is missing", () => {
    // Arrange
    const roles: ColumnRoles = { ...EMPTY_ROLES, category2: col("dest") };

    // Act
    expect(buildSankeySql("v", roles)).toBeNull();
  });

  it("returns null when category2 role is missing", () => {
    // Arrange
    const roles: ColumnRoles = { ...EMPTY_ROLES, category: col("src") };

    // Act
    expect(buildSankeySql("v", roles)).toBeNull();
  });

  it("returns null when both category and category2 are absent", () => {
    // Act
    expect(buildSankeySql("v", EMPTY_ROLES)).toBeNull();
  });

  it("builds a flow query with COUNT(*) when no measure is present", () => {
    // Arrange
    const roles: ColumnRoles = {
      ...EMPTY_ROLES,
      category: col("source_channel"),
      category2: col("destination_channel"),
    };

    // Act
    const result = buildSankeySql("flow_view", roles) as SceneSql;

    // Assert
    expect(result).not.toBeNull();
    expect(result.sql).toContain("COUNT(*)");
    expect(result.sql).toContain("AS src");
    expect(result.sql).toContain("AS tgt");
    expect(result.sql).toContain("AS v");
    expect(result.note).toContain("source_channel");
    expect(result.note).toContain("destination_channel");
    expect(result.note).toContain("count");
  });

  it("uses SUM of measure when a measure column is provided", () => {
    // Arrange
    const roles: ColumnRoles = {
      ...EMPTY_ROLES,
      category: col("from"),
      category2: col("to"),
      measure: numCol("volume"),
    };

    // Act
    const result = buildSankeySql("v", roles) as SceneSql;

    // Assert
    expect(result.sql).toContain('SUM("volume")');
    expect(result.note).toContain("SUM(volume)");
  });

  it("includes HAVING to filter zero-valued flows", () => {
    // Arrange
    const roles: ColumnRoles = {
      ...EMPTY_ROLES,
      category: col("a"),
      category2: col("b"),
    };

    // Act
    const result = buildSankeySql("v", roles) as SceneSql;

    // Assert
    expect(result.sql).toContain("HAVING");
    expect(result.sql).toContain("> 0");
  });

  it("orders by value descending and caps at 200 rows", () => {
    // Arrange
    const roles: ColumnRoles = {
      ...EMPTY_ROLES,
      category: col("a"),
      category2: col("b"),
    };

    // Act
    const result = buildSankeySql("v", roles) as SceneSql;

    // Assert
    expect(result.sql).toContain("ORDER BY v DESC");
    expect(result.sql).toContain("LIMIT 200");
  });

  it("filters rows where either column is NULL", () => {
    // Arrange
    const roles: ColumnRoles = {
      ...EMPTY_ROLES,
      category: col("a"),
      category2: col("b"),
    };

    // Act
    const result = buildSankeySql("v", roles) as SceneSql;

    // Assert — WHERE clause must guard both columns.
    expect(result.sql).toContain("IS NOT NULL AND");
    expect(result.sql).toContain("IS NOT NULL");
  });
});

// ─── buildGanttSql ────────────────────────────────────────────────────────────

describe("buildGanttSql", () => {
  it("returns null when date role is missing", () => {
    // Arrange
    const roles: ColumnRoles = { ...EMPTY_ROLES, category: col("cat") };

    // Act
    expect(buildGanttSql("v", roles)).toBeNull();
  });

  it("returns null when category role is missing", () => {
    // Arrange
    const roles: ColumnRoles = { ...EMPTY_ROLES, date: col("dt") };

    // Act
    expect(buildGanttSql("v", roles)).toBeNull();
  });

  it("returns null when both date and category are missing", () => {
    // Act
    expect(buildGanttSql("v", EMPTY_ROLES)).toBeNull();
  });

  it("builds a CTE that restricts to top 10 categories (no measure)", () => {
    // Arrange
    const roles: ColumnRoles = {
      ...EMPTY_ROLES,
      date: col("call_ts"),
      category: col("operator"),
    };

    // Act
    const result = buildGanttSql("calls_view", roles) as SceneSql;

    // Assert
    expect(result).not.toBeNull();
    expect(result.sql).toContain("WITH top_cat AS");
    expect(result.sql).toContain("LIMIT 10");
    expect(result.sql).toContain("COUNT(*)");
    expect(result.note).toContain("operator");
    expect(result.note).toContain("count");
  });

  it("uses SUM of measure when a measure column is provided", () => {
    // Arrange
    const roles: ColumnRoles = {
      ...EMPTY_ROLES,
      date: col("ts"),
      category: col("cat"),
      measure: numCol("cost"),
    };

    // Act
    const result = buildGanttSql("v", roles) as SceneSql;

    // Assert
    expect(result.sql).toContain('SUM("cost")');
    expect(result.note).toContain("SUM(cost)");
  });

  it("casts the date column to TIMESTAMP (not DATE) to extract the hour", () => {
    // Arrange
    const roles: ColumnRoles = {
      ...EMPTY_ROLES,
      date: col("ts"),
      category: col("cat"),
    };

    // Act
    const result = buildGanttSql("v", roles) as SceneSql;

    // Assert
    expect(result.sql).toContain('TRY_CAST("ts" AS TIMESTAMP)');
    expect(result.sql).toContain("EXTRACT(HOUR FROM");
  });

  it("groups and orders by category then hour (1, 2)", () => {
    // Arrange
    const roles: ColumnRoles = {
      ...EMPTY_ROLES,
      date: col("ts"),
      category: col("cat"),
    };

    // Act
    const result = buildGanttSql("v", roles) as SceneSql;

    // Assert
    expect(result.sql).toContain("GROUP BY 1, 2");
    expect(result.sql).toContain("ORDER BY 1, 2");
  });
});

// ─── buildWordCloudSql ────────────────────────────────────────────────────────

describe("buildWordCloudSql", () => {
  it("returns null when text role is missing", () => {
    // Act
    expect(buildWordCloudSql("v", EMPTY_ROLES)).toBeNull();
  });

  it("builds a tokenisation query using regexp_split_to_array", () => {
    // Arrange
    const roles: ColumnRoles = { ...EMPTY_ROLES, text: col("remarks") };

    // Act
    const result = buildWordCloudSql("comments_view", roles) as SceneSql;

    // Assert
    expect(result).not.toBeNull();
    expect(result.sql).toContain("regexp_split_to_array");
    expect(result.sql).toContain("WITH tokens AS");
    expect(result.note).toContain("remarks");
  });

  it("lowercases and trims tokens using lower(trim(regexp_replace(...)))", () => {
    // Arrange
    const roles: ColumnRoles = { ...EMPTY_ROLES, text: col("note") };

    // Act
    const result = buildWordCloudSql("v", roles) as SceneSql;

    // Assert
    expect(result.sql).toContain("lower(trim(regexp_replace(");
  });

  it("filters tokens shorter than 3 characters", () => {
    // Arrange
    const roles: ColumnRoles = { ...EMPTY_ROLES, text: col("note") };

    // Act
    const result = buildWordCloudSql("v", roles) as SceneSql;

    // Assert
    expect(result.sql).toContain("length(word) >= 3");
  });

  it("excludes common English and French stop-words", () => {
    // Arrange
    const roles: ColumnRoles = { ...EMPTY_ROLES, text: col("description") };

    // Act
    const result = buildWordCloudSql("v", roles) as SceneSql;

    // Assert — spot-check a few stop-words from the hard-coded list.
    expect(result.sql).toContain("'the'");
    expect(result.sql).toContain("'les'");
    expect(result.sql).toContain("'pour'");
  });

  it("orders by count descending and limits to 80 words", () => {
    // Arrange
    const roles: ColumnRoles = { ...EMPTY_ROLES, text: col("msg") };

    // Act
    const result = buildWordCloudSql("v", roles) as SceneSql;

    // Assert
    expect(result.sql).toContain("ORDER BY count DESC");
    expect(result.sql).toContain("LIMIT 80");
  });

  it("quotes the text column name in the generated SQL", () => {
    // Arrange
    const roles: ColumnRoles = { ...EMPTY_ROLES, text: col("free text col") };

    // Act
    const result = buildWordCloudSql("v", roles) as SceneSql;

    // Assert
    expect(result.sql).toContain('"free text col"');
  });
});

// ─── buildSunburstSql ─────────────────────────────────────────────────────────

describe("buildSunburstSql", () => {
  it("returns null when category role is missing", () => {
    // Act
    expect(buildSunburstSql("v", EMPTY_ROLES)).toBeNull();
  });

  it("returns a flat (single-level) query when only category is present", () => {
    // Arrange
    const roles: ColumnRoles = { ...EMPTY_ROLES, category: col("region") };

    // Act
    const result = buildSunburstSql("v", roles) as SceneSql;

    // Assert
    expect(result).not.toBeNull();
    expect(result.sql).toContain("NULL AS l2");
    expect(result.sql).toContain("AS l1");
    expect(result.sql).toContain("LIMIT 60");
    expect(result.note).toContain("region");
  });

  it("includes HAVING > 0 and ORDER BY v DESC in the flat query", () => {
    // Arrange
    const roles: ColumnRoles = { ...EMPTY_ROLES, category: col("cat") };

    // Act
    const result = buildSunburstSql("v", roles) as SceneSql;

    // Assert
    expect(result.sql).toContain("HAVING");
    expect(result.sql).toContain("> 0");
    expect(result.sql).toContain("ORDER BY v DESC");
  });

  it("uses COUNT(*) in the flat query when no measure is provided", () => {
    // Arrange
    const roles: ColumnRoles = { ...EMPTY_ROLES, category: col("cat") };

    // Act
    const result = buildSunburstSql("v", roles) as SceneSql;

    // Assert
    expect(result.sql).toContain("COUNT(*)");
  });

  it("uses SUM(measure) in the flat query when measure is provided", () => {
    // Arrange
    const roles: ColumnRoles = {
      ...EMPTY_ROLES,
      category: col("cat"),
      measure: numCol("sales"),
    };

    // Act
    const result = buildSunburstSql("v", roles) as SceneSql;

    // Assert
    expect(result.sql).toContain('SUM("sales")');
  });

  it("returns a two-level query when both category and category2 are present", () => {
    // Arrange
    const roles: ColumnRoles = {
      ...EMPTY_ROLES,
      category: col("region"),
      category2: col("city"),
    };

    // Act
    const result = buildSunburstSql("v", roles) as SceneSql;

    // Assert — two-level version has l2 and a 200-row limit.
    expect(result.sql).toContain("AS l1");
    expect(result.sql).toContain("AS l2");
    expect(result.sql).not.toContain("NULL AS l2");
    expect(result.sql).toContain("LIMIT 200");
    expect(result.note).toContain("region");
    expect(result.note).toContain("city");
  });

  it("uses SUM(measure) in the two-level query when measure is provided", () => {
    // Arrange
    const roles: ColumnRoles = {
      ...EMPTY_ROLES,
      category: col("region"),
      category2: col("city"),
      measure: numCol("revenue"),
    };

    // Act
    const result = buildSunburstSql("v", roles) as SceneSql;

    // Assert
    expect(result.sql).toContain('SUM("revenue")');
  });

  it("uses COUNT(*) in the two-level query when no measure is provided", () => {
    // Arrange
    const roles: ColumnRoles = {
      ...EMPTY_ROLES,
      category: col("a"),
      category2: col("b"),
    };

    // Act
    const result = buildSunburstSql("v", roles) as SceneSql;

    // Assert
    expect(result.sql).toContain("COUNT(*)");
  });

  it("groups by 1, 2 and orders by v DESC in the two-level query", () => {
    // Arrange
    const roles: ColumnRoles = {
      ...EMPTY_ROLES,
      category: col("a"),
      category2: col("b"),
    };

    // Act
    const result = buildSunburstSql("v", roles) as SceneSql;

    // Assert
    expect(result.sql).toContain("GROUP BY 1, 2");
    expect(result.sql).toContain("ORDER BY v DESC");
  });
});

// ─── asStr ────────────────────────────────────────────────────────────────────

describe("asStr", () => {
  it("returns empty string for null", () => {
    expect(asStr(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(asStr(undefined)).toBe("");
  });

  it("converts a string to a trimmed string", () => {
    expect(asStr("  hello world  ")).toBe("hello world");
  });

  it("returns empty string for a whitespace-only string", () => {
    expect(asStr("   ")).toBe("");
  });

  it("converts a number to its string representation", () => {
    expect(asStr(42)).toBe("42");
  });

  it("converts 0 to '0'", () => {
    expect(asStr(0)).toBe("0");
  });

  it("converts false to 'false'", () => {
    expect(asStr(false)).toBe("false");
  });

  it("converts a plain object to its [object Object] string", () => {
    expect(asStr({})).toBe("[object Object]");
  });

  it("trims leading and trailing spaces from non-null values", () => {
    expect(asStr("  trimmed  ")).toBe("trimmed");
  });

  it("handles an empty string gracefully (returns empty string)", () => {
    expect(asStr("")).toBe("");
  });
});

// ─── asNum ────────────────────────────────────────────────────────────────────

describe("asNum", () => {
  it("returns 0 for null", () => {
    expect(asNum(null)).toBe(0);
  });

  it("returns 0 for undefined", () => {
    expect(asNum(undefined)).toBe(0);
  });

  it("returns the number unchanged for a plain finite number", () => {
    expect(asNum(42)).toBe(42);
  });

  it("returns 0 for NaN", () => {
    expect(asNum(NaN)).toBe(0);
  });

  it("returns 0 for Infinity", () => {
    expect(asNum(Infinity)).toBe(0);
  });

  it("returns 0 for -Infinity", () => {
    expect(asNum(-Infinity)).toBe(0);
  });

  it("coerces a numeric string to a number", () => {
    expect(asNum("3.14")).toBe(3.14);
  });

  it("returns 0 for a non-numeric string", () => {
    expect(asNum("abc")).toBe(0);
  });

  it("coerces a BigInt to a number", () => {
    expect(asNum(BigInt(9007199254740991))).toBe(9007199254740991);
  });

  it("unwraps a typed array (Float64Array) by taking the first element", () => {
    // DuckDB WASM can return typed arrays for aggregate results.
    expect(asNum(new Float64Array([99.5]))).toBe(99.5);
  });

  it("unwraps a Uint32Array typed array by taking the first element", () => {
    expect(asNum(new Uint32Array([255]))).toBe(255);
  });

  it("returns 0 for an empty typed array (first element is undefined → NaN → 0)", () => {
    expect(asNum(new Float64Array([]))).toBe(0);
  });

  it("handles negative numbers", () => {
    expect(asNum(-7.5)).toBe(-7.5);
  });

  it("handles zero correctly", () => {
    expect(asNum(0)).toBe(0);
  });
});
