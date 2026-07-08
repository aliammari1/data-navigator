import { describe, expect, it } from "vitest";
import { nullRateFromSummary, numberOrUndefined } from "@/shared/duckdb-summary";

/**
 * Locks in the shared DuckDB SUMMARIZE coercion helpers consolidated out of
 * parsed-data / data-import / agent-canvas. Both are pure and dependency-free.
 */

describe("numberOrUndefined", () => {
  it("returns finite numbers unchanged", () => {
    expect(numberOrUndefined(42)).toBe(42);
    expect(numberOrUndefined(0)).toBe(0);
    expect(numberOrUndefined(-3.5)).toBe(-3.5);
  });

  it("coerces numeric strings to numbers", () => {
    expect(numberOrUndefined("12.5")).toBe(12.5);
    expect(numberOrUndefined("0")).toBe(0);
  });

  it("round-trips bigint COUNT/approx_unique values", () => {
    // Large DuckDB COUNT/approx_unique arrive as bigint; Number() handles it.
    expect(numberOrUndefined(9007199254740991n)).toBe(9007199254740991);
    expect(numberOrUndefined(0n)).toBe(0);
  });

  it("returns undefined for null and undefined", () => {
    expect(numberOrUndefined(null)).toBeUndefined();
    expect(numberOrUndefined(undefined)).toBeUndefined();
  });

  it("returns undefined for non-finite results", () => {
    expect(numberOrUndefined(Number.NaN)).toBeUndefined();
    expect(numberOrUndefined(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(numberOrUndefined(Number.NEGATIVE_INFINITY)).toBeUndefined();
  });

  it("returns undefined for unparseable strings", () => {
    expect(numberOrUndefined("not a number")).toBeUndefined();
    expect(numberOrUndefined("12px")).toBeUndefined();
  });

  it("treats an empty string as zero (Number('') === 0)", () => {
    // Documents the raw helper's behavior; data-import wraps this with its own
    // empty-string guard, so this is the contract of THIS function.
    expect(numberOrUndefined("")).toBe(0);
  });

  it("returns undefined for objects that do not coerce to a number", () => {
    expect(numberOrUndefined({})).toBeUndefined();
    expect(numberOrUndefined([1, 2])).toBeUndefined();
  });
});

describe("nullRateFromSummary", () => {
  it("parses a plain numeric percentage into a 0..1 rate", () => {
    expect(nullRateFromSummary(12.5)).toBeCloseTo(0.125);
    expect(nullRateFromSummary(50)).toBeCloseTo(0.5);
  });

  it("parses a percent-suffixed string", () => {
    expect(nullRateFromSummary("12.5%")).toBeCloseTo(0.125);
    expect(nullRateFromSummary("100%")).toBe(1);
  });

  it("tolerates surrounding whitespace", () => {
    expect(nullRateFromSummary("  25 % ")).toBeCloseTo(0.25);
    expect(nullRateFromSummary("  7.5%  ")).toBeCloseTo(0.075);
  });

  it("returns 0 for the lower boundary", () => {
    expect(nullRateFromSummary(0)).toBe(0);
    expect(nullRateFromSummary("0%")).toBe(0);
  });

  it("returns 1 for a full-null column", () => {
    expect(nullRateFromSummary(100)).toBe(1);
  });

  it("clamps values above 100% down to 1", () => {
    expect(nullRateFromSummary(150)).toBe(1);
    expect(nullRateFromSummary("250%")).toBe(1);
  });

  it("clamps negative values up to 0", () => {
    expect(nullRateFromSummary(-10)).toBe(0);
    expect(nullRateFromSummary("-5%")).toBe(0);
  });

  it("returns 0 for nullish input", () => {
    expect(nullRateFromSummary(null)).toBe(0);
    expect(nullRateFromSummary(undefined)).toBe(0);
  });

  it("returns 0 for unparseable input", () => {
    expect(nullRateFromSummary("n/a")).toBe(0);
    expect(nullRateFromSummary("abc%")).toBe(0);
  });
});
