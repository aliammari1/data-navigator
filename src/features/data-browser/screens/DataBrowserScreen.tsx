"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { produce } from "immer";
// Icons
import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BarChart2,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Code2,
  Columns3,
  Copy,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  Filter,
  Grid3X3,
  Loader2,
  Maximize2,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  StarOff,
  Table2,
  Upload,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
// UI components
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { OPERATOR_LABELS, PAGE_SIZES } from "@/features/data-browser/model/constants";
import {
  composeWhereClause,
  formatCellValue,
  generateCountSQL,
  generateExportSQL,
  generateSQL,
  inferColType,
} from "@/features/data-browser/model/helpers";
import {
  listSavedFilters,
  listSavedSql,
  loadStarredKeys,
  removeSavedRecord,
  type SavedFilterRecord,
  type SavedSqlRecord,
  saveFilter,
  saveSql,
  saveStarredKeys,
} from "@/features/data-browser/model/persistence";
import type {
  CellSelection,
  ColumnDef,
  ColumnStats,
  FilterGroup,
  FilterRule,
  SortConfig,
  ViewMode,
} from "@/features/data-browser/model/types";
import { useAppCommands, useRegisterPages } from "@/features/desktop/core/menu/app-commands";
import { useWindowId } from "@/features/desktop/core/menu/window-context";
import {
  cancelQueries,
  listRegisteredDatasets,
  type RegisteredDataset,
  resetCancelToken,
  runReadOnlyQuery,
} from "@/platform/duckdb/duckdb";
import {
  loadUploadPathToDuckDB,
  sanitizeUploadTableName,
} from "@/platform/duckdb/upload-to-duckdb";
import { openFileDialog } from "@/platform/electron/electron-fs";
import { getExportProxy, saveBytes } from "@/platform/viz";
import { cn } from "@/shared/utils";

// Lazy load Monaco Editor
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-40 bg-zinc-950 rounded-lg text-zinc-500 text-sm">
      <Zap className="h-4 w-4 mr-2 animate-pulse" />
      Loading SQL Editor...
    </div>
  ),
});

// Lazy-load the analytics view so ECharts + the chart worker stay out of the
// browser route's initial JS chunk and only load when the Charts tab is opened.
// All charts inside render off the main thread via OffscreenChart.
const AnalyticsView = dynamic(() => import("@/features/data-browser/components/AnalyticsView"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center text-zinc-600 text-xs">
      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      Loading analytics…
    </div>
  ),
});

import {
  ColumnHeader,
  ColumnStatPanel,
  ColumnTypeChip,
  DBStatusBadge,
  LoadingOverlay,
} from "@/features/data-browser/components/table-widgets";

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function datasetMatchesName(dataset: RegisteredDataset, value: string): boolean {
  return dataset.id === value || dataset.viewName === value || dataset.displayName === value;
}

function columnsFromDataset(
  dataset: RegisteredDataset,
  sampleRow: Record<string, unknown>,
): ColumnDef[] {
  return dataset.columns.map((column) => ({
    id: column.name,
    name: column.name,
    dbType: column.type,
    type: inferColType(column.name, sampleRow[column.name]),
    width: column.name.length > 10 ? 160 : 130,
    visible: true,
    pinned: null,
    sortable: true,
    filterable: true,
  }));
}

function getDatasetLabel(dataset: RegisteredDataset): string {
  return dataset.displayName || dataset.viewName || dataset.id;
}

function fileNameFromPath(filePath: string): string {
  return filePath.split(/[/]/).pop() || "dataset";
}

function fileExtensionFromPath(filePath: string): string {
  return fileNameFromPath(filePath).split(".").pop()?.toLowerCase() || "csv";
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DataBrowserScreen({
  tableName = "",
}: {
  /**
   * Optional initial dataset to open. When it doesn't match a registered
   * dataset (or is omitted) the first catalogued dataset is opened instead.
   * The dead telecom prop plumbing (m/operators/regions/statusMapping/
   * fetchFiltered/fetchCustomerProfile) was removed — the screen queries DuckDB
   * directly via the platform API.
   */
  tableName?: string;
}) {
  // ── State ──
  const [dbReady, setDbReady] = useState(false);
  const [dbLoading, setDbLoading] = useState(true);
  const [totalRows, setTotalRows] = useState(0);
  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryTime, setQueryTime] = useState<number | null>(null);
  const [activeTable, setActiveTable] = useState<string>(tableName);
  const [datasetCatalog, setDatasetCatalog] = useState<RegisteredDataset[]>([]);
  const [uploadPanelOpen, setUploadPanelOpen] = useState(false);
  const [uploadDragging, setUploadDragging] = useState(false);
  const [uploadingFile, setUploadingFile] = useState<{
    name: string;
    progress: number;
    status: "reading" | "parsing" | "loading_db" | "done" | "error";
    error?: string;
  } | null>(null);
  // Pagination
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(totalRows / pageSize);

  // Sort
  const [sorts, setSorts] = useState<SortConfig[]>([]);

  // Filters
  const [filterGroup, setFilterGroup] = useState<FilterGroup>({
    id: "main",
    logic: "AND",
    rules: [],
    name: "Active Filters",
    saved: false,
  });
  const [savedFilterGroups, setSavedFilterGroups] = useState<SavedFilterRecord[]>([]);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  // Debounced copy of the search term that is actually pushed down to DuckDB,
  // so typing does not fire one COUNT + page query per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchHighlight, setSearchHighlight] = useState(false);

  // Selection
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [lastSelectedRow, setLastSelectedRow] = useState<number | null>(null);
  const [focusedCell, setFocusedCell] = useState<CellSelection | null>(null);

  // Views
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [customQueryResult, setCustomQueryResult] = useState<Record<string, unknown>[] | null>(
    null,
  );
  const [customQueryCols, setCustomQueryCols] = useState<string[]>([]);
  const [customQueryTime, setCustomQueryTime] = useState<number | null>(null);
  const [sqlQuery, setSqlQuery] = useState(`SELECT * FROM ${quoteIdentifier(tableName)} LIMIT 100`);

  // Column UI
  const [colPanelOpen, setColPanelOpen] = useState(false);
  const [columnSearch, setColumnSearch] = useState("");
  const [activeColStats, setActiveColStats] = useState<string | null>(null);
  const [columnStats, setColumnStats] = useState<Record<string, ColumnStats>>({});
  const [resizingCol, setResizingCol] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);

  // Row details
  const [rowDetailRow, setRowDetailRow] = useState<Record<string, unknown> | null>(null);
  // Starred rows persist by a STABLE row key (rowid/id), not page index, so the
  // star survives sort/page changes and reloads (Dexie-backed per dataset).
  const [starredKeys, setStarredKeys] = useState<Set<string>>(new Set());

  // Misc
  const [fullscreen, setFullscreen] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [showRowNumbers, setShowRowNumbers] = useState(true);
  const [zebraStripes, setZebraStripes] = useState(true);
  // Saved SQL queries persist per dataset (Dexie). `SavedQuery` from model/types
  // is the legacy in-memory shape; the durable record is `SavedSqlRecord`.
  const [savedQueries, setSavedQueries] = useState<SavedSqlRecord[]>([]);

  // ── Cell Editing ──
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; colId: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editedCells, setEditedCells] = useState<Map<string, unknown>>(new Map());

  // ── Heatmap ──
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const cardsContainerRef = useRef<HTMLDivElement>(null);
  const [cardColumns, setCardColumns] = useState(4);
  const [_isPending, _startTransition] = useTransition();

  // Monotonic id used to drop stale page queries: if a slower earlier query
  // resolves after a newer one, its result is ignored (fixes the race where an
  // out-of-date page overwrites the current one).
  const fetchIdRef = useRef(0);
  // Cache COUNT(*) keyed by `${table}::${where}` so we don't recount on every
  // sort/page change — the total only moves when the table or WHERE changes.
  const countCacheRef = useRef<Map<string, number>>(new Map());
  // Stable cancel-token id: cancel queued + in-flight scans for this group when
  // the user switches datasets so a slow scan can't bleed into the new view.
  const cancelTokenRef = useRef("data-browser-grid");

  // Resolve a STABLE per-row key for starring (rowid/id else a content hash).
  const rowStableKey = useCallback((row: Record<string, unknown>): string => {
    const id = row.rowid ?? row.id ?? row._rowid;
    if (id != null) return `id:${String(id)}`;
    // Fallback: hash of the row's values (stable across page/sort for a given row).
    // BigInt-safe: DuckDB returns BigInt for 64-bit columns, which JSON.stringify
    // throws on — coerce them to strings in the replacer.
    let h = 0;
    const s = JSON.stringify(row, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return `h:${h}`;
  }, []);

  // Debounce the search term before it hits the engine.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(0);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [searchQuery]);

  const switchToDataset = useCallback(async (dataset: RegisteredDataset) => {
    const viewName = dataset.viewName;

    // Cancel any queued/in-flight scans tied to the previous dataset, then
    // reset the token so the fresh dataset starts a clean cancellable group.
    try {
      await cancelQueries(cancelTokenRef.current);
      await resetCancelToken(cancelTokenRef.current);
    } catch {
      /* cancellation is best-effort */
    }

    let sampleRow: Record<string, unknown> = {};
    try {
      const sample = await runReadOnlyQuery(`SELECT * FROM ${quoteIdentifier(viewName)} LIMIT 1`);
      sampleRow = sample[0] ?? {};
    } catch {
      sampleRow = {};
    }

    const cols = columnsFromDataset(dataset, sampleRow);

    // A new dataset invalidates every cached count.
    countCacheRef.current.clear();

    setColumns(cols);
    setTotalRows(dataset.rowCount);
    setActiveTable(viewName);
    setDbReady(true);
    setDbLoading(false);
    setQueryError(null);
    setCustomQueryResult(null);
    setCustomQueryCols([]);
    setColumnStats({});
    setPage(0);
    setSorts([]);
    setFilterGroup((prev) =>
      produce(prev, (draft) => {
        draft.rules = [];
      }),
    );
    setSqlQuery(`SELECT * FROM ${quoteIdentifier(viewName)} LIMIT 100`);

    // Restore durable per-dataset state (starred rows, saved filters/SQL).
    try {
      const [stars, filters, sql] = await Promise.all([
        loadStarredKeys(viewName),
        listSavedFilters(viewName),
        listSavedSql(viewName),
      ]);
      setStarredKeys(stars);
      setSavedFilterGroups(filters);
      setSavedQueries(sql);
    } catch {
      setStarredKeys(new Set());
      setSavedFilterGroups([]);
      setSavedQueries([]);
    }
  }, []);

  // ── DuckDB Init ──
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setDbLoading(true);
        setDbReady(false);
        setQueryError(null);

        const catalog = await listRegisteredDatasets();
        if (cancelled) return;

        setDatasetCatalog(catalog);

        const selectedDataset =
          catalog.find((dataset) => datasetMatchesName(dataset, tableName)) ?? catalog[0] ?? null;

        if (!selectedDataset) {
          setColumns([]);
          setRows([]);
          setTotalRows(0);
          setActiveTable("");
          setDbReady(false);
          setDbLoading(false);
          return;
        }

        await switchToDataset(selectedDataset);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setDbReady(false);
          setDbLoading(false);
          setQueryError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [tableName, switchToDataset]);

  const handleBrowserUpload = useCallback(async (file: File) => {
    setUploadingFile({
      name: file.name,
      progress: 0,
      status: "error",
      error:
        "Drag-and-drop does not provide a trusted local path. Click this panel to use the native file picker instead.",
    });
  }, []);

  const handleNativeUpload = useCallback(async () => {
    try {
      const selected = await openFileDialog({
        title: "Open dataset file",
        properties: ["openFile"],
        filters: [
          {
            name: "Data files",
            extensions: ["csv", "tsv", "txt", "parquet", "pq"],
          },
        ],
      });

      const filePath = selected[0];
      if (!filePath) return;

      const fileName = fileNameFromPath(filePath);
      const ext = fileExtensionFromPath(filePath);

      setUploadingFile({ name: fileName, progress: 20, status: "reading" });
      setUploadingFile((p) => p && { ...p, progress: 65, status: "loading_db" });

      const loaded = await loadUploadPathToDuckDB(filePath, {
        tableName: sanitizeUploadTableName(fileName),
        displayName: fileName.replace(/\.[^.]+$/, ""),
        fileExtension: ext as Parameters<typeof loadUploadPathToDuckDB>[1]["fileExtension"],
        hasHeader: true,
        previewLimit: 1,
      });

      const catalog = await listRegisteredDatasets();
      setDatasetCatalog(catalog);

      const selectedDataset =
        catalog.find(
          (dataset) =>
            dataset.id === loaded.datasetId ||
            dataset.viewName === loaded.tableName ||
            dataset.displayName === loaded.displayName,
        ) ?? null;

      if (selectedDataset) {
        await switchToDataset(selectedDataset);
      }

      setUploadingFile((p) => p && { ...p, progress: 100, status: "done" });

      window.setTimeout(() => {
        setUploadingFile(null);
        setUploadPanelOpen(false);
      }, 1200);
    } catch (err) {
      setUploadingFile((p) =>
        p
          ? {
              ...p,
              status: "error",
              error: err instanceof Error ? err.message : String(err),
            }
          : {
              name: "Import failed",
              progress: 0,
              status: "error",
              error: err instanceof Error ? err.message : String(err),
            },
      );
    }
  }, [switchToDataset]);

  // ── Data Fetch ──
  // Stable query key: changes only on data-relevant inputs. Notably it depends
  // on the *visible column signature* (names) — not the columns array — so
  // resizing or pinning a column never re-queries the database. Serialized
  // sorts/filter keep the key referentially comparable.
  const visibleColumnSignature = useMemo(
    () =>
      columns
        .filter((c) => c.visible)
        .map((c) => c.name)
        .join(""),
    [columns],
  );
  const composedWhere = useMemo(
    () => composeWhereClause(filterGroup, debouncedSearch, columns),
    [filterGroup, debouncedSearch, columns],
  );
  const sortSignature = useMemo(
    () =>
      [...sorts]
        .sort((a, b) => a.priority - b.priority)
        .map((s) => `${s.column}:${s.direction}`)
        .join(","),
    [sorts],
  );

  const fetchRows = useCallback(async () => {
    if (!dbReady || !activeTable) return;

    const fetchId = ++fetchIdRef.current;
    setQueryLoading(true);
    setQueryError(null);

    try {
      const t0 = performance.now();
      const visibleCols = columns.filter((c) => c.visible);

      // Count: served from cache when the (table, where) pair is unchanged,
      // and run in parallel with the page query when it must be recomputed.
      const countKey = `${activeTable}::${composedWhere}`;
      const cachedCount = countCacheRef.current.get(countKey);
      const countPromise =
        cachedCount !== undefined
          ? Promise.resolve(cachedCount)
          : runReadOnlyQuery(generateCountSQL(activeTable, composedWhere)).then((res) => {
              const value = Number(res[0]?.cnt ?? 0);
              countCacheRef.current.set(countKey, value);
              return value;
            });

      // Clamp the page against the *cached* total when available so we don't
      // serialize the count before issuing the data query.
      const knownTotal = cachedCount ?? totalRows;
      const maxPage = Math.max(0, Math.ceil(knownTotal / pageSize) - 1);
      const clampedPage = Math.min(Math.max(0, page), maxPage);

      const sql = generateSQL(
        activeTable,
        visibleCols.length > 0 ? columns : columns,
        sorts,
        composedWhere,
        pageSize,
        clampedPage * pageSize,
      );

      const [newTotal, data] = await Promise.all([countPromise, runReadOnlyQuery(sql)]);

      // Drop the result if a newer fetch has started in the meantime.
      if (fetchId !== fetchIdRef.current) return;

      setTotalRows(newTotal);
      if (clampedPage !== page) setPage(clampedPage);
      setRows(data);
      setQueryTime(Math.round(performance.now() - t0));
    } catch (err) {
      if (fetchId !== fetchIdRef.current) return;
      setQueryError(String(err));
    } finally {
      if (fetchId === fetchIdRef.current) setQueryLoading(false);
    }
    // `columns` is intentionally included for the projection, but width/pinning
    // changes are absorbed by `visibleColumnSignature` in the effect below.
  }, [dbReady, activeTable, columns, sorts, composedWhere, page, pageSize, totalRows]);

  // Refetch only when a data-relevant slice changes. Resizing/pinning columns
  // mutates `columns` but not this dependency set, so they never hit the DB.
  // biome-ignore lint/correctness/useExhaustiveDependencies: query-key driven
  useEffect(() => {
    void fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbReady, activeTable, composedWhere, sortSignature, page, pageSize, visibleColumnSignature]);

  // ── Column Stats ──
  const loadColumnStats = useCallback(
    async (colName: string) => {
      if (!dbReady || columnStats[colName]?.loading === false) return;

      setColumnStats((prev) =>
        produce(prev, (draft) => {
          draft[colName] = {
            min: null,
            max: null,
            avg: null,
            nullCount: 0,
            distinctCount: 0,
            histogram: [],
            loading: true,
          };
        }),
      );

      try {
        const columnSql = quoteIdentifier(colName);
        const tableSql = quoteIdentifier(activeTable);

        const [basicRows, histogramRows] = await Promise.all([
          runReadOnlyQuery(`
            SELECT
              MIN(TRY_CAST(${columnSql} AS DOUBLE)) AS min,
              MAX(TRY_CAST(${columnSql} AS DOUBLE)) AS max,
              AVG(TRY_CAST(${columnSql} AS DOUBLE)) AS avg,
              COUNT(*) - COUNT(${columnSql}) AS null_count,
              COUNT(DISTINCT ${columnSql}) AS distinct_count
            FROM ${tableSql}
          `),
          runReadOnlyQuery(`
            SELECT
              CAST(${columnSql} AS VARCHAR) AS bucket,
              COUNT(*) AS count
            FROM ${tableSql}
            WHERE ${columnSql} IS NOT NULL
            GROUP BY 1
            ORDER BY count DESC
            LIMIT 20
          `),
        ]);

        const basic = basicRows[0] ?? {};
        const stats: ColumnStats = {
          min: basic.min ?? null,
          max: basic.max ?? null,
          avg: basic.avg ?? null,
          nullCount: Number(basic.null_count ?? 0),
          distinctCount: Number(basic.distinct_count ?? 0),
          histogram: histogramRows.map((row) => ({
            bucket: String(row.bucket ?? ""),
            count: Number(row.count ?? 0),
          })),
          loading: false,
        };

        setColumnStats((prev) =>
          produce(prev, (draft) => {
            draft[colName] = stats;
          }),
        );
      } catch (e) {
        console.error(e);
        setColumnStats((prev) =>
          produce(prev, (draft) => {
            if (draft[colName]) draft[colName].loading = false;
          }),
        );
      }
    },
    [activeTable, dbReady, columnStats],
  );

  useEffect(() => {
    if (activeColStats) loadColumnStats(activeColStats);
  }, [activeColStats, loadColumnStats]);

  // ── Virtualization ──
  const visibleColumns = useMemo(() => columns.filter((c) => c.visible), [columns]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => (compactMode ? 28 : 40),
    overscan: 10,
  });

  // ── Cards view: responsive column count + virtualized rows ──
  // Keep the card column count in sync with the container width (mirrors the
  // grid breakpoints) so the row virtualizer chunks rows correctly.
  useEffect(() => {
    if (viewMode !== "cards") return;
    const el = cardsContainerRef.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      const next = w >= 1280 ? 4 : w >= 1024 ? 3 : w >= 640 ? 2 : 1;
      setCardColumns((prev) => (prev === next ? prev : next));
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(el);
    return () => observer.disconnect();
  }, [viewMode]);

  const cardRowCount = Math.ceil(rows.length / cardColumns);
  const cardRowVirtualizer = useVirtualizer({
    count: cardRowCount,
    getScrollElement: () => cardsContainerRef.current,
    estimateSize: () => 188, // card height (172) + vertical gap (12) + padding
    overscan: 4,
  });

  // ── Selection ──
  const toggleRow = useCallback(
    (rowIdx: number, e: React.MouseEvent | React.KeyboardEvent) => {
      setSelectedRows((prev) => {
        const next = new Set(prev);
        if (e.shiftKey && lastSelectedRow !== null) {
          const lo = Math.min(rowIdx, lastSelectedRow);
          const hi = Math.max(rowIdx, lastSelectedRow);
          for (let i = lo; i <= hi; i++) {
            if (prev.has(lastSelectedRow)) next.add(i);
            else next.delete(i);
          }
        } else if (e.ctrlKey || e.metaKey) {
          if (next.has(rowIdx)) next.delete(rowIdx);
          else next.add(rowIdx);
        } else {
          if (next.has(rowIdx) && next.size === 1) next.clear();
          else {
            next.clear();
            next.add(rowIdx);
          }
        }
        return next;
      });
      setLastSelectedRow(rowIdx);
    },
    [lastSelectedRow],
  );

  const selectAll = useCallback(() => {
    if (selectedRows.size === rows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(rows.map((_, i) => i)));
    }
  }, [rows, selectedRows.size]);

  // ── Star toggle (stable row key → Dexie-persisted, survives sort/page) ──
  const toggleStar = useCallback(
    (row: Record<string, unknown>) => {
      const key = rowStableKey(row);
      setStarredKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        if (activeTable) void saveStarredKeys(activeTable, next);
        return next;
      });
    },
    [activeTable, rowStableKey],
  );

  // ── Sort ──
  const handleSort = useCallback((colName: string, e: React.MouseEvent) => {
    setSorts((prev) => {
      const existing = prev.find((s) => s.column === colName);
      if (e.shiftKey) {
        if (existing) {
          if (existing.direction === "asc")
            return prev.map((s) =>
              s.column === colName ? { ...s, direction: "desc" as const } : s,
            );
          return prev.filter((s) => s.column !== colName);
        }
        return [...prev, { column: colName, direction: "asc" as const, priority: prev.length }];
      }
      if (existing) {
        if (existing.direction === "asc")
          return [{ column: colName, direction: "desc" as const, priority: 0 }];
        return [];
      }
      return [{ column: colName, direction: "asc" as const, priority: 0 }];
    });
    setPage(0);
  }, []);

  // ── Custom SQL ──
  const runCustomQuery = useCallback(async () => {
    if (!dbReady) return;
    setQueryLoading(true);
    setQueryError(null);
    try {
      const t0 = performance.now();
      const result = await runReadOnlyQuery(sqlQuery);
      setCustomQueryResult(result);
      setCustomQueryCols(result.length > 0 ? Object.keys(result[0]) : []);
      setCustomQueryTime(Math.round(performance.now() - t0));
    } catch (err) {
      setQueryError(String(err));
    } finally {
      setQueryLoading(false);
    }
  }, [dbReady, sqlQuery]);

  // ── Durable saves (Dexie, per dataset) ──
  const handleSaveSql = useCallback(async () => {
    if (!activeTable || !sqlQuery.trim()) return;
    const name = `Query ${new Date().toLocaleString()}`;
    await saveSql(activeTable, name, sqlQuery);
    setSavedQueries(await listSavedSql(activeTable));
    toast.success("Query saved");
  }, [activeTable, sqlQuery]);

  const handleSaveFilter = useCallback(async () => {
    if (!activeTable || filterGroup.rules.length === 0) return;
    const name = `Filter ${new Date().toLocaleTimeString()}`;
    await saveFilter(activeTable, name, filterGroup);
    setSavedFilterGroups(await listSavedFilters(activeTable));
    toast.success("Filter saved");
  }, [activeTable, filterGroup]);

  const handleApplyFilter = useCallback((record: SavedFilterRecord) => {
    setFilterGroup(record.group);
    setPage(0);
  }, []);

  const handleDeleteSaved = useCallback(
    async (id: string, kind: "filter" | "query") => {
      await removeSavedRecord(id);
      if (!activeTable) return;
      if (kind === "query") setSavedQueries(await listSavedSql(activeTable));
      else setSavedFilterGroups(await listSavedFilters(activeTable));
    },
    [activeTable],
  );

  // ── Export ──
  // Upper bound on a single client-side export so a multi-million-row filtered
  // set cannot OOM the renderer. (A true unbounded export needs a main-process
  // COPY ... TO streaming path — see sharedChangesNeeded.)
  const EXPORT_ROW_CAP = 1_000_000;

  const triggerDownload = useCallback((blob: Blob, fileName: string): void => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  /**
   * Resolve the rows to export. With an explicit selection we export exactly
   * the selected (page-local) rows; otherwise we stream the FULL filtered +
   * sorted result from DuckDB — not just the visible page.
   */
  const resolveExportRows = useCallback(async (): Promise<Record<string, unknown>[]> => {
    if (selectedRows.size > 0) {
      return [...selectedRows].map((i) => rows[i]).filter(Boolean);
    }
    const sql = generateExportSQL(activeTable, columns, sorts, composedWhere, EXPORT_ROW_CAP);
    return runReadOnlyQuery(sql);
  }, [selectedRows, rows, activeTable, columns, sorts, composedWhere]);

  const exportData = useCallback(
    async (format: "csv") => {
      const toastId = toast.loading("Preparing CSV export…");
      try {
        const data = await resolveExportRows();
        if (data.length === 0) {
          toast.error("No rows to export", { id: toastId });
          return;
        }
        const sep = ",";
        const headers = Object.keys(data[0] ?? {});
        const csvRows = [
          headers.join(sep),
          ...data.map((r) =>
            headers
              .map((h) => {
                const v = r[h];
                const s = v == null ? "" : String(v);
                return s.includes(",") || s.includes('"') || s.includes("\n")
                  ? `"${s.replaceAll('"', '""')}"`
                  : s;
              })
              .join(sep),
          ),
        ];
        triggerDownload(new Blob([csvRows.join("\n")], { type: "text/csv" }), `export.${format}`);
        toast.success(`Exported ${data.length.toLocaleString()} rows`, { id: toastId });
      } catch (err) {
        toast.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`, {
          id: toastId,
        });
      }
    },
    [resolveExportRows, triggerDownload],
  );

  // XLSX runs off the main thread in the export.worker (exceljs writeBuffer) and
  // is written through the Electron save dialog (saveBytes) — never a giant
  // main-thread Blob.
  const exportExcel = useCallback(async () => {
    const toastId = toast.loading("Preparing Excel export…");
    try {
      const data = await resolveExportRows();
      if (data.length === 0) {
        toast.error("No rows to export", { id: toastId });
        return;
      }
      const headers = Object.keys(data[0]);
      const proxy = getExportProxy();
      if (!proxy) {
        toast.error("Excel export unavailable in this environment", { id: toastId });
        return;
      }
      const bytes = await proxy.xlsx({
        title: "Data Export",
        sections: [
          {
            title: "Data",
            headers,
            rows: data.map((r) =>
              headers.map((h) => {
                const v = r[h];
                if (v == null) return "";
                return typeof v === "number" || typeof v === "string" ? v : String(v);
              }),
            ),
          },
        ],
      });
      const result = await saveBytes(bytes, "export.xlsx", "xlsx");
      if (result.saved) {
        toast.success(`Exported ${data.length.toLocaleString()} rows`, { id: toastId });
      } else {
        toast.dismiss(toastId);
      }
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`, {
        id: toastId,
      });
    }
  }, [resolveExportRows]);

  const exportJSON = useCallback(async () => {
    const toastId = toast.loading("Preparing JSON export…");
    try {
      const data = await resolveExportRows();
      if (data.length === 0) {
        toast.error("No rows to export", { id: toastId });
        return;
      }
      triggerDownload(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
        "export.json",
      );
      toast.success(`Exported ${data.length.toLocaleString()} rows`, { id: toastId });
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`, {
        id: toastId,
      });
    }
  }, [resolveExportRows, triggerDownload]);

  // ── Copy Cell ──
  const copyCell = useCallback((value: unknown) => {
    navigator.clipboard.writeText(String(value ?? ""));
  }, []);

  // ── Column Resize ──
  const startResize = useCallback(
    (colId: string, e: React.MouseEvent) => {
      e.preventDefault();
      setResizingCol(colId);
      setResizeStart(e.clientX);
      const col = columns.find((c) => c.id === colId);
      setResizeStartWidth(col?.width ?? 120);
    },
    [columns],
  );

  useEffect(() => {
    if (!resizingCol) return;
    // Coalesce mousemove updates to at most one state commit per animation
    // frame (instead of a full columns-array clone per pixel of drag).
    let rafId = 0;
    let pendingWidth = resizeStartWidth;
    const applyWidth = () => {
      rafId = 0;
      setColumns((prev) =>
        produce(prev, (draft) => {
          const col = draft.find((c) => c.id === resizingCol);
          if (col) col.width = pendingWidth;
        }),
      );
    };
    const onMove = (e: MouseEvent) => {
      pendingWidth = Math.max(60, resizeStartWidth + (e.clientX - resizeStart));
      if (rafId === 0) rafId = window.requestAnimationFrame(applyWidth);
    };
    const onUp = () => {
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
        applyWidth(); // commit the final width
      }
      setResizingCol(null);
    };
    globalThis.window.addEventListener("mousemove", onMove);
    globalThis.window.addEventListener("mouseup", onUp);
    return () => {
      if (rafId !== 0) window.cancelAnimationFrame(rafId);
      globalThis.window.removeEventListener("mousemove", onMove);
      globalThis.window.removeEventListener("mouseup", onUp);
    };
  }, [resizingCol, resizeStart, resizeStartWidth]);

  // ── Search highlight (visual only — matching is pushed down to DuckDB) ──
  const highlightText = useCallback(
    (text: string): React.ReactNode => {
      if (!searchHighlight || !searchQuery || !text) return text;
      const idx = text.toLowerCase().indexOf(searchQuery.toLowerCase());
      if (idx === -1) return text;
      return (
        <>
          {text.slice(0, idx)}
          <mark className="bg-yellow-400/30 text-yellow-200 rounded px-0.5">
            {text.slice(idx, idx + searchQuery.length)}
          </mark>
          {text.slice(idx + searchQuery.length)}
        </>
      );
    },
    [searchQuery, searchHighlight],
  );

  // Selected row stats
  const selectionStats = useMemo(() => {
    if (selectedRows.size === 0) return null;
    const selectedData = [...selectedRows].map((i) => rows[i]).filter(Boolean);
    const numCols = columns.filter((c) => c.visible && c.type === "number");
    return numCols.slice(0, 3).map((col) => {
      const vals = selectedData.map((r) => Number(r[col.name])).filter((v) => !Number.isNaN(v));
      return {
        col: col.name,
        sum: vals.reduce((a, b) => a + b, 0),
        avg: vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
        min: vals.length > 0 ? Math.min(...vals) : 0,
        max: vals.length > 0 ? Math.max(...vals) : 0,
      };
    });
  }, [selectedRows, rows, columns]);

  // ── Heatmap column ranges ──
  const columnRanges = useMemo(() => {
    if (!heatmapEnabled) return {} as Record<string, { min: number; max: number }>;
    const ranges: Record<string, { min: number; max: number }> = {};
    for (const col of columns.filter((c) => c.type === "number")) {
      const vals = rows.map((r) => Number(r[col.name])).filter((v) => !Number.isNaN(v));
      if (vals.length) ranges[col.name] = { min: Math.min(...vals), max: Math.max(...vals) };
    }
    return ranges;
  }, [rows, columns, heatmapEnabled]);

  const cellHeatmapStyle = useCallback(
    (colName: string, value: unknown): React.CSSProperties => {
      if (!heatmapEnabled) return {};
      const range = columnRanges[colName];
      if (!range || range.max === range.min) return {};
      const ratio = (Number(value) - range.min) / (range.max - range.min);
      if (Number.isNaN(ratio)) return {};
      const hue = ratio * 120; // 0=red, 120=green
      return { backgroundColor: `hsla(${hue}, 70%, 45%, 0.15)` };
    },
    [heatmapEnabled, columnRanges],
  );

  // ─── Desktop menu wiring (app-command bus + page registry) ───────────────────
  // Surfaces the four views in the window's Affichage menu and lets the Fichier /
  // Données / Affichage menus drive the existing import, export, refresh, panel
  // and table-option handlers.
  const windowId = useWindowId();
  useRegisterPages(
    windowId,
    [
      { id: "table", label: "Tableau", icon: Table2 },
      { id: "cards", label: "Cartes", icon: Grid3X3 },
      { id: "analytics", label: "Graphiques", icon: BarChart2 },
      { id: "sql", label: "SQL", icon: Code2 },
    ],
    viewMode,
  );
  useAppCommands("data-browser", {
    navigate: (payload) => {
      const pageId = (payload as { pageId?: string } | undefined)?.pageId;
      if (pageId === "table" || pageId === "cards" || pageId === "analytics" || pageId === "sql") {
        setViewMode(pageId);
      }
    },
    import: () => setUploadPanelOpen(true),
    export: (payload) => {
      const kind = (payload as { kind?: "csv" | "xlsx" | "json" } | undefined)?.kind ?? "csv";
      if (kind === "xlsx") void exportExcel();
      else if (kind === "json") void exportJSON();
      else void exportData("csv");
    },
    refresh: () => {
      countCacheRef.current.clear();
      void fetchRows();
    },
    "toggle-filters": () => setFilterPanelOpen((prev) => !prev),
    "toggle-columns": () => setColPanelOpen((prev) => !prev),
    "run-sql": () => {
      setViewMode("sql");
      void runCustomQuery();
    },
    "toggle-row-numbers": () => setShowRowNumbers((prev) => !prev),
    "toggle-compact": () => setCompactMode((prev) => !prev),
    "toggle-zebra": () => setZebraStripes((prev) => !prev),
    "toggle-heatmap": () => setHeatmapEnabled((prev) => !prev),
    "toggle-fullscreen": () => setFullscreen((prev) => !prev),
  });

  // ── Render ──
  const pageContainerClass = cn(
    " flex h-full min-h-full flex-col overflow-hidden text-foreground transition-all duration-300",
    fullscreen && "fixed inset-0 z-50",
  );

  const rowHeight = compactMode ? 28 : 40;

  return (
    <div className={pageContainerClass}>
      {/* ── Header ─────────────────────────────────── */}
      <div className=" flex-none px-4 py-2.5">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Title */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-none">
              <Database className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-zinc-100 leading-none">Data Browser</h1>
              {dbReady && (
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  {totalRows.toLocaleString()} rows · {columns.filter((c) => c.visible).length} cols
                  {queryTime != null && ` · ${queryTime}ms`}
                </p>
              )}
            </div>
          </div>

          <DBStatusBadge initialized={dbReady} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={cn(
                  "h-8 w-8",
                  uploadPanelOpen && "border-primary/50 bg-primary/10 text-primary",
                )}
                aria-label="Upload file"
                onClick={() => setUploadPanelOpen(!uploadPanelOpen)}
              >
                <Upload className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Upload file</TooltipContent>
          </Tooltip>
          {dbReady && (
            <Select
              value={activeTable}
              onValueChange={async (v) => {
                if (!v) return;
                const selectedDataset = datasetCatalog.find((dataset) =>
                  datasetMatchesName(dataset, v),
                );
                if (selectedDataset) {
                  await switchToDataset(selectedDataset);
                }
              }}
            >
              <SelectTrigger className="h-8 w-44 text-xs bg-zinc-900 border-zinc-800">
                <Database className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
                <SelectValue placeholder="Select table…" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                {datasetCatalog.map((dataset) => (
                  <SelectItem key={dataset.id} value={dataset.viewName} className="text-xs">
                    {getDatasetLabel(dataset)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex-1" />

          {/* View mode */}
          <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-0.5 border border-zinc-800">
            {(
              [
                {
                  mode: "table",
                  icon: <Table2 className="h-3.5 w-3.5" />,
                  label: "Table",
                },
                {
                  mode: "cards",
                  icon: <Grid3X3 className="h-3.5 w-3.5" />,
                  label: "Cards",
                },
                {
                  mode: "analytics",
                  icon: <BarChart2 className="h-3.5 w-3.5" />,
                  label: "Charts",
                },
                {
                  mode: "sql",
                  icon: <Code2 className="h-3.5 w-3.5" />,
                  label: "SQL",
                },
              ] as const
            ).map(({ mode, icon, label }) => (
              <Button
                type="button"
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                  viewMode === mode
                    ? "bg-zinc-700 text-zinc-100 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                {icon}
                <span className="hidden sm:inline">{label}</span>
              </Button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <Input
              placeholder="Search rows..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchHighlight(e.target.value.length > 0);
              }}
              className="pl-8 h-8 w-48 text-xs bg-zinc-900 border-zinc-800 focus:border-emerald-500/50"
            />
            {searchQuery && (
              <Button
                onClick={() => {
                  setSearchQuery("");
                  setSearchHighlight(false);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                <X className="h-3 w-3 text-zinc-500 hover:text-zinc-300" />
              </Button>
            )}
          </div>

          {/* Filter */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={cn(
                  "h-8 w-8",
                  filterGroup.rules.filter((r) => r.active).length > 0 &&
                    "border-success/50 bg-success/10 text-success",
                )}
                aria-label="Filters"
                onClick={() => setFilterPanelOpen(!filterPanelOpen)}
              >
                <Filter className="h-3.5 w-3.5" />
                {filterGroup.rules.filter((r) => r.active).length > 0 && (
                  <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-success text-[8px] flex items-center justify-center text-success-foreground font-bold">
                    {filterGroup.rules.filter((r) => r.active).length}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Filters</TooltipContent>
          </Tooltip>

          {/* Column manager */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                aria-label="Columns"
                onClick={() => setColPanelOpen(!colPanelOpen)}
              >
                <Columns3 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Columns</TooltipContent>
          </Tooltip>

          {/* Export */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 transition-colors text-zinc-300">
              <Download className="h-3.5 w-3.5" />
              Export
              <ChevronDown className="h-3 w-3 text-zinc-500" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
              <div className="px-2 py-1.5 text-xs text-zinc-500 font-medium">
                {selectedRows.size > 0
                  ? `${selectedRows.size} selected rows`
                  : `All ${totalRows.toLocaleString()} filtered rows`}
              </div>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem
                onClick={() => exportData("csv")}
                className="text-sm gap-2 text-zinc-300 focus:bg-zinc-800"
              >
                <FileText className="h-3.5 w-3.5 text-zinc-500" />
                CSV (.csv)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={exportExcel}
                className="text-sm gap-2 text-zinc-300 focus:bg-zinc-800"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" />
                Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={exportJSON}
                className="text-sm gap-2 text-zinc-300 focus:bg-zinc-800"
              >
                <FileJson className="h-3.5 w-3.5 text-blue-400" />
                JSON (.json)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Settings */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 transition-colors text-zinc-300">
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 w-52">
              <div className="px-2 py-1.5 text-xs text-zinc-500 font-medium">Table Options</div>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <div className="px-2 py-1.5 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-zinc-300">Row Numbers</Label>
                  <Switch
                    checked={showRowNumbers}
                    onCheckedChange={setShowRowNumbers}
                    className="scale-75"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-zinc-300">Compact Mode</Label>
                  <Switch
                    checked={compactMode}
                    onCheckedChange={setCompactMode}
                    className="scale-75"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-zinc-300">Zebra Stripes</Label>
                  <Switch
                    checked={zebraStripes}
                    onCheckedChange={setZebraStripes}
                    className="scale-75"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-zinc-300">Fullscreen</Label>
                  <Switch
                    checked={fullscreen}
                    onCheckedChange={setFullscreen}
                    className="scale-75"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-zinc-300">Heatmap colors</Label>
                  <Switch
                    checked={heatmapEnabled}
                    onCheckedChange={setHeatmapEnabled}
                    className="scale-75"
                  />
                </div>
              </div>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <div className="px-2 py-1.5">
                <Label className="text-xs text-zinc-500 block mb-1.5">Page Size</Label>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => {
                    if (!v) return;
                    setPageSize(Number(v));
                    setPage(0);
                  }}
                >
                  <SelectTrigger className="h-7 text-xs bg-zinc-800 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {PAGE_SIZES.map((s) => (
                      <SelectItem key={s} value={String(s)} className="text-xs">
                        {s} rows
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 border-zinc-800 bg-zinc-900"
            aria-label="Refresh rows"
            onClick={() => {
              // Force a fresh count + page on manual refresh.
              countCacheRef.current.clear();
              void fetchRows();
            }}
            disabled={queryLoading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", queryLoading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* ── Toolbar row 2: active filters + sorts ── */}
      <AnimatePresence>
        {(filterGroup.rules.filter((r) => r.active).length > 0 || sorts.length > 0) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex-none border-b border-zinc-800/60 bg-zinc-900/50 px-4 py-1.5 overflow-hidden"
          >
            <div className="flex items-center gap-2 flex-wrap">
              {sorts.map((s) => (
                <Badge
                  key={s.column}
                  variant="outline"
                  className="gap-1 text-[11px] border-blue-500/30 bg-blue-500/10 text-blue-300"
                >
                  {s.direction === "asc" ? (
                    <ArrowUp className="h-2.5 w-2.5" />
                  ) : (
                    <ArrowDown className="h-2.5 w-2.5" />
                  )}
                  {s.column}
                  <Button
                    onClick={() => setSorts((prev) => prev.filter((x) => x.column !== s.column))}
                  >
                    <X className="h-2.5 w-2.5 ml-0.5 opacity-60 hover:opacity-100" />
                  </Button>
                </Badge>
              ))}
              {filterGroup.rules
                .filter((r) => r.active)
                .map((r) => (
                  <Badge
                    key={r.id}
                    variant="outline"
                    className="gap-1 text-[11px] border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  >
                    <Filter className="h-2.5 w-2.5" />
                    {r.column} {OPERATOR_LABELS[r.operator]} {r.value}
                    <Button
                      onClick={() =>
                        setFilterGroup((prev) =>
                          produce(prev, (draft) => {
                            const idx = draft.rules.findIndex((x) => x.id === r.id);
                            if (idx !== -1) draft.rules.splice(idx, 1);
                          }),
                        )
                      }
                    >
                      <X className="h-2.5 w-2.5 ml-0.5 opacity-60 hover:opacity-100" />
                    </Button>
                  </Badge>
                ))}
              {(filterGroup.rules.filter((r) => r.active).length > 0 || sorts.length > 0) && (
                <Button
                  className="text-[11px] text-zinc-500 hover:text-zinc-300"
                  onClick={() => {
                    setSorts([]);
                    setFilterGroup((prev) =>
                      produce(prev, (draft) => {
                        draft.rules = [];
                      }),
                    );
                  }}
                >
                  Clear all
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* ── Inline Upload Panel ── */}
      <AnimatePresence>
        {uploadPanelOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex-none border-b border-zinc-800 bg-zinc-950 overflow-hidden"
          >
            <div className="px-4 py-4">
              <div className="max-w-2xl mx-auto">
                {!uploadingFile ? (
                  <button
                    type="button"
                    onDragOver={(e) => {
                      e.preventDefault();
                      setUploadDragging(true);
                    }}
                    onDragLeave={() => setUploadDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setUploadDragging(false);
                      const file = e.dataTransfer.files[0];
                      if (file) handleBrowserUpload(file);
                    }}
                    onClick={handleNativeUpload}
                    className={cn(
                      "w-full border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-all",
                      uploadDragging
                        ? "border-blue-500 bg-blue-500/5 scale-[1.01]"
                        : "border-zinc-700 hover:border-zinc-600 hover:bg-zinc-900/50",
                    )}
                  >
                    <motion.div
                      animate={uploadDragging ? { scale: 1.1, y: -4 } : { scale: 1, y: 0 }}
                      className={cn(
                        "h-12 w-12 rounded-xl flex items-center justify-center",
                        uploadDragging
                          ? "bg-blue-500/20 border border-blue-500/40"
                          : "bg-zinc-800 border border-zinc-700",
                      )}
                    >
                      <Upload
                        className={cn(
                          "h-5 w-5",
                          uploadDragging ? "text-blue-400" : "text-zinc-500",
                        )}
                      />
                    </motion.div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-zinc-200">
                        {uploadDragging ? "Drop detected" : "Click to choose a trusted local file"}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">
                        Use the Upload screen for path-based DuckDB import
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {[{ ext: "CSV", color: "emerald" }].map(({ ext, color }) => (
                        <Badge
                          key={ext}
                          variant="outline"
                          className={cn(
                            "text-[11px]",
                            color === "emerald" && "border-emerald-500/30 text-emerald-400",
                            color === "blue" && "border-blue-500/30 text-blue-400",
                            color === "green" && "border-green-500/30 text-green-400",
                          )}
                        >
                          .{ext}
                        </Badge>
                      ))}
                    </div>
                  </button>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "h-9 w-9 rounded-lg flex items-center justify-center flex-none",
                          uploadingFile.status === "done" && "bg-emerald-500/10",
                          uploadingFile.status === "error" && "bg-red-500/10",
                          !["done", "error"].includes(uploadingFile.status) && "bg-blue-500/10",
                        )}
                      >
                        {uploadingFile.status === "done" && (
                          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        )}
                        {uploadingFile.status === "error" && (
                          <XCircle className="h-5 w-5 text-red-400" />
                        )}
                        {!["done", "error"].includes(uploadingFile.status) && (
                          <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-200 truncate">
                          {uploadingFile.name}
                        </p>
                        <p
                          className={cn(
                            "text-xs mt-0.5 capitalize",
                            uploadingFile.status === "done" && "text-emerald-400",
                            uploadingFile.status === "error" && "text-red-400",
                            !["done", "error"].includes(uploadingFile.status) && "text-blue-400",
                          )}
                        >
                          {uploadingFile.status === "loading_db"
                            ? "Loading into DuckDB…"
                            : uploadingFile.status === "done"
                              ? "Ready — table switched!"
                              : uploadingFile.status === "error"
                                ? uploadingFile.error
                                : `${uploadingFile.status}…`}
                        </p>
                      </div>
                      {uploadingFile.status === "error" && (
                        <Button onClick={() => setUploadingFile(null)}>
                          <X className="h-4 w-4 text-zinc-500 hover:text-zinc-300" />
                        </Button>
                      )}
                    </div>
                    {uploadingFile.status !== "error" && (
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <motion.div
                          animate={{ width: `${uploadingFile.progress}%` }}
                          transition={{ duration: 0.3 }}
                          className={cn(
                            "h-full rounded-full",
                            uploadingFile.status === "done"
                              ? "bg-emerald-500"
                              : "bg-linear-to-r from-blue-600 to-blue-400",
                          )}
                        />
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* ── Selection Stats Bar ── */}
      <AnimatePresence>
        {selectedRows.size > 0 && selectionStats && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex-none border-b border-zinc-800/60 bg-zinc-900/30 px-4 py-1.5 overflow-hidden"
          >
            <div className="flex items-center gap-4">
              <span className="text-xs text-zinc-400 font-medium">
                {selectedRows.size} rows selected
              </span>
              {selectionStats.map((s) => (
                <div key={s.col} className="flex items-center gap-3 text-[11px]">
                  <span className="text-zinc-500">{s.col}:</span>
                  <span className="text-emerald-400">
                    Σ{" "}
                    {s.sum.toLocaleString("en-US", {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <span className="text-blue-400">
                    avg{" "}
                    {s.avg.toLocaleString("en-US", {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              ))}
              {editedCells.size > 0 && (
                <Button
                  className="text-[11px] bg-amber-600/20 text-amber-300 hover:bg-amber-600/30 border border-amber-500/30 rounded px-2 py-0.5"
                  onClick={() => setEditedCells(new Map())}
                >
                  Save changes ({editedCells.size} edited)
                </Button>
              )}
              <Button
                className="ml-auto text-[11px] text-zinc-500 hover:text-zinc-300"
                onClick={() => setSelectedRows(new Set())}
              >
                Clear selection
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Body ────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* ── Filter Panel ── */}
        <AnimatePresence>
          {filterPanelOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="flex-none border-r border-zinc-800 bg-zinc-950 overflow-hidden"
            >
              <div className="w-80 h-full flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                  <h2 className="text-sm font-medium text-zinc-100">Filters</h2>
                  <div className="flex items-center gap-2">
                    <Select
                      value={filterGroup.logic}
                      onValueChange={(v) =>
                        v &&
                        setFilterGroup((prev) =>
                          produce(prev, (draft) => {
                            draft.logic = v as "AND" | "OR";
                          }),
                        )
                      }
                    >
                      <SelectTrigger className="h-6 text-xs w-16 bg-zinc-900 border-zinc-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800">
                        <SelectItem value="AND" className="text-xs">
                          AND
                        </SelectItem>
                        <SelectItem value="OR" className="text-xs">
                          OR
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Button onClick={() => setFilterPanelOpen(false)}>
                      <X className="h-4 w-4 text-zinc-500 hover:text-zinc-300" />
                    </Button>
                  </div>
                </div>

                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-3">
                    {filterGroup.rules.map((rule) => (
                      <motion.div
                        key={rule.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="bg-zinc-900 rounded-lg border border-zinc-800 p-3 space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={rule.active}
                            onCheckedChange={(v) =>
                              setFilterGroup((prev) =>
                                produce(prev, (draft) => {
                                  const r = draft.rules.find((x) => x.id === rule.id);
                                  if (r) r.active = Boolean(v);
                                }),
                              )
                            }
                          />
                          <Select
                            value={rule.column}
                            onValueChange={(v) =>
                              v &&
                              setFilterGroup((prev) =>
                                produce(prev, (draft) => {
                                  const r = draft.rules.find((x) => x.id === rule.id);
                                  if (r) r.column = v;
                                }),
                              )
                            }
                          >
                            <SelectTrigger className="h-7 text-xs flex-1 bg-zinc-800 border-zinc-700">
                              <SelectValue placeholder="Column" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800">
                              {columns
                                .filter((c) => c.filterable)
                                .map((c) => (
                                  <SelectItem key={c.id} value={c.name} className="text-xs">
                                    {c.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <Button
                            onClick={() =>
                              setFilterGroup((prev) =>
                                produce(prev, (draft) => {
                                  draft.rules = draft.rules.filter((x) => x.id !== rule.id);
                                }),
                              )
                            }
                          >
                            <X className="h-3.5 w-3.5 text-zinc-500 hover:text-red-400" />
                          </Button>
                        </div>

                        <Select
                          value={rule.operator}
                          onValueChange={(v) =>
                            v &&
                            setFilterGroup((prev) =>
                              produce(prev, (draft) => {
                                const r = draft.rules.find((x) => x.id === rule.id);
                                if (r) r.operator = v as FilterRule["operator"];
                              }),
                            )
                          }
                        >
                          <SelectTrigger className="h-7 text-xs bg-zinc-800 border-zinc-700">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800">
                            {Object.entries(OPERATOR_LABELS).map(([op, label]) => (
                              <SelectItem key={op} value={op} className="text-xs">
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {rule.operator !== "is_null" && rule.operator !== "is_not_null" && (
                          <Input
                            value={rule.value}
                            onChange={(e) =>
                              setFilterGroup((prev) =>
                                produce(prev, (draft) => {
                                  const r = draft.rules.find((x) => x.id === rule.id);
                                  if (r) r.value = e.target.value;
                                }),
                              )
                            }
                            placeholder="Value..."
                            className="h-7 text-xs bg-zinc-800 border-zinc-700"
                          />
                        )}

                        {rule.operator === "between" && (
                          <Input
                            value={rule.value2 ?? ""}
                            onChange={(e) =>
                              setFilterGroup((prev) =>
                                produce(prev, (draft) => {
                                  const r = draft.rules.find((x) => x.id === rule.id);
                                  if (r) r.value2 = e.target.value;
                                }),
                              )
                            }
                            placeholder="To value..."
                            className="h-7 text-xs bg-zinc-800 border-zinc-700"
                          />
                        )}
                      </motion.div>
                    ))}
                  </div>
                </ScrollArea>

                {/* Saved filters (Dexie, per dataset) */}
                {savedFilterGroups.length > 0 && (
                  <div className="px-4 py-2 border-t border-zinc-800 space-y-1">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wide">
                      Saved filters
                    </p>
                    {savedFilterGroups.map((f) => (
                      <div key={f.id} className="flex items-center gap-1">
                        <Button
                          className="flex-1 text-left text-[11px] text-zinc-300 hover:text-emerald-300 truncate px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800"
                          onClick={() => handleApplyFilter(f)}
                        >
                          {f.name} ({f.group.rules.length})
                        </Button>
                        <Button
                          onClick={() => void handleDeleteSaved(f.id, "filter")}
                          className="h-5 w-5 flex items-center justify-center rounded hover:bg-zinc-700"
                        >
                          <X className="h-3 w-3 text-zinc-600 hover:text-red-400" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-4 border-t border-zinc-800 space-y-2">
                  <Button
                    size="sm"
                    className="w-full h-8 text-xs bg-emerald-600 hover:bg-emerald-500"
                    onClick={() =>
                      setFilterGroup((prev) =>
                        produce(prev, (draft) => {
                          draft.rules.push({
                            id: `r${Date.now()}`,
                            column: columns[0]?.name ?? "",
                            operator: "contains",
                            value: "",
                            active: true,
                          });
                        }),
                      )
                    }
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Rule
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-8 text-xs border-zinc-800"
                      disabled={filterGroup.rules.length === 0}
                      onClick={handleSaveFilter}
                    >
                      <Star className="h-3.5 w-3.5 mr-1" />
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-8 text-xs border-zinc-800"
                      onClick={() =>
                        setFilterGroup((prev) =>
                          produce(prev, (draft) => {
                            draft.rules = [];
                          }),
                        )
                      }
                    >
                      Clear All
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Content Area ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Loading overlay when DB initializing */}
          {dbLoading && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-950">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="h-16 w-16 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin" />
                  <Database className="absolute inset-0 m-auto h-7 w-7 text-emerald-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-zinc-200">Initializing native DuckDB</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Opening the catalog-backed dataset view…
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── TABLE VIEW ── */}
          {viewMode === "table" && (
            <div className="flex-1 flex overflow-hidden relative">
              {queryLoading && <LoadingOverlay />}

              <div className="flex-1 overflow-hidden flex flex-col">
                {/* Table header */}
                <div
                  className="flex-none overflow-hidden border-b border-zinc-800 bg-zinc-900/50"
                  style={{ paddingRight: "0px" }}
                >
                  <div className="flex items-stretch" style={{ minWidth: "fit-content" }}>
                    {/* Row number header */}
                    {showRowNumbers && (
                      <div className="flex-none w-10 flex items-center justify-center border-r border-zinc-800 bg-zinc-900">
                        <Checkbox
                          checked={rows.length > 0 && selectedRows.size === rows.length}
                          onCheckedChange={selectAll}
                          className="h-3.5 w-3.5"
                        />
                      </div>
                    )}

                    {/* Pinned left columns */}
                    {visibleColumns
                      .filter((c) => c.pinned === "left")
                      .map((col) => (
                        <ColumnHeader
                          key={col.id}
                          col={col}
                          sorts={sorts}
                          activeColStats={activeColStats}
                          onSort={handleSort}
                          onStats={() =>
                            setActiveColStats(activeColStats === col.id ? null : col.id)
                          }
                          onResize={(e) => startResize(col.id, e)}
                          onPin={(dir) =>
                            setColumns((prev) =>
                              produce(prev, (draft) => {
                                const c = draft.find((x) => x.id === col.id);
                                if (c) c.pinned = c.pinned === dir ? null : dir;
                              }),
                            )
                          }
                          onHide={() =>
                            setColumns((prev) =>
                              produce(prev, (draft) => {
                                const c = draft.find((x) => x.id === col.id);
                                if (c) c.visible = false;
                              }),
                            )
                          }
                          pinned
                        />
                      ))}

                    {/* Regular columns */}
                    {visibleColumns
                      .filter((c) => c.pinned !== "left" && c.pinned !== "right")
                      .map((col) => (
                        <ColumnHeader
                          key={col.id}
                          col={col}
                          sorts={sorts}
                          activeColStats={activeColStats}
                          onSort={handleSort}
                          onStats={() =>
                            setActiveColStats(activeColStats === col.id ? null : col.id)
                          }
                          onResize={(e) => startResize(col.id, e)}
                          onPin={(dir) =>
                            setColumns((prev) =>
                              produce(prev, (draft) => {
                                const c = draft.find((x) => x.id === col.id);
                                if (c) c.pinned = c.pinned === dir ? null : dir;
                              }),
                            )
                          }
                          onHide={() =>
                            setColumns((prev) =>
                              produce(prev, (draft) => {
                                const c = draft.find((x) => x.id === col.id);
                                if (c) c.visible = false;
                              }),
                            )
                          }
                          pinned={false}
                        />
                      ))}

                    {/* Pinned right columns */}
                    {visibleColumns
                      .filter((c) => c.pinned === "right")
                      .map((col) => (
                        <ColumnHeader
                          key={col.id}
                          col={col}
                          sorts={sorts}
                          activeColStats={activeColStats}
                          onSort={handleSort}
                          onStats={() =>
                            setActiveColStats(activeColStats === col.id ? null : col.id)
                          }
                          onResize={(e) => startResize(col.id, e)}
                          onPin={(dir) =>
                            setColumns((prev) =>
                              produce(prev, (draft) => {
                                const c = draft.find((x) => x.id === col.id);
                                if (c) c.pinned = c.pinned === dir ? null : dir;
                              }),
                            )
                          }
                          onHide={() =>
                            setColumns((prev) =>
                              produce(prev, (draft) => {
                                const c = draft.find((x) => x.id === col.id);
                                if (c) c.visible = false;
                              }),
                            )
                          }
                          pinned
                        />
                      ))}
                  </div>
                </div>

                {/* Column stats panel */}
                <AnimatePresence>
                  {activeColStats && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="flex-none border-b border-zinc-800 bg-zinc-900/30 overflow-hidden"
                    >
                      <div className="flex items-start gap-3 p-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-medium text-zinc-200">
                              {activeColStats}
                            </span>
                            <ColumnTypeChip
                              type={columns.find((c) => c.id === activeColStats)?.type ?? "string"}
                            />
                            <Button onClick={() => setActiveColStats(null)} className="ml-auto">
                              <X className="h-3.5 w-3.5 text-zinc-500 hover:text-zinc-300" />
                            </Button>
                          </div>
                          <ColumnStatPanel
                            stats={
                              columnStats[activeColStats] ?? {
                                loading: true,
                                min: null,
                                max: null,
                                avg: null,
                                nullCount: 0,
                                distinctCount: 0,
                                histogram: [],
                              }
                            }
                            colDef={
                              columns.find((c) => c.id === activeColStats) ?? {
                                id: "",
                                name: "",
                                type: "string",
                                width: 120,
                                visible: true,
                                pinned: null,
                                sortable: true,
                                filterable: true,
                                dbType: "",
                              }
                            }
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Virtual table rows */}
                <div
                  ref={tableContainerRef}
                  className="flex-1 overflow-auto scrollbar-thin scrollbar-track-zinc-950 scrollbar-thumb-zinc-800"
                  style={{
                    cursor: resizingCol ? "col-resize" : "default",
                  }}
                >
                  <div
                    style={{
                      height: `${rowVirtualizer.getTotalSize()}px`,
                      width: "100%",
                      position: "relative",
                    }}
                  >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const rowData = rows[virtualRow.index];
                      if (!rowData) return null;

                      const isSelected = selectedRows.has(virtualRow.index);
                      const isStarred = starredKeys.has(rowStableKey(rowData));
                      const isZebra = zebraStripes && virtualRow.index % 2 === 1;

                      return (
                        <div
                          key={virtualRow.key}
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: `${virtualRow.size}px`,
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                          role="button"
                          tabIndex={0}
                          onClick={(e) => toggleRow(virtualRow.index, e)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleRow(virtualRow.index, e);
                            }
                          }}
                          className={cn(
                            "flex items-stretch border-b border-zinc-800/30 group transition-colors cursor-pointer",
                            isSelected && "bg-emerald-500/10 border-emerald-500/10",
                            !isSelected && isZebra && "bg-zinc-900/30",
                            !isSelected && !isZebra && "bg-transparent",
                            "hover:bg-zinc-800/40",
                          )}
                        >
                          {/* Row number */}
                          {showRowNumbers && (
                            <div
                              className={cn(
                                "flex-none w-10 flex items-center justify-center border-r border-zinc-800/30 text-[10px] text-zinc-600 font-mono",
                                isSelected && "text-emerald-400/60",
                              )}
                              style={{ height: rowHeight }}
                            >
                              {isStarred ? (
                                <Star className="h-3 w-3 text-amber-400" />
                              ) : (
                                page * pageSize + virtualRow.index + 1
                              )}
                            </div>
                          )}

                          {/* Cells */}
                          {visibleColumns.map((col) => {
                            const cellKey = `${virtualRow.index}-${col.id}`;
                            const rawValue = rowData[col.name];
                            const isEdited = editedCells.has(cellKey);
                            const displayValue = isEdited ? editedCells.get(cellKey) : rawValue;
                            const formatted = formatCellValue(displayValue, col.type);
                            const isFocused =
                              focusedCell?.rowIdx === virtualRow.index &&
                              focusedCell?.colId === col.id;
                            const isEditing =
                              editingCell?.rowIdx === virtualRow.index &&
                              editingCell?.colId === col.id;

                            const heatStyle =
                              col.type === "number" ? cellHeatmapStyle(col.name, displayValue) : {};

                            return (
                              <div
                                key={col.id}
                                className={cn(
                                  "relative flex items-center px-3 border-r border-zinc-800/20 text-xs font-mono truncate",
                                  col.type === "number" && "justify-end text-emerald-300",
                                  col.type === "boolean" && "justify-center",
                                  col.type === "date" && "text-purple-300",
                                  col.type === "email" && "text-blue-300",
                                  !displayValue && "text-zinc-600 italic",
                                  isFocused && "outline outline-1 outline-blue-500 bg-blue-500/5",
                                  isEdited && !isEditing && "bg-amber-500/10",
                                )}
                                style={{
                                  width: col.width,
                                  minWidth: col.width,
                                  maxWidth: col.width,
                                  height: rowHeight,
                                  ...(!isEdited ? heatStyle : {}),
                                }}
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFocusedCell({
                                    rowIdx: virtualRow.index,
                                    colId: col.id,
                                  });
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setFocusedCell({
                                      rowIdx: virtualRow.index,
                                      colId: col.id,
                                    });
                                  }
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  setEditingCell({ rowIdx: virtualRow.index, colId: col.id });
                                  setEditValue(displayValue == null ? "" : String(displayValue));
                                }}
                              >
                                {isEditing ? (
                                  <input
                                    ref={(el) => el?.focus()}
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        setEditedCells((prev) => {
                                          const next = new Map(prev);
                                          next.set(cellKey, editValue);
                                          return next;
                                        });
                                        setEditingCell(null);
                                      } else if (e.key === "Escape") {
                                        setEditingCell(null);
                                      }
                                    }}
                                    onBlur={() => {
                                      setEditedCells((prev) => {
                                        const next = new Map(prev);
                                        next.set(cellKey, editValue);
                                        return next;
                                      });
                                      setEditingCell(null);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="absolute inset-0 w-full h-full px-3 text-xs font-mono bg-zinc-800 border border-blue-500 outline-none text-zinc-100 z-10"
                                  />
                                ) : displayValue === null || displayValue === undefined ? (
                                  <span className="text-zinc-700 text-[10px]">NULL</span>
                                ) : col.type === "boolean" ? (
                                  <span
                                    className={cn(
                                      "h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold",
                                      String(displayValue) === "true"
                                        ? "bg-emerald-500/20 text-emerald-400"
                                        : "bg-zinc-700 text-zinc-500",
                                    )}
                                  >
                                    {String(displayValue) === "true" ? "T" : "F"}
                                  </span>
                                ) : searchHighlight && searchQuery ? (
                                  highlightText(formatted)
                                ) : (
                                  formatted
                                )}
                              </div>
                            );
                          })}

                          {/* Row actions (on hover) */}
                          <div className="flex-none flex items-center gap-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleStar(rowData);
                              }}
                              className="h-5 w-5 flex items-center justify-center rounded hover:bg-zinc-700"
                            >
                              {isStarred ? (
                                <Star className="h-3 w-3 text-amber-400" />
                              ) : (
                                <StarOff className="h-3 w-3 text-zinc-600" />
                              )}
                            </Button>
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRowDetailRow(rowData);
                              }}
                              className="h-5 w-5 flex items-center justify-center rounded hover:bg-zinc-700"
                            >
                              <Maximize2 className="h-3 w-3 text-zinc-600" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ── Column Manager Panel ── */}
              <AnimatePresence>
                {colPanelOpen && (
                  <motion.div
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 260, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    className="flex-none border-l border-zinc-800 bg-zinc-950 overflow-hidden"
                  >
                    <div className="w-64 h-full flex flex-col">
                      <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800">
                        <span className="text-xs font-medium text-zinc-200">
                          Columns ({columns.filter((c) => c.visible).length}/{columns.length})
                        </span>
                        <Button onClick={() => setColPanelOpen(false)}>
                          <X className="h-3.5 w-3.5 text-zinc-500" />
                        </Button>
                      </div>
                      <div className="px-3 py-2 border-b border-zinc-800">
                        <Input
                          placeholder="Search columns..."
                          value={columnSearch}
                          onChange={(e) => setColumnSearch(e.target.value)}
                          className="h-7 text-xs bg-zinc-900 border-zinc-800"
                        />
                      </div>
                      <ScrollArea className="flex-1">
                        <div className="p-2 space-y-0.5">
                          {columns
                            .filter(
                              (c) =>
                                !columnSearch ||
                                c.name.toLowerCase().includes(columnSearch.toLowerCase()),
                            )
                            .map((col) => (
                              <div
                                key={col.id}
                                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-900 group"
                              >
                                <Checkbox
                                  checked={col.visible}
                                  onCheckedChange={(v) =>
                                    setColumns((prev) =>
                                      produce(prev, (draft) => {
                                        const c = draft.find((x) => x.id === col.id);
                                        if (c) c.visible = Boolean(v);
                                      }),
                                    )
                                  }
                                  className="h-3.5 w-3.5"
                                />
                                <span className="text-xs text-zinc-300 flex-1 truncate">
                                  {col.name}
                                </span>
                                <ColumnTypeChip type={col.type} />
                                <Button
                                  className="opacity-0 group-hover:opacity-100"
                                  onClick={() =>
                                    setActiveColStats(activeColStats === col.id ? null : col.id)
                                  }
                                >
                                  <Activity className="h-3 w-3 text-zinc-500 hover:text-zinc-300" />
                                </Button>
                              </div>
                            ))}
                        </div>
                      </ScrollArea>
                      <div className="p-3 border-t border-zinc-800 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-7 text-xs border-zinc-800"
                          onClick={() =>
                            setColumns((prev) =>
                              produce(prev, (draft) => {
                                draft.forEach((c) => {
                                  c.visible = true;
                                });
                              }),
                            )
                          }
                        >
                          Show All
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-7 text-xs border-zinc-800"
                          onClick={() =>
                            setColumns((prev) =>
                              produce(prev, (draft) => {
                                draft.forEach((c, i) => {
                                  c.visible = i < 5;
                                });
                              }),
                            )
                          }
                        >
                          Reset
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* ── CARDS VIEW ── */}
          {viewMode === "cards" && (
            <div ref={cardsContainerRef} className="flex-1 overflow-auto p-4 relative">
              {queryLoading && <LoadingOverlay />}
              {/* Single container fade — no per-item staggered delay (which made
                  every card animate independently with no virtualization). */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15 }}
                style={{ height: `${cardRowVirtualizer.getTotalSize()}px`, position: "relative" }}
              >
                {cardRowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const start = virtualRow.index * cardColumns;
                  const rowSlice = rows.slice(start, start + cardColumns);
                  return (
                    <div
                      key={virtualRow.key}
                      className="grid gap-3"
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start}px)`,
                        gridTemplateColumns: `repeat(${cardColumns}, minmax(0, 1fr))`,
                      }}
                    >
                      {rowSlice.map((row, offset) => {
                        const i = start + offset;
                        return (
                          <div
                            key={i}
                            className={cn(
                              "bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 cursor-pointer transition-all hover:shadow-lg hover:shadow-black/20",
                              selectedRows.has(i) && "border-emerald-500/50 bg-emerald-500/5",
                            )}
                            role="button"
                            tabIndex={0}
                            onClick={(e) => toggleRow(i, e)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleRow(i, e);
                              }
                            }}
                            onDoubleClick={() => setRowDetailRow(row)}
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-full bg-linear-to-br from-emerald-500/20 to-blue-500/20 flex items-center justify-center text-sm font-bold text-zinc-300">
                                  {String(row.first_name ?? row[Object.keys(row)[1]] ?? "?")[0]}
                                </div>
                                <div>
                                  <p className="text-xs font-medium text-zinc-200 leading-none">
                                    {String(row.first_name ?? "")} {String(row.last_name ?? "")}
                                  </p>
                                  <p className="text-[10px] text-zinc-500 mt-0.5">
                                    {String(row.department ?? row.email ?? "")}
                                  </p>
                                </div>
                              </div>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] border-0",
                                  String(row.status) === "Active"
                                    ? "bg-emerald-500/10 text-emerald-400"
                                    : String(row.status) === "Inactive"
                                      ? "bg-zinc-700 text-zinc-400"
                                      : "bg-amber-500/10 text-amber-400",
                                )}
                              >
                                {String(row.status ?? "")}
                              </Badge>
                            </div>

                            <div className="space-y-1.5">
                              {Object.entries(row)
                                .filter(([k]) =>
                                  [
                                    "revenue",
                                    "units_sold",
                                    "satisfaction_score",
                                    "country",
                                  ].includes(k),
                                )
                                .slice(0, 4)
                                .map(([k, v]) => (
                                  <div key={k} className="flex items-center justify-between">
                                    <span className="text-[10px] text-zinc-500 capitalize">
                                      {k.replace(/_/g, " ")}
                                    </span>
                                    <span className="text-[11px] font-mono text-zinc-300">
                                      {typeof v === "number"
                                        ? v.toLocaleString("en-US", {
                                            maximumFractionDigits: 2,
                                          })
                                        : String(v ?? "—")}
                                    </span>
                                  </div>
                                ))}
                            </div>

                            {typeof row.revenue === "number" && (
                              <div className="mt-3">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[9px] text-zinc-600 uppercase">
                                    Revenue
                                  </span>
                                  <span className="text-[10px] text-emerald-400 font-mono">
                                    ${Number(row.revenue).toLocaleString()}
                                  </span>
                                </div>
                                <Progress
                                  value={(Number(row.revenue) / 100000) * 100}
                                  className="h-1"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </motion.div>
            </div>
          )}

          {/* ── ANALYTICS VIEW (dataset-generic, real DuckDB + analysis worker) ── */}
          {viewMode === "analytics" && activeTable && (
            <AnalyticsView datasetId={activeTable} columns={columns} whereClause={composedWhere} />
          )}

          {/* ── SQL VIEW ── */}
          {viewMode === "sql" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-none border-b border-zinc-800 bg-zinc-900/30 px-3 py-2 flex items-center gap-2">
                <Code2 className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-xs font-medium text-zinc-300">SQL Editor</span>
                <span className="text-[10px] text-zinc-600">— Powered by native DuckDB</span>
                <div className="flex-1" />
                <div className="flex items-center gap-1.5">
                  {savedQueries.map((q) => (
                    <Tooltip key={q.id}>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={() => setSqlQuery(q.sql)}
                          className="text-[10px] text-zinc-500 hover:text-zinc-300 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors"
                        >
                          {q.name}
                          <X
                            className="h-2.5 w-2.5 ml-1 inline opacity-50 hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteSaved(q.id, "query");
                            }}
                          />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <pre className="text-[10px] whitespace-pre-wrap">{q.sql}</pre>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-zinc-800 gap-1.5"
                  onClick={handleSaveSql}
                  disabled={!dbReady || !sqlQuery.trim()}
                >
                  <Star className="h-3 w-3" />
                  Save
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 gap-1.5"
                  onClick={runCustomQuery}
                  disabled={queryLoading || !dbReady}
                >
                  {queryLoading ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <Zap className="h-3 w-3" />
                  )}
                  Run Query
                </Button>
              </div>

              <div className="h-52 flex-none border-b border-zinc-800 bg-zinc-950">
                <MonacoEditor
                  language="sql"
                  value={sqlQuery}
                  onChange={(v) => setSqlQuery(v ?? "")}
                  theme="vs-dark"
                  options={{
                    fontSize: 13,
                    fontFamily: "JetBrains Mono, Fira Code, monospace",
                    minimap: { enabled: false },
                    lineNumbers: "on",
                    wordWrap: "on",
                    scrollBeyondLastLine: false,
                    renderLineHighlight: "gutter",
                    suggestOnTriggerCharacters: true,
                    quickSuggestions: true,
                    padding: { top: 12, bottom: 12 },
                    scrollbar: {
                      verticalScrollbarSize: 4,
                      horizontalScrollbarSize: 4,
                    },
                  }}
                />
              </div>

              {/* Query status */}
              {(queryError || customQueryTime !== null) && (
                <div
                  className={cn(
                    "flex-none px-4 py-2 border-b border-zinc-800 flex items-center gap-2",
                    queryError ? "bg-red-950/30" : "bg-emerald-950/20",
                  )}
                >
                  {queryError ? (
                    <>
                      <AlertCircle className="h-3.5 w-3.5 text-red-400 flex-none" />
                      <span className="text-xs text-red-300 font-mono">{queryError}</span>
                    </>
                  ) : (
                    <>
                      <Zap className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-xs text-emerald-300">
                        Query executed in {customQueryTime}ms — {customQueryResult?.length ?? 0}{" "}
                        rows returned
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Results */}
              {customQueryResult && customQueryResult.length > 0 && (
                <div className="flex-1 overflow-auto">
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 bg-zinc-900 z-10">
                      <tr>
                        {customQueryCols.map((col) => (
                          <th
                            key={col}
                            className="px-3 py-2 text-left text-[11px] font-medium text-zinc-400 border-b border-r border-zinc-800 uppercase tracking-wide whitespace-nowrap"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {customQueryResult.slice(0, 500).map((row, i) => (
                        <tr key={i} className="hover:bg-zinc-900/60 border-b border-zinc-800/30">
                          {customQueryCols.map((col) => (
                            <td
                              key={col}
                              className="px-3 py-1.5 text-xs font-mono text-zinc-300 border-r border-zinc-800/20 whitespace-nowrap max-w-[200px] overflow-hidden text-ellipsis"
                            >
                              {row[col] === null || row[col] === undefined ? (
                                <span className="text-zinc-700">NULL</span>
                              ) : (
                                String(row[col])
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!customQueryResult && !queryLoading && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <Code2 className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
                    <p className="text-sm text-zinc-500">Write a SQL query and click Run</p>
                    <p className="text-xs text-zinc-600 mt-1">
                      Table: <code className="text-emerald-500/70">{activeTable}</code> (
                      {totalRows.toLocaleString()} rows)
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Pagination ─────────────────────────────── */}
      {viewMode !== "sql" && viewMode !== "analytics" && (
        <div className="flex-none border-t border-zinc-800 bg-zinc-950/95 px-4 py-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500 flex-none">
              {selectedRows.size > 0 ? (
                <span className="text-emerald-400">{selectedRows.size} selected · </span>
              ) : null}
              Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalRows)} of{" "}
              {totalRows.toLocaleString()} rows
            </span>

            <div className="flex-1" />

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 border-zinc-800 bg-zinc-900"
                disabled={page === 0}
                onClick={() => setPage(0)}
              >
                <ChevronsLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 border-zinc-800 bg-zinc-900"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 7) {
                    pageNum = i;
                  } else if (page < 4) {
                    pageNum = i < 5 ? i : i === 5 ? -1 : totalPages - 1;
                  } else if (page > totalPages - 5) {
                    pageNum = i === 0 ? 0 : i === 1 ? -1 : totalPages - 7 + i;
                  } else {
                    pageNum =
                      i === 0
                        ? 0
                        : i === 1
                          ? -1
                          : i === 5
                            ? -1
                            : i === 6
                              ? totalPages - 1
                              : page - 2 + i;
                  }

                  if (pageNum === -1) {
                    return (
                      <span key={`ellipsis-${i}`} className="text-xs text-zinc-600 px-1">
                        …
                      </span>
                    );
                  }

                  return (
                    <Button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={cn(
                        "h-7 w-7 text-xs rounded border transition-colors",
                        pageNum === page
                          ? "bg-emerald-600 border-emerald-500 text-white"
                          : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
                      )}
                    >
                      {pageNum + 1}
                    </Button>
                  );
                })}
              </div>

              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 border-zinc-800 bg-zinc-900"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 border-zinc-800 bg-zinc-900"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(totalPages - 1)}
              >
                <ChevronsRight className="h-3.5 w-3.5" />
              </Button>
            </div>

            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                if (!v) return;
                setPageSize(Number(v));
                setPage(0);
              }}
            >
              <SelectTrigger className="h-7 w-20 text-xs bg-zinc-900 border-zinc-800">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                {PAGE_SIZES.map((s) => (
                  <SelectItem key={s} value={String(s)} className="text-xs">
                    {s} / page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* ── Row Detail Drawer ── */}
      <AnimatePresence>
        {rowDetailRow && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50"
              onClick={() => setRowDetailRow(null)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 400 }}
              className="fixed right-0 top-0 bottom-0 w-96 bg-zinc-950 border-l border-zinc-800 z-50 flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-linear-to-br from-emerald-500/20 to-blue-500/20 flex items-center justify-center text-sm font-bold text-zinc-300">
                    {
                      String(
                        rowDetailRow.first_name ??
                          rowDetailRow[Object.keys(rowDetailRow)[1]] ??
                          "?",
                      )[0]
                    }
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-200">
                      {String(rowDetailRow.first_name ?? "")} {String(rowDetailRow.last_name ?? "")}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      Row #{String(rowDetailRow.id ?? "?")}
                    </p>
                  </div>
                </div>
                <Button onClick={() => setRowDetailRow(null)}>
                  <X className="h-4 w-4 text-zinc-500 hover:text-zinc-300" />
                </Button>
              </div>

              <ScrollArea className="flex-1 p-4">
                <div className="space-y-1.5">
                  {Object.entries(rowDetailRow).map(([key, value]) => {
                    const col = columns.find((c) => c.name === key);
                    return (
                      <div
                        key={key}
                        className="flex items-start justify-between py-2 border-b border-zinc-800/40 group"
                      >
                        <div className="min-w-0 flex-1 pr-4">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">
                              {key.replace(/_/g, " ")}
                            </span>
                            {col && <ColumnTypeChip type={col.type} />}
                          </div>
                          <p
                            className={cn(
                              "text-sm font-mono break-all",
                              value === null || value === undefined
                                ? "text-zinc-700 italic"
                                : col?.type === "number"
                                  ? "text-emerald-300"
                                  : col?.type === "email"
                                    ? "text-blue-300"
                                    : col?.type === "date"
                                      ? "text-purple-300"
                                      : col?.type === "boolean"
                                        ? String(value) === "true"
                                          ? "text-emerald-400"
                                          : "text-red-400"
                                        : "text-zinc-200",
                            )}
                          >
                            {value === null || value === undefined
                              ? "NULL"
                              : typeof value === "boolean"
                                ? String(value)
                                : typeof value === "number"
                                  ? value.toLocaleString("en-US", {
                                      maximumFractionDigits: 4,
                                    })
                                  : String(value)}
                          </p>
                        </div>
                        <Button
                          onClick={() => copyCell(value)}
                          className="flex-none opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Copy className="h-3.5 w-3.5 text-zinc-600 hover:text-zinc-400" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              <div className="p-4 border-t border-zinc-800 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-8 text-xs border-zinc-800"
                  onClick={() => {
                    copyCell(JSON.stringify(rowDetailRow, null, 2));
                  }}
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Copy JSON
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-8 text-xs border-zinc-800"
                  onClick={() => setRowDetailRow(null)}
                >
                  Close
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
