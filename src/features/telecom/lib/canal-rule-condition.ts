import type { CanalRule, CanalRuleMatch } from "@/features/telecom/types";

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function requiredValue(value: string, fieldName: string, ruleName: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`Canal rule "${ruleName}" has an empty ${fieldName} value.`);
  }

  return normalized;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported canal match: ${JSON.stringify(value)}`);
}

function brandCondition(match: CanalRuleMatch, ruleName: string): string {
  const brandDValues = match.brandDValues.map((value) => requiredValue(value, "BRAND_D", ruleName));

  if (brandDValues.length === 0) {
    throw new Error(`Canal rule "${ruleName}" must include at least one BRAND_D value.`);
  }

  return `TRIM(CAST(BRAND_D AS VARCHAR)) IN (${brandDValues.map(sqlLiteral).join(", ")})`;
}

/**
 * Generates the raw SQL WHERE condition for one structured CanalRule.
 *
 * This module intentionally does not import sql.ts or report-engine.ts,
 * preventing circular dependencies.
 *
 * The CanalRuleMatch discriminated union guarantees that only these matching
 * shapes are generated:
 *
 * - BRAND_D
 * - BRAND_D + ACCOUNT_LAYER_ID
 * - BRAND_D + ACCOUNT_LAYER_ID + ACCOUNT_GROUP_ID
 * - BRAND_D + ACCOUNT_MSISDN
 */
export function canalRuleCondition(rule: CanalRule): string {
  const conditions: string[] = [brandCondition(rule.match, rule.name)];

  switch (rule.match.kind) {
    case "brand":
      break;

    case "brand-layer":
      conditions.push(
        `TRIM(CAST(ACCOUNT_LAYER_ID AS VARCHAR)) = ${sqlLiteral(
          requiredValue(rule.match.accountLayerId, "ACCOUNT_LAYER_ID", rule.name),
        )}`,
      );
      break;

    case "brand-layer-group":
      conditions.push(
        `TRIM(CAST(ACCOUNT_LAYER_ID AS VARCHAR)) = ${sqlLiteral(
          requiredValue(rule.match.accountLayerId, "ACCOUNT_LAYER_ID", rule.name),
        )}`,
      );

      conditions.push(
        `TRIM(CAST(ACCOUNT_GROUP_ID AS VARCHAR)) = ${sqlLiteral(
          requiredValue(rule.match.accountGroupId, "ACCOUNT_GROUP_ID", rule.name),
        )}`,
      );
      break;

    case "brand-msisdn":
      conditions.push(
        `TRIM(CAST(ACCOUNT_MSISDN AS VARCHAR)) = ${sqlLiteral(
          requiredValue(rule.match.accountMsisdn, "ACCOUNT_MSISDN", rule.name),
        )}`,
      );
      break;

    default:
      assertNever(rule.match);
  }

  return conditions.join(" AND ");
}
