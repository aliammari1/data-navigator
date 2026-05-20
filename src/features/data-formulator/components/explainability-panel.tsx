"use client";

import { useState } from "react";
import {
  Eye,
  Copy,
  Check,
  Brain,
  GitBranch,
  Code,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/shared/utils";
import type { ChartSpec, QueryResult } from "@/features/data-formulator/core/types";

// ─── Explainability Panel ──────────────────────────────────────────────────────

interface ExplainabilityPanelProps {
  selectedChart: ChartSpec | null;
  result: QueryResult | null | undefined;
  showSQL: boolean;
  showReasoning: boolean;
  onToggleSQL: (v: boolean) => void;
  onToggleReasoning: (v: boolean) => void;
}

export function ExplainabilityPanel({
  selectedChart,
  result,
  showSQL,
  showReasoning,
  onToggleSQL,
  onToggleReasoning,
}: ExplainabilityPanelProps) {
  const [copied, setCopied] = useState(false);
  const [sqlExpanded, setSqlExpanded] = useState(true);
  const [reasoningExpanded, setReasoningExpanded] = useState(true);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-none px-4 py-3 border-b border-white/10 flex items-center gap-2">
        <Eye className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-bold text-foreground">Explainability</span>
      </div>

      {/* Settings toggles */}
      <div className="flex-none px-4 py-2 border-b border-white/10 space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <button
            type="button"
            onClick={() => onToggleSQL(!showSQL)}
            className={cn(
              "w-8 h-4 rounded-full transition-colors relative",
              showSQL ? "bg-blue-500" : "bg-white/10",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform",
                showSQL ? "left-4" : "left-0.5",
              )}
            />
          </button>
          <span className="text-xs text-foreground">Show SQL</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <button
            type="button"
            onClick={() => onToggleReasoning(!showReasoning)}
            className={cn(
              "w-8 h-4 rounded-full transition-colors relative",
              showReasoning ? "bg-violet-500" : "bg-white/10",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform",
                showReasoning ? "left-4" : "left-0.5",
              )}
            />
          </button>
          <span className="text-xs text-foreground">Show Reasoning</span>
        </label>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {!selectedChart ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <Eye className="w-8 h-8 text-muted-foreground/30 mb-3" />
            <p className="text-xs text-muted-foreground">
              Select a chart to see its explainability details.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Chart info */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-3">
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide mb-1">
                Chart
              </p>
              <p className="text-sm font-semibold text-foreground">{selectedChart.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Type: <span className="text-foreground">{selectedChart.type}</span> ·{" "}
                Encodings: <span className="text-foreground">{selectedChart.encodings.length}</span> ·{" "}
                Filters: <span className="text-foreground">{selectedChart.filters.length}</span>
              </p>
            </div>

            {/* SQL */}
            {showSQL && result?.sql && (
              <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setSqlExpanded((v) => !v)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors"
                >
                  <Code className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-bold text-foreground">SQL Query</span>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy(result.sql);
                    }}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                  {sqlExpanded ? (
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  )}
                </button>
                <AnimatePresence>
                  {sqlExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <pre className="px-3 pb-3 text-[11px] font-mono text-emerald-300/80 leading-relaxed whitespace-pre-wrap break-all">
                        {syntaxHighlightSQL(result.sql)}
                      </pre>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Reasoning */}
            {showReasoning && selectedChart.insight && (
              <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setReasoningExpanded((v) => !v)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors"
                >
                  <Brain className="w-3.5 h-3.5 text-violet-400" />
                  <span className="text-xs font-bold text-foreground">AI Insight</span>
                  <div className="flex-1" />
                  {reasoningExpanded ? (
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  )}
                </button>
                <AnimatePresence>
                  {reasoningExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <p className="px-3 pb-3 text-xs text-foreground/80 leading-relaxed">
                        {selectedChart.insight}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Data lineage */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-3">
              <div className="flex items-center gap-2 mb-2">
                <GitBranch className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-bold text-foreground">Data Lineage</span>
              </div>
              <div className="space-y-1">
                {selectedChart.encodings.map((enc) => (
                  <div key={enc.id} className="flex items-center gap-2 text-xs">
                    <span className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] uppercase font-bold text-muted-foreground">
                      {enc.channel}
                    </span>
                    <span className="text-foreground">{enc.field}</span>
                    {enc.aggregate && enc.aggregate !== "none" && (
                      <span className="text-[10px] text-violet-400">({enc.aggregate})</span>
                    )}
                  </div>
                ))}
                {selectedChart.filters.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="text-amber-400">filter</span>
                    <span>{f.field} {f.op} {f.value || "…"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Result stats */}
            {result && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide mb-1">
                  Result
                </p>
                <div className="flex items-center gap-4 text-xs text-foreground">
                  <span>{result.rowCount} rows</span>
                  <span>{result.duration}ms</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SQL syntax highlighting ───────────────────────────────────────────────────

function syntaxHighlightSQL(sql: string): React.ReactNode {
  const keywords = /\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AS|AND|OR|NOT|IN|BETWEEN|LIKE|IS|NULL|DISTINCT|COUNT|SUM|AVG|MIN|MAX|CAST|TRY_CAST|COALESCE|CASE|WHEN|THEN|ELSE|END|ASC|DESC|LIMIT|OFFSET|UNION|ALL|EXISTS|EXTRACT|OVER|PARTITION BY|ROW_NUMBER|RANK|DENSE_RANK)\b/gi;

  const parts = sql.split(keywords);
  const matches = sql.match(keywords) ?? [];

  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    nodes.push(<span key={`t${i}`}>{parts[i]}</span>);
    if (i < matches.length) {
      nodes.push(
        <span key={`k${i}`} className="text-blue-400 font-semibold">
          {matches[i]}
        </span>,
      );
    }
  }
  return <>{nodes}</>;
}