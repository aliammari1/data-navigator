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

describe("channelColor", () => {
  it("returns hsl color for index 0", () => {
    expect(channelColor(0)).toBe("hsl(220, 65%, 55%)");
  });

  it("returns hsl color for index 1", () => {
    expect(channelColor(1)).toBe("hsl(160, 65%, 55%)");
  });

  it("returns hsl color for index 2", () => {
    expect(channelColor(2)).toBe("hsl(280, 65%, 55%)");
  });

  it("returns hsl color for index 3", () => {
    expect(channelColor(3)).toBe("hsl(40, 65%, 55%)");
  });

  it("returns hsl color for index 4", () => {
    expect(channelColor(4)).toBe("hsl(200, 65%, 55%)");
  });

  it("returns hsl color for index 5", () => {
    expect(channelColor(5)).toBe("hsl(320, 65%, 55%)");
  });

  it("returns hsl color for index 6", () => {
    expect(channelColor(6)).toBe("hsl(80, 65%, 55%)");
  });

  it("returns hsl color for index 7", () => {
    expect(channelColor(7)).toBe("hsl(260, 65%, 55%)");
  });

  it("returns hsl color for index 8", () => {
    expect(channelColor(8)).toBe("hsl(0, 65%, 55%)");
  });

  it("returns hsl color for index 9", () => {
    expect(channelColor(9)).toBe("hsl(120, 65%, 55%)");
  });

  it("wraps around using modulo when index equals array length (10)", () => {
    expect(channelColor(10)).toBe("hsl(220, 65%, 55%)");
  });

  it("wraps around using modulo for index 11", () => {
    expect(channelColor(11)).toBe("hsl(160, 65%, 55%)");
  });

  it("wraps around for large index (20 = 0 mod 10)", () => {
    expect(channelColor(20)).toBe("hsl(220, 65%, 55%)");
  });
});
