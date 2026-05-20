"use client";

import {
  BarChart3,
  Bot,
  Lightbulb,
  Loader2,
  Sparkles,
  TrendingUp,
  Wand2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import {
  deriveField,
  nlToSpec,
  recommendCharts,
} from "@/features/data-formulator/core/ai";
import { genId } from "@/features/data-formulator/core/helpers";
import type {
  ChartSpec,
  ColumnInfo,
  DataThreadEntry,
} from "@/features/data-formulator/core/types";
import { cn } from "@/shared/utils";

export type AIAgentMode = "suggest" | "create" | "derive" | "explain";

interface AIAgentPanelProps {
  columns: ColumnInfo[];
  tableName: string;
  onCreateChart: (spec: Omit<ChartSpec, "id">) => void;
  onDeriveField: (prompt: string) => void;
  onLog: (entry: Omit<DataThreadEntry, "id" | "ts">) => void;
  existingCharts: ChartSpec[];
}

export function AIAgentPanel({
  columns,
  tableName,
  onCreateChart,
  onDeriveField,
  onLog,
  existingCharts,
}: AIAgentPanelProps) {
  const [mode, setMode] = useState<AIAgentMode>("suggest");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<
    Array<{ title: string; spec: Omit<ChartSpec, "id"> }>
  >([]);
  const [open, setOpen] = useState(false);

  const handleSuggest = useCallback(async () => {
    setLoading(true);
    try {
      const charts = recommendCharts(columns);
      setSuggestions(charts.map((c) => ({ title: c.title, spec: c.spec })));
      onLog({ kind: "chart", message: `AI suggested ${charts.length} charts` });
    } catch (e) {
      onLog({
        kind: "refine",
        message: "Suggestion failed",
        detail: String(e),
      });
    } finally {
      setLoading(false);
    }
  }, [columns, onLog]);

  const handleCreate = useCallback(async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const spec = await nlToSpec(prompt, columns);
      if (spec?.encodings?.length) {
        onCreateChart({
          type: spec.type ?? "bar",
          encodings: spec.encodings,
          filters: spec.filters ?? [],
          limit: spec.limit ?? 100,
          title: spec.title ?? prompt,
          topN: spec.topN,
          showTrendline: spec.showTrendline,
          showOutliers: spec.showOutliers,
        });
        onLog({ kind: "chart", message: `Created chart from: "${prompt}"` });
        setPrompt("");
      }
    } catch (e) {
      onLog({ kind: "refine", message: "Create failed", detail: String(e) });
    } finally {
      setLoading(false);
    }
  }, [prompt, columns, onCreateChart, onLog]);

  const handleDerive = useCallback(async () => {
    if (!prompt.trim()) return;
    onDeriveField(prompt);
    setPrompt("");
  }, [prompt, onDeriveField]);

  const modes: Array<{
    key: AIAgentMode;
    label: string;
    icon: React.ElementType;
    desc: string;
  }> = [
    {
      key: "suggest",
      label: "Suggest",
      icon: Lightbulb,
      desc: "Get AI chart recommendations",
    },
    {
      key: "create",
      label: "Create",
      icon: Wand2,
      desc: "Describe a chart in natural language",
    },
    {
      key: "derive",
      label: "Derive",
      icon: Sparkles,
      desc: "Create a computed field with AI",
    },
  ];

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-2xl shadow-lg shadow-violet-500/25 transition-all hover:scale-105"
      >
        <Bot className="w-5 h-5" />
        <span className="text-sm font-medium">AI Agent</span>
      </button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="fixed bottom-6 right-6 z-50 w-96 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-violet-500/5">
        <Bot className="w-5 h-5 text-violet-400" />
        <span className="text-sm font-semibold text-foreground">
          Data Formulator AI
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto p-1 rounded-lg hover:bg-foreground/10 text-muted-foreground"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 p-2 border-b border-border">
        {modes.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => {
              setMode(m.key);
              setSuggestions([]);
            }}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors",
              mode === m.key
                ? "bg-violet-500/15 text-violet-300"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            <m.icon className="w-3.5 h-3.5" />
            {m.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {mode === "suggest" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {modes.find((m) => m.key === "suggest")?.desc}
            </p>
            <button
              type="button"
              onClick={handleSuggest}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 rounded-xl text-xs font-medium text-violet-300 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Lightbulb className="w-3.5 h-3.5" />
              )}
              Analyze data & suggest charts
            </button>
            <AnimatePresence>
              {suggestions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2"
                >
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">
                    Suggestions
                  </p>
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onCreateChart(s.spec)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-muted hover:bg-muted/80 border border-border text-left transition-colors"
                    >
                      <BarChart3 className="w-3.5 h-3.5 text-violet-400 flex-none" />
                      <span className="text-xs text-foreground">{s.title}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {(mode === "create" || mode === "derive") && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {mode === "create"
                ? "Describe the chart you want in plain English"
                : "Describe the computed field you need"}
            </p>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                mode === "create"
                  ? 'e.g. "top 10 services by total amount" or "monthly trend of transactions"'
                  : 'e.g. "ratio of amount to balance" or "extract hour from timestamp"'
              }
              className="w-full h-20 bg-muted border border-border rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none resize-none"
            />
            <button
              type="button"
              onClick={mode === "create" ? handleCreate : handleDerive}
              disabled={loading || !prompt.trim()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 rounded-xl text-xs font-medium text-violet-300 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Wand2 className="w-3.5 h-3.5" />
              )}
              {mode === "create" ? "Generate chart" : "Generate field"}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
