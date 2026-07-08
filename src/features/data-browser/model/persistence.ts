/**
 * Durable per-dataset state for the data browser.
 *
 * Replaces the old in-memory `useState` for starred rows, saved filter groups
 * and saved SQL queries (all lost on reload) with the platform Dexie app-db
 * (`@/platform/storage`). Everything here is offline, keyed by dataset, and
 * clone-safe (Dexie stores plain JSON, not class instances).
 */

import {
  deleteSavedQuery,
  listSavedQueries,
  newId,
  putSavedQuery,
  type SavedQuery,
} from "@/platform/storage";
import type { FilterGroup } from "./types";

// ─── Saved filter groups (kind: "filter") ─────────────────────────────────────

interface SavedFilterDefinition {
  group: FilterGroup;
}

export interface SavedFilterRecord {
  id: string;
  name: string;
  datasetId: string;
  group: FilterGroup;
  updatedAt: number;
}

function isFilterDefinition(value: unknown): value is SavedFilterDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    "group" in value &&
    typeof (value as { group: unknown }).group === "object"
  );
}

export async function listSavedFilters(datasetId: string): Promise<SavedFilterRecord[]> {
  const rows = await listSavedQueries("filter");
  return rows
    .filter((r) => r.datasetId === datasetId && isFilterDefinition(r.definition))
    .map((r) => ({
      id: r.id,
      name: r.name,
      datasetId,
      group: (r.definition as SavedFilterDefinition).group,
      updatedAt: r.updatedAt,
    }));
}

export async function saveFilter(
  datasetId: string,
  name: string,
  group: FilterGroup,
): Promise<string> {
  const id = `flt:${datasetId}:${newId()}`;
  await putSavedQuery({
    id,
    name,
    kind: "filter",
    datasetId,
    definition: { group } satisfies SavedFilterDefinition,
  });
  return id;
}

// ─── Saved SQL queries (kind: "query") ────────────────────────────────────────

interface SavedSqlDefinition {
  sql: string;
}

export interface SavedSqlRecord {
  id: string;
  name: string;
  datasetId: string;
  sql: string;
  updatedAt: number;
}

function isSqlDefinition(value: unknown): value is SavedSqlDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    "sql" in value &&
    typeof (value as { sql: unknown }).sql === "string"
  );
}

export async function listSavedSql(datasetId: string): Promise<SavedSqlRecord[]> {
  const rows = await listSavedQueries("query");
  return rows
    .filter((r) => r.datasetId === datasetId && isSqlDefinition(r.definition))
    .map((r) => ({
      id: r.id,
      name: r.name,
      datasetId,
      sql: (r.definition as SavedSqlDefinition).sql,
      updatedAt: r.updatedAt,
    }));
}

export async function saveSql(datasetId: string, name: string, sql: string): Promise<string> {
  const id = `sql:${datasetId}:${newId()}`;
  await putSavedQuery({
    id,
    name,
    kind: "query",
    datasetId,
    definition: { sql } satisfies SavedSqlDefinition,
  });
  return id;
}

export async function removeSavedRecord(id: string): Promise<void> {
  await deleteSavedQuery(id);
}

// ─── Starred rows (persisted as a single "filter"-kind row of stable keys) ─────
//
// Rows are starred by a stable per-row key (their `rowid`/`id` when present,
// else a content hash) so the star survives sort/page changes — unlike the old
// page-index Set. Stored under a deterministic id so there is one row per
// dataset that we upsert.

interface StarredDefinition {
  keys: string[];
}

function starredRecordId(datasetId: string): string {
  return `star:${datasetId}`;
}

export async function loadStarredKeys(datasetId: string): Promise<Set<string>> {
  const rows = await listSavedQueries("filter");
  const record = rows.find((r) => r.id === starredRecordId(datasetId));
  const def = record?.definition as StarredDefinition | undefined;
  return new Set(Array.isArray(def?.keys) ? def.keys : []);
}

export async function saveStarredKeys(datasetId: string, keys: Set<string>): Promise<void> {
  await putSavedQuery({
    id: starredRecordId(datasetId),
    name: "__starred__",
    kind: "filter",
    datasetId,
    definition: { keys: [...keys] } satisfies StarredDefinition,
  });
}

export type { SavedQuery };
