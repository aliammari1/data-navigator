import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id"),
    action: text("action").notNull(),
    category: text("category").notNull(),
    status: text("status").notNull(),
    durationMs: integer("duration_ms"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull().default(nowMs),
  },
  (table) => [
    index("audit_log_category_idx").on(table.category),
    index("audit_log_timestamp_idx").on(table.timestamp),
    index("audit_log_action_idx").on(table.action),
  ],
);

export const queryAnalytics = sqliteTable(
  "query_analytics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    datasetId: text("dataset_id").notNull(),
    sqlQuery: text("sql_query").notNull(),
    rowCount: integer("row_count").notNull(),
    executionTimeMs: real("execution_time_ms").notNull(),
    isCached: integer("is_cached", { mode: "boolean" }).notNull().default(false),
    error: text("error"),
    timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull().default(nowMs),
  },
  (table) => [
    index("query_analytics_dataset_idx").on(table.datasetId, table.timestamp),
    index("query_analytics_timestamp_idx").on(table.timestamp),
  ],
);

export type AuditLogEntry = InferSelectModel<typeof auditLog>;
export type NewAuditLogEntry = InferInsertModel<typeof auditLog>;
export type QueryAnalyticsEntry = InferSelectModel<typeof queryAnalytics>;
export type NewQueryAnalyticsEntry = InferInsertModel<typeof queryAnalytics>;
