import { describe, expect, it } from "vitest";
import {
  type ColumnInfo,
  isNumericType,
  type MappingSuggestion,
  pickDefaultKey,
  pickDefaultMeasures,
  suggestColumnMapping,
} from "@/features/reconciliation/lib/auto-map";

const cols = (...names: string[]): ColumnInfo[] => names.map((name) => ({ name }));

describe("isNumericType", () => {
  it("returns false for an undefined or empty type", () => {
    expect(isNumericType(undefined)).toBe(false);
    expect(isNumericType("")).toBe(false);
  });

  it("recognizes common DuckDB numeric type labels (case-insensitive)", () => {
    for (const t of [
      "INTEGER",
      "BIGINT",
      "DOUBLE",
      "FLOAT",
      "DECIMAL(18,2)",
      "NUMERIC",
      "REAL",
      "HUGEINT",
    ]) {
      expect(isNumericType(t)).toBe(true);
    }
  });

  it("returns false for non-numeric types", () => {
    expect(isNumericType("VARCHAR")).toBe(false);
    expect(isNumericType("DATE")).toBe(false);
    expect(isNumericType("BOOLEAN")).toBe(false);
  });
});

describe("suggestColumnMapping", () => {
  it("returns an exact case-insensitive match with confidence 1", () => {
    const result = suggestColumnMapping(cols("Channel"), cols("channel"));
    expect(result).toEqual([{ expected: "Channel", actual: "channel", confidence: 1 }]);
  });

  it("fuzzy-matches differently-named but similar columns with partial confidence", () => {
    const result = suggestColumnMapping(cols("revenue"), cols("rev", "phone"));
    expect(result).toHaveLength(1);
    expect(result[0].expected).toBe("revenue");
    expect(result[0].actual).toBe("rev");
    expect(result[0].confidence).toBeGreaterThan(0);
    expect(result[0].confidence).toBeLessThan(1);
  });

  it("returns a null mapping with zero confidence when nothing is close enough", () => {
    const result = suggestColumnMapping(cols("revenue"), cols("zzzzzzzz"));
    expect(result[0]).toEqual({
      expected: "revenue",
      actual: null,
      confidence: 0,
    });
  });

  it("produces one suggestion per expected column", () => {
    const result = suggestColumnMapping(
      cols("channel", "revenue", "qty"),
      cols("channel", "revenue", "qty"),
    );
    expect(result).toHaveLength(3);
    expect(result.every((s) => s.confidence === 1)).toBe(true);
  });

  it("returns an empty array when there are no expected columns", () => {
    expect(suggestColumnMapping([], cols("a", "b"))).toEqual([]);
  });

  it("never produces a negative confidence even for a worst-case fuzzy hit", () => {
    const result = suggestColumnMapping(cols("abc"), cols("abd"));
    for (const s of result) {
      expect(s.confidence).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("pickDefaultKey", () => {
  it("returns the highest-confidence non-numeric mapped column", () => {
    const suggestions: MappingSuggestion[] = [
      { expected: "amount", actual: "amount", confidence: 1 },
      { expected: "channel", actual: "channel", confidence: 0.9 },
      { expected: "region", actual: "reg", confidence: 0.6 },
    ];
    const expected: ColumnInfo[] = [
      { name: "amount", type: "DOUBLE" },
      { name: "channel", type: "VARCHAR" },
      { name: "region", type: "VARCHAR" },
    ];
    const key = pickDefaultKey(suggestions, expected);
    expect(key?.expected).toBe("channel");
  });

  it("ignores numeric columns even when they have the highest confidence", () => {
    const suggestions: MappingSuggestion[] = [
      { expected: "amount", actual: "amount", confidence: 1 },
      { expected: "label", actual: "label", confidence: 0.5 },
    ];
    const expected: ColumnInfo[] = [
      { name: "amount", type: "BIGINT" },
      { name: "label", type: "VARCHAR" },
    ];
    expect(pickDefaultKey(suggestions, expected)?.expected).toBe("label");
  });

  it("ignores suggestions that did not resolve to an actual column", () => {
    const suggestions: MappingSuggestion[] = [{ expected: "channel", actual: null, confidence: 0 }];
    const expected: ColumnInfo[] = [{ name: "channel", type: "VARCHAR" }];
    expect(pickDefaultKey(suggestions, expected)).toBeNull();
  });

  it("returns null when there are no non-numeric candidates", () => {
    const suggestions: MappingSuggestion[] = [
      { expected: "amount", actual: "amount", confidence: 1 },
    ];
    const expected: ColumnInfo[] = [{ name: "amount", type: "DOUBLE" }];
    expect(pickDefaultKey(suggestions, expected)).toBeNull();
  });

  it("treats unknown-type columns as eligible keys (non-numeric by default)", () => {
    const suggestions: MappingSuggestion[] = [{ expected: "id", actual: "id", confidence: 0.8 }];
    const expected: ColumnInfo[] = [{ name: "id" }];
    expect(pickDefaultKey(suggestions, expected)?.expected).toBe("id");
  });
});

describe("pickDefaultMeasures", () => {
  const expected: ColumnInfo[] = [
    { name: "channel", type: "VARCHAR" },
    { name: "revenue", type: "DOUBLE" },
    { name: "qty", type: "INTEGER" },
    { name: "cost", type: "DECIMAL(18,2)" },
  ];

  it("returns confidently-mapped numeric columns, excluding the chosen key", () => {
    const suggestions: MappingSuggestion[] = [
      { expected: "channel", actual: "channel", confidence: 1 },
      { expected: "revenue", actual: "revenue", confidence: 0.9 },
      { expected: "qty", actual: "qty", confidence: 0.8 },
      { expected: "cost", actual: "cost", confidence: 0.7 },
    ];
    const measures = pickDefaultMeasures(suggestions, expected, new Set(["channel"]));
    const labels = measures.map((m) => m.expected);
    expect(labels).not.toContain("channel");
    expect(labels).toEqual(["revenue", "qty", "cost"]);
  });

  it("excludes low-confidence (<=0.4) and unmapped numeric columns", () => {
    const suggestions: MappingSuggestion[] = [
      { expected: "revenue", actual: "revenue", confidence: 0.4 },
      { expected: "qty", actual: null, confidence: 0 },
      { expected: "cost", actual: "cost", confidence: 0.5 },
    ];
    const measures = pickDefaultMeasures(suggestions, expected, new Set());
    expect(measures.map((m) => m.expected)).toEqual(["cost"]);
  });

  it("respects the result limit and orders by descending confidence", () => {
    const suggestions: MappingSuggestion[] = [
      { expected: "revenue", actual: "revenue", confidence: 0.7 },
      { expected: "qty", actual: "qty", confidence: 0.95 },
      { expected: "cost", actual: "cost", confidence: 0.85 },
    ];
    const measures = pickDefaultMeasures(suggestions, expected, new Set(), 2);
    expect(measures).toHaveLength(2);
    expect(measures.map((m) => m.expected)).toEqual(["qty", "cost"]);
  });

  it("returns an empty array when no numeric measures qualify", () => {
    const suggestions: MappingSuggestion[] = [
      { expected: "channel", actual: "channel", confidence: 1 },
    ];
    expect(pickDefaultMeasures(suggestions, expected, new Set())).toEqual([]);
  });
});
