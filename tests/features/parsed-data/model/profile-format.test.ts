import { describe, expect, it } from "vitest";
import { AlertCircle, Calendar, Hash, Sigma, ToggleLeft, Type } from "lucide-react";
import {
  qualityColor,
  qualityLabel,
  typeColor,
  typeIcon,
} from "@/features/parsed-data/model/profile-format";

// ─── qualityColor ────────────────────────────────────────────────────────────

describe("qualityColor", () => {
  it("returns green for scores >= 0.9", () => {
    expect(qualityColor(0.9)).toBe("#22c55e");
    expect(qualityColor(1.0)).toBe("#22c55e");
    expect(qualityColor(0.95)).toBe("#22c55e");
  });

  it("returns amber for scores >= 0.7 and < 0.9", () => {
    expect(qualityColor(0.7)).toBe("#f59e0b");
    expect(qualityColor(0.8)).toBe("#f59e0b");
    expect(qualityColor(0.89)).toBe("#f59e0b");
  });

  it("returns orange for scores >= 0.5 and < 0.7", () => {
    expect(qualityColor(0.5)).toBe("#f97316");
    expect(qualityColor(0.6)).toBe("#f97316");
    expect(qualityColor(0.69)).toBe("#f97316");
  });

  it("returns red for scores below 0.5", () => {
    expect(qualityColor(0.49)).toBe("#ef4444");
    expect(qualityColor(0.0)).toBe("#ef4444");
    expect(qualityColor(-1)).toBe("#ef4444");
  });
});

// ─── qualityLabel ────────────────────────────────────────────────────────────

describe("qualityLabel", () => {
  it("returns 'Excellent' for scores >= 0.9", () => {
    expect(qualityLabel(0.9)).toBe("Excellent");
    expect(qualityLabel(1.0)).toBe("Excellent");
  });

  it("returns 'Good' for scores >= 0.7 and < 0.9", () => {
    expect(qualityLabel(0.7)).toBe("Good");
    expect(qualityLabel(0.89)).toBe("Good");
  });

  it("returns 'Fair' for scores >= 0.5 and < 0.7", () => {
    expect(qualityLabel(0.5)).toBe("Fair");
    expect(qualityLabel(0.69)).toBe("Fair");
  });

  it("returns 'Poor' for scores below 0.5", () => {
    expect(qualityLabel(0.49)).toBe("Poor");
    expect(qualityLabel(0.0)).toBe("Poor");
  });
});

// ─── typeIcon ─────────────────────────────────────────────────────────────────

describe("typeIcon", () => {
  it("returns Hash for 'integer'", () => {
    expect(typeIcon("integer")).toBe(Hash);
  });

  it("returns Sigma for 'float'", () => {
    expect(typeIcon("float")).toBe(Sigma);
  });

  it("returns Type for 'string'", () => {
    expect(typeIcon("string")).toBe(Type);
  });

  it("returns ToggleLeft for 'boolean'", () => {
    expect(typeIcon("boolean")).toBe(ToggleLeft);
  });

  it("returns Calendar for 'date'", () => {
    expect(typeIcon("date")).toBe(Calendar);
  });

  it("returns AlertCircle for 'unknown' (default case)", () => {
    expect(typeIcon("unknown")).toBe(AlertCircle);
  });
});

// ─── typeColor ────────────────────────────────────────────────────────────────

describe("typeColor", () => {
  it("returns blue classes for 'integer'", () => {
    expect(typeColor("integer")).toBe("bg-blue-500/20 text-blue-300");
  });

  it("returns indigo classes for 'float'", () => {
    expect(typeColor("float")).toBe("bg-indigo-500/20 text-indigo-300");
  });

  it("returns purple classes for 'string'", () => {
    expect(typeColor("string")).toBe("bg-purple-500/20 text-purple-300");
  });

  it("returns green classes for 'boolean'", () => {
    expect(typeColor("boolean")).toBe("bg-green-500/20 text-green-300");
  });

  it("returns orange classes for 'date'", () => {
    expect(typeColor("date")).toBe("bg-orange-500/20 text-orange-300");
  });

  it("returns muted classes for 'unknown' (default case)", () => {
    expect(typeColor("unknown")).toBe("bg-muted text-muted-foreground");
  });
});
