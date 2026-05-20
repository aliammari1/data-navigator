"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Bot,
  Play,
  Pause,
  Square,
  AlertCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  Settings2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/shared/utils";
import { useFormulatorStore } from "../store";

// ─── Log type icons ────────────────────────────────────────────────────────────

const LOG_ICONS: Record<string, { icon: typeof Info; color: string }> = {
  info: { icon: Info, color: "text-blue-400" },
  warn: { icon: AlertTriangle, color: "text-amber-400" },
  error: { icon: AlertCircle, color: "text-red-400" },
  success: { icon: CheckCircle2, color: "text-emerald-400" },
};

// ─── Agent Mode Panel ─────────────────────────────────────────────────────────

interface AgentModePanelProps {
  columns: Array<{ name: string; type: string }>;
  tableName: string;
  onAddChart: (spec: Record<string, unknown>) => void;
  onAddStep: (step: Omit<import("../store").ExplorationStep, "id" | "timestamp" | "childrenIds">) => void;
}

export function AgentModePanel({ tableName }: AgentModePanelProps) {
  const agent = useFormulatorStore((s) => s.agent);
  const {
    setAgentRunning,
    setAgentGoal,
    setAgentPlan,
    setAgentPlanStep,
    addAgentLog,
    clearAgentLogs,
  } = useFormulatorStore();

  const [goalInput, setGoalInput] = useState(agent.currentGoal ?? "");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [maxSteps, setMaxSteps] = useState(10);
  const [autoApprove, setAutoApprove] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on any log change
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agent.logs]);

  const handleStart = useCallback(() => {
    if (!goalInput.trim()) return;
    setAgentGoal(goalInput.trim());
    setAgentRunning(true);
    setAgentPlan([
      "Analyze data schema and field types",
      "Identify key metrics and dimensions",
      "Generate initial chart recommendations",
      "Create exploratory visualizations",
      "Summarize findings and insights",
    ]);
    setAgentPlanStep(0);
    addAgentLog("Agent started with goal: " + goalInput.trim(), "info");
    addAgentLog("Analyzing schema for " + tableName + "…", "info");
  }, [goalInput, tableName, setAgentGoal, setAgentRunning, setAgentPlan, setAgentPlanStep, addAgentLog]);

  const handlePause = useCallback(() => {
    setAgentRunning(false);
    addAgentLog("Agent paused", "warn");
  }, [setAgentRunning, addAgentLog]);

  const handleStop = useCallback(() => {
    setAgentRunning(false);
    setAgentGoal(undefined);
    setAgentPlan(undefined);
    setAgentPlanStep(0);
    addAgentLog("Agent stopped", "error");
  }, [setAgentRunning, setAgentGoal, setAgentPlan, setAgentPlanStep, addAgentLog]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-none px-4 py-3 border-b border-white/10 flex items-center gap-2">
        <Bot className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-bold text-foreground">Agent Mode</span>
        {agent.isRunning && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Running
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Goal input */}
      <div className="flex-none px-4 py-3 border-b border-white/10">
        <textarea
          value={goalInput}
          onChange={(e) => setGoalInput(e.target.value)}
          placeholder="What do you want to explore? e.g. 'Analyze revenue trends and identify anomalies'"
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 resize-none"
        />
        <div className="flex items-center gap-2 mt-2">
          {!agent.isRunning ? (
            <button
              type="button"
              onClick={handleStart}
              disabled={!goalInput.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50 rounded-lg text-xs text-emerald-300 font-medium transition-colors"
            >
              <Play className="w-3 h-3" /> Start
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handlePause}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25 rounded-lg text-xs text-amber-300 font-medium transition-colors"
              >
                <Pause className="w-3 h-3" /> Pause
              </button>
              <button
                type="button"
                onClick={handleStop}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/15 border border-red-500/30 hover:bg-red-500/25 rounded-lg text-xs text-red-300 font-medium transition-colors"
              >
                <Square className="w-3 h-3" /> Stop
              </button>
            </>
          )}
        </div>
      </div>

      {/* Settings (collapsible) */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Max steps</span>
                <input
                  type="number"
                  value={maxSteps}
                  onChange={(e) => setMaxSteps(Number(e.target.value))}
                  min={1}
                  max={50}
                  className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-foreground outline-none text-right"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Auto-approve actions</span>
                <button
                  type="button"
                  onClick={() => setAutoApprove((v) => !v)}
                  className={cn(
                    "w-8 h-4 rounded-full transition-colors relative",
                    autoApprove ? "bg-emerald-500" : "bg-white/10",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform",
                      autoApprove ? "left-4" : "left-0.5",
                    )}
                  />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Plan */}
      {agent.currentPlan && agent.currentPlan.length > 0 && (
        <div className="flex-none px-4 py-3 border-b border-white/10">
          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide mb-2">
            Plan
          </p>
          <ol className="space-y-1">
            {agent.currentPlan.map((step, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: plan steps have no stable ID
                key={`agent-plan-step-${i}`}
                className={cn(
                  "flex items-center gap-2 text-xs",
                  i < agent.planStep
                    ? "text-muted-foreground line-through"
                    : i === agent.planStep
                      ? "text-foreground font-medium"
                      : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-none",
                    i < agent.planStep
                      ? "bg-emerald-500/20 text-emerald-400"
                      : i === agent.planStep
                        ? "bg-primary/20 text-primary"
                        : "bg-white/5 text-muted-foreground",
                  )}
                >
                  {i < agent.planStep ? "✓" : i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Logs */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide mb-2">
          Logs
        </p>
        {agent.logs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No logs yet. Start the agent to begin.</p>
        ) : (
          <div className="space-y-1">
            {agent.logs.map((log) => {
              const cfg = LOG_ICONS[log.type] ?? LOG_ICONS.info;
              const Icon = cfg.icon;
              return (
                <motion.div
                  key={log.ts}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-start gap-2 text-xs"
                >
                  <Icon className={cn("w-3 h-3 mt-0.5 flex-none", cfg.color)} />
                  <span className="text-foreground/80 leading-relaxed">{log.message}</span>
                  <span className="text-[9px] text-muted-foreground ml-auto flex-none">
                    {new Date(log.ts).toLocaleTimeString()}
                  </span>
                </motion.div>
              );
            })}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      {/* Clear logs */}
      {agent.logs.length > 0 && (
        <div className="flex-none px-4 py-2 border-t border-white/10">
          <button
            type="button"
            onClick={clearAgentLogs}
            className="text-[10px] text-muted-foreground hover:text-red-400 transition-colors"
          >
            Clear logs
          </button>
        </div>
      )}
    </div>
  );
}