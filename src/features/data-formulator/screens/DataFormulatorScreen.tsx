"use client";

import {
  Activity,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  Eye,
  Filter,
  FlaskConical,
  GitBranch,
  Hash,
  Layers,
  Lightbulb,
  Loader2,
  Pin,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Terminal,
  Trash2,
  TrendingUp,
  Type,
  Wand2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TELECOM_TABLE_BASE } from "@/features/telecom/lib/names";
import { useTelecomStore } from "@/features/telecom/store";
import type { ChartType } from "@/features/agent-canvas/core/types";
import {
  deriveField,
  describeChart,
  flagOutliers,
  linearTrendline,
  nlToSpec,
  recommendCharts,
} from "@/features/data-formulator/core/ai";
import { buildSQL } from "@/features/data-formulator/core/sql";
import type {
  AggregateFn,
  ChartSpec,
  ColType,
  ColumnInfo,
  DataThreadEntry,
  DerivedField,
  Encoding,
  FilterDef,
  QueryResult,
} from "@/features/data-formulator/core/types";
import { getTableInfo, listTables, runQuery } from "@/platform/duckdb/duckdb";
import {
  ensureSandboxReady,
  installPackages,
  loadDataFrame,
  resetSession,
  runPython,
} from "@/platform/python-sandbox/core";
import { cn } from "@/shared/utils";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

import { buildOption } from "@/features/data-formulator/core/chart-options";
import {
  AGGREGATES,
  CHART_TYPES,
  FILTER_OPS,
} from "@/features/data-formulator/core/constants";
import {
  fmtVal,
  genId,
  inferType,
} from "@/features/data-formulator/core/helpers";
// ─── Sub-components ───────────────────────────────────────────────────────────

function ColumnPill({
  col,
  onDragStart,
  onDelete,
}: {
  col: ColumnInfo;
  onDragStart: (col: ColumnInfo) => void;
  onDelete?: () => void;
}) {
  const icon =
    col.type === "number" ? (
      <Hash className="w-3 h-3" />
    ) : col.type === "date" ? (
      <TrendingUp className="w-3 h-3" />
    ) : col.type === "boolean" ? (
      <Filter className="w-3 h-3" />
    ) : (
      <Type className="w-3 h-3" />
    );

  const color =
    col.type === "number"
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
      : col.type === "date"
        ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
        : col.type === "boolean"
          ? "text-blue-400 bg-blue-500/10 border-blue-500/20"
          : "text-violet-400 bg-violet-500/10 border-violet-500/20";

  return (
    // biome-ignore lint/a11y/useSemanticElements: nested delete button forbids button wrapper
    <div
      draggable
      role="button"
      tabIndex={0}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", col.name);
        onDragStart(col);
      }}
      className={cn(
        "group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-grab active:cursor-grabbing hover:brightness-110 transition-all",
        color,
        col.derived && "ring-1 ring-pink-500/30",
      )}
      title={col.derived ? `Derived: ${col.sql}` : col.dbType}
    >
      {icon}
      <span className="truncate max-w-[140px]">{col.name}</span>
      {col.derived && <Sparkles className="w-2.5 h-2.5 text-pink-400" />}
      {col.derived && onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 ml-auto"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}

function EncodingSlot({
  channel,
  encoding,
  columns,
  onChange,
  onRemove,
  onDrop,
}: {
  channel: Encoding["channel"];
  encoding?: Encoding;
  columns: ColumnInfo[];
  onChange: (e: Encoding) => void;
  onRemove: () => void;
  onDrop: (field: string) => void;
}) {
  const labels: Record<string, string> = {
    x: "X / Dimension",
    y: "Y / Metric",
    color: "Color / Series",
    size: "Size / Weight",
    facet: "Facet",
    tooltip: "Tooltip",
  };
  const [over, setOver] = useState(false);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop target — keyboard interactions n/a
    <div
      className={cn(
        "rounded-xl border p-2.5 transition-all",
        over
          ? "border-primary bg-primary/10"
          : encoding
            ? "border-border bg-muted"
            : "border-dashed border-border bg-muted/40",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDrop(e.dataTransfer.getData("text/plain"));
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {labels[channel]}
        </span>
        {encoding && (
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground hover:text-red-400"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {encoding ? (
        <div className="space-y-1.5">
          <select
            value={encoding.field}
            onChange={(e) => onChange({ ...encoding, field: e.target.value })}
            className="w-full bg-card border border-border rounded-lg px-2 py-1 text-xs text-foreground focus:border-primary outline-none"
          >
            {columns.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          {(channel === "y" || channel === "size") && (
            <select
              value={encoding.aggregate ?? "none"}
              onChange={(e) =>
                onChange({
                  ...encoding,
                  aggregate: e.target.value as AggregateFn,
                })
              }
              className="w-full bg-card border border-border rounded-lg px-2 py-1 text-xs text-foreground focus:border-primary outline-none"
            >
              {AGGREGATES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground text-center py-1">
          Drop column
        </p>
      )}
    </div>
  );
}

// ─── Sandbox panel ────────────────────────────────────────────────────────────

interface SandboxState {
  loading: boolean;
  ready: boolean;
  progress: string;
  output: string;
  error: string;
  duration: number;
}

function PythonSandboxPanel({
  tableName,
  rows,
  onClose,
  onLog,
}: {
  tableName: string;
  rows: Record<string, unknown>[];
  onClose: () => void;
  onLog: (entry: Omit<DataThreadEntry, "id" | "ts">) => void;
}) {
  const sessionIdRef = useRef(`session-${Date.now()}`);
  const [code, setCode] = useState<string>(
    `# 'df' is the active query result as a pandas DataFrame
# Available libraries: pandas, numpy. Install more with %install <pkg>.
print(df.shape)
print(df.head())
print(df.describe(include='all').T)
`,
  );
  const [pkgInput, setPkgInput] = useState("");
  const [state, setState] = useState<SandboxState>({
    loading: false,
    ready: false,
    progress: "",
    output: "",
    error: "",
    duration: 0,
  });

  const ensureLoaded = useCallback(async () => {
    if (state.ready) return;
    setState((s) => ({ ...s, loading: true, error: "", progress: "Loading…" }));
    try {
      await ensureSandboxReady((p) => setState((s) => ({ ...s, progress: p })));
      // Push current data as a DataFrame
      if (rows.length) {
        await loadDataFrame(sessionIdRef.current, "df", rows);
      }
      setState((s) => ({
        ...s,
        ready: true,
        loading: false,
        progress: "Ready",
      }));
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      }));
    }
  }, [rows, state.ready]);

  // Refresh DataFrame whenever rows change
  useEffect(() => {
    if (!state.ready || !rows.length) return;
    loadDataFrame(sessionIdRef.current, "df", rows).catch(() => {});
  }, [rows, state.ready]);

  const run = useCallback(async () => {
    await ensureLoaded();
    setState((s) => ({ ...s, output: "", error: "", loading: true }));
    try {
      const r = await runPython(code, {
        sessionId: sessionIdRef.current,
        onStdout: (s) =>
          setState((st) => ({ ...st, output: `${st.output}${s}` })),
        onStderr: (s) =>
          setState((st) => ({ ...st, output: `${st.output}[stderr] ${s}` })),
      });
      setState((s) => ({ ...s, loading: false, duration: r.durationMs }));
      onLog({
        kind: "sandbox",
        message: "Ran Python in sandbox",
        detail: `${code.slice(0, 80)}${code.length > 80 ? "…" : ""} · ${r.durationMs}ms`,
      });
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      }));
    }
  }, [code, ensureLoaded, onLog]);

  const install = useCallback(async () => {
    if (!pkgInput.trim()) return;
    await ensureLoaded();
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      await installPackages(
        sessionIdRef.current,
        pkgInput
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean),
      );
      setState((s) => ({
        ...s,
        loading: false,
        output: `${s.output}\n[ok] installed: ${pkgInput}\n`,
      }));
      setPkgInput("");
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      }));
    }
  }, [pkgInput, ensureLoaded]);

  const reset = useCallback(async () => {
    await resetSession(sessionIdRef.current);
    sessionIdRef.current = `session-${Date.now()}`;
    setState({
      loading: false,
      ready: false,
      progress: "",
      output: "",
      error: "",
      duration: 0,
    });
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <Terminal className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-semibold text-foreground">
          Python Sandbox (Pyodide)
        </span>
        <span className="text-[10px] text-muted-foreground">
          isolated · langchain-sandbox style
        </span>
        {state.progress && !state.ready && (
          <span className="text-[10px] text-amber-400 ml-2">
            {state.progress}
          </span>
        )}
        {state.ready && (
          <span className="text-[10px] text-emerald-400 ml-2">● ready</span>
        )}
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground">
          table: <span className="text-violet-400">{tableName}</span> · rows:{" "}
          {rows.length}
        </span>
        <button
          type="button"
          onClick={reset}
          className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
          title="Reset interpreter"
        >
          <RefreshCw className="w-3 h-3" /> Reset
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-red-400"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border">
        <div className="bg-card flex flex-col">
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            className="flex-1 bg-transparent text-xs font-mono p-3 text-foreground outline-none resize-none min-h-[260px]"
          />
          <div className="border-t border-border px-3 py-2 flex items-center gap-2">
            <button
              type="button"
              onClick={run}
              disabled={state.loading}
              className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500 hover:bg-emerald-500/90 disabled:opacity-50 rounded-lg text-xs text-white font-medium"
            >
              {state.loading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              Run
            </button>
            <input
              value={pkgInput}
              onChange={(e) => setPkgInput(e.target.value)}
              placeholder="pip install: scipy, scikit-learn…"
              className="flex-1 bg-muted border border-border rounded-lg px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={install}
              disabled={!pkgInput.trim() || state.loading}
              className="px-2 py-1 bg-muted hover:bg-accent text-[11px] text-foreground rounded-lg disabled:opacity-50"
            >
              Install
            </button>
            {state.duration > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {state.duration}ms
              </span>
            )}
          </div>
        </div>

        <div className="bg-card flex flex-col min-h-[260px]">
          <div className="px-3 py-1.5 border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground font-bold">
            Output
          </div>
          <pre className="flex-1 overflow-auto p-3 text-xs font-mono text-foreground whitespace-pre-wrap">
            {state.output || (
              <span className="text-muted-foreground">
                Press Run. The current chart's result is bound to{" "}
                <span className="text-violet-400">df</span> (pandas DataFrame).
              </span>
            )}
            {state.error && (
              <span className="text-red-400">
                {"\n"}
                {state.error}
              </span>
            )}
          </pre>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Chart card ───────────────────────────────────────────────────────────────

function ChartCard({
  spec,
  result,
  onUpdate,
  onDuplicate,
  onDelete,
  onRefine,
  onOpenSandbox,
  onPin,
  refining,
}: {
  spec: ChartSpec;
  result: QueryResult | null | undefined;
  onUpdate: (patch: Partial<ChartSpec>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRefine: (prompt: string) => void;
  onOpenSandbox: () => void;
  onPin: () => void;
  refining: boolean;
}) {
  const [refinePrompt, setRefinePrompt] = useState("");
  const option = useMemo(
    () => (result ? buildOption(spec, result.data) : null),
    [spec, result],
  );

  const insight = useMemo(() => {
    if (!result || result.data.length === 0) return spec.insight ?? "";
    return spec.insight || describeChart(spec, result.data);
  }, [spec, result]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col"
    >
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <input
          value={spec.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder="Chart title"
          className="flex-1 bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground"
        />
        <select
          value={spec.type}
          onChange={(e) => onUpdate({ type: e.target.value as ChartType })}
          className="bg-muted border border-border rounded-lg px-2 py-1 text-[11px] text-foreground outline-none"
        >
          {CHART_TYPES.map((c) => (
            <option key={c.type} value={c.type}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onPin}
          className={cn(
            "p-1 rounded text-muted-foreground hover:text-amber-400",
            spec.pinnedAt && "text-amber-400",
          )}
          title="Pin"
        >
          <Pin className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onOpenSandbox}
          className="p-1 rounded text-muted-foreground hover:text-emerald-400"
          title="Open Python sandbox on this data"
        >
          <Terminal className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          className="p-1 rounded text-muted-foreground hover:text-foreground"
          title="Duplicate"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1 rounded text-muted-foreground hover:text-red-400"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 p-3">
        {option ? (
          <ReactECharts
            option={option}
            style={{ height: 260 }}
            opts={{ renderer: "canvas" }}
            notMerge
          />
        ) : result === undefined ? (
          <div className="flex items-center justify-center h-[260px] text-muted-foreground text-xs gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Running…
          </div>
        ) : (
          <div className="flex items-center justify-center h-[260px] text-muted-foreground text-xs">
            No data
          </div>
        )}
      </div>

      {insight && (
        <div className="px-3 py-2 border-t border-border bg-muted/30 flex items-start gap-2">
          <Lightbulb className="w-3.5 h-3.5 text-amber-400 flex-none mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {insight}
          </p>
        </div>
      )}

      <div className="px-3 py-2 border-t border-border flex items-center gap-2">
        <Wand2 className="w-3.5 h-3.5 text-violet-400 flex-none" />
        <input
          value={refinePrompt}
          onChange={(e) => setRefinePrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && refinePrompt.trim()) {
              onRefine(refinePrompt);
              setRefinePrompt("");
            }
          }}
          placeholder='Refine: "stack by region", "top 10", "add trendline"…'
          className="flex-1 bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground outline-none"
        />
        {refining && (
          <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
        )}
      </div>
    </motion.div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DataFormulatorScreen() {
  const telecomMapping = useTelecomStore((s) => s.columnMapping);
  const telecomFile = useTelecomStore((s) => s.fileName);

  const [tables, setTables] = useState<string[]>([]);
  const [activeTable, setActiveTable] = useState("");
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [derived, setDerived] = useState<DerivedField[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setDragCol] = useState<ColumnInfo | null>(null);
  const [colSearch, setColSearch] = useState("");
  const [thread, setThread] = useState<DataThreadEntry[]>([]);
  const [threadOpen, setThreadOpen] = useState(false);
  const [sandboxFor, setSandboxFor] = useState<string | null>(null);
  const [refiningId, setRefiningId] = useState<string | null>(null);
  const [globalNL, setGlobalNL] = useState("");
  const [creatingDerived, setCreatingDerived] = useState(false);
  const [derivedPrompt, setDerivedPrompt] = useState("");
  const [derivedError, setDerivedError] = useState("");
  const [topErr, setTopErr] = useState("");
  const [columnCardinality, setColumnCardinality] = useState<
    Record<string, number>
  >({});

  const [charts, setCharts] = useState<ChartSpec[]>([]);
  const [results, setResults] = useState<
    Record<string, QueryResult | undefined | null>
  >({});

  const isTelecomTable = activeTable.startsWith(TELECOM_TABLE_BASE);

  const logThread = useCallback((e: Omit<DataThreadEntry, "id" | "ts">) => {
    setThread((t) => [
      { id: genId(), ts: Date.now(), ...e },
      ...t.slice(0, 99),
    ]);
  }, []);

  // Load tables
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const tbls = await listTables();
        if (!alive) return;
        setTables(tbls);
        // Prefer the active telecom table when present
        const telecomMatch = tbls.find((t) => t.startsWith(TELECOM_TABLE_BASE));
        setActiveTable(telecomMatch ?? tbls[0] ?? "");
      } catch {
        /* */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Load columns when table changes
  useEffect(() => {
    if (!activeTable) return;
    let alive = true;
    (async () => {
      try {
        const info = await getTableInfo(activeTable);
        if (!alive) return;
        const cols: ColumnInfo[] = info.columns.map((c) => ({
          name: c.name,
          type: inferType(c.type),
          dbType: c.type,
        }));
        setColumns(cols);
        setDerived([]);
        // approximate cardinality for low-cardinality cats
        const cardEntries = await Promise.all(
          cols
            .filter((c) => c.type === "string")
            .slice(0, 20)
            .map(async (c) => {
              try {
                const r = await runQuery(
                  `SELECT COUNT(DISTINCT "${c.name}") as n FROM "${activeTable}"`,
                );
                return [c.name, Number(r[0]?.n ?? 0)] as const;
              } catch {
                return [c.name, 0] as const;
              }
            }),
        );
        if (!alive) return;
        setColumnCardinality(Object.fromEntries(cardEntries));
      } catch {
        if (alive) setColumns([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [activeTable]);

  // All effective columns (base + derived)
  const allColumns: ColumnInfo[] = useMemo(
    () => [
      ...columns,
      ...derived.map<ColumnInfo>((d) => ({
        name: d.name,
        type: "number",
        dbType: "DERIVED",
        derived: true,
        derivedFrom: d.parents,
        sql: d.sql,
        prompt: d.prompt,
      })),
    ],
    [columns, derived],
  );

  const filteredCols = useMemo(() => {
    if (!colSearch) return allColumns;
    const q = colSearch.toLowerCase();
    return allColumns.filter((c) => c.name.toLowerCase().includes(q));
  }, [allColumns, colSearch]);

  // ── Recommendations ────────────────────────────────────────────────────────
  const recommendations = useMemo(
    () => recommendCharts(allColumns, columnCardinality),
    [allColumns, columnCardinality],
  );

  // ── Telecom shortcuts ──────────────────────────────────────────────────────
  const telecomShortcuts = useMemo(() => {
    if (!isTelecomTable || !telecomMapping) return [];
    const m = telecomMapping;
    const colMap = new Map(columns.map((c) => [c.name, c]));
    const has = (s: string) => !!colMap.get(s);
    const list: Array<{ label: string; spec: Omit<ChartSpec, "id"> }> = [];

    if (has(m.canal) && has(m.amount)) {
      list.push({
        label: "Amount by channel",
        spec: {
          type: "bar",
          encodings: [
            { id: genId(), channel: "x", field: m.canal },
            {
              id: genId(),
              channel: "y",
              field: m.amount,
              aggregate: "sum",
              sort: "desc",
            },
          ],
          filters: [],
          limit: 20,
          title: "Amount by channel",
        },
      });
    }
    if (has(m.transactionDate) && has(m.amount)) {
      list.push({
        label: "Daily amount trend",
        spec: {
          type: "line",
          encodings: [
            { id: genId(), channel: "x", field: m.transactionDate },
            { id: genId(), channel: "y", field: m.amount, aggregate: "sum" },
          ],
          filters: [],
          limit: 200,
          title: "Daily amount trend",
          showTrendline: true,
        },
      });
    }
    if (has(m.status) && has(m.transactionId)) {
      list.push({
        label: "Status mix",
        spec: {
          type: "donut",
          encodings: [
            { id: genId(), channel: "x", field: m.status },
            {
              id: genId(),
              channel: "y",
              field: m.transactionId,
              aggregate: "count",
            },
          ],
          filters: [],
          limit: 12,
          title: "Status mix",
        },
      });
    }
    if (has(m.canal) && has(m.status) && has(m.amount)) {
      list.push({
        label: "Channel × status amount",
        spec: {
          type: "heatmap",
          encodings: [
            { id: genId(), channel: "x", field: m.canal },
            { id: genId(), channel: "color", field: m.status },
            { id: genId(), channel: "size", field: m.amount, aggregate: "sum" },
          ],
          filters: [],
          limit: 400,
          title: "Channel × status",
        },
      });
    }
    if (has(m.serviceName) && has(m.amount)) {
      list.push({
        label: "Top services by amount",
        spec: {
          type: "bar",
          encodings: [
            { id: genId(), channel: "x", field: m.serviceName },
            {
              id: genId(),
              channel: "y",
              field: m.amount,
              aggregate: "sum",
              sort: "desc",
            },
          ],
          filters: [],
          limit: 15,
          title: "Top services",
          topN: 15,
        },
      });
    }
    return list;
  }, [isTelecomTable, telecomMapping, columns]);

  // ── Add chart from spec ────────────────────────────────────────────────────
  const addChart = useCallback(
    (partial: Omit<ChartSpec, "id">) => {
      const c: ChartSpec = { id: genId(), ...partial };
      setCharts((p) => [c, ...p]);
      logThread({
        kind: "chart",
        message: `Added chart: ${c.title}`,
        chartId: c.id,
      });
    },
    [logThread],
  );

  // ── Run a chart ────────────────────────────────────────────────────────────
  const runChart = useCallback(
    async (spec: ChartSpec) => {
      if (!activeTable || spec.encodings.length === 0) return;
      setResults((r) => ({ ...r, [spec.id]: undefined }));
      const start = performance.now();
      try {
        const sql = buildSQL(spec, activeTable, derived);
        const data = await runQuery(sql);
        setResults((r) => ({
          ...r,
          [spec.id]: {
            sql,
            data,
            duration: Math.round(performance.now() - start),
            rowCount: data.length,
          },
        }));
        // auto-insight
        setCharts((cs) =>
          cs.map((c) =>
            c.id === spec.id ? { ...c, insight: describeChart(spec, data) } : c,
          ),
        );
      } catch (e) {
        setResults((r) => ({ ...r, [spec.id]: null }));
        setTopErr(e instanceof Error ? e.message : String(e));
      }
    },
    [activeTable, derived],
  );

  // Auto-run charts when spec/derived/table changes (debounced per chart)
  const lastKeyRef = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!activeTable) return;
    const timer = setTimeout(() => {
      for (const c of charts) {
        const key =
          JSON.stringify(c.encodings) +
          c.type +
          JSON.stringify(c.filters) +
          c.limit +
          (c.topN ?? "") +
          (c.showTrendline ? "T" : "") +
          (c.showOutliers ? "O" : "") +
          activeTable +
          derived.map((d) => d.id).join(",");
        if (lastKeyRef.current[c.id] !== key) {
          lastKeyRef.current[c.id] = key;
          runChart(c);
        }
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [charts, activeTable, derived, runChart]);

  // ── Chart mutations ────────────────────────────────────────────────────────
  const updateChart = useCallback((id: string, patch: Partial<ChartSpec>) => {
    setCharts((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const dropOnChannel = useCallback(
    (chartId: string, channel: Encoding["channel"], field: string) => {
      const col = allColumns.find((c) => c.name === field);
      if (!col) return;
      setCharts((cs) =>
        cs.map((c) => {
          if (c.id !== chartId) return c;
          const others = c.encodings.filter((e) => e.channel !== channel);
          const newEnc: Encoding = {
            id: genId(),
            channel,
            field,
            aggregate:
              channel === "y" && col.type === "number" ? "sum" : "none",
          };
          return { ...c, encodings: [...others, newEnc] };
        }),
      );
    },
    [allColumns],
  );

  const updateEncoding = useCallback(
    (chartId: string, channel: Encoding["channel"], enc: Encoding) => {
      setCharts((cs) =>
        cs.map((c) =>
          c.id === chartId
            ? {
                ...c,
                encodings: c.encodings.map((e) =>
                  e.channel === channel ? enc : e,
                ),
              }
            : c,
        ),
      );
    },
    [],
  );

  const removeEncoding = useCallback(
    (chartId: string, channel: Encoding["channel"]) => {
      setCharts((cs) =>
        cs.map((c) =>
          c.id === chartId
            ? {
                ...c,
                encodings: c.encodings.filter((e) => e.channel !== channel),
              }
            : c,
        ),
      );
    },
    [],
  );

  // ── Refine a chart with NL ─────────────────────────────────────────────────
  const refineChart = useCallback(
    async (chartId: string, prompt: string) => {
      const target = charts.find((c) => c.id === chartId);
      if (!target) return;
      setRefiningId(chartId);
      try {
        const patch = await nlToSpec(prompt, allColumns, target);
        if (patch) {
          updateChart(chartId, patch);
          logThread({
            kind: "refine",
            message: `Refined: ${prompt}`,
            chartId,
            detail: JSON.stringify(patch).slice(0, 120),
          });
        } else {
          setTopErr(
            "Could not interpret refinement. Try wording like 'top 10', 'stack by <col>', 'add trendline'.",
          );
        }
      } catch (e) {
        setTopErr(e instanceof Error ? e.message : String(e));
      } finally {
        setRefiningId(null);
      }
    },
    [charts, allColumns, updateChart, logThread],
  );

  // ── Global NL → new chart ──────────────────────────────────────────────────
  const handleGlobalNL = useCallback(async () => {
    if (!globalNL.trim()) return;
    try {
      const patch = await nlToSpec(globalNL, allColumns);
      if (patch?.encodings?.length) {
        addChart({
          type: patch.type ?? "bar",
          encodings: patch.encodings,
          filters: patch.filters ?? [],
          limit: patch.limit ?? 100,
          title: patch.title ?? globalNL,
          topN: patch.topN,
          showTrendline: patch.showTrendline,
          showOutliers: patch.showOutliers,
        });
        setGlobalNL("");
      } else {
        setTopErr(
          "Could not parse query. Try 'top 10 X by Y' or 'distribution of X'.",
        );
      }
    } catch (e) {
      setTopErr(e instanceof Error ? e.message : String(e));
    }
  }, [globalNL, allColumns, addChart]);

  // ── Derived field creation ─────────────────────────────────────────────────
  const handleDerive = useCallback(async () => {
    if (!derivedPrompt.trim()) return;
    setCreatingDerived(true);
    setDerivedError("");
    try {
      const r = await deriveField({
        prompt: derivedPrompt,
        columns: allColumns,
        tableName: activeTable,
      });
      setDerived((d) => [r.field, ...d]);
      logThread({
        kind: "derive",
        message: `Created derived: ${r.field.name} (${r.source})`,
        detail: r.field.sql,
        fieldId: r.field.id,
      });
      setDerivedPrompt("");
    } catch (e) {
      setDerivedError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingDerived(false);
    }
  }, [derivedPrompt, allColumns, activeTable, logThread]);

  // ── Filter mutations ───────────────────────────────────────────────────────
  const addFilter = useCallback(
    (chartId: string) => {
      setCharts((cs) =>
        cs.map((c) =>
          c.id === chartId
            ? {
                ...c,
                filters: [
                  ...c.filters,
                  {
                    id: genId(),
                    field: allColumns[0]?.name ?? "",
                    op: "=",
                    value: "",
                  },
                ],
              }
            : c,
        ),
      );
    },
    [allColumns],
  );

  // ── Empty state ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground gap-3">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading tables…</span>
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-center px-6">
        <div className="w-20 h-20 rounded-3xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-6">
          <FlaskConical className="w-9 h-9 text-violet-400" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Data Formulator
        </h2>
        <p className="text-muted-foreground max-w-lg text-sm leading-relaxed mb-6">
          Visual query builder with offline AI, multi-chart canvas, derived
          fields, and an embedded Python sandbox. Upload a dataset or load a
          telecom file first.
        </p>
        <div className="flex gap-3">
          <a
            href="/dashboard/upload"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium"
          >
            <Database className="w-4 h-4" /> Upload data
          </a>
          <a
            href="/dashboard/telecom-report"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-muted hover:bg-accent text-foreground rounded-xl text-sm font-medium border border-border"
          >
            <Activity className="w-4 h-4" /> Open Telecom
          </a>
        </div>
      </div>
    );
  }

  // ── Sandbox host: pick the chart whose data feeds the sandbox ──────────────
  const sandboxChart = charts.find((c) => c.id === sandboxFor) ?? charts[0];
  const sandboxRows = sandboxChart
    ? (results[sandboxChart.id]?.data ?? [])
    : [];

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-full">
      {/* Header */}
      <div className="flex-none px-5 py-3 border-b border-border flex items-center gap-4 flex-wrap">
        <FlaskConical className="w-5 h-5 text-violet-400" />
        <h1 className="text-base font-bold text-foreground">Data Formulator</h1>

        <select
          value={activeTable}
          onChange={(e) => setActiveTable(e.target.value)}
          className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:border-primary outline-none"
        >
          {tables.map((t) => (
            <option key={t} value={t}>
              {t}
              {t === TELECOM_TABLE_BASE ? " (telecom)" : ""}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {columns.length} cols
          {derived.length > 0 ? ` · ${derived.length} derived` : ""}
        </span>
        {isTelecomTable && telecomFile && (
          <span className="text-[10px] text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10">
            telecom: {telecomFile}
          </span>
        )}
        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setThreadOpen((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
            threadOpen
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          <GitBranch className="w-3.5 h-3.5" /> Thread ({thread.length})
        </button>
      </div>

      {/* Global NL bar */}
      <div className="flex-none px-5 py-2.5 border-b border-border flex items-center gap-3">
        <Sparkles className="w-4 h-4 text-violet-400 flex-none" />
        <input
          value={globalNL}
          onChange={(e) => setGlobalNL(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleGlobalNL();
          }}
          placeholder='Ask: "top 10 services by amount", "trend over time", "distribution of duration"…'
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
        />
        <button
          type="button"
          onClick={handleGlobalNL}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 rounded-lg text-xs text-primary-foreground font-medium"
        >
          <Wand2 className="w-3.5 h-3.5" /> New chart
        </button>
      </div>

      {/* Telecom shortcuts */}
      {telecomShortcuts.length > 0 && (
        <div className="flex-none px-5 py-2 border-b border-border flex items-center gap-2 overflow-x-auto">
          <span className="text-[10px] uppercase font-bold text-emerald-400">
            Telecom presets:
          </span>
          {telecomShortcuts.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => addChart(s.spec)}
              className="flex-none px-2.5 py-1 rounded-lg text-[11px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Top error */}
      <AnimatePresence>
        {topErr && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex-none px-5 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs flex items-center gap-2"
          >
            <X className="w-3 h-3 flex-none" />
            <span className="flex-1">{topErr}</span>
            <button type="button" onClick={() => setTopErr("")}>
              <X className="w-3 h-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-72 flex-none border-r border-border flex flex-col overflow-hidden bg-card">
          {/* Fields */}
          <div className="flex-none px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                Fields
              </span>
            </div>
            <input
              value={colSearch}
              onChange={(e) => setColSearch(e.target.value)}
              placeholder="Search columns…"
              className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
            />
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5">
            {filteredCols.map((col) => (
              <ColumnPill
                key={col.name}
                col={col}
                onDragStart={setDragCol}
                onDelete={
                  col.derived
                    ? () =>
                        setDerived((d) => d.filter((x) => x.name !== col.name))
                    : undefined
                }
              />
            ))}
          </div>

          {/* Derived field creator */}
          <div className="flex-none border-t border-border px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-pink-400" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                Derive new column
              </span>
            </div>
            <textarea
              value={derivedPrompt}
              onChange={(e) => setDerivedPrompt(e.target.value)}
              placeholder='e.g. "ratio of amount to duration", "extract year of date", "flag amount > 1000"'
              rows={2}
              className="w-full bg-card border border-border rounded-lg px-2 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-none"
            />
            <button
              type="button"
              onClick={handleDerive}
              disabled={creatingDerived || !derivedPrompt.trim()}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-pink-500/15 border border-pink-500/30 hover:bg-pink-500/25 disabled:opacity-50 rounded-lg text-[11px] text-pink-300 font-medium"
            >
              {creatingDerived ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Plus className="w-3 h-3" />
              )}
              Create field
            </button>
            {derivedError && (
              <p className="text-[10px] text-red-400 leading-snug">
                {derivedError}
              </p>
            )}
          </div>

          {/* Recommendations */}
          <div className="flex-none border-t border-border px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                Suggested charts
              </span>
            </div>
            <div className="space-y-1.5">
              {recommendations.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Add columns to see suggestions.
                </p>
              )}
              {recommendations.map((r) => (
                <button
                  key={r.title}
                  type="button"
                  onClick={() => addChart(r.spec)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg bg-muted/40 border border-border hover:border-primary text-[11px] text-foreground hover:bg-muted transition-colors"
                  title={r.reason}
                >
                  <div className="font-medium truncate">{r.title}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {r.reason}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main canvas */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* New chart button */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  addChart({
                    type: "bar",
                    encodings: [],
                    filters: [],
                    limit: 100,
                    title: "Untitled chart",
                  })
                }
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 rounded-lg text-xs text-primary-foreground font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> New chart
              </button>
              <span className="text-[11px] text-muted-foreground">
                {charts.length} chart{charts.length === 1 ? "" : "s"} on canvas
              </span>
            </div>

            {/* Sandbox */}
            {sandboxFor && sandboxChart && (
              <PythonSandboxPanel
                tableName={`chart:${sandboxChart.title || "untitled"}`}
                rows={sandboxRows}
                onClose={() => setSandboxFor(null)}
                onLog={logThread}
              />
            )}

            {/* Chart grid */}
            {charts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[60vh] text-center">
                <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-muted-foreground mb-2">
                  Empty canvas
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Use a suggested chart, click a telecom preset, type a natural
                  language query, or create one with{" "}
                  <span className="text-foreground">New chart</span>.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
                <AnimatePresence>
                  {charts
                    .slice()
                    .sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0))
                    .map((c) => (
                      <div key={c.id} className="space-y-2">
                        <ChartCard
                          spec={c}
                          result={results[c.id]}
                          onUpdate={(p) => updateChart(c.id, p)}
                          onDuplicate={() => {
                            setCharts((cs) => [
                              { ...c, id: genId(), title: `${c.title} (copy)` },
                              ...cs,
                            ]);
                          }}
                          onDelete={() => {
                            setCharts((cs) => cs.filter((x) => x.id !== c.id));
                            setResults((r) => {
                              const { [c.id]: _, ...rest } = r;
                              return rest;
                            });
                            if (sandboxFor === c.id) setSandboxFor(null);
                          }}
                          onRefine={(p) => refineChart(c.id, p)}
                          refining={refiningId === c.id}
                          onOpenSandbox={() => setSandboxFor(c.id)}
                          onPin={() =>
                            updateChart(c.id, {
                              pinnedAt: c.pinnedAt ? undefined : Date.now(),
                            })
                          }
                        />

                        {/* Encoding shelves under each card */}
                        <div className="rounded-2xl border border-border bg-card p-2.5">
                          <div className="grid grid-cols-3 gap-2 mb-2">
                            {(["x", "y", "color"] as const).map((ch) => (
                              <EncodingSlot
                                key={ch}
                                channel={ch}
                                encoding={c.encodings.find(
                                  (e) => e.channel === ch,
                                )}
                                columns={allColumns}
                                onChange={(enc) =>
                                  updateEncoding(c.id, ch, enc)
                                }
                                onRemove={() => removeEncoding(c.id, ch)}
                                onDrop={(field) =>
                                  dropOnChannel(c.id, ch, field)
                                }
                              />
                            ))}
                          </div>
                          <ChartFiltersInline
                            spec={c}
                            columns={allColumns}
                            onAdd={() => addFilter(c.id)}
                            onUpdate={(fid, patch) =>
                              updateChart(c.id, {
                                filters: c.filters.map((f) =>
                                  f.id === fid ? { ...f, ...patch } : f,
                                ),
                              })
                            }
                            onRemove={(fid) =>
                              updateChart(c.id, {
                                filters: c.filters.filter((f) => f.id !== fid),
                              })
                            }
                          />
                          {results[c.id] && (
                            <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                              <span>{results[c.id]?.rowCount ?? 0} rows</span>
                              <span>· {results[c.id]?.duration ?? 0}ms</span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard
                                    .writeText(results[c.id]?.sql ?? "")
                                    .catch(() => {});
                                }}
                                className="ml-auto hover:text-foreground flex items-center gap-1"
                              >
                                <Eye className="w-3 h-3" /> SQL
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Data thread panel */}
          <AnimatePresence>
            {threadOpen && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 320, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                className="flex-none border-l border-border bg-card overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-violet-400" />
                  <span className="text-sm font-bold text-foreground">
                    Data thread
                  </span>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => setThread([])}
                    className="text-[10px] text-muted-foreground hover:text-red-400"
                  >
                    Clear
                  </button>
                </div>
                <div className="overflow-y-auto h-full pb-12">
                  {thread.length === 0 ? (
                    <p className="px-4 py-6 text-xs text-muted-foreground">
                      Each derived field, chart, refinement and sandbox run will
                      be logged here with full lineage.
                    </p>
                  ) : (
                    <div className="px-2 py-2 space-y-1">
                      {thread.map((t) => (
                        <div
                          key={t.id}
                          className="px-2.5 py-2 rounded-lg hover:bg-muted text-xs"
                        >
                          <div className="flex items-center gap-2 mb-0.5">
                            <span
                              className={cn(
                                "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                                t.kind === "derive"
                                  ? "bg-pink-500/20 text-pink-300"
                                  : t.kind === "chart"
                                    ? "bg-blue-500/20 text-blue-300"
                                    : t.kind === "refine"
                                      ? "bg-violet-500/20 text-violet-300"
                                      : t.kind === "sandbox"
                                        ? "bg-emerald-500/20 text-emerald-300"
                                        : "bg-amber-500/20 text-amber-300",
                              )}
                            >
                              {t.kind}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(t.ts).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-foreground leading-snug">
                            {t.message}
                          </p>
                          {t.detail && (
                            <p className="font-mono text-[10px] text-muted-foreground mt-1 truncate">
                              {t.detail}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ─── Inline chart filters ─────────────────────────────────────────────────────

function ChartFiltersInline({
  spec,
  columns,
  onAdd,
  onUpdate,
  onRemove,
}: {
  spec: ChartSpec;
  columns: ColumnInfo[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<FilterDef>) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-muted-foreground tracking-wide w-full"
      >
        <Filter className="w-3 h-3" />
        Filters{" "}
        {spec.filters.length > 0 && (
          <span className="text-violet-400">({spec.filters.length})</span>
        )}
        <div className="flex-1" />
        {open ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mt-1.5 space-y-1.5"
          >
            {spec.filters.map((f) => (
              <div key={f.id} className="flex items-center gap-1 text-[11px]">
                <select
                  value={f.field}
                  onChange={(e) => onUpdate(f.id, { field: e.target.value })}
                  className="flex-1 bg-card border border-border rounded px-1.5 py-1 text-foreground outline-none"
                >
                  {columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={f.op}
                  onChange={(e) =>
                    onUpdate(f.id, { op: e.target.value as FilterDef["op"] })
                  }
                  className="bg-card border border-border rounded px-1 py-1 text-foreground outline-none"
                >
                  {FILTER_OPS.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
                {f.op !== "IS NULL" && f.op !== "NOT NULL" && (
                  <input
                    value={f.value}
                    onChange={(e) => onUpdate(f.id, { value: e.target.value })}
                    placeholder="value"
                    className="flex-1 bg-card border border-border rounded px-1.5 py-1 text-foreground outline-none"
                  />
                )}
                <button
                  type="button"
                  onClick={() => onRemove(f.id)}
                  className="text-muted-foreground hover:text-red-400"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={onAdd}
              className="flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300"
            >
              <Plus className="w-3 h-3" /> Add filter
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
