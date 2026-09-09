import { describe, expect, it, vi } from "vitest";
import { fmtVal, genId, inferType } from "@/features/data-formulator/core/helpers";

// ─── inferType ────────────────────────────────────────────────────────────────

describe("inferType", () => {
  it("returns 'number' for INT", () => {
    expect(inferType("INT")).toBe("number");
  });

  it("returns 'number' for BIGINT", () => {
    expect(inferType("BIGINT")).toBe("number");
  });

  it("returns 'number' for FLOAT", () => {
    expect(inferType("FLOAT")).toBe("number");
  });

  it("returns 'number' for DOUBLE", () => {
    expect(inferType("DOUBLE")).toBe("number");
  });

  it("returns 'number' for DECIMAL", () => {
    expect(inferType("DECIMAL")).toBe("number");
  });

  it("returns 'number' for NUMERIC", () => {
    expect(inferType("NUMERIC")).toBe("number");
  });

  it("returns 'number' for REAL", () => {
    expect(inferType("REAL")).toBe("number");
  });

  it("returns 'number' for lowercase int", () => {
    expect(inferType("int")).toBe("number");
  });

  it("returns 'date' for DATE", () => {
    expect(inferType("DATE")).toBe("date");
  });

  it("returns 'date' for TIME", () => {
    expect(inferType("TIME")).toBe("date");
  });

  it("returns 'date' for TIMESTAMP", () => {
    expect(inferType("TIMESTAMP")).toBe("date");
  });

  it("returns 'date' for lowercase timestamp", () => {
    expect(inferType("timestamp")).toBe("date");
  });

  it("returns 'boolean' for BOOL", () => {
    expect(inferType("BOOL")).toBe("boolean");
  });

  it("returns 'boolean' for BOOLEAN", () => {
    expect(inferType("BOOLEAN")).toBe("boolean");
  });

  it("returns 'boolean' for lowercase bool", () => {
    expect(inferType("bool")).toBe("boolean");
  });

  it("returns 'string' for VARCHAR", () => {
    expect(inferType("VARCHAR")).toBe("string");
  });

  it("returns 'string' for TEXT", () => {
    expect(inferType("TEXT")).toBe("string");
  });

  it("returns 'string' for unknown type", () => {
    expect(inferType("UNKNOWN_TYPE")).toBe("string");
  });

  it("returns 'string' for empty string", () => {
    expect(inferType("")).toBe("string");
  });
});

// ─── genId ────────────────────────────────────────────────────────────────────

describe("genId", () => {
  it("returns a non-empty string", () => {
    const id = genId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("returns a 12-char string when randomUUID is available", () => {
    // Default jsdom environment has crypto.randomUUID; verify it uses it.
    const id = genId();
    expect(id).toHaveLength(12);
    // UUIDs only use hex chars; after stripping dashes and slicing, still hex.
    expect(id).toMatch(/^[0-9a-f]{12}$/);
  });

  it("produces different ids on successive calls", () => {
    const a = genId();
    const b = genId();
    expect(a).not.toBe(b);
  });

  it("falls back to getRandomValues when randomUUID is not available", () => {
    const originalCrypto = globalThis.crypto;
    const mockGetRandomValues = vi.fn((buf: Uint8Array) => {
      for (let i = 0; i < buf.length; i++) buf[i] = i;
      return buf;
    });

    Object.defineProperty(globalThis, "crypto", {
      value: { getRandomValues: mockGetRandomValues },
      configurable: true,
      writable: true,
    });

    try {
      const id = genId();
      // 8 bytes -> 16 hex chars
      expect(id).toHaveLength(16);
      expect(id).toMatch(/^[0-9a-f]{16}$/);
      // bytes 0..7 -> "00010203040506070"
      expect(id).toBe("0001020304050607");
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        value: originalCrypto,
        configurable: true,
        writable: true,
      });
    }
  });

  it("falls back to Date.now + Math.random when crypto is undefined", () => {
    const originalCrypto = globalThis.crypto;

    Object.defineProperty(globalThis, "crypto", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    try {
      const id = genId();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        value: originalCrypto,
        configurable: true,
        writable: true,
      });
    }
  });
});

// ─── fmtVal ───────────────────────────────────────────────────────────────────

describe("fmtVal", () => {
  it("returns '0' for null (Number(null) === 0, which is finite and integer)", () => {
    expect(fmtVal(null)).toBe((0).toLocaleString());
  });

  it("returns '' for undefined", () => {
    expect(fmtVal(undefined)).toBe("");
  });

  it("returns the string value for a non-numeric string", () => {
    expect(fmtVal("hello")).toBe("hello");
  });

  it("returns 'NaN' string for NaN input", () => {
    expect(fmtVal(NaN)).toBe("NaN");
  });

  it("returns 'Infinity' string for Infinity", () => {
    expect(fmtVal(Infinity)).toBe("Infinity");
  });

  it("returns '-Infinity' string for -Infinity", () => {
    expect(fmtVal(-Infinity)).toBe("-Infinity");
  });

  it("formats numbers >= 1e9 as billions with 1 decimal place", () => {
    expect(fmtVal(1_000_000_000)).toBe("1.0B");
  });

  it("formats 2.5B correctly", () => {
    expect(fmtVal(2_500_000_000)).toBe("2.5B");
  });

  it("formats negative billions correctly", () => {
    expect(fmtVal(-1_000_000_000)).toBe("-1.0B");
  });

  it("formats numbers >= 1e6 but < 1e9 as millions with 1 decimal", () => {
    expect(fmtVal(1_000_000)).toBe("1.0M");
  });

  it("formats 5.7M correctly", () => {
    expect(fmtVal(5_700_000)).toBe("5.7M");
  });

  it("formats negative millions correctly", () => {
    expect(fmtVal(-2_000_000)).toBe("-2.0M");
  });

  it("formats numbers >= 1e3 but < 1e6 as thousands with 1 decimal", () => {
    expect(fmtVal(1000)).toBe("1.0K");
  });

  it("formats 3.5K correctly", () => {
    expect(fmtVal(3500)).toBe("3.5K");
  });

  it("formats negative thousands correctly", () => {
    expect(fmtVal(-1000)).toBe("-1.0K");
  });

  it("returns toLocaleString for small integers", () => {
    expect(fmtVal(42)).toBe((42).toLocaleString());
  });

  it("returns toLocaleString for 0", () => {
    expect(fmtVal(0)).toBe((0).toLocaleString());
  });

  it("returns toLocaleString for small negative integers", () => {
    expect(fmtVal(-5)).toBe((-5).toLocaleString());
  });

  it("returns 2-decimal fixed for non-integer floats", () => {
    expect(fmtVal(3.14159)).toBe("3.14");
  });

  it("returns 2-decimal fixed for negative floats", () => {
    expect(fmtVal(-2.5)).toBe("-2.50");
  });

  it("handles a numeric string correctly (coerces to number)", () => {
    expect(fmtVal("999")).toBe((999).toLocaleString());
  });

  it("handles an object with toString that coerces to NaN (non-numeric string-like)", () => {
    // Number({toString: () => "abc"}) = NaN, not finite
    // String(v ?? "") uses .toString() -> "abc"
    expect(fmtVal({ toString: () => "abc" })).toBe("abc");
  });

  it("handles exactly 1e9 as the billions threshold", () => {
    expect(fmtVal(1e9)).toBe("1.0B");
  });

  it("handles a number just below 1e9 as millions", () => {
    // 999_999_999 -> abs >= 1e6 but < 1e9 => millions
    const val = 999_999_999;
    expect(fmtVal(val)).toBe(`${(val / 1e6).toFixed(1)}M`);
  });

  it("handles exactly 1e6 as the millions threshold", () => {
    expect(fmtVal(1e6)).toBe("1.0M");
  });

  it("handles exactly 1e3 as the thousands threshold", () => {
    expect(fmtVal(1e3)).toBe("1.0K");
  });

  it("handles a number just below 1e3 as integer when it is one", () => {
    expect(fmtVal(999)).toBe((999).toLocaleString());
  });
});
