import { describe, expect, it, vi } from "vitest";

// ─── Boundary mocks ───────────────────────────────────────────────────────────
// canal-hierarchy.ts imports from canal-groups.ts and report-engine.ts, both of
// which ultimately import report-engine.ts's four IO boundaries. Mock them so
// the module graph resolves without touching real hardware/network/disk (same
// boundary set as tests/features/telecom/lib/canal-groups.test.ts).

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
  VOUCHER_FOR_PAYMENT_GENERATION,
  VOUCHER_FOR_PAYMENT_REDEMPTION,
} from "@/features/telecom/lib/canal-groups";
import {
  ALL_CANAL_CHANNELS,
  CANAL_HIERARCHY,
  CANAL_NODE_BY_ID,
} from "@/features/telecom/lib/canal-hierarchy";
import {
  BILL_PAYMENT_CHANNELS,
  CREDIT_TRANSFER,
  EVOUCHER_ON_DEMAND_GENERATION,
  RECHARGE_DATA_EVOUCHER,
  RECHARGE_DATA_SABBA,
  VOUCHER_CONVERGENT_CARTE_ACTIVATION,
  VOUCHER_CONVERGENT_CARTE_GENERATION,
} from "@/features/telecom/lib/report-engine";

function byId(id: string) {
  return CANAL_HIERARCHY.find((s) => s.id === id);
}

// ─── Top-level structure ──────────────────────────────────────────────────────

describe("CANAL_HIERARCHY — top-level sections", () => {
  it("has exactly 5 top-level sections in a fixed order", () => {
    expect(CANAL_HIERARCHY.map((s) => s.id)).toEqual(["bill", "recharge", "vfp", "credit", "conv"]);
  });

  it("gives every section a non-empty label, color, and channels array", () => {
    for (const section of CANAL_HIERARCHY) {
      expect(section.label.length).toBeGreaterThan(0);
      expect(section.color.length).toBeGreaterThan(0);
      expect(section.channels.length).toBeGreaterThan(0);
    }
  });

  it("gives every section at least one child (outer ring)", () => {
    for (const section of CANAL_HIERARCHY) {
      expect(section.children?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

// ─── flatSection() sections: bill, credit ─────────────────────────────────────

describe("CANAL_HIERARCHY — flatSection sections (bill, credit)", () => {
  it("bill's top-level channels is the exact BILL_PAYMENT_CHANNELS reference", () => {
    expect(byId("bill")?.channels).toBe(BILL_PAYMENT_CHANNELS);
  });

  it("credit's top-level channels is the exact CREDIT_TRANSFER reference", () => {
    expect(byId("credit")?.channels).toBe(CREDIT_TRANSFER);
  });

  it("bill has one leaf child per channel, each wrapping that single channel", () => {
    const bill = byId("bill");
    expect(bill?.children).toHaveLength(BILL_PAYMENT_CHANNELS.length);
    bill?.children?.forEach((child, i) => {
      expect(child.id).toBe(`bill:${i}`);
      expect(child.label).toBe(BILL_PAYMENT_CHANNELS[i].name);
      expect(child.channels).toEqual([BILL_PAYMENT_CHANNELS[i]]);
      expect(child.channels[0]).toBe(BILL_PAYMENT_CHANNELS[i]);
    });
  });

  it("credit has one leaf child per channel, each wrapping that single channel", () => {
    const credit = byId("credit");
    expect(credit?.children).toHaveLength(CREDIT_TRANSFER.length);
    credit?.children?.forEach((child, i) => {
      expect(child.id).toBe(`credit:${i}`);
      expect(child.label).toBe(CREDIT_TRANSFER[i].name);
      expect(child.channels[0]).toBe(CREDIT_TRANSFER[i]);
    });
  });
});

// ─── recharge section (hand-built groups) ─────────────────────────────────────

describe("CANAL_HIERARCHY — recharge section", () => {
  const recharge = byId("recharge");

  it("has the 4 expected sub-section ids in order", () => {
    expect(recharge?.children?.map((c) => c.id)).toEqual([
      "recharge:voix-fixe",
      "recharge:voix-mobile",
      "recharge:data-sabba",
      "recharge:data-evoucher",
    ]);
  });

  it("wires each sub-section's channels to the exact matching canal-groups/report-engine array", () => {
    const children = recharge?.children ?? [];
    expect(children[0]?.channels).toBe(ALL_VOICE_FIXED);
    expect(children[1]?.channels).toBe(ALL_VOICE_MOBILE);
    expect(children[2]?.channels).toBe(RECHARGE_DATA_SABBA);
    expect(children[3]?.channels).toBe(RECHARGE_DATA_EVOUCHER);
  });

  it("aggregates its top-level channels as the concatenation of its 4 sub-groups, in order", () => {
    expect(recharge?.channels).toEqual([
      ...ALL_VOICE_FIXED,
      ...ALL_VOICE_MOBILE,
      ...RECHARGE_DATA_SABBA,
      ...RECHARGE_DATA_EVOUCHER,
    ]);
  });
});

// ─── vfp section ───────────────────────────────────────────────────────────────

describe("CANAL_HIERARCHY — vfp (Voucher For Payment) section", () => {
  const vfp = byId("vfp");

  it("has the 2 expected sub-section ids in order", () => {
    expect(vfp?.children?.map((c) => c.id)).toEqual(["vfp:gen", "vfp:red"]);
  });

  it("wires Génération and Rédemption to the matching canal-groups arrays", () => {
    const children = vfp?.children ?? [];
    expect(children[0]?.channels).toBe(VOUCHER_FOR_PAYMENT_GENERATION);
    expect(children[1]?.channels).toBe(VOUCHER_FOR_PAYMENT_REDEMPTION);
  });

  it("aggregates its top-level channels as generation + redemption, in order", () => {
    expect(vfp?.channels).toEqual([...VOUCHER_FOR_PAYMENT_GENERATION, ...VOUCHER_FOR_PAYMENT_REDEMPTION]);
  });
});

// ─── conv section ──────────────────────────────────────────────────────────────

describe("CANAL_HIERARCHY — conv (Voucher Convergent) section", () => {
  const conv = byId("conv");

  it("has the 3 expected sub-section ids in order", () => {
    expect(conv?.children?.map((c) => c.id)).toEqual([
      "conv:evoucher",
      "conv:carte-gen",
      "conv:carte-act",
    ]);
  });

  it("wires each sub-section's channels to the matching report-engine array", () => {
    const children = conv?.children ?? [];
    expect(children[0]?.channels).toBe(EVOUCHER_ON_DEMAND_GENERATION);
    expect(children[1]?.channels).toBe(VOUCHER_CONVERGENT_CARTE_GENERATION);
    expect(children[2]?.channels).toBe(VOUCHER_CONVERGENT_CARTE_ACTIVATION);
  });

  it("aggregates its top-level channels as evoucher + carte-gen + carte-act, in order", () => {
    expect(conv?.channels).toEqual([
      ...EVOUCHER_ON_DEMAND_GENERATION,
      ...VOUCHER_CONVERGENT_CARTE_GENERATION,
      ...VOUCHER_CONVERGENT_CARTE_ACTIVATION,
    ]);
  });
});

// ─── ALL_CANAL_CHANNELS ────────────────────────────────────────────────────────

describe("ALL_CANAL_CHANNELS", () => {
  it("is the flat concatenation of every section's channels, in section order", () => {
    const expected = CANAL_HIERARCHY.flatMap((s) => s.channels);
    expect(ALL_CANAL_CHANNELS).toEqual(expected);
    expect(ALL_CANAL_CHANNELS).toHaveLength(expected.length);
  });

  it("includes every bill and credit channel", () => {
    for (const c of [...BILL_PAYMENT_CHANNELS, ...CREDIT_TRANSFER]) {
      expect(ALL_CANAL_CHANNELS).toContain(c);
    }
  });
});

// ─── CANAL_NODE_BY_ID ──────────────────────────────────────────────────────────

describe("CANAL_NODE_BY_ID", () => {
  it("maps every top-level section id to that exact section object", () => {
    for (const section of CANAL_HIERARCHY) {
      expect(CANAL_NODE_BY_ID.get(section.id)).toBe(section);
    }
  });

  it("maps every child id to that exact child object", () => {
    for (const section of CANAL_HIERARCHY) {
      for (const child of section.children ?? []) {
        expect(CANAL_NODE_BY_ID.get(child.id)).toBe(child);
      }
    }
  });

  it("has exactly one entry per section plus one per child (no id collisions)", () => {
    const childCount = CANAL_HIERARCHY.reduce((sum, s) => sum + (s.children?.length ?? 0), 0);
    expect(CANAL_NODE_BY_ID.size).toBe(CANAL_HIERARCHY.length + childCount);
  });

  it("returns undefined for an id that does not exist anywhere in the hierarchy", () => {
    expect(CANAL_NODE_BY_ID.get("does-not-exist")).toBeUndefined();
  });
});
