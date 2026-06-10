import { describe, expect, it } from "vitest";
import {
  clamp,
  fmtAmount,
  fmtCompact,
  fmtDuration,
  fmtN,
  fmtPct,
  movingAverage,
  safeNum,
} from "@/features/telecom/lib/format";

// fr-FR formatting uses non-ASCII separators; normalise whitespace before asserting.
const norm = (s: string) => s.replace(/\s/g, "");

describe("fmtN", () => {
  it("formats integers without decimals by default", () => {
    expect(norm(fmtN(1234))).toBe("1234");
  });
  it("respects the requested decimal precision", () => {
    expect(norm(fmtN(1234.5, 1))).toBe("1234,5");
  });
});

describe("fmtCompact", () => {
  it("uses compact notation for large numbers", () => {
    // 1 200 000 -> "1,2 M" in fr-FR
    expect(fmtCompact(1_200_000)).toMatch(/M/);
  });
});

describe("fmtAmount", () => {
  it("always renders three decimals", () => {
    expect(norm(fmtAmount(5))).toBe("5,000");
  });
});

describe("fmtPct", () => {
  it("floors to one decimal to avoid rounding up to 100%", () => {
    expect(fmtPct(99.97)).toBe("99.9%");
  });
  it("drops the trailing .0", () => {
    expect(fmtPct(50)).toBe("50%");
    expect(fmtPct(100)).toBe("100%");
  });
  it("uses a <0.1% floor for tiny positive values", () => {
    expect(fmtPct(0.05)).toBe("<0.1%");
  });
});

describe("fmtDuration", () => {
  it("returns a dash for non-positive / non-finite input", () => {
    expect(fmtDuration(0)).toBe("—");
    expect(fmtDuration(-5)).toBe("—");
    expect(fmtDuration(Number.NaN)).toBe("—");
  });
  it("renders milliseconds under a second", () => {
    expect(fmtDuration(500)).toBe("500ms");
  });
  it("renders seconds with two decimals at or above a second", () => {
    expect(fmtDuration(1500)).toBe("1.50s");
  });
});

describe("safeNum", () => {
  it("returns finite numbers unchanged", () => {
    expect(safeNum(42)).toBe(42);
  });
  it("coerces numeric strings", () => {
    expect(safeNum("3.14")).toBeCloseTo(3.14);
  });
  it("falls back to 0 for non-numeric input", () => {
    expect(safeNum("not a number")).toBe(0);
    expect(safeNum(undefined)).toBe(0);
    expect(safeNum(null)).toBe(0);
  });
  it("unwraps the first element of a typed array (DuckDB aggregate shape)", () => {
    expect(safeNum(new Uint32Array([7, 9]))).toBe(7);
  });
});

describe("clamp", () => {
  it("clamps below the lower bound", () => {
    expect(clamp(-1, 0, 10)).toBe(0);
  });
  it("clamps above the upper bound", () => {
    expect(clamp(99, 0, 10)).toBe(10);
  });
  it("passes through values within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
});

describe("movingAverage", () => {
  it("computes a rolling mean", () => {
    expect(movingAverage([1, 2, 3, 4], 2)).toEqual([1.5, 2.5, 3.5]);
  });
  it("returns an empty array when the window exceeds the data", () => {
    expect(movingAverage([1], 2)).toEqual([]);
  });
  it("returns an empty array for an invalid window", () => {
    expect(movingAverage([1, 2, 3], 0)).toEqual([]);
  });
});
