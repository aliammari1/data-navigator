/**
 * Durable persistence for deep-analytics runs.
 *
 * Analytics outputs used to live only in component `useState` and vanished on
 * navigation. This module persists them to the shared Dexie app-db via the
 * generic `reportDefinitions` accessor (`putReportDefinition` /
 * `listReportDefinitions`) so a reload reproduces the chosen k, attribution fit,
 * and reconciliation reason-codes/escalations — no new Dexie schema required.
 *
 * Records are namespaced by `format: "deep-analytics:<kind>"` and keyed by the
 * dataset id so each dataset reloads its own last run.
 */

import {
  deleteReportDefinition,
  listReportDefinitions,
  putReportDefinition,
} from "@/platform/storage";

const FORMAT_PREFIX = "deep-analytics";

export type AnalyticsRunKind = "cluster" | "attribution" | "reconciliation";

export interface PersistedRun<T = unknown> {
  id: string;
  kind: AnalyticsRunKind;
  datasetId: string;
  updatedAt: number;
  payload: T;
}

function runId(kind: AnalyticsRunKind, datasetId: string): string {
  return `${FORMAT_PREFIX}:${kind}:${datasetId}`;
}

/** Persist (upsert) the latest run for a dataset + kind. */
export async function saveRun<T>(
  kind: AnalyticsRunKind,
  datasetId: string,
  payload: T,
): Promise<void> {
  if (!datasetId) return;
  await putReportDefinition({
    id: runId(kind, datasetId),
    name: `${kind} run for ${datasetId}`,
    format: `${FORMAT_PREFIX}:${kind}`,
    config: payload,
  });
}

/** Load the most recently persisted run for a dataset + kind. */
export async function loadRun<T>(
  kind: AnalyticsRunKind,
  datasetId: string,
): Promise<PersistedRun<T> | null> {
  if (!datasetId) return null;
  const target = runId(kind, datasetId);
  const all = await listReportDefinitions();
  const hit = all.find((r) => r.id === target);
  if (!hit) return null;
  return {
    id: hit.id,
    kind,
    datasetId,
    updatedAt: hit.updatedAt,
    payload: hit.config as T,
  };
}

/** Drop a persisted run (used when the user clears or the dataset changes). */
export async function clearRun(
  kind: AnalyticsRunKind,
  datasetId: string,
): Promise<void> {
  if (!datasetId) return;
  await deleteReportDefinition(runId(kind, datasetId));
}
