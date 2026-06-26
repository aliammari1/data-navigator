import { describe, expect, it } from "vitest";
import {
  fmtBucket,
  fmtInt,
  fmtPct,
  fmtRevenue,
  pickColumn,
} from "@/features/deep-analytics/lib/format";

/**
 * Behavioral suite for the deep-analytics formatting helpers.
 * Pure functions — no IO/native/worker deps to mock.
 */

describe("fmtRevenue", () => {
  it("returns the em-dash for NaN", () => {
    expect(fmtRevenue(Number.NaN)).toBe("—");
  });

  it("returns the em-dash for Infinity", () => {
    expect(fmtRevenue(Number.POSITIVE_INFINITY)).toBe("—");
    expect(fmtRevenue(Number.NEGATIVE_INFINITY)).toBe("—");
  });

  it("formats a value >= 1 000 000 with 'M' suffix", () => {
    expect(fmtRevenue(1_000_000)).toBe("1.00M");
    expect(fmtRevenue(2_500_000)).toBe("2.50M");
  });

  it("formats a negative value whose absolute value >= 1 000 000 with 'M' suffix", () => {
    expect(fmtRevenue(-3_000_000)).toBe("-3.00M");
  });

  it("formats a value >= 1 000 and < 1 000 000 with 'K' suffix (no decimals)", () => {
    expect(fmtRevenue(1_000)).toBe("1K");
    expect(fmtRevenue(12_345)).toBe("12K");
  });

  it("formats a negative value whose absolute value >= 1 000 with 'K' suffix", () => {
    expect(fmtRevenue(-5_000)).toBe("-5K");
  });

  it("formats a value < 1 000 as a rounded integer string", () => {
    expect(fmtRevenue(0)).toBe("0");
    expect(fmtRevenue(42)).toBe("42");
    expect(fmtRevenue(999.9)).toBe("1000");
    expect(fmtRevenue(-7.6)).toBe("-8");
  });
});

describe("fmtInt", () => {
  it("returns the em-dash for NaN", () => {
    expect(fmtInt(Number.NaN)).toBe("—");
  });

  it("returns the em-dash for Infinity", () => {
    expect(fmtInt(Number.POSITIVE_INFINITY)).toBe("—");
    expect(fmtInt(Number.NEGATIVE_INFINITY)).toBe("—");
  });

  it("rounds and locale-formats finite values using fr-FR locale", () => {
    // fr-FR uses space as thousands separator
    const result = fmtInt(1234567);
    // Just check it rounds correctly and doesn't throw; locale output varies by environment
    expect(typeof result).toBe("string");
    expect(result).toContain("1");
    expect(result).toContain("234");
    expect(result).toContain("567");
  });

  it("rounds a fractional value before formatting", () => {
    const result = fmtInt(99.7);
    // Math.round(99.7) = 100
    expect(result).toContain("100");
  });

  it("handles zero", () => {
    expect(fmtInt(0)).toBe((0).toLocaleString("fr-FR"));
  });
});

describe("fmtPct", () => {
  it("returns the em-dash for NaN", () => {
    expect(fmtPct(Number.NaN)).toBe("—");
  });

  it("returns the em-dash for Infinity", () => {
    expect(fmtPct(Number.POSITIVE_INFINITY)).toBe("—");
    expect(fmtPct(Number.NEGATIVE_INFINITY)).toBe("—");
  });

  it("formats a finite value with the default 1 decimal digit", () => {
    expect(fmtPct(12.345)).toBe("12.3%");
    expect(fmtPct(0)).toBe("0.0%");
    expect(fmtPct(100)).toBe("100.0%");
  });

  it("formats a value with a custom digits count", () => {
    expect(fmtPct(12.345, 2)).toBe("12.35%");
    expect(fmtPct(12.345, 0)).toBe("12%");
  });

  it("appends a percent sign", () => {
    expect(fmtPct(50)).toMatch(/%$/);
  });
});

describe("fmtBucket", () => {
  it("returns the em-dash for null", () => {
    expect(fmtBucket(null)).toBe("—");
  });

  it("returns the em-dash for undefined", () => {
    expect(fmtBucket(undefined)).toBe("—");
  });

  it("returns the en-CA formatted date string for a valid date string", () => {
    // en-CA locale gives YYYY-MM-DD
    expect(fmtBucket("2023-07-15")).toBe("2023-07-15");
  });

  it("returns a formatted date from a numeric timestamp", () => {
    const ts = new Date("2024-01-01").getTime();
    const result = fmtBucket(ts);
    // Should be a date string like "2024-01-01"
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    // The result should not be the em-dash (it's a valid date)
    expect(result).not.toBe("—");
  });

  it("returns the original stringified value when it cannot be parsed as a date", () => {
    expect(fmtBucket("not-a-date")).toBe("not-a-date");
    expect(fmtBucket("hello world")).toBe("hello world");
  });

  it("converts non-string, non-null values via String() before parsing", () => {
    // A Date object stringified becomes a valid date string
    const d = new Date("2022-06-01");
    const result = fmtBucket(d);
    expect(result).not.toBe("—");
    expect(typeof result).toBe("string");
  });
});

describe("pickColumn", () => {
  it("returns undefined when columns is empty", () => {
    expect(pickColumn([], [/revenue/i])).toBeUndefined();
  });

  it("returns undefined when patterns is empty", () => {
    expect(pickColumn(["revenue", "cost"], [])).toBeUndefined();
  });

  it("returns the first column matching the first pattern", () => {
    expect(pickColumn(["revenue", "cost", "units"], [/revenue/i])).toBe("revenue");
  });

  it("falls through to the second pattern when the first matches nothing", () => {
    const result = pickColumn(["cost", "total_cost"], [/revenue/i, /cost/i]);
    expect(result).toBe("cost");
  });

  it("is case-insensitive when the regex flag is provided", () => {
    expect(pickColumn(["Revenue", "Cost"], [/revenue/i])).toBe("Revenue");
  });

  it("returns undefined when no pattern matches any column", () => {
    expect(pickColumn(["revenue", "cost"], [/profit/i, /units/i])).toBeUndefined();
  });

  it("returns the earliest column that matches within the column list", () => {
    // The first element of columns that satisfies .find() is returned
    expect(pickColumn(["cost", "revenue"], [/revenue/i])).toBe("revenue");
    expect(pickColumn(["revenue", "revenue2"], [/revenue/i])).toBe("revenue");
  });

  it("respects pattern ordering — earlier patterns take priority", () => {
    // /revenue/ is listed before /cost/, so revenue wins even though cost also matches
    const result = pickColumn(["cost", "revenue"], [/revenue/i, /cost/i]);
    expect(result).toBe("revenue");
  });
});
