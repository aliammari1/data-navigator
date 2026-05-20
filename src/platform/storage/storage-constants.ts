/**
 * Central storage path constants for DataNavigator.
 *
 * All persistent storage paths are defined here so they can be kept consistent
 * across the SharedWorker, client lib, and any future tooling.
 *
 * Rules:
 * - This file must have zero imports from the rest of the codebase.
 * - It may be imported by the SharedWorker build and client code alike.
 * - Telecom-specific names remain in src/lib/telecom/names.ts.
 */

// ─── DuckDB local persistence ─────────────────────────────────────────────────

/**
 * Filename suffix used when exporting DuckDB tables to Parquet on the local
 * filesystem via Electron IPC. The actual directory is resolved at runtime by
 * electron/main.ts (Electron userData path).
 */
export const DUCKDB_PARQUET_SUFFIX = ".parquet";

// ─── IndexedDB databases ──────────────────────────────────────────────────────

/**
 * IndexedDB database name for the analytics result cache.
 * Used by src/lib/analytics-cache.ts (currently telecom-specific).
 * Named generically here to allow future non-telecom caches.
 */
export const ANALYTICS_CACHE_DB = "data-navigator-analytics-cache";

// ─── Auth database (server-side only) ────────────────────────────────────────

/**
 * SQLite filename for BetterAuth.
 * Used by src/lib/auth.ts (server-only).
 * Kept here so auth.ts no longer imports from telecom/names.ts.
 */
export const AUTH_DB_FILE = "data-navigator-auth.sqlite";
