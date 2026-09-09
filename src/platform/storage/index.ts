/**
 * Durable persistence subsystem — public surface.
 *
 * One import point for feature/provider agents adopting the storage layer.
 * See architecture.md §2 (storage split) and §4 (state & persistence).
 *
 *  - app-db          → central Dexie DB + typed accessors for small records
 *  - opfs-handles    → worker-only OPFS big-blob store (Parquet/models/PMTiles)
 *  - create-selectors→ zustand `createSelectors` + `useShallowSelector`
 *  - persist-helpers → zustand persist version/migrate/partialize trio
 *  - query-persister → TanStack Query IndexedDB persister (instant cold paint)
 *  - storage-info    → navigator.storage persist()/estimate() surface
 *  - apply-settings  → settings → CSS vars/data-attrs + clamped runtime config
 *  - store-mirror    → zustand→Dexie write-through helper (feature adoption)
 *  - drizzle-storage → existing key→single-blob settings adapter (kept)
 */

// Central Dexie DB + accessors
export * from "./app-db";
// Settings application
export { applySettings } from "./apply-settings";

// Zustand selector discipline
export { createSelectors } from "./create-selectors";
// Existing settings storage adapter (re-exported for discoverability)
export { createDrizzleStorage } from "./drizzle-storage";
// OPFS big-blob store
export {
  deleteDir,
  dirSize,
  isOpfsAvailable,
  OPFS_NS,
} from "./opfs-handles";
// Zustand persist discipline
export { durablePersist } from "./persist-helpers";
// TanStack Query persister
export {
  persistQueryClient,
  restoreQueryClient,
} from "./query-persister";
// Storage quota / persistence
export {
  ensurePersistentStorage,
  getStorageInfo,
  type StorageInfo,
} from "./storage-info";
// Store mirror (feature adoption helper)
