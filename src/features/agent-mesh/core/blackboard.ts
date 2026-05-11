"use client";

import { DEFAULT_MAPPING } from "@/features/telecom/store";
import type { BlackboardPatch, BlackboardState } from "./types";

export function createEmptyBlackboard(): BlackboardState {
  return {
    dataset: {
      availableTables: [],
      columns: [],
    },
    telecom: {
      mapping: DEFAULT_MAPPING,
      statusMapping: [],
      mappingIssues: [],
    },
    plan: {
      running: false,
      completedTaskIds: [],
      blockedTaskIds: [],
      errors: [],
      expansions: [],
    },
    evidence: {
      items: [],
      acceptedIds: [],
      rejectedIds: [],
    },
    decisions: {
      findings: [],
      actions: [],
      caveats: [],
    },
    ui: {
      pinnedEvidenceIds: [],
      mode: "fast",
    },
  };
}

function mergeArrayById<T extends { id: string }>(base: T[], patch?: T[]): T[] {
  if (!patch?.length) return base;
  const map = new Map(base.map((item) => [item.id, item]));
  for (const item of patch) {
    map.set(item.id, { ...map.get(item.id), ...item });
  }
  return [...map.values()];
}

export function mergeBlackboard(
  state: BlackboardState,
  patch: BlackboardPatch,
): BlackboardState {
  return {
    dataset: { ...state.dataset, ...patch.dataset },
    telecom: { ...state.telecom, ...patch.telecom },
    plan: {
      ...state.plan,
      ...patch.plan,
      completedTaskIds:
        patch.plan?.completedTaskIds ?? state.plan.completedTaskIds,
      blockedTaskIds: patch.plan?.blockedTaskIds ?? state.plan.blockedTaskIds,
      errors: patch.plan?.errors ?? state.plan.errors,
      expansions: patch.plan?.expansions ?? state.plan.expansions,
    },
    evidence: {
      ...state.evidence,
      ...patch.evidence,
      items: mergeArrayById(state.evidence.items, patch.evidence?.items),
      acceptedIds: patch.evidence?.acceptedIds ?? state.evidence.acceptedIds,
      rejectedIds: patch.evidence?.rejectedIds ?? state.evidence.rejectedIds,
    },
    decisions: { ...state.decisions, ...patch.decisions },
    ui: { ...state.ui, ...patch.ui },
  };
}
