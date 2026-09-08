/**
 * Query key factory for TanStack React Query.
 *
 * Centralizing keys ensures cache consistency and makes invalidation predictable.
 * Pattern: [entity, 'list' | 'detail', ...identifiers, ...filters]
 */
export const queryKeys = {
  // Datasets
  datasets: {
    all: () => ["datasets"] as const,
    lists: () => [...queryKeys.datasets.all(), "list"] as const,
    list: (filters?: { source?: string; format?: string }) =>
      [...queryKeys.datasets.lists(), filters ?? {}] as const,
    details: () => [...queryKeys.datasets.all(), "detail"] as const,
    detail: (id: string) => [...queryKeys.datasets.details(), id] as const,
    byTable: (tableName: string) => [...queryKeys.datasets.all(), "byTable", tableName] as const,
  },

  // Query History
  queryHistory: {
    all: () => ["queryHistory"] as const,
    lists: () => [...queryKeys.queryHistory.all(), "list"] as const,
    list: (datasetId?: string) => [...queryKeys.queryHistory.lists(), { datasetId }] as const,
    detail: (id: string) => [...queryKeys.queryHistory.all(), id] as const,
  },

  // Saved Charts
  savedCharts: {
    all: () => ["savedCharts"] as const,
    lists: () => [...queryKeys.savedCharts.all(), "list"] as const,
    list: (datasetId?: string) => [...queryKeys.savedCharts.lists(), { datasetId }] as const,
    detail: (id: string) => [...queryKeys.savedCharts.all(), id] as const,
  },

  // Transforms
  transforms: {
    all: () => ["transforms"] as const,
    lists: () => [...queryKeys.transforms.all(), "list"] as const,
    list: (datasetId?: string) => [...queryKeys.transforms.lists(), { datasetId }] as const,
    detail: (id: string) => [...queryKeys.transforms.all(), id] as const,
  },

  // Files
  files: {
    all: () => ["files"] as const,
    lists: () => [...queryKeys.files.all(), "list"] as const,
    list: (folderId?: string | null) => [...queryKeys.files.lists(), { folderId }] as const,
    detail: (id: string) => [...queryKeys.files.all(), id] as const,
    uploadProgress: (fileId: string) =>
      [...queryKeys.files.all(), "uploadProgress", fileId] as const,
  },

  // Folders
  folders: {
    all: () => ["folders"] as const,
    lists: () => [...queryKeys.folders.all(), "list"] as const,
    list: (parentId?: string | null) => [...queryKeys.folders.lists(), { parentId }] as const,
    detail: (id: string) => [...queryKeys.folders.all(), id] as const,
    starred: () => [...queryKeys.folders.all(), "starred"] as const,
    datasetMap: () => [...queryKeys.folders.all(), "datasetMap"] as const,
  },

  // DuckDB
  duckdb: {
    tables: () => ["duckdb", "tables"] as const,
    query: (sql: string, params?: unknown[]) => ["duckdb", "query", sql, params ?? []] as const,
    schema: (tableName: string) => ["duckdb", "schema", tableName] as const,
    preview: (tableName: string, limit?: number) =>
      ["duckdb", "preview", tableName, limit ?? 100] as const,
  },

  // Telecom
  telecom: {
    all: () => ["telecom"] as const,
    analytics: (tableName: string, mappingHash: string) =>
      [...queryKeys.telecom.all(), "analytics", tableName, mappingHash] as const,
    kpi: (tableName: string) => [...queryKeys.telecom.all(), "kpi", tableName] as const,
    hourly: (tableName: string) => [...queryKeys.telecom.all(), "hourly", tableName] as const,
    canals: (tableName: string) => [...queryKeys.telecom.all(), "canals", tableName] as const,
    operators: (tableName: string) => [...queryKeys.telecom.all(), "operators", tableName] as const,
    regions: (tableName: string) => [...queryKeys.telecom.all(), "regions", tableName] as const,
    statusBreakdown: (tableName: string) =>
      [...queryKeys.telecom.all(), "statusBreakdown", tableName] as const,
    forecast: (tableName: string, hours: number) =>
      [...queryKeys.telecom.all(), "forecast", tableName, hours] as const,
  },

  // Settings (persisted in Zustand, but can be cached in RQ for SSR)
  settings: {
    all: () => ["settings"] as const,
    current: () => [...queryKeys.settings.all(), "current"] as const,
  },
} as const;
