import {
  BUILTIN_STATUS_CODES,
  type ClassifiedStatusSemantic,
  DEFAULT_STATUS_MAPPINGS,
  SEMANTIC_TO_CATEGORY,
} from "@/features/telecom/lib/status-definitions";
import type { CanalKey, CanalRule, ColumnMapping, StatusMapping } from "../types";
import { canalRuleCondition } from "./canal-rule-condition";

export { BUILTIN_STATUS_CODES, SEMANTIC_TO_CATEGORY };

// ─── Identifier / literal quoting ─────────────────────────────────────────────

/** Safe SQL identifier quoting. Rejects identifiers containing dangerous characters. */
export function qc(col: string): string {
  if (!col || typeof col !== "string") {
    throw new TypeError("Invalid column identifier: must be a non-empty string");
  }
  // Reject identifiers that could be used for SQL injection
  if (/[;\\]|--|\/\*|\*\//.test(col)) {
    throw new Error(`Unsafe column identifier rejected: ${col}`);
  }
  return `"${col.replaceAll('"', '""')}"`;
}

/** Returns a SQL expression for col, or NULL literal when col is unmapped (empty string). */
export function colExpr(col: string): string {
  return col ? qc(col) : "NULL";
}

export function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

// ─── Status normalisation ─────────────────────────────────────────────────────

export function normalizeStatusCode(
  status: string,
  mapping: StatusMapping[] = DEFAULT_STATUS_MAPPINGS,
): string {
  const code = status.trim().toUpperCase();
  if (!code) return "";
  const configured = mapping.find((m) => m.rawCode.toUpperCase() === code);
  if (configured) {
    return configured.semantic === "other"
      ? "OTHER"
      : (SEMANTIC_TO_CATEGORY[configured.semantic] ?? "OTHER");
  }
  for (const [semantic, codes] of Object.entries(BUILTIN_STATUS_CODES) as Array<
    [ClassifiedStatusSemantic, string[]]
  >) {
    if (codes.includes(code)) return SEMANTIC_TO_CATEGORY[semantic];
  }
  return "OTHER";
}

export function statusNorm(
  m: ColumnMapping,
  sm: StatusMapping[] = DEFAULT_STATUS_MAPPINGS,
): string {
  const s = qc(m.status);
  const v = `UPPER(TRIM(CAST(${s} AS VARCHAR)))`;
  const configuredCodes = new Set(sm.map((e) => e.rawCode.trim().toUpperCase()));
  const whenClauses = sm
    .filter((e) => e.rawCode.trim())
    .map((e) => {
      const code = e.rawCode.trim().toUpperCase();
      const cat = e.semantic === "other" ? "OTHER" : (SEMANTIC_TO_CATEGORY[e.semantic] ?? "OTHER");
      return `WHEN ${v} = ${sqlLiteral(code)} THEN ${sqlLiteral(cat)}`;
    });

  for (const [semantic, codes] of Object.entries(BUILTIN_STATUS_CODES) as Array<
    [ClassifiedStatusSemantic, string[]]
  >) {
    const missingCodes = codes.filter((code) => !configuredCodes.has(code));
    if (missingCodes.length === 0) continue;
    whenClauses.push(
      `WHEN ${v} IN (${missingCodes.map(sqlLiteral).join(",")}) THEN ${sqlLiteral(
        SEMANTIC_TO_CATEGORY[semantic],
      )}`,
    );
  }

  if (whenClauses.length > 0) {
    return `CASE
    ${whenClauses.join("\n    ")}
    WHEN ${v} = '' THEN 'OTHER'
    ELSE 'OTHER'
  END`;
  }

  return "'OTHER'";
}

// ─── Hour extraction ──────────────────────────────────────────────────────────

/** Extract hour (0–23) from TRANSACTION_DATE column. Format: "DD/MM/YYYY HH:MM:SS" */
export function hourExpr(m: ColumnMapping): string {
  const d = qc(m.transactionDate);
  return `TRY_CAST(SPLIT_PART(SPLIT_PART(CAST(${d} AS VARCHAR),' ',2),':',1) AS INTEGER)`;
}

// ─── Canal classification ─────────────────────────────────────────────────────
// ─── Canal classification ─────────────────────────────────────────────────────

/**
 * Single source of truth for report-category labels.
 * CanalRule.canalKey maps to one of these labels.
 */
export const CANAL_KEY_TO_LABEL: Record<CanalKey, string> = {
  bill_payment: "Bill Payment",

  voice_fixed_ttcash: "Fixed by TTCASH",
  voice_fixed_voucher: "Fixed by Voucher",

  voice_mobile_ttcash: "Mobile by TTCASH",
  voice_mobile_voucher: "Mobile by Voucher",

  data_sabba: "Internet Sabba",
  data_evoucher: "Data by Voucher",

  voucher_for_payment: "Voucher For Payment",

  credit_transfer: "Credit Transfer",

  voucher_convergent: "Voucher Convergent Management",

  evoucher_on_demand: "Evoucher on Demand",

  voucher_convergent_carte_generation: "Voucher Convergent — Generation",

  voucher_convergent_carte_activation: "Voucher Convergent — Activation",
};

function ruleSpecificity(rule: CanalRule): number {
  switch (rule.match.kind) {
    case "brand":
      return 0;
    case "brand-layer":
    case "brand-msisdn":
      return 1;
    case "brand-layer-group":
      return 2;
    default:
      return 0;
  }
}

/**
 * Rules with more account constraints must win over broad rules.
 *
 * If two rules have the same field specificity, a rule matching fewer BRAND_D
 * values is more specific. Final ordering by ID makes SQL deterministic.
 *
 * The rule editor should prevent equally-specific overlapping rules from
 * pointing to different canal categories.
 */
function orderedEnabledCanalRules(rules: CanalRule[]): CanalRule[] {
  return rules
    .filter((rule) => rule.enabled)
    .slice()
    .sort((left, right) => {
      const fieldDelta = ruleSpecificity(right) - ruleSpecificity(left);

      if (fieldDelta !== 0) {
        return fieldDelta;
      }

      const brandDelta = left.match.brandDValues.length - right.match.brandDValues.length;

      if (brandDelta !== 0) {
        return brandDelta;
      }

      return left.id.localeCompare(right.id);
    });
}

/**
 * Generates the one canonical CASE expression for canal categorisation.
 *
 * There are no hardcoded CanalRule arrays and no custom override layer.
 * Every enabled default or custom CanalRule participates equally.
 */
export function canalCaseExpr(_mapping: ColumnMapping, rules: CanalRule[]): string {
  const whenClauses = orderedEnabledCanalRules(rules)
    .map(
      (rule) =>
        `WHEN ${canalRuleCondition(rule)} THEN ${sqlLiteral(CANAL_KEY_TO_LABEL[rule.canalKey])}`,
    )
    .join("\n    ");

  if (!whenClauses) {
    return "'Other'";
  }

  return `CASE
    ${whenClauses}
    ELSE 'Other'
  END`;
}

/**
 * Returns an exact category WHERE condition based on the same CASE expression.
 *
 * Do not use simple OR conditions per category: overlapping rules could make
 * the same transaction appear in multiple categories. Comparing the canonical
 * CASE result ensures every row belongs to at most one canal category.
 */
export function canalWhere(mapping: ColumnMapping, rules: CanalRule[]): Record<CanalKey, string> {
  const canal = canalCaseExpr(mapping, rules);

  return {
    bill_payment: `(${canal}) = ${sqlLiteral(CANAL_KEY_TO_LABEL.bill_payment)}`,

    voice_fixed_ttcash: `(${canal}) = ${sqlLiteral(CANAL_KEY_TO_LABEL.voice_fixed_ttcash)}`,

    voice_fixed_voucher: `(${canal}) = ${sqlLiteral(CANAL_KEY_TO_LABEL.voice_fixed_voucher)}`,

    voice_mobile_ttcash: `(${canal}) = ${sqlLiteral(CANAL_KEY_TO_LABEL.voice_mobile_ttcash)}`,

    voice_mobile_voucher: `(${canal}) = ${sqlLiteral(CANAL_KEY_TO_LABEL.voice_mobile_voucher)}`,

    data_sabba: `(${canal}) = ${sqlLiteral(CANAL_KEY_TO_LABEL.data_sabba)}`,

    data_evoucher: `(${canal}) = ${sqlLiteral(CANAL_KEY_TO_LABEL.data_evoucher)}`,

    voucher_for_payment: `(${canal}) = ${sqlLiteral(CANAL_KEY_TO_LABEL.voucher_for_payment)}`,

    credit_transfer: `(${canal}) = ${sqlLiteral(CANAL_KEY_TO_LABEL.credit_transfer)}`,

    voucher_convergent: `(${canal}) = ${sqlLiteral(CANAL_KEY_TO_LABEL.voucher_convergent)}`,

    evoucher_on_demand: `(${canal}) = ${sqlLiteral(CANAL_KEY_TO_LABEL.evoucher_on_demand)}`,

    voucher_convergent_carte_generation: `(${canal}) = ${sqlLiteral(
      CANAL_KEY_TO_LABEL.voucher_convergent_carte_generation,
    )}`,

    voucher_convergent_carte_activation: `(${canal}) = ${sqlLiteral(
      CANAL_KEY_TO_LABEL.voucher_convergent_carte_activation,
    )}`,
  };
}
