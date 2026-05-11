"use client";
/**
 * Telecom-specific augmentations for the Auto-Analyst pipeline. Used when
 * the active table starts with TELECOM_TABLE_BASE.
 */

import type { ColumnMapping } from "@/features/telecom/types";
import type {
  ColumnProfile,
  Hypothesis,
  NarrativeBullet,
  Recommendation,
} from "./types";

function genId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function telecomHypotheses(
  mapping: ColumnMapping,
  profiles: ColumnProfile[],
): Hypothesis[] {
  const has = (n: string) => profiles.some((p) => p.name === n);
  const out: Hypothesis[] = [];
  if (has(mapping.canal) && has(mapping.amount)) {
    out.push({
      id: genId(),
      question: `Which channel (${mapping.canal}) generates the most amount?`,
      rationale: "Channel revenue mix is the primary lens for telecom ops.",
      priority: "high",
      parents: [mapping.canal, mapping.amount],
    });
  }
  if (has(mapping.status) && has(mapping.transactionId)) {
    out.push({
      id: genId(),
      question: `What's the failure rate per ${mapping.canal}?`,
      rationale:
        "Comparing TRANSACTION_STATUS distribution across channels surfaces problem channels.",
      priority: "high",
      parents: [mapping.status, mapping.canal],
    });
  }
  if (has(mapping.errorCode)) {
    out.push({
      id: genId(),
      question: `What are the dominant error codes / remarks?`,
      rationale:
        "Top-N REMARK / ERROR_CODE values usually concentrate 80% of incidents.",
      priority: "medium",
      parents: [mapping.errorCode],
    });
  }
  if (has(mapping.previousBalance) && has(mapping.newBalance)) {
    out.push({
      id: genId(),
      question: `Are there discrepancies between previous and new balance?`,
      rationale: "Balance-after − Balance-before − amount should be ~0.",
      priority: "medium",
      parents: [mapping.previousBalance, mapping.newBalance, mapping.amount],
    });
  }
  if (has(mapping.transactionDate) && has(mapping.amount)) {
    out.push({
      id: genId(),
      question: `Is there a daily / weekly seasonality in ${mapping.amount}?`,
      rationale:
        "Hourly + weekday patterns drive capacity planning and alerting.",
      priority: "medium",
      parents: [mapping.transactionDate, mapping.amount],
    });
  }
  return out;
}

export function telecomNarrativeFooter(
  mapping: ColumnMapping,
  profiles: ColumnProfile[],
): NarrativeBullet[] {
  const out: NarrativeBullet[] = [];
  const status = profiles.find((p) => p.name === mapping.status);
  if (status?.topValues?.length) {
    const top = status.topValues[0];
    const total = status.topValues.reduce((a, b) => a + b.count, 0) || 1;
    const pct = (top.count / total) * 100;
    out.push({
      id: genId(),
      severity: pct > 90 ? "success" : pct > 60 ? "info" : "warning",
      title: `Status mix dominated by ${top.value}`,
      detail: `${pct.toFixed(1)}% of transactions classified as ${top.value}.`,
    });
  }
  return out;
}

export function telecomRecommendations(
  mapping: ColumnMapping,
  profiles: ColumnProfile[],
): Recommendation[] {
  const out: Recommendation[] = [];
  const errorCode = profiles.find((p) => p.name === mapping.errorCode);
  if (errorCode && errorCode.cardinality > 50) {
    out.push({
      id: genId(),
      severity: "warning",
      action: `Consolidate ${mapping.errorCode}`,
      why: `${errorCode.cardinality} distinct error codes — likely contains free-text noise. Bucket into ~10 actionable categories.`,
    });
  }
  return out;
}
