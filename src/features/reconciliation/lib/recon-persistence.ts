"use client";

/**
 * Durable reconciliation-run persistence (offline).
 *
 * The legacy stub kept reasonCode / notes / escalation / "Mark as Reconciled"
 * state in component state only, so every run was lost on reload and there was
 * no backing store for "Use Previous Report" or for the regulatory audit trail.
 *
 * We do NOT add a private Dexie table (the shared app-db is owned by the
 * platform and must not be edited). Instead each reconciliation run is persisted
 * as a platform `ReportDefinition` record — a clone-safe `config` blob keyed by
 * a stable run id — via the foundation `@/platform/storage` accessors
 * (`putReportDefinition` / `listReportDefinitions` / `deleteReportDefinition`).
 *
 * At sign-off the snapshot is frozen: the `DiffConfig`, the DuckDB-computed
 * summary, the per-key annotations, and a deterministic content hash are stored
 * together so the signed-off record is an immutable, reproducible audit
 * artifact. The hash lets a later reader detect tampering without re-running the
 * diff.
 */

import {
  deleteReportDefinition,
  listReportDefinitions,
  newId,
  putReportDefinition,
} from "@/platform/storage";
import type { DiffConfig } from "./recon-sql";
import type { RowAnnotation } from "../stores/annotations-store";
import type { DiffSummary } from "./use-reconciliation";

/** Discriminator stored in the report `format` field so we can filter runs. */
export const RECON_RUN_FORMAT = "reconciliation-run";

export interface ReconRunRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  expectedView: string;
  actualView: string;
  expectedLabel: string;
  actualLabel: string;
  tolerancePct: number;
  config: DiffConfig;
  summary: DiffSummary;
  /** Per-key reviewer annotations (reasonCode / notes / escalated / hypothesis). */
  annotations: Record<string, RowAnnotation>;
  signedOff: boolean;
  signedBy?: string;
  signedAt?: number;
  /** Deterministic content hash of the signed-off snapshot (tamper-evidence). */
  contentHash?: string;
}

/**
 * Stable, order-independent FNV-1a hash over the immutable parts of a run. Used
 * as the audit content hash; deterministic so two reads of the same signed-off
 * record agree. (FNV-1a is sufficient for integrity/dedup here — not a security
 * primitive, and no network is involved.)
 */
export function hashRun(
  record: Pick<
    ReconRunRecord,
    "config" | "summary" | "annotations" | "expectedView" | "actualView"
  >,
): string {
  // Sort annotation keys so hashing is order-independent.
  const annotations = Object.fromEntries(
    Object.keys(record.annotations)
      .sort()
      .map((k) => [k, record.annotations[k]] as const),
  );
  const canonical = JSON.stringify({
    expectedView: record.expectedView,
    actualView: record.actualView,
    config: record.config,
    summary: record.summary,
    annotations,
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

interface PersistedShape {
  __recon: true;
  record: Omit<ReconRunRecord, "id" | "name" | "updatedAt">;
}

function toReportConfig(record: ReconRunRecord): PersistedShape {
  const { id: _id, name: _name, updatedAt: _u, ...rest } = record;
  return { __recon: true, record: rest };
}

function fromReportRecord(def: {
  id: string;
  name: string;
  updatedAt: number;
  config: unknown;
}): ReconRunRecord | null {
  const cfg = def.config as Partial<PersistedShape> | null;
  if (!cfg || cfg.__recon !== true || !cfg.record) return null;
  return {
    id: def.id,
    name: def.name,
    updatedAt: def.updatedAt,
    ...cfg.record,
  };
}

/** Create a fresh, unsigned run id. */
export function newRunId(): string {
  return `recon_${newId()}`;
}

/**
 * Persist (insert or update) a reconciliation run. Signed-off runs are stamped
 * with a content hash so reload yields a tamper-evident, reproducible artifact.
 */
export async function saveReconRun(record: ReconRunRecord): Promise<string> {
  const finalized: ReconRunRecord = record.signedOff
    ? { ...record, contentHash: record.contentHash ?? hashRun(record) }
    : record;
  await putReportDefinition({
    id: finalized.id,
    name: finalized.name,
    format: RECON_RUN_FORMAT,
    config: toReportConfig(finalized),
  });
  return finalized.id;
}

/** Load all persisted reconciliation runs, newest first (backs "Use Previous Report"). */
export async function listReconRuns(): Promise<ReconRunRecord[]> {
  const defs = await listReportDefinitions();
  return defs
    .filter((d) => d.format === RECON_RUN_FORMAT)
    .map(fromReportRecord)
    .filter((r): r is ReconRunRecord => r !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteReconRun(id: string): Promise<void> {
  await deleteReportDefinition(id);
}

/**
 * Verify a signed-off run's stored hash still matches its content (detects a
 * record that was edited after sign-off). Unsigned runs always "match".
 */
export function verifyRunIntegrity(record: ReconRunRecord): boolean {
  if (!record.signedOff || !record.contentHash) return true;
  return hashRun(record) === record.contentHash;
}
