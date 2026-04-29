"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "motion/react";
import Papa from "papaparse";
import { cn } from "@/lib/utils";
import { loadJSONToDuckDB } from "@/lib/duckdb";
import { useDataStore } from "@/lib/stores/data-store";
import type { ColMeta, Dataset } from "@/lib/stores/data-store";
import { produce } from "immer";
import ReactECharts from "echarts-for-react";
import ExcelJS from "exceljs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Upload,
  File,
  FileText,
  FileSpreadsheet,
  FileJson,
  Database,
  X,
  Check,
  AlertCircle,
  AlertTriangle,
  Info,
  Clock,
  Zap,
  Eye,
  Trash2,
  RefreshCw,
  Download,
  ChevronDown,
  BarChart2,
  Table2,
  Hash,
  Type,
  Calendar,
  ToggleLeft,
  TrendingUp,
  Activity,
  Layers,
  Settings2,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Loader2,
  HardDrive,
  FileCheck,
  Sparkles,
  Code2,
  Filter,
  ArrowRight,
  Star,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type UploadStatus =
  | "idle"
  | "reading"
  | "parsing"
  | "validating"
  | "loading_db"
  | "done"
  | "error";
type FileType = "csv" | "json" | "xlsx" | "tsv" | "parquet" | "unknown";

interface ColumnInfo {
  name: string;
  type: "string" | "number" | "date" | "boolean" | "mixed";
  nullCount: number;
  uniqueCount: number;
  sampleValues: unknown[];
  min?: number;
  max?: number;
  avg?: number;
}

interface ValidationIssue {
  severity: "error" | "warning" | "info";
  message: string;
  affectedRows?: number;
  column?: string;
}

interface ParsedFileInfo {
  id: string;
  name: string;
  size: number;
  fileType: FileType;
  status: UploadStatus;
  progress: number;
  rowCount: number;
  columnCount: number;
  columns: ColumnInfo[];
  previewRows: Record<string, unknown>[];
  issues: ValidationIssue[];
  parseTime: number;
  dbTableName: string | null;
  error?: string;
  uploadedAt: Date;
  delimiter: string;
  hasHeader: boolean;
  encoding: string;
  skipEmptyLines: boolean;
  completeness: number;
  accuracy: number;
  consistency: number;
  uniqueness: number;
}

interface UploadSettings {
  delimiter: "auto" | "," | ";" | "\t" | "|";
  hasHeader: boolean;
  encoding: "UTF-8" | "ISO-8859-1" | "UTF-16";
  skipEmptyLines: boolean;
  trimWhitespace: boolean;
  maxRows: number | null;
  autoDetectTypes: boolean;
  loadToDuckDB: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function detectFileType(name: string): FileType {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, FileType> = {
    csv: "csv",
    tsv: "tsv",
    txt: "csv",
    json: "json",
    xlsx: "xlsx",
    xls: "xlsx",
    parquet: "parquet",
  };
  return map[ext] ?? "unknown";
}

function getFileIcon(type: FileType) {
  switch (type) {
    case "csv":
    case "tsv":
      return <FileText className="h-5 w-5 text-emerald-400" />;
    case "json":
      return <FileJson className="h-5 w-5 text-blue-400" />;
    case "xlsx":
      return <FileSpreadsheet className="h-5 w-5 text-green-400" />;
    default:
      return <File className="h-5 w-5 text-zinc-400" />;
  }
}

function inferColumnType(values: unknown[]): ColumnInfo["type"] {
  const nonNull = values.filter(
    (v) => v !== null && v !== undefined && v !== "",
  );
  if (nonNull.length === 0) return "string";
  let numCount = 0,
    dateCount = 0,
    boolCount = 0;
  for (const v of nonNull) {
    const s = String(v).trim();
    if (s === "true" || s === "false") boolCount++;
    else if (!Number.isNaN(Number(s)) && s !== "") numCount++;
    else if (/^\d{4}-\d{2}-\d{2}/.test(s)) dateCount++;
  }
  const total = nonNull.length;
  if (numCount / total > 0.8) return "number";
  if (dateCount / total > 0.8) return "date";
  if (boolCount / total > 0.8) return "boolean";
  return "string";
}

function computeColumnStats(name: string, values: unknown[]): ColumnInfo {
  const nonNull = values.filter(
    (v) => v !== null && v !== undefined && v !== "",
  );
  const type = inferColumnType(values);
  const nullCount = values.length - nonNull.length;
  const uniqueSet = new Set(nonNull.map((v) => String(v)));
  const info: ColumnInfo = {
    name,
    type,
    nullCount,
    uniqueCount: uniqueSet.size,
    sampleValues: nonNull.slice(0, 5),
  };
  if (type === "number") {
    const nums = nonNull.map((v) => Number(v)).filter((n) => !Number.isNaN(n));
    if (nums.length > 0) {
      info.min = nums.reduce((a, b) => (a < b ? a : b));
      info.max = nums.reduce((a, b) => (a > b ? a : b));
      info.avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    }
  }
  return info;
}

function computeQualityScores(columns: ColumnInfo[], rowCount: number) {
  if (rowCount === 0)
    return {
      completeness: 100,
      accuracy: 100,
      consistency: 100,
      uniqueness: 100,
    };
  const totalCells = columns.length * rowCount;
  const nullCells = columns.reduce((a, c) => a + c.nullCount, 0);
  const completeness = Math.round(
    ((totalCells - nullCells) / totalCells) * 100,
  );
  const accuracy = Math.round(
    (columns.reduce((acc, c) => acc + (rowCount - c.nullCount > 0 ? 1 : 0), 0) /
      columns.length) *
      100,
  );
  const mixedCols = columns.filter((c) => c.type === "mixed").length;
  const consistency = Math.round(
    (1 - mixedCols / Math.max(1, columns.length)) * 100,
  );
  const avgUnique =
    columns.reduce(
      (acc, c) => acc + Math.min(1, c.uniqueCount / Math.max(1, rowCount)),
      0,
    ) / Math.max(1, columns.length);
  const uniqueness = Math.round(avgUnique * 100);
  return { completeness, accuracy, consistency, uniqueness };
}

function StatusStep({
  label,
  status,
  duration,
}: {
  label: string;
  status: "pending" | "active" | "done" | "error";
  duration?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "h-5 w-5 rounded-full flex items-center justify-center flex-none",
          status === "pending" && "bg-zinc-800 border border-zinc-700",
          status === "active" && "bg-blue-500/20 border border-blue-500/50",
          status === "done" && "bg-emerald-500/20 border border-emerald-500/50",
          status === "error" && "bg-red-500/20 border border-red-500/50",
        )}
      >
        {status === "active" && (
          <Loader2 className="h-3 w-3 text-blue-400 animate-spin" />
        )}
        {status === "done" && <Check className="h-3 w-3 text-emerald-400" />}
        {status === "error" && <X className="h-3 w-3 text-red-400" />}
        {status === "pending" && (
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
        )}
      </div>
      <span
        className={cn(
          "text-xs",
          status === "pending" && "text-zinc-600",
          status === "active" && "text-blue-300",
          status === "done" && "text-zinc-300",
          status === "error" && "text-red-300",
        )}
      >
        {label}
      </span>
      {duration !== undefined && status === "done" && (
        <span className="text-[10px] text-zinc-600 ml-auto">{duration}ms</span>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UploadPage() {
  const { addDataset, setActiveDataset, markTableLoaded } = useDataStore();
  const [files, setFiles] = useState<ParsedFileInfo[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("upload");
  const [settings, setSettings] = useState<UploadSettings>({
    delimiter: "auto",
    hasHeader: true,
    encoding: "UTF-8",
    skipEmptyLines: true,
    trimWhitespace: true,
    maxRows: null,
    autoDetectTypes: true,
    loadToDuckDB: true,
  });
  const [uploadHistory] = useState([
    {
      id: "h1",
      name: "Q4_Sales_Report.csv",
      rows: 15420,
      cols: 18,
      date: new Date(Date.now() - 86400000),
      size: 2.4 * 1024 * 1024,
      type: "csv" as FileType,
    },
    {
      id: "h2",
      name: "Customer_Data.xlsx",
      rows: 8341,
      cols: 24,
      date: new Date(Date.now() - 172800000),
      size: 1.8 * 1024 * 1024,
      type: "xlsx" as FileType,
    },
    {
      id: "h3",
      name: "analytics_events.json",
      rows: 42890,
      cols: 12,
      date: new Date(Date.now() - 259200000),
      size: 8.1 * 1024 * 1024,
      type: "json" as FileType,
    },
  ]);

  const selectedFile = files.find((f) => f.id === selectedFileId) ?? null;

  const parseCSV = useCallback(async (content: string, s: UploadSettings) => {
    return new Promise<{ data: Record<string, unknown>[]; errors: string[] }>(
      (resolve) => {
        Papa.parse(content, {
          header: s.hasHeader,
          delimiter: s.delimiter === "auto" ? undefined : s.delimiter,
          skipEmptyLines: s.skipEmptyLines,
          dynamicTyping: s.autoDetectTypes,
          complete: (results) =>
            resolve({
              data: results.data as Record<string, unknown>[],
              errors: results.errors.slice(0, 5).map((e) => e.message),
            }),
          error: (err: { message: string }) =>
            resolve({ data: [], errors: [err.message] }),
        });
      },
    );
  }, []);

  const parseXLSX = useCallback(async (buffer: ArrayBuffer) => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const ws = workbook.worksheets[0];
    const data: Record<string, unknown>[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header row
      const rowData: Record<string, unknown> = {};
      row.eachCell((cell, colNumber) => {
        const header = ws.getRow(1).getCell(colNumber).value as string;
        rowData[header] = cell.value;
      });
      data.push(rowData);
    });
    return data;
  }, []);

  const parseJSON = useCallback(async (content: string) => {
    try {
      const p = JSON.parse(content);
      if (Array.isArray(p)) return p as Record<string, unknown>[];
      for (const k of Object.keys(p))
        if (Array.isArray(p[k])) return p[k] as Record<string, unknown>[];
      return [p] as Record<string, unknown>[];
    } catch {
      return [] as Record<string, unknown>[];
    }
  }, []);

  const processFile = useCallback(
    async (file: File) => {
      const id = `file_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const fileType = detectFileType(file.name);

      const initial: ParsedFileInfo = {
        id,
        name: file.name,
        size: file.size,
        fileType,
        status: "reading",
        progress: 0,
        rowCount: 0,
        columnCount: 0,
        columns: [],
        previewRows: [],
        issues: [],
        parseTime: 0,
        dbTableName: null,
        uploadedAt: new Date(),
        delimiter: ",",
        hasHeader: true,
        encoding: "UTF-8",
        skipEmptyLines: true,
        completeness: 0,
        accuracy: 0,
        consistency: 0,
        uniqueness: 0,
      };

      setFiles((prev) => [...prev, initial]);
      setSelectedFileId(id);
      setActiveTab("progress");

      const update = (patch: Partial<ParsedFileInfo>) =>
        setFiles((prev) =>
          produce(prev, (draft) => {
            const f = draft.find((x) => x.id === id);
            if (f) Object.assign(f, patch);
          }),
        );

      try {
        const t0 = performance.now();
        update({ status: "reading", progress: 10 });
        await new Promise((r) => setTimeout(r, 80));

        let rawData: Record<string, unknown>[] = [];
        let parseErrors: string[] = [];

        update({ status: "parsing", progress: 30 });
        if (fileType === "csv" || fileType === "tsv") {
          const r = await parseCSV(await file.text(), settings);
          rawData = r.data;
          parseErrors = r.errors;
        } else if (fileType === "xlsx") {
          rawData = await parseXLSX(await file.arrayBuffer());
        } else if (fileType === "json") {
          rawData = await parseJSON(await file.text());
        }
        update({ progress: 50 });

        if (settings.maxRows && rawData.length > settings.maxRows)
          rawData = rawData.slice(0, settings.maxRows);
        if (settings.trimWhitespace)
          rawData = rawData.map((row) =>
            Object.fromEntries(
              Object.entries(row).map(([k, v]) => [
                k,
                typeof v === "string" ? v.trim() : v,
              ]),
            ),
          );

        update({ status: "validating", progress: 65 });
        const colNames = rawData.length > 0 ? Object.keys(rawData[0]) : [];
        const columns: ColumnInfo[] = colNames.map((name) =>
          computeColumnStats(
            name,
            rawData.map((r) => r[name]),
          ),
        );
        const issues: ValidationIssue[] = [];

        if (parseErrors.length > 0)
          issues.push({
            severity: "error",
            message: `Parse errors: ${parseErrors[0]}`,
          });
        const highNullCols = columns.filter(
          (c) => c.nullCount / Math.max(1, rawData.length) > 0.3,
        );
        if (highNullCols.length > 0)
          issues.push({
            severity: "warning",
            message: `${highNullCols.length} column(s) have >30% null values`,
            column: highNullCols.map((c) => c.name).join(", "),
          });
        if (rawData.length === 0)
          issues.push({
            severity: "error",
            message: "File is empty or has no parseable data",
          });
        const rowStrings = rawData.map((r) => JSON.stringify(r));
        const dupCount = rowStrings.length - new Set(rowStrings).size;
        if (dupCount > 0)
          issues.push({
            severity: "info",
            message: `${dupCount} duplicate rows detected`,
            affectedRows: dupCount,
          });

        update({ progress: 80 });
        const quality = computeQualityScores(columns, rawData.length);

        let dbTableName: string | null = null;
        if (settings.loadToDuckDB && rawData.length > 0) {
          update({ status: "loading_db", progress: 90 });
          const tableName = file.name
            .replace(/[^a-zA-Z0-9]/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_|_$/g, "")
            .toLowerCase();
          try {
            await loadJSONToDuckDB(tableName, rawData);
            dbTableName = tableName;
            markTableLoaded(tableName);
            // Register in DataStore so AI panel and other pages can see it
            const dsId = `ds_${id}`;
            const dsCols: ColMeta[] = columns.map((c) => ({
              name: c.name,
              type:
                c.type === "mixed"
                  ? "string"
                  : c.type === "boolean"
                    ? "boolean"
                    : c.type,
              nullCount: c.nullCount,
              distinctCount: c.uniqueCount,
              min: c.min,
              max: c.max,
              mean: c.avg,
              sample: c.sampleValues.slice(0, 5),
            }));
            const ds: Dataset = {
              id: dsId,
              name: file.name.replace(/\.[^.]+$/, ""),
              tableName,
              source: "upload",
              format:
                fileType === "xlsx"
                  ? "excel"
                  : fileType === "json"
                    ? "json"
                    : "csv",
              rowCount: rawData.length,
              colCount: colNames.length,
              sizeBytes: file.size,
              columns: dsCols,
              tags: [],
              description: "",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              qualityScore: quality.completeness,
            };
            addDataset(ds);
            setActiveDataset(dsId);
          } catch (e) {
            issues.push({
              severity: "warning",
              message: `DuckDB load: ${String(e).slice(0, 60)}`,
            });
          }
        }

        update({
          status: "done",
          progress: 100,
          rowCount: rawData.length,
          columnCount: colNames.length,
          columns,
          previewRows: rawData.slice(0, 50),
          issues,
          parseTime: Math.round(performance.now() - t0),
          dbTableName,
          ...quality,
        });
      } catch (err) {
        update({ status: "error", error: String(err), progress: 0 });
      }
    },
    [
      settings,
      parseCSV,
      parseXLSX,
      parseJSON,
      addDataset,
      setActiveDataset,
      markTableLoaded,
    ],
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      for (const file of acceptedFiles) processFile(file);
    },
    [processFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv", ".tsv", ".txt"],
      "application/json": [".json"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
      "application/vnd.ms-excel": [".xls"],
    },
    multiple: true,
  });

  const totalStorageUsed = useMemo(
    () =>
      files.filter((f) => f.status === "done").reduce((a, f) => a + f.size, 0),
    [files],
  );

  function getStepStatus(
    file: ParsedFileInfo,
    step: UploadStatus,
  ): "pending" | "active" | "done" | "error" {
    const order: UploadStatus[] = [
      "reading",
      "parsing",
      "validating",
      "loading_db",
      "done",
    ];
    if (file.status === "error") return "pending";
    const ci = order.indexOf(file.status),
      si = order.indexOf(step);
    if (file.status === "done") return "done";
    if (si < ci) return "done";
    if (si === ci) return "active";
    return "pending";
  }

  const nullRateOption = useMemo(() => {
    if (!selectedFile || selectedFile.columns.length === 0) return {};
    const cols = selectedFile.columns.slice(0, 15);
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#18181b",
        borderColor: "#3f3f46",
        textStyle: { color: "#e4e4e7", fontSize: 11 },
      },
      grid: { top: 10, right: 20, bottom: 60, left: 20, containLabel: true },
      xAxis: {
        type: "category",
        data: cols.map((c) => c.name),
        axisLabel: { color: "#71717a", fontSize: 9, rotate: 35 },
        axisLine: { lineStyle: { color: "#3f3f46" } },
      },
      yAxis: {
        type: "value",
        name: "Null %",
        nameTextStyle: { color: "#71717a", fontSize: 10 },
        axisLabel: { color: "#71717a", fontSize: 10, formatter: "{value}%" },
        max: 100,
        splitLine: { lineStyle: { color: "#27272a" } },
      },
      series: [
        {
          type: "bar",
          data: cols.map((c) =>
            Math.round(
              (c.nullCount / Math.max(1, selectedFile.rowCount)) * 100,
            ),
          ),
          itemStyle: {
            color: (p: { data: number }) =>
              p.data > 30 ? "#ef4444" : p.data > 10 ? "#f59e0b" : "#10b981",
            borderRadius: [2, 2, 0, 0],
          },
        },
      ],
    };
  }, [selectedFile]);

  const columnTypeOption = useMemo(() => {
    if (!selectedFile) return {};
    const typeCounts = selectedFile.columns.reduce(
      (acc, c) => {
        acc[c.type] = (acc[c.type] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    const colorMap: Record<string, string> = {
      string: "#3b82f6",
      number: "#10b981",
      date: "#8b5cf6",
      boolean: "#f59e0b",
      mixed: "#ef4444",
    };
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: "#18181b",
        borderColor: "#3f3f46",
        textStyle: { color: "#e4e4e7" },
      },
      series: [
        {
          type: "pie",
          radius: ["40%", "70%"],
          data: Object.entries(typeCounts).map(([name, value]) => ({
            name,
            value,
            itemStyle: { color: colorMap[name] ?? "#71717a" },
          })),
          itemStyle: { borderColor: "#09090b", borderWidth: 2 },
          label: { color: "#a1a1aa", fontSize: 11 },
        },
      ],
    };
  }, [selectedFile]);

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Header */}
      <div className="flex-none border-b border-zinc-800 bg-zinc-950/95 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Upload className="h-3.5 w-3.5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">File Upload & Parser</h1>
            <p className="text-[10px] text-zinc-500">
              {files.filter((f) => f.status === "done").length} files loaded ·{" "}
              {formatBytes(totalStorageUsed)} in memory
            </p>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5">
            {files.filter((f) => f.status === "done").length > 0 && (
              <Badge
                variant="outline"
                className="text-[11px] border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {files.filter((f) => f.status === "done").length} ready
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs border-zinc-800 bg-zinc-900 gap-1.5"
              onClick={() => setFiles([])}
              disabled={files.length === 0}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear All
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* File list sidebar */}
        <div className="w-64 flex-none border-r border-zinc-800 flex flex-col">
          <div className="flex-none px-3 py-2.5 border-b border-zinc-800">
            <p className="text-xs font-medium text-zinc-400">
              Files ({files.length})
            </p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {files.length === 0 && (
                <div className="py-8 text-center">
                  <File className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                  <p className="text-xs text-zinc-600">No files yet</p>
                </div>
              )}
              <AnimatePresence>
                {files.map((file) => (
                  <motion.button
                    key={file.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    onClick={() => {
                      setSelectedFileId(file.id);
                      if (file.status === "done") setActiveTab("preview");
                    }}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border transition-all",
                      selectedFileId === file.id
                        ? "border-blue-500/40 bg-blue-500/5"
                        : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {getFileIcon(file.fileType)}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-zinc-200 truncate">
                          {file.name}
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          {formatBytes(file.size)}
                        </p>
                      </div>
                      {file.status === "done" && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-none" />
                      )}
                      {file.status === "error" && (
                        <XCircle className="h-3.5 w-3.5 text-red-400 flex-none" />
                      )}
                      {[
                        "reading",
                        "parsing",
                        "validating",
                        "loading_db",
                      ].includes(file.status) && (
                        <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin flex-none" />
                      )}
                    </div>
                    {[
                      "reading",
                      "parsing",
                      "validating",
                      "loading_db",
                    ].includes(file.status) && (
                      <Progress value={file.progress} className="h-1 mt-2" />
                    )}
                    {file.status === "done" && (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] text-zinc-500">
                          {file.rowCount.toLocaleString()}r
                        </span>
                        <span className="text-[10px] text-zinc-600">·</span>
                        <span className="text-[10px] text-zinc-500">
                          {file.columnCount}c
                        </span>
                        {file.dbTableName && (
                          <>
                            <span className="text-[10px] text-zinc-600">·</span>
                            <Database className="h-2.5 w-2.5 text-emerald-500/60" />
                          </>
                        )}
                      </div>
                    )}
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          </ScrollArea>
          <div className="flex-none border-t border-zinc-800 p-3">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">
              Recent
            </p>
            <div className="space-y-1.5">
              {uploadHistory.slice(0, 3).map((h) => (
                <div key={h.id} className="flex items-center gap-2">
                  {getFileIcon(h.type)}
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-zinc-400 truncate">
                      {h.name}
                    </p>
                    <p className="text-[9px] text-zinc-600">
                      {h.rows.toLocaleString()}r · {h.date.toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="flex-none border-b border-zinc-800 px-4">
              <TabsList className="bg-transparent border-0 h-10 gap-0 p-0">
                {[
                  {
                    value: "upload",
                    label: "Upload",
                    icon: <Upload className="h-3.5 w-3.5 text-sky-400" />,
                    activeColor: "data-[state=active]:border-sky-500 data-[state=active]:text-sky-300",
                  },
                  {
                    value: "progress",
                    label: "Progress",
                    icon: <Activity className="h-3.5 w-3.5 text-emerald-400" />,
                    activeColor: "data-[state=active]:border-emerald-500 data-[state=active]:text-emerald-300",
                  },
                  {
                    value: "preview",
                    label: "Preview",
                    icon: <Eye className="h-3.5 w-3.5 text-violet-400" />,
                    activeColor: "data-[state=active]:border-violet-500 data-[state=active]:text-violet-300",
                  },
                  {
                    value: "quality",
                    label: "Quality",
                    icon: <Sparkles className="h-3.5 w-3.5 text-amber-400" />,
                    activeColor: "data-[state=active]:border-amber-500 data-[state=active]:text-amber-300",
                  },
                  {
                    value: "analytics",
                    label: "Analytics",
                    icon: <BarChart2 className="h-3.5 w-3.5 text-orange-400" />,
                    activeColor: "data-[state=active]:border-orange-500 data-[state=active]:text-orange-300",
                  },
                  {
                    value: "settings",
                    label: "Settings",
                    icon: <Settings2 className="h-3.5 w-3.5 text-zinc-400" />,
                    activeColor: "data-[state=active]:border-zinc-400 data-[state=active]:text-zinc-200",
                  },
                ].map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className={cn(
                      "h-10 px-4 text-xs rounded-none border-b-2 border-transparent data-[state=active]:bg-transparent",
                      "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40 gap-1.5 transition-colors",
                      tab.activeColor,
                    )}
                  >
                    {tab.icon}
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* UPLOAD TAB */}
            <TabsContent
              value="upload"
              className="flex-1 overflow-auto p-6 m-0"
            >
              <div className="max-w-3xl mx-auto space-y-6">
                <div
                  {...getRootProps()}
                  className={cn(
                    "relative border-2 border-dashed rounded-2xl transition-all duration-200 cursor-pointer",
                    isDragActive
                      ? "border-blue-500 bg-blue-500/5 scale-[1.01]"
                      : "border-zinc-700 bg-zinc-900/30 hover:border-zinc-600 hover:bg-zinc-900/50",
                  )}
                >
                  <input {...getInputProps()} />
                  <div className="py-16 flex flex-col items-center gap-4">
                    <motion.div
                      animate={
                        isDragActive
                          ? { scale: 1.1, y: -4 }
                          : { scale: 1, y: 0 }
                      }
                      className={cn(
                        "h-16 w-16 rounded-2xl flex items-center justify-center",
                        isDragActive
                          ? "bg-blue-500/20 border border-blue-500/40"
                          : "bg-zinc-800 border border-zinc-700",
                      )}
                    >
                      <Upload
                        className={cn(
                          "h-7 w-7",
                          isDragActive ? "text-blue-400" : "text-zinc-500",
                        )}
                      />
                    </motion.div>
                    <div className="text-center">
                      <p className="text-base font-medium text-zinc-200">
                        {isDragActive
                          ? "Drop files to upload"
                          : "Drag & drop files here"}
                      </p>
                      <p className="text-sm text-zinc-500 mt-1">
                        or{" "}
                        <span className="text-blue-400 underline underline-offset-2">
                          browse files
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      {[
                        { ext: "CSV", c: "emerald" },
                        { ext: "TSV", c: "emerald" },
                        { ext: "JSON", c: "blue" },
                        { ext: "XLSX", c: "green" },
                      ].map(({ ext, c }) => (
                        <Badge
                          key={ext}
                          variant="outline"
                          className={cn(
                            "text-[11px]",
                            c === "emerald" &&
                              "border-emerald-500/30 text-emerald-400",
                            c === "blue" && "border-blue-500/30 text-blue-400",
                            c === "green" &&
                              "border-green-500/30 text-green-400",
                          )}
                        >
                          .{ext}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-zinc-600">
                      Multiple files · Auto-type detection · DuckDB SQL ready
                    </p>
                  </div>
                </div>

                {files.filter((f) => f.status === "done").length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      {
                        label: "Files Loaded",
                        value: files.filter((f) => f.status === "done").length,
                        icon: <FileCheck className="h-4 w-4" />,
                        color: "emerald",
                      },
                      {
                        label: "Total Rows",
                        value: files
                          .filter((f) => f.status === "done")
                          .reduce((a, f) => a + f.rowCount, 0)
                          .toLocaleString(),
                        icon: <Hash className="h-4 w-4" />,
                        color: "blue",
                      },
                      {
                        label: "In DuckDB",
                        value: files.filter(
                          (f) => f.status === "done" && f.dbTableName,
                        ).length,
                        icon: <Database className="h-4 w-4" />,
                        color: "purple",
                      },
                      {
                        label: "Memory Used",
                        value: formatBytes(totalStorageUsed),
                        icon: <HardDrive className="h-4 w-4" />,
                        color: "amber",
                      },
                    ].map((s) => (
                      <motion.div
                        key={s.label}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          "bg-zinc-900 border rounded-xl p-4",
                          s.color === "emerald" && "border-emerald-500/20",
                          s.color === "blue" && "border-blue-500/20",
                          s.color === "purple" && "border-purple-500/20",
                          s.color === "amber" && "border-amber-500/20",
                        )}
                      >
                        <div
                          className={cn(
                            "h-7 w-7 rounded-lg flex items-center justify-center mb-2",
                            s.color === "emerald" &&
                              "bg-emerald-500/10 text-emerald-400",
                            s.color === "blue" &&
                              "bg-blue-500/10 text-blue-400",
                            s.color === "purple" &&
                              "bg-purple-500/10 text-purple-400",
                            s.color === "amber" &&
                              "bg-amber-500/10 text-amber-400",
                          )}
                        >
                          {s.icon}
                        </div>
                        <p className="text-xl font-bold text-zinc-100">
                          {s.value}
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          {s.label}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* PROGRESS TAB */}
            <TabsContent
              value="progress"
              className="flex-1 overflow-auto p-6 m-0"
            >
              {!selectedFile ? (
                <div className="flex items-center justify-center h-full text-zinc-500">
                  <div className="text-center">
                    <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Upload a file to see progress</p>
                  </div>
                </div>
              ) : (
                <div className="max-w-2xl mx-auto space-y-6">
                  <div className="flex items-start gap-4 p-4 bg-zinc-900 rounded-xl border border-zinc-800">
                    {getFileIcon(selectedFile.fileType)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-200">
                        {selectedFile.name}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[11px] text-zinc-500">
                          {formatBytes(selectedFile.size)}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] border-zinc-700 text-zinc-400"
                        >
                          {selectedFile.fileType.toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[11px]",
                        selectedFile.status === "done" &&
                          "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
                        selectedFile.status === "error" &&
                          "border-red-500/30 bg-red-500/10 text-red-400",
                        [
                          "reading",
                          "parsing",
                          "validating",
                          "loading_db",
                        ].includes(selectedFile.status) &&
                          "border-blue-500/30 bg-blue-500/10 text-blue-400",
                      )}
                    >
                      {selectedFile.status === "done"
                        ? "Complete"
                        : selectedFile.status === "error"
                          ? "Failed"
                          : "Processing…"}
                    </Badge>
                  </div>

                  {["reading", "parsing", "validating", "loading_db"].includes(
                    selectedFile.status,
                  ) && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400 capitalize">
                          {selectedFile.status.replace("_", " ")}…
                        </span>
                        <span className="text-zinc-500">
                          {selectedFile.progress}%
                        </span>
                      </div>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <motion.div
                          animate={{ width: `${selectedFile.progress}%` }}
                          transition={{ duration: 0.3 }}
                          className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full"
                        />
                      </div>
                    </div>
                  )}

                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">
                        Processing Pipeline
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {[
                        {
                          step: "reading" as UploadStatus,
                          label: "Reading file",
                        },
                        {
                          step: "parsing" as UploadStatus,
                          label: `Parsing ${selectedFile.fileType.toUpperCase()} data`,
                        },
                        {
                          step: "validating" as UploadStatus,
                          label: "Validating & detecting types",
                        },
                        {
                          step: "loading_db" as UploadStatus,
                          label: "Loading into DuckDB WASM",
                        },
                        {
                          step: "done" as UploadStatus,
                          label: "Ready for analysis",
                        },
                      ].map(({ step, label }) => (
                        <StatusStep
                          key={step}
                          label={label}
                          status={getStepStatus(selectedFile, step)}
                          duration={
                            step === "done" && selectedFile.status === "done"
                              ? selectedFile.parseTime
                              : undefined
                          }
                        />
                      ))}
                    </CardContent>
                  </Card>

                  {selectedFile.status === "error" && (
                    <div className="p-4 bg-red-950/30 border border-red-500/30 rounded-xl">
                      <div className="flex items-start gap-2">
                        <XCircle className="h-4 w-4 text-red-400 flex-none mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-red-300">
                            Processing Failed
                          </p>
                          <p className="text-xs text-red-400/70 mt-1 font-mono">
                            {selectedFile.error}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedFile.status === "done" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          {
                            label: "Rows Parsed",
                            value: selectedFile.rowCount.toLocaleString(),
                            icon: <Hash className="h-4 w-4" />,
                          },
                          {
                            label: "Columns",
                            value: selectedFile.columnCount,
                            icon: <Layers className="h-4 w-4" />,
                          },
                          {
                            label: "Parse Time",
                            value: `${selectedFile.parseTime}ms`,
                            icon: <Zap className="h-4 w-4" />,
                          },
                          {
                            label: "DuckDB Table",
                            value: selectedFile.dbTableName ?? "—",
                            icon: <Database className="h-4 w-4" />,
                          },
                        ].map((s) => (
                          <div
                            key={s.label}
                            className="bg-zinc-800/50 rounded-lg p-3 flex items-center gap-3"
                          >
                            <div className="h-8 w-8 rounded-lg bg-zinc-700 flex items-center justify-center text-zinc-400 flex-none">
                              {s.icon}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-zinc-200">
                                {s.value}
                              </p>
                              <p className="text-[10px] text-zinc-500">
                                {s.label}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {selectedFile.issues.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-zinc-400">
                            Validation Results
                          </p>
                          {selectedFile.issues.map((issue, i) => (
                            <div
                              key={i}
                              className={cn(
                                "flex items-start gap-2 p-3 rounded-lg text-xs",
                                issue.severity === "error" &&
                                  "bg-red-950/30 border border-red-500/20 text-red-300",
                                issue.severity === "warning" &&
                                  "bg-amber-950/30 border border-amber-500/20 text-amber-300",
                                issue.severity === "info" &&
                                  "bg-blue-950/30 border border-blue-500/20 text-blue-300",
                              )}
                            >
                              {issue.severity === "error" && (
                                <XCircle className="h-3.5 w-3.5 flex-none mt-0.5" />
                              )}
                              {issue.severity === "warning" && (
                                <AlertTriangle className="h-3.5 w-3.5 flex-none mt-0.5" />
                              )}
                              {issue.severity === "info" && (
                                <Info className="h-3.5 w-3.5 flex-none mt-0.5" />
                              )}
                              <span>{issue.message}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 h-8 text-xs bg-blue-600 hover:bg-blue-500"
                          onClick={() => setActiveTab("preview")}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1.5" />
                          Preview Data
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-8 text-xs border-zinc-800"
                          onClick={() => setActiveTab("quality")}
                        >
                          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                          Quality Report
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* PREVIEW TAB */}
            <TabsContent
              value="preview"
              className="flex-1 overflow-hidden m-0 flex flex-col"
            >
              {!selectedFile || selectedFile.status !== "done" ? (
                <div className="flex-1 flex items-center justify-center text-zinc-500">
                  <div className="text-center">
                    <Eye className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">
                      Upload and select a file to preview
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex-none px-4 py-2.5 border-b border-zinc-800 flex items-center gap-3">
                    <span className="text-xs text-zinc-400">
                      First {selectedFile.previewRows.length} of{" "}
                      {selectedFile.rowCount.toLocaleString()} rows
                    </span>
                    <div className="flex-1" />
                    {selectedFile.dbTableName && (
                      <Badge
                        variant="outline"
                        className="text-[11px] border-emerald-500/30 bg-emerald-500/10 text-emerald-400 gap-1"
                      >
                        <Database className="h-2.5 w-2.5" />
                        {selectedFile.dbTableName}
                      </Badge>
                    )}
                  </div>
                  <div className="flex-1 overflow-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead className="sticky top-0 bg-zinc-900 z-10">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-zinc-500 border-b border-r border-zinc-800 w-10">
                            #
                          </th>
                          {selectedFile.columns.map((col) => (
                            <th
                              key={col.name}
                              className="px-3 py-2 text-left border-b border-r border-zinc-800 whitespace-nowrap"
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-zinc-300">
                                  {col.name}
                                </span>
                                <span
                                  className={cn(
                                    "text-[9px] px-1.5 py-0.5 rounded font-mono",
                                    col.type === "number" &&
                                      "bg-emerald-500/15 text-emerald-400",
                                    col.type === "string" &&
                                      "bg-blue-500/15 text-blue-400",
                                    col.type === "date" &&
                                      "bg-purple-500/15 text-purple-400",
                                    col.type === "boolean" &&
                                      "bg-amber-500/15 text-amber-400",
                                    col.type === "mixed" &&
                                      "bg-red-500/15 text-red-400",
                                  )}
                                >
                                  {col.type}
                                </span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedFile.previewRows.map((row, i) => (
                          <tr
                            key={i}
                            className={cn(
                              "border-b border-zinc-800/30 hover:bg-zinc-900/60",
                              i % 2 === 1 && "bg-zinc-900/20",
                            )}
                          >
                            <td className="px-3 py-1.5 text-zinc-600 font-mono border-r border-zinc-800/30 text-center">
                              {i + 1}
                            </td>
                            {selectedFile.columns.map((col) => {
                              const val = row[col.name];
                              return (
                                <td
                                  key={col.name}
                                  className={cn(
                                    "px-3 py-1.5 border-r border-zinc-800/20 font-mono whitespace-nowrap max-w-[200px] overflow-hidden text-ellipsis",
                                    val === null || val === undefined
                                      ? "text-zinc-700 italic"
                                      : col.type === "number"
                                        ? "text-emerald-300 text-right"
                                        : col.type === "date"
                                          ? "text-purple-300"
                                          : "text-zinc-300",
                                  )}
                                >
                                  {val === null || val === undefined
                                    ? "NULL"
                                    : typeof val === "number"
                                      ? val.toLocaleString("en-US", {
                                          maximumFractionDigits: 4,
                                        })
                                      : String(val)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* QUALITY TAB */}
            <TabsContent
              value="quality"
              className="flex-1 overflow-auto p-6 m-0"
            >
              {!selectedFile || selectedFile.status !== "done" ? (
                <div className="flex items-center justify-center h-full text-zinc-500">
                  <div className="text-center">
                    <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">
                      Upload a file to see quality metrics
                    </p>
                  </div>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      {
                        label: "Completeness",
                        score: selectedFile.completeness,
                        desc: "Non-null values",
                      },
                      {
                        label: "Accuracy",
                        score: selectedFile.accuracy,
                        desc: "Valid data types",
                      },
                      {
                        label: "Consistency",
                        score: selectedFile.consistency,
                        desc: "Uniform formats",
                      },
                      {
                        label: "Uniqueness",
                        score: selectedFile.uniqueness,
                        desc: "Distinct values",
                      },
                    ].map((q) => (
                      <Card
                        key={q.label}
                        className="bg-zinc-900 border-zinc-800"
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-medium text-zinc-400">
                              {q.label}
                            </span>
                            <span
                              className={cn(
                                "text-lg font-bold",
                                q.score >= 90
                                  ? "text-emerald-400"
                                  : q.score >= 70
                                    ? "text-yellow-400"
                                    : "text-red-400",
                              )}
                            >
                              {q.score}%
                            </span>
                          </div>
                          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-2">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${q.score}%` }}
                              transition={{ delay: 0.3, duration: 0.8 }}
                              className={cn(
                                "h-full rounded-full",
                                q.score >= 90
                                  ? "bg-emerald-500"
                                  : q.score >= 70
                                    ? "bg-yellow-500"
                                    : "bg-red-500",
                              )}
                            />
                          </div>
                          <p className="text-[10px] text-zinc-600">{q.desc}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">
                        Null Rate by Column
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ReactECharts
                        option={nullRateOption}
                        style={{ height: 200 }}
                        opts={{ renderer: "canvas" }}
                      />
                    </CardContent>
                  </Card>

                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Column Profiles</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {selectedFile.columns.map((col) => {
                          const nullRate =
                            (col.nullCount /
                              Math.max(1, selectedFile.rowCount)) *
                            100;
                          const uniqueRate =
                            (col.uniqueCount /
                              Math.max(1, selectedFile.rowCount)) *
                            100;
                          return (
                            <div
                              key={col.name}
                              className="p-3 bg-zinc-800/40 rounded-lg border border-zinc-700/30"
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-sm font-medium text-zinc-200">
                                  {col.name}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[10px]",
                                    col.type === "number" &&
                                      "border-emerald-500/30 text-emerald-400",
                                    col.type === "string" &&
                                      "border-blue-500/30 text-blue-400",
                                    col.type === "date" &&
                                      "border-purple-500/30 text-purple-400",
                                    col.type === "boolean" &&
                                      "border-amber-500/30 text-amber-400",
                                  )}
                                >
                                  {col.type}
                                </Badge>
                                {col.nullCount > 0 && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] border-amber-500/20 text-amber-400"
                                  >
                                    {col.nullCount} nulls
                                  </Badge>
                                )}
                                <div className="flex-1" />
                                {col.sampleValues.length > 0 && (
                                  <span className="text-[10px] text-zinc-500 truncate max-w-[180px]">
                                    e.g.{" "}
                                    {col.sampleValues
                                      .slice(0, 3)
                                      .map((v) => String(v))
                                      .join(", ")}
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <div className="flex justify-between mb-1">
                                    <span className="text-[10px] text-zinc-600">
                                      Null Rate
                                    </span>
                                    <span
                                      className={cn(
                                        "text-[10px]",
                                        nullRate > 30
                                          ? "text-red-400"
                                          : nullRate > 10
                                            ? "text-amber-400"
                                            : "text-emerald-400",
                                      )}
                                    >
                                      {nullRate.toFixed(1)}%
                                    </span>
                                  </div>
                                  <div className="h-1 bg-zinc-700 rounded-full overflow-hidden">
                                    <div
                                      className={cn(
                                        "h-full rounded-full",
                                        nullRate > 30
                                          ? "bg-red-500"
                                          : nullRate > 10
                                            ? "bg-amber-500"
                                            : "bg-emerald-500",
                                      )}
                                      style={{
                                        width: `${Math.min(100, nullRate)}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                                <div>
                                  <div className="flex justify-between mb-1">
                                    <span className="text-[10px] text-zinc-600">
                                      Uniqueness
                                    </span>
                                    <span className="text-[10px] text-blue-400">
                                      {uniqueRate.toFixed(1)}%
                                    </span>
                                  </div>
                                  <div className="h-1 bg-zinc-700 rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-blue-500"
                                      style={{
                                        width: `${Math.min(100, uniqueRate)}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                              {col.type === "number" &&
                                col.min !== undefined && (
                                  <div className="grid grid-cols-3 gap-2 mt-2">
                                    {[
                                      ["Min", col.min],
                                      ["Max", col.max],
                                      ["Avg", col.avg],
                                    ].map(([label, val]) => (
                                      <div
                                        key={String(label)}
                                        className="text-[10px]"
                                      >
                                        <span className="text-zinc-600">
                                          {label}:{" "}
                                        </span>
                                        <span className="text-zinc-300 font-mono">
                                          {Number(val).toLocaleString("en-US", {
                                            maximumFractionDigits: 2,
                                          })}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            {/* ANALYTICS TAB */}
            <TabsContent
              value="analytics"
              className="flex-1 overflow-auto p-6 m-0"
            >
              {files.filter((f) => f.status === "done").length === 0 ? (
                <div className="flex items-center justify-center h-full text-zinc-500">
                  <div className="text-center">
                    <BarChart2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Upload files to see analytics</p>
                  </div>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {selectedFile && selectedFile.columns.length > 0 && (
                      <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">
                            Column Types — {selectedFile.name}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ReactECharts
                            option={columnTypeOption}
                            style={{ height: 200 }}
                            opts={{ renderer: "canvas" }}
                          />
                        </CardContent>
                      </Card>
                    )}
                    <Card className="bg-zinc-900 border-zinc-800">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">
                          Loaded Files Summary
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {files
                            .filter((f) => f.status === "done")
                            .map((f) => (
                              <div
                                key={f.id}
                                className="flex items-center gap-3 p-3 bg-zinc-800/40 rounded-lg hover:bg-zinc-800/60 cursor-pointer transition-colors"
                                onClick={() => {
                                  setSelectedFileId(f.id);
                                  setActiveTab("quality");
                                }}
                              >
                                {getFileIcon(f.fileType)}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-zinc-200 truncate">
                                    {f.name}
                                  </p>
                                  <p className="text-[10px] text-zinc-500">
                                    {f.rowCount.toLocaleString()}r ·{" "}
                                    {f.columnCount}c · {formatBytes(f.size)}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p
                                    className={cn(
                                      "text-xs font-bold",
                                      f.completeness >= 90
                                        ? "text-emerald-400"
                                        : f.completeness >= 70
                                          ? "text-amber-400"
                                          : "text-red-400",
                                    )}
                                  >
                                    {Math.round(
                                      (f.completeness +
                                        f.accuracy +
                                        f.consistency +
                                        f.uniqueness) /
                                        4,
                                    )}
                                    %
                                  </p>
                                  <p className="text-[9px] text-zinc-600">
                                    quality
                                  </p>
                                </div>
                                {f.dbTableName && (
                                  <Database className="h-4 w-4 text-emerald-500/60" />
                                )}
                              </div>
                            ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* SETTINGS TAB */}
            <TabsContent
              value="settings"
              className="flex-1 overflow-auto p-6 m-0"
            >
              <div className="max-w-xl mx-auto space-y-6">
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Parse Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-zinc-400">
                        CSV Delimiter
                      </Label>
                      <Select
                        value={settings.delimiter}
                        onValueChange={(v) =>
                          v &&
                          setSettings((p) => ({
                            ...p,
                            delimiter: v as UploadSettings["delimiter"],
                          }))
                        }
                      >
                        <SelectTrigger className="h-8 text-xs bg-zinc-800 border-zinc-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800">
                          <SelectItem value="auto" className="text-xs">
                            Auto-detect
                          </SelectItem>
                          <SelectItem value="," className="text-xs">
                            Comma (,)
                          </SelectItem>
                          <SelectItem value=";" className="text-xs">
                            Semicolon (;)
                          </SelectItem>
                          <SelectItem value={"\t"} className="text-xs">
                            Tab (TSV)
                          </SelectItem>
                          <SelectItem value="|" className="text-xs">
                            Pipe (|)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-zinc-400">
                        Max Rows (empty = unlimited)
                      </Label>
                      <Input
                        type="number"
                        placeholder="All rows"
                        value={settings.maxRows ?? ""}
                        onChange={(e) =>
                          setSettings((p) => ({
                            ...p,
                            maxRows: e.target.value
                              ? Number(e.target.value)
                              : null,
                          }))
                        }
                        className="h-8 text-xs bg-zinc-800 border-zinc-700"
                      />
                    </div>
                    <Separator className="bg-zinc-800" />
                    {[
                      {
                        key: "hasHeader" as const,
                        label: "First row is header",
                      },
                      {
                        key: "skipEmptyLines" as const,
                        label: "Skip empty lines",
                      },
                      {
                        key: "trimWhitespace" as const,
                        label: "Trim whitespace",
                      },
                      {
                        key: "autoDetectTypes" as const,
                        label: "Auto-detect column types",
                      },
                      {
                        key: "loadToDuckDB" as const,
                        label: "Load into DuckDB WASM",
                      },
                    ].map(({ key, label }) => (
                      <div
                        key={key}
                        className="flex items-center justify-between"
                      >
                        <Label className="text-xs text-zinc-300">{label}</Label>
                        <Switch
                          checked={settings[key] as boolean}
                          onCheckedChange={(v) =>
                            setSettings((p) => ({ ...p, [key]: v }))
                          }
                          className="scale-75"
                        />
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      DuckDB Integration
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-xs text-zinc-300">
                        DuckDB WASM engine active
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">
                      Files loaded with DuckDB enabled can be queried with SQL
                      in the Browser page. Table names are auto-derived from
                      file names.
                    </p>
                    <div className="bg-zinc-800/60 rounded-lg p-3 font-mono text-xs text-emerald-300">
                      SELECT * FROM "my_file" LIMIT 100;
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
