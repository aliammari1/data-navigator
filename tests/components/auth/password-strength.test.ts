import { describe, expect, it } from "vitest";
import { scorePassword } from "@/components/auth/password-strength";

describe("scorePassword", () => {
  it("rates an empty or too-short password as score 0", () => {
    expect(scorePassword("").score).toBe(0);
    expect(scorePassword("abc").score).toBe(0);
    expect(scorePassword("").label).toBe("too short");
  });

  it("gives 8+ lowercase-only one point (weak)", () => {
    const r = scorePassword("aaaaaaaa");
    expect(r.score).toBe(1);
    expect(r.label).toBe("weak");
  });

  it("rewards mixed case and digits", () => {
    // length>=8 (1) + mixed case (1) + digit (1) = 3 -> good
    expect(scorePassword("Abcdef12").score).toBe(3);
  });

  it("caps at 4 (strong) for long, varied passwords", () => {
    // length>=8,>=12, mixed case, digit, symbol = 5 -> clamped to 4
    const r = scorePassword("Abcdefgh1234!");
    expect(r.score).toBe(4);
    expect(r.label).toBe("strong");
  });

  it("exposes a tailwind tone class for every level", () => {
    for (const pw of ["", "aaaaaaaa", "Abcdef12", "Abcdefgh1234!"]) {
      expect(scorePassword(pw).tone).toMatch(/^bg-/);
    }
  });
});
