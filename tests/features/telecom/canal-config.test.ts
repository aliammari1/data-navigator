import { describe, expect, it } from "vitest";
import {
  CANAL_CONFIG,
  CHART_PALETTE,
  enrichCanalSummaries,
  reattachCanalIcons,
  STATUS_COLORS,
  stripCanalIconsForPersist,
} from "@/features/telecom/lib/canal-config";
import type { RawCanalRow } from "@/features/telecom/lib/queries";
import { STATUS_PRESENTATION } from "@/features/telecom/lib/status-definitions";
import type { CanalKey, CanalSummary } from "@/features/telecom/types";

const ALL_CANAL_KEYS: CanalKey[] = [
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

function rawCanal(partial: Partial<RawCanalRow> & { key: CanalKey }): RawCanalRow {
  return {
    label: partial.label ?? partial.key,
    total: 0,
    success: 0,
    declined: 0,
    refund: 0,
    instance: 0,
    submitted: 0,
    amount: 0,
    successRate: 0,
    avgAmount: 0,
    share: 0,
    ...partial,
  };
}

describe("CANAL_CONFIG", () => {
  it("defines a visual config for every canal key", () => {
    for (const key of ALL_CANAL_KEYS) {
      expect(CANAL_CONFIG[key]).toBeDefined();
      expect(CANAL_CONFIG[key].label.length).toBeGreaterThan(0);
      expect(CANAL_CONFIG[key].shortLabel.length).toBeGreaterThan(0);
    }
  });

  it("carries an icon component for each canal", () => {
    for (const key of ALL_CANAL_KEYS) {
      expect(CANAL_CONFIG[key].icon).toBeTruthy();
    }
  });
});

describe("STATUS_COLORS", () => {
  it("derives each category color from the status presentation single source of truth", () => {
    expect(STATUS_COLORS.SUCCESS).toBe(STATUS_PRESENTATION.success.color);
    expect(STATUS_COLORS.DECLINED).toBe(STATUS_PRESENTATION.declined.color);
    expect(STATUS_COLORS.OTHER).toBe(STATUS_PRESENTATION.other.color);
  });

  it("covers the six business status categories", () => {
    for (const cat of ["SUCCESS", "DECLINED", "REFUND", "INSTANCE", "SUBMITTED", "OTHER"]) {
      expect(STATUS_COLORS[cat]).toMatch(/^#/);
    }
  });
});

describe("CHART_PALETTE", () => {
  it("is a non-empty list of unique hex colors", () => {
    expect(CHART_PALETTE.length).toBeGreaterThan(0);
    expect(new Set(CHART_PALETTE).size).toBe(CHART_PALETTE.length);
    for (const color of CHART_PALETTE) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("enrichCanalSummaries", () => {
  it("attaches icon and color fields from CANAL_CONFIG to each raw row", () => {
    const enriched = enrichCanalSummaries([
      rawCanal({ key: "bill_payment", total: 100, success: 90, successRate: 90 }),
    ]);

    const cfg = CANAL_CONFIG.bill_payment;
    expect(enriched[0]).toMatchObject({
      key: "bill_payment",
      icon: cfg.icon,
      color: cfg.color,
      bgColor: cfg.bg,
      borderColor: cfg.border,
    });
  });

  it("preserves the numeric aggregate fields untouched", () => {
    const enriched = enrichCanalSummaries([
      rawCanal({
        key: "credit_transfer",
        total: 200,
        success: 150,
        declined: 50,
        amount: 1234.5,
        successRate: 75,
        share: 12.5,
      }),
    ]);

    expect(enriched[0]).toMatchObject({
      total: 200,
      success: 150,
      declined: 50,
      amount: 1234.5,
      successRate: 75,
      share: 12.5,
    });
  });

  it("returns an empty array for empty input", () => {
    expect(enrichCanalSummaries([])).toEqual([]);
  });

  it("preserves input order and length", () => {
    const enriched = enrichCanalSummaries([
      rawCanal({ key: "data_sabba" }),
      rawCanal({ key: "bill_payment" }),
    ]);

    expect(enriched.map((c) => c.key)).toEqual(["data_sabba", "bill_payment"]);
  });
});

describe("stripCanalIconsForPersist", () => {
  it("drops the icon field while keeping every other field intact", () => {
    // Arrange
    const enriched = enrichCanalSummaries([
      rawCanal({ key: "bill_payment", total: 100, success: 90, successRate: 90 }),
    ]);

    // Act
    const stripped = stripCanalIconsForPersist(enriched);

    // Assert
    expect(stripped[0]).not.toHaveProperty("icon");
    expect(stripped[0]).toMatchObject({
      key: "bill_payment",
      total: 100,
      success: 90,
      successRate: 90,
      color: CANAL_CONFIG.bill_payment.color,
      bgColor: CANAL_CONFIG.bill_payment.bg,
      borderColor: CANAL_CONFIG.bill_payment.border,
    });
  });

  it("returns an empty array for empty input", () => {
    expect(stripCanalIconsForPersist([])).toEqual([]);
  });

  it("maps every element, preserving order", () => {
    const enriched = enrichCanalSummaries([
      rawCanal({ key: "data_sabba" }),
      rawCanal({ key: "voucher_convergent" }),
    ]);

    const stripped = stripCanalIconsForPersist(enriched);

    expect(stripped.map((c) => c.key)).toEqual(["data_sabba", "voucher_convergent"]);
    expect(stripped.every((c) => !("icon" in c))).toBe(true);
  });
});

describe("reattachCanalIcons", () => {
  it("re-derives the icon component from CANAL_CONFIG by key", () => {
    // Arrange
    const enriched = enrichCanalSummaries([rawCanal({ key: "credit_transfer" })]);
    const stripped = stripCanalIconsForPersist(enriched);

    // Act
    const reattached = reattachCanalIcons(stripped);

    // Assert
    expect(reattached[0].icon).toBe(CANAL_CONFIG.credit_transfer.icon);
  });

  it("round-trips through strip + reattach back to an equivalent CanalSummary", () => {
    const enriched = enrichCanalSummaries([
      rawCanal({ key: "voice_mobile_ttcash", total: 50, amount: 999.5 }),
    ]);

    const roundTripped = reattachCanalIcons(stripCanalIconsForPersist(enriched));

    expect(roundTripped).toEqual(enriched);
  });

  it("returns an empty array for empty input", () => {
    expect(reattachCanalIcons([])).toEqual([]);
  });

  it("maps every element, preserving order and length", () => {
    const stripped = stripCanalIconsForPersist(
      enrichCanalSummaries([
        rawCanal({ key: "data_evoucher" }),
        rawCanal({ key: "voucher_for_payment" }),
        rawCanal({ key: "voice_fixed_voucher" }),
      ]),
    );

    const reattached: CanalSummary[] = reattachCanalIcons(stripped);

    expect(reattached.map((c) => c.key)).toEqual([
      "data_evoucher",
      "voucher_for_payment",
      "voice_fixed_voucher",
    ]);
    expect(reattached[0].icon).toBe(CANAL_CONFIG.data_evoucher.icon);
    expect(reattached[1].icon).toBe(CANAL_CONFIG.voucher_for_payment.icon);
    expect(reattached[2].icon).toBe(CANAL_CONFIG.voice_fixed_voucher.icon);
  });
});
