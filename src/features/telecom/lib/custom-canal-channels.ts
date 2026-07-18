import type {
  CanalKey,
  CanalRule,
  CanalRuleOrigin,
  CanalRuleReportGroup,
} from "@/features/telecom/types";

export interface CanalRuleFilter {
  canalKey?: CanalKey;
  origin?: CanalRuleOrigin;
  reportGroup?: CanalRuleReportGroup;
  includeDisabled?: boolean;
}

/**
 * Selects canal rules for reports and UI components.
 *
 * This function does not generate SQL or modify rules. SQL generation belongs
 * to canal-rule-condition.ts.
 */
export function selectCanalRules(
  rules: readonly CanalRule[],
  filter: CanalRuleFilter = {},
): CanalRule[] {
  return rules.filter((rule) => {
    if (!filter.includeDisabled && !rule.enabled) {
      return false;
    }

    if (filter.canalKey !== undefined && rule.canalKey !== filter.canalKey) {
      return false;
    }

    if (filter.origin !== undefined && rule.origin !== filter.origin) {
      return false;
    }

    if (filter.reportGroup !== undefined && rule.reportGroup !== filter.reportGroup) {
      return false;
    }

    return true;
  });
}

/**
 * Returns all enabled rules—system and custom—belonging to one canal.
 */
export function rulesForCanal(rules: readonly CanalRule[], canalKey: CanalKey): CanalRule[] {
  return selectCanalRules(rules, {
    canalKey,
  });
}

/**
 * Returns only custom enabled rules belonging to one canal.
 *
 * Use this only when the UI specifically needs to distinguish custom rules.
 * Reports should normally use rulesForCanal so edited default rules are also
 * included.
 */
export function customRulesForCanal(rules: readonly CanalRule[], canalKey: CanalKey): CanalRule[] {
  return selectCanalRules(rules, {
    canalKey,
    origin: "custom",
  });
}

/**
 * Returns enabled rules assigned to a specific report subgroup.
 */
export function rulesForReportGroup(
  rules: readonly CanalRule[],
  reportGroup: Exclude<CanalRuleReportGroup, null>,
): CanalRule[] {
  return selectCanalRules(rules, {
    reportGroup,
  });
}
