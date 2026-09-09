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
export {
  type AppearanceInput,
  type AppliedSettings,
  applyAppearance,
  applySettings,
  getRuntimePerformanceConfig,
  type PerformanceInput,
  type RuntimePerformanceConfig,
  resolvePerformanceConfig,
  subscribePerformanceConfig,
} from "./apply-settings";

// Zustand selector discipline
export {
  createSelectors,
  SELECTOR_GUIDANCE,
  useShallowSelector,
} from "./create-selectors";
// Existing settings storage adapter (re-exported for discoverability)
export {
  createDrizzleStorage,
  type DrizzleStorageOptions,
  type StateStorage,
} from "./drizzle-storage";
// OPFS big-blob store
export {
  deleteDir,
  deleteFile,
  dirSize,
  exists,
  getDir,
  isOpfsAvailable,
  isSyncAccessAvailable,
  list,
  OPFS_NS,
  OPFSBlobStore,
  OPFSSyncFile,
  type OpfsEntry,
  type OpfsNamespace,
  readBlob,
  size,
  writeBlob,
} from "./opfs-handles";
// Zustand persist discipline
export {
  type DurablePersistOptions,
  deepMergeDefaults,
  durablePersist,
  makeDeepMergeMigrate,
  pickKeys,
} from "./persist-helpers";
// TanStack Query persister
export {
  clearQueryCacheSnapshot,
  persistQueryClient,
  type QueryPersistOptions,
  queryCacheSnapshotSize,
  restoreQueryClient,
} from "./query-persister";
// Storage quota / persistence
export {
  ensurePersistentStorage,
  estimateStorage,
  getStorageInfo,
  isStoragePersisted,
  requestPersistence,
  type StorageInfo,
} from "./storage-info";
// Store mirror (feature adoption helper)
export {
  mirrorStoreToDexie,
  runOnceBackfill,
  type SubscribableStore,
} from "./store-mirror";
