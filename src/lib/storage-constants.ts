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

// ─── Primary DuckDB OPFS database ────────────────────────────────────────────

/**
 * OPFS path for the primary DuckDB database.
 * The SharedWorker opens DuckDB against this path so all tables survive
 * page reloads and tab closes.
 *
 * Changing this value effectively discards any previously persisted data.
 */
export const DUCKDB_OPFS_PATH = "opfs://data-navigator.duckdb";

// ─── IndexedDB databases ──────────────────────────────────────────────────────

/**
 * IndexedDB database name for the analytics result cache.
 * Used by src/lib/analytics-cache.ts (currently telecom-specific).
 * Named generically here to allow future non-telecom caches.
 */
export const ANALYTICS_CACHE_DB = "data-navigator-analytics-cache";

// ─── wa-sqlite metadata database ─────────────────────────────────────────────

/**
 * wa-sqlite VFS name and file name for application metadata.
 * Used by src/lib/meta-db.ts.
 */
export const META_DB_VFS = "data-navigator-meta-idb";
export const META_DB_FILE = "data-navigator-meta.db";

// ─── Auth database (server-side only) ────────────────────────────────────────

/**
 * SQLite filename for BetterAuth.
 * Used by src/lib/auth.ts (server-only).
 * Kept here so auth.ts no longer imports from telecom/names.ts.
 */
export const AUTH_DB_FILE = "data-navigator-auth.sqlite";
