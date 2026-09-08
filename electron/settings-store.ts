/**
 * Main-process settings/analytics persistence — the IPC-side replacement for the
 * old `/api/settings` HTTP bridge.
 *
 * Why this exists: the renderer can't open better-sqlite3, and routing settings
 * through a localhost Next.js route was fragile (it needed the server up, hit the
 * dev ABI mismatch because the route loaded the native driver under system Node,
 * and tripped the runtime WAF). Owning the database in the Electron MAIN process
 * and exposing it over `ipcMain.handle` removes all three problems: the driver is
 * only ever loaded by Electron's own Node (ABI always matches), there is no HTTP
 * hop, and access is gated by the trusted-sender guard instead of CSP/WAF.
 *
 * Per-domain databases (the user's split): durable client state is keyed into one
 * of several SQLite files under `userData/databases`, so settings, persisted
 * analytics snapshots, and (separately, owned by better-auth) auth never share a
 * file. Each file is a single-connection, WAL-mode handle opened lazily on first
 * use and reused for the app's lifetime — the singleton-connection discipline
 * that keeps SQLite from throwing "database is locked".
 *
 * The `app_setting` table shape is intentionally byte-identical to the legacy
 * table in the auth database, so the one-time data lift copies rows 1:1.
 *
 * This module never imports `electron` (the base directory is injected by
 * `configureSettingsStore`, the migrations folder by
 * `setSettingsMigrationsFolder`) so it stays unit-testable in plain Node.
 */

import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { and, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import * as settingsSchema from "../src/db/schema-settings";
import {
  createSqliteConnection,
  openSqliteHandle,
  type SqliteHandle,
} from "../src/platform/storage/db-bootstrap";

/** Keep the newest N snapshots per table, dropped further by age below. */
const KEEP_NEWEST_PER_TABLE = 20;
/** Drop snapshots older than this, except the single newest per table. */
const MAX_SNAPSHOT_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/** Logical database files, one per domain. Auth stays with better-auth (separate). */
export type SettingDomain = "settings" | "analytics";

const DB_FILES: Record<SettingDomain, string> = {
  settings: "settings.db",
  analytics: "analytics.db",
};

/**
 * Default migrations folder, used when the caller does not override via
 * `setSettingsMigrationsFolder`. `<cwd>/drizzle/settings` works for `pnpm dev`
 * and the smoke tests, where the working directory is the package root. The
 * packaged Electron app should call
 * `setSettingsMigrationsFolder(path.join(app.getAppPath(), "drizzle",
 * "settings"))` from main.ts so the migrations folder resolves inside the
 * asar — this is the only way to make the path injectable without importing
 * `electron` from this module.
 */
const DEFAULT_MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle", "settings");

/**
 * Namespaces that belong in the analytics database. Everything else (UI prefs,
 * store state, theme, dashboard access, …) lives in the settings database.
 * Keeping this an explicit allowlist means a new namespace defaults to the safe,
 * general bucket rather than silently landing in analytics.
 */
const ANALYTICS_SNAPSHOT_NS = "analytics_snapshot";
const ANALYTICS_NAMESPACES = new Set<string>([ANALYTICS_SNAPSHOT_NS]);

/** Route a namespace to its owning database. */
export function domainForNamespace(namespace: string): SettingDomain {
  return ANALYTICS_NAMESPACES.has(namespace) ? "analytics" : "settings";
}

export type AppSettingRemote = {
  value: unknown;
  updatedAt: string | null;
};

type Handle = SqliteHandle<typeof settingsSchema>;

const handles = new Map<SettingDomain, Handle>();
let baseDir: string | null = null;
let migrationsFolder: string = DEFAULT_MIGRATIONS_FOLDER;

/**
 * Point the store at the directory that will hold the `.db` files. Call once from
 * `main.ts` with `app.getPath("userData")/databases` before any IPC handler runs.
 */
export function configureSettingsStore(databasesDir: string): void {
  baseDir = databasesDir;
}

/**
 * Override the Drizzle migrations folder. Optional — defaults to
 * `<cwd>/drizzle/settings`, which is correct for `pnpm dev` and the smoke
 * tests. The packaged Electron app should call this from main.ts with
 * `path.join(app.getAppPath(), "drizzle", "settings")` so the migrations
 * folder resolves inside the asar.
 */
export function setSettingsMigrationsFolder(folder: string): void {
  migrationsFolder = folder;
}

function openDomain(domain: SettingDomain): Handle {
  const cached = handles.get(domain);
  if (cached) return cached;
  if (!baseDir) {
    throw new Error("settings-store: configureSettingsStore() was not called");
  }

  mkdirSync(baseDir, { recursive: true });
  const handle = openSqliteHandle({
    path: path.join(baseDir, DB_FILES[domain]),
    schema: settingsSchema,
    migrationsFolder,
  });
  handles.set(domain, handle);
  return handle;
}

/** Read one setting. Returns `{ value: null }` when absent. */
export function getSetting(namespace: string, key: string): AppSettingRemote {
  const { db } = openDomain(domainForNamespace(namespace));
  const row = db
    .select()
    .from(settingsSchema.appSetting)
    .where(
      and(
        eq(settingsSchema.appSetting.namespace, namespace),
        eq(settingsSchema.appSetting.key, key),
      ),
    )
    .get();

  if (!row) return { value: null, updatedAt: null };
  return { value: row.value, updatedAt: new Date(row.updatedAt).toISOString() };
}

/** Upsert one setting; returns the persisted `updatedAt` (ISO). */
export function setSetting(namespace: string, key: string, value: unknown): string {
  const { db } = openDomain(domainForNamespace(namespace));
  const now = new Date();

  db.insert(settingsSchema.appSetting)
    .values({ namespace, key, value, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [settingsSchema.appSetting.namespace, settingsSchema.appSetting.key],
      set: { value, updatedAt: now },
    })
    .run();

  return now.toISOString();
}

/** Delete one setting (no-op when absent). */
export function deleteSetting(namespace: string, key: string): void {
  const { db } = openDomain(domainForNamespace(namespace));
  db.delete(settingsSchema.appSetting)
    .where(
      and(
        eq(settingsSchema.appSetting.namespace, namespace),
        eq(settingsSchema.appSetting.key, key),
      ),
    )
    .run();
}

/**
 * Export settings as `{ [namespace]: { [key]: value } }`. With no namespace,
 * exports both domains (used by the backup UI + the one-time migration verifier).
 */
export function exportSettings(namespace?: string): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};

  const collect = (domain: SettingDomain) => {
    const { db } = openDomain(domain);
    const query = db.select().from(settingsSchema.appSetting);
    const rows = namespace
      ? query.where(eq(settingsSchema.appSetting.namespace, namespace)).all()
      : query.all();
    for (const row of rows) {
      out[row.namespace] ??= {};
      out[row.namespace][row.key] = row.value;
    }
  };

  if (namespace) {
    collect(domainForNamespace(namespace));
  } else {
    collect("settings");
    collect("analytics");
  }
  return out;
}

// ─── Analytics snapshot history ────────────────────────────────────────────
// The user-facing "Persister" button / Analytics History list. One row per
// save, not a KV overwrite — see the table comment above for why.

export type AnalyticsSnapshotHistoryMeta = {
  id: number;
  tableName: string;
  label: string;
  fileName: string | null;
  savedAt: number;
  sizeBytes: number;
  totalTransactions: number;
  successRate: number;
};

export type AnalyticsSnapshotHistoryRow = AnalyticsSnapshotHistoryMeta & { payload: unknown };

const HISTORY_META_COLUMNS = {
  id: settingsSchema.analyticsSnapshotHistory.id,
  tableName: settingsSchema.analyticsSnapshotHistory.tableName,
  label: settingsSchema.analyticsSnapshotHistory.label,
  fileName: settingsSchema.analyticsSnapshotHistory.fileName,
  savedAt: settingsSchema.analyticsSnapshotHistory.savedAt,
  sizeBytes: settingsSchema.analyticsSnapshotHistory.sizeBytes,
  totalTransactions: settingsSchema.analyticsSnapshotHistory.totalTransactions,
  successRate: settingsSchema.analyticsSnapshotHistory.successRate,
};

function toMeta(row: {
  id: number;
  tableName: string;
  label: string;
  fileName: string | null;
  savedAt: Date;
  sizeBytes: number;
  totalTransactions: number;
  successRate: number;
}): AnalyticsSnapshotHistoryMeta {
  return { ...row, savedAt: row.savedAt.getTime() };
}

/**
 * Delete snapshots for `tableName` past the retention policy: keep the newest
 * `KEEP_NEWEST_PER_TABLE` rows AND drop anything older than
 * `MAX_SNAPSHOT_AGE_MS` — whichever is more restrictive — but never delete the
 * single most recent row for a table, regardless of its age. Cheap indexed
 * delete; safe to run inline on every save.
 */
export function pruneAnalyticsSnapshotHistory(tableName: string): number {
  const { db } = openDomain(domainForNamespace(ANALYTICS_SNAPSHOT_NS));
  const cutoff = Date.now() - MAX_SNAPSHOT_AGE_MS;

  const rows = db
    .select({
      id: settingsSchema.analyticsSnapshotHistory.id,
      savedAt: settingsSchema.analyticsSnapshotHistory.savedAt,
    })
    .from(settingsSchema.analyticsSnapshotHistory)
    .where(eq(settingsSchema.analyticsSnapshotHistory.tableName, tableName))
    .orderBy(desc(settingsSchema.analyticsSnapshotHistory.savedAt))
    .all();

  if (rows.length <= 1) {
    return 0;
  }

  const idsToDelete: number[] = [];
  // Never delete the single newest snapshot for a table, regardless of age.
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const isBeyondCountCap = i >= KEEP_NEWEST_PER_TABLE;
    const isBeyondAgeLimit = row.savedAt.getTime() < cutoff;
    if (isBeyondCountCap || isBeyondAgeLimit) {
      idsToDelete.push(row.id);
    }
  }

  if (idsToDelete.length === 0) {
    return 0;
  }

  db.delete(settingsSchema.analyticsSnapshotHistory)
    .where(inArray(settingsSchema.analyticsSnapshotHistory.id, idsToDelete))
    .run();

  return idsToDelete.length;
}

/**
 * Save one analytics snapshot and prune `tableName` back to the retention
 * policy in the same call. `savedAt` defaults to now; the legacy-KV migration
 * below overrides it to preserve the original save time.
 */
export function saveAnalyticsSnapshotHistory(input: {
  tableName: string;
  label: string;
  fileName?: string | null;
  payload: unknown;
  totalTransactions?: number;
  successRate?: number;
  savedAt?: number;
}): AnalyticsSnapshotHistoryMeta {
  const { db } = openDomain(domainForNamespace(ANALYTICS_SNAPSHOT_NS));
  const savedAt = new Date(input.savedAt ?? Date.now());
  const sizeBytes = Buffer.byteLength(JSON.stringify(input.payload ?? null), "utf8");

  const [row] = db
    .insert(settingsSchema.analyticsSnapshotHistory)
    .values({
      tableName: input.tableName,
      label: input.label,
      fileName: input.fileName ?? null,
      savedAt,
      sizeBytes,
      totalTransactions: input.totalTransactions ?? 0,
      successRate: input.successRate ?? 0,
      payload: input.payload ?? null,
    })
    .returning(HISTORY_META_COLUMNS)
    .all();

  pruneAnalyticsSnapshotHistory(input.tableName);

  return toMeta(row);
}

/**
 * Newest-first snapshot metadata (no payload — keep list responses small).
 * Scoped to `tableName` when given, otherwise across every table (the
 * Analytics History list browses everything the user has ever saved).
 */
export function listAnalyticsSnapshotHistory(
  tableName?: string,
  limit = 20,
  offset = 0,
): AnalyticsSnapshotHistoryMeta[] {
  const { db } = openDomain(domainForNamespace(ANALYTICS_SNAPSHOT_NS));
  const boundedLimit = Math.min(Math.max(1, limit), 200);
  const boundedOffset = Math.max(0, offset);

  const query = db.select(HISTORY_META_COLUMNS).from(settingsSchema.analyticsSnapshotHistory);
  const rows = (
    tableName
      ? query.where(eq(settingsSchema.analyticsSnapshotHistory.tableName, tableName))
      : query
  )
    .orderBy(desc(settingsSchema.analyticsSnapshotHistory.savedAt))
    .limit(boundedLimit)
    .offset(boundedOffset)
    .all();

  return rows.map(toMeta);
}

/** One full snapshot (including payload) by id, or `undefined` when absent. */
export function getAnalyticsSnapshotHistoryById(
  id: number,
): AnalyticsSnapshotHistoryRow | undefined {
  const { db } = openDomain(domainForNamespace(ANALYTICS_SNAPSHOT_NS));
  const row = db
    .select()
    .from(settingsSchema.analyticsSnapshotHistory)
    .where(eq(settingsSchema.analyticsSnapshotHistory.id, id))
    .get();
  if (!row) return undefined;
  return { ...toMeta(row), payload: row.payload };
}

/** Delete one snapshot by id (no-op when absent). */
export function deleteAnalyticsSnapshotHistoryById(id: number): void {
  const { db } = openDomain(domainForNamespace(ANALYTICS_SNAPSHOT_NS));
  db.delete(settingsSchema.analyticsSnapshotHistory)
    .where(eq(settingsSchema.analyticsSnapshotHistory.id, id))
    .run();
}

/** Marker namespace/key recording that the one-time legacy lift already ran. */
const MIGRATION_NS = "__migration";
const MIGRATION_KEY = "auth_app_setting_v1";

const legacyAppSetting = sqliteTable("app_setting", {
  namespace: text("namespace").notNull(),
  key: text("key").notNull(),
  value: text("value").notNull(),
});

/**
 * One-time lift of the legacy `app_setting` rows out of the shared auth database
 * into the new per-domain databases. Idempotent (guarded by a marker row) and
 * non-destructive: rows are COPIED, the source auth DB is left untouched, and an
 * already-present key in the new store is never clobbered.
 *
 * Reads the auth DB read-only with the stock driver. If the file is missing, has
 * no `app_setting` table, or is encrypted (opt-in, default off) and therefore
 * unreadable here, the lift is skipped and settings simply start empty — never
 * fatal to boot.
 */
export function migrateLegacyAppSettings(authDbPath: string): { migrated: number } {
  if (getSetting(MIGRATION_NS, MIGRATION_KEY).value) return { migrated: 0 };

  let migrated = 0;
  if (existsSync(authDbPath)) {
    try {
      const source = createSqliteConnection(authDbPath, { readonly: true });
      try {
        const sourceDb = drizzle(source);
        const rows = sourceDb.select().from(legacyAppSetting).all();
        for (const row of rows) {
          if (row.namespace === MIGRATION_NS) continue;
          if (getSetting(row.namespace, row.key).value !== null) continue;
          let parsed: unknown;
          try {
            parsed = JSON.parse(row.value);
          } catch {
            parsed = row.value;
          }
          setSetting(row.namespace, row.key, parsed);
          migrated += 1;
        }
      } finally {
        source.close();
      }
    } catch (error) {
      // Missing table / encrypted / locked → start fresh, not fatal.
      console.warn("[settings-store] legacy app_setting lift skipped:", error);
    }
  }

  setSetting(MIGRATION_NS, MIGRATION_KEY, { done: true, migrated, at: Date.now() });
  return { migrated };
}

/** Marker recording that the KV→history lift for analytics snapshots already ran. */
const HISTORY_MIGRATION_KEY = "analytics_snapshot_history_v1";

/**
 * One-time lift of the legacy `app_setting` rows under the `analytics_snapshot`
 * namespace into the new `analytics_snapshot_history` table, so a table's
 * pre-existing auto-saved snapshot shows up in the Analytics History list
 * instead of only ever being reachable through the old "restore latest on
 * cold start" path. Idempotent (guarded by a marker row) and non-destructive,
 * same discipline as `migrateLegacyAppSettings`: rows are COPIED, the source
 * KV row is left untouched — `saveAnalyticsSnapshotToSQLite` /
 * `loadAnalyticsSnapshotFromSQLite` (the auto-save "resume last computed
 * view" cache, a different feature from the history list) still reads and
 * overwrites that same KV row exactly as before. Each KV row becomes exactly
 * one history row, using the KV row's `updatedAt` as `savedAt` so migrated
 * entries keep their real save time.
 */
export function migrateLegacyAnalyticsSnapshotKV(): { migrated: number } {
  if (getSetting(MIGRATION_NS, HISTORY_MIGRATION_KEY).value) return { migrated: 0 };

  const { db } = openDomain(domainForNamespace(ANALYTICS_SNAPSHOT_NS));
  const rows = db
    .select()
    .from(settingsSchema.appSetting)
    .where(eq(settingsSchema.appSetting.namespace, ANALYTICS_SNAPSHOT_NS))
    .all();

  let migrated = 0;
  for (const row of rows) {
    const value = row.value as Record<string, unknown> | null;
    const tableName =
      value && typeof value.tableName === "string" && value.tableName ? value.tableName : row.key;
    const fileName = value && typeof value.fileName === "string" ? value.fileName : null;
    const kpi =
      value && typeof value.kpi === "object" ? (value.kpi as Record<string, unknown>) : null;
    const totalTransactions =
      typeof kpi?.totalTransactions === "number" ? kpi.totalTransactions : 0;
    const successRate = typeof kpi?.successRate === "number" ? kpi.successRate : 0;

    saveAnalyticsSnapshotHistory({
      tableName,
      label: fileName ?? "Migrated snapshot",
      fileName,
      payload: value,
      totalTransactions,
      successRate,
      savedAt: row.updatedAt.getTime(),
    });
    migrated += 1;
  }

  setSetting(MIGRATION_NS, HISTORY_MIGRATION_KEY, { done: true, migrated, at: Date.now() });
  return { migrated };
}

/**
 * Record an audit log entry into the analytics database.
 */
export function recordAuditLog(entry: {
  userId?: string | null;
  action: string;
  category: string;
  status: string;
  durationMs?: number | null;
  metadata?: Record<string, unknown> | null;
}): void {
  try {
    const { db } = openDomain("analytics");
    db.insert(settingsSchema.auditLog)
      .values({
        userId: entry.userId ?? null,
        action: entry.action,
        category: entry.category,
        status: entry.status,
        durationMs: entry.durationMs ?? null,
        metadata: entry.metadata ?? null,
        timestamp: new Date(),
      })
      .run();
  } catch (error) {
    console.warn("[settings-store] Failed to record audit log:", error);
  }
}

/**
 * Retrieve recent audit log entries ordered newest first.
 */
export function listAuditLogs(limit = 100): settingsSchema.AuditLogEntry[] {
  const { db } = openDomain("analytics");
  return db
    .select()
    .from(settingsSchema.auditLog)
    .orderBy(desc(settingsSchema.auditLog.timestamp))
    .limit(limit)
    .all();
}

/**
 * Record query analytics metrics into the analytics database.
 */
export function recordQueryAnalytics(entry: {
  datasetId: string;
  sqlQuery: string;
  rowCount: number;
  executionTimeMs: number;
  isCached?: boolean;
  error?: string | null;
}): void {
  try {
    const { db } = openDomain("analytics");
    db.insert(settingsSchema.queryAnalytics)
      .values({
        datasetId: entry.datasetId,
        sqlQuery: entry.sqlQuery,
        rowCount: entry.rowCount,
        executionTimeMs: entry.executionTimeMs,
        isCached: entry.isCached ?? false,
        error: entry.error ?? null,
        timestamp: new Date(),
      })
      .run();
  } catch (error) {
    console.warn("[settings-store] Failed to record query analytics:", error);
  }
}

/**
 * Retrieve recent query analytics entries ordered newest first.
 */
export function listQueryAnalytics(limit = 100): settingsSchema.QueryAnalyticsEntry[] {
  const { db } = openDomain("analytics");
  return db
    .select()
    .from(settingsSchema.queryAnalytics)
    .orderBy(desc(settingsSchema.queryAnalytics.timestamp))
    .limit(limit)
    .all();
}

/** Close every open handle (call on app quit so WAL checkpoints flush cleanly). */
export function closeSettingsStore(): void {
  for (const { sqlite } of handles.values()) {
    try {
      sqlite.close();
    } catch {
      // best-effort on shutdown
    }
  }
  handles.clear();
}
