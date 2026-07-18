/**
 * Pure match-scope logic for canal rules created from unclassified
 * transaction combinations.
 *
 * Every rule is anchored on one or more BRAND_D values and may additionally
 * match exactly one of these supported shapes:
 *
 * - BRAND_D only
 * - BRAND_D + ACCOUNT_LAYER_ID
 * - BRAND_D + ACCOUNT_LAYER_ID + ACCOUNT_GROUP_ID
 * - BRAND_D + ACCOUNT_MSISDN
 *
 * The discriminated CanalRuleMatch union makes unsupported combinations—such
 * as LAYER + MSISDN—impossible to represent.
 */

import type {
  CanalKey,
  CanalRule,
  CanalRuleMatch,
  CanalRuleOrigin,
  CanalRuleReportGroup,
  UnclassifiedCanalCombo,
} from "@/features/telecom/types";

export type CanalMatchKind = CanalRuleMatch["kind"];

export interface BuildCanalRuleOptions {
  /**
   * ID and timestamp are supplied by the application layer to keep this module
   * deterministic and easy to test.
   */
  id: string;
  timestamp: string;

  reportGroup?: CanalRuleReportGroup;
  origin?: CanalRuleOrigin;
  enabled?: boolean;
}

/**
 * Returns every match kind that can be created from the supplied combo.
 *
 * BRAND_D is always available. Other options are included only when their
 * required raw values exist.
 */
export function availableMatchKinds(combo: UnclassifiedCanalCombo): CanalMatchKind[] {
  const kinds: CanalMatchKind[] = ["brand"];

  if (combo.accountLayerId !== "") {
    kinds.push("brand-layer");
  }

  if (combo.accountLayerId !== "" && combo.accountGroupId !== "") {
    kinds.push("brand-layer-group");
  }

  if (combo.accountMsisdn !== "") {
    kinds.push("brand-msisdn");
  }

  return kinds;
}

/**
 * Starts with the most specific supported match shape.
 *
 * Users can intentionally broaden the rule later through the editor.
 */
export function defaultMatchKind(combo: UnclassifiedCanalCombo): CanalMatchKind {
  if (combo.accountLayerId !== "" && combo.accountGroupId !== "") {
    return "brand-layer-group";
  }

  if (combo.accountLayerId !== "") {
    return "brand-layer";
  }

  if (combo.accountMsisdn !== "") {
    return "brand-msisdn";
  }

  return "brand";
}

function requiredValue(value: string, fieldName: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
}

/**
 * Builds a valid discriminated match from one unclassified combo.
 */
export function buildMatchFromCombo(
  combo: UnclassifiedCanalCombo,
  matchKind: CanalMatchKind,
): CanalRuleMatch {
  const brandD = requiredValue(combo.brandD, "BRAND_D");

  switch (matchKind) {
    case "brand":
      return {
        kind: "brand",
        brandDValues: [brandD],
      };

    case "brand-layer":
      return {
        kind: "brand-layer",
        brandDValues: [brandD],
        accountLayerId: requiredValue(combo.accountLayerId, "ACCOUNT_LAYER_ID"),
      };

    case "brand-layer-group":
      return {
        kind: "brand-layer-group",
        brandDValues: [brandD],
        accountLayerId: requiredValue(combo.accountLayerId, "ACCOUNT_LAYER_ID"),
        accountGroupId: requiredValue(combo.accountGroupId, "ACCOUNT_GROUP_ID"),
      };

    case "brand-msisdn":
      return {
        kind: "brand-msisdn",
        brandDValues: [brandD],
        accountMsisdn: requiredValue(combo.accountMsisdn, "ACCOUNT_MSISDN"),
      };
  }
}

/**
 * Creates a canonical CanalRule from an unclassified combo.
 *
 * This function does not call crypto.randomUUID() or new Date(). The caller
 * supplies those values so the domain function remains deterministic.
 */
export function buildCanalRule(
  combo: UnclassifiedCanalCombo,
  matchKind: CanalMatchKind,
  canalKey: CanalKey,
  name: string,
  options: BuildCanalRuleOptions,
): CanalRule {
  const normalizedName = requiredValue(name, "Rule name");

  if (!availableMatchKinds(combo).includes(matchKind)) {
    throw new Error(`Match kind "${matchKind}" is unavailable for this combination.`);
  }

  const reportGroup = options.reportGroup ?? null;

  if (canalKey === "voucher_for_payment" && reportGroup === null) {
    throw new Error("Voucher For Payment rules require a report group.");
  }

  return {
    id: requiredValue(options.id, "Rule ID"),
    name: normalizedName,
    canalKey,
    match: buildMatchFromCombo(combo, matchKind),

    reportGroup: canalKey === "voucher_for_payment" ? reportGroup : null,

    origin: options.origin ?? "custom",
    enabled: options.enabled ?? true,

    createdAt: requiredValue(options.timestamp, "Creation timestamp"),
    updatedAt: requiredValue(options.timestamp, "Update timestamp"),
  };
}

/**
 * Tests whether a raw unclassified combination is covered by a rule.
 *
 * Disabled rules never match.
 */
export function comboMatchesRule(combo: UnclassifiedCanalCombo, rule: CanalRule): boolean {
  if (!rule.enabled) {
    return false;
  }

  if (!rule.match.brandDValues.includes(combo.brandD)) {
    return false;
  }

  switch (rule.match.kind) {
    case "brand":
      return true;

    case "brand-layer":
      return combo.accountLayerId === rule.match.accountLayerId;

    case "brand-layer-group":
      return (
        combo.accountLayerId === rule.match.accountLayerId &&
        combo.accountGroupId === rule.match.accountGroupId
      );

    case "brand-msisdn":
      return combo.accountMsisdn === rule.match.accountMsisdn;
  }
}

/**
 * Returns a deterministic specificity score for rule ordering.
 *
 * Higher values represent narrower rules and should be evaluated first.
 */
export function canalRuleSpecificity(rule: CanalRule): number {
  switch (rule.match.kind) {
    case "brand":
      return 0;

    case "brand-layer":
    case "brand-msisdn":
      return 1;

    case "brand-layer-group":
      return 2;
  }
}
