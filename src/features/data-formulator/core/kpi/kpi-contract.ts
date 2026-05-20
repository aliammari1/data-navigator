"use client";

/**
 * KPI Contract Model
 * Explicit, reviewable, versioned KPI definitions.
 */

export type KpiReviewStatus = "draft" | "pending" | "approved" | "rejected";
export type KpiTimeGrain = "hour" | "day" | "week" | "month" | "custom";

export interface KpiContract {
  id: string;
  name: string;
  goal: string;
  numerator: string;
  denominator: string;
  exclusions: string[];
  timeGrain: KpiTimeGrain;
  segments: string[];
  owner: string;
  reviewStatus: KpiReviewStatus;
  sql: string;
  confidence: "high" | "medium" | "low";
  assumptions: string[];
  edgeCases: string[];
  fieldsUsed: string[];
  sampleResult?: { value: number; label: string };
  version: number;
  createdAt: number;
  updatedAt: number;
  approvedAt?: number;
  approvedBy?: string;
  // Lineage
  derivedFrom?: string; // parent KPI id
  parentIds: string[];
  childIds: string[];
}

export function createKpiContract(draft: Omit<KpiContract, "id" | "version" | "createdAt" | "updatedAt" | "parentIds" | "childIds">): KpiContract {
  const now = Date.now();
  return {
    ...draft,
    id: `kpi_${now}_${Math.random().toString(36).slice(2, 7)}`,
    version: 1,
    createdAt: now,
    updatedAt: now,
    parentIds: [],
    childIds: [],
  };
}

export function cloneKpiContract(original: KpiContract, modifier: string): KpiContract {
  return {
    ...original,
    id: `kpi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: `${original.name} (${modifier})`,
    version: original.version + 1,
    reviewStatus: "draft",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    derivedFrom: original.id,
    parentIds: [original.id],
    childIds: [],
  };
}

export function approveKpiContract(kpi: KpiContract, approver: string): KpiContract {
  return {
    ...kpi,
    reviewStatus: "approved",
    approvedAt: Date.now(),
    approvedBy: approver,
    updatedAt: Date.now(),
  };
}

export function rejectKpiContract(kpi: KpiContract, reason: string): KpiContract {
  return {
    ...kpi,
    reviewStatus: "rejected",
    updatedAt: Date.now(),
    assumptions: [...kpi.assumptions, `Rejection reason: ${reason}`],
  };
}

export function formatKpiFormula(kpi: KpiContract): string {
  const num = kpi.numerator || "1";
  const den = kpi.denominator;
  if (!den || den === "1" || den.toLowerCase() === "none") {
    return num;
  }
  return `${num} / ${den}`;
}

export function kpiSummary(kpi: KpiContract): string {
  const parts = [
    kpi.name,
    `= ${formatKpiFormula(kpi)}`,
    kpi.timeGrain !== "custom" ? `per ${kpi.timeGrain}` : "",
    kpi.segments.length > 0 ? `by ${kpi.segments.join(", ")}` : "",
  ];
  return parts.filter(Boolean).join(" ").trim();
}
