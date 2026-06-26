import { describe, expect, it } from "vitest";
import { generatePairingCode, pairingCodesMatch } from "../../electron/collab-pairing";

describe("generatePairingCode (hub, CSPRNG)", () => {
  it("always returns a 6-digit numeric string in [100000, 999999]", () => {
    for (let i = 0; i < 1000; i += 1) {
      const code = generatePairingCode();
      expect(code).toMatch(/^\d{6}$/);
      const n = Number(code);
      expect(n).toBeGreaterThanOrEqual(100000);
      expect(n).toBeLessThanOrEqual(999999);
    }
  });

  it("produces varied codes (not predictable/constant)", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generatePairingCode()));
    // 200 draws from 900k values colliding down to <50 uniques is astronomically
    // unlikely; a constant/low-entropy generator would fail this.
    expect(codes.size).toBeGreaterThan(50);
  });
});

describe("pairingCodesMatch (fail-closed, constant-time)", () => {
  it("returns true only for an exact match", () => {
    expect(pairingCodesMatch("123456", "123456")).toBe(true);
    expect(pairingCodesMatch("123456", "123457")).toBe(false);
    expect(pairingCodesMatch("123456", "654321")).toBe(false);
  });

  it("fails closed when the expected code is empty (no open-room bypass)", () => {
    expect(pairingCodesMatch("", "123456")).toBe(false);
    expect(pairingCodesMatch("", "")).toBe(false);
  });

  it("fails closed when the supplied code is missing or empty", () => {
    expect(pairingCodesMatch("123456", null)).toBe(false);
    expect(pairingCodesMatch("123456", undefined)).toBe(false);
    expect(pairingCodesMatch("123456", "")).toBe(false);
  });

  it("returns false (never throws) on a length mismatch", () => {
    expect(pairingCodesMatch("123456", "12345")).toBe(false);
    expect(pairingCodesMatch("123456", "1234567")).toBe(false);
  });
});
