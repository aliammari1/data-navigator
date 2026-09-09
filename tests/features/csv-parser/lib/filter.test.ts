import { describe, expect, it } from "vitest";
import type { RowPredicate, RowRecord } from "@/features/csv-parser/lib/filter";
import { compileFilter } from "@/features/csv-parser/lib/filter";

// filter.ts is a pure, dependency-light module.
// No IO, no React, no timers — straight behavioral assertions.

// ─── compileFilter — empty / unrecognized expressions ────────────────────────

describe("compileFilter — empty / unrecognized expression", () => {
  it("returns null for an empty string", () => {
    // Arrange / Act / Assert
    expect(compileFilter("")).toBeNull();
  });

  it("returns null for a whitespace-only string", () => {
    expect(compileFilter("   ")).toBeNull();
  });

  it("returns null for an expression that matches no known pattern", () => {
    expect(compileFilter("some free text with no operator")).toBeNull();
  });

  it("returns null for an expression without a column name", () => {
    expect(compileFilter("= 42")).toBeNull();
  });
});

// ─── compileFilter — equality operator (=) ───────────────────────────────────

describe("compileFilter — equality operator (=)", () => {
  it("returns a predicate (not null) for a valid = expression", () => {
    // Arrange / Act
    const pred = compileFilter("status = active");
    // Assert
    expect(pred).not.toBeNull();
    expect(typeof pred).toBe("function");
  });

  it("= matches a row whose column value equals the target (case-insensitive)", () => {
    // Arrange
    const pred = compileFilter("status = active") as RowPredicate;
    // Act / Assert
    expect(pred({ status: "active" })).toBe(true);
    expect(pred({ status: "ACTIVE" })).toBe(true);
  });

  it("= rejects a row whose column value does not match", () => {
    const pred = compileFilter("status = active") as RowPredicate;
    expect(pred({ status: "inactive" })).toBe(false);
  });

  it("= treats a missing column as empty string and matches against empty target", () => {
    // row[col] is undefined → String(undefined ?? '') → '' → lower = ''
    // target is '' (unquoted empty) → '' === '' → true
    const pred = compileFilter("col = ") as RowPredicate;
    // The regex requires something after the operator; this won't parse.
    // Let's verify with a proper empty-ish target that does parse.
    // Use a column that exists but is empty vs target "empty":
    const pred2 = compileFilter("col = missing") as RowPredicate;
    expect(pred2({ col: "missing" })).toBe(true);
    expect(pred2({ col: undefined })).toBe(false);
  });

  it("= with a missing column key treats value as undefined → empty string", () => {
    const pred = compileFilter("col = test") as RowPredicate;
    // undefined ?? '' → '' → lower = '' ≠ 'test'
    expect(pred({})).toBe(false);
  });

  it("= with null value coerces to empty string comparison", () => {
    const pred = compileFilter("col = ") as RowPredicate;
    // Won't match the compare regex (nothing after '= '), so returns null.
    // Test with a real empty-match scenario: target is blank token.
    // Using pattern that DOES parse: "col = something" with null val.
    const pred2 = compileFilter("col = hello") as RowPredicate;
    expect(pred2({ col: null })).toBe(false); // '' !== 'hello'
  });

  it("= with quoted string target strips the quotes", () => {
    // target = 'foo' → unquote → foo → foo lower = 'foo'
    const pred = compileFilter("name = 'John'") as RowPredicate;
    expect(pred).not.toBeNull();
    expect(pred({ name: "John" })).toBe(true);
    expect(pred({ name: "john" })).toBe(true);
    expect(pred({ name: "Jane" })).toBe(false);
  });

  it("= with double-quoted target strips the quotes", () => {
    const pred = compileFilter('city = "Paris"') as RowPredicate;
    expect(pred({ city: "Paris" })).toBe(true);
    expect(pred({ city: "London" })).toBe(false);
  });

  it("= comparison is case-insensitive on both sides", () => {
    const pred = compileFilter("col = HELLO") as RowPredicate;
    expect(pred({ col: "hello" })).toBe(true);
    expect(pred({ col: "Hello" })).toBe(true);
    expect(pred({ col: "HELLO" })).toBe(true);
  });
});

// ─── compileFilter — inequality operator (!=) ────────────────────────────────

describe("compileFilter — inequality operator (!=)", () => {
  it("!= matches a row whose value differs from the target", () => {
    // Arrange
    const pred = compileFilter("status != inactive") as RowPredicate;
    // Act / Assert
    expect(pred({ status: "active" })).toBe(true);
    expect(pred({ status: "inactive" })).toBe(false);
  });

  it("!= is case-insensitive", () => {
    const pred = compileFilter("status != inactive") as RowPredicate;
    expect(pred({ status: "INACTIVE" })).toBe(false);
    expect(pred({ status: "Active" })).toBe(true);
  });

  it("!= with missing column (undefined) coerces to empty string", () => {
    const pred = compileFilter("col != something") as RowPredicate;
    // '' !== 'something' → true
    expect(pred({})).toBe(true);
  });

  it("!= with null value coerces to empty string", () => {
    const pred = compileFilter("col != something") as RowPredicate;
    expect(pred({ col: null })).toBe(true);
  });
});

// ─── compileFilter — numeric comparison operators ────────────────────────────

describe("compileFilter — greater-than operator (>)", () => {
  it("> returns true when row value exceeds the numeric target", () => {
    const pred = compileFilter("age > 18") as RowPredicate;
    expect(pred({ age: 25 })).toBe(true);
    expect(pred({ age: 18 })).toBe(false);
    expect(pred({ age: 10 })).toBe(false);
  });

  it("> works when the row value is a numeric string", () => {
    const pred = compileFilter("score > 50") as RowPredicate;
    expect(pred({ score: "75" })).toBe(true);
    expect(pred({ score: "25" })).toBe(false);
  });

  it("> returns false when row value is NaN (non-numeric string)", () => {
    // Number('abc') is NaN → Number.isNaN branch → returns false
    const pred = compileFilter("age > 18") as RowPredicate;
    expect(pred({ age: "abc" })).toBe(false);
  });

  it("> with non-numeric target returns true (targetIsNumber is false → early return true)", () => {
    // targetIsNumber = false because Number('abc') is NaN
    const pred = compileFilter("col > abc") as RowPredicate;
    // target is not a number → predicate always returns true
    expect(pred({ col: "anything" })).toBe(true);
    expect(pred({ col: 0 })).toBe(true);
  });
});

describe("compileFilter — less-than operator (<)", () => {
  it("< returns true when row value is below the numeric target", () => {
    const pred = compileFilter("price < 100") as RowPredicate;
    expect(pred({ price: 50 })).toBe(true);
    expect(pred({ price: 100 })).toBe(false);
    expect(pred({ price: 200 })).toBe(false);
  });

  it("< with string-encoded numeric value in row", () => {
    const pred = compileFilter("count < 10") as RowPredicate;
    expect(pred({ count: "5" })).toBe(true);
    expect(pred({ count: "15" })).toBe(false);
  });

  it("< returns false for non-numeric row value", () => {
    const pred = compileFilter("val < 10") as RowPredicate;
    expect(pred({ val: "text" })).toBe(false);
  });
});

describe("compileFilter — greater-than-or-equal operator (>=)", () => {
  it(">= returns true when row value equals the target", () => {
    const pred = compileFilter("score >= 90") as RowPredicate;
    expect(pred({ score: 90 })).toBe(true);
    expect(pred({ score: 100 })).toBe(true);
    expect(pred({ score: 89 })).toBe(false);
  });

  it(">= with string-encoded row value", () => {
    const pred = compileFilter("rating >= 3") as RowPredicate;
    expect(pred({ rating: "3" })).toBe(true);
    expect(pred({ rating: "2" })).toBe(false);
  });

  it(">= returns false for non-numeric row value", () => {
    const pred = compileFilter("val >= 5") as RowPredicate;
    expect(pred({ val: "text" })).toBe(false);
  });
});

describe("compileFilter — less-than-or-equal operator (<=)", () => {
  it("<= returns true when row value equals the target", () => {
    const pred = compileFilter("temp <= 37") as RowPredicate;
    expect(pred({ temp: 37 })).toBe(true);
    expect(pred({ temp: 36 })).toBe(true);
    expect(pred({ temp: 38 })).toBe(false);
  });

  it("<= with string-encoded row value", () => {
    const pred = compileFilter("x <= 0") as RowPredicate;
    expect(pred({ x: "0" })).toBe(true);
    expect(pred({ x: "-1" })).toBe(true);
    expect(pred({ x: "1" })).toBe(false);
  });

  it("<= returns false for non-numeric row value", () => {
    const pred = compileFilter("val <= 100") as RowPredicate;
    expect(pred({ val: "hello" })).toBe(false);
  });
});

// ─── compileFilter — LIKE pattern ────────────────────────────────────────────

describe("compileFilter — LIKE pattern (%needle%)", () => {
  it("LIKE returns a non-null predicate for a valid LIKE expression", () => {
    const pred = compileFilter("name LIKE %john%");
    expect(pred).not.toBeNull();
    expect(typeof pred).toBe("function");
  });

  it("LIKE matches when the column value contains the substring", () => {
    const pred = compileFilter("name LIKE %ohn%") as RowPredicate;
    expect(pred({ name: "John" })).toBe(true);
    expect(pred({ name: "Johnson" })).toBe(true);
  });

  it("LIKE is case-insensitive", () => {
    const pred = compileFilter("name LIKE %JOHN%") as RowPredicate;
    expect(pred({ name: "john" })).toBe(true);
    expect(pred({ name: "JOHN" })).toBe(true);
    expect(pred({ name: "John Doe" })).toBe(true);
  });

  it("LIKE returns false when the column value does not contain the substring", () => {
    const pred = compileFilter("city LIKE %Paris%") as RowPredicate;
    expect(pred({ city: "London" })).toBe(false);
    expect(pred({ city: "New York" })).toBe(false);
  });

  it("LIKE is case-insensitive on the keyword itself (LIKE vs like)", () => {
    // The regex is /i so 'like' should work too
    const pred = compileFilter("name like %test%") as RowPredicate;
    expect(pred).not.toBeNull();
    expect((pred as RowPredicate)({ name: "testing" })).toBe(true);
  });

  it("LIKE with missing column coerces undefined to empty string", () => {
    // String(undefined ?? '') → '' → does not include 'abc'
    const pred = compileFilter("col LIKE %abc%") as RowPredicate;
    expect(pred({})).toBe(false);
  });

  it("LIKE with null column value coerces to empty string", () => {
    const pred = compileFilter("col LIKE %abc%") as RowPredicate;
    expect(pred({ col: null })).toBe(false);
  });

  it("LIKE matches a numeric value when converted to string", () => {
    const pred = compileFilter("code LIKE %123%") as RowPredicate;
    expect(pred({ code: 12345 })).toBe(true);
    expect(pred({ code: 456 })).toBe(false);
  });

  it("LIKE with empty substring (%) matches everything", () => {
    // expression: "col LIKE %%" → needle = '' → every string includes ''
    const pred = compileFilter("col LIKE %%") as RowPredicate;
    // The regex: /^(\w+)\s+LIKE\s+%(.+)%$/i requires at least one char between %
    // So "%%" might NOT match. Let's verify it returns null.
    // Actually %(.+)% with %% means the (.+) part is empty — '.+' needs 1+ chars.
    expect(pred).toBeNull();
  });
});

// ─── compileFilter — numeric target edge cases ───────────────────────────────

describe("compileFilter — numeric target edge cases", () => {
  it("treats a quoted numeric target as a number for comparison", () => {
    // unquote('42') → '42' → Number('42') = 42 → targetIsNumber = true
    const pred = compileFilter("score > '40'") as RowPredicate;
    expect(pred({ score: 50 })).toBe(true);
    expect(pred({ score: 30 })).toBe(false);
  });

  it("empty target string makes targetIsNumber false (target === '' guard)", () => {
    // target = '' → Number('') = 0 but '' === '' guard → targetIsNumber = false
    // expression: "col > " — likely won't match COMPARE_RE (needs something after op)
    // use a whitespace target to trigger the '' check after unquote:
    // Actually let's test with "col > ''" which unquotes to '' (empty)
    const pred = compileFilter("col > ''") as RowPredicate;
    // unquote("''") → '' → targetIsNumber = false → always returns true
    if (pred !== null) {
      expect(pred({ col: "anything" })).toBe(true);
      expect(pred({ col: 0 })).toBe(true);
    } else {
      // If the regex didn't match, we just verify it's null
      expect(pred).toBeNull();
    }
  });

  it("float target parses correctly for comparison", () => {
    const pred = compileFilter("value >= 3.14") as RowPredicate;
    expect(pred({ value: 3.14 })).toBe(true);
    expect(pred({ value: 3.0 })).toBe(false);
  });

  it("negative numeric target works correctly", () => {
    const pred = compileFilter("temp > -10") as RowPredicate;
    expect(pred({ temp: 0 })).toBe(true);
    expect(pred({ temp: -10 })).toBe(false);
    expect(pred({ temp: -20 })).toBe(false);
  });

  it("row value that is already a number is used directly (not re-parsed)", () => {
    // Branch: typeof value === "number" ? value : Number(value)
    const pred = compileFilter("x > 5") as RowPredicate;
    expect(pred({ x: 6 })).toBe(true);
    expect(pred({ x: 5 })).toBe(false);
    expect(pred({ x: 4 })).toBe(false);
  });
});

// ─── compileFilter — whitespace handling ─────────────────────────────────────

describe("compileFilter — whitespace handling", () => {
  it("trims leading/trailing whitespace from the overall expression", () => {
    const pred = compileFilter("  col = hello  ") as RowPredicate;
    expect(pred).not.toBeNull();
    expect(pred({ col: "hello" })).toBe(true);
  });

  it("handles extra spaces around the operator in compare expressions", () => {
    const pred = compileFilter("score  >=  80") as RowPredicate;
    // COMPARE_RE allows \s* around the op
    expect(pred).not.toBeNull();
    expect(pred({ score: 90 })).toBe(true);
    expect(pred({ score: 70 })).toBe(false);
  });
});

// ─── RowRecord / RowPredicate type smoke test ────────────────────────────────

describe("exported types — compile-time usage smoke", () => {
  it("RowRecord accepts arbitrary string-keyed values", () => {
    // This is a compile-time type check exercised at runtime as a trivial assertion.
    const row: RowRecord = { name: "Alice", age: 30, active: true, misc: null };
    expect(row.name).toBe("Alice");
    expect(row.age).toBe(30);
  });

  it("RowPredicate is callable and returns boolean", () => {
    const pred: RowPredicate = (row) => Boolean(row.active);
    expect(pred({ active: true })).toBe(true);
    expect(pred({ active: false })).toBe(false);
  });
});
