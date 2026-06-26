import { describe, it, expect, vi } from "vitest";

// ─── Boundary mocks ───────────────────────────────────────────────────────────
// canal-groups.ts re-exports slices of constants from report-engine.ts.
// report-engine.ts has four IO boundaries that must be mocked so the module
// graph resolves without touching real hardware/network/disk.

vi.mock("@/platform/duckdb/duckdb", () => ({
  runReadOnlyQuery: vi.fn(),
}));

vi.mock("@/platform/duckdb/duckdb-fs", () => ({
  registerLocalDatasetFile: vi.fn(),
}));

vi.mock("@/platform/electron/electron-fs", () => ({
  localDataPath: vi.fn(),
  writeLocalFile: vi.fn(),
}));

vi.mock("@/features/telecom/lib/queries", () => ({
  createTelecomEnrichedView: vi.fn(),
}));

// ─── Module under test ────────────────────────────────────────────────────────
// Import AFTER vi.mock() calls so Vitest hoists the mocks correctly.
import {
  ALL_VOICE_FIXED,
  ALL_VOICE_MOBILE,
  COMPARE_GROUPS,
  DATA_SUMMARY_GROUPS,
  RECHARGE_SUMMARY_GROUPS,
  VOIX_SUMMARY_GROUPS,
  VOUCHER_CONVERGENT_SUMMARY_GROUPS,
  VOUCHER_FOR_PAYMENT_GENERATION,
  VOUCHER_FOR_PAYMENT_REDEMPTION,
  VOUCHER_PAYMENT_SUMMARY_GROUPS,
  type ChannelGroup,
} from "@/features/telecom/lib/canal-groups";

// ─── Helper ───────────────────────────────────────────────────────────────────
/** Every ChannelDef entry must have a non-empty name and condition string. */
function isValidChannelDef(cd: { name: string; condition: string }) {
  return typeof cd.name === "string" && cd.name.length > 0 && typeof cd.condition === "string";
}

/** Every ChannelGroup must have a non-empty label and a non-empty channels array. */
function isValidGroup(g: ChannelGroup) {
  return (
    typeof g.label === "string" &&
    g.label.length > 0 &&
    Array.isArray(g.channels) &&
    g.channels.length > 0
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("canal-groups — VOUCHER_FOR_PAYMENT splits", () => {
  it("VOUCHER_FOR_PAYMENT_GENERATION contains exactly the first element of VOUCHER_FOR_PAYMENT", () => {
    // The generation slice is always a single-element array (index 0)
    expect(VOUCHER_FOR_PAYMENT_GENERATION).toHaveLength(1);
    expect(isValidChannelDef(VOUCHER_FOR_PAYMENT_GENERATION[0])).toBe(true);
    expect(VOUCHER_FOR_PAYMENT_GENERATION[0].name).toMatch(/generation/i);
  });

  it("VOUCHER_FOR_PAYMENT_REDEMPTION contains all elements after the first", () => {
    // Redemption = slice(1), which includes REDEMPTION + REFUND rows
    expect(VOUCHER_FOR_PAYMENT_REDEMPTION.length).toBeGreaterThanOrEqual(1);
    for (const cd of VOUCHER_FOR_PAYMENT_REDEMPTION) {
      expect(isValidChannelDef(cd)).toBe(true);
    }
  });

  it("GENERATION and REDEMPTION together equal the full VOUCHER_FOR_PAYMENT array length", async () => {
    // Import the source array directly from report-engine to verify the split
    const { VOUCHER_FOR_PAYMENT } = await import("@/features/telecom/lib/report-engine");
    expect(VOUCHER_FOR_PAYMENT_GENERATION.length + VOUCHER_FOR_PAYMENT_REDEMPTION.length).toBe(
      VOUCHER_FOR_PAYMENT.length,
    );
  });
});

describe("canal-groups — ALL_VOICE_FIXED", () => {
  it("is the concatenation of RECHARGE_VOICE_FIXED_TTCASH and RECHARGE_VOICE_FIXED_VOUCHER", async () => {
    const { RECHARGE_VOICE_FIXED_TTCASH, RECHARGE_VOICE_FIXED_VOUCHER } = await import(
      "@/features/telecom/lib/report-engine"
    );
    expect(ALL_VOICE_FIXED).toHaveLength(
      RECHARGE_VOICE_FIXED_TTCASH.length + RECHARGE_VOICE_FIXED_VOUCHER.length,
    );
  });

  it("contains only valid ChannelDef entries", () => {
    expect(ALL_VOICE_FIXED.length).toBeGreaterThan(0);
    for (const cd of ALL_VOICE_FIXED) {
      expect(isValidChannelDef(cd)).toBe(true);
    }
  });
});

describe("canal-groups — ALL_VOICE_MOBILE", () => {
  it("is the concatenation of RECHARGE_VOICE_MOBILE_TTCASH and RECHARGE_VOICE_MOBILE_VOUCHER", async () => {
    const { RECHARGE_VOICE_MOBILE_TTCASH, RECHARGE_VOICE_MOBILE_VOUCHER } = await import(
      "@/features/telecom/lib/report-engine"
    );
    expect(ALL_VOICE_MOBILE).toHaveLength(
      RECHARGE_VOICE_MOBILE_TTCASH.length + RECHARGE_VOICE_MOBILE_VOUCHER.length,
    );
  });

  it("contains only valid ChannelDef entries", () => {
    expect(ALL_VOICE_MOBILE.length).toBeGreaterThan(0);
    for (const cd of ALL_VOICE_MOBILE) {
      expect(isValidChannelDef(cd)).toBe(true);
    }
  });
});

describe("canal-groups — RECHARGE_SUMMARY_GROUPS", () => {
  it("has exactly 4 groups", () => {
    expect(RECHARGE_SUMMARY_GROUPS).toHaveLength(4);
  });

  it("contains Fixed Lines, Mobile Lines, Internet Sabba, and Data by Voucher", () => {
    const labels = RECHARGE_SUMMARY_GROUPS.map((g) => g.label);
    expect(labels).toContain("Fixed Lines");
    expect(labels).toContain("Mobile Lines");
    expect(labels).toContain("Internet Sabba");
    expect(labels).toContain("Data by Voucher");
  });

  it("every group has a valid structure with a color", () => {
    for (const g of RECHARGE_SUMMARY_GROUPS) {
      expect(isValidGroup(g)).toBe(true);
      expect(typeof g.color).toBe("string");
    }
  });

  it("Fixed Lines channels equal ALL_VOICE_FIXED", () => {
    const fixedGroup = RECHARGE_SUMMARY_GROUPS.find((g) => g.label === "Fixed Lines");
    expect(fixedGroup?.channels).toBe(ALL_VOICE_FIXED);
  });

  it("Mobile Lines channels equal ALL_VOICE_MOBILE", () => {
    const mobileGroup = RECHARGE_SUMMARY_GROUPS.find((g) => g.label === "Mobile Lines");
    expect(mobileGroup?.channels).toBe(ALL_VOICE_MOBILE);
  });
});

describe("canal-groups — VOIX_SUMMARY_GROUPS", () => {
  it("has exactly 2 groups (Fixed and Mobile)", () => {
    expect(VOIX_SUMMARY_GROUPS).toHaveLength(2);
  });

  it("contains Fixed Lines and Mobile Lines only", () => {
    const labels = VOIX_SUMMARY_GROUPS.map((g) => g.label);
    expect(labels).toContain("Fixed Lines");
    expect(labels).toContain("Mobile Lines");
  });

  it("every group is valid with a color", () => {
    for (const g of VOIX_SUMMARY_GROUPS) {
      expect(isValidGroup(g)).toBe(true);
      expect(typeof g.color).toBe("string");
    }
  });
});

describe("canal-groups — DATA_SUMMARY_GROUPS", () => {
  it("has exactly 2 groups", () => {
    expect(DATA_SUMMARY_GROUPS).toHaveLength(2);
  });

  it("contains Internet Sabba and Data by Voucher", () => {
    const labels = DATA_SUMMARY_GROUPS.map((g) => g.label);
    expect(labels).toContain("Internet Sabba");
    expect(labels).toContain("Data by Voucher");
  });

  it("every group is valid with a color", () => {
    for (const g of DATA_SUMMARY_GROUPS) {
      expect(isValidGroup(g)).toBe(true);
      expect(typeof g.color).toBe("string");
    }
  });
});

describe("canal-groups — VOUCHER_PAYMENT_SUMMARY_GROUPS", () => {
  it("has exactly 2 groups", () => {
    expect(VOUCHER_PAYMENT_SUMMARY_GROUPS).toHaveLength(2);
  });

  it("contains Génération and Rédemption & Remboursement", () => {
    const labels = VOUCHER_PAYMENT_SUMMARY_GROUPS.map((g) => g.label);
    expect(labels).toContain("Génération");
    expect(labels).toContain("Rédemption & Remboursement");
  });

  it("Génération group uses VOUCHER_FOR_PAYMENT_GENERATION channels", () => {
    const gen = VOUCHER_PAYMENT_SUMMARY_GROUPS.find((g) => g.label === "Génération");
    expect(gen?.channels).toBe(VOUCHER_FOR_PAYMENT_GENERATION);
  });

  it("Rédemption group uses VOUCHER_FOR_PAYMENT_REDEMPTION channels", () => {
    const red = VOUCHER_PAYMENT_SUMMARY_GROUPS.find(
      (g) => g.label === "Rédemption & Remboursement",
    );
    expect(red?.channels).toBe(VOUCHER_FOR_PAYMENT_REDEMPTION);
  });

  it("every group has a color", () => {
    for (const g of VOUCHER_PAYMENT_SUMMARY_GROUPS) {
      expect(typeof g.color).toBe("string");
    }
  });
});

describe("canal-groups — VOUCHER_CONVERGENT_SUMMARY_GROUPS", () => {
  it("has exactly 3 groups", () => {
    expect(VOUCHER_CONVERGENT_SUMMARY_GROUPS).toHaveLength(3);
  });

  it("contains Evoucher on Demand, Génération, and Activation", () => {
    const labels = VOUCHER_CONVERGENT_SUMMARY_GROUPS.map((g) => g.label);
    expect(labels).toContain("Evoucher on Demand");
    expect(labels).toContain("Génération");
    expect(labels).toContain("Activation");
  });

  it("every group has a valid structure and a color", () => {
    for (const g of VOUCHER_CONVERGENT_SUMMARY_GROUPS) {
      expect(isValidGroup(g)).toBe(true);
      expect(typeof g.color).toBe("string");
    }
  });

  it("Activation group channels come from VOUCHER_CONVERGENT_CARTE_ACTIVATION", async () => {
    const { VOUCHER_CONVERGENT_CARTE_ACTIVATION } = await import(
      "@/features/telecom/lib/report-engine"
    );
    const activation = VOUCHER_CONVERGENT_SUMMARY_GROUPS.find((g) => g.label === "Activation");
    expect(activation?.channels).toBe(VOUCHER_CONVERGENT_CARTE_ACTIVATION);
  });
});

describe("canal-groups — COMPARE_GROUPS", () => {
  it("has exactly 13 groups", () => {
    expect(COMPARE_GROUPS).toHaveLength(13);
  });

  it("contains all expected labels", () => {
    const labels = COMPARE_GROUPS.map((g) => g.label);
    expect(labels).toContain("Bill Payment");
    expect(labels).toContain("Fixed by TTCASH");
    expect(labels).toContain("Fixed by Voucher");
    expect(labels).toContain("Mobile by TTCASH");
    expect(labels).toContain("Mobile by Voucher");
    expect(labels).toContain("Internet Sabba");
    expect(labels).toContain("Data by Voucher");
    expect(labels).toContain("Voucher For Payment — Generation");
    expect(labels).toContain("Voucher For Payment — Redemption");
    expect(labels).toContain("Credit Transfer");
    expect(labels).toContain("Evoucher on Demand — Generation");
    expect(labels).toContain("Voucher Convergent — Generation");
    expect(labels).toContain("Voucher Convergent — Activation");
  });

  it("every group has a valid structure", () => {
    for (const g of COMPARE_GROUPS) {
      expect(isValidGroup(g)).toBe(true);
    }
  });

  it("every group has a color string", () => {
    for (const g of COMPARE_GROUPS) {
      expect(typeof g.color).toBe("string");
      expect((g.color ?? "").length).toBeGreaterThan(0);
    }
  });

  it("Bill Payment group channels come from BILL_PAYMENT_CHANNELS", async () => {
    const { BILL_PAYMENT_CHANNELS } = await import("@/features/telecom/lib/report-engine");
    const bp = COMPARE_GROUPS.find((g) => g.label === "Bill Payment");
    expect(bp?.channels).toBe(BILL_PAYMENT_CHANNELS);
  });

  it("Credit Transfer group channels come from CREDIT_TRANSFER", async () => {
    const { CREDIT_TRANSFER } = await import("@/features/telecom/lib/report-engine");
    const ct = COMPARE_GROUPS.find((g) => g.label === "Credit Transfer");
    expect(ct?.channels).toBe(CREDIT_TRANSFER);
  });

  it("Voucher For Payment — Generation uses VOUCHER_FOR_PAYMENT_GENERATION", () => {
    const group = COMPARE_GROUPS.find((g) => g.label === "Voucher For Payment — Generation");
    expect(group?.channels).toBe(VOUCHER_FOR_PAYMENT_GENERATION);
  });

  it("Voucher For Payment — Redemption uses VOUCHER_FOR_PAYMENT_REDEMPTION", () => {
    const group = COMPARE_GROUPS.find((g) => g.label === "Voucher For Payment — Redemption");
    expect(group?.channels).toBe(VOUCHER_FOR_PAYMENT_REDEMPTION);
  });

  it("no two groups share the same label", () => {
    const labels = COMPARE_GROUPS.map((g) => g.label);
    const unique = new Set(labels);
    expect(unique.size).toBe(labels.length);
  });
});
