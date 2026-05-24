"use client";

import ReactECharts from "echarts-for-react";
import { produce } from "immer";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  BarChart2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Code2,
  Copy,
  Database,
  Download,
  Eye,
  Filter,
  GripVertical,
  Hash,
  Loader2,
  Merge,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings2,
  Sparkles,
  Split,
  Table2,
  Trash2,
  Type,
  XCircle,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActivityStore } from "@/core/stores/activity-store";
import { useAppContextStore } from "@/core/stores/app-context-store";
import { useDataStore } from "@/core/stores/data-store";
import { runQuery } from "@/platform/duckdb/duckdb";
import { cn } from "@/shared/utils";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="h-40 bg-zinc-950 rounded flex items-center justify-center text-zinc-600 text-xs">
      <Loader2 className="h-4 w-4 animate-spin mr-2" />
      Loading editor…
    </div>
  ),
});

// ─── Types ────────────────────────────────────────────────────────────────────

type StepType =
  | "filter"
  | "select"
  | "rename"
  | "derive"
  | "aggregate"
  | "sort"
  | "deduplicate"
  | "limit"
  | "join"
  | "pivot";
type StepStatus = "idle" | "running" | "done" | "error" | "skipped";

interface TransformStep {
  id: string;
  type: StepType;
  label: string;
  enabled: boolean;
  status: StepStatus;
  config: Record<string, unknown>;
  inputRows?: number;
  outputRows?: number;
  duration?: number;
  error?: string;
  sql?: string;
}

interface RunHistoryEntry {
  id: string;
  timestamp: Date;
  steps: number;
  inputRows: number;
  outputRows: number;
  duration: number;
  success: boolean;
}

const STEP_COLORS: Record<StepType, string> = {
  filter: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  select: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  rename: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  derive: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  aggregate: "text-pink-400 bg-pink-500/10 border-pink-500/20",
  sort: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  deduplicate: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  limit: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
  join: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  pivot: "text-rose-400 bg-rose-500/10 border-rose-500/20",
};

const STEP_ICONS: Record<StepType, React.ReactNode> = {
  filter: <Filter className="h-3.5 w-3.5" />,
  select: <Table2 className="h-3.5 w-3.5" />,
  rename: <Type className="h-3.5 w-3.5" />,
  derive: <Sparkles className="h-3.5 w-3.5" />,
  aggregate: <BarChart2 className="h-3.5 w-3.5" />,
  sort: <ArrowUpDown className="h-3.5 w-3.5" />,
  deduplicate: <Copy className="h-3.5 w-3.5" />,
  limit: <Hash className="h-3.5 w-3.5" />,
  join: <Merge className="h-3.5 w-3.5" />,
  pivot: <Split className="h-3.5 w-3.5" />,
};

function stepToSQL(step: TransformStep, prevTable: string): string {
  const c = step.config;
  const source = `"${prevTable.replace('"', '""')}"`;
  switch (step.type) {
    case "filter":
      return `SELECT * FROM ${source} WHERE ${String(c.condition ?? "1=1")}`;
    case "select":
      return `SELECT ${String(c.columns ?? "*")} FROM ${source}`;
    case "rename":
      return `SELECT *, ${String(c.expression ?? "1")} AS "${String(c.alias ?? "new_col")}" FROM ${source}`;
    case "derive":
      return `SELECT *, ${String(c.expression ?? "1")} AS "${String(c.alias ?? "derived")}" FROM ${source}`;
    case "aggregate": {
      const groupBy = String(c.groupBy ?? "").trim();
      const agg = String(c.agg ?? "COUNT(*) as count");
      return groupBy
        ? `SELECT ${groupBy}, ${agg} FROM ${source} GROUP BY ${groupBy}`
        : `SELECT ${agg} FROM ${source}`;
    }
    case "sort":
      return c.column
        ? `SELECT * FROM ${source} ORDER BY ${String(c.column)} ${String(c.direction ?? "ASC")}`
        : `SELECT * FROM ${source}`;
    case "deduplicate":
      return `SELECT DISTINCT * FROM ${source}`;
    case "limit":
      return `SELECT * FROM ${source} LIMIT ${String(c.count ?? 1000)}`;
    default:
      return `SELECT * FROM ${source}`;
  }
}

// ─── Step Card ────────────────────────────────────────────────────────────────

function StepCard({
  step,
  index,
  isActive,
  onSelect,
  onToggle,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  step: TransformStep;
  index: number;
  isActive: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className={cn(
        "border rounded-xl p-3 cursor-pointer transition-all group",
        isActive
          ? "border-blue-500/40 bg-blue-500/5"
          : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700",
        !step.enabled && "opacity-50",
      )}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp();
            }}
            disabled={!canMoveUp}
            className="hover:text-zinc-300 disabled:opacity-20 text-zinc-600"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown();
            }}
            disabled={!canMoveDown}
            className="hover:text-zinc-300 disabled:opacity-20 text-zinc-600"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>

        <div
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border flex-none",
            STEP_COLORS[step.type],
          )}
        >
          {STEP_ICONS[step.type]}
          <span className="uppercase">{step.type}</span>
        </div>

        <span className="text-xs text-zinc-300 flex-1 truncate">
          {step.label}
        </span>

        <div className="flex items-center gap-1 flex-none">
          {step.status === "done" && (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          )}
          {step.status === "error" && (
            <XCircle className="h-3.5 w-3.5 text-red-400" />
          )}
          {step.status === "running" && (
            <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />
          )}
          {step.status === "skipped" && (
            <span className="text-[10px] text-zinc-600">skip</span>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className={cn(
              "h-5 w-8 rounded-full transition-colors flex-none border",
              step.enabled
                ? "bg-emerald-500/20 border-emerald-500/30"
                : "bg-zinc-800 border-zinc-700",
            )}
          >
            <span
              className={cn(
                "block h-3.5 w-3.5 rounded-full transition-transform mx-auto",
                step.enabled ? "bg-emerald-400 translate-x-0" : "bg-zinc-600",
              )}
            />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {(step.inputRows !== undefined || step.outputRows !== undefined) &&
        step.status === "done" && (
          <div className="flex items-center gap-2 mt-2 text-[10px] text-zinc-500">
            <span>{(step.inputRows ?? 0).toLocaleString()} in</span>
            <ArrowRight className="h-2.5 w-2.5" />
            <span
              className={cn(
                step.outputRows !== undefined &&
                  step.inputRows !== undefined &&
                  step.outputRows < step.inputRows
                  ? "text-amber-400"
                  : "text-emerald-400",
              )}
            >
              {(step.outputRows ?? 0).toLocaleString()} out
            </span>
            {step.duration !== undefined && (
              <span className="ml-auto text-zinc-600">{step.duration}ms</span>
            )}
          </div>
        )}

      {step.status === "error" && step.error && (
        <p className="text-[10px] text-red-400 mt-1.5 font-mono truncate">
          {step.error}
        </p>
      )}
    </motion.div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function DataTransformScreen() {
  const activeDatasetId = useDataStore((s) => s.activeDatasetId);
  const datasets = useDataStore((s) => s.datasets);
  const loadedTableNames = useDataStore((s) => s.loadedTableNames);
  const activeDataset =
    datasets.find((dataset) => dataset.id === activeDatasetId) ?? null;
  const addActivity = useActivityStore((s) => s.addEvent);
  const setAppContext = useAppContextStore((s) => s.setContext);
  const [dbReady, setDbReady] = useState(false);
  const [sourceTableName, setSourceTableName] = useState<string | null>(null);
  const [sourceRowCount, setSourceRowCount] = useState(0);
  const [steps, setSteps] = useState<TransformStep[]>([
    {
      id: "s1",
      type: "deduplicate",
      label: "Remove duplicate rows",
      enabled: false,
      status: "idle",
      config: {},
    },
    {
      id: "s2",
      type: "limit",
      label: "Limit rows",
      enabled: false,
      status: "idle",
      config: { count: 1000 },
    },
  ]);

  const [activeStepId, setActiveStepId] = useState<string | null>("s1");
  const [running, setRunning] = useState(false);
  const [previewData, setPreviewData] = useState<Record<string, unknown>[]>([]);
  const [previewCols, setPreviewCols] = useState<string[]>([]);
  const [finalRowCount, setFinalRowCount] = useState<number | null>(null);
  const [outputSQL, setOutputSQL] = useState("");
  const [activeTab, setActiveTab] = useState("pipeline");
  const [runHistory, setRunHistory] = useState<RunHistoryEntry[]>([]);
  const [showAddStep, setShowAddStep] = useState(false);

  const activeStep = steps.find((s) => s.id === activeStepId) ?? null;

  // Init DuckDB
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        let tableName = activeDataset?.tableName ?? loadedTableNames[0] ?? "";
        const tables = await runQuery("SHOW TABLES").catch(() => []);
        const tableNames = tables
          .map((row) =>
            String(row.name ?? row.table_name ?? Object.values(row)[0] ?? ""),
          )
          .filter(Boolean);
        if (
          tableNames.length > 0 &&
          (!tableName || !tableNames.includes(tableName))
        ) {
          tableName = tableNames[0] ?? "";
        }

        if (tableName) {
          const countRes = await runQuery(
            `SELECT COUNT(*) as cnt FROM "${tableName.replace('"', '""')}"`,
          );
          if (!cancelled) {
            setSourceTableName(tableName);
            setSourceRowCount(Number(countRes[0]?.cnt ?? 0));
            setDbReady(true);
          }
        } else if (!cancelled) {
          setSourceTableName(null);
          setSourceRowCount(0);
          setDbReady(false);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setDbReady(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [activeDataset?.tableName, loadedTableNames]);

  // Build full SQL chain
  const buildPipelineSQL = useCallback(
    (stepsToRun: TransformStep[]): string[] => {
      const sqls: string[] = [];
      let currentTable = sourceTableName;
      if (!currentTable) return sqls;
      for (const step of stepsToRun) {
        if (!step.enabled) continue;
        const sql = stepToSQL(step, currentTable);
        const outputTable = `step_${step.id}`;
        sqls.push(`CREATE OR REPLACE TABLE "${outputTable}" AS (${sql})`);
        currentTable = outputTable;
      }
      return sqls;
    },
    [sourceTableName],
  );

  // Run pipeline
  const runPipeline = useCallback(async () => {
    if (!dbReady || !sourceTableName) return;
    setRunning(true);
    setActiveTab("preview");

    const enabledSteps = steps.filter((s) => s.enabled);
    const t0 = performance.now();
    let currentRows = sourceRowCount;

    // Reset statuses
    setSteps((prev) =>
      produce(prev, (draft) => {
        draft.forEach((s) => {
          s.status = "idle";
          delete s.inputRows;
          delete s.outputRows;
          delete s.duration;
          delete s.error;
        });
      }),
    );

    try {
      let currentTable = sourceTableName;
      for (const step of enabledSteps) {
        setSteps((prev) =>
          produce(prev, (draft) => {
            const s = draft.find((x) => x.id === step.id);
            if (s) s.status = "running";
          }),
        );
        await new Promise((r) => setTimeout(r, 60));

        const stepT = performance.now();
        try {
          const sql = stepToSQL(step, currentTable);
          const outputTable = `step_${step.id}`;
          await runQuery(
            `CREATE OR REPLACE TABLE "${outputTable}" AS (${sql})`,
          );
          const countRes = await runQuery(
            `SELECT COUNT(*) as cnt FROM "${outputTable}"`,
          );
          const outRows = Number(countRes[0]?.cnt ?? 0);
          const dur = Math.round(performance.now() - stepT);

          setSteps((prev) =>
            produce(prev, (draft) => {
              const s = draft.find((x) => x.id === step.id);
              if (s) {
                s.status = "done";
                s.inputRows = currentRows;
                s.outputRows = outRows;
                s.duration = dur;
                s.sql = sql;
              }
            }),
          );
          currentRows = outRows;
          currentTable = outputTable;
        } catch (err) {
          setSteps((prev) =>
            produce(prev, (draft) => {
              const s = draft.find((x) => x.id === step.id);
              if (s) {
                s.status = "error";
                s.error = String(err).slice(0, 100);
              }
            }),
          );
          break;
        }
      }

      // Fetch preview
      const lastTable =
        enabledSteps.length > 0
          ? `step_${enabledSteps[enabledSteps.length - 1].id}`
          : sourceTableName;
      const preview = await runQuery(
        `SELECT * FROM "${lastTable.replace('"', '""')}" LIMIT 50`,
      );
      setPreviewData(preview);
      setPreviewCols(preview.length > 0 ? Object.keys(preview[0]) : []);
      setFinalRowCount(currentRows);

      // Build readable SQL
      let sql = `-- Transform Pipeline SQL\n-- Source: ${sourceTableName} (${sourceRowCount.toLocaleString()} rows)\n\n`;
      let prevT = sourceTableName;
      for (const step of enabledSteps) {
        sql += `-- Step: ${step.label}\nCREATE OR REPLACE TABLE step_${step.id} AS (\n  ${stepToSQL(step, prevT)}\n);\n\n`;
        prevT = `step_${step.id}`;
      }
      setOutputSQL(sql);

      const totalDur = Math.round(performance.now() - t0);
      setRunHistory((prev) => [
        {
          id: `run_${Date.now()}`,
          timestamp: new Date(),
          steps: enabledSteps.length,
          inputRows: sourceRowCount,
          outputRows: currentRows,
          duration: totalDur,
          success: true,
        },
        ...prev.slice(0, 9),
      ]);

      if (enabledSteps.length > 0) {
        addActivity({
          type: "transform_run",
          message: `Ran transform pipeline (${enabledSteps.length} steps)`,
          datasetId: activeDatasetId ?? undefined,
          tableName: lastTable,
          metadata: { steps: enabledSteps.length, outputRows: currentRows },
        });
        setAppContext({
          activeDomain: "general",
          activeDatasetId,
          activeTableName: lastTable,
        });
      }
    } catch (e) {
      console.error(e);
    }
    setRunning(false);
  }, [
    activeDatasetId,
    addActivity,
    dbReady,
    setAppContext,
    sourceRowCount,
    sourceTableName,
    steps,
  ]);

  const addStep = useCallback((type: StepType) => {
    const defaults: Record<
      StepType,
      { label: string; config: Record<string, unknown> }
    > = {
      filter: { label: "New filter", config: { condition: "1=1" } },
      select: { label: "Select columns", config: { columns: "*" } },
      rename: {
        label: "Add column",
        config: { expression: "1", alias: "new_col" },
      },
      derive: {
        label: "Derive column",
        config: { expression: "1", alias: "derived" },
      },
      aggregate: {
        label: "Aggregate",
        config: { groupBy: "", agg: "COUNT(*) as count" },
      },
      sort: { label: "Sort rows", config: { column: "", direction: "ASC" } },
      deduplicate: { label: "Remove duplicates", config: {} },
      limit: { label: "Limit rows", config: { count: 500 } },
      join: { label: "Join table", config: {} },
      pivot: { label: "Pivot", config: {} },
    };
    const d = defaults[type];
    const newStep: TransformStep = {
      id: `s${Date.now()}`,
      type,
      label: d.label,
      enabled: true,
      status: "idle",
      config: d.config,
    };
    setSteps((prev) => [...prev, newStep]);
    setActiveStepId(newStep.id);
    setShowAddStep(false);
  }, []);

  const moveStep = useCallback((id: string, dir: -1 | 1) => {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      return produce(prev, (draft) => {
        const tmp = draft[idx];
        draft[idx] = draft[newIdx];
        draft[newIdx] = tmp;
      });
    });
  }, []);

  const updateStepConfig = useCallback(
    (id: string, key: string, value: unknown) => {
      setSteps((prev) =>
        produce(prev, (draft) => {
          const s = draft.find((x) => x.id === id);
          if (s) {
            s.config[key] = value;
            s.status = "idle";
          }
        }),
      );
    },
    [],
  );

  // Analytics: row reduction chart
  const funnelOption = useMemo(() => {
    const doneSteps = steps.filter((s) => s.status === "done" && s.enabled);
    if (doneSteps.length === 0) return {};
    const data = [
      { label: "Source", rows: 10000 },
      ...doneSteps.map((s) => ({ label: s.label, rows: s.outputRows ?? 0 })),
    ];
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#18181b",
        borderColor: "#3f3f46",
        textStyle: { color: "#e4e4e7", fontSize: 11 },
      },
      grid: { top: 10, right: 20, bottom: 40, left: 20, containLabel: true },
      xAxis: {
        type: "category",
        data: data.map((d) => d.label),
        axisLabel: { color: "#71717a", fontSize: 9, rotate: 20 },
        axisLine: { lineStyle: { color: "#3f3f46" } },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: "#71717a",
          fontSize: 10,
          formatter: (v: number) =>
            v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v),
        },
        splitLine: { lineStyle: { color: "#27272a" } },
      },
      series: [
        {
          type: "bar",
          data: data.map((d) => d.rows),
          itemStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "#3b82f6" },
                { offset: 1, color: "#1e3a5f" },
              ],
            },
            borderRadius: [3, 3, 0, 0],
          },
        },
      ],
    };
  }, [steps]);

  const enabledCount = steps.filter((s) => s.enabled).length;
  const doneCount = steps.filter((s) => s.status === "done").length;
  const hasErrors = steps.some((s) => s.status === "error");

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Header */}
      <div className="flex-none border-b border-zinc-800 px-4 py-2.5 flex items-center gap-3">
        <div className="h-7 w-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
          <Activity className="h-3.5 w-3.5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-sm font-semibold">Transform Pipeline</h1>
          <p className="text-[10px] text-zinc-500">
            {enabledCount} active steps ·{" "}
            {dbReady ? "DuckDB ready" : "Initializing…"}
          </p>
        </div>
        <div className="flex-1" />
        {doneCount > 0 && (
          <div
            className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border",
              hasErrors
                ? "bg-red-500/10 border-red-500/20 text-red-400"
                : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
            )}
          >
            {hasErrors ? (
              <XCircle className="h-3 w-3" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            {hasErrors
              ? "Errors detected"
              : `${finalRowCount?.toLocaleString() ?? "?"} output rows`}
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs border-zinc-800 bg-zinc-900 gap-1.5"
          onClick={() => {
            setSteps((prev) =>
              produce(prev, (draft) => {
                draft.forEach((s) => {
                  s.status = "idle";
                  delete s.inputRows;
                  delete s.outputRows;
                  delete s.duration;
                });
              }),
            );
            setPreviewData([]);
            setFinalRowCount(null);
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </Button>
        <Button
          size="sm"
          className="h-8 text-xs bg-purple-600 hover:bg-purple-500 gap-1.5"
          onClick={runPipeline}
          disabled={running || !dbReady || enabledCount === 0}
        >
          {running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {running ? "Running…" : "Run Pipeline"}
        </Button>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Steps list */}
        <div className="w-80 flex-none border-r border-zinc-800 flex flex-col">
          <div className="flex-none px-3 py-2.5 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">
              Steps ({steps.length})
            </span>
            <button
              onClick={() => setShowAddStep(!showAddStep)}
              className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>

          <AnimatePresence>
            {showAddStep && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="flex-none border-b border-zinc-800 bg-zinc-900/50 overflow-hidden"
              >
                <div className="p-3 grid grid-cols-2 gap-1.5">
                  {(
                    [
                      "filter",
                      "select",
                      "rename",
                      "derive",
                      "aggregate",
                      "sort",
                      "deduplicate",
                      "limit",
                    ] as StepType[]
                  ).map((t) => (
                    <button
                      key={t}
                      onClick={() => addStep(t)}
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs border transition-colors hover:opacity-90",
                        STEP_COLORS[t],
                      )}
                    >
                      {STEP_ICONS[t]}
                      <span className="capitalize">{t}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              {/* Source node */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800">
                <Database className="h-3.5 w-3.5 text-zinc-500" />
                <div>
                  <p className="text-xs text-zinc-400">Source</p>
                  <p className="text-[10px] text-zinc-600">
                    {sourceTableName ?? "No table loaded"} ·{" "}
                    {sourceRowCount.toLocaleString()} rows
                  </p>
                </div>
              </div>
              <div className="w-px h-3 bg-zinc-700 mx-auto" />

              <AnimatePresence>
                {steps.map((step, i) => (
                  <div key={step.id}>
                    <StepCard
                      step={step}
                      index={i}
                      isActive={activeStepId === step.id}
                      onSelect={() => setActiveStepId(step.id)}
                      onToggle={() =>
                        setSteps((prev) =>
                          produce(prev, (draft) => {
                            const s = draft.find((x) => x.id === step.id);
                            if (s) s.enabled = !s.enabled;
                          }),
                        )
                      }
                      onDelete={() => {
                        setSteps((prev) =>
                          prev.filter((x) => x.id !== step.id),
                        );
                        if (activeStepId === step.id) setActiveStepId(null);
                      }}
                      onMoveUp={() => moveStep(step.id, -1)}
                      onMoveDown={() => moveStep(step.id, 1)}
                      canMoveUp={i > 0}
                      canMoveDown={i < steps.length - 1}
                    />
                    {i < steps.length - 1 && (
                      <div className="w-px h-2 bg-zinc-700 mx-auto mt-1" />
                    )}
                  </div>
                ))}
              </AnimatePresence>

              {finalRowCount !== null && (
                <>
                  <div className="w-px h-2 bg-zinc-700 mx-auto" />
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <div>
                      <p className="text-xs text-emerald-300">Output</p>
                      <p className="text-[10px] text-emerald-600">
                        {finalRowCount.toLocaleString()} rows
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>

          {runHistory.length > 0 && (
            <div className="flex-none border-t border-zinc-800 p-3">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">
                Run History
              </p>
              <div className="space-y-1.5">
                {runHistory.slice(0, 3).map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 text-[10px]"
                  >
                    {r.success ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-400" />
                    )}
                    <span className="text-zinc-500">
                      {r.timestamp.toLocaleTimeString()}
                    </span>
                    <span className="text-zinc-400">
                      {r.outputRows.toLocaleString()}r
                    </span>
                    <span className="ml-auto text-zinc-600">
                      {r.duration}ms
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right panel */}
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
                    v: "pipeline",
                    label: "Configure",
                    icon: <Settings2 className="h-3.5 w-3.5" />,
                  },
                  {
                    v: "preview",
                    label: "Preview",
                    icon: <Eye className="h-3.5 w-3.5" />,
                  },
                  {
                    v: "sql",
                    label: "SQL",
                    icon: <Code2 className="h-3.5 w-3.5" />,
                  },
                  {
                    v: "analytics",
                    label: "Analytics",
                    icon: <BarChart2 className="h-3.5 w-3.5" />,
                  },
                ].map((tab) => (
                  <TabsTrigger
                    key={tab.v}
                    value={tab.v}
                    className="h-10 px-4 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-purple-500 data-[state=active]:text-purple-400 data-[state=active]:bg-transparent text-zinc-500 hover:text-zinc-300 gap-1.5"
                  >
                    {tab.icon}
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* Configure tab */}
            <TabsContent
              value="pipeline"
              className="flex-1 overflow-auto p-6 m-0"
            >
              {!activeStep ? (
                <div className="flex items-center justify-center h-full text-zinc-500">
                  <div className="text-center">
                    <Settings2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Select a step to configure</p>
                  </div>
                </div>
              ) : (
                <div className="max-w-xl mx-auto space-y-6">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium",
                        STEP_COLORS[activeStep.type],
                      )}
                    >
                      {STEP_ICONS[activeStep.type]}
                      <span className="capitalize">{activeStep.type}</span>
                    </div>
                    <Input
                      value={activeStep.label}
                      onChange={(e) =>
                        setSteps((prev) =>
                          produce(prev, (d) => {
                            const s = d.find((x) => x.id === activeStep.id);
                            if (s) s.label = e.target.value;
                          }),
                        )
                      }
                      className="h-8 text-sm bg-zinc-900 border-zinc-800"
                      placeholder="Step name"
                    />
                  </div>

                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Configuration</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {activeStep.type === "filter" && (
                        <div className="space-y-1.5">
                          <Label className="text-xs text-zinc-400">
                            WHERE Condition (SQL)
                          </Label>
                          <Input
                            value={String(activeStep.config.condition ?? "")}
                            onChange={(e) =>
                              updateStepConfig(
                                activeStep.id,
                                "condition",
                                e.target.value,
                              )
                            }
                            className="h-8 text-xs bg-zinc-800 border-zinc-700 font-mono"
                            placeholder="1=1"
                          />
                          <p className="text-[10px] text-zinc-600">
                            Standard SQL WHERE clause without the WHERE keyword
                          </p>
                        </div>
                      )}
                      {activeStep.type === "select" && (
                        <div className="space-y-1.5">
                          <Label className="text-xs text-zinc-400">
                            Columns (comma-separated or *)
                          </Label>
                          <Input
                            value={String(activeStep.config.columns ?? "*")}
                            onChange={(e) =>
                              updateStepConfig(
                                activeStep.id,
                                "columns",
                                e.target.value,
                              )
                            }
                            className="h-8 text-xs bg-zinc-800 border-zinc-700 font-mono"
                            placeholder="* or column_a, column_b"
                          />
                        </div>
                      )}
                      {(activeStep.type === "derive" ||
                        activeStep.type === "rename") && (
                        <>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">
                              SQL Expression
                            </Label>
                            <Input
                              value={String(activeStep.config.expression ?? "")}
                              onChange={(e) =>
                                updateStepConfig(
                                  activeStep.id,
                                  "expression",
                                  e.target.value,
                                )
                              }
                              className="h-8 text-xs bg-zinc-800 border-zinc-700 font-mono"
                              placeholder="1"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">
                              Output Column Name
                            </Label>
                            <Input
                              value={String(activeStep.config.alias ?? "")}
                              onChange={(e) =>
                                updateStepConfig(
                                  activeStep.id,
                                  "alias",
                                  e.target.value,
                                )
                              }
                              className="h-8 text-xs bg-zinc-800 border-zinc-700 font-mono"
                              placeholder="derived"
                            />
                          </div>
                        </>
                      )}
                      {activeStep.type === "aggregate" && (
                        <>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">
                              GROUP BY Column(s)
                            </Label>
                            <Input
                              value={String(activeStep.config.groupBy ?? "")}
                              onChange={(e) =>
                                updateStepConfig(
                                  activeStep.id,
                                  "groupBy",
                                  e.target.value,
                                )
                              }
                              className="h-8 text-xs bg-zinc-800 border-zinc-700 font-mono"
                              placeholder="column_name"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">
                              Aggregations
                            </Label>
                            <Input
                              value={String(activeStep.config.agg ?? "")}
                              onChange={(e) =>
                                updateStepConfig(
                                  activeStep.id,
                                  "agg",
                                  e.target.value,
                                )
                              }
                              className="h-8 text-xs bg-zinc-800 border-zinc-700 font-mono"
                              placeholder="COUNT(*) as count"
                            />
                          </div>
                        </>
                      )}
                      {activeStep.type === "sort" && (
                        <>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">
                              Sort Column
                            </Label>
                            <Input
                              value={String(activeStep.config.column ?? "")}
                              onChange={(e) =>
                                updateStepConfig(
                                  activeStep.id,
                                  "column",
                                  e.target.value,
                                )
                              }
                              className="h-8 text-xs bg-zinc-800 border-zinc-700 font-mono"
                              placeholder="column_name"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">
                              Direction
                            </Label>
                            <Select
                              value={String(
                                activeStep.config.direction ?? "ASC",
                              )}
                              onValueChange={(v) =>
                                v &&
                                updateStepConfig(activeStep.id, "direction", v)
                              }
                            >
                              <SelectTrigger className="h-8 text-xs bg-zinc-800 border-zinc-700">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-zinc-900 border-zinc-800">
                                <SelectItem value="ASC" className="text-xs">
                                  Ascending
                                </SelectItem>
                                <SelectItem value="DESC" className="text-xs">
                                  Descending
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      )}
                      {activeStep.type === "limit" && (
                        <div className="space-y-1.5">
                          <Label className="text-xs text-zinc-400">
                            Row Limit
                          </Label>
                          <Input
                            type="number"
                            value={String(activeStep.config.count ?? 1000)}
                            onChange={(e) =>
                              updateStepConfig(
                                activeStep.id,
                                "count",
                                Number(e.target.value),
                              )
                            }
                            className="h-8 text-xs bg-zinc-800 border-zinc-700 font-mono"
                          />
                        </div>
                      )}
                      {activeStep.type === "deduplicate" && (
                        <p className="text-xs text-zinc-500">
                          Removes all exact duplicate rows using DISTINCT. No
                          configuration needed.
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Generated SQL preview */}
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-zinc-400">
                        Generated SQL
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-xs text-emerald-300 font-mono bg-zinc-950 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                        {stepToSQL(activeStep, "prev_step")}
                      </pre>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            {/* Preview tab */}
            <TabsContent
              value="preview"
              className="flex-1 overflow-hidden m-0 flex flex-col"
            >
              {previewData.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-zinc-500">
                  <div className="text-center">
                    <Eye className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Run the pipeline to see a preview</p>
                    <Button
                      size="sm"
                      className="mt-3 h-8 text-xs bg-purple-600 hover:bg-purple-500"
                      onClick={runPipeline}
                      disabled={running || !dbReady}
                    >
                      <Play className="h-3.5 w-3.5 mr-1.5" />
                      Run Now
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex-none px-4 py-2 border-b border-zinc-800 flex items-center gap-3">
                    <span className="text-xs text-zinc-400">
                      Preview: {previewData.length} of{" "}
                      {finalRowCount?.toLocaleString() ?? "?"} rows ·{" "}
                      {previewCols.length} columns
                    </span>
                    <div className="flex-1" />
                    <Badge
                      variant="outline"
                      className="text-[11px] border-emerald-500/30 text-emerald-400"
                    >
                      Pipeline output
                    </Badge>
                  </div>
                  <div className="flex-1 overflow-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead className="sticky top-0 bg-zinc-900 z-10">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-zinc-500 border-b border-r border-zinc-800 w-10">
                            #
                          </th>
                          {previewCols.map((c) => (
                            <th
                              key={c}
                              className="px-3 py-2 text-left font-medium text-zinc-300 border-b border-r border-zinc-800 whitespace-nowrap"
                            >
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.map((row, i) => (
                          <tr
                            key={`r${i}`}
                            className={cn(
                              "border-b border-zinc-800/30 hover:bg-zinc-900/60",
                              i % 2 === 1 && "bg-zinc-900/20",
                            )}
                          >
                            <td className="px-3 py-1.5 text-zinc-600 font-mono text-center border-r border-zinc-800/30">
                              {i + 1}
                            </td>
                            {previewCols.map((c) => (
                              <td
                                key={c}
                                className="px-3 py-1.5 font-mono text-zinc-300 border-r border-zinc-800/20 whitespace-nowrap max-w-48 overflow-hidden text-ellipsis"
                              >
                                {row[c] === null || row[c] === undefined ? (
                                  <span className="text-zinc-700">NULL</span>
                                ) : (
                                  String(row[c])
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* SQL tab */}
            <TabsContent
              value="sql"
              className="flex-1 overflow-hidden m-0 flex flex-col"
            >
              <div className="flex-none px-4 py-2 border-b border-zinc-800 flex items-center gap-2">
                <Code2 className="h-3.5 w-3.5 text-purple-400" />
                <span className="text-xs text-zinc-400">
                  Generated Pipeline SQL
                </span>
                <div className="flex-1" />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-zinc-800 gap-1"
                  onClick={() => navigator.clipboard.writeText(outputSQL)}
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </Button>
              </div>
              <div className="flex-1 overflow-hidden">
                <MonacoEditor
                  language="sql"
                  value={outputSQL || "-- Run the pipeline to generate SQL"}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    fontSize: 12,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    padding: { top: 12 },
                  }}
                />
              </div>
            </TabsContent>

            {/* Analytics tab */}
            <TabsContent
              value="analytics"
              className="flex-1 overflow-auto p-6 m-0"
            >
              <div className="max-w-3xl mx-auto space-y-6">
                {steps.some((s) => s.status === "done") ? (
                  <>
                    <Card className="bg-zinc-900 border-zinc-800">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">
                          Row Reduction Funnel
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ReactECharts
                          option={funnelOption}
                          style={{ height: 200 }}
                          opts={{ renderer: "canvas" }}
                        />
                      </CardContent>
                    </Card>
                    <div className="grid grid-cols-3 gap-4">
                      {[
                        {
                          label: "Input Rows",
                          value: sourceRowCount.toLocaleString(),
                          color: "zinc",
                        },
                        {
                          label: "Output Rows",
                          value: (finalRowCount ?? 0).toLocaleString(),
                          color: "emerald",
                        },
                        {
                          label: "Reduction",
                          value: `${Math.round((1 - (finalRowCount ?? 10000) / 10000) * 100)}%`,
                          color: "blue",
                        },
                      ].map((s) => (
                        <Card
                          key={s.label}
                          className="bg-zinc-900 border-zinc-800"
                        >
                          <CardContent className="p-4 text-center">
                            <p
                              className={cn(
                                "text-2xl font-bold",
                                s.color === "emerald"
                                  ? "text-emerald-400"
                                  : s.color === "blue"
                                    ? "text-blue-400"
                                    : "text-zinc-100",
                              )}
                            >
                              {s.value}
                            </p>
                            <p className="text-xs text-zinc-500 mt-1">
                              {s.label}
                            </p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    <Card className="bg-zinc-900 border-zinc-800">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">
                          Step Performance
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {steps
                          .filter((s) => s.status === "done")
                          .map((s) => (
                            <div
                              key={s.id}
                              className="flex items-center gap-3 py-2 border-b border-zinc-800/30"
                            >
                              <div
                                className={cn(
                                  "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border flex-none",
                                  STEP_COLORS[s.type],
                                )}
                              >
                                {STEP_ICONS[s.type]}
                                {s.type}
                              </div>
                              <span className="text-xs text-zinc-300 flex-1 truncate">
                                {s.label}
                              </span>
                              <span className="text-xs font-mono text-zinc-500">
                                {(s.inputRows ?? 0).toLocaleString()}
                              </span>
                              <ArrowRight className="h-3 w-3 text-zinc-600" />
                              <span className="text-xs font-mono text-emerald-400">
                                {(s.outputRows ?? 0).toLocaleString()}
                              </span>
                              <span className="text-[10px] text-zinc-600 w-12 text-right">
                                {s.duration}ms
                              </span>
                            </div>
                          ))}
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-40 text-zinc-500">
                    <div className="text-center">
                      <BarChart2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">
                        Run the pipeline to see analytics
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
