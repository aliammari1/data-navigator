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

function mappedColumn(
  mapping: ColumnMapping,
  key: keyof ColumnMapping,
  profiles: ColumnProfile[],
): string | null {
  const name = mapping[key];
  return name && profiles.some((p) => p.name === name) ? name : null;
}

function profileFor(
  mapping: ColumnMapping,
  key: keyof ColumnMapping,
  profiles: ColumnProfile[],
): ColumnProfile | null {
  const name = mappedColumn(mapping, key, profiles);
  return name ? (profiles.find((p) => p.name === name) ?? null) : null;
}

export function telecomHypotheses(
  mapping: ColumnMapping,
  profiles: ColumnProfile[],
): Hypothesis[] {
  const out: Hypothesis[] = [];
  const canal = mappedColumn(mapping, "canal", profiles);
  const amount = mappedColumn(mapping, "amount", profiles);
  const status = mappedColumn(mapping, "status", profiles);
  const transactionId = mappedColumn(mapping, "transactionId", profiles);
  const errorCode = mappedColumn(mapping, "errorCode", profiles);
  const previousBalance = mappedColumn(mapping, "previousBalance", profiles);
  const newBalance = mappedColumn(mapping, "newBalance", profiles);
  const transactionDate = mappedColumn(mapping, "transactionDate", profiles);
  const msisdn = mappedColumn(mapping, "msisdn", profiles);
  const processingTimeMs = mappedColumn(mapping, "processingTimeMs", profiles);
  const retryCount = mappedColumn(mapping, "retryCount", profiles);

  if (canal && amount) {
    out.push({
      id: genId(),
      question: `Which Canal (${canal}) generates the most amount?`,
      rationale: "Canal revenue mix is the primary lens for telecom reporting.",
      priority: "high",
      parents: [canal, amount],
    });
  }
  if (status && transactionId && canal) {
    out.push({
      id: genId(),
      question: `What is the failure rate per Canal (${canal})?`,
      rationale:
        "Comparing status distribution across Canals surfaces problem areas faster than global KPIs.",
      priority: "high",
      parents: [status, canal],
    });
  }
  if (errorCode) {
    out.push({
      id: genId(),
      question: `What are the dominant error codes / remarks?`,
      rationale:
        "Top-N REMARK / ERROR_CODE values usually concentrate 80% of incidents.",
      priority: "medium",
      parents: [errorCode],
    });
  }
  if (previousBalance && newBalance && amount) {
    out.push({
      id: genId(),
      question: `Are there discrepancies between previous and new balance?`,
      rationale: "Balance-after − Balance-before − amount should be ~0.",
      priority: "medium",
      parents: [previousBalance, newBalance, amount],
    });
  }
  if (transactionDate && amount) {
    out.push({
      id: genId(),
      question: `Is there daily or weekly seasonality in ${amount}?`,
      rationale:
        "Hourly + weekday patterns drive capacity planning and alerting.",
      priority: "medium",
      parents: [transactionDate, amount],
    });
  }
  if (msisdn && amount) {
    out.push({
      id: genId(),
      question: `Are a small number of MSISDNs driving most amount or failures?`,
      rationale:
        "MSISDN concentration can reveal VIP dependency, fraud exposure, or repeated customer-impact clusters.",
      priority: "high",
      parents: status ? [msisdn, amount, status] : [msisdn, amount],
    });
  }
  if (processingTimeMs && status) {
    out.push({
      id: genId(),
      question: `Does processing latency predict declined or in-instance transactions?`,
      rationale:
        "Latency/status coupling is an operational early-warning signal for telecom settlement queues.",
      priority: "medium",
      parents: [processingTimeMs, status],
    });
  }
  if (retryCount && status) {
    out.push({
      id: genId(),
      question: `Do repeated retries improve success or only increase operational load?`,
      rationale:
        "Retry effectiveness helps tune automated recovery without inflating backlog.",
      priority: "medium",
      parents: [retryCount, status],
    });
  }
  return out;
}

export function telecomNarrativeFooter(
  mapping: ColumnMapping,
  profiles: ColumnProfile[],
): NarrativeBullet[] {
  const out: NarrativeBullet[] = [];
  const status = profileFor(mapping, "status", profiles);
  const canal = profileFor(mapping, "canal", profiles);
  const msisdn = profileFor(mapping, "msisdn", profiles);

  const mapped = Object.values(mapping).filter((name) =>
    profiles.some((p) => p.name === name),
  );
  out.push({
    id: genId(),
    severity:
      mapped.length >= 8 ? "success" : mapped.length >= 5 ? "info" : "warning",
    title: "Telecom mapping coverage",
    detail: `${mapped.length} telecom columns are mapped into Auto-Analyst, so findings can be tied back to the Telecom Daily Transaction Report vocabulary.`,
  });

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
  if (canal?.topValues?.length) {
    const top = canal.topValues[0];
    const total = canal.topValues.reduce((a, b) => a + b.count, 0) || 1;
    const pct = (top.count / total) * 100;
    out.push({
      id: genId(),
      severity: pct > 60 ? "warning" : "info",
      title: `Canal mix led by ${String(top.value)}`,
      detail: `${pct.toFixed(1)}% of profiled rows fall into this Canal. Compare success, amount, and status before treating it as normal volume.`,
    });
  }
  if (msisdn && msisdn.cardinality > 0) {
    const repeatRate = 1 - msisdn.cardinality / Math.max(1, msisdn.rowCount);
    out.push({
      id: genId(),
      severity: repeatRate > 0.4 ? "accent" : "info",
      title: "MSISDN repeat activity signal",
      detail: `${(repeatRate * 100).toFixed(1)}% repeat-row signal from ${msisdn.cardinality} distinct MSISDN values across ${msisdn.rowCount} rows.`,
    });
  }
  return out;
}

export function telecomRecommendations(
  mapping: ColumnMapping,
  profiles: ColumnProfile[],
): Recommendation[] {
  const out: Recommendation[] = [];
  const errorCode = profileFor(mapping, "errorCode", profiles);
  const status = profileFor(mapping, "status", profiles);
  const canal = profileFor(mapping, "canal", profiles);
  const processingTimeMs = profileFor(mapping, "processingTimeMs", profiles);
  const retryCount = profileFor(mapping, "retryCount", profiles);
  const msisdn = profileFor(mapping, "msisdn", profiles);

  if (errorCode && errorCode.cardinality > 50) {
    out.push({
      id: genId(),
      severity: "warning",
      action: `Consolidate ${mapping.errorCode}`,
      why: `${errorCode.cardinality} distinct error codes — likely contains free-text noise. Bucket into ~10 actionable categories.`,
    });
  }
  if (status?.topValues?.length) {
    const total =
      status.topValues.reduce((sum, row) => sum + row.count, 0) || 1;
    const otherLike = status.topValues.find((row) =>
      String(row.value).toLowerCase().includes("other"),
    );
    if (otherLike && otherLike.count / total > 0.02) {
      out.push({
        id: genId(),
        severity: "warning",
        action: "Tighten Status Mapping before sharing the Narrative Report",
        why: `${((otherLike.count / total) * 100).toFixed(1)}% of profiled rows are still grouped as OTHER-like status values.`,
        evidence:
          "Use Config. Statuts so AI summaries, Canal comparisons, and exports share the same business semantics.",
      });
    }
  }
  if (canal && canal.cardinality > 20) {
    out.push({
      id: genId(),
      severity: "info",
      action: "Review Canal grouping rules",
      why: `${canal.cardinality} distinct Canal/source-channel values were profiled. High variety can hide weak subchannels inside a healthy aggregate.`,
      evidence:
        "Promote recurring unmapped values into explicit Canal rules when their amount or failure share is material.",
    });
  }
  if (processingTimeMs?.avg && processingTimeMs.avg > 1500) {
    out.push({
      id: genId(),
      severity: "warning",
      action: "Add latency-aware alerting to Period Studio",
      why: `${mapping.processingTimeMs} averages ${processingTimeMs.avg.toFixed(0)} ms, which can precede instance backlog or declined spikes.`,
      evidence:
        "Compare latency by Canal and status before tuning retry or settlement windows.",
    });
  }
  if (retryCount && retryCount.avg !== undefined && retryCount.avg > 1) {
    out.push({
      id: genId(),
      severity: "info",
      action: "Measure retry effectiveness by status outcome",
      why: `${mapping.retryCount} averages ${retryCount.avg.toFixed(2)} attempts per profiled row.`,
      evidence:
        "Keep retries that recover success; cap retry paths that only inflate failed or in-instance volume.",
    });
  }
  if (msisdn && msisdn.cardinality / Math.max(1, msisdn.rowCount) < 0.6) {
    out.push({
      id: genId(),
      severity: "info",
      action: "Add MSISDN concentration watchlist",
      why: `${msisdn.cardinality} distinct MSISDN values over ${msisdn.rowCount} rows indicates repeated customer/account activity worth ranking by amount and failures.`,
      evidence:
        "Use it to prioritize customer-impact triage, fraud review, and VIP dependency monitoring.",
    });
  }
  return out;
}
