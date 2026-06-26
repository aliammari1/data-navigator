import { describe, it, expect } from "vitest";
import { formatNumber, csvEscape } from "@/features/parsed-data/model/format";

describe("formatNumber", () => {
  it("returns em dash when value is undefined", () => {
    expect(formatNumber(undefined)).toBe("—");
  });

  it("returns em dash when value is NaN", () => {
    expect(formatNumber(Number.NaN)).toBe("—");
  });

  it("formats a normal integer with default digits", () => {
    const result = formatNumber(1000);
    // Should be a valid locale string containing digits
    expect(result).toMatch(/1[,.]?000/);
  });

  it("formats a float with default 2 decimal digits", () => {
    const result = formatNumber(3.14159);
    // Should round to 2 decimal places at most
    expect(result).toMatch(/3[.,]14/);
  });

  it("formats a number with custom digits parameter", () => {
    const result = formatNumber(3.14159, 4);
    // maximumFractionDigits=4 rounds 3.14159 to 3.1416
    expect(result).toMatch(/3[.,]1416/);
  });

  it("formats zero correctly", () => {
    const result = formatNumber(0);
    expect(result).toBe("0");
  });

  it("formats negative numbers", () => {
    const result = formatNumber(-42.5);
    expect(result).toMatch(/-42[.,]5/);
  });

  it("formats with 0 digits parameter", () => {
    const result = formatNumber(3.14, 0);
    expect(result).toBe("3");
  });
});

describe("csvEscape", () => {
  it("returns empty string for null", () => {
    expect(csvEscape(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(csvEscape(undefined)).toBe("");
  });

  it("wraps in quotes when value contains a comma", () => {
    expect(csvEscape("hello,world")).toBe('"hello,world"');
  });

  it("wraps in quotes and escapes double-quotes when value contains a quote", () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it("wraps in quotes when value contains a newline", () => {
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });

  it("returns plain string for simple values with no special chars", () => {
    expect(csvEscape("hello")).toBe("hello");
  });

  it("handles numbers by converting to string", () => {
    expect(csvEscape(42)).toBe("42");
  });

  it("handles boolean true", () => {
    expect(csvEscape(true)).toBe("true");
  });

  it("handles boolean false", () => {
    expect(csvEscape(false)).toBe("false");
  });

  it("handles empty string", () => {
    expect(csvEscape("")).toBe("");
  });

  it("handles value with both comma and quote", () => {
    expect(csvEscape('a,b"c')).toBe('"a,b""c"');
  });

  it("handles value with multiple quotes", () => {
    expect(csvEscape('""double""')).toBe('"""""double"""""');
  });

  it("handles objects by converting to [object Object]", () => {
    expect(csvEscape({})).toBe("[object Object]");
  });

  it("handles string with only newline", () => {
    expect(csvEscape("\n")).toBe('"\n"');
  });
});
