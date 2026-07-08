import { describe, it, expect } from "vitest";
import {
  dayKey,
  dayLabel,
  clockTime,
  formatAgo,
  toTimestamp,
} from "@/features/history/model/format";

// ── Helpers ────────────────────────────────────────────────────────────────────
// Build a fixed epoch ms so tests are locale-agnostic for numeric assertions.
// 2024-03-15 14:32:00 UTC expressed in local time may shift the date depending
// on the machine timezone, so we pin the date using local-time constructors.
const LOCAL_DATE = new Date(2024, 2, 15, 14, 32, 0); // March 15 2024 14:32 local
const LOCAL_TS = LOCAL_DATE.getTime();

// ── dayKey ─────────────────────────────────────────────────────────────────────
describe("dayKey", () => {
  it("returns a YYYY-MM-DD string for a valid timestamp", () => {
    // Arrange: use the local-time constructor so the date is always Mar 15
    const result = dayKey(LOCAL_TS);
    // Assert: format must match the key pattern
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns '2024-03-15' for the pinned local date", () => {
    // Assert: exact date part must match what new Date(LOCAL_TS) produces locally
    const d = new Date(LOCAL_TS);
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(dayKey(LOCAL_TS)).toBe(expected);
  });

  it("returns 'unknown' for NaN", () => {
    expect(dayKey(NaN)).toBe("unknown");
  });

  it("returns 'unknown' for Infinity", () => {
    expect(dayKey(Infinity)).toBe("unknown");
  });

  it("returns 'unknown' for -Infinity", () => {
    expect(dayKey(-Infinity)).toBe("unknown");
  });

  it("pads single-digit month with leading zero", () => {
    // January 5 – month = 1, day = 5
    const janDate = new Date(2024, 0, 5, 12, 0, 0);
    const result = dayKey(janDate.getTime());
    expect(result).toBe("2024-01-05");
  });

  it("pads single-digit day with leading zero", () => {
    // March 5 – day = 5
    const d = new Date(2024, 2, 5, 10, 0, 0);
    expect(dayKey(d.getTime())).toBe("2024-03-05");
  });

  it("handles epoch zero (1970-01-01) without throwing", () => {
    // Arrange/Act
    const result = dayKey(0);
    // Assert: must be a valid date string, not 'unknown'
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("handles negative timestamps (pre-1970) without throwing", () => {
    // Arrange: one day before epoch
    const result = dayKey(-86_400_000);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ── dayLabel ───────────────────────────────────────────────────────────────────
describe("dayLabel", () => {
  it("returns a non-empty string for a valid timestamp", () => {
    const label = dayLabel(LOCAL_TS);
    expect(label).toBeTruthy();
    expect(typeof label).toBe("string");
  });

  it("returns 'Unknown' for NaN", () => {
    expect(dayLabel(NaN)).toBe("Unknown");
  });

  it("returns 'Unknown' for Infinity", () => {
    expect(dayLabel(Infinity)).toBe("Unknown");
  });

  it("returns 'Unknown' for -Infinity", () => {
    expect(dayLabel(-Infinity)).toBe("Unknown");
  });

  it("returns a different label for two different days", () => {
    const day1 = new Date(2024, 0, 1).getTime();
    const day2 = new Date(2024, 0, 2).getTime();
    // The labels may differ by weekday/day number; they must not be identical
    // (unless the locale is very unusual — this test is reasonable for jsdom)
    const label1 = dayLabel(day1);
    const label2 = dayLabel(day2);
    expect(label1).not.toBe(label2);
  });
});

// ── clockTime ──────────────────────────────────────────────────────────────────
describe("clockTime", () => {
  it("returns a non-empty string for a valid timestamp", () => {
    const time = clockTime(LOCAL_TS);
    expect(time).toBeTruthy();
    expect(typeof time).toBe("string");
  });

  it("returns an empty string for NaN", () => {
    expect(clockTime(NaN)).toBe("");
  });

  it("returns an empty string for Infinity", () => {
    expect(clockTime(Infinity)).toBe("");
  });

  it("returns an empty string for -Infinity", () => {
    expect(clockTime(-Infinity)).toBe("");
  });

  it("returns different strings for timestamps one hour apart", () => {
    const base = new Date(2024, 2, 15, 10, 0, 0).getTime();
    const oneHourLater = base + 3_600_000;
    expect(clockTime(base)).not.toBe(clockTime(oneHourLater));
  });
});

// ── formatAgo ──────────────────────────────────────────────────────────────────
describe("formatAgo", () => {
  it("returns 'unknown' for NaN timestamp", () => {
    expect(formatAgo(NaN, Date.now())).toBe("unknown");
  });

  it("returns 'unknown' for Infinity timestamp", () => {
    expect(formatAgo(Infinity, Date.now())).toBe("unknown");
  });

  it("returns 'unknown' for -Infinity timestamp", () => {
    expect(formatAgo(-Infinity, Date.now())).toBe("unknown");
  });

  it("returns 'just now' for a timestamp within the last minute", () => {
    // Arrange: 30 seconds ago
    const now = 1_000_000;
    const ts = now - 30_000;
    expect(formatAgo(ts, now)).toBe("just now");
  });

  it("returns 'just now' for a timestamp exactly at now", () => {
    const now = 1_000_000;
    expect(formatAgo(now, now)).toBe("just now");
  });

  it("returns 'just now' for a future timestamp (negative diff < 1 min)", () => {
    // diff is negative → min = floor(negative) < 1 → "just now"
    const now = 1_000_000;
    const ts = now + 30_000;
    expect(formatAgo(ts, now)).toBe("just now");
  });

  it("returns minutes label for 1-59 minutes ago", () => {
    // Arrange: exactly 1 minute ago
    const now = 10_000_000;
    expect(formatAgo(now - 60_000, now)).toBe("1m ago");
    // Arrange: 45 minutes ago
    expect(formatAgo(now - 45 * 60_000, now)).toBe("45m ago");
    // Arrange: 59 minutes ago
    expect(formatAgo(now - 59 * 60_000, now)).toBe("59m ago");
  });

  it("returns hours label for 1-23 hours ago", () => {
    const now = 100_000_000;
    // exactly 1 hour ago
    expect(formatAgo(now - 3_600_000, now)).toBe("1h ago");
    // 12 hours ago
    expect(formatAgo(now - 12 * 3_600_000, now)).toBe("12h ago");
    // 23 hours ago
    expect(formatAgo(now - 23 * 3_600_000, now)).toBe("23h ago");
  });

  it("returns days label for 1-29 days ago", () => {
    const now = 100_000_000_000;
    const ONE_DAY = 24 * 3_600_000;
    expect(formatAgo(now - ONE_DAY, now)).toBe("1d ago");
    expect(formatAgo(now - 15 * ONE_DAY, now)).toBe("15d ago");
    expect(formatAgo(now - 29 * ONE_DAY, now)).toBe("29d ago");
  });

  it("returns months label for 1-11 months (30-day approximation)", () => {
    const now = 100_000_000_000;
    const ONE_DAY = 24 * 3_600_000;
    // 30 days = exactly 1 month (Math.floor(30/30) = 1, Math.floor(1/12) = 0 → "1mo ago")
    expect(formatAgo(now - 30 * ONE_DAY, now)).toBe("1mo ago");
    // 6 months
    expect(formatAgo(now - 180 * ONE_DAY, now)).toBe("6mo ago");
    // 11 months (330 days → 11 months, floor(11/12) = 0 → "11mo ago")
    expect(formatAgo(now - 330 * ONE_DAY, now)).toBe("11mo ago");
  });

  it("returns years label for >= 12 months", () => {
    const now = 100_000_000_000;
    const ONE_DAY = 24 * 3_600_000;
    // 365 days → days=365, months=12, years=1 → "1y ago"
    expect(formatAgo(now - 365 * ONE_DAY, now)).toBe("1y ago");
    // 730 days → months=24, years=2 → "2y ago"
    expect(formatAgo(now - 730 * ONE_DAY, now)).toBe("2y ago");
  });

  it("uses Date.now() as the default 'now' argument", () => {
    // Arrange: a timestamp that was 5 minutes ago from the real now
    const now = Date.now();
    const ts = now - 5 * 60_000;
    // Act: call without the second argument
    const result = formatAgo(ts);
    // Assert: must be in the "Xm ago" form (could be 4 or 5 depending on timing)
    expect(result).toMatch(/^\d+m ago$/);
  });
});

// ── toTimestamp ────────────────────────────────────────────────────────────────
describe("toTimestamp", () => {
  it("parses a valid ISO 8601 string to epoch ms", () => {
    // Arrange
    const iso = "2024-03-15T14:32:00.000Z";
    // Act
    const result = toTimestamp(iso);
    // Assert: must equal the expected UTC epoch
    expect(result).toBe(new Date(iso).getTime());
  });

  it("parses a date-only string (YYYY-MM-DD)", () => {
    const result = toTimestamp("2024-01-01");
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBe(new Date("2024-01-01").getTime());
  });

  it("returns NaN for an unparseable string", () => {
    expect(toTimestamp("not a date")).toBeNaN();
  });

  it("returns NaN for an empty string", () => {
    // new Date("").getTime() is NaN in most runtimes
    expect(toTimestamp("")).toBeNaN();
  });

  it("returns a number (not a string) in all cases", () => {
    expect(typeof toTimestamp("2024-06-01")).toBe("number");
    expect(typeof toTimestamp("garbage")).toBe("number");
  });

  it("round-trips: toTimestamp of an ISO string from a known Date matches", () => {
    // Arrange
    const d = new Date(2023, 5, 20, 8, 0, 0, 0); // June 20 2023 local
    const iso = d.toISOString();
    // Act
    const result = toTimestamp(iso);
    // Assert
    expect(result).toBe(d.getTime());
  });
});
