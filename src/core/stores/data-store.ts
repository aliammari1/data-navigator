import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { SupportedExtensions } from "@/shared/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ColType = "number" | "string" | "date" | "boolean" | "unknown";

export interface ColMeta {
  name: string;
  type: ColType;
  nullCount: number;
  distinctCount: number;
  min?: number | string;
  max?: number | string;
  mean?: number;
  stddev?: number;
  sample: unknown[]; // up to 5 sample values
}

export interface Dataset {
  id: string;
  name: string;
  tableName: string; // DuckDB table name
  source: "upload" | "paste" | "transform";
  format: SupportedExtensions;
  rowCount: number;
  colCount: number;
  sizeBytes: number;
  columns: ColMeta[];
  tags: string[];
  description: string;
  createdAt: string; // ISO string (serialisable for persist)
  updatedAt: string;
  parentId?: string; // for transformed datasets
  transformSql?: string;
  qualityScore: number; // 0-100
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
  config: Record<string, unknown>; // ECharts option
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

  /** Table names currently loaded in DuckDB WASM this browser session (not persisted — reset on refresh) */
  loadedTableNames: string[];
  markTableLoaded: (tableName: string) => void;

  // Dataset actions
  addDataset: (ds: Dataset) => void;
  updateDataset: (id: string, patch: Partial<Dataset>) => void;
  removeDataset: (id: string) => void;
  setActiveDataset: (id: string | null) => void;
  getActiveDataset: () => Dataset | undefined;

  // Query history
  addQueryHistory: (item: QueryHistoryItem) => void;
  clearQueryHistory: () => void;

  // Charts
  saveChart: (chart: SavedChart) => void;
  removeChart: (id: string) => void;

  // Transforms
  addTransform: (t: DataTransform) => void;

  // Utilities
  getDatasetById: (id: string) => Dataset | undefined;
  getDatasetByTable: (tableName: string) => Dataset | undefined;
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
        set((s) => ({
          loadedTableNames: s.loadedTableNames.includes(tableName)
            ? s.loadedTableNames
            : [...s.loadedTableNames, tableName],
        })),

      addDataset: (ds) =>
        set((s) => ({
          datasets: [ds, ...s.datasets],
          activeDatasetId: s.activeDatasetId ?? ds.id,
        })),

      updateDataset: (id, patch) =>
        set((s) => ({
          datasets: s.datasets.map((d) =>
            d.id === id
              ? { ...d, ...patch, updatedAt: new Date().toISOString() }
              : d,
          ),
        })),

      removeDataset: (id) =>
        set((s) => ({
          datasets: s.datasets.filter((d) => d.id !== id),
          activeDatasetId:
            s.activeDatasetId === id
              ? (s.datasets.find((d) => d.id !== id)?.id ?? null)
              : s.activeDatasetId,
        })),

      setActiveDataset: (id) => set({ activeDatasetId: id }),

      getActiveDataset: () => {
        const { datasets, activeDatasetId } = get();
        return datasets.find((d) => d.id === activeDatasetId);
      },

      addQueryHistory: (item) =>
        set((s) => ({
          queryHistory: [item, ...s.queryHistory].slice(0, 200),
        })),

      clearQueryHistory: () => set({ queryHistory: [] }),

      saveChart: (chart) =>
        set((s) => ({
          savedCharts: [chart, ...s.savedCharts],
        })),

      removeChart: (id) =>
        set((s) => ({
          savedCharts: s.savedCharts.filter((c) => c.id !== id),
        })),

      addTransform: (t) =>
        set((s) => ({
          transforms: [t, ...s.transforms],
        })),

      getDatasetById: (id) => get().datasets.find((d) => d.id === id),
      getDatasetByTable: (tableName) =>
        get().datasets.find((d) => d.tableName === tableName),
    }),
    {
      name: "data-navigator-datasets",
      storage: createJSONStorage(() => localStorage),
      // Don't persist sample data to keep localStorage lean
      partialize: (s) => ({
        datasets: s.datasets.map((d) => ({
          ...d,
          columns: d.columns.map((c) => ({ ...c, sample: [] })),
        })),
        activeDatasetId: s.activeDatasetId,
        queryHistory: s.queryHistory.slice(0, 50),
        savedCharts: s.savedCharts,
        transforms: s.transforms,
      }),
    },
  ),
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Infer column type from DuckDB type string */
export function inferColType(duckType: string): ColType {
  const t = duckType.toUpperCase();
  if (
    /INT|BIGINT|HUGEINT|TINYINT|SMALLINT|FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL/.test(
      t,
    )
  )
    return "number";
  if (/DATE|TIME|TIMESTAMP|INTERVAL/.test(t)) return "date";
  if (/BOOL/.test(t)) return "boolean";
  if (/VARCHAR|TEXT|CHAR|STRING|BLOB/.test(t)) return "string";
  return "unknown";
}

/** Compute quality score 0–100 based on column metadata */
export function computeQualityScore(cols: ColMeta[], rowCount: number): number {
  if (cols.length === 0 || rowCount === 0) return 0;
  const completeness =
    cols.reduce((acc, c) => acc + (1 - c.nullCount / rowCount), 0) /
    cols.length;
  const uniqueness =
    cols.reduce(
      (acc, c) => acc + Math.min(1, c.distinctCount / Math.max(1, rowCount)),
      0,
    ) / cols.length;
  return Math.round((completeness * 0.7 + uniqueness * 0.3) * 100);
}

/** Generate a safe DuckDB table name from a file name */
export function toTableName(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/^(\d)/, "_$1")
    .toLowerCase();
}
