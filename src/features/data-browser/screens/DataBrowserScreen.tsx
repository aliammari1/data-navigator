"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import Fuse from "fuse.js";
import { produce } from "immer";
// Icons
import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart2,
  Bookmark,
  BookmarkCheck,
  Calendar,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronUp,
  CircleDot,
  Code2,
  Columns3,
  Command,
  Copy,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileJson,
  FileSpreadsheet,
  FileText,
  Filter,
  Grid3X3,
  Hash,
  Info,
  Keyboard,
  LayoutGrid,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  MoreHorizontal,
  PieChart,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Square,
  Star,
  StarOff,
  Table2,
  ToggleLeft,
  Trash2,
  TrendingDown,
  TrendingUp,
  Type,
  Upload,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Badge } from "@/components/ui/badge";
// UI components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  OPERATOR_LABELS,
  PAGE_SIZES,
  TYPE_COLORS,
  TYPE_ICON,
} from "@/features/data-browser/model/constants";
import {
  buildWhereClause,
  formatCellValue,
  generateSQL,
  inferColType,
} from "@/features/data-browser/model/helpers";
import type {
  CellSelection,
  ColType,
  ColumnDef,
  ColumnStats,
  FilterGroup,
  FilterRule,
  SavedQuery,
  SortConfig,
  ViewMode,
} from "@/features/data-browser/model/types";
import type * as Types from "@/features/telecom/types";
import {
  getColumnStats,
  getTableInfo,
  runQuery,
} from "@/platform/duckdb/duckdb";
import { loadUploadFileToDuckDB } from "@/platform/duckdb/upload-to-duckdb";
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

// Lazy load ECharts
import ReactECharts from "echarts-for-react";

import {
  ColumnHeader,
  ColumnStatPanel,
  ColumnTypeChip,
  DBStatusBadge,
  LoadingOverlay,
} from "@/features/data-browser/components/table-widgets";

function quoteIdentifier(value: string): string {
  return `"${value.replace('"', '""')}"`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DataBrowserScreen({
  m,
  operators,
  regions,
  statusMapping,
  tableName,
  fetchFiltered,
  fetchCustomerProfile,
}: {
  m: Types.ColumnMapping;
  operators: Types.OperatorRow[];
  regions: Types.RegionRow[];
  statusMapping: Types.StatusMapping[];
  tableName: string;
  fetchFiltered: (
    m: Types.ColumnMapping,
    f: Types.FilterState,
    sm: Types.StatusMapping[],
    limit: number,
    offset: number,
    sortCol: string,
    sortDir: Types.SortDir,
  ) => Promise<{ rows: Types.RawRow[]; total: number }>;
  fetchCustomerProfile: (
    m: Types.ColumnMapping,
    msisdn: string,
  ) => Promise<Types.CustomerProfileData | null>;
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
  const [availableTables, setAvailableTables] = useState<string[]>([]);
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
  const [savedFilterGroups, setSavedFilterGroups] = useState<FilterGroup[]>([]);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHighlight, setSearchHighlight] = useState(false);

  // Selection
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [lastSelectedRow, setLastSelectedRow] = useState<number | null>(null);
  const [focusedCell, setFocusedCell] = useState<CellSelection | null>(null);

  // Views
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [customQueryResult, setCustomQueryResult] = useState<
    Record<string, unknown>[] | null
  >(null);
  const [customQueryCols, setCustomQueryCols] = useState<string[]>([]);
  const [customQueryTime, setCustomQueryTime] = useState<number | null>(null);
  const [sqlQuery, setSqlQuery] = useState(
    `SELECT * FROM ${quoteIdentifier(tableName)} LIMIT 100`,
  );

  // Column UI
  const [colPanelOpen, setColPanelOpen] = useState(false);
  const [columnSearch, setColumnSearch] = useState("");
  const [activeColStats, setActiveColStats] = useState<string | null>(null);
  const [columnStats, setColumnStats] = useState<Record<string, ColumnStats>>(
    {},
  );
  const [resizingCol, setResizingCol] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);

  // Row details
  const [rowDetailRow, setRowDetailRow] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [starredRows, setStarredRows] = useState<Set<number>>(new Set());

  // Misc
  const [fullscreen, setFullscreen] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [showRowNumbers, setShowRowNumbers] = useState(true);
  const [zebraStripes, setZebraStripes] = useState(true);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);

  const [analyticsTab, setAnalyticsTab] = useState("overview");
  const [analyticsData, setAnalyticsData] = useState<Record<string, unknown>[]>(
    [],
  );

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();

  // ── DuckDB Init ──
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setDbLoading(true);

        // Check for tables already loaded into DuckDB from upload page
        let tableToUse = tableName;
        let usingUploadedData = false;

        try {
          const tablesResult = await runQuery(`SHOW TABLES`);
          const tableNames = tablesResult
            .map((r) => String(r.name ?? r.table_name ?? Object.values(r)[0]))
            .filter(Boolean);

          if (tableNames.length > 0) {
            setAvailableTables(tableNames);
            tableToUse = tableNames[0];
            usingUploadedData = true;
          }
        } catch {
          // SHOW TABLES failed, fall through to the provided table name.
        }

        if (!usingUploadedData) {
          // No tables loaded yet — wait for user to upload data
          if (!cancelled) {
            setDbLoading(false);
          }
          return;
        }

        if (cancelled) return;

        const info = await getTableInfo(tableToUse);

        if (cancelled) return;

        // Sample first row to help infer types
        let sampleRow: Record<string, unknown> = {};
        try {
          const sample = await runQuery(
            `SELECT * FROM ${quoteIdentifier(tableToUse)} LIMIT 1`,
          );
          sampleRow = sample[0] ?? {};
        } catch {
          // ignore, we'll fall back to string type
        }

        const cols: ColumnDef[] = info.columns.map((c) => ({
          id: c.name,
          name: c.name,
          dbType: c.type,
          type: inferColType(c.name, sampleRow[c.name]),
          width: c.name.length > 10 ? 160 : 130,
          visible: true,
          pinned: null,
          sortable: true,
          filterable: true,
        }));

        setColumns(cols);
        setTotalRows(info.rowCount);
        setActiveTable(tableToUse);
        setDbReady(true);
        setDbLoading(false);

        setSqlQuery(`SELECT * FROM ${quoteIdentifier(tableToUse)} LIMIT 100`);
      } catch (err) {
        console.error(err);
        if (!cancelled) setDbLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);
  const handleBrowserUpload = useCallback(async (file: File) => {
    setUploadingFile({ name: file.name, progress: 10, status: "reading" });

    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (ext !== "csv") {
        throw new Error(`Unsupported file type: .${ext}`);
      }

      setUploadingFile(
        (p) => p && { ...p, progress: 70, status: "loading_db" },
      );

      const loaded = await loadUploadFileToDuckDB(file, {
        previewLimit: 1,
        fileExtension: ext,
      });
      const tableName = loaded.tableName;

      setUploadingFile((p) => p && { ...p, progress: 100, status: "done" });

      // Refresh table list and switch to new table
      const tablesResult = await runQuery(`SHOW TABLES`);
      const tableNames = tablesResult
        .map((r) => String(r.name ?? r.table_name ?? Object.values(r)[0]))
        .filter(Boolean);
      setAvailableTables(tableNames);

      const info = await getTableInfo(tableName);
      let sampleRow: Record<string, unknown> = {};
      try {
        const sample = await runQuery(
          `SELECT * FROM ${quoteIdentifier(tableName)} LIMIT 1`,
        );
        sampleRow = sample[0] ?? {};
      } catch {
        /* ignore */
      }

      const cols: ColumnDef[] = info.columns.map((c) => ({
        id: c.name,
        name: c.name,
        dbType: c.type,
        type: inferColType(c.name, sampleRow[c.name]),
        width: c.name.length > 10 ? 160 : 130,
        visible: true,
        pinned: null,
        sortable: true,
        filterable: true,
      }));

      setColumns(cols);
      setTotalRows(info.rowCount);
      setActiveTable(tableName);
      setPage(0);
      setSorts([]);
      setFilterGroup((prev) =>
        produce(prev, (d) => {
          d.rules = [];
        }),
      );
      setSqlQuery(`SELECT * FROM ${quoteIdentifier(tableName)} LIMIT 100`);

      setTimeout(() => {
        setUploadingFile(null);
        setUploadPanelOpen(false);
      }, 1500);
    } catch (err) {
      setUploadingFile(
        (p) => p && { ...p, status: "error", error: String(err) },
      );
    }
  }, []);
  // ── Data Fetch ──
  const fetchRows = useCallback(async () => {
    if (!dbReady) return;

    setQueryLoading(true);
    setQueryError(null);

    try {
      const t0 = performance.now();
      const visibleCols = columns.filter((c) => c.visible);

      // Count query
      const whereClause = buildWhereClause(filterGroup);
      const countSql = `SELECT COUNT(*) as cnt FROM ${quoteIdentifier(activeTable)}${whereClause ? ` WHERE ${whereClause}` : ""}`;
      const countResult = await runQuery(countSql);
      const newTotal = Number(countResult[0]?.cnt ?? 0);
      setTotalRows(newTotal);

      // Clamp page
      const maxPage = Math.max(0, Math.ceil(newTotal / pageSize) - 1);
      const clampedPage = Math.min(page, maxPage);
      if (clampedPage !== page) setPage(clampedPage);

      const sql = generateSQL(
        activeTable,
        visibleCols.length > 0 ? columns : columns,
        sorts,
        filterGroup,
        pageSize,
        clampedPage * pageSize,
      );

      const data = await runQuery(sql);
      setRows(data);
      setQueryTime(Math.round(performance.now() - t0));
    } catch (err) {
      setQueryError(String(err));
    } finally {
      setQueryLoading(false);
    }
  }, [dbReady, columns, sorts, filterGroup, page, pageSize, activeTable]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  // Analytics data
  useEffect(() => {
    if (!dbReady || viewMode !== "analytics") return;

    async function fetchAnalytics() {
      const dimension =
        columns.find((column) =>
          ["string", "email", "url", "date"].includes(column.type),
        ) ?? columns[0];
      const numericColumns = columns.filter(
        (column) => column.type === "number",
      );
      const sumMetric = numericColumns[0];
      const avgMetric = numericColumns[1] ?? sumMetric;
      const secondaryMetric = numericColumns[2] ?? avgMetric;

      if (!dimension || !sumMetric) {
        setAnalyticsData([]);
        return;
      }

      const dimensionSql = quoteIdentifier(dimension.id);
      const sumMetricSql = quoteIdentifier(sumMetric.id);
      const avgMetricSql = quoteIdentifier(avgMetric.id);
      const secondaryMetricSql = quoteIdentifier(secondaryMetric.id);

      try {
        const data = await runQuery(`
          SELECT CAST(${dimensionSql} AS VARCHAR) as department,
            ROUND(SUM(TRY_CAST(${sumMetricSql} AS DOUBLE)), 2) as total_revenue,
            ROUND(AVG(TRY_CAST(${avgMetricSql} AS DOUBLE)), 2) as avg_margin,
            COUNT(*) as user_count,
            ROUND(AVG(TRY_CAST(${secondaryMetricSql} AS DOUBLE)), 2) as avg_satisfaction,
            ROUND(SUM(TRY_CAST(${sumMetricSql} AS DOUBLE)), 2) as total_units
          FROM ${quoteIdentifier(activeTable)}
          WHERE ${sumMetricSql} IS NOT NULL
          GROUP BY 1
          ORDER BY total_revenue DESC
          LIMIT 20
        `);
        setAnalyticsData(data);
      } catch (e) {
        console.error(e);
        setAnalyticsData([]);
      }
    }

    fetchAnalytics();
  }, [activeTable, columns, dbReady, viewMode]);

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
        const stats = await getColumnStats(activeTable, colName);
        setColumnStats((prev) =>
          produce(prev, (draft) => {
            draft[colName] = { ...stats, loading: false };
          }),
        );
      } catch (e) {
        console.error(e);
      }
    },
    [activeTable, dbReady, columnStats],
  );

  useEffect(() => {
    if (activeColStats) loadColumnStats(activeColStats);
  }, [activeColStats, loadColumnStats]);

  // ── Virtualization ──
  const visibleColumns = useMemo(
    () => columns.filter((c) => c.visible),
    [columns],
  );

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => (compactMode ? 28 : 40),
    overscan: 10,
  });

  // ── Selection ──
  const toggleRow = useCallback(
    (rowIdx: number, e: React.MouseEvent) => {
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
        return [
          ...prev,
          { column: colName, direction: "asc" as const, priority: prev.length },
        ];
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
      const result = await runQuery(sqlQuery);
      setCustomQueryResult(result);
      setCustomQueryCols(result.length > 0 ? Object.keys(result[0]) : []);
      setCustomQueryTime(Math.round(performance.now() - t0));
    } catch (err) {
      setQueryError(String(err));
    } finally {
      setQueryLoading(false);
    }
  }, [dbReady, sqlQuery]);

  // ── Export ──
  const exportData = useCallback(
    (format: "csv") => {
      const data =
        selectedRows.size > 0 ? [...selectedRows].map((i) => rows[i]) : rows;

      const sep = ",";
      const headers = Object.keys(data[0] || {});
      const csvRows = [
        headers.join(sep),
        ...data.map((r) =>
          headers
            .map((h) => {
              const v = r[h];
              const s = v == null ? "" : String(v);
              return format === "csv" && (s.includes(",") || s.includes('"'))
                ? `"${s.replaceAll('"', '""')}"`
                : s;
            })
            .join(sep),
        ),
      ];
      const blob = new Blob([csvRows.join("\n")], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `export.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [rows, selectedRows],
  );

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
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStart;
      setColumns((prev) =>
        produce(prev, (draft) => {
          const col = draft.find((c) => c.id === resizingCol);
          if (col) col.width = Math.max(60, resizeStartWidth + delta);
        }),
      );
    };
    const onUp = () => setResizingCol(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizingCol, resizeStart, resizeStartWidth]);

  // ── Analytics Charts ──
  const revenueByDeptOption = useMemo(
    () => ({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#18181b",
        borderColor: "#3f3f46",
        textStyle: { color: "#e4e4e7", fontSize: 12 },
      },
      grid: { top: 20, right: 20, bottom: 60, left: 60, containLabel: true },
      xAxis: {
        type: "category",
        data: analyticsData.map((d) => d.department),
        axisLabel: { color: "#71717a", rotate: 20, fontSize: 11 },
        axisLine: { lineStyle: { color: "#3f3f46" } },
      },
      yAxis: {
        type: "value",
        name: "Revenue ($)",
        nameTextStyle: { color: "#71717a", fontSize: 11 },
        axisLabel: {
          color: "#71717a",
          fontSize: 11,
          formatter: (v: number) =>
            v >= 1e6
              ? `$${(v / 1e6).toFixed(1)}M`
              : `$${(v / 1e3).toFixed(0)}K`,
        },
        splitLine: { lineStyle: { color: "#27272a" } },
      },
      series: [
        {
          type: "bar",
          data: analyticsData.map((d) => d.total_revenue),
          itemStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "#10b981" },
                { offset: 1, color: "#064e3b" },
              ],
            },
            borderRadius: [4, 4, 0, 0],
          },
          label: {
            show: true,
            position: "top",
            color: "#10b981",
            fontSize: 10,
            formatter: (p: { value: number }) =>
              p.value >= 1e6
                ? `$${(p.value / 1e6).toFixed(1)}M`
                : `$${(p.value / 1e3).toFixed(0)}K`,
          },
        },
      ],
    }),
    [analyticsData],
  );

  const marginPieOption = useMemo(
    () => ({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: "#18181b",
        borderColor: "#3f3f46",
        textStyle: { color: "#e4e4e7" },
      },
      legend: {
        orient: "vertical",
        right: 10,
        textStyle: { color: "#71717a", fontSize: 11 },
      },
      series: [
        {
          type: "pie",
          radius: ["40%", "70%"],
          center: ["40%", "50%"],
          data: analyticsData.map((d, i) => ({
            name: d.department,
            value: d.total_revenue,
          })),
          itemStyle: {
            borderColor: "#09090b",
            borderWidth: 2,
          },
          label: { show: false },
          emphasis: {
            itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.5)" },
          },
        },
      ],
      color: [
        "#10b981",
        "#3b82f6",
        "#8b5cf6",
        "#f59e0b",
        "#ef4444",
        "#06b6d4",
        "#84cc16",
        "#f97316",
      ],
    }),
    [analyticsData],
  );

  const satisfactionScatterOption = useMemo(
    () => ({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: "#18181b",
        borderColor: "#3f3f46",
        textStyle: { color: "#e4e4e7", fontSize: 11 },
        formatter: (p: { data: number[] }) =>
          `Revenue: $${p.data[0].toLocaleString()}<br/>Satisfaction: ${p.data[1]}`,
      },
      grid: { top: 20, right: 20, bottom: 40, left: 60, containLabel: true },
      xAxis: {
        type: "value",
        name: "Revenue",
        nameTextStyle: { color: "#71717a", fontSize: 11 },
        axisLabel: {
          color: "#71717a",
          fontSize: 10,
          formatter: (v: number) => `$${(v / 1e3).toFixed(0)}K`,
        },
        splitLine: { lineStyle: { color: "#27272a" } },
      },
      yAxis: {
        type: "value",
        name: "Satisfaction",
        nameTextStyle: { color: "#71717a", fontSize: 11 },
        axisLabel: { color: "#71717a", fontSize: 10 },
        splitLine: { lineStyle: { color: "#27272a" } },
        min: 0,
        max: 5,
      },
      series: [
        {
          type: "scatter",
          data: analyticsData.map((d) => [d.total_revenue, d.avg_satisfaction]),
          symbolSize: 10,
          itemStyle: { color: "#8b5cf6", opacity: 0.8 },
        },
      ],
    }),
    [analyticsData],
  );

  // ── Search Filter ──
  const fuse = useMemo(() => {
    if (!searchHighlight || !searchQuery) return null;
    return new Fuse(rows, {
      keys: columns.filter((c) => c.visible).map((c) => c.name),
      includeScore: true,
      threshold: 0.3,
    });
  }, [rows, columns, searchHighlight, searchQuery]);

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
      const vals = selectedData
        .map((r) => Number(r[col.name]))
        .filter((v) => !Number.isNaN(v));
      return {
        col: col.name,
        sum: vals.reduce((a, b) => a + b, 0),
        avg:
          vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
        min: vals.length > 0 ? Math.min(...vals) : 0,
        max: vals.length > 0 ? Math.max(...vals) : 0,
      };
    });
  }, [selectedRows, rows, columns]);

  // ── Render ──
  const pageContainerClass = cn(
    "flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden transition-all duration-300",
    fullscreen && "fixed inset-0 z-50",
  );

  const rowHeight = compactMode ? 28 : 40;

  return (
    <div className={pageContainerClass}>
      {/* ── Header ─────────────────────────────────── */}
      <div className="flex-none border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm px-4 py-2.5">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Title */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-none">
              <Database className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-zinc-100 leading-none">
                Data Browser
              </h1>
              {dbReady && (
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  {totalRows.toLocaleString()} rows ·{" "}
                  {columns.filter((c) => c.visible).length} cols
                  {queryTime != null && ` · ${queryTime}ms`}
                </p>
              )}
            </div>
          </div>

          <DBStatusBadge initialized={dbReady} />
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="outline"
                size="icon"
                className={cn(
                  "h-8 w-8 border-zinc-800 bg-zinc-900",
                  uploadPanelOpen &&
                    "border-blue-500/50 bg-blue-500/10 text-blue-400",
                )}
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
                setActiveTable(v);
                const info = await getTableInfo(v);
                const cols: ColumnDef[] = info.columns.map((c) => ({
                  id: c.name,
                  name: c.name,
                  dbType: c.type,
                  type: inferColType(c.name, undefined),
                  width: c.name.length > 10 ? 160 : 130,
                  visible: true,
                  pinned: null,
                  sortable: true,
                  filterable: true,
                }));
                setColumns(cols);
                setTotalRows(info.rowCount);
                setPage(0);
                setSorts([]);
                setFilterGroup((prev) =>
                  produce(prev, (d) => {
                    d.rules = [];
                  }),
                );
                setSqlQuery(`SELECT * FROM ${quoteIdentifier(v)} LIMIT 100`);
              }}
            >
              <SelectTrigger className="h-8 w-44 text-xs bg-zinc-900 border-zinc-800">
                <Database className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
                <SelectValue placeholder="Select table…" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                {availableTables.map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">
                    {t}
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
            <TooltipTrigger>
              <Button
                variant="outline"
                size="icon"
                className={cn(
                  "h-8 w-8 border-zinc-800 bg-zinc-900",
                  filterGroup.rules.filter((r) => r.active).length > 0 &&
                    "border-emerald-500/50 bg-emerald-500/10 text-emerald-400",
                )}
                onClick={() => setFilterPanelOpen(!filterPanelOpen)}
              >
                <Filter className="h-3.5 w-3.5" />
                {filterGroup.rules.filter((r) => r.active).length > 0 && (
                  <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-500 text-[8px] flex items-center justify-center text-black font-bold">
                    {filterGroup.rules.filter((r) => r.active).length}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Filters</TooltipContent>
          </Tooltip>

          {/* Column manager */}
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 border-zinc-800 bg-zinc-900"
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
            <DropdownMenuContent
              align="end"
              className="bg-zinc-900 border-zinc-800"
            >
              <div className="px-2 py-1.5 text-xs text-zinc-500 font-medium">
                {selectedRows.size > 0
                  ? `${selectedRows.size} selected rows`
                  : `All ${rows.length} rows`}
              </div>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem
                onClick={() => exportData("csv")}
                className="text-sm gap-2 text-zinc-300 focus:bg-zinc-800"
              >
                <FileText className="h-3.5 w-3.5 text-zinc-500" />
                CSV (.csv)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Settings */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 transition-colors text-zinc-300">
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="bg-zinc-900 border-zinc-800 w-52"
            >
              <div className="px-2 py-1.5 text-xs text-zinc-500 font-medium">
                Table Options
              </div>
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
              </div>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <div className="px-2 py-1.5">
                <Label className="text-xs text-zinc-500 block mb-1.5">
                  Page Size
                </Label>
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
            onClick={fetchRows}
            disabled={queryLoading}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", queryLoading && "animate-spin")}
            />
          </Button>
        </div>
      </div>

      {/* ── Toolbar row 2: active filters + sorts ── */}
      <AnimatePresence>
        {(filterGroup.rules.filter((r) => r.active).length > 0 ||
          sorts.length > 0) && (
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
                    onClick={() =>
                      setSorts((prev) =>
                        prev.filter((x) => x.column !== s.column),
                      )
                    }
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
                            const idx = draft.rules.findIndex(
                              (x) => x.id === r.id,
                            );
                            if (idx !== -1) draft.rules.splice(idx, 1);
                          }),
                        )
                      }
                    >
                      <X className="h-2.5 w-2.5 ml-0.5 opacity-60 hover:opacity-100" />
                    </Button>
                  </Badge>
                ))}
              {(filterGroup.rules.filter((r) => r.active).length > 0 ||
                sorts.length > 0) && (
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
                  <div
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
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = ".csv,.tsv,.json,.xlsx,.xls,.txt";
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) handleBrowserUpload(file);
                      };
                      input.click();
                    }}
                    className={cn(
                      "border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-all",
                      uploadDragging
                        ? "border-blue-500 bg-blue-500/5 scale-[1.01]"
                        : "border-zinc-700 hover:border-zinc-600 hover:bg-zinc-900/50",
                    )}
                  >
                    <motion.div
                      animate={
                        uploadDragging
                          ? { scale: 1.1, y: -4 }
                          : { scale: 1, y: 0 }
                      }
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
                        {uploadDragging
                          ? "Drop to upload"
                          : "Drag & drop or click to upload"}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">
                        CSV, TSV, JSON, XLSX — loads directly into DuckDB
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {[{ ext: "CSV", color: "emerald" }].map(
                        ({ ext, color }) => (
                          <Badge
                            key={ext}
                            variant="outline"
                            className={cn(
                              "text-[11px]",
                              color === "emerald" &&
                                "border-emerald-500/30 text-emerald-400",
                              color === "blue" &&
                                "border-blue-500/30 text-blue-400",
                              color === "green" &&
                                "border-green-500/30 text-green-400",
                            )}
                          >
                            .{ext}
                          </Badge>
                        ),
                      )}
                    </div>
                  </div>
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
                          uploadingFile.status === "done" &&
                            "bg-emerald-500/10",
                          uploadingFile.status === "error" && "bg-red-500/10",
                          !["done", "error"].includes(uploadingFile.status) &&
                            "bg-blue-500/10",
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
                            uploadingFile.status === "done" &&
                              "text-emerald-400",
                            uploadingFile.status === "error" && "text-red-400",
                            !["done", "error"].includes(uploadingFile.status) &&
                              "text-blue-400",
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
                <div
                  key={s.col}
                  className="flex items-center gap-3 text-[11px]"
                >
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
                                  const r = draft.rules.find(
                                    (x) => x.id === rule.id,
                                  );
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
                                  const r = draft.rules.find(
                                    (x) => x.id === rule.id,
                                  );
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
                                  <SelectItem
                                    key={c.id}
                                    value={c.name}
                                    className="text-xs"
                                  >
                                    {c.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <Button
                            onClick={() =>
                              setFilterGroup((prev) =>
                                produce(prev, (draft) => {
                                  draft.rules = draft.rules.filter(
                                    (x) => x.id !== rule.id,
                                  );
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
                                const r = draft.rules.find(
                                  (x) => x.id === rule.id,
                                );
                                if (r) r.operator = v as FilterRule["operator"];
                              }),
                            )
                          }
                        >
                          <SelectTrigger className="h-7 text-xs bg-zinc-800 border-zinc-700">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800">
                            {Object.entries(OPERATOR_LABELS).map(
                              ([op, label]) => (
                                <SelectItem
                                  key={op}
                                  value={op}
                                  className="text-xs"
                                >
                                  {label}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>

                        {rule.operator !== "is_null" &&
                          rule.operator !== "is_not_null" && (
                            <Input
                              value={rule.value}
                              onChange={(e) =>
                                setFilterGroup((prev) =>
                                  produce(prev, (draft) => {
                                    const r = draft.rules.find(
                                      (x) => x.id === rule.id,
                                    );
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
                                  const r = draft.rules.find(
                                    (x) => x.id === rule.id,
                                  );
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
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-8 text-xs border-zinc-800"
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
                  <p className="text-sm font-medium text-zinc-200">
                    Initializing DuckDB WASM
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Loading 10,000 rows into memory…
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
                  <div
                    className="flex items-stretch"
                    style={{ minWidth: "fit-content" }}
                  >
                    {/* Row number header */}
                    {showRowNumbers && (
                      <div className="flex-none w-10 flex items-center justify-center border-r border-zinc-800 bg-zinc-900">
                        <Checkbox
                          checked={
                            rows.length > 0 && selectedRows.size === rows.length
                          }
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
                            setActiveColStats(
                              activeColStats === col.id ? null : col.id,
                            )
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
                      .filter(
                        (c) => c.pinned !== "left" && c.pinned !== "right",
                      )
                      .map((col) => (
                        <ColumnHeader
                          key={col.id}
                          col={col}
                          sorts={sorts}
                          activeColStats={activeColStats}
                          onSort={handleSort}
                          onStats={() =>
                            setActiveColStats(
                              activeColStats === col.id ? null : col.id,
                            )
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
                            setActiveColStats(
                              activeColStats === col.id ? null : col.id,
                            )
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
                              type={
                                columns.find((c) => c.id === activeColStats)
                                  ?.type ?? "string"
                              }
                            />
                            <Button
                              onClick={() => setActiveColStats(null)}
                              className="ml-auto"
                            >
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
                      const isStarred = starredRows.has(
                        Number(rowData.id ?? virtualRow.index),
                      );
                      const isZebra =
                        zebraStripes && virtualRow.index % 2 === 1;

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
                          onClick={(e) => toggleRow(virtualRow.index, e)}
                          onDoubleClick={() => setRowDetailRow(rowData)}
                          className={cn(
                            "flex items-stretch border-b border-zinc-800/30 group transition-colors cursor-pointer",
                            isSelected &&
                              "bg-emerald-500/10 border-emerald-500/10",
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
                            const value = rowData[col.name];
                            const formatted = formatCellValue(value, col.type);
                            const isFocused =
                              focusedCell?.rowIdx === virtualRow.index &&
                              focusedCell?.colId === col.id;

                            return (
                              <div
                                key={col.id}
                                className={cn(
                                  "flex items-center px-3 border-r border-zinc-800/20 text-xs font-mono truncate",
                                  col.type === "number" &&
                                    "justify-end text-emerald-300",
                                  col.type === "boolean" && "justify-center",
                                  col.type === "date" && "text-purple-300",
                                  col.type === "email" && "text-blue-300",
                                  !value && "text-zinc-600 italic",
                                  isFocused &&
                                    "outline outline-1 outline-blue-500 bg-blue-500/5",
                                )}
                                style={{
                                  width: col.width,
                                  minWidth: col.width,
                                  maxWidth: col.width,
                                  height: rowHeight,
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFocusedCell({
                                    rowIdx: virtualRow.index,
                                    colId: col.id,
                                  });
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  copyCell(value);
                                }}
                              >
                                {value === null || value === undefined ? (
                                  <span className="text-zinc-700 text-[10px]">
                                    NULL
                                  </span>
                                ) : col.type === "boolean" ? (
                                  <span
                                    className={cn(
                                      "h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold",
                                      String(value) === "true"
                                        ? "bg-emerald-500/20 text-emerald-400"
                                        : "bg-zinc-700 text-zinc-500",
                                    )}
                                  >
                                    {String(value) === "true" ? "T" : "F"}
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
                                const id = Number(
                                  rowData.id ?? virtualRow.index,
                                );
                                setStarredRows((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(id)) next.delete(id);
                                  else next.add(id);
                                  return next;
                                });
                              }}
                              className="h-5 w-5 flex items-center justify-center rounded hover:bg-zinc-700"
                            >
                              {starredRows.has(
                                Number(rowData.id ?? virtualRow.index),
                              ) ? (
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
                          Columns ({columns.filter((c) => c.visible).length}/
                          {columns.length})
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
                                c.name
                                  .toLowerCase()
                                  .includes(columnSearch.toLowerCase()),
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
                                        const c = draft.find(
                                          (x) => x.id === col.id,
                                        );
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
                                    setActiveColStats(
                                      activeColStats === col.id ? null : col.id,
                                    )
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
                                draft.forEach((c) => (c.visible = true));
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
                                draft.forEach((c, i) => (c.visible = i < 5));
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
            <div className="flex-1 overflow-auto p-4 relative">
              {queryLoading && <LoadingOverlay />}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {rows.map((row, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.01 }}
                    className={cn(
                      "bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 cursor-pointer transition-all hover:shadow-lg hover:shadow-black/20",
                      selectedRows.has(i) &&
                        "border-emerald-500/50 bg-emerald-500/5",
                    )}
                    onClick={(e) => toggleRow(i, e)}
                    onDoubleClick={() => setRowDetailRow(row)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-linear-to-br from-emerald-500/20 to-blue-500/20 flex items-center justify-center text-sm font-bold text-zinc-300">
                          {
                            String(
                              row.first_name ?? row[Object.keys(row)[1]] ?? "?",
                            )[0]
                          }
                        </div>
                        <div>
                          <p className="text-xs font-medium text-zinc-200 leading-none">
                            {String(row.first_name ?? "")}{" "}
                            {String(row.last_name ?? "")}
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
                          <div
                            key={k}
                            className="flex items-center justify-between"
                          >
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
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* ── ANALYTICS VIEW ── */}
          {viewMode === "analytics" && (
            <div className="flex-1 overflow-auto p-4">
              <Tabs value={analyticsTab} onValueChange={setAnalyticsTab}>
                <TabsList className="bg-zinc-900 border border-zinc-800 mb-4">
                  <TabsTrigger
                    value="overview"
                    className="text-xs data-[state=active]:bg-zinc-700"
                  >
                    Overview
                  </TabsTrigger>
                  <TabsTrigger
                    value="revenue"
                    className="text-xs data-[state=active]:bg-zinc-700"
                  >
                    Revenue
                  </TabsTrigger>
                  <TabsTrigger
                    value="segments"
                    className="text-xs data-[state=active]:bg-zinc-700"
                  >
                    Segments
                  </TabsTrigger>
                  <TabsTrigger
                    value="scatter"
                    className="text-xs data-[state=active]:bg-zinc-700"
                  >
                    Correlation
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="overview">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    {[
                      {
                        label: "Total Revenue",
                        value: analyticsData
                          .reduce((a, b) => a + Number(b.total_revenue ?? 0), 0)
                          .toLocaleString("en-US", {
                            style: "currency",
                            currency: "USD",
                            maximumFractionDigits: 0,
                          }),
                        icon: <TrendingUp className="h-4 w-4" />,
                        color: "emerald",
                      },
                      {
                        label: "Avg Margin",
                        value:
                          analyticsData.length > 0
                            ? (
                                analyticsData.reduce(
                                  (a, b) => a + Number(b.avg_margin ?? 0),
                                  0,
                                ) / analyticsData.length
                              ).toFixed(1) + "%"
                            : "—",
                        icon: <PieChart className="h-4 w-4" />,
                        color: "blue",
                      },
                      {
                        label: "Departments",
                        value: analyticsData.length,
                        icon: <Grid3X3 className="h-4 w-4" />,
                        color: "purple",
                      },
                      {
                        label: "Avg Satisfaction",
                        value:
                          analyticsData.length > 0
                            ? (
                                analyticsData.reduce(
                                  (a, b) => a + Number(b.avg_satisfaction ?? 0),
                                  0,
                                ) / analyticsData.length
                              ).toFixed(2)
                            : "—",
                        icon: <Sparkles className="h-4 w-4" />,
                        color: "amber",
                      },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className={cn(
                          "bg-zinc-900 border rounded-xl p-4",
                          stat.color === "emerald" && "border-emerald-500/20",
                          stat.color === "blue" && "border-blue-500/20",
                          stat.color === "purple" && "border-purple-500/20",
                          stat.color === "amber" && "border-amber-500/20",
                        )}
                      >
                        <div
                          className={cn(
                            "h-8 w-8 rounded-lg flex items-center justify-center mb-3",
                            stat.color === "emerald" &&
                              "bg-emerald-500/10 text-emerald-400",
                            stat.color === "blue" &&
                              "bg-blue-500/10 text-blue-400",
                            stat.color === "purple" &&
                              "bg-purple-500/10 text-purple-400",
                            stat.color === "amber" &&
                              "bg-amber-500/10 text-amber-400",
                          )}
                        >
                          {stat.icon}
                        </div>
                        <p className="text-2xl font-bold text-zinc-100">
                          {stat.value}
                        </p>
                        <p className="text-xs text-zinc-500 mt-1">
                          {stat.label}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Card className="bg-zinc-900 border-zinc-800">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">
                          Revenue by Department
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ReactECharts
                          option={revenueByDeptOption}
                          style={{ height: 280 }}
                          opts={{ renderer: "canvas" }}
                        />
                      </CardContent>
                    </Card>
                    <Card className="bg-zinc-900 border-zinc-800">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">
                          Revenue Distribution
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ReactECharts
                          option={marginPieOption}
                          style={{ height: 280 }}
                          opts={{ renderer: "canvas" }}
                        />
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="revenue">
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">
                        Revenue vs Profit Margin by Department
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ReactECharts
                        option={{
                          ...revenueByDeptOption,
                          series: [
                            ...(revenueByDeptOption.series ?? []),
                            {
                              type: "line",
                              yAxisIndex: 1,
                              data: analyticsData.map((d) => d.avg_margin),
                              smooth: true,
                              symbol: "circle",
                              symbolSize: 6,
                              lineStyle: { color: "#3b82f6", width: 2 },
                              itemStyle: { color: "#3b82f6" },
                              name: "Avg Margin %",
                            },
                          ],
                          yAxis: [
                            revenueByDeptOption.yAxis,
                            {
                              type: "value",
                              name: "Margin %",
                              nameTextStyle: { color: "#71717a", fontSize: 11 },
                              axisLabel: {
                                color: "#71717a",
                                fontSize: 11,
                                formatter: "{value}%",
                              },
                              splitLine: { show: false },
                            },
                          ],
                        }}
                        style={{ height: 400 }}
                        opts={{ renderer: "canvas" }}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="segments">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {analyticsData.map((dept) => (
                      <Card
                        key={String(dept.department)}
                        className="bg-zinc-900 border-zinc-800"
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm">
                              {String(dept.department)}
                            </CardTitle>
                            <Badge
                              variant="outline"
                              className="text-xs border-zinc-700 text-zinc-400"
                            >
                              {Number(dept.user_count).toLocaleString()} users
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-[10px] text-zinc-500 uppercase">
                                Revenue
                              </p>
                              <p className="text-sm font-bold text-emerald-400">
                                $
                                {Number(dept.total_revenue).toLocaleString(
                                  "en-US",
                                  { maximumFractionDigits: 0 },
                                )}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-zinc-500 uppercase">
                                Margin
                              </p>
                              <p className="text-sm font-bold text-blue-400">
                                {Number(dept.avg_margin).toFixed(1)}%
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-zinc-500 uppercase">
                                Satisfaction
                              </p>
                              <div className="flex items-center gap-1">
                                <p className="text-sm font-bold text-amber-400">
                                  {Number(dept.avg_satisfaction).toFixed(2)}
                                </p>
                                <span className="text-[10px] text-zinc-600">
                                  /5
                                </span>
                              </div>
                            </div>
                            <div>
                              <p className="text-[10px] text-zinc-500 uppercase">
                                Units
                              </p>
                              <p className="text-sm font-bold text-purple-400">
                                {Number(dept.total_units).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 space-y-1">
                            <div className="flex items-center justify-between text-[10px] text-zinc-500">
                              <span>Revenue share</span>
                              <span>
                                {(
                                  (Number(dept.total_revenue) /
                                    analyticsData.reduce(
                                      (a, b) =>
                                        a + Number(b.total_revenue ?? 0),
                                      0,
                                    )) *
                                  100
                                ).toFixed(1)}
                                %
                              </span>
                            </div>
                            <Progress
                              value={
                                (Number(dept.total_revenue) /
                                  analyticsData.reduce(
                                    (a, b) => a + Number(b.total_revenue ?? 0),
                                    0,
                                  )) *
                                100
                              }
                              className="h-1.5"
                            />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="scatter">
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">
                        Revenue vs Satisfaction Correlation
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ReactECharts
                        option={satisfactionScatterOption}
                        style={{ height: 400 }}
                        opts={{ renderer: "canvas" }}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {/* ── SQL VIEW ── */}
          {viewMode === "sql" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-none border-b border-zinc-800 bg-zinc-900/30 px-3 py-2 flex items-center gap-2">
                <Code2 className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-xs font-medium text-zinc-300">
                  SQL Editor
                </span>
                <span className="text-[10px] text-zinc-600">
                  — Powered by DuckDB WASM
                </span>
                <div className="flex-1" />
                <div className="flex items-center gap-1.5">
                  {savedQueries.map((q) => (
                    <Tooltip key={q.id}>
                      <TooltipTrigger>
                        <Button
                          onClick={() => setSqlQuery(q.sql)}
                          className="text-[10px] text-zinc-500 hover:text-zinc-300 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors"
                        >
                          {q.name}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <pre className="text-[10px] whitespace-pre-wrap">
                          {q.sql}
                        </pre>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
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
                      <span className="text-xs text-red-300 font-mono">
                        {queryError}
                      </span>
                    </>
                  ) : (
                    <>
                      <Zap className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-xs text-emerald-300">
                        Query executed in {customQueryTime}ms —{" "}
                        {customQueryResult?.length ?? 0} rows returned
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
                        <tr
                          key={i}
                          className="hover:bg-zinc-900/60 border-b border-zinc-800/30"
                        >
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
                    <p className="text-sm text-zinc-500">
                      Write a SQL query and click Run
                    </p>
                    <p className="text-xs text-zinc-600 mt-1">
                      Table:{" "}
                      <code className="text-emerald-500/70">{activeTable}</code>{" "}
                      ({totalRows.toLocaleString()} rows)
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
                <span className="text-emerald-400">
                  {selectedRows.size} selected ·{" "}
                </span>
              ) : null}
              Showing {page * pageSize + 1}–
              {Math.min((page + 1) * pageSize, totalRows)} of{" "}
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
                      <span
                        key={`ellipsis-${i}`}
                        className="text-xs text-zinc-600 px-1"
                      >
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
                      {String(rowDetailRow.first_name ?? "")}{" "}
                      {String(rowDetailRow.last_name ?? "")}
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
