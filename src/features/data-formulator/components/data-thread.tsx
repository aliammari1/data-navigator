"use client";

import { useRef, useEffect, useState } from "react";
import {
  GitBranch,
  Sparkles,
  BarChart3,
  Filter,
  Code,
  Bot,
  Lightbulb,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/shared/utils";
import type { ExplorationStep } from "../store";

// ─── Step type config ─────────────────────────────────────────────────────────

const STEP_CONFIG: Record<
  ExplorationStep["type"],
  { icon: typeof Sparkles; color: string; bg: string; label: string }
> = {
  nlQuery: { icon: Sparkles, color: "text-violet-400", bg: "bg-violet-500/15 border-violet-500/30", label: "Query" },
  chartCreate: { icon: BarChart3, color: "text-blue-400", bg: "bg-blue-500/15 border-blue-500/30", label: "Chart" },
  chartEdit: { icon: BarChart3, color: "text-cyan-400", bg: "bg-cyan-500/15 border-cyan-500/30", label: "Edit" },
  derive: { icon: Code, color: "text-pink-400", bg: "bg-pink-500/15 border-pink-500/30", label: "Derive" },
  filter: { icon: Filter, color: "text-amber-400", bg: "bg-amber-500/15 border-amber-500/30", label: "Filter" },
  agentAction: { icon: Bot, color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/30", label: "Agent" },
  insight: { icon: Lightbulb, color: "text-yellow-400", bg: "bg-yellow-500/15 border-yellow-500/30", label: "Insight" },
};

// ─── Single step card ──────────────────────────────────────────────────────────

interface ThreadStepProps {
  step: ExplorationStep;
  onFork: (stepId: string) => void;
}

function ThreadStepCard({ step, onFork }: ThreadStepProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const config = STEP_CONFIG[step.type] ?? STEP_CONFIG.nlQuery;
  const Icon = config.icon;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      className="relative pl-6 pb-4"
    >
      {/* Timeline connector */}
      <div className="absolute left-[11px] top-6 bottom-0 w-px bg-white/10" />
      {/* Node dot */}
      <div
        className={cn(
          "absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center border",
          config.bg,
        )}
      >
        <Icon className={cn("w-3 h-3", config.color)} />
      </div>

      {/* Card */}
      <div className="rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 overflow-hidden">
        {/* Header */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
        >
          <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase", config.bg, config.color)}>
            {config.label}
          </span>
          <span className="flex-1 text-xs text-foreground truncate">
            {step.prompt ?? step.type}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {new Date(step.timestamp).toLocaleTimeString()}
          </span>
          {expanded ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          )}
        </button>

        {/* Expanded content */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 space-y-2">
                {/* Reasoning */}
                {step.reasoning && (
                  <div className="rounded-lg bg-white/[0.03] border border-white/5 p-2">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide mb-1">
                      Reasoning
                    </p>
                    <p className="text-xs text-foreground/80 leading-relaxed">{step.reasoning}</p>
                  </div>
                )}

                {/* SQL */}
                {step.sql && (
                  <div className="rounded-lg bg-white/[0.03] border border-white/5 p-2">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">
                        SQL
                      </p>
                      <button
                        type="button"
                        onClick={() => handleCopy(step.sql ?? "")}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                    <pre className="text-[11px] font-mono text-emerald-300/80 leading-relaxed whitespace-pre-wrap break-all">
                      {step.sql}
                    </pre>
                  </div>
                )}

                {/* Agent plan */}
                {step.agentPlan && step.agentPlan.length > 0 && (
                  <div className="rounded-lg bg-white/[0.03] border border-white/5 p-2">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide mb-1">
                      Plan
                    </p>
                    <ol className="space-y-0.5">
                      {step.agentPlan.map((p, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: plan steps have no stable ID
                        <li key={`plan-${step.id}-${i}`} className="text-xs text-foreground/70 flex gap-1.5">
                          <span className="text-muted-foreground">{i + 1}.</span>
                          {p}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Children count */}
                {step.childrenIds.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    {step.childrenIds.length} branch{step.childrenIds.length > 1 ? "es" : ""}
                  </p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onFork(step.id)}
                    className="flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    <GitBranch className="w-3 h-3" /> Fork
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Data Thread Panel ─────────────────────────────────────────────────────────

interface DataThreadProps {
  steps: ExplorationStep[];
  onFork: (stepId: string) => void;
  onClear: () => void;
}

export function DataThread({ steps, onFork, onClear }: DataThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest step
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on any step change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [steps]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-none px-4 py-3 border-b border-white/10 flex items-center gap-2">
        <GitBranch className="w-4 h-4 text-violet-400" />
        <span className="text-sm font-bold text-foreground">Data Thread</span>
        <span className="text-[10px] text-muted-foreground">
          {steps.length} step{steps.length === 1 ? "" : "s"}
        </span>
        <div className="flex-1" />
        {steps.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-[10px] text-muted-foreground hover:text-red-400 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Timeline */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
        {steps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <GitBranch className="w-8 h-8 text-muted-foreground/30 mb-3" />
            <p className="text-xs text-muted-foreground">
              Each query, chart, and refinement will be logged here with full lineage.
            </p>
          </div>
        ) : (
          <div className="space-y-0">
            <AnimatePresence>
              {steps.map((step) => (
                <ThreadStepCard key={step.id} step={step} onFork={onFork} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}