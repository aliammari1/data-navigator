import { describe, it, expect } from "vitest";

// revenue-groups.ts is a pure constant export with no IO dependencies.
// No mocks are needed — the module resolves without touching any hardware,
// network, or platform boundary.

import { REVENUE_GROUPS } from "@/features/telecom/lib/revenue-groups";

// ─── Structural shape ─────────────────────────────────────────────────────────

describe("REVENUE_GROUPS — top-level shape", () => {
  it("is a plain object (Record)", () => {
    expect(REVENUE_GROUPS).toBeDefined();
    expect(typeof REVENUE_GROUPS).toBe("object");
    expect(REVENUE_GROUPS).not.toBeNull();
    expect(Array.isArray(REVENUE_GROUPS)).toBe(false);
  });

  it("has exactly 5 top-level keys", () => {
    expect(Object.keys(REVENUE_GROUPS)).toHaveLength(5);
  });

  it("contains the expected group names", () => {
    const keys = Object.keys(REVENUE_GROUPS);
    expect(keys).toContain("Bill Payment");
    expect(keys).toContain("Recharge");
    expect(keys).toContain("Voucher For Payment");
    expect(keys).toContain("Credit Transfer");
    expect(keys).toContain("Voucher Convergent");
  });

  it("every group has a non-empty keys array", () => {
    for (const [name, group] of Object.entries(REVENUE_GROUPS)) {
      expect(Array.isArray(group.keys), `${name}.keys should be an array`).toBe(true);
      expect(group.keys.length, `${name}.keys should not be empty`).toBeGreaterThan(0);
    }
  });

  it("every group has a non-empty color string", () => {
    for (const [name, group] of Object.entries(REVENUE_GROUPS)) {
      expect(typeof group.color, `${name}.color should be a string`).toBe("string");
      expect(group.color.length, `${name}.color should not be empty`).toBeGreaterThan(0);
    }
  });

  it("every color starts with '#' (hex format)", () => {
    for (const [name, group] of Object.entries(REVENUE_GROUPS)) {
      expect(group.color, `${name}.color should start with #`).toMatch(/^#/);
    }
  });
});

// ─── Bill Payment ─────────────────────────────────────────────────────────────

describe("REVENUE_GROUPS — Bill Payment", () => {
  it("exists", () => {
    expect(REVENUE_GROUPS["Bill Payment"]).toBeDefined();
  });

  it("has exactly one key: bill_payment", () => {
    expect(REVENUE_GROUPS["Bill Payment"].keys).toEqual(["bill_payment"]);
  });

  it("has color #89b4fa", () => {
    expect(REVENUE_GROUPS["Bill Payment"].color).toBe("#89b4fa");
  });
});

// ─── Recharge ─────────────────────────────────────────────────────────────────

describe("REVENUE_GROUPS — Recharge", () => {
  it("exists", () => {
    expect(REVENUE_GROUPS["Recharge"]).toBeDefined();
  });

  it("has exactly 6 keys", () => {
    expect(REVENUE_GROUPS["Recharge"].keys).toHaveLength(6);
  });

  it("contains voice_fixed_ttcash", () => {
    expect(REVENUE_GROUPS["Recharge"].keys).toContain("voice_fixed_ttcash");
  });

  it("contains voice_fixed_voucher", () => {
    expect(REVENUE_GROUPS["Recharge"].keys).toContain("voice_fixed_voucher");
  });

  it("contains voice_mobile_ttcash", () => {
    expect(REVENUE_GROUPS["Recharge"].keys).toContain("voice_mobile_ttcash");
  });

  it("contains voice_mobile_voucher", () => {
    expect(REVENUE_GROUPS["Recharge"].keys).toContain("voice_mobile_voucher");
  });

  it("contains data_sabba", () => {
    expect(REVENUE_GROUPS["Recharge"].keys).toContain("data_sabba");
  });

  it("contains data_evoucher", () => {
    expect(REVENUE_GROUPS["Recharge"].keys).toContain("data_evoucher");
  });

  it("has color #a6e3a1", () => {
    expect(REVENUE_GROUPS["Recharge"].color).toBe("#a6e3a1");
  });

  it("keys match the full expected array in order", () => {
    expect(REVENUE_GROUPS["Recharge"].keys).toEqual([
      "voice_fixed_ttcash",
      "voice_fixed_voucher",
      "voice_mobile_ttcash",
      "voice_mobile_voucher",
      "data_sabba",
      "data_evoucher",
    ]);
  });
});

// ─── Voucher For Payment ──────────────────────────────────────────────────────

describe("REVENUE_GROUPS — Voucher For Payment", () => {
  it("exists", () => {
    expect(REVENUE_GROUPS["Voucher For Payment"]).toBeDefined();
  });

  it("has exactly one key: voucher_for_payment", () => {
    expect(REVENUE_GROUPS["Voucher For Payment"].keys).toEqual(["voucher_for_payment"]);
  });

  it("has color #94e2d5", () => {
    expect(REVENUE_GROUPS["Voucher For Payment"].color).toBe("#94e2d5");
  });
});

// ─── Credit Transfer ──────────────────────────────────────────────────────────

describe("REVENUE_GROUPS — Credit Transfer", () => {
  it("exists", () => {
    expect(REVENUE_GROUPS["Credit Transfer"]).toBeDefined();
  });

  it("has exactly one key: credit_transfer", () => {
    expect(REVENUE_GROUPS["Credit Transfer"].keys).toEqual(["credit_transfer"]);
  });

  it("has color #fab387", () => {
    expect(REVENUE_GROUPS["Credit Transfer"].color).toBe("#fab387");
  });
});

// ─── Voucher Convergent ───────────────────────────────────────────────────────

describe("REVENUE_GROUPS — Voucher Convergent", () => {
  it("exists", () => {
    expect(REVENUE_GROUPS["Voucher Convergent"]).toBeDefined();
  });

  it("has exactly one key: voucher_convergent", () => {
    expect(REVENUE_GROUPS["Voucher Convergent"].keys).toEqual(["voucher_convergent"]);
  });

  it("has color #cba6f7", () => {
    expect(REVENUE_GROUPS["Voucher Convergent"].color).toBe("#cba6f7");
  });
});

// ─── CanalKey coverage ────────────────────────────────────────────────────────

describe("REVENUE_GROUPS — CanalKey union coverage", () => {
  it("collectively contains all 10 CanalKey values across groups", () => {
    const allKeys = Object.values(REVENUE_GROUPS).flatMap((g) => g.keys);
    const keySet = new Set(allKeys);

    const expectedKeys = [
      "bill_payment",
      "voice_fixed_ttcash",
      "voice_fixed_voucher",
      "voice_mobile_ttcash",
      "voice_mobile_voucher",
      "data_sabba",
      "data_evoucher",
      "voucher_for_payment",
      "credit_transfer",
      "voucher_convergent",
    ];

    for (const k of expectedKeys) {
      expect(keySet.has(k), `${k} should appear in some group`).toBe(true);
    }
  });

  it("has no duplicate keys across all groups", () => {
    const allKeys = Object.values(REVENUE_GROUPS).flatMap((g) => g.keys);
    const unique = new Set(allKeys);
    expect(unique.size).toBe(allKeys.length);
  });

  it("total key count across all groups is 10", () => {
    const total = Object.values(REVENUE_GROUPS).reduce((sum, g) => sum + g.keys.length, 0);
    expect(total).toBe(10);
  });
});

// ─── All colors are unique ────────────────────────────────────────────────────

describe("REVENUE_GROUPS — color uniqueness", () => {
  it("no two groups share the same color", () => {
    const colors = Object.values(REVENUE_GROUPS).map((g) => g.color);
    const unique = new Set(colors);
    expect(unique.size).toBe(colors.length);
  });
});
