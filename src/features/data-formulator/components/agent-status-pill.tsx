"use client";

/**
 * Agent Status Pill
 * Floating top-right chip showing agent progress.
 * Click to expand full trace.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Bot, Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "@/shared/utils";
import { useWorkbenchStore } from "../store/workbench-store";
import { AgentTraceVisualizer } from "./agent-trace-visualizer";

export function AgentStatusPill() {
  const agentRunning = useWorkbenchStore((s) => s.agentRunning);
  const agentTrace = useWorkbenchStore((s) => s.agentTrace);
  const agentStatusText = useWorkbenchStore((s) => s.agentStatusText);
  const [expanded, setExpanded] = useState(false);

  if (!agentRunning && !agentTrace) return null;

  const statusIcon = agentRunning ? (
    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
  ) : agentTrace?.status === "completed" ? (
    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
  ) : agentTrace?.status === "failed" ? (
    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
  ) : (
    <Bot className="w-3.5 h-3.5 text-violet-400" />
  );

  const statusText = agentRunning
    ? agentStatusText || "Agents running..."
    : agentTrace?.status === "completed"
      ? "Done"
      : agentTrace?.status === "failed"
        ? "Failed"
        : "Idle";

  return (
    <>
      {/* Pill */}
      <motion.button
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-medium transition-all",
          agentRunning
            ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
            : "bg-white/5 border-white/10 text-foreground hover:bg-white/10",
        )}
      >
        {statusIcon}
        <span className="max-w-[160px] truncate">{statusText}</span>
        {agentRunning && (
          <span className="flex gap-0.5">
            <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse" />
            <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse delay-75" />
            <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse delay-150" />
          </span>
        )}
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </motion.button>

      {/* Expanded trace panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="fixed top-14 right-4 z-50 w-80 max-h-[60vh] overflow-auto rounded-xl border border-white/10 bg-[#0f0f12] backdrop-blur-xl shadow-2xl p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-foreground">Agent Trace</span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <AgentTraceVisualizer trace={agentTrace} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
