import { describe, expect, it } from "vitest";
import {
  buildCanalMapping,
  type CanalFieldChoice,
  comboMatchesRule,
  defaultFieldChoice,
} from "@/features/telecom/lib/canal-mapping-scope";
import type { UnclassifiedCanalCombo } from "@/features/telecom/types";

const combo = (partial: Partial<UnclassifiedCanalCombo> = {}): UnclassifiedCanalCombo => ({
  brandD: "777",
  accountLayerId: "",
  accountGroupId: "",
  accountMsisdn: "",
  total: 5,
  ...partial,
});

describe("defaultFieldChoice", () => {
  it("checks only fields that carry a non-empty value", () => {
    const c = combo({ accountLayerId: "1", accountGroupId: "", accountMsisdn: "216000" });
    expect(defaultFieldChoice(c)).toEqual({ layer: true, group: false, msisdn: true });
  });

  it("returns all-false when only BRAND_D is populated", () => {
    expect(defaultFieldChoice(combo())).toEqual({ layer: false, group: false, msisdn: false });
  });

  it("returns all-true when every field is populated", () => {
    const c = combo({ accountLayerId: "1", accountGroupId: "2", accountMsisdn: "216000" });
    expect(defaultFieldChoice(c)).toEqual({ layer: true, group: true, msisdn: true });
  });
});

describe("buildCanalMapping", () => {
  it("nulls out fields the choice excludes, keeping BRAND_D and included fields", () => {
    const c = combo({ accountLayerId: "1", accountGroupId: "2", accountMsisdn: "216000" });
    const fields: CanalFieldChoice = { layer: true, group: false, msisdn: false };

    const rule = buildCanalMapping(c, fields, "credit_transfer");

    expect(rule).toEqual({
      brandD: "777",
      accountLayerId: "1",
      accountGroupId: null,
      accountMsisdn: null,
      key: "credit_transfer",
    });
  });

  it("nulls every narrowing field when the choice is all-false (BRAND_D-only rule)", () => {
    const c = combo({ accountLayerId: "1", accountGroupId: "2", accountMsisdn: "216000" });
    const fields: CanalFieldChoice = { layer: false, group: false, msisdn: false };

    const rule = buildCanalMapping(c, fields, "data_sabba");

    expect(rule.accountLayerId).toBeNull();
    expect(rule.accountGroupId).toBeNull();
    expect(rule.accountMsisdn).toBeNull();
  });

  it("keeps every field when the choice is all-true (exact-combo rule)", () => {
    const c = combo({ accountLayerId: "1", accountGroupId: "2", accountMsisdn: "216000" });
    const fields: CanalFieldChoice = { layer: true, group: true, msisdn: true };

    const rule = buildCanalMapping(c, fields, "bill_payment");

    expect(rule).toEqual({
      brandD: "777",
      accountLayerId: "1",
      accountGroupId: "2",
      accountMsisdn: "216000",
      key: "bill_payment",
    });
  });
});

describe("comboMatchesRule", () => {
  it("requires BRAND_D to match regardless of narrowing fields", () => {
    const c = combo({ brandD: "777" });
    const rule = buildCanalMapping(combo({ brandD: "888" }), { layer: false, group: false, msisdn: false }, "data_sabba");

    expect(comboMatchesRule(c, rule)).toBe(false);
  });

  it("a BRAND_D-only rule (all fields null) matches any combo with that BRAND_D", () => {
    const rule = buildCanalMapping(
      combo({ brandD: "777", accountMsisdn: "216000" }),
      { layer: false, group: false, msisdn: false },
      "credit_transfer",
    );

    expect(comboMatchesRule(combo({ brandD: "777", accountMsisdn: "999999999999" }), rule)).toBe(
      true,
    );
    expect(comboMatchesRule(combo({ brandD: "777", accountLayerId: "9" }), rule)).toBe(true);
    expect(comboMatchesRule(combo({ brandD: "888" }), rule)).toBe(false);
  });

  it("a BRAND_D + MSISDN rule only matches combos sharing both fields", () => {
    const source = combo({ brandD: "39", accountMsisdn: "21619444555" });
    const rule = buildCanalMapping(source, { layer: false, group: false, msisdn: true }, "bill_payment");

    expect(comboMatchesRule(combo({ brandD: "39", accountMsisdn: "21619444555" }), rule)).toBe(
      true,
    );
    // Same BRAND_D, different MSISDN — a real distinct channel, must NOT match.
    expect(comboMatchesRule(combo({ brandD: "39", accountMsisdn: "21619777888" }), rule)).toBe(
      false,
    );
  });

  it("a BRAND_D + layer + group rule requires all three to match", () => {
    const source = combo({ brandD: "35", accountLayerId: "14", accountGroupId: "152" });
    const rule = buildCanalMapping(source, { layer: true, group: true, msisdn: false }, "bill_payment");

    expect(
      comboMatchesRule(combo({ brandD: "35", accountLayerId: "14", accountGroupId: "152" }), rule),
    ).toBe(true);
    expect(
      comboMatchesRule(combo({ brandD: "35", accountLayerId: "14", accountGroupId: "162" }), rule),
    ).toBe(false);
  });

  it("does not match itself against an unrelated rule with unset fields treated as ∅ string, not null", () => {
    // Guards against accidentally treating "" (empty string data) the same as
    // `null` (unconstrained rule field) — they are different states.
    const rule = buildCanalMapping(combo(), { layer: false, group: false, msisdn: false }, "data_sabba");
    expect(rule.accountLayerId).toBeNull();
    expect(comboMatchesRule(combo({ accountLayerId: "" }), rule)).toBe(true);
  });
});
