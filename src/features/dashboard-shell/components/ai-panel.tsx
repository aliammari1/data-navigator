"use client";

import {
  AlertCircle,
  BarChart3,
  Bot,
  Brain,
  ChevronDown,
  Copy,
  Check,
  Database,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ColMeta, useDataStore } from "@/core/stores/data-store";
import {
  type AiQueryResult,
  buildAiChartOption,
} from "@/features/dashboard-shell/components/ai-panel-chart";
import { AiResultTable } from "@/features/dashboard-shell/components/ai-result-table";
import { useNlqTranslator } from "@/features/dashboard-shell/command/use-nlq-translator";
import { useShellActions, useShellStore } from "@/features/dashboard-shell/shell/shell-store";
import { generateInsights, recommendCharts } from "@/platform/ai/insights";
import { suggestQuestions } from "@/platform/ai/nlq";
import { useAI } from "@/platform/ai/provider";
import {
  arrowColumnNames,
  arrowToRows,
  decodeArrowIPC,
  listRegisteredDatasets,
  runReadOnlyQueryArrow,
} from "@/platform/duckdb/duckdb";
import { type EChartsOption, OffscreenChart } from "@/platform/viz";
import { cn } from "@/shared/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type MsgRole = "user" | "assistant";
type MsgKind = "text" | "result" | "error";

interface Message {
  id: string;
  role: MsgRole;
  kind: MsgKind;
  content: string;
  sql?: string;
  result?: AiQueryResult;
  chartOption?: EChartsOption;
  chartSuggestion?: string;
  confidence?: string;
  source?: "llm" | "rules";
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

/** Stable id without Math.random (secure-context crypto in Electron renderer). */
function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `m_${Date.now().toString(36)}`;
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
      className={cn("flex flex-col gap-2", isUser ? "items-end" : "items-start")}
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

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {msg.source === "llm" && (
            <span className="inline-flex rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] text-blue-600 dark:text-blue-300">
              local model
            </span>
          )}
          {msg.confidence && msg.confidence !== "high" && (
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-[10px]",
                msg.confidence === "low"
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-300"
                  : "bg-blue-500/15 text-blue-600 dark:text-blue-300",
              )}
            >
              {msg.confidence} confidence
            </span>
          )}
        </div>
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
              aria-label="Copy SQL"
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
          <AiResultTable result={msg.result} />
          <div className="flex items-center gap-2 px-1 text-[10px] text-muted-foreground">
            <span>{msg.result.rows.length.toLocaleString()} rows</span>
            <span>·</span>
            <span>{msg.result.durationMs}ms</span>
          </div>
        </div>
      )}

      {msg.result && msg.chartSuggestion === "number" && <AiResultTable result={msg.result} />}

      {msg.chartOption && (
        <div className="w-full overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <BarChart3 className="h-3 w-3" />
            Chart
          </div>
          <OffscreenChart
            option={msg.chartOption}
            height={220}
            fallback={
              <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">
                Chart rendering unavailable on this device.
              </div>
            }
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
              {active.rowCount.toLocaleString()} rows · {active.columnCount} columns ·{" "}
              {active.sourceFormat ?? "dataset"}
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
                  <div className="truncate text-xs font-semibold">{option.label}</div>
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
  const [insights, setInsights] = useState<import("@/platform/ai/insights").Insight[]>([]);
  const [recs, setRecs] = useState<import("@/platform/ai/insights").ChartRecommendation[]>([]);

  // Optional LLM upgrade: only wired up once a provider is already known to be
  // available (a passive probe — never triggers the "download a model" dialog
  // just from opening this tab). When no model is ready, `llm` stays undefined
  // and generateInsights/recommendCharts silently stay rule-based, exactly as
  // before.
  const ai = useAI();
  const aiGenerate = ai.generate;
  const llmAvailable = ai.availability.some((a) => a.available);

  useEffect(() => {
    if (!ctx) {
      setInsights([]);
      setRecs([]);
      return;
    }
    let cancelled = false;
    const llm = llmAvailable
      ? async (
          prompt: string,
          opts: { systemPrompt: string; maxTokens: number; temperature: number },
        ) => {
          const result = await aiGenerate({
            prompt,
            system: opts.systemPrompt,
            maxTokens: opts.maxTokens,
            temperature: opts.temperature,
          });
          return result.text;
        }
      : undefined;
    generateInsights(ctx.columns, ctx.rowCount, undefined, llm)
      .then((result) => {
        if (!cancelled) setInsights(result);
      })
      .catch(() => {
        /* keep empty */
      });
    recommendCharts(ctx.columns, ctx.rowCount, llm)
      .then((result) => {
        if (!cancelled) setRecs(result);
      })
      .catch(() => {
        /* keep empty */
      });
    return () => {
      cancelled = true;
    };
  }, [ctx, llmAvailable, aiGenerate]);

  if (!ctx) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-muted text-muted-foreground">
          <Database className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">No dataset selected</p>
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
              <div className="truncate text-sm font-bold text-foreground">{ctx.displayName}</div>
              <div className="mt-1 truncate text-xs text-muted-foreground">{ctx.tableName}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 p-3">
          {[
            { label: "Rows", value: ctx.rowCount.toLocaleString() },
            { label: "Cols", value: ctx.columns.length },
            {
              label: "Numeric",
              value: ctx.columns.filter((column) => column.type === "number").length,
            },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-muted p-3">
              <div className="text-base font-bold text-foreground">{stat.value}</div>
              <div className="text-[10px] text-muted-foreground">{stat.label}</div>
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
              <div key={rec.title} className="rounded-2xl border border-border bg-card p-3">
                <div className="flex items-start gap-2">
                  <div className="flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
                    <BarChart3 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-foreground">{rec.title}</div>
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
                  <div className="mt-0.5 flex-none">{severityIcon(insight.severity)}</div>
                  <div>
                    <div className="text-xs font-semibold text-foreground">{insight.title}</div>
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

export function AIPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    datasets,
    activeDatasetId,
    setActiveDataset,
    addQueryHistory,
    replaceDatasetsFromCatalog,
  } = useDataStore();

  const translateNlq = useNlqTranslator();
  const tab = useShellStore((s) => s.aiPanelTab);
  const { setAiPanelTab } = useShellActions();

  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      kind: "text",
      content:
        "Hi, I'm your local data copilot. Select a dataset, ask a question, and I'll translate it into safe read-only DuckDB SQL — grammar-constrained when the local model is downloaded, rule-based otherwise.",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

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
          setCatalogError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) setCatalogLoading(false);
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: messages.length is an intentional trigger to scroll on new messages; it is not read in the body.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

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
    datasets.find((dataset) => dataset.id === activeDatasetId) ?? datasets[0] ?? null;

  const ctx: TableCtx | null = activeDataset ? datasetToCtx(activeDataset) : null;

  const suggestions = useMemo(
    () =>
      ctx
        ? suggestQuestions({ tableName: ctx.tableName, columns: ctx.columns })
        : ["Import a dataset first", "Show me row count", "What columns are available?"],
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
        { id: uid(), role: "assistant", kind: "text", content: "", thinking: true },
      ]);

      try {
        if (!ctx) {
          setMessages((current) =>
            current.slice(0, -1).concat([
              {
                id: uid(),
                role: "assistant",
                kind: "error",
                content: "No dataset is selected. Import a dataset first, then ask a question.",
              },
            ]),
          );
          return;
        }

        // Grammar-constrained NL→SQL via the provider registry, with the
        // deterministic rule-based translator as the offline fallback.
        const { sql, explanation, confidence, chartSuggestion, source } = await translateNlq(
          question,
          { tableName: ctx.tableName, columns: ctx.columns },
        );

        // Arrow IPC transport — decode rows off the JSON path.
        const start = performance.now();
        const arrowBytes = await runReadOnlyQueryArrow(sql);
        const table = decodeArrowIPC(arrowBytes);
        const columns = arrowColumnNames(table);
        const rows = arrowToRows(table) as Record<string, unknown>[];
        const durationMs = Math.round(performance.now() - start);

        const result: AiQueryResult = { columns, rows, durationMs };

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
            ? (buildAiChartOption(result, chartSuggestion) ?? undefined)
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
              source,
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
    [input, loading, ctx, addQueryHistory, translateNlq],
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
                    <h2 className="text-sm font-bold text-foreground">AI Data Copilot</h2>
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
                  aria-label="Close AI panel"
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
                      {ctx.rowCount.toLocaleString()} rows · {ctx.columns.length} columns
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
                        setCatalogError(error instanceof Error ? error.message : String(error)),
                      );
                  }}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Refresh datasets"
                  aria-label="Refresh datasets"
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
                    onClick={() => setAiPanelTab(item)}
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
                          ctx ? "Ask about your dataset…" : "Import or select a dataset first…"
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
                      aria-label="Send"
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

export function AIToggle({ onClick, active }: { onClick: () => void; active: boolean }) {
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
