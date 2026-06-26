import { describe, expect, it } from "vitest";
import { generatePairingCode } from "@/platform/lan/pairing";

describe("generatePairingCode (renderer, Web Crypto CSPRNG)", () => {
  it("always returns a 6-digit numeric string in [100000, 999999]", () => {
    for (let i = 0; i < 1000; i += 1) {
      const code = generatePairingCode();
      expect(code).toMatch(/^\d{6}$/);
      const n = Number(code);
      expect(n).toBeGreaterThanOrEqual(100000);
      expect(n).toBeLessThanOrEqual(999999);
    }
  });

  it("produces varied codes across calls (not Math.random-predictable in tests, real CSPRNG)", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generatePairingCode()));
    expect(codes.size).toBeGreaterThan(50);
  });
});
