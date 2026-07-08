import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for report-studio/lib/sample-data.ts
 *
 * Exported symbols:
 *   - buildSampleData(date?: string): ReportData
 *   - SAMPLE_DATA: ReportData  (module-level singleton)
 *
 * Internal symbols exercised through the public API:
 *   - todayKey()     — called by buildSampleData() when no date is provided
 *   - buildHourly()  — called by buildSampleData() to produce hourlyData
 *
 * The real @/platform/viz (mulberry32, DEFAULT_SEED) is intentionally NOT
 * mocked — it is a pure deterministic math function; mocking it would make the
 * tests meaningless.  We verify the deterministic output directly.
 */

// ─── Import the real target module ───────────────────────────────────────────

import {
  buildSampleData,
  SAMPLE_DATA,
} from "@/features/report-studio/lib/sample-data";

import type { ReportData } from "@/features/report-studio/lib/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Return today's date in YYYY-MM-DD format (mirrors todayKey() in the source). */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── buildSampleData — default parameter (todayKey branch) ───────────────────

describe("buildSampleData — default date parameter", () => {
  it("uses today's date when no argument is passed", () => {
    // Arrange: capture what today is right now
    const today = todayKey();

    // Act
    const result = buildSampleData();

    // Assert: the date field equals today
    expect(result.date).toBe(today);
  });

  it("returns a ReportData object with all required top-level fields", () => {
    const result = buildSampleData();

    // Assert structural completeness
    expect(typeof result.date).toBe("string");
    expect(typeof result.totalTransactions).toBe("number");
    expect(typeof result.successRate).toBe("number");
    expect(typeof result.totalRevenue).toBe("number");
    expect(typeof result.failedTransactions).toBe("number");
    expect(typeof result.companyName).toBe("string");
    expect(Array.isArray(result.topChannels)).toBe(true);
    expect(Array.isArray(result.hourlyData)).toBe(true);
  });
});

// ─── buildSampleData — explicit date parameter ────────────────────────────────

describe("buildSampleData — explicit date parameter", () => {
  it("uses the provided date string as the date field", () => {
    // Act
    const result = buildSampleData("2025-01-15");

    // Assert
    expect(result.date).toBe("2025-01-15");
  });

  it("accepts an arbitrary date string without validation", () => {
    const result = buildSampleData("1999-12-31");
    expect(result.date).toBe("1999-12-31");
  });

  it("accepts an empty string as the date", () => {
    const result = buildSampleData("");
    expect(result.date).toBe("");
  });
});

// ─── buildSampleData — fixed numeric fields ───────────────────────────────────

describe("buildSampleData — fixed numeric fields", () => {
  it("returns the hardcoded totalTransactions value", () => {
    const result = buildSampleData("2026-01-01");
    expect(result.totalTransactions).toBe(142_847);
  });

  it("returns the hardcoded successRate", () => {
    const result = buildSampleData("2026-01-01");
    expect(result.successRate).toBe(96.4);
  });

  it("returns the hardcoded totalRevenue", () => {
    const result = buildSampleData("2026-01-01");
    expect(result.totalRevenue).toBe(2_845_912.75);
  });

  it("returns the hardcoded failedTransactions count", () => {
    const result = buildSampleData("2026-01-01");
    expect(result.failedTransactions).toBe(5_124);
  });

  it("returns the hardcoded companyName", () => {
    const result = buildSampleData("2026-01-01");
    expect(result.companyName).toBe("Telecom Analytics");
  });
});

// ─── buildSampleData — topChannels ───────────────────────────────────────────

describe("buildSampleData — topChannels array", () => {
  it("returns exactly 8 top channels", () => {
    const result = buildSampleData("2026-01-01");
    expect(result.topChannels).toHaveLength(8);
  });

  it("each channel has name, volume, successRate, and revenue fields", () => {
    const { topChannels } = buildSampleData("2026-01-01");
    for (const ch of topChannels) {
      expect(typeof ch.name).toBe("string");
      expect(typeof ch.volume).toBe("number");
      expect(typeof ch.successRate).toBe("number");
      expect(typeof ch.revenue).toBe("number");
    }
  });

  it("first channel is Bill Payment with correct values", () => {
    const { topChannels } = buildSampleData("2026-01-01");
    expect(topChannels[0]).toMatchObject({
      name: "Bill Payment",
      volume: 38_420,
      successRate: 98.2,
      revenue: 892_450.5,
    });
  });

  it("last channel is Voice Mobile Voucher with correct values", () => {
    const { topChannels } = buildSampleData("2026-01-01");
    expect(topChannels[7]).toMatchObject({
      name: "Voice Mobile Voucher",
      volume: 7_357,
      successRate: 78.5,
      revenue: 98_590.375,
    });
  });

  it("all channel names are non-empty strings", () => {
    const { topChannels } = buildSampleData("2026-01-01");
    for (const ch of topChannels) {
      expect(ch.name.length).toBeGreaterThan(0);
    }
  });
});

// ─── buildSampleData — hourlyData (buildHourly branch) ───────────────────────

describe("buildSampleData — hourlyData (buildHourly)", () => {
  it("returns exactly 24 hourly entries", () => {
    const { hourlyData } = buildSampleData("2026-01-01");
    expect(hourlyData).toHaveLength(24);
  });

  it("each hourly entry has hour, count, and successRate fields", () => {
    const { hourlyData } = buildSampleData("2026-01-01");
    for (const entry of hourlyData) {
      expect(typeof entry.hour).toBe("number");
      expect(typeof entry.count).toBe("number");
      expect(typeof entry.successRate).toBe("number");
    }
  });

  it("hour values run sequentially from 0 to 23", () => {
    const { hourlyData } = buildSampleData("2026-01-01");
    for (let h = 0; h < 24; h++) {
      expect(hourlyData[h]!.hour).toBe(h);
    }
  });

  it("all count values are finite numbers (not NaN, not Infinity)", () => {
    const { hourlyData } = buildSampleData("2026-01-01");
    for (const entry of hourlyData) {
      expect(Number.isFinite(entry.count)).toBe(true);
    }
  });

  it("all successRate values are finite numbers in a plausible range", () => {
    const { hourlyData } = buildSampleData("2026-01-01");
    for (const entry of hourlyData) {
      expect(Number.isFinite(entry.successRate)).toBe(true);
      // successRate = 93 + rand() * 5, rand() in [0,1), so [93, 98)
      expect(entry.successRate).toBeGreaterThanOrEqual(93);
      expect(entry.successRate).toBeLessThan(98);
    }
  });

  it("produces identical output on repeated calls (deterministic / seeded)", () => {
    // Arrange: call twice with same explicit date
    const a = buildSampleData("2026-01-01");
    const b = buildSampleData("2026-01-01");

    // Assert: hourly data is the same object shape with the same values
    expect(a.hourlyData).toEqual(b.hourlyData);
  });

  it("hour 0 count is rounded (integer value)", () => {
    const { hourlyData } = buildSampleData("2026-01-01");
    // Math.round() is applied so all counts must be integers
    expect(hourlyData[0]!.count % 1).toBe(0);
  });

  it("all count values are integers (Math.round applied)", () => {
    const { hourlyData } = buildSampleData("2026-01-01");
    for (const entry of hourlyData) {
      expect(entry.count % 1).toBe(0);
    }
  });
});

// ─── SAMPLE_DATA singleton ────────────────────────────────────────────────────

describe("SAMPLE_DATA module-level singleton", () => {
  it("is a valid ReportData object", () => {
    // Assert shape
    expect(typeof SAMPLE_DATA.date).toBe("string");
    expect(typeof SAMPLE_DATA.totalTransactions).toBe("number");
    expect(Array.isArray(SAMPLE_DATA.topChannels)).toBe(true);
    expect(Array.isArray(SAMPLE_DATA.hourlyData)).toBe(true);
  });

  it("has the same fixed numeric fields as buildSampleData()", () => {
    expect(SAMPLE_DATA.totalTransactions).toBe(142_847);
    expect(SAMPLE_DATA.successRate).toBe(96.4);
    expect(SAMPLE_DATA.totalRevenue).toBe(2_845_912.75);
    expect(SAMPLE_DATA.failedTransactions).toBe(5_124);
  });

  it("has 8 top channels and 24 hourly entries", () => {
    expect(SAMPLE_DATA.topChannels).toHaveLength(8);
    expect(SAMPLE_DATA.hourlyData).toHaveLength(24);
  });

  it("has hourlyData that equals what buildSampleData() produces for the same date", () => {
    // The singleton is built at module load time using todayKey() — so its
    // hourlyData must equal a fresh buildSampleData() call with the same seed.
    // We verify the hourly array is identical to a fresh call (seeded output is
    // always the same regardless of date).
    const fresh = buildSampleData(SAMPLE_DATA.date);
    expect(SAMPLE_DATA.hourlyData).toEqual(fresh.hourlyData);
  });

  it("date field matches the current day when the module was loaded", () => {
    // SAMPLE_DATA is built at module import time, so its date should be today
    // (or a very recent day if the test runs across midnight — which is
    // acceptable tolerance for a deterministic fallback check).
    const today = todayKey();
    // Accept today or the day before (cross-midnight tolerance)
    const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
    expect([today, yesterday]).toContain(SAMPLE_DATA.date);
  });
});

// ─── Return value independence ────────────────────────────────────────────────

describe("buildSampleData — return value independence", () => {
  it("returns a new object on each call (not a shared reference)", () => {
    const a = buildSampleData("2026-06-01");
    const b = buildSampleData("2026-06-01");
    expect(a).not.toBe(b);
  });

  it("topChannels arrays are distinct objects across calls", () => {
    const a = buildSampleData("2026-06-01");
    const b = buildSampleData("2026-06-01");
    expect(a.topChannels).not.toBe(b.topChannels);
  });

  it("hourlyData arrays are distinct objects across calls", () => {
    const a = buildSampleData("2026-06-01");
    const b = buildSampleData("2026-06-01");
    expect(a.hourlyData).not.toBe(b.hourlyData);
  });
});
