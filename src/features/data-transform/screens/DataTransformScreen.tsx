"use client";

import ReactECharts from "echarts-for-react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart2,
  CheckCircle2,
  Code2,
  Copy,
  Database,
  Download,
  Eye,
  FileSpreadsheet,
  FolderOpen,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  TableProperties,
  Trash2,
  XCircle,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { PreviewGrid } from "@/components/shared/preview-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActivityStore } from "@/core/stores/activity-store";
import { useAppContextStore } from "@/core/stores/app-context-store";
import { type DataTransform, useDataStore } from "@/core/stores/data-store";
import { useAppCommands, useRegisterPages } from "@/features/desktop/core/menu/app-commands";
import { useWindowId } from "@/features/desktop/core/menu/window-context";
import { useAI } from "@/platform/ai/provider";
import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import { newId } from "@/platform/storage";
import { cn } from "@/shared/utils";
import { buildRecipePrompt } from "../ai/recipe-from-nl";
import { coerceRecipe, TransformRecipeSchema } from "../ai/recipe-schema";
import { STEP_COLORS, STEP_ICONS, StepCard } from "../components/StepCard";
import { exportResultCsv, exportResultXlsx } from "../engine/export";
import {
  type ColumnProfile,
  PREVIEW_LIMIT,
  profileTable,
  runPipeline,
  type StepRuntime,
} from "../engine/run";
import {
  buildCTE,
  buildReadableSQL,
  type StepType,
  stepToSQL,
  type TransformStep,
} from "../engine/sql";
import { type SqlValidation } from "../engine/validate";
import { loadRecipes, removeRecipe, type SavedRecipe, saveRecipe } from "../state/recipes";
import { useTransformWorker } from "../workers/useTransformWorker";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-40 items-center justify-center rounded bg-zinc-950 text-xs text-zinc-600">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Loading editor…
    </div>
  ),
});

interface RunHistoryEntry {
  id: string;
  timestamp: Date;
  steps: number;
  inputRows: number;
  outputRows: number;
  duration: number;
  success: boolean;
}

const IDLE_RUNTIME: StepRuntime = { status: "idle" };

const TRANSFORM_PAGES = [
  { id: "pipeline", label: "Configurer", icon: Settings2 },
  { id: "preview", label: "Aperçu", icon: Eye },
  { id: "profile", label: "Profil", icon: TableProperties },
  { id: "sql", label: "SQL", icon: Code2 },
  { id: "analytics", label: "Analytique", icon: BarChart2 },
];

const ADDABLE_STEPS: StepType[] = [
  "filter",
  "select",
  "rename",
  "derive",
  "aggregate",
  "sort",
  "deduplicate",
  "limit",
  "join",
  "pivot",
];

const STEP_DEFAULTS: Record<StepType, { label: string; config: Record<string, unknown> }> = {
  filter: { label: "New filter", config: { condition: "1=1" } },
  select: { label: "Select columns", config: { columns: "*" } },
  rename: { label: "Add column", config: { expression: "1", alias: "new_col" } },
  derive: { label: "Derive column", config: { expression: "1", alias: "derived" } },
  aggregate: { label: "Aggregate", config: { groupBy: "", agg: "COUNT(*) AS count" } },
  sort: { label: "Sort rows", config: { column: "", direction: "ASC" } },
  deduplicate: { label: "Remove duplicates", config: {} },
  limit: { label: "Limit rows", config: { count: 500 } },
  join: {
    label: "Join table",
    config: { table: "", leftKey: "", rightKey: "", joinType: "left" },
  },
  pivot: {
    label: "Pivot",
    config: { onColumn: "", usingAgg: "COUNT(*)", groupBy: "" },
  },
};

export default function DataTransformScreen() {
  const activeDatasetId = useDataStore((s) => s.activeDatasetId);
  const datasets = useDataStore((s) => s.datasets);
  const loadedTableNames = useDataStore((s) => s.loadedTableNames);
  const activeDataset = datasets.find((dataset) => dataset.id === activeDatasetId) ?? null;
  const addActivity = useActivityStore((s) => s.addEvent);
  const addTransform = useDataStore((s) => s.addTransform);
  const setAppContext = useAppContextStore((s) => s.setContext);

  const [dbReady, setDbReady] = useState(false);
  const [sourceTableName, setSourceTableName] = useState<string | null>(null);
  const [sourceRowCount, setSourceRowCount] = useState(0);

  // ── Config state (steps) — never mutated by a run ───────────────────────────
  const [steps, setSteps] = useState<TransformStep[]>([
    { id: "s1", type: "deduplicate", label: "Remove duplicate rows", enabled: false, config: {} },
    { id: "s2", type: "limit", label: "Limit rows", enabled: false, config: { count: 1000 } },
  ]);
  // ── Runtime state (status/rows) — never touched by a config edit ────────────
  const [runtime, setRuntime] = useState<Record<string, StepRuntime>>({});

  const [activeStepId, setActiveStepId] = useState<string | null>("s1");
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState<{
    cols: string[];
    rows: Record<string, unknown>[];
  }>({ cols: [], rows: [] });
  const [finalRowCount, setFinalRowCount] = useState<number | null>(null);
  const [outputSQL, setOutputSQL] = useState("");
  const [activeTab, setActiveTab] = useState("pipeline");
  const [runHistory, setRunHistory] = useState<RunHistoryEntry[]>([]);
  const [showAddStep, setShowAddStep] = useState(false);
  const [profile, setProfile] = useState<ColumnProfile[]>([]);
  const [profiling, setProfiling] = useState(false);

  // ── AI assist (NL → recipe, offline grammar-constrained) ────────────────────
  const ai = useAI();
  const [nlInstruction, setNlInstruction] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [proposedSteps, setProposedSteps] = useState<TransformStep[] | null>(null);

  // ── Recipe persistence (Dexie) ──────────────────────────────────────────────
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [recipeName, setRecipeName] = useState("Untitled recipe");
  const [showRecipes, setShowRecipes] = useState(false);

  // ── Offline SQL validation (node-sql-parser in a worker) ────────────────────
  const { validateSql } = useTransformWorker();
  const [sqlValidation, setSqlValidation] = useState<SqlValidation>({ ok: true });
  const [exporting, setExporting] = useState<null | "csv" | "xlsx">(null);

  // Keep the latest config/source accessible from a stable run callback so its
  // identity does not churn on every keystroke (previously `runPipeline`
  // depended on the whole `steps[]`).
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const activeStep = steps.find((s) => s.id === activeStepId) ?? null;

  // Init DuckDB source binding.
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        let tableName = activeDataset?.tableName ?? loadedTableNames[0] ?? "";
        const tables = await runReadOnlyQuery("SHOW TABLES").catch(() => []);
        const tableNames = tables
          .map((row) => String(row.name ?? row.table_name ?? Object.values(row)[0] ?? ""))
          .filter(Boolean);
        if (tableNames.length > 0 && (!tableName || !tableNames.includes(tableName))) {
          tableName = tableNames[0] ?? "";
        }

        if (tableName) {
          const countRes = await runReadOnlyQuery(
            `SELECT COUNT(*) AS cnt FROM "${tableName.replaceAll('"', '""')}"`,
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

  const getRuntime = useCallback(
    (id: string): StepRuntime => runtime[id] ?? IDLE_RUNTIME,
    [runtime],
  );

  // ── Run pipeline (stable identity; reads config from refs) ──────────────────
  const handleRun = useCallback(async () => {
    const source = sourceTableName;
    if (!dbReady || !source) return;
    const currentSteps = stepsRef.current;
    const enabled = currentSteps.filter((s) => s.enabled);
    if (enabled.length === 0) return;

    setRunning(true);
    setActiveTab("preview");
    setRuntime(
      Object.fromEntries(enabled.map((s) => [s.id, { status: "running" } as StepRuntime])),
    );

    try {
      const result = await runPipeline({
        steps: currentSteps,
        sourceTable: source,
        sourceRowCount,
      });

      setRuntime(
        Object.fromEntries(
          enabled.map((s) => {
            const counts = result.perStep[s.id];
            return [
              s.id,
              {
                status: "done",
                inputRows: counts?.input,
                outputRows: counts?.output,
              } as StepRuntime,
            ];
          }),
        ),
      );
      setPreview(result.preview);
      setFinalRowCount(result.finalRows);
      setOutputSQL(buildReadableSQL(currentSteps, source, sourceRowCount));

      setRunHistory((prev) => [
        {
          id: `run_${Date.now()}`,
          timestamp: new Date(),
          steps: enabled.length,
          inputRows: sourceRowCount,
          outputRows: result.finalRows,
          duration: result.durationMs,
          success: true,
        },
        ...prev.slice(0, 9),
      ]);

      addActivity({
        type: "transform_run",
        message: `Ran transform pipeline (${enabled.length} steps)`,
        datasetId: activeDatasetId ?? undefined,
        tableName: source,
        metadata: { steps: enabled.length, outputRows: result.finalRows },
      });
      setAppContext({ activeDomain: "general", activeDatasetId, activeTableName: source });

      // Record a durable lineage entry for this pipeline run, bucketing the
      // terminal step's type into the DataTransform vocabulary (which differs
      // from the screen's StepType — e.g. dedup/sample have no 1:1 step).
      if (activeDatasetId) {
        const primary = enabled[enabled.length - 1];
        const LINEAGE_TYPE: Record<StepType, DataTransform["type"]> = {
          filter: "filter",
          select: "derive",
          rename: "rename",
          derive: "derive",
          aggregate: "aggregate",
          sort: "sort",
          deduplicate: "dedup",
          limit: "sample",
          join: "join",
          pivot: "pivot",
        };
        const lineageType: DataTransform["type"] = primary ? LINEAGE_TYPE[primary.type] : "filter";
        addTransform({
          id: newId(),
          inputDatasetId: activeDatasetId,
          outputDatasetId: activeDatasetId,
          type: lineageType,
          sql: result.sql,
          description: `Pipeline: ${enabled.map((s) => s.type).join(" → ")}`,
          appliedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      const message = String(err).slice(0, 160);
      // Attribute the error to the last running step (DuckDB compiles the whole
      // CTE, so we cannot always isolate it; mark the final enabled step).
      const lastId = enabled[enabled.length - 1]?.id;
      setRuntime((prev) => {
        const next = { ...prev };
        for (const s of enabled) next[s.id] = { status: "done" };
        if (lastId) next[lastId] = { status: "error", error: message };
        return next;
      });
      setRunHistory((prev) => [
        {
          id: `run_${Date.now()}`,
          timestamp: new Date(),
          steps: enabled.length,
          inputRows: sourceRowCount,
          outputRows: 0,
          duration: 0,
          success: false,
        },
        ...prev.slice(0, 9),
      ]);
    } finally {
      setRunning(false);
    }
  }, [
    activeDatasetId,
    addActivity,
    addTransform,
    dbReady,
    setAppContext,
    sourceRowCount,
    sourceTableName,
  ]);

  const loadProfile = useCallback(async () => {
    if (!sourceTableName) return;
    setProfiling(true);
    try {
      setProfile(await profileTable(sourceTableName));
    } catch (e) {
      console.error(e);
      setProfile([]);
    } finally {
      setProfiling(false);
    }
  }, [sourceTableName]);

  const baseExportName = useCallback(
    () => `transform_${sourceTableName ?? "result"}_${Date.now()}`,
    [sourceTableName],
  );

  const exportCSV = useCallback(async () => {
    if (preview.rows.length === 0 || exporting) return;
    setExporting("csv");
    try {
      await exportResultCsv({ cols: preview.cols, rows: preview.rows }, baseExportName());
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(null);
    }
  }, [preview, exporting, baseExportName]);

  // XLSX is generated OFF the main thread by the shared export worker.
  const exportXLSX = useCallback(async () => {
    if (preview.rows.length === 0 || exporting) return;
    setExporting("xlsx");
    try {
      await exportResultXlsx({ cols: preview.cols, rows: preview.rows }, baseExportName(), {
        title: "Transform result",
        subtitle: sourceTableName
          ? `Source: ${sourceTableName} · ${finalRowCount?.toLocaleString() ?? "?"} rows`
          : undefined,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(null);
    }
  }, [preview, exporting, baseExportName, sourceTableName, finalRowCount]);

  // ── Step config mutators (stable; do not touch runtime) ─────────────────────
  const addStep = useCallback((type: StepType) => {
    const d = STEP_DEFAULTS[type];
    const newStep: TransformStep = {
      id: `s${Date.now()}`,
      type,
      label: d.label,
      enabled: true,
      config: { ...d.config },
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
      const next = prev.slice();
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  }, []);

  const toggleStep = useCallback((id: string) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  }, []);

  const deleteStep = useCallback((id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
    setActiveStepId((cur) => (cur === id ? null : cur));
    setRuntime((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const updateStepConfig = useCallback((id: string, key: string, value: unknown) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, config: { ...s.config, [key]: value } } : s)),
    );
    setRuntime((prev) => (id in prev ? { ...prev, [id]: IDLE_RUNTIME } : prev));
  }, []);

  const updateStepLabel = useCallback((id: string, label: string) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, label } : s)));
  }, []);

  const resetRun = useCallback(() => {
    setRuntime({});
    setPreview({ cols: [], rows: [] });
    setFinalRowCount(null);
    setOutputSQL("");
  }, []);

  // ── AI assist: NL → grammar-constrained recipe (offline) ────────────────────
  const generateRecipe = useCallback(async () => {
    const instruction = nlInstruction.trim();
    if (!instruction || aiGenerating || !sourceTableName) return;
    setAiGenerating(true);
    setAiError(null);
    setProposedSteps(null);
    try {
      const { system, prompt } = buildRecipePrompt({
        instruction,
        tableName: sourceTableName,
        columns: (activeDataset?.columns ?? []).map((c) => ({
          name: c.name,
          type: c.type,
        })),
        sourceRowCount,
      });
      // generateStructured runs the provider's GBNF-constrained decode, so the
      // result is valid against TransformRecipeSchema by construction.
      const recipe = await ai.generateStructured(
        { system, prompt, maxTokens: 800, temperature: 0.2 },
        TransformRecipeSchema,
      );
      const steps = coerceRecipe(recipe);
      if (steps.length === 0) {
        setAiError("The model returned no steps. Try rephrasing the request.");
      } else {
        setProposedSteps(steps);
      }
    } catch (err) {
      console.error(err);
      setAiError(
        err instanceof Error
          ? "AI generation failed. Ensure a local model is loaded and try again."
          : "AI generation failed.",
      );
    } finally {
      setAiGenerating(false);
    }
  }, [nlInstruction, aiGenerating, sourceTableName, activeDataset?.columns, sourceRowCount, ai]);

  const acceptProposed = useCallback(() => {
    if (!proposedSteps) return;
    setSteps((prev) => [...prev, ...proposedSteps]);
    setActiveStepId(proposedSteps[0]?.id ?? null);
    setProposedSteps(null);
    setNlInstruction("");
  }, [proposedSteps]);

  const rejectProposed = useCallback(() => setProposedSteps(null), []);

  // ── Recipe persistence (Dexie) ──────────────────────────────────────────────
  const refreshRecipes = useCallback(async () => {
    try {
      setRecipes(await loadRecipes());
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleSaveRecipe = useCallback(async () => {
    try {
      const id = await saveRecipe({
        id: recipeId ?? undefined,
        name: recipeName.trim() || "Untitled recipe",
        datasetId: activeDatasetId ?? undefined,
        steps: stepsRef.current,
      });
      setRecipeId(id);
      await refreshRecipes();
    } catch (e) {
      console.error(e);
    }
  }, [recipeId, recipeName, activeDatasetId, refreshRecipes]);

  const applyRecipe = useCallback((recipe: SavedRecipe) => {
    setSteps(recipe.steps);
    setRecipeId(recipe.id);
    setRecipeName(recipe.name);
    setRuntime({});
    setActiveStepId(recipe.steps[0]?.id ?? null);
    setShowRecipes(false);
  }, []);

  const deleteRecipe = useCallback(
    async (id: string) => {
      try {
        await removeRecipe(id);
        if (recipeId === id) setRecipeId(null);
        await refreshRecipes();
      } catch (e) {
        console.error(e);
      }
    },
    [recipeId, refreshRecipes],
  );

  // Load saved recipes once on mount.
  useEffect(() => {
    void refreshRecipes();
  }, [refreshRecipes]);

  // ── Debounced live SQL preview for the active step ──────────────────────────
  // useDeferredValue lets typing stay responsive; the SQL recompute (and Monaco
  // reformat) trails the keystrokes instead of running on every one.
  const deferredActiveStep = useDeferredValue(activeStep);
  const liveSQL = useMemo(
    () => (deferredActiveStep ? stepToSQL(deferredActiveStep, '"prev_step"') : ""),
    [deferredActiveStep],
  );

  // ── Offline SQL validation of the compiled pipeline (worker, debounced) ─────
  // node-sql-parser parses the compiled CTE locally so we can surface an inline
  // lint error BEFORE the DuckDB round-trip. DuckDB-only syntax (PIVOT etc.) is
  // flagged best-effort and never blocks the run.
  const deferredSteps = useDeferredValue(steps);
  useEffect(() => {
    if (!sourceTableName) {
      setSqlValidation({ ok: true });
      return;
    }
    let cancelled = false;
    const compiled = buildCTE(deferredSteps, sourceTableName);
    void validateSql(compiled.sql).then((result) => {
      if (!cancelled) setSqlValidation(result);
    });
    return () => {
      cancelled = true;
    };
  }, [deferredSteps, sourceTableName, validateSql]);

  // ── Real analytics (driven by real sourceRowCount, not a hardcoded 10000) ───
  const doneSteps = useMemo(
    () => steps.filter((s) => s.enabled && (runtime[s.id]?.status ?? "idle") === "done"),
    [steps, runtime],
  );

  const funnelOption = useMemo(() => {
    if (doneSteps.length === 0) return {};
    const data = [
      { label: "Source", rows: sourceRowCount },
      ...doneSteps.map((s) => ({
        label: s.label,
        rows: runtime[s.id]?.outputRows ?? 0,
      })),
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
          formatter: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)),
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
  }, [doneSteps, runtime, sourceRowCount]);

  const reductionPct = useMemo(() => {
    if (finalRowCount === null || sourceRowCount === 0) return 0;
    return Math.round((1 - finalRowCount / sourceRowCount) * 100);
  }, [finalRowCount, sourceRowCount]);

  const enabledCount = steps.filter((s) => s.enabled).length;
  const doneCount = doneSteps.length;
  const hasErrors = Object.values(runtime).some((r) => r.status === "error");

  // ── Desktop menu bar wiring (app-command bus + page registry) ───────────────
  const windowId = useWindowId();
  useRegisterPages(windowId, TRANSFORM_PAGES, activeTab);
  useAppCommands("transform", {
    navigate: (payload) => {
      const pageId = (payload as { pageId?: string } | undefined)?.pageId;
      if (pageId) setActiveTab(pageId);
    },
    run: () => void handleRun(),
    reset: () => resetRun(),
    "add-step": () => {
      setActiveTab("pipeline");
      setShowAddStep(true);
    },
    profile: () => {
      setActiveTab("profile");
      void loadProfile();
    },
    "save-recipe": () => void handleSaveRecipe(),
    recipes: () => setShowRecipes(true),
    "export-csv": () => void exportCSV(),
    "export-xlsx": () => void exportXLSX(),
    "copy-sql": () => {
      if (outputSQL) void navigator.clipboard.writeText(outputSQL);
    },
  });

  return (
    <div className=" flex h-full min-h-full flex-col overflow-hidden">
      {/* Header */}
      <div className=" flex flex-none items-center gap-3 px-4 py-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-purple-500/20 bg-purple-500/10">
          <Activity className="h-3.5 w-3.5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-sm font-semibold">Transform Pipeline</h1>
          <p className="text-[10px] text-zinc-500">
            {enabledCount} active steps · {dbReady ? "DuckDB ready" : "Initializing…"}
          </p>
        </div>
        <div className="flex-1" />
        {doneCount > 0 && (
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs",
              hasErrors
                ? "border-red-500/20 bg-red-500/10 text-red-400"
                : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
            )}
          >
            {hasErrors ? <XCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
            {hasErrors
              ? "Errors detected"
              : `${finalRowCount?.toLocaleString() ?? "?"} output rows`}
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 border-zinc-800 bg-zinc-900 text-xs"
          onClick={resetRun}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </Button>
        <Button
          size="sm"
          className="h-8 gap-1.5 bg-purple-600 text-xs hover:bg-purple-500"
          onClick={handleRun}
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

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Steps list */}
        <div className="flex w-80 flex-none flex-col border-r border-zinc-800">
          <div className="flex flex-none items-center justify-between border-b border-zinc-800 px-3 py-2.5">
            <span className="text-xs font-medium text-zinc-400">Steps ({steps.length})</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowRecipes((v) => !v)}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Recipes
              </button>
              <button
                type="button"
                onClick={() => setShowAddStep((v) => !v)}
                className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>
          </div>

          {/* AI assist: NL → recipe (offline, grammar-constrained) */}
          <div className="flex-none border-b border-zinc-800 bg-zinc-900/30 p-3">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-[11px] font-medium text-zinc-300">Describe a transform</span>
            </div>
            <div className="flex gap-1.5">
              <Input
                value={nlInstruction}
                onChange={(e) => setNlInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void generateRecipe();
                  }
                }}
                placeholder="e.g. dedupe, keep amount > 100, total by region"
                className="h-8 flex-1 border-zinc-700 bg-zinc-800 text-xs"
                disabled={aiGenerating || !sourceTableName}
              />
              <Button
                size="sm"
                className="h-8 flex-none gap-1 bg-purple-600 px-2.5 text-xs hover:bg-purple-500"
                onClick={generateRecipe}
                disabled={aiGenerating || !nlInstruction.trim() || !sourceTableName}
              >
                {aiGenerating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            {aiError && <p className="mt-1.5 text-[10px] text-red-400">{aiError}</p>}
            {proposedSteps && (
              <div className="mt-2 rounded-lg border border-purple-500/30 bg-purple-500/5 p-2">
                <p className="mb-1.5 text-[10px] font-medium text-purple-300">
                  AI proposed {proposedSteps.length} step
                  {proposedSteps.length === 1 ? "" : "s"}:
                </p>
                <div className="mb-2 space-y-1">
                  {proposedSteps.map((s) => (
                    <div key={s.id} className="flex items-center gap-1.5 text-[10px] text-zinc-300">
                      <span className={cn("rounded px-1 py-0.5 uppercase", STEP_COLORS[s.type])}>
                        {s.type}
                      </span>
                      <span className="truncate">{s.label}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    className="h-6 flex-1 gap-1 bg-emerald-600 text-[10px] hover:bg-emerald-500"
                    onClick={acceptProposed}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 flex-1 gap-1 border-zinc-700 text-[10px]"
                    onClick={rejectProposed}
                  >
                    <XCircle className="h-3 w-3" />
                    Reject
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Recipe save / load (Dexie) */}
          <div className="flex-none border-b border-zinc-800 bg-zinc-900/30 p-3">
            <div className="flex gap-1.5">
              <Input
                value={recipeName}
                onChange={(e) => setRecipeName(e.target.value)}
                placeholder="Recipe name"
                className="h-8 flex-1 border-zinc-700 bg-zinc-800 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 flex-none gap-1 border-zinc-700 px-2.5 text-xs"
                onClick={handleSaveRecipe}
              >
                <Save className="h-3.5 w-3.5" />
                Save
              </Button>
            </div>
            {showRecipes && (
              <div className="mt-2 space-y-1">
                {recipes.length === 0 ? (
                  <p className="py-2 text-center text-[10px] text-zinc-600">No saved recipes yet</p>
                ) : (
                  recipes.map((r) => (
                    <div
                      key={r.id}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-2 py-1.5",
                        recipeId === r.id
                          ? "border-blue-500/40 bg-blue-500/5"
                          : "border-zinc-800 bg-zinc-900/50",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => applyRecipe(r)}
                        className="flex-1 truncate text-left text-[11px] text-zinc-300 hover:text-zinc-100"
                      >
                        {r.name}
                        <span className="ml-1.5 text-[9px] text-zinc-600">
                          {r.steps.length} steps
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteRecipe(r.id)}
                        className="text-zinc-600 hover:text-red-400"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {showAddStep && (
            <div className="flex-none border-b border-zinc-800 bg-zinc-900/50">
              <div className="grid grid-cols-2 gap-1.5 p-3">
                {ADDABLE_STEPS.map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => addStep(t)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition-colors hover:opacity-90",
                      STEP_COLORS[t],
                    )}
                  >
                    {STEP_ICONS[t]}
                    <span className="capitalize">{t}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <ScrollArea className="flex-1">
            <div className="space-y-2 p-2">
              {/* Source node */}
              <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
                <Database className="h-3.5 w-3.5 text-zinc-500" />
                <div>
                  <p className="text-xs text-zinc-400">Source</p>
                  <p className="text-[10px] text-zinc-600">
                    {sourceTableName ?? "No table loaded"} · {sourceRowCount.toLocaleString()} rows
                  </p>
                </div>
              </div>
              <div className="mx-auto h-3 w-px bg-zinc-700" />

              {steps.map((step, i) => (
                <div key={step.id}>
                  <StepCard
                    id={step.id}
                    type={step.type}
                    label={step.label}
                    enabled={step.enabled}
                    runtime={getRuntime(step.id)}
                    isActive={activeStepId === step.id}
                    canMoveUp={i > 0}
                    canMoveDown={i < steps.length - 1}
                    onSelect={setActiveStepId}
                    onToggle={toggleStep}
                    onDelete={deleteStep}
                    onMove={moveStep}
                  />
                  {i < steps.length - 1 && <div className="mx-auto mt-1 h-2 w-px bg-zinc-700" />}
                </div>
              ))}

              {finalRowCount !== null && (
                <>
                  <div className="mx-auto h-2 w-px bg-zinc-700" />
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
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
              <p className="mb-2 text-[10px] uppercase tracking-wide text-zinc-500">Run History</p>
              <div className="space-y-1.5">
                {runHistory.slice(0, 3).map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-[10px]">
                    {r.success ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-400" />
                    )}
                    <span className="text-zinc-500">{r.timestamp.toLocaleTimeString()}</span>
                    <span className="text-zinc-400">{r.outputRows.toLocaleString()}r</span>
                    <span className="ml-auto text-zinc-600">{r.duration}ms</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className="flex-none border-b border-zinc-800 px-4">
              <TabsList className="h-10 gap-0 border-0 bg-transparent p-0">
                {[
                  {
                    v: "pipeline",
                    label: "Configure",
                    icon: <Settings2 className="h-3.5 w-3.5" />,
                  },
                  { v: "preview", label: "Preview", icon: <Eye className="h-3.5 w-3.5" /> },
                  {
                    v: "profile",
                    label: "Profile",
                    icon: <TableProperties className="h-3.5 w-3.5" />,
                  },
                  { v: "sql", label: "SQL", icon: <Code2 className="h-3.5 w-3.5" /> },
                  {
                    v: "analytics",
                    label: "Analytics",
                    icon: <BarChart2 className="h-3.5 w-3.5" />,
                  },
                ].map((tab) => (
                  <TabsTrigger
                    key={tab.v}
                    value={tab.v}
                    className="h-10 gap-1.5 rounded-none border-b-2 border-transparent px-4 text-xs text-zinc-500 hover:text-zinc-300 data-[state=active]:border-purple-500 data-[state=active]:bg-transparent data-[state=active]:text-purple-400"
                  >
                    {tab.icon}
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* Configure tab */}
            <TabsContent value="pipeline" className="m-0 flex-1 overflow-auto p-6">
              {!activeStep ? (
                <div className="flex h-full items-center justify-center text-zinc-500">
                  <div className="text-center">
                    <Settings2 className="mx-auto mb-3 h-10 w-10 opacity-30" />
                    <p className="text-sm">Select a step to configure</p>
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-xl space-y-6">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium",
                        STEP_COLORS[activeStep.type],
                      )}
                    >
                      {STEP_ICONS[activeStep.type]}
                      <span className="capitalize">{activeStep.type}</span>
                    </div>
                    <Input
                      value={activeStep.label}
                      onChange={(e) => updateStepLabel(activeStep.id, e.target.value)}
                      className="h-8 border-zinc-800 bg-zinc-900 text-sm"
                      placeholder="Step name"
                    />
                  </div>

                  <Card className="border-zinc-800 bg-zinc-900">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Configuration</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {activeStep.type === "filter" && (
                        <ConfigField
                          label="WHERE Condition (SQL)"
                          value={String(activeStep.config.condition ?? "")}
                          placeholder="amount > 100"
                          hint="Standard SQL WHERE clause without the WHERE keyword"
                          onChange={(v) => updateStepConfig(activeStep.id, "condition", v)}
                        />
                      )}
                      {activeStep.type === "select" && (
                        <ConfigField
                          label="Columns (comma-separated or *)"
                          value={String(activeStep.config.columns ?? "*")}
                          placeholder="* or column_a, column_b"
                          onChange={(v) => updateStepConfig(activeStep.id, "columns", v)}
                        />
                      )}
                      {(activeStep.type === "derive" || activeStep.type === "rename") && (
                        <>
                          <ConfigField
                            label="SQL Expression"
                            value={String(activeStep.config.expression ?? "")}
                            placeholder="price * quantity"
                            onChange={(v) => updateStepConfig(activeStep.id, "expression", v)}
                          />
                          <ConfigField
                            label="Output Column Name"
                            value={String(activeStep.config.alias ?? "")}
                            placeholder="derived"
                            onChange={(v) => updateStepConfig(activeStep.id, "alias", v)}
                          />
                        </>
                      )}
                      {activeStep.type === "aggregate" && (
                        <>
                          <ConfigField
                            label="GROUP BY Column(s)"
                            value={String(activeStep.config.groupBy ?? "")}
                            placeholder="region"
                            onChange={(v) => updateStepConfig(activeStep.id, "groupBy", v)}
                          />
                          <ConfigField
                            label="Aggregations"
                            value={String(activeStep.config.agg ?? "")}
                            placeholder="SUM(amount) AS total"
                            onChange={(v) => updateStepConfig(activeStep.id, "agg", v)}
                          />
                        </>
                      )}
                      {activeStep.type === "sort" && (
                        <>
                          <ConfigField
                            label="Sort Column"
                            value={String(activeStep.config.column ?? "")}
                            placeholder="column_name"
                            onChange={(v) => updateStepConfig(activeStep.id, "column", v)}
                          />
                          <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">Direction</Label>
                            <Select
                              value={String(activeStep.config.direction ?? "ASC")}
                              onValueChange={(v) =>
                                v && updateStepConfig(activeStep.id, "direction", v)
                              }
                            >
                              <SelectTrigger className="h-8 border-zinc-700 bg-zinc-800 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="border-zinc-800 bg-zinc-900">
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
                          <Label className="text-xs text-zinc-400">Row Limit</Label>
                          <Input
                            type="number"
                            value={String(activeStep.config.count ?? 1000)}
                            onChange={(e) =>
                              updateStepConfig(activeStep.id, "count", Number(e.target.value))
                            }
                            className="h-8 border-zinc-700 bg-zinc-800 font-mono text-xs"
                          />
                        </div>
                      )}
                      {activeStep.type === "join" && (
                        <>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">Table to join</Label>
                            <Select
                              value={String(activeStep.config.table ?? "")}
                              onValueChange={(v) =>
                                v && updateStepConfig(activeStep.id, "table", v)
                              }
                            >
                              <SelectTrigger className="h-8 border-zinc-700 bg-zinc-800 text-xs">
                                <SelectValue placeholder="Select a dataset" />
                              </SelectTrigger>
                              <SelectContent className="border-zinc-800 bg-zinc-900">
                                {datasets
                                  .filter((d) => d.tableName !== sourceTableName)
                                  .map((d) => (
                                    <SelectItem key={d.id} value={d.tableName} className="text-xs">
                                      {d.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">Join type</Label>
                            <Select
                              value={String(activeStep.config.joinType ?? "left")}
                              onValueChange={(v) =>
                                v && updateStepConfig(activeStep.id, "joinType", v)
                              }
                            >
                              <SelectTrigger className="h-8 border-zinc-700 bg-zinc-800 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="border-zinc-800 bg-zinc-900">
                                {["inner", "left", "right", "full"].map((j) => (
                                  <SelectItem key={j} value={j} className="text-xs capitalize">
                                    {j}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <ConfigField
                            label="Left key column"
                            value={String(activeStep.config.leftKey ?? "")}
                            placeholder="id"
                            onChange={(v) => updateStepConfig(activeStep.id, "leftKey", v)}
                          />
                          <ConfigField
                            label="Right key column"
                            value={String(activeStep.config.rightKey ?? "")}
                            placeholder="id"
                            onChange={(v) => updateStepConfig(activeStep.id, "rightKey", v)}
                          />
                        </>
                      )}
                      {activeStep.type === "pivot" && (
                        <>
                          <ConfigField
                            label="Pivot ON column"
                            value={String(activeStep.config.onColumn ?? "")}
                            placeholder="month"
                            onChange={(v) => updateStepConfig(activeStep.id, "onColumn", v)}
                          />
                          <ConfigField
                            label="USING aggregate"
                            value={String(activeStep.config.usingAgg ?? "")}
                            placeholder="SUM(amount)"
                            onChange={(v) => updateStepConfig(activeStep.id, "usingAgg", v)}
                          />
                          <ConfigField
                            label="GROUP BY (optional)"
                            value={String(activeStep.config.groupBy ?? "")}
                            placeholder="region"
                            onChange={(v) => updateStepConfig(activeStep.id, "groupBy", v)}
                          />
                        </>
                      )}
                      {activeStep.type === "deduplicate" && (
                        <p className="text-xs text-zinc-500">
                          Removes all exact duplicate rows using DISTINCT. No configuration needed.
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Live (debounced) generated SQL preview */}
                  <Card className="border-zinc-800 bg-zinc-900">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-zinc-400">Generated SQL</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 font-mono text-xs text-emerald-300">
                        {liveSQL}
                      </pre>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            {/* Preview tab */}
            <TabsContent value="preview" className="m-0 flex flex-1 flex-col overflow-hidden">
              {preview.rows.length === 0 ? (
                <div className="flex flex-1 items-center justify-center text-zinc-500">
                  <div className="text-center">
                    <Eye className="mx-auto mb-3 h-10 w-10 opacity-30" />
                    <p className="text-sm">Run the pipeline to see a preview</p>
                    <Button
                      size="sm"
                      className="mt-3 h-8 bg-purple-600 text-xs hover:bg-purple-500"
                      onClick={handleRun}
                      disabled={running || !dbReady || enabledCount === 0}
                    >
                      <Play className="mr-1.5 h-3.5 w-3.5" />
                      Run Now
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 flex-col overflow-hidden">
                  <div className="flex flex-none items-center gap-3 border-b border-zinc-800 px-4 py-2">
                    <span className="text-xs text-zinc-400">
                      Preview: {preview.rows.length.toLocaleString()}
                      {preview.rows.length >= PREVIEW_LIMIT ? "+" : ""} of{" "}
                      {finalRowCount?.toLocaleString() ?? "?"} rows · {preview.cols.length} columns
                    </span>
                    <div className="flex-1" />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 border-zinc-800 text-xs"
                      onClick={exportCSV}
                      disabled={exporting !== null}
                    >
                      {exporting === "csv" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Download className="h-3 w-3" />
                      )}
                      CSV
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 border-zinc-800 text-xs"
                      onClick={exportXLSX}
                      disabled={exporting !== null}
                    >
                      {exporting === "xlsx" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="h-3 w-3" />
                      )}
                      XLSX
                    </Button>
                    <Badge
                      variant="outline"
                      className="border-emerald-500/30 text-[11px] text-emerald-400"
                    >
                      Pipeline output
                    </Badge>
                  </div>
                  <PreviewGrid variant="records" columns={preview.cols} rows={preview.rows} />
                </div>
              )}
            </TabsContent>

            {/* Profile tab */}
            <TabsContent value="profile" className="m-0 flex flex-1 flex-col overflow-hidden">
              <div className="flex flex-none items-center gap-2 border-b border-zinc-800 px-4 py-2">
                <TableProperties className="h-3.5 w-3.5 text-purple-400" />
                <span className="text-xs text-zinc-400">
                  Column profile · {sourceTableName ?? "no source"}
                </span>
                <div className="flex-1" />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 border-zinc-800 text-xs"
                  onClick={loadProfile}
                  disabled={profiling || !dbReady || !sourceTableName}
                >
                  {profiling ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <TableProperties className="h-3 w-3" />
                  )}
                  {profiling ? "Profiling…" : "Profile source"}
                </Button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {profile.length === 0 ? (
                  <div className="flex h-40 items-center justify-center text-zinc-500">
                    <div className="text-center">
                      <TableProperties className="mx-auto mb-3 h-10 w-10 opacity-30" />
                      <p className="text-sm">Run a SUMMARIZE profile to inspect columns</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {profile.map((p) => (
                      <div
                        key={p.column}
                        className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-medium text-zinc-200">
                            {p.column}
                          </span>
                          <Badge
                            variant="outline"
                            className="border-zinc-700 font-mono text-[9px] text-zinc-400"
                          >
                            {p.type}
                          </Badge>
                          <span className="ml-auto font-mono text-[10px] text-zinc-500">
                            {p.approxUnique.toLocaleString()} distinct
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-[10px] text-zinc-500">
                          <span className="w-24">null {p.nullPct.toFixed(1)}%</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                p.nullPct > 30 ? "bg-amber-500" : "bg-emerald-500",
                              )}
                              style={{ width: `${Math.min(100, p.nullPct)}%` }}
                            />
                          </div>
                          {p.min !== null && (
                            <span className="w-40 truncate text-right font-mono text-zinc-600">
                              {p.min} … {p.max}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* SQL tab */}
            <TabsContent value="sql" className="m-0 flex flex-1 flex-col overflow-hidden">
              <div className="flex flex-none items-center gap-2 border-b border-zinc-800 px-4 py-2">
                <Code2 className="h-3.5 w-3.5 text-purple-400" />
                <span className="text-xs text-zinc-400">Generated Pipeline SQL</span>
                {/* Offline SQL lint (node-sql-parser, worker). */}
                {sqlValidation.ok ? (
                  sqlValidation.bestEffort ? (
                    <span className="flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">
                      <AlertTriangle className="h-3 w-3" />
                      DuckDB-only syntax · validated at run
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" />
                      SQL valid
                    </span>
                  )
                ) : (
                  <span
                    className="flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400"
                    title={sqlValidation.error}
                  >
                    <XCircle className="h-3 w-3" />
                    SQL error
                  </span>
                )}
                <div className="flex-1" />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 border-zinc-800 text-xs"
                  onClick={() => navigator.clipboard.writeText(outputSQL)}
                  disabled={!outputSQL}
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </Button>
              </div>
              {!sqlValidation.ok && sqlValidation.error && (
                <div className="flex flex-none items-start gap-2 border-b border-red-500/20 bg-red-500/5 px-4 py-1.5 font-mono text-[10px] text-red-400">
                  <AlertTriangle className="mt-0.5 h-3 w-3 flex-none" />
                  <span className="break-all">{sqlValidation.error}</span>
                </div>
              )}
              <div className="flex-1 overflow-hidden">
                {/* Lazy-mount Monaco only when the SQL tab is actually open. */}
                {activeTab === "sql" && (
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
                )}
              </div>
            </TabsContent>

            {/* Analytics tab */}
            <TabsContent value="analytics" className="m-0 flex-1 overflow-auto p-6">
              <div className="mx-auto max-w-3xl space-y-6">
                {doneSteps.length > 0 ? (
                  <>
                    <Card className="border-zinc-800 bg-zinc-900">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Row Reduction Funnel</CardTitle>
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
                          value: `${reductionPct}%`,
                          color: "blue",
                        },
                      ].map((s) => (
                        <Card key={s.label} className="border-zinc-800 bg-zinc-900">
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
                            <p className="mt-1 text-xs text-zinc-500">{s.label}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    <Card className="border-zinc-800 bg-zinc-900">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Step Performance</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {doneSteps.map((s) => {
                          const rt = runtime[s.id];
                          return (
                            <div
                              key={s.id}
                              className="flex items-center gap-3 border-b border-zinc-800/30 py-2"
                            >
                              <div
                                className={cn(
                                  "flex flex-none items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]",
                                  STEP_COLORS[s.type],
                                )}
                              >
                                {STEP_ICONS[s.type]}
                                {s.type}
                              </div>
                              <span className="flex-1 truncate text-xs text-zinc-300">
                                {s.label}
                              </span>
                              <span className="font-mono text-xs text-zinc-500">
                                {(rt?.inputRows ?? 0).toLocaleString()}
                              </span>
                              <ArrowRight className="h-3 w-3 text-zinc-600" />
                              <span className="font-mono text-xs text-emerald-400">
                                {(rt?.outputRows ?? 0).toLocaleString()}
                              </span>
                            </div>
                          );
                        })}
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <div className="flex h-40 items-center justify-center text-zinc-500">
                    <div className="text-center">
                      <BarChart2 className="mx-auto mb-3 h-10 w-10 opacity-30" />
                      <p className="text-sm">Run the pipeline to see analytics</p>
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

function ConfigField({
  label,
  value,
  placeholder,
  hint,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  hint?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-zinc-400">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 border-zinc-700 bg-zinc-800 font-mono text-xs"
        placeholder={placeholder}
      />
      {hint && <p className="text-[10px] text-zinc-600">{hint}</p>}
    </div>
  );
}
