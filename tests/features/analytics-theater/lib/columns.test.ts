import { describe, it, expect } from "vitest";
import { detectColumnRoles, quoteIdent } from "@/features/analytics-theater/lib/columns";
import type { ColMeta, Dataset } from "@/core/stores/data-store";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCol(name: string, type: ColMeta["type"], distinctCount = 0): ColMeta {
  return {
    name,
    type,
    nullCount: 0,
    distinctCount,
    sample: [],
  };
}

function makeDataset(columns: ColMeta[], rowCount = 100): Dataset {
  return {
    id: "ds_test",
    name: "Test",
    tableName: "test_view",
    viewName: "test_view",
    source: "upload",
    format: "csv",
    rowCount,
    colCount: columns.length,
    sizeBytes: 1000,
    columns,
    tags: [],
    description: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    qualityScore: 1,
  };
}

// ─── detectColumnRoles ────────────────────────────────────────────────────────

describe("detectColumnRoles", () => {
  // ── Early return: undefined dataset ──────────────────────────────────────
  it("returns all-null empty roles when dataset is undefined", () => {
    // Arrange + Act
    const result = detectColumnRoles(undefined);

    // Assert
    expect(result.date).toBeNull();
    expect(result.measure).toBeNull();
    expect(result.category).toBeNull();
    expect(result.category2).toBeNull();
    expect(result.text).toBeNull();
    expect(result.numeric).toEqual([]);
    expect(result.strings).toEqual([]);
  });

  // ── Early return: empty columns array ─────────────────────────────────────
  it("returns all-null empty roles when dataset has zero columns", () => {
    // Arrange
    const dataset = makeDataset([]);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert
    expect(result.date).toBeNull();
    expect(result.measure).toBeNull();
    expect(result.category).toBeNull();
    expect(result.category2).toBeNull();
    expect(result.text).toBeNull();
    expect(result.numeric).toEqual([]);
    expect(result.strings).toEqual([]);
  });

  // ── Date detection: prefer named date-typed column ─────────────────────────
  it("picks a date-typed column matching the date name hint", () => {
    // Arrange
    const dateCol = makeCol("transaction_date", "date");
    const otherDate = makeCol("id_field", "date");
    const dataset = makeDataset([otherDate, dateCol]);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert
    expect(result.date).toBe(dateCol);
  });

  // ── Date detection: falls back to first date-typed column ─────────────────
  it("falls back to the first date-typed column when no name hint matches", () => {
    // Arrange
    const col1 = makeCol("period_of", "date"); // doesn't contain the hint pattern
    // actually "period" DOES match the regex so use something that doesn't
    const col1NoHint = makeCol("zzz_field", "date");
    const col2 = makeCol("yyy_other", "date");
    const dataset = makeDataset([col1NoHint, col2]);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert — picks dates[0] since no name hint matches
    expect(result.date).toBe(col1NoHint);
  });

  // ── Date detection: string column with date name hint as last resort ───────
  it("falls back to a string column matching date name hint when no date-typed column exists", () => {
    // Arrange
    const strDateCol = makeCol("created_at", "string");
    const otherStr = makeCol("product_name", "string");
    const dataset = makeDataset([otherStr, strDateCol]);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert
    expect(result.date).toBe(strDateCol);
  });

  // ── Date detection: null when no date candidate at all ────────────────────
  it("returns null for date when no date-typed or date-named string column exists", () => {
    // Arrange
    const numCol = makeCol("amount", "number");
    const strCol = makeCol("xyz", "string");
    const dataset = makeDataset([numCol, strCol]);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert
    expect(result.date).toBeNull();
  });

  // ── Measure detection: prefer measure-named numeric column ────────────────
  it("picks a numeric column matching the measure name hint", () => {
    // Arrange
    const numOther = makeCol("some_number", "number");
    const amount = makeCol("total_amount", "number");
    const dataset = makeDataset([numOther, amount]);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert
    expect(result.measure).toBe(amount);
  });

  // ── Measure detection: excludes id-like columns from candidates ────────────
  it("excludes columns matching ^id$|_id$|index|idx from measure candidates", () => {
    // Arrange
    const idCol = makeCol("record_id", "number");
    const indexCol = makeCol("row_index", "number");
    const idxCol = makeCol("idx", "number");
    const goodCol = makeCol("revenue", "number");
    const dataset = makeDataset([idCol, indexCol, idxCol, goodCol]);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert
    expect(result.measure).toBe(goodCol);
  });

  // ── Measure detection: falls back to first non-id numeric if no measure hint ─
  it("falls back to first non-id numeric when no measure name hint matches", () => {
    // Arrange
    const numA = makeCol("field_a", "number");
    const numB = makeCol("field_b", "number");
    const dataset = makeDataset([numA, numB]);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert
    expect(result.measure).toBe(numA);
  });

  // ── Measure detection: falls back to numeric[0] when all are id-like ──────
  it("falls back to numeric[0] when all numeric columns look like ids", () => {
    // Arrange
    const id1 = makeCol("id", "number");
    const id2 = makeCol("user_id", "number");
    const dataset = makeDataset([id1, id2]);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert
    expect(result.measure).toBe(id1);
  });

  // ── Measure detection: null when no numeric columns ────────────────────────
  it("returns null for measure when there are no numeric columns", () => {
    // Arrange
    const strCol = makeCol("name", "string");
    const dataset = makeDataset([strCol]);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert
    expect(result.measure).toBeNull();
  });

  // ── Category detection: prefer category-named string column ───────────────
  it("picks a string column matching the category name hint", () => {
    // Arrange
    const other = makeCol("other_field", "string");
    const channel = makeCol("channel", "string", 5);
    const dataset = makeDataset([other, channel]);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert
    expect(result.category).toBe(channel);
  });

  // ── Category detection: prefers name hint over low-cardinality ────────────
  it("prefers category name hint over low-cardinality sort order", () => {
    // Arrange – "status" matches hint, "zzz" is lower cardinality but no hint
    const zzz = makeCol("zzz_field", "string", 2); // low cardinality ratio = 2/100
    const status = makeCol("status", "string", 10); // ratio = 10/100
    const dataset = makeDataset([zzz, status], 100);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert
    expect(result.category).toBe(status);
  });

  // ── Category detection: low cardinality fallback ──────────────────────────
  it("falls back to lowest-cardinality string column when no category hint", () => {
    // Arrange
    const highCard = makeCol("free_text", "string", 90);
    const lowCard = makeCol("group_x", "string", 3); // but wait "group" matches CATEGORY hint!
    // Use names that definitely don't match category hint
    const highCardNo = makeCol("aaa_field", "string", 90);
    const lowCardNo = makeCol("bbb_field", "string", 3);
    const dataset = makeDataset([highCardNo, lowCardNo], 100);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert — lowCardNo has ratio 3/100 < 0.5 so it goes into lowCardStrings
    expect(result.category).toBe(lowCardNo);
  });

  // ── Category detection: falls back to any string excluding date ────────────
  it("falls back to any string excluding the date column", () => {
    // Arrange – one string is the date (via name hint), other is category fallback
    const dateLikeStr = makeCol("updated_at", "string", 99); // date hint, high cardinality
    const otherStr = makeCol("zzz_col", "string", 99); // high cardinality, no hint
    const dataset = makeDataset([dateLikeStr, otherStr], 100);

    // Act
    const result = detectColumnRoles(dataset);

    // date = dateLikeStr (string with date name hint)
    // category falls back to strings.find(c !== date) = otherStr
    expect(result.date).toBe(dateLikeStr);
    expect(result.category).toBe(otherStr);
  });

  // ── Category detection: null when no string columns ────────────────────────
  it("returns null for category when there are no string columns", () => {
    // Arrange
    const numCol = makeCol("count", "number");
    const dateCol = makeCol("txn_date", "date");
    const dataset = makeDataset([numCol, dateCol]);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert
    expect(result.category).toBeNull();
  });

  // ── Category2 detection: second low-cardinality string ────────────────────
  it("picks a second low-cardinality column for category2, excluding category", () => {
    // Arrange
    const cat1 = makeCol("channel", "string", 5);
    const cat2 = makeCol("status", "string", 4);
    const dataset = makeDataset([cat1, cat2], 100);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert: both match category hint; first found = cat1, second should be cat2
    expect(result.category).toBe(cat1);
    expect(result.category2).toBe(cat2);
  });

  // ── Category2 fallback to strings excluding date and category ─────────────
  it("falls back to any string excluding date and category for category2", () => {
    // Arrange – all high-cardinality so lowCardStrings is empty
    const dateStr = makeCol("created_at", "string", 99);
    const catStr = makeCol("channel", "string", 99); // matches category hint
    const extra = makeCol("zzz_other", "string", 99);
    const dataset = makeDataset([dateStr, catStr, extra], 100);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert
    expect(result.date).toBe(dateStr);
    expect(result.category).toBe(catStr);
    expect(result.category2).toBe(extra);
  });

  // ── Category2: null when only one string column (used as category) ─────────
  it("returns null for category2 when only one string column exists", () => {
    // Arrange
    const onlyStr = makeCol("region", "string", 5);
    const dataset = makeDataset([onlyStr], 100);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert
    expect(result.category).toBe(onlyStr);
    expect(result.category2).toBeNull();
  });

  // ── Text detection: prefer text-named string column ────────────────────────
  it("picks a string column matching the text name hint (e.g. 'remark')", () => {
    // Arrange
    const other = makeCol("channel", "string", 5);
    const remark = makeCol("remark", "string", 90);
    const dataset = makeDataset([other, remark], 100);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert
    expect(result.text).toBe(remark);
  });

  // ── Text detection: falls back to highest-cardinality string excl. date ───
  it("falls back to the highest-cardinality string excluding the date column for text", () => {
    // Arrange: no text-named column, so falls back to highest distinct count
    const dateStr = makeCol("period", "string", 100);  // date hint
    const lowCard = makeCol("zzz_cat", "string", 3);
    const highCard = makeCol("zzz_desc", "string", 90);
    const dataset = makeDataset([dateStr, lowCard, highCard], 100);

    // Act
    const result = detectColumnRoles(dataset);

    // date is dateStr (string with date hint), text falls back to highest cardinality excluding date
    expect(result.date).toBe(dateStr);
    expect(result.text).toBe(highCard);
  });

  // ── Text detection: null when no string columns exist ─────────────────────
  it("returns null for text when there are no string columns", () => {
    // Arrange
    const numCol = makeCol("value", "number");
    const dateCol = makeCol("transaction_date", "date");
    const dataset = makeDataset([numCol, dateCol]);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert
    expect(result.text).toBeNull();
  });

  // ── Numeric/strings arrays ────────────────────────────────────────────────
  it("returns all numeric columns in the numeric array", () => {
    // Arrange
    const num1 = makeCol("amount", "number");
    const num2 = makeCol("quantity", "number");
    const str1 = makeCol("name", "string");
    const dataset = makeDataset([num1, num2, str1]);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert
    expect(result.numeric).toEqual([num1, num2]);
    expect(result.strings).toEqual([str1]);
  });

  it("returns empty numeric and strings arrays when only date and boolean columns exist", () => {
    // Arrange
    const dateCol = makeCol("created_date", "date");
    const boolCol = makeCol("is_active", "boolean");
    const dataset = makeDataset([dateCol, boolCol]);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert
    expect(result.numeric).toEqual([]);
    expect(result.strings).toEqual([]);
  });

  // ── rowCount edge case: Math.max(1, 0) prevents division by zero ──────────
  it("handles rowCount of 0 gracefully without division-by-zero errors", () => {
    // Arrange
    const strCol = makeCol("channel", "string", 5);
    const numCol = makeCol("volume", "number", 5);
    const dataset = makeDataset([strCol, numCol], 0); // rowCount = 0

    // Act + Assert (should not throw)
    expect(() => detectColumnRoles(dataset)).not.toThrow();
    const result = detectColumnRoles(dataset);
    expect(result.category).toBe(strCol);
  });

  // ── distinctCount = 0: treated as unknown (ratio = 0.5) ──────────────────
  it("treats distinctCount of 0 as unknown (ratio 0.5), including in lowCardStrings when < 0.5 fails", () => {
    // Arrange: ratio = 0.5 means it fails the < 0.5 filter UNLESS it matches category hint
    const col = makeCol("zzz_no_hint", "string", 0); // distinctCount = 0 => ratio = 0.5
    const catHintCol = makeCol("category", "string", 0); // matches category hint, passes filter
    const dataset = makeDataset([col, catHintCol], 100);

    // Act
    const result = detectColumnRoles(dataset);

    // catHintCol passes because CATEGORY_NAME_HINT matches it
    // col has ratio 0.5 which is NOT < 0.5 and doesn't match hint, so filtered out
    // category should prefer catHintCol (name hint match)
    expect(result.category).toBe(catHintCol);
  });

  it("includes string column with distinctCount 0 in lowCardStrings when category name hint matches", () => {
    // Arrange: distinctCount=0 means ratio=0.5 which is NOT < 0.5
    // but CATEGORY_NAME_HINT.test('type') = true so it passes the filter
    const typeCol = makeCol("type", "string", 0);
    const dataset = makeDataset([typeCol], 100);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert: category should be typeCol because name hint matches
    expect(result.category).toBe(typeCol);
  });

  // ── Full realistic dataset ────────────────────────────────────────────────
  it("correctly assigns all roles for a realistic telecom-style dataset", () => {
    // Arrange
    const txnDate = makeCol("transaction_date", "date");
    const amount = makeCol("total_amount", "number");
    const channel = makeCol("channel", "string", 5);
    const operator = makeCol("operator", "string", 10);
    const commentCol = makeCol("comment", "string", 80);
    const dataset = makeDataset([txnDate, amount, channel, operator, commentCol], 100);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert
    expect(result.date).toBe(txnDate);
    expect(result.measure).toBe(amount);
    expect(result.category).toBe(channel); // "channel" matches hint, lower cardinality
    expect(result.category2).toBe(operator); // "operator" matches hint
    expect(result.text).toBe(commentCol); // "comment" matches TEXT_NAME_HINT
    expect(result.numeric).toEqual([amount]);
    expect(result.strings).toEqual([channel, operator, commentCol]);
  });

  // ── date column is excluded from lowCardStrings filter for category ────────
  it("excludes the selected date column from category candidates", () => {
    // Arrange: date is a string column with date name hint
    const dateStrCol = makeCol("created", "string", 99); // date hint => becomes date
    const catCol = makeCol("region", "string", 5); // category hint
    const dataset = makeDataset([dateStrCol, catCol], 100);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert
    expect(result.date).toBe(dateStrCol);
    expect(result.category).toBe(catCol); // not dateStrCol
  });

  // ── When category comes from lowCardStrings[0], not name hint ─────────────
  it("returns lowCardStrings[0].col as category when no string matches category name hint", () => {
    // Arrange: no category name hint, but zzz_a has low cardinality
    const zzz_a = makeCol("aaa_field", "string", 3); // ratio = 3/100 = 0.03 < 0.5
    const zzz_b = makeCol("bbb_field", "string", 60); // ratio = 0.6 >= 0.5 → excluded
    const dataset = makeDataset([zzz_b, zzz_a], 100);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert
    expect(result.category).toBe(zzz_a);
  });

  // ── category2 from lowCardStrings (not category) ───────────────────────────
  it("picks category2 from lowCardStrings excluding the first category", () => {
    // Arrange: two low-cardinality strings, neither matches category/category2 hints specially
    const low1 = makeCol("aaa_field", "string", 2); // ratio 0.02
    const low2 = makeCol("bbb_field", "string", 4); // ratio 0.04
    const dataset = makeDataset([low1, low2], 100);

    // Act
    const result = detectColumnRoles(dataset);

    // lowCardStrings sorted by ratio: [low1 (0.02), low2 (0.04)]
    // category = lowCardStrings[0].col = low1
    // category2 = lowCardStrings.map(...).find(c !== low1) = low2
    expect(result.category).toBe(low1);
    expect(result.category2).toBe(low2);
  });

  // ── text falls back to sorted highest distinct count ──────────────────────
  it("selects highest-cardinality non-date string for text when no text name hint", () => {
    // Arrange
    const low = makeCol("zzz_low", "string", 2);
    const high = makeCol("zzz_high", "string", 95);
    const dataset = makeDataset([low, high], 100);

    // Act
    const result = detectColumnRoles(dataset);

    // Assert
    expect(result.text).toBe(high);
  });

  // ── text: single string column that is the date ────────────────────────────
  it("still returns a text column when the only non-date string is a single high-cardinality col", () => {
    // Arrange
    const dayCol = makeCol("day_field", "string", 90); // "day" matches date hint
    const onlyOther = makeCol("zzz_col", "string", 45);
    const dataset = makeDataset([dayCol, onlyOther], 100);

    // Act
    const result = detectColumnRoles(dataset);

    // date = dayCol, text fallback = highest cardinality excl. dayCol = onlyOther
    expect(result.date).toBe(dayCol);
    expect(result.text).toBe(onlyOther);
  });
});

// ─── quoteIdent ──────────────────────────────────────────────────────────────

describe("quoteIdent", () => {
  it("wraps a simple identifier in double quotes", () => {
    expect(quoteIdent("column_name")).toBe('"column_name"');
  });

  it("escapes embedded double quotes by doubling them", () => {
    expect(quoteIdent('col"name')).toBe('"col""name"');
  });

  it("handles identifiers with multiple embedded double quotes", () => {
    expect(quoteIdent('a"b"c')).toBe('"a""b""c"');
  });

  it("handles an empty string", () => {
    expect(quoteIdent("")).toBe('""');
  });

  it("handles identifiers with spaces", () => {
    expect(quoteIdent("my column")).toBe('"my column"');
  });

  it("handles identifiers that start with a double quote", () => {
    expect(quoteIdent('"starts_with_quote')).toBe('"""starts_with_quote"');
  });
});
