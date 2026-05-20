"use client";

/**
 * KPI Lineage
 * Tracks version history and derivation chains for KPI contracts.
 */

import type { KpiContract } from "./kpi-contract";

export interface KpiVersion {
  version: number;
  changedAt: number;
  changedBy: "ai" | "user";
  diff: string[];
  contract: KpiContract;
}

export interface KpiLineage {
  kpiId: string;
  versions: KpiVersion[];
  derivedFrom?: string;
  usedBy: string[];
}

const LINEAGE_KEY = "moudir_kpi_lineage";

export function getKpiLineage(kpiId: string): KpiLineage | undefined {
  try {
    const all = JSON.parse(localStorage.getItem(LINEAGE_KEY) || "{}") as Record<string, KpiLineage>;
    return all[kpiId];
  } catch {
    return undefined;
  }
}

export function saveKpiLineage(lineage: KpiLineage): void {
  try {
    const all = JSON.parse(localStorage.getItem(LINEAGE_KEY) || "{}") as Record<string, KpiLineage>;
    all[lineage.kpiId] = lineage;
    localStorage.setItem(LINEAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore storage errors
  }
}

export function appendKpiVersion(kpiId: string, version: KpiVersion): void {
  const lineage = getKpiLineage(kpiId) ?? { kpiId, versions: [], usedBy: [] };
  lineage.versions.push(version);
  saveKpiLineage(lineage);
}

export function linkKpiDerivation(childId: string, parentId: string): void {
  const child = getKpiLineage(childId) ?? { kpiId: childId, versions: [], usedBy: [] };
  const parent = getKpiLineage(parentId) ?? { kpiId: parentId, versions: [], usedBy: [] };
  child.derivedFrom = parentId;
  parent.usedBy.push(childId);
  saveKpiLineage(child);
  saveKpiLineage(parent);
}
