"use client";

import {
  AlertCircle,
  BarChart3,
  Bot,
  Brain,
  Check,
  ChevronDown,
  Copy,
  Database,
  Hash,
  Info,
  Lightbulb,
  Loader2,
  RefreshCw,
  Rows3,
  Send,
  ShieldCheck,
  Sparkles,
  Table2,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ColMeta,
  inferColType,
  useDataStore,
} from "@/core/stores/data-store";
import { generateInsights, recommendCharts } from "@/platform/ai/insights";
import { suggestQuestions, translateNLQ } from "@/platform/ai/nlq";
import {
  listRegisteredDatasets,
  type RegisteredDataset,
  runReadOnlyQuery,
} from "@/platform/duckdb/duckdb";
import { cn } from "@/shared/utils";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

type MsgRole = "user" | "assistant";
type MsgKind = "text" | "result" | "error";

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  durationMs: number;
}

interface Message {
  id: string;
  role: MsgRole;
  kind: MsgKind;
  content: string;
  sql?: string;
  result?: QueryResult;
  chartOption?: Record<string, unknown>;
  chartSuggestion?: string;
  confidence?: string;
  thinking?: boolean;
}

interface TableCtx {
  datasetId: string;
  tableName: string;
  columns: ColMeta[];
  rowCount: number;
  displayName: string;
  sourceFormat?: string;
}

interface DatasetOption {
  id: string;
  label: string;
  viewName: string;
  rowCount: number;
  columnCount: number;
  sourceFormat?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function catalogColumnsToColMeta(dataset: RegisteredDataset): ColMeta[] {
  return dataset.columns.map((column) => ({
    name: column.name,
    type: inferColType(column.type),
    nullCount: 0,
    distinctCount: 0,
    sample: [],
  }));
}

function datasetToCtx(dataset: {
  id: string;
  name?: string;
  displayName?: string;
  tableName?: string;
  viewName?: string;
  columns: ColMeta[];
  rowCount: number;
  format?: string;
  sourceFormat?: string;
}): TableCtx {
  const viewName = dataset.viewName || dataset.tableName || dataset.id;

  return {
    datasetId: dataset.id,
    tableName: viewName,
    columns: dataset.columns,
    rowCount: dataset.rowCount,
    displayName: dataset.name || dataset.displayName || viewName,
    sourceFormat: dataset.format || dataset.sourceFormat,
  };
}

function catalogToOption(dataset: RegisteredDataset): DatasetOption {
  return {
    id: dataset.id,
    label: dataset.displayName,
    viewName: dataset.viewName,
    rowCount: dataset.rowCount,
    columnCount: dataset.columns.length,
    sourceFormat: dataset.sourceFormat,
  };
}

function buildChartFromResult(
  result: QueryResult,
  suggestion: string,
): Record<string, unknown> | null {
  const { columns, rows } = result;

  if (rows.length === 0 || columns.length < 2) return null;

  const dark = {
    bg: "transparent",
    tooltip: {
      backgroundColor: "#0f172a",
      borderColor: "rgba(255,255,255,0.12)",
      textStyle: { color: "#e2e8f0", fontSize: 11 },
    },
    axisLabel: { color: "#94a3b8" },
    splitLine: { lineStyle: { color: "rgba(148,163,184,0.18)" } },
  };

  const colors = [
    "#60a5fa",
    "#34d399",
    "#f472b6",
    "#fbbf24",
    "#a78bfa",
    "#2dd4bf",
  ];

  if (suggestion === "pie") {
    const [nameColumn, valueColumn] = columns;

    return {
      backgroundColor: dark.bg,
      tooltip: { ...dark.tooltip, trigger: "item" },
      series: [
        {
          type: "pie",
          radius: ["44%", "72%"],
          data: rows.map((row) => ({
            name: String(row[nameColumn] ?? ""),
            value: Number(row[valueColumn] ?? 0),
          })),
          itemStyle: { borderColor: "#020617", borderWidth: 2 },
          label: { color: "#e2e8f0", fontSize: 10 },
        },
      ],
      color: colors,
    };
  }

  if (suggestion === "scatter") {
    const [xColumn, yColumn] = columns;

    return {
      backgroundColor: dark.bg,
      tooltip: { ...dark.tooltip, trigger: "item" },
      grid: { top: 20, right: 20, bottom: 42, left: 52, containLabel: true },
      xAxis: {
        type: "value",
        name: xColumn,
        axisLabel: dark.axisLabel,
        splitLine: dark.splitLine,
      },
      yAxis: {
        type: "value",
        name: yColumn,
        axisLabel: dark.axisLabel,
        splitLine: dark.splitLine,
      },
      series: [
        {
          type: "scatter",
          data: rows.map((row) => [
            Number(row[xColumn] ?? 0),
            Number(row[yColumn] ?? 0),
          ]),
          itemStyle: { color: "#60a5fa", opacity: 0.75 },
          symbolSize: 7,
        },
      ],
    };
  }

  if (suggestion === "line" || suggestion === "bar") {
    const [xColumn, ...yColumns] = columns;
    const isLine = suggestion === "line";

    return {
      backgroundColor: dark.bg,
      tooltip: { ...dark.tooltip, trigger: "axis" },
      legend:
        yColumns.length > 1
          ? {
              data: yColumns,
              textStyle: { color: "#94a3b8", fontSize: 10 },
              top: 0,
            }
          : undefined,
      grid: {
        top: yColumns.length > 1 ? 34 : 12,
        right: 20,
        bottom: 42,
        left: 24,
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: rows.map((row) => String(row[xColumn] ?? "")),
        axisLabel: {
          ...dark.axisLabel,
          rotate: rows.length > 8 ? 25 : 0,
          fontSize: 10,
        },
      },
      yAxis: {
        type: "value",
        axisLabel: { ...dark.axisLabel, fontSize: 10 },
        splitLine: dark.splitLine,
      },
      series: yColumns.map((column, index) => ({
        name: column,
        type: isLine ? "line" : "bar",
        data: rows.map((row) => Number(row[column] ?? 0)),
        smooth: isLine,
        symbol: isLine ? "none" : undefined,
        itemStyle: {
          color: colors[index % colors.length],
          borderRadius: isLine ? undefined : [6, 6, 0, 0],
        },
        areaStyle: isLine
          ? {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  {
                    offset: 0,
                    color: `${colors[index % colors.length]}30`,
                  },
                  { offset: 1, color: "transparent" },
                ],
              },
            }
          : undefined,
        barMaxWidth: 42,
      })),
    };
  }

  const [categoryColumn, valueColumn] = columns;

  return {
    backgroundColor: dark.bg,
    tooltip: { ...dark.tooltip, trigger: "axis" },
    grid: { top: 14, right: 20, bottom: 14, left: 20, containLabel: true },
    xAxis: {
      type: "value",
      axisLabel: { ...dark.axisLabel, fontSize: 10 },
      splitLine: dark.splitLine,
    },
    yAxis: {
      type: "category",
      data: rows.map((row) => String(row[categoryColumn] ?? "")).reverse(),
      axisLabel: { color: "#e2e8f0", fontSize: 10 },
    },
    series: [
      {
        type: "bar",
        data: rows.map((row) => Number(row[valueColumn] ?? 0)).reverse(),
        itemStyle: { color: "#60a5fa", borderRadius: [0, 6, 6, 0] },
        barMaxWidth: 24,
      },
    ],
  };
}

// ─── Result table ─────────────────────────────────────────────────────────────

function ResultTable({ result }: { result: QueryResult }) {
  const maxRows = 50;
  const visibleRows = result.rows.slice(0, maxRows);

  if (visibleRows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-5 text-center">
        <Rows3 className="mx-auto h-5 w-5 text-muted-foreground/70" />
        <p className="mt-2 text-xs text-muted-foreground">
          Query returned 0 rows.
        </p>
      </div>
    );
  }

  if (result.columns.length === 1 && result.rows.length === 1) {
    const value = result.rows[0][result.columns[0]];

    return (
      <div className="rounded-2xl border border-border bg-background p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
            <Hash className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-bold tabular-nums text-foreground">
              {typeof value === "number"
                ? value.toLocaleString()
                : String(value ?? "")}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {result.columns[0]}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/80">
              {result.columns.map((column) => (
                <th
                  key={column}
                  className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => (
              <tr
                key={`${index}-${JSON.stringify(row).slice(0, 64)}`}
                className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
              >
                {result.columns.map((column) => (
                  <td
                    key={column}
                    className="max-w-40 truncate px-3 py-2 font-mono text-[11px] text-foreground"
                    title={String(row[column] ?? "")}
                  >
                    {String(row[column] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.rows.length > maxRows && (
        <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
          Showing {maxRows} of {result.rows.length.toLocaleString()} rows
        </div>
      )}
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MsgBubble({ msg }: { msg: Message }) {
  const [copied, setCopied] = useState(false);
  const isUser = msg.role === "user";

  const copy = useCallback(() => {
    navigator.clipboard.writeText(msg.sql ?? msg.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [msg.sql, msg.content]);

  if (msg.thinking) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
          <Brain className="h-4 w-4 animate-pulse" />
        </div>
        <div className="text-sm text-muted-foreground">Thinking</div>
        <span className="flex gap-1">
          {[0, 0.2, 0.4].map((delay) => (
            <span
              key={delay}
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500"
              style={{ animationDelay: `${delay}s` }}
            />
          ))}
        </span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex flex-col gap-2",
        isUser ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "max-w-[92%] rounded-3xl px-4 py-3 text-sm leading-relaxed shadow-sm",
          isUser
            ? "rounded-br-lg bg-primary text-primary-foreground"
            : msg.kind === "error"
              ? "rounded-bl-lg border border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300"
              : "rounded-bl-lg border border-border bg-card text-foreground",
        )}
      >
        <div className="whitespace-pre-wrap">{msg.content}</div>

        {msg.confidence && msg.confidence !== "high" && (
          <span
            className={cn(
              "mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px]",
              msg.confidence === "low"
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-300"
                : "bg-blue-500/15 text-blue-600 dark:text-blue-300",
            )}
          >
            {msg.confidence} confidence
          </span>
        )}
      </div>

      {msg.sql && (
        <div className="w-full overflow-hidden rounded-2xl border border-border bg-background">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <Database className="h-3 w-3" />
              Read-only SQL
            </div>
            <button
              type="button"
              onClick={copy}
              className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          <pre className="max-h-40 overflow-auto px-3 py-2 font-mono text-[11px] whitespace-pre-wrap text-emerald-600 dark:text-emerald-300">
            {msg.sql}
          </pre>
        </div>
      )}

      {msg.result && msg.chartSuggestion !== "number" && (
        <div className="w-full space-y-2">
          <ResultTable result={msg.result} />
          <div className="flex items-center gap-2 px-1 text-[10px] text-muted-foreground">
            <span>{msg.result.rows.length.toLocaleString()} rows</span>
            <span>·</span>
            <span>{msg.result.durationMs}ms</span>
          </div>
        </div>
      )}

      {msg.result && msg.chartSuggestion === "number" && (
        <ResultTable result={msg.result} />
      )}

      {msg.chartOption && (
        <div className="w-full overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <BarChart3 className="h-3 w-3" />
            Chart
          </div>
          <ReactECharts
            option={msg.chartOption}
            style={{ height: 220 }}
            opts={{ renderer: "canvas" }}
          />
        </div>
      )}
    </motion.div>
  );
}

// ─── Dataset picker ───────────────────────────────────────────────────────────

function DatasetPicker({
  options,
  activeId,
  onSelect,
}: {
  options: DatasetOption[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = options.find((option) => option.id === activeId) ?? options[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={options.length === 0}
        className="flex w-full items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-left text-xs transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
      >
        <div className="flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
          <Database className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-foreground">
            {active?.label ?? "No dataset selected"}
          </div>
          {active && (
            <div className="truncate text-[10px] text-muted-foreground">
              {active.rowCount.toLocaleString()} rows · {active.columnCount}{" "}
              columns · {active.sourceFormat ?? "dataset"}
            </div>
          )}
        </div>
        <ChevronDown className="h-4 w-4 flex-none text-muted-foreground" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            className="absolute left-0 top-full z-50 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-border bg-background p-1 shadow-2xl"
          >
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onSelect(option.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left transition-colors",
                  option.id === active?.id
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <Table2 className="mt-0.5 h-3.5 w-3.5 flex-none" />
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold">
                    {option.label}
                  </div>
                  <div
                    className={cn(
                      "truncate text-[10px]",
                      option.id === active?.id
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground",
                    )}
                  >
                    {option.viewName} · {option.rowCount.toLocaleString()} rows
                  </div>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Insights panel ────────────────────────────────────────────────────────────

function InsightsPanel({ ctx }: { ctx: TableCtx | null }) {
  const insights = useMemo(
    () => (ctx ? generateInsights(ctx.columns, ctx.rowCount) : []),
    [ctx],
  );

  const recs = useMemo(
    () => (ctx ? recommendCharts(ctx.columns, ctx.rowCount) : []),
    [ctx],
  );

  if (!ctx) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-muted text-muted-foreground">
          <Database className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            No dataset selected
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Import a dataset first, then open insights.
          </p>
        </div>
      </div>
    );
  }

  const severityIcon = (severity: string) =>
    severity === "critical" ? (
      <AlertCircle className="h-4 w-4 text-red-500" />
    ) : severity === "warning" ? (
      <AlertCircle className="h-4 w-4 text-amber-500" />
    ) : (
      <Info className="h-4 w-4 text-blue-500" />
    );

  return (
    <div className="space-y-4 p-4">
      <div className="overflow-hidden rounded-3xl border border-border bg-card">
        <div className="border-b border-border bg-linear-to-br from-blue-500/10 via-amber-500/10 to-transparent p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500">
              <Database className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-foreground">
                {ctx.displayName}
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {ctx.tableName}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 p-3">
          {[
            { label: "Rows", value: ctx.rowCount.toLocaleString() },
            { label: "Cols", value: ctx.columns.length },
            {
              label: "Numeric",
              value: ctx.columns.filter((column) => column.type === "number")
                .length,
            },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-muted p-3">
              <div className="text-base font-bold text-foreground">
                {stat.value}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {recs.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            Suggested charts
          </div>

          <div className="space-y-2">
            {recs.map((rec) => (
              <div
                key={rec.title}
                className="rounded-2xl border border-border bg-card p-3"
              >
                <div className="flex items-start gap-2">
                  <div className="flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
                    <BarChart3 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-foreground">
                      {rec.title}
                    </div>
                    <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      {rec.reason}
                    </div>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground">
                    {Math.round(rec.confidence * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {insights.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            Insights
          </div>

          <div className="space-y-2">
            {insights.map((insight, index) => (
              <div
                key={`${insight.title}-${index}`}
                className="rounded-2xl border border-border bg-card p-3"
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 flex-none">
                    {severityIcon(insight.severity)}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-foreground">
                      {insight.title}
                    </div>
                    <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      {insight.description}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main AI Panel ────────────────────────────────────────────────────────────

export function AIPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    datasets,
    activeDatasetId,
    setActiveDataset,
    addQueryHistory,
    replaceDatasetsFromCatalog,
  } = useDataStore();

  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      kind: "text",
      content:
        "Hi, I’m your local data copilot. Select a dataset, ask a question, and I’ll translate it into safe read-only DuckDB SQL.",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"chat" | "insights">("chat");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function refreshCatalog() {
      setCatalogLoading(true);
      setCatalogError(null);

      try {
        const catalog = await listRegisteredDatasets();

        if (cancelled) return;

        replaceDatasetsFromCatalog(catalog);

        if (!activeDatasetId && catalog.length > 0) {
          setActiveDataset(catalog[0].id);
        }
      } catch (error) {
        if (!cancelled) {
          setCatalogError(
            error instanceof Error ? error.message : String(error),
          );
        }
      } finally {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      }
    }

    refreshCatalog();

    return () => {
      cancelled = true;
    };
  }, [open, activeDatasetId, replaceDatasetsFromCatalog, setActiveDataset]);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const datasetOptions: DatasetOption[] = useMemo(
    () =>
      datasets.map((dataset) => ({
        id: dataset.id,
        label: dataset.name,
        viewName: dataset.viewName || dataset.tableName,
        rowCount: dataset.rowCount,
        columnCount: dataset.colCount,
        sourceFormat: String(dataset.format),
      })),
    [datasets],
  );

  const activeDataset =
    datasets.find((dataset) => dataset.id === activeDatasetId) ??
    datasets[0] ??
    null;

  const ctx: TableCtx | null = activeDataset
    ? datasetToCtx(activeDataset)
    : null;

  const suggestions = useMemo(
    () =>
      ctx
        ? suggestQuestions({ tableName: ctx.tableName, columns: ctx.columns })
        : [
            "Import a dataset first",
            "Show me row count",
            "What columns are available?",
          ],
    [ctx],
  );

  const handleSend = useCallback(
    async (text?: string) => {
      const question = (text ?? input).trim();

      if (!question || loading) return;

      setInput("");
      setLoading(true);

      setMessages((current) => [
        ...current,
        { id: uid(), role: "user", kind: "text", content: question },
        {
          id: uid(),
          role: "assistant",
          kind: "text",
          content: "",
          thinking: true,
        },
      ]);

      try {
        if (!ctx) {
          setMessages((current) =>
            current.slice(0, -1).concat([
              {
                id: uid(),
                role: "assistant",
                kind: "error",
                content:
                  "No dataset is selected. Import a dataset first, then ask a question.",
              },
            ]),
          );
          return;
        }

        const nlqCtx = {
          tableName: ctx.tableName,
          columns: ctx.columns,
        };

        const { sql, explanation, confidence, chartSuggestion } = translateNLQ(
          question,
          nlqCtx,
        );

        const start = performance.now();
        const rows = await runReadOnlyQuery(sql);
        const durationMs = Math.round(performance.now() - start);
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

        const result: QueryResult = {
          columns,
          rows,
          durationMs,
        };

        addQueryHistory({
          id: uid(),
          sql,
          naturalLanguage: question,
          datasetId: ctx.datasetId,
          rowsReturned: rows.length,
          durationMs,
          ranAt: new Date().toISOString(),
        });

        const chartOption =
          chartSuggestion && !["table", "number"].includes(chartSuggestion)
            ? (buildChartFromResult(result, chartSuggestion) ?? undefined)
            : undefined;

        setMessages((current) =>
          current.slice(0, -1).concat([
            {
              id: uid(),
              role: "assistant",
              kind: "result",
              content: explanation,
              sql,
              result,
              chartOption,
              chartSuggestion,
              confidence,
            },
          ]),
        );
      } catch (error) {
        setMessages((current) =>
          current.slice(0, -1).concat([
            {
              id: uid(),
              role: "assistant",
              kind: "error",
              content: `I could not complete that query. ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ]),
        );
      } finally {
        setLoading(false);
      }
    },
    [input, loading, ctx, addQueryHistory],
  );

  const clearChat = useCallback(() => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        kind: "text",
        content: "Chat cleared. Ask me a question about the selected dataset.",
      },
    ]);
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
            onClick={onClose}
          />

          <motion.div
            initial={{ x: "100%", opacity: 0.8 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0.8 }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="fixed right-0 top-0 bottom-0 z-50 flex w-full flex-col border-l border-border bg-background shadow-2xl sm:w-[440px] xl:w-[480px]"
          >
            <div className="flex-none border-b border-border bg-background/95 px-4 py-4 backdrop-blur">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-linear-to-br from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/20">
                  <Bot className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-foreground">
                      AI Data Copilot
                    </h2>
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-300">
                      <ShieldCheck className="h-3 w-3" />
                      local
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    NL→SQL over your local DuckDB datasets.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4">
                <DatasetPicker
                  options={datasetOptions}
                  activeId={activeDataset?.id ?? null}
                  onSelect={setActiveDataset}
                />
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {catalogLoading ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Refreshing datasets
                    </>
                  ) : ctx ? (
                    <>
                      <Rows3 className="h-3 w-3" />
                      {ctx.rowCount.toLocaleString()} rows ·{" "}
                      {ctx.columns.length} columns
                    </>
                  ) : (
                    <>
                      <Database className="h-3 w-3" />
                      No active dataset
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCatalogError(null);
                    listRegisteredDatasets()
                      .then((catalog) => {
                        replaceDatasetsFromCatalog(catalog);
                        if (!activeDatasetId && catalog[0]) {
                          setActiveDataset(catalog[0].id);
                        }
                      })
                      .catch((error) =>
                        setCatalogError(
                          error instanceof Error
                            ? error.message
                            : String(error),
                        ),
                      );
                  }}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Refresh datasets"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>

              {catalogError && (
                <div className="mt-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                  {catalogError}
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 rounded-2xl bg-muted p-1">
                {(["chat", "insights"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setTab(item)}
                    className={cn(
                      "rounded-xl px-3 py-2 text-xs font-semibold transition-colors",
                      tab === item
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item === "chat" ? "Chat" : "Insights"}
                  </button>
                ))}
              </div>
            </div>

            {tab === "insights" ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <InsightsPanel ctx={ctx} />
              </div>
            ) : (
              <>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                  {messages.map((message) => (
                    <MsgBubble key={message.id} msg={message} />
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {messages.length <= 2 && !loading && ctx && (
                  <div className="flex-none px-4 pb-3">
                    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Sparkles className="h-3 w-3 text-amber-500" />
                      Try asking
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.slice(0, 4).map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => handleSend(suggestion)}
                          className="rounded-full border border-border bg-muted px-3 py-1.5 text-[11px] text-foreground transition-colors hover:bg-accent"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex-none border-t border-border bg-background/95 px-4 py-4 backdrop-blur">
                  <div className="flex items-end gap-2">
                    <div className="flex min-h-11 flex-1 items-center gap-2 rounded-2xl border border-border bg-muted px-3 py-2 transition-colors focus-within:border-primary/50">
                      <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            handleSend();
                          }
                        }}
                        placeholder={
                          ctx
                            ? "Ask about your dataset…"
                            : "Import or select a dataset first…"
                        }
                        disabled={loading}
                        className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-40"
                      />

                      {loading && (
                        <RefreshCw className="h-3.5 w-3.5 flex-none animate-spin text-muted-foreground" />
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSend()}
                      disabled={!input.trim() || loading || !ctx}
                      className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Zap className="h-3 w-3" />
                      Safe read-only DuckDB queries
                    </span>

                    <button
                      type="button"
                      onClick={clearChat}
                      className="flex items-center gap-1 transition-colors hover:text-foreground"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Clear
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function AIToggle({
  onClick,
  active,
}: {
  onClick: () => void;
  active: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.04, y: -2 }}
      whileTap={{ scale: 0.96 }}
      className={cn(
        "fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-3xl px-4 py-3 shadow-2xl transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "border border-border bg-background text-foreground hover:border-primary/40",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-2xl",
          active ? "bg-primary-foreground/15" : "bg-primary/10 text-primary",
        )}
      >
        <Brain className="h-5 w-5" />
      </div>

      <div className="hidden text-left sm:block">
        <div className="text-sm font-bold leading-none">AI Copilot</div>
        <div
          className={cn(
            "mt-1 text-[10px] leading-none",
            active ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          local NL→SQL
        </div>
      </div>

      {!active && (
        <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-background bg-emerald-400" />
      )}
    </motion.button>
  );
}
