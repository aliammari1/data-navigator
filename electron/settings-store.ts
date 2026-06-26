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
 * `configureSettingsStore`) so it stays unit-testable in plain Node.
 */

import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/** Key→value row, identical to the legacy `app_setting` table (1:1 migration). */
const appSetting = sqliteTable(
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

/** DDL applied on open (better-sqlite3 needs the table to exist; drizzle won't create it). */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS app_setting (
  namespace text NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  created_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  updated_at integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  PRIMARY KEY (namespace, key)
);
CREATE INDEX IF NOT EXISTS app_setting_namespace_idx ON app_setting (namespace);
`;

/** Logical database files, one per domain. Auth stays with better-auth (separate). */
export type SettingDomain = "settings" | "analytics";

const DB_FILES: Record<SettingDomain, string> = {
  settings: "settings.db",
  analytics: "analytics.db",
};

/**
 * Namespaces that belong in the analytics database. Everything else (UI prefs,
 * store state, theme, dashboard access, …) lives in the settings database.
 * Keeping this an explicit allowlist means a new namespace defaults to the safe,
 * general bucket rather than silently landing in analytics.
 */
const ANALYTICS_NAMESPACES = new Set<string>(["analytics_snapshot"]);

/** Route a namespace to its owning database. */
export function domainForNamespace(namespace: string): SettingDomain {
  return ANALYTICS_NAMESPACES.has(namespace) ? "analytics" : "settings";
}

export type AppSettingRemote = {
  value: unknown;
  updatedAt: string | null;
};

type Handle = {
  db: ReturnType<typeof drizzle<{ appSetting: typeof appSetting }>>;
  sqlite: Database.Database;
};

const handles = new Map<SettingDomain, Handle>();
let baseDir: string | null = null;

/**
 * Point the store at the directory that will hold the `.db` files. Call once from
 * `main.ts` with `app.getPath("userData")/databases` before any IPC handler runs.
 */
export function configureSettingsStore(databasesDir: string): void {
  baseDir = databasesDir;
}

function openDomain(domain: SettingDomain): Handle {
  const cached = handles.get(domain);
  if (cached) return cached;
  if (!baseDir) {
    throw new Error("settings-store: configureSettingsStore() was not called");
  }

  mkdirSync(baseDir, { recursive: true });
  const sqlite = new Database(path.join(baseDir, DB_FILES[domain]));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(SCHEMA_SQL);

  const handle: Handle = { db: drizzle({ client: sqlite, schema: { appSetting } }), sqlite };
  handles.set(domain, handle);
  return handle;
}

/** Read one setting. Returns `{ value: null }` when absent. */
export function getSetting(namespace: string, key: string): AppSettingRemote {
  const { db } = openDomain(domainForNamespace(namespace));
  const row = db
    .select()
    .from(appSetting)
    .where(and(eq(appSetting.namespace, namespace), eq(appSetting.key, key)))
    .get();

  if (!row) return { value: null, updatedAt: null };
  return { value: row.value, updatedAt: new Date(row.updatedAt).toISOString() };
}

/** Upsert one setting; returns the persisted `updatedAt` (ISO). */
export function setSetting(namespace: string, key: string, value: unknown): string {
  const { db } = openDomain(domainForNamespace(namespace));
  const now = new Date();

  db.insert(appSetting)
    .values({ namespace, key, value, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [appSetting.namespace, appSetting.key],
      set: { value, updatedAt: now },
    })
    .run();

  return now.toISOString();
}

/** Delete one setting (no-op when absent). */
export function deleteSetting(namespace: string, key: string): void {
  const { db } = openDomain(domainForNamespace(namespace));
  db.delete(appSetting)
    .where(and(eq(appSetting.namespace, namespace), eq(appSetting.key, key)))
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
    const query = db.select().from(appSetting);
    const rows = namespace ? query.where(eq(appSetting.namespace, namespace)).all() : query.all();
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

/** Marker namespace/key recording that the one-time legacy lift already ran. */
const MIGRATION_NS = "__migration";
const MIGRATION_KEY = "auth_app_setting_v1";

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
      const source = new Database(authDbPath, { readonly: true });
      try {
        const rows = source
          .prepare("SELECT namespace, key, value FROM app_setting")
          .all() as Array<{ namespace: string; key: string; value: string }>;
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
