/**
 * Unit tests for @/features/settings/lib/format
 *
 * No external dependencies to mock — pure utility functions only.
 */

import { describe, it, expect } from "vitest";

import { formatBytes } from "@/features/settings/lib/format";

// =============================================================================
// formatBytes — null / undefined / invalid inputs (early-return branch)
// =============================================================================

describe("formatBytes – null / undefined / non-finite inputs", () => {
  it("returns — for null", () => {
    expect(formatBytes(null)).toBe("—");
  });

  it("returns — for undefined", () => {
    expect(formatBytes(undefined)).toBe("—");
  });

  it("returns — for NaN", () => {
    expect(formatBytes(Number.NaN)).toBe("—");
  });

  it("returns — for Infinity", () => {
    expect(formatBytes(Infinity)).toBe("—");
  });

  it("returns — for -Infinity", () => {
    expect(formatBytes(-Infinity)).toBe("—");
  });

  it("returns — for negative values", () => {
    expect(formatBytes(-1)).toBe("—");
  });

  it("returns — for -0.001", () => {
    expect(formatBytes(-0.001)).toBe("—");
  });
});

// =============================================================================
// formatBytes — zero
// =============================================================================

describe("formatBytes – zero", () => {
  it("returns '0 B' for 0", () => {
    expect(formatBytes(0)).toBe("0 B");
  });
});

// =============================================================================
// formatBytes — bytes (exponent === 0), no decimal
// =============================================================================

describe("formatBytes – bytes range (exponent = 0)", () => {
  it("formats 1 byte as '1 B'", () => {
    expect(formatBytes(1)).toBe("1 B");
  });

  it("formats 512 bytes as '512 B'", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("formats 1023 bytes as '1023 B'", () => {
    expect(formatBytes(1023)).toBe("1023 B");
  });
});

// =============================================================================
// formatBytes — kilobytes (exponent === 1)
// =============================================================================

describe("formatBytes – kilobytes range (exponent = 1)", () => {
  it("formats 1024 bytes as '1.0 KB'", () => {
    // value = 1.0, which is < 100 and exponent !== 0 → 1 decimal
    expect(formatBytes(1024)).toBe("1.0 KB");
  });

  it("formats 1536 bytes as '1.5 KB'", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("formats 10240 bytes (10 KB) with 1 decimal", () => {
    // 10240 / 1024 = 10.0 → '10.0 KB'
    expect(formatBytes(10240)).toBe("10.0 KB");
  });

  it("formats value >= 100 KB with 0 decimals", () => {
    // 100 * 1024 = 102400 → value = 100.0 >= 100 → 0 decimal → '100 KB'
    expect(formatBytes(102400)).toBe("100 KB");
  });

  it("formats 500 KB (512000 bytes) with 0 decimals because value >= 100", () => {
    // 512000 / 1024 = 500 → '500 KB'
    expect(formatBytes(512000)).toBe("500 KB");
  });
});

// =============================================================================
// formatBytes — megabytes (exponent === 2)
// =============================================================================

describe("formatBytes – megabytes range (exponent = 2)", () => {
  it("formats 1 MB as '1.0 MB'", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
  });

  it("formats 1.5 MB with 1 decimal", () => {
    expect(formatBytes(1024 * 1024 * 1.5)).toBe("1.5 MB");
  });

  it("formats 100 MB with 0 decimals because value >= 100", () => {
    expect(formatBytes(1024 * 1024 * 100)).toBe("100 MB");
  });

  it("formats 500 MB with 0 decimals", () => {
    expect(formatBytes(1024 * 1024 * 500)).toBe("500 MB");
  });
});

// =============================================================================
// formatBytes — gigabytes (exponent === 3)
// =============================================================================

describe("formatBytes – gigabytes range (exponent = 3)", () => {
  it("formats 1 GB as '1.0 GB'", () => {
    expect(formatBytes(1024 ** 3)).toBe("1.0 GB");
  });

  it("formats 1.4 GB correctly", () => {
    // 1.4 * 1024^3
    expect(formatBytes(1.4 * 1024 ** 3)).toBe("1.4 GB");
  });

  it("formats 100 GB with 0 decimals", () => {
    expect(formatBytes(100 * 1024 ** 3)).toBe("100 GB");
  });
});

// =============================================================================
// formatBytes — terabytes (exponent === 4, capped at units.length - 1)
// =============================================================================

describe("formatBytes – terabytes range (exponent = 4)", () => {
  it("formats 1 TB as '1.0 TB'", () => {
    expect(formatBytes(1024 ** 4)).toBe("1.0 TB");
  });

  it("formats 2.5 TB as '2.5 TB'", () => {
    expect(formatBytes(2.5 * 1024 ** 4)).toBe("2.5 TB");
  });

  it("caps at TB for very large values (exponent clamped to 4)", () => {
    // 1000 TB → value = 1000.0 >= 100 → 0 decimals
    const result = formatBytes(1000 * 1024 ** 4);
    expect(result).toMatch(/TB$/);
  });

  it("formats 100 TB with 0 decimals", () => {
    expect(formatBytes(100 * 1024 ** 4)).toBe("100 TB");
  });
});

// =============================================================================
// formatBytes — ternary branch: value >= 100 (0 decimals) vs value < 100 (1 decimal)
// =============================================================================

describe("formatBytes – toFixed ternary branch", () => {
  it("uses 1 decimal when value is between 1 and 99.9 (KB)", () => {
    // 50 KB = 50 * 1024 bytes → value = 50.0 < 100, exponent = 1 → '50.0 KB'
    expect(formatBytes(50 * 1024)).toBe("50.0 KB");
  });

  it("uses 0 decimals when value >= 100 (KB)", () => {
    // 100 KB → value = 100 → '100 KB'
    expect(formatBytes(100 * 1024)).toBe("100 KB");
  });

  it("uses 0 decimals when exponent === 0 regardless of value", () => {
    // exponent 0 forces 0 decimals even though value < 100
    expect(formatBytes(50)).toBe("50 B");
  });

  it("uses 0 decimals for exactly 100 MB", () => {
    expect(formatBytes(100 * 1024 * 1024)).toBe("100 MB");
  });

  it("uses 1 decimal for 99.9 MB (value just below 100)", () => {
    // 99 * 1024 * 1024 → value = 99.0 < 100 → '99.0 MB'
    expect(formatBytes(99 * 1024 * 1024)).toBe("99.0 MB");
  });
});
