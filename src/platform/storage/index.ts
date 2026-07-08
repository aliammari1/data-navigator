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

// OPFS big-blob store
export {
  dirSize,
  deleteDir,
  deleteFile,
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

// Zustand selector discipline
export {
  createSelectors,
  SELECTOR_GUIDANCE,
  useShallowSelector,
} from "./create-selectors";

// Zustand persist discipline
export {
  deepMergeDefaults,
  durablePersist,
  type DurablePersistOptions,
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

// Settings application
export {
  applyAppearance,
  applySettings,
  type AppliedSettings,
  type AppearanceInput,
  getRuntimePerformanceConfig,
  type PerformanceInput,
  resolvePerformanceConfig,
  type RuntimePerformanceConfig,
  subscribePerformanceConfig,
} from "./apply-settings";

// Store mirror (feature adoption helper)
export {
  mirrorStoreToDexie,
  runOnceBackfill,
  type SubscribableStore,
} from "./store-mirror";

// Existing settings storage adapter (re-exported for discoverability)
export {
  createDrizzleStorage,
  type DrizzleStorageOptions,
  type StateStorage,
} from "./drizzle-storage";
