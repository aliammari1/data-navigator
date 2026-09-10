/**
 * Drizzle schema for the per-domain settings + analytics databases
 * (settings.db, analytics.db under <userData>/databases).
 *
 * Extracted from `electron/settings-storage.ts` so that `drizzle-kit generate`
 * can introspect the schema and produce versioned migrations. The runtime
 * `openSqliteHandle` runs those migrations at boot via the standard
 * `migrate()` from `drizzle-orm/better-sqlite3/migrator`.
 */

import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/** Key→value row, identical to the legacy `app_setting` table (1:1 migration). */
export const appSetting = sqliteTable(
  "app_setting",
  {
    namespace: text("namespace").notNull(),
    key: text("key").notNull(),
    value: text("value", { mode: "json" }).$type<unknown>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  },
  (table) => [
    primaryKey({ columns: [table.namespace, table.key], name: "app_setting_pk" }),
    index("app_setting_namespace_idx").on(table.namespace),
  ],
);

/**
 * Append-only history of analytics snapshots (the telecom "Persister" button +
 * Analytics History list). Unlike `appSetting`, this is genuinely multi-row
 * per logical entity — a KV table keyed `(namespace, key)` can't express
 * "many saves over time for one table_name", can't do an indexed `ORDER BY
 * saved_at DESC LIMIT N`, and can't prune by age without parsing keys back
 * into timestamps. See the composite index below.
 */
export const analyticsSnapshotHistory = sqliteTable(
  "analytics_snapshot_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tableName: text("table_name").notNull(),
    label: text("label").notNull(),
    fileName: text("file_name"),
    savedAt: integer("saved_at", { mode: "timestamp_ms" }).notNull().default(nowMs),
    sizeBytes: integer("size_bytes").notNull(),
    totalTransactions: integer("total_transactions").notNull().default(0),
    successRate: real("success_rate").notNull().default(0),
    payload: text("payload", { mode: "json" }).$type<unknown>().notNull(),
  },
  (table) => [
    index("analytics_snapshot_history_table_saved_idx").on(table.tableName, table.savedAt),
  ],
);

export type AppSetting = InferSelectModel<typeof appSetting>;
export type NewAppSetting = InferInsertModel<typeof appSetting>;
export type AnalyticsSnapshotHistory = InferSelectModel<typeof analyticsSnapshotHistory>;
export type NewAnalyticsSnapshotHistory = InferInsertModel<typeof analyticsSnapshotHistory>;

export * from "./schema-analytics";
