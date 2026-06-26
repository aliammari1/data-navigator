import { describe, it, expect, vi } from "vitest";
import {
  formatDateTime,
  formatDate,
  formatTime,
  formatRelative,
} from "@/features/channel-monitor/lib/format-helpers";

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

/** A fixed, well-known instant used across all tests. */
const FIXED_ISO = "2026-06-25T14:32:05Z";
const FIXED_DATE = new Date(FIXED_ISO);
const FIXED_TIMESTAMP = FIXED_DATE.getTime();

// ────────────────────────────────────────────────────────────────
// formatDateTime
// ────────────────────────────────────────────────────────────────

describe("formatDateTime", () => {
  it("accepts a Date object and returns a non-empty fr-FR formatted string", () => {
    // Arrange
    const value = FIXED_DATE;

    // Act
    const result = formatDateTime(value);

    // Assert — the output must be a non-empty string; exact locale output
    // depends on the runtime ICU data so we validate shape only.
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("accepts an ISO string and produces the same result as passing the Date", () => {
    // Arrange / Act
    const fromString = formatDateTime(FIXED_ISO);
    const fromDate = formatDateTime(FIXED_DATE);

    // Assert
    expect(fromString).toBe(fromDate);
  });

  it("accepts a numeric timestamp and produces the same result as passing the Date", () => {
    // Arrange / Act
    const fromNumber = formatDateTime(FIXED_TIMESTAMP);
    const fromDate = formatDateTime(FIXED_DATE);

    // Assert
    expect(fromNumber).toBe(fromDate);
  });
});

// ────────────────────────────────────────────────────────────────
// formatDate
// ────────────────────────────────────────────────────────────────

describe("formatDate", () => {
  it("accepts a Date object and returns a non-empty string", () => {
    const result = formatDate(FIXED_DATE);

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("accepts an ISO string and produces the same result as passing the Date", () => {
    expect(formatDate(FIXED_ISO)).toBe(formatDate(FIXED_DATE));
  });

  it("accepts a numeric timestamp and produces the same result as passing the Date", () => {
    expect(formatDate(FIXED_TIMESTAMP)).toBe(formatDate(FIXED_DATE));
  });
});

// ────────────────────────────────────────────────────────────────
// formatTime
// ────────────────────────────────────────────────────────────────

describe("formatTime", () => {
  it("accepts a Date object and returns a non-empty string", () => {
    const result = formatTime(FIXED_DATE);

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("accepts an ISO string and produces the same result as passing the Date", () => {
    expect(formatTime(FIXED_ISO)).toBe(formatTime(FIXED_DATE));
  });

  it("accepts a numeric timestamp and produces the same result as passing the Date", () => {
    expect(formatTime(FIXED_TIMESTAMP)).toBe(formatTime(FIXED_DATE));
  });
});

// ────────────────────────────────────────────────────────────────
// formatRelative
// ────────────────────────────────────────────────────────────────

describe("formatRelative — happy path", () => {
  it("returns a string ending in 'ago' for a recent Date", () => {
    // Arrange: a date 5 minutes in the past.
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    // Act
    const result = formatRelative(fiveMinutesAgo);

    // Assert
    expect(typeof result).toBe("string");
    expect(result).toMatch(/ago$/);
  });

  it("works with an ISO string input", () => {
    const tenSecondsAgo = new Date(Date.now() - 10_000).toISOString();
    const result = formatRelative(tenSecondsAgo);

    expect(result).toMatch(/ago$/);
  });

  it("works with a numeric timestamp input", () => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    const result = formatRelative(twoHoursAgo);

    expect(result).toMatch(/ago$/);
  });
});

describe("formatRelative — error / catch branch", () => {
  it("returns '—' when date-fns throws (e.g. an invalid Date)", () => {
    // Arrange: passing NaN as a number produces an Invalid Date.
    const result = formatRelative(NaN);

    // Assert: the catch block must emit the em-dash fallback.
    expect(result).toBe("—");
  });
});
