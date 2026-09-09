import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import type { RegisteredDataset } from "@/platform/duckdb/duckdb";
import { createDrizzleStorage } from "@/platform/storage/drizzle-storage";
import type { SupportedExtensions } from "@/shared/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ColType = "number" | "string" | "date" | "boolean" | "unknown";

type DatasetFormat = SupportedExtensions | "csv" | "tsv" | "txt" | "parquet" | "pq";

type DatasetSource = "upload" | "paste" | "transform" | "catalog";

export interface ColMeta {
  name: string;
  type: ColType;
  nullCount: number;
  distinctCount: number;
  min?: number | string;
  max?: number | string;
  mean?: number;
  stddev?: number;
  sample: unknown[];
}

export interface Dataset {
  /**
   * Stable app dataset id.
   *
   * In the new DuckDB model this should match the DuckDB catalog id:
   * app_datasets.id, e.g. "ds_xxxxx".
   */
  id: string;

  /**
   * Human-readable display name.
   */
  name: string;

  /**
   * Compatibility field for older UI code.
   *
   * In the new model this is NOT a physical DuckDB table.
   * It is the DuckDB view name created over the managed Parquet cache.
   */
  tableName: string;

  /**
   * Explicit new-name alias for tableName.
   */
  viewName: string;

  /**
   * Original selected file path, if available.
   */
  sourcePath?: string;

  /**
   * Managed Parquet cache path, if available.
   */
  cachePath?: string;

  source: DatasetSource;
  format: DatasetFormat;
  rowCount: number;
  colCount: number;
  sizeBytes: number;
  columns: ColMeta[];
  tags: string[];
  description: string;
  createdAt: string;
  updatedAt: string;
  parentId?: string;
  transformSql?: string;
  qualityScore: number;
}

export interface QueryHistoryItem {
  id: string;
  sql: string;
  naturalLanguage?: string;
  datasetId: string;
  rowsReturned: number;
  durationMs: number;
  ranAt: string;
  error?: string;
}

export interface SavedChart {
  id: string;
  datasetId: string;
  title: string;
  type: string;
  config: Record<string, unknown>;
  createdAt: string;
}

export interface DataTransform {
  id: string;
  inputDatasetId: string;
  outputDatasetId: string;
  type:
    | "filter"
    | "aggregate"
    | "join"
    | "pivot"
    | "unpivot"
    | "derive"
    | "rename"
    | "sort"
    | "dedup"
    | "sample";
  sql: string;
  description: string;
  appliedAt: string;
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface DataStore {
  datasets: Dataset[];
  activeDatasetId: string | null;
  queryHistory: QueryHistoryItem[];
  savedCharts: SavedChart[];
  transforms: DataTransform[];

  /**
   * Legacy compatibility.
   *
   * Previously this tracked tables loaded into DuckDB WASM during the browser
   * session. In the new model DuckDB restores views in the Electron main
   * process from app_datasets + Parquet cache.
   *
   * Keep this field only so older components do not break while migrating.
   * It is intentionally not persisted.
   */
  loadedTableNames: string[];

  markTableLoaded: (tableName: string) => void;
  markDatasetViewLoaded: (viewName: string) => void;

  // Dataset actions
  addDataset: (dataset: Dataset) => void;
  upsertDataset: (dataset: Dataset) => void;
  updateDataset: (id: string, patch: Partial<Dataset>) => void;
  removeDataset: (id: string) => void;
  setActiveDataset: (id: string | null) => void;
  getActiveDataset: () => Dataset | undefined;

  /**
   * Sync UI store from DuckDB app_datasets catalog.
   *
   * This should be used instead of the old useDatasetRestore hook.
   */
  replaceDatasetsFromCatalog: (datasets: RegisteredDataset[]) => void;
  upsertDatasetFromCatalog: (dataset: RegisteredDataset) => void;

  // Query history
  addQueryHistory: (item: QueryHistoryItem) => void;
  clearQueryHistory: () => void;

  // Charts
  saveChart: (chart: SavedChart) => void;
  removeChart: (id: string) => void;

  // Transforms
  addTransform: (transform: DataTransform) => void;

  // Utilities
  getDatasetById: (id: string) => Dataset | undefined;
  getDatasetByTable: (tableName: string) => Dataset | undefined;
  getDatasetByView: (viewName: string) => Dataset | undefined;
}

function normalizeFormat(format: string): DatasetFormat {
  const normalized = format.toLowerCase();

  if (normalized === "parquet" || normalized === "pq") return normalized;
  if (normalized === "tsv" || normalized === "txt" || normalized === "csv") {
    return normalized;
  }

  return normalized as DatasetFormat;
}

function catalogDatasetToStoreDataset(dataset: RegisteredDataset): Dataset {
  const columns: ColMeta[] = dataset.columns.map((column) => ({
    name: column.name,
    type: inferColType(column.type),
    nullCount: 0,
    distinctCount: 0,
    sample: [],
  }));

  return {
    id: dataset.id,
    name: dataset.displayName,
    tableName: dataset.viewName,
    viewName: dataset.viewName,
    sourcePath: dataset.sourcePath,
    cachePath: dataset.cachePath,
    source: "catalog",
    format: normalizeFormat(dataset.sourceFormat),
    rowCount: dataset.rowCount,
    colCount: dataset.columns.length,
    sizeBytes: 0,
    columns,
    tags: [],
    description: "",
    createdAt: dataset.createdAt,
    updatedAt: dataset.updatedAt,
    qualityScore: computeQualityScore(columns, dataset.rowCount),
  };
}

function mergeDataset(existing: Dataset | undefined, incoming: Dataset): Dataset {
  if (!existing) return incoming;

  return {
    ...existing,
    ...incoming,

    // Preserve user-authored metadata.
    tags: existing.tags,
    description: existing.description,
    savedUserFields: undefined,

    // Preserve transform information if the catalog version does not know it.
    parentId: existing.parentId,
    transformSql: existing.transformSql,

    updatedAt: incoming.updatedAt || existing.updatedAt,
  } as Dataset;
}

export const useDataStore = create<DataStore>()(
  persist(
    (set, get) => ({
      datasets: [],
      activeDatasetId: null,
      queryHistory: [],
      savedCharts: [],
      transforms: [],
      loadedTableNames: [],

      markTableLoaded: (tableName) =>
        set((state) => ({
          loadedTableNames: state.loadedTableNames.includes(tableName)
            ? state.loadedTableNames
            : [...state.loadedTableNames, tableName],
        })),

      markDatasetViewLoaded: (viewName) =>
        set((state) => ({
          loadedTableNames: state.loadedTableNames.includes(viewName)
            ? state.loadedTableNames
            : [...state.loadedTableNames, viewName],
        })),

      addDataset: (dataset) =>
        set((state) => ({
          datasets: [dataset, ...state.datasets],
          activeDatasetId: state.activeDatasetId ?? dataset.id,
          loadedTableNames: state.loadedTableNames.includes(dataset.tableName)
            ? state.loadedTableNames
            : [...state.loadedTableNames, dataset.tableName],
        })),

      upsertDataset: (dataset) =>
        set((state) => {
          const exists = state.datasets.some((item) => item.id === dataset.id);
          const datasets = exists
            ? state.datasets.map((item) =>
                item.id === dataset.id ? mergeDataset(item, dataset) : item,
              )
            : [dataset, ...state.datasets];

          return {
            datasets,
            activeDatasetId: state.activeDatasetId ?? dataset.id,
            loadedTableNames: state.loadedTableNames.includes(dataset.tableName)
              ? state.loadedTableNames
              : [...state.loadedTableNames, dataset.tableName],
          };
        }),

      updateDataset: (id, patch) =>
        set((state) => ({
          datasets: state.datasets.map((dataset) =>
            dataset.id === id
              ? {
                  ...dataset,
                  ...patch,
                  updatedAt: new Date().toISOString(),
                }
              : dataset,
          ),
        })),

      removeDataset: (id) =>
        set((state) => {
          const removed = state.datasets.find((dataset) => dataset.id === id);
          const remaining = state.datasets.filter((dataset) => dataset.id !== id);

          return {
            datasets: remaining,
            activeDatasetId:
              state.activeDatasetId === id ? (remaining[0]?.id ?? null) : state.activeDatasetId,
            loadedTableNames: removed
              ? state.loadedTableNames.filter(
                  (tableName) => tableName !== removed.tableName && tableName !== removed.viewName,
                )
              : state.loadedTableNames,
          };
        }),

      setActiveDataset: (id) => set({ activeDatasetId: id }),

      getActiveDataset: () => {
        const { datasets, activeDatasetId } = get();
        return datasets.find((dataset) => dataset.id === activeDatasetId);
      },

      replaceDatasetsFromCatalog: (catalogDatasets) =>
        set((state) => {
          const incoming = catalogDatasets.map(catalogDatasetToStoreDataset);
          const incomingIds = new Set(incoming.map((dataset) => dataset.id));

          const preservedLocalDatasets = state.datasets.filter(
            (dataset) => !incomingIds.has(dataset.id) && dataset.source !== "catalog",
          );

          const mergedIncoming = incoming.map((dataset) => {
            const existing = state.datasets.find((item) => item.id === dataset.id);
            return mergeDataset(existing, dataset);
          });

          const datasets = [...mergedIncoming, ...preservedLocalDatasets];

          const activeDatasetId =
            state.activeDatasetId &&
            datasets.some((dataset) => dataset.id === state.activeDatasetId)
              ? state.activeDatasetId
              : (datasets[0]?.id ?? null);

          return {
            datasets,
            activeDatasetId,
            loadedTableNames: datasets.map((dataset) => dataset.tableName),
          };
        }),

      upsertDatasetFromCatalog: (catalogDataset) => {
        const dataset = catalogDatasetToStoreDataset(catalogDataset);
        get().upsertDataset(dataset);
      },

      addQueryHistory: (item) =>
        set((state) => ({
          queryHistory: [item, ...state.queryHistory].slice(0, 200),
        })),

      clearQueryHistory: () => set({ queryHistory: [] }),

      saveChart: (chart) =>
        set((state) => ({
          savedCharts: [chart, ...state.savedCharts],
        })),

      removeChart: (id) =>
        set((state) => ({
          savedCharts: state.savedCharts.filter((chart) => chart.id !== id),
        })),

      addTransform: (transform) =>
        set((state) => ({
          transforms: [transform, ...state.transforms],
        })),

      getDatasetById: (id) => get().datasets.find((dataset) => dataset.id === id),

      getDatasetByTable: (tableName) =>
        get().datasets.find(
          (dataset) => dataset.tableName === tableName || dataset.viewName === tableName,
        ),

      getDatasetByView: (viewName) =>
        get().datasets.find((dataset) => dataset.viewName === viewName),
    }),
    {
      name: "data-navigator-datasets",
      version: 1,
      // Durable: localStorage warm cache + SQLite backup via the settings IPC
      // bridge (same as every other persisted store).
      storage: createJSONStorage(() => createDrizzleStorage()),

      // Map any legacy persisted shape to the current Dataset shape: backfill
      // viewName from tableName, strip column samples, default qualityScore,
      // and coerce activeDatasetId to a still-present id.
      migrate: (persisted, _version) => {
        const prev = (persisted ?? {}) as {
          datasets?: unknown[];
          activeDatasetId?: string | null;
          queryHistory?: QueryHistoryItem[];
          savedCharts?: SavedChart[];
          transforms?: DataTransform[];
        };

        const datasets = Array.isArray(prev.datasets)
          ? prev.datasets.map((raw) => migrateDataset(raw))
          : [];

        const ids = new Set(datasets.map((dataset) => dataset.id));
        const activeDatasetId =
          prev.activeDatasetId && ids.has(prev.activeDatasetId)
            ? prev.activeDatasetId
            : (datasets[0]?.id ?? null);

        return {
          datasets,
          activeDatasetId,
          queryHistory: Array.isArray(prev.queryHistory) ? prev.queryHistory : [],
          savedCharts: Array.isArray(prev.savedCharts) ? prev.savedCharts : [],
          transforms: Array.isArray(prev.transforms) ? prev.transforms : [],
        };
      },

      // Keep localStorage lean. Do not persist loadedTableNames because DuckDB
      // main-process init restores views from the catalog.
      partialize: (state) => ({
        datasets: state.datasets.map((dataset) => ({
          ...dataset,
          columns: dataset.columns.map((column) => ({
            ...column,
            sample: [],
          })),
        })),
        activeDatasetId: state.activeDatasetId,
        queryHistory: state.queryHistory.slice(0, 50),
        savedCharts: state.savedCharts,
        transforms: state.transforms,
      }),
    },
  ),
);

// ─── Migration ────────────────────────────────────────────────────────────────

/**
 * Coerce an unknown persisted dataset record to the current Dataset shape.
 * Backfills viewName from tableName, ensures column samples are empty, and
 * defaults qualityScore via computeQualityScore when missing.
 */
function migrateDataset(raw: unknown): Dataset {
  const d = (raw ?? {}) as Partial<Dataset> & Record<string, unknown>;

  const columns: ColMeta[] = Array.isArray(d.columns)
    ? d.columns.map((col) => {
        const c = (col ?? {}) as Partial<ColMeta>;
        return {
          name: c.name ?? "",
          type: c.type ?? "unknown",
          nullCount: c.nullCount ?? 0,
          distinctCount: c.distinctCount ?? 0,
          min: c.min,
          max: c.max,
          mean: c.mean,
          stddev: c.stddev,
          sample: [],
        };
      })
    : [];

  const tableName = d.tableName ?? d.viewName ?? "";
  const viewName = d.viewName ?? tableName;
  const rowCount = d.rowCount ?? 0;

  return {
    id: d.id ?? "",
    name: d.name ?? "",
    tableName,
    viewName,
    sourcePath: d.sourcePath,
    cachePath: d.cachePath,
    source: d.source ?? "catalog",
    format: (d.format ?? "csv") as DatasetFormat,
    rowCount,
    colCount: d.colCount ?? columns.length,
    sizeBytes: d.sizeBytes ?? 0,
    columns,
    tags: Array.isArray(d.tags) ? d.tags : [],
    description: d.description ?? "",
    createdAt: d.createdAt ?? new Date().toISOString(),
    updatedAt: d.updatedAt ?? new Date().toISOString(),
    parentId: d.parentId,
    transformSql: d.transformSql,
    qualityScore:
      typeof d.qualityScore === "number" ? d.qualityScore : computeQualityScore(columns, rowCount),
  };
}

// ─── Selector hooks ───────────────────────────────────────────────────────────
// Narrow slices so wholesale consumers (sidebar-nav, parsed-data)
// can subscribe only what they read instead of the whole store.

export const useDatasets = () => useDataStore((s) => s.datasets);
export const useActiveDatasetId = () => useDataStore((s) => s.activeDatasetId);
export const useQueryHistory = () => useDataStore((s) => s.queryHistory);
export const useSavedCharts = () => useDataStore((s) => s.savedCharts);

export const useDataActions = () =>
  useDataStore(
    useShallow((s) => ({
      markTableLoaded: s.markTableLoaded,
      markDatasetViewLoaded: s.markDatasetViewLoaded,
      addDataset: s.addDataset,
      upsertDataset: s.upsertDataset,
      updateDataset: s.updateDataset,
      removeDataset: s.removeDataset,
      setActiveDataset: s.setActiveDataset,
      replaceDatasetsFromCatalog: s.replaceDatasetsFromCatalog,
      upsertDatasetFromCatalog: s.upsertDatasetFromCatalog,
      addQueryHistory: s.addQueryHistory,
      clearQueryHistory: s.clearQueryHistory,
      saveChart: s.saveChart,
      removeChart: s.removeChart,
      addTransform: s.addTransform,
    })),
  );

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Infer app column type from DuckDB type string. */
export function inferColType(duckType: string): ColType {
  const type = duckType.toUpperCase();

  if (/INT|BIGINT|HUGEINT|TINYINT|SMALLINT|FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL/.test(type)) {
    return "number";
  }

  if (/DATE|TIME|TIMESTAMP|INTERVAL/.test(type)) return "date";
  if (/BOOL/.test(type)) return "boolean";
  if (/VARCHAR|TEXT|CHAR|STRING|BLOB|UUID|ENUM/.test(type)) return "string";

  return "unknown";
}

/** Compute quality score 0–100 based on column metadata. */
export function computeQualityScore(cols: ColMeta[], rowCount: number): number {
  if (cols.length === 0 || rowCount === 0) return 0;

  const completeness =
    cols.reduce((acc, column) => {
      return acc + (1 - column.nullCount / Math.max(1, rowCount));
    }, 0) / cols.length;

  const uniqueness =
    cols.reduce((acc, column) => {
      return acc + Math.min(1, column.distinctCount / Math.max(1, rowCount));
    }, 0) / cols.length;

  return Math.round((completeness * 0.7 + uniqueness * 0.3) * 100);
}

/**
 * Generate a safe view/table-ish name from a display name.
 *
 * New code should prefer the DuckDB catalog `viewName` returned by
 * registerCSVPathDataset/registerParquetPathDataset.
 */
export function toTableName(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_]/g, "_")
      .replace(/^(\d)/, "_$1")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .toLowerCase() || "dataset"
  );
}
