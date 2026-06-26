import { describe, expect, it } from "vitest";
import { castValue, detectType, profileColumn } from "@/features/csv-parser/lib/profile";
import type { ColProfile } from "@/features/csv-parser/lib/types";

// profile.ts is a pure, dependency-light module (only `simple-statistics`).
// No IO, no React, no timers — straight behavioral assertions on real output.
//
// Note on `simple-statistics`: `standardDeviation` is the POPULATION stdev
// (divides by N, not N-1), verified directly: stdev([1,2]) === 0.5.

// ─── detectType ──────────────────────────────────────────────────────────────

describe("detectType", () => {
  it("returns 'string' for an empty column (total === 0)", () => {
    // Arrange / Act / Assert
    expect(detectType([])).toBe("string");
  });

  it("returns 'string' when every value is nullish (all skipped → total 0)", () => {
    expect(detectType([null, undefined, ""])).toBe("string");
  });

  it("detects a clean numeric column", () => {
    expect(detectType(["10", "20", "30.5", "-4"])).toBe("number");
  });

  it("treats comma-grouped numbers as numeric (commas are stripped)", () => {
    expect(detectType(["1,000", "2,500", "3,000"])).toBe("number");
  });

  it("accepts numeric values passed as real numbers, not strings", () => {
    // Values are stringified internally. 1/0 are bool tokens, so use 2..5 to
    // keep all four stringified values in the numeric branch.
    expect(detectType([2, 3, 4, 5])).toBe("number");
  });

  it("classifies [1,2,3,4] as 'string' because '1' is a boolean token", () => {
    // After String()+lowercase: "1" is a BOOL token, "2"/"3"/"4" are numbers.
    // → 3/4 = 0.75 numeric (≤ 0.85) and 1/4 boolean → neither threshold met.
    expect(detectType([1, 2, 3, 4])).toBe("string");
  });

  it("does NOT count '0' and '1' as numbers because they are boolean tokens (checked first)", () => {
    // BOOL_TOKENS includes "1" and "0", and the boolean branch is evaluated
    // before the number branch — so a column of 0/1 is detected as boolean.
    expect(detectType(["1", "0", "1", "0"])).toBe("boolean");
  });

  it("detects a boolean column from word tokens (true/false/yes/no/oui/non)", () => {
    expect(detectType(["true", "false", "yes", "no", "oui", "non"])).toBe("boolean");
  });

  it("is case-insensitive for boolean tokens", () => {
    expect(detectType(["TRUE", "False", "Yes", "NO"])).toBe("boolean");
  });

  it("detects ISO (yyyy-mm-dd) dates", () => {
    expect(detectType(["2024-01-01", "2024-02-15", "2023-12-31"])).toBe("date");
  });

  it("detects slash (dd/mm/yyyy) dates", () => {
    expect(detectType(["01/01/2024", "15/02/2024", "31/12/2023"])).toBe("date");
  });

  it("falls back to 'string' for free text", () => {
    expect(detectType(["alpha", "beta", "gamma"])).toBe("string");
  });

  it("uses a strict > 0.85 threshold: exactly 0.85 numeric stays 'string'", () => {
    // 17 numbers out of 20 = 0.85 exactly → NOT > 0.85 → falls through to string.
    const values = [
      ...Array.from({ length: 17 }, (_, i) => String(i + 100)),
      "x",
      "y",
      "z",
    ];
    expect(values).toHaveLength(20);
    expect(detectType(values)).toBe("string");
  });

  it("crosses the threshold just above 0.85 → 'number'", () => {
    // 18 numbers out of 20 = 0.90 > 0.85 → number.
    const values = [
      ...Array.from({ length: 18 }, (_, i) => String(i + 100)),
      "x",
      "y",
    ];
    expect(detectType(values)).toBe("number");
  });

  it("ignores nullish cells when computing the ratio (they are not part of total)", () => {
    // 3 numbers, plus 5 nullish that are skipped → total = 3 → 3/3 = 1.0 > 0.85.
    expect(detectType(["10", null, "20", "", "30", undefined])).toBe("number");
  });

  it("treats whitespace-only strings as non-numeric and non-date (trimmed to '')", () => {
    // "   " is NOT nullish (not exactly ""), counts toward total, but the trimmed
    // text is "" so it matches neither boolean, number (text !== "" guard), nor date.
    expect(detectType(["   ", "  ", " "])).toBe("string");
  });

  it("does NOT count 'Infinity' as numeric because detection lowercases first", () => {
    // detectType lowercases the text, and Number("infinity") is NaN (only the
    // exact-case "Infinity" parses). So these do not register as numbers.
    expect(detectType(["Infinity", "-Infinity"])).toBe("string");
  });

  it("returns 'string' for a mixed column where no single type dominates", () => {
    expect(detectType(["10", "true", "2024-01-01", "hello"])).toBe("string");
  });
});

// ─── castValue ───────────────────────────────────────────────────────────────

describe("castValue", () => {
  it("returns null for null / undefined / empty-string regardless of type", () => {
    expect(castValue(null, "number")).toBeNull();
    expect(castValue(undefined, "string")).toBeNull();
    expect(castValue("", "boolean")).toBeNull();
    expect(castValue("", "date")).toBeNull();
  });

  // --- number ---
  it("casts a numeric string to a number", () => {
    expect(castValue("42", "number")).toBe(42);
  });

  it("casts a negative / decimal numeric string", () => {
    expect(castValue("-3.5", "number")).toBe(-3.5);
  });

  it("strips commas before parsing a number", () => {
    expect(castValue("1,234,567", "number")).toBe(1234567);
  });

  it("trims surrounding whitespace before numeric parsing", () => {
    expect(castValue("  88  ", "number")).toBe(88);
  });

  it("returns null for a non-numeric string under type 'number'", () => {
    expect(castValue("abc", "number")).toBeNull();
  });

  it("returns Infinity for 'Infinity' under type 'number' (Number parses it)", () => {
    expect(castValue("Infinity", "number")).toBe(Number.POSITIVE_INFINITY);
  });

  // --- boolean ---
  it("casts true-tokens to true (case-insensitive)", () => {
    expect(castValue("TRUE", "boolean")).toBe(true);
    expect(castValue("1", "boolean")).toBe(true);
    expect(castValue("yes", "boolean")).toBe(true);
    expect(castValue("OUI", "boolean")).toBe(true);
  });

  it("casts false-tokens to false (case-insensitive)", () => {
    expect(castValue("false", "boolean")).toBe(false);
    expect(castValue("0", "boolean")).toBe(false);
    expect(castValue("No", "boolean")).toBe(false);
    expect(castValue("non", "boolean")).toBe(false);
  });

  it("returns null for an unrecognized boolean token", () => {
    expect(castValue("maybe", "boolean")).toBeNull();
  });

  // --- date ---
  it("casts a valid ISO date to yyyy-mm-dd (UTC-stable input)", () => {
    // ISO 'yyyy-mm-dd' is parsed as UTC midnight by `new Date`, so slicing the
    // ISO string is timezone-stable across machines.
    expect(castValue("2024-03-15", "date")).toBe("2024-03-15");
  });

  it("returns a 10-char yyyy-mm-dd string for a parseable date", () => {
    const result = castValue("2024-12-31", "date");
    expect(result).toBe("2024-12-31");
    expect(typeof result).toBe("string");
    expect(result as string).toHaveLength(10);
  });

  it("returns the original (trimmed) text when the date is unparseable", () => {
    // new Date('not-a-date') is Invalid → getTime() NaN → returns the text itself.
    expect(castValue("not-a-date", "date")).toBe("not-a-date");
  });

  it("trims the text before returning it on an unparseable date", () => {
    expect(castValue("  garbage  ", "date")).toBe("garbage");
  });

  // --- string (default) ---
  it("returns the trimmed text for type 'string'", () => {
    expect(castValue("  hello  ", "string")).toBe("hello");
  });

  it("stringifies a non-string value under type 'string'", () => {
    expect(castValue(123, "string")).toBe("123");
  });

  it("does not strip commas for type 'string'", () => {
    expect(castValue("1,000", "string")).toBe("1,000");
  });
});

// ─── profileColumn ───────────────────────────────────────────────────────────

describe("profileColumn", () => {
  it("returns a base profile with zero stats for an all-null column", () => {
    const profile = profileColumn("c", [null, undefined, ""], "string");

    expect(profile).toEqual<ColProfile>({
      name: "c",
      type: "string",
      nullCount: 3,
      distinctApprox: 0,
      numericCount: 0,
    });
    // No numeric extras when there are no numbers.
    expect(profile.min).toBeUndefined();
    expect(profile.hist).toBeUndefined();
  });

  it("returns an empty base profile for an empty column", () => {
    const profile = profileColumn("empty", [], "number");

    expect(profile.nullCount).toBe(0);
    expect(profile.distinctApprox).toBe(0);
    expect(profile.numericCount).toBe(0);
    expect(profile.min).toBeUndefined();
  });

  it("counts nulls and distinct string values", () => {
    const profile = profileColumn("s", ["a", "b", "a", null, "", "c"], "string");

    expect(profile.nullCount).toBe(2); // null and ""
    expect(profile.distinctApprox).toBe(3); // a, b, c
    expect(profile.numericCount).toBe(0); // not a number column
  });

  it("treats only null/undefined/'' as null — '0' and false-ish text are real values", () => {
    const profile = profileColumn("s", ["0", "false", "  "], "string");

    expect(profile.nullCount).toBe(0);
    expect(profile.distinctApprox).toBe(3);
  });

  it("does NOT collect numeric stats when type is not 'number' even if values are numbers", () => {
    // The numeric push is guarded by `type === "number"`.
    const profile = profileColumn("misclassified", [1, 2, 3], "string");

    expect(profile.numericCount).toBe(0);
    expect(profile.min).toBeUndefined();
    expect(profile.distinctApprox).toBe(3); // distinct still counts via String()
  });

  it("does NOT collect numeric stats for string-encoded numbers under a 'number' type", () => {
    // The push is also guarded by `typeof value === "number"`. Strings like "1"
    // are NOT cast here (profileColumn profiles ALREADY-cast values).
    const profile = profileColumn("strnums", ["1", "2", "3"], "number");

    expect(profile.numericCount).toBe(0);
    expect(profile.min).toBeUndefined();
  });

  it("computes numeric stats over actual numbers (population stdev)", () => {
    const profile = profileColumn("n", [1, 2, 3, 4, 5], "number");

    expect(profile.numericCount).toBe(5);
    expect(profile.min).toBe(1);
    expect(profile.max).toBe(5);
    expect(profile.mean).toBeCloseTo(3, 10);
    expect(profile.median).toBeCloseTo(3, 10);
    // population stdev of 1..5 = sqrt(2) ≈ 1.41421356
    expect(profile.stdev).toBeCloseTo(Math.SQRT2, 10);
  });

  it("computes the median of an even-length set as the midpoint average", () => {
    const profile = profileColumn("n", [1, 2, 3, 4], "number");

    expect(profile.median).toBeCloseTo(2.5, 10);
    expect(profile.mean).toBeCloseTo(2.5, 10);
  });

  it("sorts before computing min/max even when input is unordered", () => {
    const profile = profileColumn("n", [9, -3, 4, 0, 7], "number");

    expect(profile.min).toBe(-3);
    expect(profile.max).toBe(9);
  });

  it("handles negative and fractional numbers", () => {
    const profile = profileColumn("n", [-2.5, -1, 0, 1.5], "number");

    expect(profile.min).toBe(-2.5);
    expect(profile.max).toBe(1.5);
    expect(profile.mean).toBeCloseTo(-0.5, 10);
  });

  it("sets stdev to 0 for a single numeric value (length === 1 short-circuit)", () => {
    const profile = profileColumn("n", [42], "number");

    expect(profile.numericCount).toBe(1);
    expect(profile.min).toBe(42);
    expect(profile.max).toBe(42);
    expect(profile.mean).toBe(42);
    expect(profile.median).toBe(42);
    expect(profile.stdev).toBe(0);
  });

  it("ignores nulls inside a numeric column when computing stats", () => {
    const profile = profileColumn("n", [10, null, 20, "", 30, undefined], "number");

    expect(profile.nullCount).toBe(3);
    expect(profile.numericCount).toBe(3);
    expect(profile.min).toBe(10);
    expect(profile.max).toBe(30);
    expect(profile.mean).toBeCloseTo(20, 10);
  });

  // --- histogram (exercised through profileColumn) ---

  it("produces a single-bucket histogram when all numbers are equal (lo === hi)", () => {
    const profile = profileColumn("n", [5, 5, 5, 5], "number");

    expect(profile.hist).toEqual([{ x0: 5, x1: 5, n: 4 }]);
  });

  it("buckets a numeric range and conserves the total count across bins", () => {
    const profile = profileColumn("n", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "number");

    expect(profile.hist).toBeDefined();
    const hist = profile.hist as NonNullable<ColProfile["hist"]>;
    // bucket count = min(24, max(1, n)) = min(24, 11) = 11 buckets.
    expect(hist).toHaveLength(11);
    // first bin starts at the min, last bin ends at the max.
    expect(hist[0].x0).toBe(0);
    expect(hist[hist.length - 1].x1).toBe(10);
    // every value lands in exactly one bin → counts sum to the input length.
    const total = hist.reduce((sum, bin) => sum + bin.n, 0);
    expect(total).toBe(11);
  });

  it("places the maximum value in the last bucket (clamped index)", () => {
    // The max value's raw bucket index === buckets, which is clamped to buckets-1.
    const profile = profileColumn("n", [0, 10], "number");
    const hist = profile.hist as NonNullable<ColProfile["hist"]>;

    // n = 2 → buckets = 2. Both endpoints accounted for, total preserved.
    expect(hist).toHaveLength(2);
    expect(hist.reduce((sum, b) => sum + b.n, 0)).toBe(2);
    expect(hist[0].n).toBe(1); // the 0
    expect(hist[hist.length - 1].n).toBe(1); // the 10, clamped into the last bin
  });

  it("caps the histogram at 24 buckets for large numeric columns", () => {
    const values = Array.from({ length: 100 }, (_, i) => i);
    const profile = profileColumn("n", values, "number");
    const hist = profile.hist as NonNullable<ColProfile["hist"]>;

    expect(hist).toHaveLength(24); // min(24, max(1, 100))
    expect(hist.reduce((sum, b) => sum + b.n, 0)).toBe(100);
  });

  it("BUG: throws when a numeric column contains NaN (histogram index is NaN)", () => {
    // typeof NaN === "number", so NaN is pushed into the numeric set. In
    // histogram(), Math.floor((NaN - lo) / width) === NaN, and neither
    // `NaN >= buckets` nor `NaN < 0` is true, so `bins[NaN]` is undefined and
    // `bins[index].n += 1` throws. This documents CURRENT (buggy) behavior.
    expect(() => profileColumn("n", [1, 2, Number.NaN], "number")).toThrow(TypeError);
  });

  it("carries the provided name and type through onto the profile", () => {
    const profile = profileColumn("revenue", [100, 200], "number");

    expect(profile.name).toBe("revenue");
    expect(profile.type).toBe("number");
  });
});
