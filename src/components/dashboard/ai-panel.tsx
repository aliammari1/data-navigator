"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  BarChart3,
  Brain,
  Check,
  ChevronDown,
  Copy,
  Database,
  Hash,
  Info,
  Lightbulb,
  RefreshCw,
  Send,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateInsights, recommendCharts } from "@/lib/ai/insights";
import { suggestQuestions, translateNLQ } from "@/lib/ai/nlq";
import { getTableInfo, listTables, runQuery } from "@/lib/duckdb";
import {
  type ColMeta,
  inferColType,
  useDataStore,
} from "@/lib/stores/data-store";

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

// Active table context — either from DataStore or auto-detected DuckDB table
interface TableCtx {
  tableName: string;
  columns: ColMeta[];
  rowCount: number;
  displayName: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
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
      backgroundColor: "#1e1e2e",
      borderColor: "#ffffff10",
      textStyle: { color: "#cdd6f4", fontSize: 11 },
    },
    axisLabel: { color: "#6c7086" },
    splitLine: { lineStyle: { color: "#313244" } },
  };
  const COLORS = [
    "#89b4fa",
    "#a6e3a1",
    "#f38ba8",
    "#fab387",
    "#cba6f7",
    "#94e2d5",
  ];

  if (suggestion === "pie") {
    const [nc, vc] = columns;
    return {
      backgroundColor: dark.bg,
      tooltip: { ...dark.tooltip, trigger: "item" },
      series: [
        {
          type: "pie",
          radius: ["40%", "70%"],
          data: rows.map((r) => ({
            name: String(r[nc] ?? ""),
            value: Number(r[vc] ?? 0),
          })),
          itemStyle: { borderColor: "#181825", borderWidth: 2 },
          label: { color: "#cdd6f4", fontSize: 10 },
        },
      ],
      color: COLORS,
    };
  }
  if (suggestion === "scatter") {
    const [xc, yc] = columns;
    return {
      backgroundColor: dark.bg,
      tooltip: { ...dark.tooltip, trigger: "item" },
      grid: { top: 20, right: 20, bottom: 40, left: 50, containLabel: true },
      xAxis: {
        type: "value",
        name: xc,
        axisLabel: dark.axisLabel,
        splitLine: dark.splitLine,
      },
      yAxis: {
        type: "value",
        name: yc,
        axisLabel: dark.axisLabel,
        splitLine: dark.splitLine,
      },
      series: [
        {
          type: "scatter",
          data: rows.map((r) => [Number(r[xc] ?? 0), Number(r[yc] ?? 0)]),
          itemStyle: { color: "#89b4fa", opacity: 0.7 },
          symbolSize: 6,
        },
      ],
    };
  }
  if (suggestion === "line" || suggestion === "bar") {
    const [xc, ...ycs] = columns;
    const isLine = suggestion === "line";
    return {
      backgroundColor: dark.bg,
      tooltip: { ...dark.tooltip, trigger: "axis" },
      legend:
        ycs.length > 1
          ? { data: ycs, textStyle: { color: "#6c7086", fontSize: 10 } }
          : undefined,
      grid: {
        top: ycs.length > 1 ? 30 : 10,
        right: 20,
        bottom: 40,
        left: 20,
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: rows.map((r) => String(r[xc] ?? "")),
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
      series: ycs.map((yc, i) => ({
        name: yc,
        type: isLine ? "line" : "bar",
        data: rows.map((r) => Number(r[yc] ?? 0)),
        smooth: isLine,
        symbol: isLine ? "none" : undefined,
        itemStyle: {
          color: COLORS[i % COLORS.length],
          borderRadius: isLine ? undefined : [3, 3, 0, 0],
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
                  { offset: 0, color: `${COLORS[i % COLORS.length]}33` },
                  { offset: 1, color: "transparent" },
                ],
              },
            }
          : undefined,
        barMaxWidth: 40,
      })),
    };
  }
  // Horizontal bar fallback
  const [xc, yc] = columns;
  return {
    backgroundColor: dark.bg,
    tooltip: { ...dark.tooltip, trigger: "axis" },
    grid: { top: 10, right: 20, bottom: 10, left: 20, containLabel: true },
    xAxis: {
      type: "value",
      axisLabel: { ...dark.axisLabel, fontSize: 10 },
      splitLine: dark.splitLine,
    },
    yAxis: {
      type: "category",
      data: rows.map((r) => String(r[xc] ?? "")).reverse(),
      axisLabel: { color: "#cdd6f4", fontSize: 10 },
    },
    series: [
      {
        type: "bar",
        data: rows.map((r) => Number(r[yc] ?? 0)).reverse(),
        itemStyle: { color: "#89b4fa", borderRadius: [0, 3, 3, 0] },
        barMaxWidth: 22,
      },
    ],
  };
}

// ─── Result table ─────────────────────────────────────────────────────────────

function ResultTable({ result }: { result: QueryResult }) {
  const MAX = 50;
  const show = result.rows.slice(0, MAX);
  if (show.length === 0)
    return (
      <p className="text-xs text-muted-foreground py-2">
        Query returned 0 rows.
      </p>
    );
  if (result.columns.length === 1 && result.rows.length === 1) {
    const val = result.rows[0][result.columns[0]];
    return (
      <div className="flex items-center gap-2 py-1">
        <Hash className="w-4 h-4 text-indigo-400 flex-none" />
        <span className="text-2xl font-bold text-foreground tabular-nums">
          {typeof val === "number" ? val.toLocaleString() : String(val ?? "")}
        </span>
        <span className="text-xs text-muted-foreground">
          {result.columns[0]}
        </span>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border mt-1">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted border-b border-border">
            {result.columns.map((c) => (
              <th
                key={c}
                className="px-3 py-2 text-left text-[10px] text-muted-foreground uppercase tracking-wide font-semibold whitespace-nowrap"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {show.map((row, i) => (
            <tr
              key={i}
              className="border-b border-border hover:bg-accent transition-colors"
            >
              {result.columns.map((c) => (
                <td
                  key={c}
                  className="px-3 py-1.5 text-foreground font-mono text-[11px] whitespace-nowrap max-w-32 truncate"
                >
                  {String(row[c] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.rows.length > MAX && (
        <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border">
          Showing {MAX} of {result.rows.length.toLocaleString()} rows
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
    setTimeout(() => setCopied(false), 1500);
  }, [msg.sql, msg.content]);

  if (msg.thinking) {
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <Brain className="w-4 h-4 text-indigo-400 animate-pulse" />
        <span className="text-sm text-muted-foreground">Thinking…</span>
        <span className="flex gap-1">
          {[0, 0.2, 0.4].map((d) => (
            <span
              key={d}
              className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"
              style={{ animationDelay: `${d}s` }}
            />
          ))}
        </span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col gap-2 ${isUser ? "items-end" : "items-start"}`}
    >
      <div
        className={`max-w-full rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${isUser ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground border border-border rounded-bl-sm"}`}
      >
        {msg.content}
        {msg.confidence && msg.confidence !== "high" && (
          <span
            className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${msg.confidence === "low" ? "bg-amber-500/20 text-amber-300" : "bg-blue-500/20 text-blue-300"}`}
          >
            {msg.confidence} confidence
          </span>
        )}
      </div>
      {msg.sql && (
        <div className="w-full bg-background rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Database className="w-3 h-3" /> SQL
            </div>
            <button
              type="button"
              onClick={copy}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {copied ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>
          <pre className="px-3 py-2 text-[11px] text-emerald-300 font-mono overflow-x-auto whitespace-pre-wrap">
            {msg.sql}
          </pre>
        </div>
      )}
      {msg.result && msg.chartSuggestion !== "number" && (
        <div className="w-full">
          <ResultTable result={msg.result} />
          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
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
        <div className="w-full bg-muted border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border text-[10px] text-muted-foreground">
            <BarChart3 className="w-3 h-3" /> Chart
          </div>
          <ReactECharts
            option={msg.chartOption}
            style={{ height: 200 }}
            opts={{ renderer: "canvas" }}
          />
        </div>
      )}
    </motion.div>
  );
}

// ─── Table picker ─────────────────────────────────────────────────────────────

function TablePicker({
  tables,
  active,
  onSelect,
}: {
  tables: string[];
  active: string;
  onSelect: (t: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-accent border border-border rounded-xl text-xs text-foreground transition-colors max-w-48"
      >
        <Database className="w-3.5 h-3.5 text-indigo-400 flex-none" />
        <span className="truncate font-mono">{active || "Select table…"}</span>
        <ChevronDown className="w-3.5 h-3.5 flex-none ml-auto" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute left-0 top-full mt-1 bg-background border border-border rounded-xl shadow-xl z-50 overflow-hidden min-w-48"
          >
            {tables.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  onSelect(t);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs font-mono transition-colors ${t === active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent"}`}
              >
                {t}
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
      <div className="flex flex-col items-center justify-center h-full text-center p-6 gap-3">
        <Database className="w-10 h-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No table loaded yet. Upload a file to get started.
        </p>
      </div>
    );
  }

  const severityIcon = (s: string) =>
    s === "critical" ? (
      <AlertCircle className="w-3.5 h-3.5 text-red-400" />
    ) : s === "warning" ? (
      <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
    ) : (
      <Info className="w-3.5 h-3.5 text-blue-400" />
    );

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="bg-muted border border-border rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <Database className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-semibold text-foreground truncate">
            {ctx.displayName}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Rows", value: ctx.rowCount.toLocaleString() },
            { label: "Cols", value: ctx.columns.length },
            {
              label: "Numeric",
              value: ctx.columns.filter((c) => c.type === "number").length,
            },
          ].map((s) => (
            <div key={s.label} className="bg-muted rounded-lg py-2">
              <div className="text-sm font-bold text-foreground">{s.value}</div>
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
      {recs.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-muted-foreground">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Suggested
            charts
          </div>
          <div className="space-y-1.5">
            {recs.map((r) => (
              <div
                key={r.title}
                className="flex items-start gap-2 p-2 bg-muted border border-border rounded-lg"
              >
                <BarChart3 className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-none" />
                <div>
                  <div className="text-xs font-medium text-foreground">
                    {r.title}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {r.reason}
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground ml-auto whitespace-nowrap">
                  {Math.round(r.confidence * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {insights.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-muted-foreground">
            <Lightbulb className="w-3.5 h-3.5 text-amber-400" /> Insights
          </div>
          <div className="space-y-1.5">
            {insights.map((ins, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: stable
              <div
                key={i}
                className="flex items-start gap-2 p-2 bg-muted border border-border rounded-lg"
              >
                {severityIcon(ins.severity)}
                <div>
                  <div className="text-xs font-medium text-foreground">
                    {ins.title}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {ins.description}
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
  const { datasets, activeDatasetId, setActiveDataset, addQueryHistory } =
    useDataStore();

  // Resolved context: prefer DataStore, fall back to bare DuckDB tables
  const [duckTables, setDuckTables] = useState<string[]>([]);
  const [manualTable, setManualTable] = useState<string>("");
  const [manualCtx, setManualCtx] = useState<TableCtx | null>(null);
  const [ctxLoading, setCtxLoading] = useState(false);

  const storeDataset = datasets.find((d) => d.id === activeDatasetId);

  // Scan DuckDB for available tables whenever panel opens
  useEffect(() => {
    if (!open) return;
    listTables()
      .then((ts) => {
        setDuckTables(ts);
        // Auto-select first table if no store dataset and no manual selection
        if (!storeDataset && !manualTable && ts.length > 0) {
          setManualTable(ts[0]);
        }
      })
      .catch(() => {});
  }, [open, storeDataset, manualTable]);

  // Load column info for manually selected table
  useEffect(() => {
    const name = manualTable;
    if (!name || storeDataset) {
      setManualCtx(null);
      return;
    }
    setCtxLoading(true);
    getTableInfo(name)
      .then((info) => {
        const cols: ColMeta[] = info.columns.map((c) => ({
          name: c.name,
          type: inferColType(c.type),
          nullCount: 0,
          distinctCount: 0,
          sample: [],
        }));
        setManualCtx({
          tableName: name,
          columns: cols,
          rowCount: info.rowCount,
          displayName: name,
        });
      })
      .catch(() => setManualCtx(null))
      .finally(() => setCtxLoading(false));
  }, [manualTable, storeDataset]);

  // Resolved active context
  const ctx: TableCtx | null = storeDataset
    ? {
        tableName: storeDataset.tableName,
        columns: storeDataset.columns,
        rowCount: storeDataset.rowCount,
        displayName: storeDataset.name,
      }
    : manualCtx;

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      kind: "text",
      content:
        "Hi! I'm your offline AI assistant powered by NL→SQL. Ask me anything about your data in plain English.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"chat" | "insights">("chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(
    () =>
      ctx
        ? suggestQuestions({ tableName: ctx.tableName, columns: ctx.columns })
        : ["Upload a file or select a DuckDB table to get started"],
    [ctx],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: messages change triggers scroll-to-bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const handleSend = useCallback(
    async (text?: string) => {
      const q = (text ?? input).trim();
      if (!q || loading) return;
      setInput("");
      setLoading(true);

      setMessages((m) => [
        ...m,
        { id: uid(), role: "user", kind: "text", content: q },
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
          setMessages((m) =>
            m
              .slice(0, -1)
              .concat([
                {
                  id: uid(),
                  role: "assistant",
                  kind: "text",
                  content:
                    "No table is selected. Please upload a file or pick a table from the dropdown above.",
                },
              ]),
          );
          return;
        }

        const nlqCtx = { tableName: ctx.tableName, columns: ctx.columns };
        const { sql, explanation, confidence, chartSuggestion } = translateNLQ(
          q,
          nlqCtx,
        );

        const t0 = performance.now();
        const rows = await runQuery(sql);
        const durationMs = Math.round(performance.now() - t0);
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        const result: QueryResult = { columns, rows, durationMs };

        addQueryHistory({
          id: uid(),
          sql,
          naturalLanguage: q,
          datasetId: storeDataset?.id ?? ctx.tableName,
          rowsReturned: rows.length,
          durationMs,
          ranAt: new Date().toISOString(),
        });

        const chartOption =
          chartSuggestion && !["table", "number"].includes(chartSuggestion)
            ? (buildChartFromResult(result, chartSuggestion) ?? undefined)
            : undefined;

        setMessages((m) =>
          m
            .slice(0, -1)
            .concat([
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
      } catch (err) {
        setMessages((m) =>
          m
            .slice(0, -1)
            .concat([
              {
                id: uid(),
                role: "assistant",
                kind: "error",
                content: `Error: ${err instanceof Error ? err.message : String(err)}`,
              },
            ]),
        );
      } finally {
        setLoading(false);
      }
    },
    [input, loading, ctx, storeDataset, addQueryHistory],
  );

  const allTableOptions = [
    ...datasets.map((d) => ({
      id: d.id,
      label: d.name,
      table: d.tableName,
      isStore: true,
    })),
    ...duckTables
      .filter((t) => !datasets.find((d) => d.tableName === t))
      .map((t) => ({ id: t, label: t, table: t, isStore: false })),
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 bottom-0 w-full sm:w-96 z-50 flex flex-col bg-background border-l border-border shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-none">
              <div className="w-7 h-7 rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-none">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground">
                  AI Data Assistant
                </div>
                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{" "}
                  Offline · NL→SQL
                </div>
              </div>
              <div className="flex gap-0.5 bg-muted rounded-lg p-0.5 flex-none">
                {(["chat", "insights"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${tab === t ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {t === "chat" ? "Chat" : "Insights"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-7 h-7 rounded-lg hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground flex-none"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Table selector */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted flex-none flex-wrap">
              {allTableOptions.length > 0 ? (
                <TablePicker
                  tables={allTableOptions.map((o) => o.table)}
                  active={ctx?.tableName ?? ""}
                  onSelect={(t) => {
                    const storeMatch = datasets.find((d) => d.tableName === t);
                    if (storeMatch) setActiveDataset(storeMatch.id);
                    else setManualTable(t);
                  }}
                />
              ) : (
                <span className="text-xs text-muted-foreground italic">
                  No tables loaded yet
                </span>
              )}
              {ctxLoading && (
                <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
              )}
              {ctx && (
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {ctx.rowCount.toLocaleString()} rows · {ctx.columns.length}{" "}
                  cols
                </span>
              )}
            </div>

            {tab === "insights" ? (
              <div className="flex-1 overflow-y-auto">
                <InsightsPanel ctx={ctx} />
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                  {messages.map((msg) => (
                    <MsgBubble key={msg.id} msg={msg} />
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {messages.length <= 2 && !loading && ctx && (
                  <div className="px-4 pb-2 flex-none">
                    <div className="flex items-center gap-1.5 mb-2 text-[10px] text-muted-foreground">
                      <Sparkles className="w-3 h-3 text-amber-400" /> Try
                      asking…
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.slice(0, 4).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleSend(s)}
                          className="text-[11px] px-2.5 py-1 bg-muted hover:bg-accent border border-border rounded-full text-foreground transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="px-3 py-3 border-t border-border flex-none">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 bg-muted border border-border rounded-xl px-3 py-2 focus-within:border-primary/50 transition-colors">
                      <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                          }
                        }}
                        placeholder={
                          ctx ? "Ask about your data…" : "Select a table first…"
                        }
                        disabled={loading}
                        className="flex-1 bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none disabled:opacity-40"
                      />
                      {loading && (
                        <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin flex-none" />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSend()}
                      disabled={!input.trim() || loading}
                      className="w-9 h-9 bg-primary hover:bg-primary/90 disabled:opacity-40 rounded-xl flex items-center justify-center text-primary-foreground transition-colors flex-none"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Zap className="w-3 h-3" /> Offline NL→SQL
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setMessages([
                          {
                            id: "welcome",
                            role: "assistant",
                            kind: "text",
                            content: "Chat cleared.",
                          },
                        ])
                      }
                      className="hover:text-foreground transition-colors flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" /> Clear
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
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={`fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl transition-colors ${active ? "bg-primary text-primary-foreground" : "bg-background border border-border text-foreground hover:border-primary/30 hover:text-foreground"}`}
    >
      <Brain className="w-5 h-5" />
      <span className="text-sm font-semibold">AI</span>
      {!active && (
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
      )}
    </motion.button>
  );
}
