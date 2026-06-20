import { describe, expect, it } from "vitest";
import {
  CANAL_CONFIG,
  CHART_PALETTE,
  STATUS_COLORS,
  enrichCanalSummaries,
} from "@/features/telecom/lib/canal-config";
import type { RawCanalRow } from "@/features/telecom/lib/queries";
import { STATUS_PRESENTATION } from "@/features/telecom/lib/status-definitions";
import type { CanalKey } from "@/features/telecom/types";

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
