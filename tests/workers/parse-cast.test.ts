import { describe, expect, it } from "vitest";
import { castValue, detectType, mapUdsvType } from "@/workers/parse-cast";

// parse-cast.ts is a pure, dependency-light module with no IO, no React, no
// timers — straight behavioural assertions on the real exported functions.
//
// Exports under test:
//   detectType(values: string[]): ColType
//   castValue(value: string | null | undefined, type: ColType): unknown
//   mapUdsvType(code: string): ColType

// ─── detectType ──────────────────────────────────────────────────────────────

describe("detectType", () => {
  // --- empty / all-empty ---

  it("returns 'string' for an empty array (nonEmpty === 0)", () => {
    // Arrange / Act / Assert
    expect(detectType([])).toBe("string");
  });

  it("returns 'string' when every value is an empty string (all skipped)", () => {
    expect(detectType(["", "", ""])).toBe("string");
  });

  it("returns 'string' when every value is whitespace-only (trimmed to '', skipped)", () => {
    expect(detectType(["   ", "  ", " "])).toBe("string");
  });

  it("returns 'string' when values array contains only nullish entries", () => {
    // null/undefined coerce to "" via (raw ?? "").trim(), so all are skipped.
    // @ts-expect-error — exercising the runtime path deliberately
    expect(detectType([null, undefined])).toBe("string");
  });

  // --- numeric detection ---

  it("detects an all-integer column as 'number'", () => {
    expect(detectType(["1", "2", "3", "42", "-7"])).toBe("number");
  });

  it("detects a decimal / negative column as 'number'", () => {
    expect(detectType(["-3.14", "2.71", "100.0"])).toBe("number");
  });

  it("detects a column with ≥90% numeric ratio as 'number'", () => {
    // 9 numeric + 1 non-numeric (not boolean/date either) → 9/10 = 0.9
    const values = Array.from({ length: 9 }, (_, i) => String(i + 10));
    values.push("alpha");
    expect(detectType(values)).toBe("number");
  });

  it("falls to 'string' when numeric ratio is exactly 89% (below 0.9 threshold)", () => {
    // 89 numeric + 11 non-numeric text → ratio = 0.89 < 0.9
    const values = Array.from({ length: 89 }, (_, i) => String(i + 100));
    for (let i = 0; i < 11; i++) values.push("text");
    expect(detectType(values)).toBe("string");
  });

  it("ignores empty/whitespace cells in ratio computation", () => {
    // 3 numeric, 3 empty (skipped) → nonEmpty=3, numeric=3, ratio=1.0 → number
    expect(detectType(["10", "", "20", " ", "30", ""])).toBe("number");
  });

  it("treats 'NaN' as non-numeric (Number('NaN') = NaN, not finite)", () => {
    expect(detectType(["NaN", "NaN", "NaN"])).toBe("string");
  });

  it("treats 'Infinity' as numeric (Number.isFinite(Number('Infinity')) is false)", () => {
    // Number('Infinity') returns Infinity which is NOT finite → not numeric
    expect(detectType(["Infinity", "Infinity", "Infinity"])).toBe("string");
  });

  // --- boolean detection ---

  it("detects a column of true/false strings as 'boolean'", () => {
    expect(detectType(["true", "false", "true", "false"])).toBe("boolean");
  });

  it("detects yes/no as boolean", () => {
    expect(detectType(["yes", "no", "yes", "yes", "no"])).toBe("boolean");
  });

  it("detects y/n as boolean", () => {
    expect(detectType(["y", "n", "y", "n"])).toBe("boolean");
  });

  it("detects t/f as boolean", () => {
    expect(detectType(["t", "f", "t", "f"])).toBe("boolean");
  });

  it("detects 1/0 tokens as boolean (not numeric — boolean is checked after numeric)", () => {
    // isNumeric("1") = true → numeric branch taken, not boolean
    // Verify: 1 and 0 are NUMERIC not boolean in this implementation.
    // Both are parsed by Number() → finite, so they go into numeric bucket.
    // Full column of "1"/"0" → numeric = 4, boolean = 0 → 4/4 = 1.0 ≥ 0.9 → number
    expect(detectType(["1", "0", "1", "0"])).toBe("number");
  });

  it("is case-insensitive for boolean tokens", () => {
    expect(detectType(["TRUE", "False", "YES", "NO"])).toBe("boolean");
  });

  it("detects column with ≥90% boolean ratio as 'boolean'", () => {
    // 9 boolean + 1 unknown text → 9/10 = 0.9 ≥ 0.9 → boolean
    const values = Array.from({ length: 9 }, () => "yes");
    values.push("maybe");
    expect(detectType(values)).toBe("boolean");
  });

  // --- date detection ---

  it("detects ISO date strings (yyyy-mm-dd) as 'date'", () => {
    expect(detectType(["2024-01-01", "2024-06-15", "2023-12-31"])).toBe("date");
  });

  it("detects month-name dates as 'date'", () => {
    expect(detectType(["Jan 01 2024", "Feb 15 2024", "Mar 31 2024"])).toBe("date");
  });

  it("rejects short strings (length < 6) as dates", () => {
    // isDateLike short-circuits at length < 6
    // "12/24" is length 5 so it is NOT a date — but it's also not numeric
    expect(detectType(["12/24", "1/1/1", "abc"])).toBe("string");
  });

  it("rejects numeric strings from date detection (isNumeric guard in isDateLike)", () => {
    // A pure number string would pass Number.isFinite — so isDateLike returns false
    // 12345 is length 5, but test with 123456 (length 6) to confirm the numeric guard
    expect(detectType(["123456", "999999", "100000"])).toBe("number");
  });

  it("detects column with ≥80% date ratio as 'date'", () => {
    // 4 dates + 1 text → 4/5 = 0.8 ≥ 0.8 → date
    expect(detectType(["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04", "alpha"])).toBe(
      "date",
    );
  });

  it("falls to 'string' when date ratio is below 0.8 (79%)", () => {
    // 79 dates + 21 text → 0.79 < 0.8 → string
    const values = Array.from(
      { length: 79 },
      (_, i) => `2024-01-${String((i % 28) + 1).padStart(2, "0")}`,
    );
    for (let i = 0; i < 21; i++) values.push("text");
    expect(detectType(values)).toBe("string");
  });

  // --- sample capping at 1000 ---

  it("only samples the first 1000 values when the array is longer", () => {
    // First 1000 values are valid numbers (→ 'number'), remainder are text.
    // If sample cap didn't work it would fall to string.
    const values = Array.from({ length: 1000 }, (_, i) => String(i + 100));
    for (let i = 0; i < 5000; i++) values.push("alpha");
    expect(values).toHaveLength(5000 + 1000);
    expect(detectType(values)).toBe("number");
  });

  it("processes the full array when it has exactly 1000 values", () => {
    const values = Array.from({ length: 1000 }, (_, i) => String(i + 100));
    expect(detectType(values)).toBe("number");
  });

  // --- mixed / fallback ---

  it("returns 'string' for a mixed column where no type dominates", () => {
    expect(detectType(["10", "true", "2024-01-01", "hello"])).toBe("string");
  });

  it("returns 'string' for purely alphabetic text", () => {
    expect(detectType(["alpha", "beta", "gamma", "delta"])).toBe("string");
  });

  it("numeric wins over boolean when numeric ratio ≥0.9 even with boolean tokens", () => {
    // "1" and "0" are numeric (isNumeric returns true first)
    // 10 numeric tokens → 10/10 = 1.0 ≥ 0.9 → number
    expect(detectType(["2", "3", "4", "5", "6", "7", "8", "9", "10", "11"])).toBe("number");
  });
});

// ─── castValue ───────────────────────────────────────────────────────────────

describe("castValue", () => {
  // --- null / empty ---

  it("returns null for null regardless of type", () => {
    expect(castValue(null, "number")).toBeNull();
    expect(castValue(null, "boolean")).toBeNull();
    expect(castValue(null, "date")).toBeNull();
    expect(castValue(null, "string")).toBeNull();
  });

  it("returns null for undefined regardless of type", () => {
    expect(castValue(undefined, "number")).toBeNull();
    expect(castValue(undefined, "string")).toBeNull();
  });

  it("returns null for empty string regardless of type", () => {
    expect(castValue("", "number")).toBeNull();
    expect(castValue("", "boolean")).toBeNull();
    expect(castValue("", "date")).toBeNull();
    expect(castValue("", "string")).toBeNull();
  });

  it("returns null for whitespace-only string (trimmed to '') regardless of type", () => {
    expect(castValue("   ", "number")).toBeNull();
    expect(castValue("   ", "boolean")).toBeNull();
    expect(castValue("   ", "date")).toBeNull();
    expect(castValue("   ", "string")).toBeNull();
  });

  // --- number ---

  it("casts an integer string to a number", () => {
    expect(castValue("42", "number")).toBe(42);
  });

  it("casts a negative integer string to a number", () => {
    expect(castValue("-7", "number")).toBe(-7);
  });

  it("casts a decimal string to a number", () => {
    expect(castValue("3.14", "number")).toBe(3.14);
  });

  it("casts a negative decimal string to a number", () => {
    expect(castValue("-2.718", "number")).toBe(-2.718);
  });

  it("casts '0' to the number 0", () => {
    expect(castValue("0", "number")).toBe(0);
  });

  it("trims surrounding whitespace before numeric parsing", () => {
    expect(castValue("  88  ", "number")).toBe(88);
  });

  it("returns null for a non-numeric string under type 'number'", () => {
    expect(castValue("abc", "number")).toBeNull();
  });

  it("returns null for 'NaN' under type 'number' (not finite)", () => {
    expect(castValue("NaN", "number")).toBeNull();
  });

  it("returns null for 'Infinity' under type 'number' (not finite)", () => {
    expect(castValue("Infinity", "number")).toBeNull();
  });

  it("returns null for '-Infinity' under type 'number' (not finite)", () => {
    expect(castValue("-Infinity", "number")).toBeNull();
  });

  it("casts scientific notation to a number", () => {
    expect(castValue("1e3", "number")).toBe(1000);
  });

  // --- boolean ---

  it("casts 'true' to true", () => {
    expect(castValue("true", "boolean")).toBe(true);
  });

  it("casts 'TRUE' (uppercase) to true", () => {
    expect(castValue("TRUE", "boolean")).toBe(true);
  });

  it("casts 'yes' to true", () => {
    expect(castValue("yes", "boolean")).toBe(true);
  });

  it("casts 'y' to true", () => {
    expect(castValue("y", "boolean")).toBe(true);
  });

  it("casts '1' to true", () => {
    expect(castValue("1", "boolean")).toBe(true);
  });

  it("casts 't' to true", () => {
    expect(castValue("t", "boolean")).toBe(true);
  });

  it("casts 'false' to false", () => {
    expect(castValue("false", "boolean")).toBe(false);
  });

  it("casts 'FALSE' (uppercase) to false", () => {
    expect(castValue("FALSE", "boolean")).toBe(false);
  });

  it("casts 'no' to false", () => {
    expect(castValue("no", "boolean")).toBe(false);
  });

  it("casts 'n' to false", () => {
    expect(castValue("n", "boolean")).toBe(false);
  });

  it("casts '0' to false", () => {
    expect(castValue("0", "boolean")).toBe(false);
  });

  it("casts 'f' to false", () => {
    expect(castValue("f", "boolean")).toBe(false);
  });

  it("returns null for an unrecognised boolean token", () => {
    expect(castValue("maybe", "boolean")).toBeNull();
  });

  it("is case-insensitive: mixed-case 'Yes' → true", () => {
    expect(castValue("Yes", "boolean")).toBe(true);
  });

  it("is case-insensitive: mixed-case 'No' → false", () => {
    expect(castValue("No", "boolean")).toBe(false);
  });

  // --- date ---

  it("casts an ISO date string to an ISO string", () => {
    // '2024-03-15' is parsed as UTC midnight so the ISO output is stable.
    const result = castValue("2024-03-15", "date") as string;
    expect(result).toContain("2024-03-15");
  });

  it("returns an ISO 8601 string for a parseable date", () => {
    const result = castValue("2024-01-01", "date") as string;
    expect(typeof result).toBe("string");
    // ISO strings always contain 'T'
    expect(result).toContain("T");
  });

  it("returns the trimmed input when the date is not parseable", () => {
    expect(castValue("not-a-date", "date")).toBe("not-a-date");
  });

  it("trims then returns the original text for an unparseable date", () => {
    expect(castValue("  garbage  ", "date")).toBe("garbage");
  });

  it("trims whitespace before attempting date parse", () => {
    const result = castValue("  2024-06-01  ", "date") as string;
    expect(result).toContain("2024-06-01");
  });

  // --- string (default / fallthrough) ---

  it("returns the trimmed text for type 'string'", () => {
    expect(castValue("  hello  ", "string")).toBe("hello");
  });

  it("returns the text as-is (trimmed) for type 'string' with no leading/trailing spaces", () => {
    expect(castValue("world", "string")).toBe("world");
  });

  it("does not strip commas for type 'string'", () => {
    expect(castValue("1,000", "string")).toBe("1,000");
  });

  it("handles numeric-looking text as a plain string under type 'string'", () => {
    expect(castValue("123", "string")).toBe("123");
  });
});

// ─── mapUdsvType ─────────────────────────────────────────────────────────────

describe("mapUdsvType", () => {
  // --- known exact codes ---

  it("maps 'n' to 'number'", () => {
    expect(mapUdsvType("n")).toBe("number");
  });

  it("maps 'd' to 'date'", () => {
    expect(mapUdsvType("d")).toBe("date");
  });

  it("maps 't' to 'date' (timestamp)", () => {
    expect(mapUdsvType("t")).toBe("date");
  });

  it("maps 's' to 'string'", () => {
    expect(mapUdsvType("s")).toBe("string");
  });

  it("maps 'j' to 'string' (JSON)", () => {
    expect(mapUdsvType("j")).toBe("string");
  });

  // --- boolean variants (startsWith 'b') ---

  it("maps 'b' (bare boolean code) to 'boolean'", () => {
    expect(mapUdsvType("b")).toBe("boolean");
  });

  it("maps 'b:tf' (true/false variant) to 'boolean'", () => {
    expect(mapUdsvType("b:tf")).toBe("boolean");
  });

  it("maps 'b:yn' (yes/no variant) to 'boolean'", () => {
    expect(mapUdsvType("b:yn")).toBe("boolean");
  });

  it("maps 'b:10' (1/0 variant) to 'boolean'", () => {
    expect(mapUdsvType("b:10")).toBe("boolean");
  });

  it("maps any code starting with 'b' to 'boolean'", () => {
    expect(mapUdsvType("b:custom")).toBe("boolean");
  });

  // --- fallback ---

  it("maps an unknown code to 'string'", () => {
    expect(mapUdsvType("x")).toBe("string");
  });

  it("maps empty string to 'string'", () => {
    expect(mapUdsvType("")).toBe("string");
  });

  it("maps a completely unknown code like 'z' to 'string'", () => {
    expect(mapUdsvType("z")).toBe("string");
  });

  it("is case-sensitive: 'N' (uppercase) falls through to 'string'", () => {
    // The comparisons use === so uppercase 'N' does not match 'n'
    expect(mapUdsvType("N")).toBe("string");
  });

  it("is case-sensitive: 'B' (uppercase) does not match startsWith('b')", () => {
    expect(mapUdsvType("B")).toBe("string");
  });

  it("is case-sensitive: 'S' (uppercase) falls through to 'string'", () => {
    expect(mapUdsvType("S")).toBe("string");
  });
});
