/**
 * Pure logic behind the "new canal detected" dialog's per-combo match scope.
 *
 * The real classification rules (report-engine.ts's ChannelDef conditions)
 * never key off a fixed set of 4 fields — every condition anchors on BRAND_D,
 * then optionally narrows by ONE of: nothing (BRAND_D alone), ACCOUNT_MSISDN,
 * ACCOUNT_LAYER_ID, or ACCOUNT_LAYER_ID + ACCOUNT_GROUP_ID. A dialog that
 * always matched on the full 4-tuple would produce overrides far narrower
 * than the real rule, so a future upload with the same BRAND_D but a
 * different MSISDN (say) would get flagged as unclassified all over again.
 * This module lets the user pick which fields actually belong in the match.
 */

import type { CanalKey, CanalMapping, UnclassifiedCanalCombo } from "@/features/telecom/types";

export interface CanalFieldChoice {
  layer: boolean;
  group: boolean;
  msisdn: boolean;
}

/** Sensible starting point: match on whichever fields actually carry a value
 * for this combo. Blank fields are excluded by default since matching on
 * an empty string is rarely meaningful — the user can still opt back in. */
export function defaultFieldChoice(combo: UnclassifiedCanalCombo): CanalFieldChoice {
  return {
    layer: combo.accountLayerId !== "",
    group: combo.accountGroupId !== "",
    msisdn: combo.accountMsisdn !== "",
  };
}

/** Builds the `CanalMapping` rule a combo + field choice + canal represents.
 * Unchecked fields become `null`, meaning "matches any value" in `sql.ts`'s
 * `canalCaseExpr`. */
export function buildCanalMapping(
  combo: UnclassifiedCanalCombo,
  fields: CanalFieldChoice,
  key: CanalKey,
): CanalMapping {
  return {
    brandD: combo.brandD,
    accountLayerId: fields.layer ? combo.accountLayerId : null,
    accountGroupId: fields.group ? combo.accountGroupId : null,
    accountMsisdn: fields.msisdn ? combo.accountMsisdn : null,
    key,
  };
}

/** Whether `combo` would already be classified by `rule` — mirrors the WHERE
 * semantics `canalCaseExpr` builds from a `CanalMapping` (a `null` field on
 * the rule matches any value). Used to auto-resolve sibling combos in the
 * dialog once a broader rule (e.g. "this whole BRAND_D") already covers them,
 * instead of asking the user to classify each near-duplicate separately. */
export function comboMatchesRule(combo: UnclassifiedCanalCombo, rule: CanalMapping): boolean {
  if (combo.brandD !== rule.brandD) return false;
  if (rule.accountLayerId !== null && combo.accountLayerId !== rule.accountLayerId) return false;
  if (rule.accountGroupId !== null && combo.accountGroupId !== rule.accountGroupId) return false;
  if (rule.accountMsisdn !== null && combo.accountMsisdn !== rule.accountMsisdn) return false;
  return true;
}
