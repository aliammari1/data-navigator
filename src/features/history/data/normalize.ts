// ─── Store → HistoryRow normalization (single source of truth) ───────────────
//
// The four backing Zustand stores (datasets, transforms, query history, activity
// events) each have their own shape. This module is the ONE place that projects
// them into the common `HistoryRow` shape, so the live read path (use-history),
// the durable Dexie mirror (history-mirror), and the one-time backfill all agree
// on ids, messages, and sources. Ids are deterministic per source row so the
// Dexie upsert is idempotent.

import type { ActivityEvent } from "@/core/stores/activity-store";
import type {
  Dataset,
  DataTransform,
  QueryHistoryItem,
} from "@/core/stores/data-store";

import type { HistoryRow } from "../model/types";

export function datasetRow(d: Dataset): HistoryRow {
  return {
    id: `ds_${d.id}`,
    when: d.updatedAt,
    type: "dataset_updated",
    message: `Dataset ${d.name} (${d.rowCount.toLocaleString()} rows)`,
    dataset: d.id,
    table: d.tableName,
    source: "dataset",
  };
}

export function transformRow(t: DataTransform): HistoryRow {
  return {
    id: `tf_${t.id}`,
    when: t.appliedAt,
    type: t.type,
    message: t.description || `Transform ${t.type}`,
    dataset: t.outputDatasetId,
    source: "transform",
  };
}

export function queryRow(entry: QueryHistoryItem): HistoryRow {
  return {
    id: `q_${entry.id}`,
    when: entry.ranAt,
    type: entry.error ? "query_error" : "query_run",
    message: entry.error ? `Query failed: ${entry.error}` : entry.sql,
    dataset: entry.datasetId,
    source: "query",
  };
}

export function activityRow(e: ActivityEvent): HistoryRow {
  return {
    id: e.id,
    when: e.createdAt,
    type: e.type,
    message: e.message,
    dataset: e.datasetId,
    table: e.tableName,
    source: "activity",
  };
}

/** Build the full unified row set from raw store slices (unsorted). */
export function buildRows(input: {
  datasets: Dataset[];
  transforms: DataTransform[];
  queryHistory: QueryHistoryItem[];
  events: ActivityEvent[];
}): HistoryRow[] {
  return [
    ...input.events.map(activityRow),
    ...input.datasets.map(datasetRow),
    ...input.transforms.map(transformRow),
    ...input.queryHistory.map(queryRow),
  ];
}
