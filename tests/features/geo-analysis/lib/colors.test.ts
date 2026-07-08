import { describe, it, expect } from "vitest";
import {
  successRateToColor,
  successRateToFill,
  channelColor,
} from "@/features/geo-analysis/lib/colors";

describe("successRateToColor", () => {
  it("returns red hue (0) when rate is at or below 70", () => {
    expect(successRateToColor(70)).toBe("hsl(0, 70%, 50%)");
  });

  it("returns green hue (120) when rate is at or above 100", () => {
    expect(successRateToColor(100)).toBe("hsl(120, 70%, 50%)");
  });

  it("returns midpoint hue (60) when rate is exactly 85", () => {
    expect(successRateToColor(85)).toBe("hsl(60, 70%, 50%)");
  });

  it("clamps rate below 70 to 0 hue", () => {
    expect(successRateToColor(0)).toBe("hsl(0, 70%, 50%)");
    expect(successRateToColor(-10)).toBe("hsl(0, 70%, 50%)");
    expect(successRateToColor(50)).toBe("hsl(0, 70%, 50%)");
  });

  it("clamps rate above 100 to 120 hue", () => {
    expect(successRateToColor(110)).toBe("hsl(120, 70%, 50%)");
    expect(successRateToColor(200)).toBe("hsl(120, 70%, 50%)");
  });

  it("computes intermediate hue correctly for rate 80", () => {
    // pct = (80-70)/30 = 1/3, hue = round(1/3 * 120) = round(40) = 40
    expect(successRateToColor(80)).toBe("hsl(40, 70%, 50%)");
  });

  it("computes intermediate hue correctly for rate 90", () => {
    // pct = (90-70)/30 = 2/3, hue = round(2/3 * 120) = round(80) = 80
    expect(successRateToColor(90)).toBe("hsl(80, 70%, 50%)");
  });
});

describe("successRateToFill", () => {
  it("uses default alpha of 0.7 when not provided", () => {
    expect(successRateToFill(70)).toBe("hsla(0, 70%, 50%, 0.7)");
  });

  it("uses provided alpha", () => {
    expect(successRateToFill(70, 0.5)).toBe("hsla(0, 70%, 50%, 0.5)");
    expect(successRateToFill(100, 1)).toBe("hsla(120, 70%, 50%, 1)");
  });

  it("clamps rate below 70 to 0 hue", () => {
    expect(successRateToFill(0)).toBe("hsla(0, 70%, 50%, 0.7)");
    expect(successRateToFill(50, 0.3)).toBe("hsla(0, 70%, 50%, 0.3)");
  });

  it("clamps rate above 100 to 120 hue", () => {
    expect(successRateToFill(150)).toBe("hsla(120, 70%, 50%, 0.7)");
  });

  it("computes green hue at rate 100", () => {
    expect(successRateToFill(100)).toBe("hsla(120, 70%, 50%, 0.7)");
  });

  it("computes intermediate hue for rate 85", () => {
    // pct = (85-70)/30 = 0.5, hue = round(60) = 60
    expect(successRateToFill(85, 0.9)).toBe("hsla(60, 70%, 50%, 0.9)");
  });
});

// channelColor picks a color out of an internal CHANNEL_HUES palette by index
// (mod length). The specific hue values are an arbitrary design choice (there
// is no independent spec to derive them from), so pinning every index's exact
// hex/hsl string only proves the test copies the same table the source uses —
// it can't catch a wrong-but-plausible hue. Instead we assert the structural
// invariants that would actually catch real bugs: every output is a
// well-formed hsl() string, calls are deterministic, the palette's colors are
// mutually distinct (so channels stay visually distinguishable), and the
// modulo wraparound genuinely reuses earlier colors rather than producing
// something new. We keep exactly one pinned literal as a canary against an
// accidental edit to the palette's first entry.
describe("channelColor", () => {
  const HSL_PATTERN = /^hsl\((\d{1,3}), 65%, 55%\)$/;
  // Number of distinct hues in the source's CHANNEL_HUES palette.
  const PALETTE_SIZE = 10;

  it("returns a well-formed hsl() string with fixed 65% saturation and 55% lightness for every palette index", () => {
    for (let i = 0; i < PALETTE_SIZE; i++) {
      const color = channelColor(i);
      expect(color).toMatch(HSL_PATTERN);
      const hue = Number(color.match(HSL_PATTERN)?.[1]);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it("is deterministic: repeated calls with the same index return the same color", () => {
    for (let i = 0; i < PALETTE_SIZE; i++) {
      expect(channelColor(i)).toBe(channelColor(i));
    }
  });

  it("assigns a visually distinct hue to each of the palette's channels (no accidental duplicates)", () => {
    const colors = Array.from({ length: PALETTE_SIZE }, (_, i) => channelColor(i));
    expect(new Set(colors).size).toBe(PALETTE_SIZE);
  });

  it("wraps around via modulo so index >= palette size reuses the earlier channel's color", () => {
    expect(channelColor(10)).toBe(channelColor(0));
    expect(channelColor(11)).toBe(channelColor(1));
    expect(channelColor(20)).toBe(channelColor(0));
    // Wraparound must land on the same index it mirrors, not just any earlier color.
    expect(channelColor(12)).not.toBe(channelColor(1));
  });

  it("pins the documented first palette color as a canary against accidental edits to CHANNEL_HUES", () => {
    expect(channelColor(0)).toBe("hsl(220, 65%, 55%)");
  });
});
