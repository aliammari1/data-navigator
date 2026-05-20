"use client";

/**
 * Evidence Trail
 * Persistent evidence chain for investigations and signal scans.
 */

export interface EvidenceItem {
  id: string;
  timestamp: number;
  type: "toolResult" | "insight" | "userCorrection" | "aiReasoning";
  title: string;
  description: string;
  data?: Record<string, unknown>;
  sql?: string;
  confidence: "high" | "medium" | "low";
  source: string; // which agent/tool produced this
}

export interface EvidenceTrail {
  id: string;
  query: string;
  intent: string;
  items: EvidenceItem[];
  createdAt: number;
  updatedAt: number;
}

export function createEvidenceTrail(query: string, intent: string): EvidenceTrail {
  const now = Date.now();
  return {
    id: `trail_${now}_${Math.random().toString(36).slice(2, 7)}`,
    query,
    intent,
    items: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function addEvidence(
  trail: EvidenceTrail,
  item: Omit<EvidenceItem, "id" | "timestamp">,
): EvidenceTrail {
  return {
    ...trail,
    items: [
      ...trail.items,
      {
        ...item,
        id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        timestamp: Date.now(),
      },
    ],
    updatedAt: Date.now(),
  };
}

export function getEvidenceByType(
  trail: EvidenceTrail,
  type: EvidenceItem["type"],
): EvidenceItem[] {
  return trail.items.filter((i) => i.type === type);
}

export function getHighConfidenceEvidence(trail: EvidenceTrail): EvidenceItem[] {
  return trail.items.filter((i) => i.confidence === "high");
}

export function summarizeTrail(trail: EvidenceTrail): string {
  const parts = [
    `Query: ${trail.query}`,
    `Items: ${trail.items.length}`,
    `High-confidence: ${getHighConfidenceEvidence(trail).length}`,
  ];
  return parts.join(" | ");
}
