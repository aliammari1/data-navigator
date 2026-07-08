import { describe, expect, it } from "vitest";
import {
  deriveRoleFromCodes,
  generatePairingCode,
  pairingCodesMatch,
  parseCollabToken,
} from "../../electron/collab-pairing";

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

describe("deriveRoleFromCodes (dual-code, server-derived roles)", () => {
  const codes = { pairingCode: "111111", guestCode: "222222" };

  it("grants the requested role for the full pairing code", () => {
    expect(deriveRoleFromCodes(codes, "111111", "host")).toEqual({
      role: "host",
      readOnly: false,
    });
    expect(deriveRoleFromCodes(codes, "111111", "editor")).toEqual({
      role: "editor",
      readOnly: false,
    });
  });

  it("honors voluntarily read-only roles with the full code", () => {
    expect(deriveRoleFromCodes(codes, "111111", "viewer")).toEqual({
      role: "viewer",
      readOnly: true,
    });
    expect(deriveRoleFromCodes(codes, "111111", "reviewer")).toEqual({
      role: "reviewer",
      readOnly: true,
    });
  });

  it("defaults an unknown requested role to editor (full code only)", () => {
    expect(deriveRoleFromCodes(codes, "111111", "superadmin")).toEqual({
      role: "editor",
      readOnly: false,
    });
    expect(deriveRoleFromCodes(codes, "111111", null)).toEqual({
      role: "editor",
      readOnly: false,
    });
  });

  it("NEVER grants write access for the guest code, whatever the claim", () => {
    expect(deriveRoleFromCodes(codes, "222222", "host")).toEqual({
      role: "viewer",
      readOnly: true,
    });
    expect(deriveRoleFromCodes(codes, "222222", "editor")).toEqual({
      role: "viewer",
      readOnly: true,
    });
    expect(deriveRoleFromCodes(codes, "222222", "reviewer")).toEqual({
      role: "reviewer",
      readOnly: true,
    });
    expect(deriveRoleFromCodes(codes, "222222", "viewer")).toEqual({
      role: "viewer",
      readOnly: true,
    });
  });

  it("rejects unknown, empty and missing codes", () => {
    expect(deriveRoleFromCodes(codes, "333333", "editor")).toBeNull();
    expect(deriveRoleFromCodes(codes, "", "editor")).toBeNull();
    expect(deriveRoleFromCodes(codes, null, "editor")).toBeNull();
    expect(deriveRoleFromCodes(codes, undefined, "viewer")).toBeNull();
  });

  it("rejects the guest code when no guest code is configured", () => {
    expect(deriveRoleFromCodes({ pairingCode: "111111" }, "222222", "viewer")).toBeNull();
  });
});

describe("parseCollabToken", () => {
  it("parses the JSON envelope", () => {
    const token = JSON.stringify({ code: "111111", peerId: "p1", peerName: "Ali", role: "editor" });
    expect(parseCollabToken(token)).toEqual({
      code: "111111",
      peerId: "p1",
      peerName: "Ali",
      role: "editor",
    });
  });

  it("treats a bare string token as the code", () => {
    expect(parseCollabToken("123456")).toEqual({ code: "123456" });
  });

  it("fails closed on malformed input", () => {
    expect(parseCollabToken(null).code).toBe("");
    expect(parseCollabToken(undefined).code).toBe("");
    expect(parseCollabToken("{}").code).toBe("{}");
    expect(parseCollabToken(JSON.stringify({ code: 42 })).code).toBe('{"code":42}');
  });
});
