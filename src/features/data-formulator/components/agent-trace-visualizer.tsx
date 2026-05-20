"use client";

/**
 * Agent Trace Visualizer
 * Real-time visualization of multi-agent orchestration execution.
 * Shows each agent node, its status, latency, and output structure.
 */

import { motion, AnimatePresence } from "motion/react";
import {
  Bot,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  GitBranch,
  Terminal,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/shared/utils";
import { safeJsonStringify } from "../core/json";
import type { AgentTrace, AgentTraceNode, AgentRole } from "../core/agent-graph";

// ─── Role Config ──────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<
  AgentRole,
  { label: string; color: string; bg: string; icon: typeof Bot }
> = {
  supervisor: { label: "Supervisor", color: "text-violet-400", bg: "bg-violet-500/10", icon: Sparkles },
  dataAnalyst: { label: "Data Analyst", color: "text-emerald-400", bg: "bg-emerald-500/10", icon: Terminal },
  chartArchitect: { label: "Chart Architect", color: "text-amber-400", bg: "bg-amber-500/10", icon: GitBranch },
  insightEngineer: { label: "Insight Engineer", color: "text-pink-400", bg: "bg-pink-500/10", icon: Sparkles },
  queryOptimizer: { label: "Query Optimizer", color: "text-cyan-400", bg: "bg-cyan-500/10", icon: Terminal },
  critic: { label: "Critic", color: "text-red-400", bg: "bg-red-500/10", icon: AlertCircle },
  mcpToolUser: { label: "MCP Tool User", color: "text-blue-400", bg: "bg-blue-500/10", icon: Bot },
};

// ─── Trace Node Component ─────────────────────────────────────────────────────

function TraceNodeCard({ node, isActive }: { node: AgentTraceNode; isActive: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const config = ROLE_CONFIG[node.role];
  const Icon = config.icon;

  const statusIcon =
    node.status === "running" ? (
      <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
    ) : node.status === "completed" ? (
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
    ) : node.status === "failed" ? (
      <AlertCircle className="w-3.5 h-3.5 text-red-400" />
    ) : (
      <div className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground/30" />
    );

  const latency = node.output?.latencyMs;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        "rounded-xl border transition-all duration-300",
        isActive
          ? "border-white/20 bg-white/10 shadow-lg shadow-white/5"
          : "border-white/5 bg-white/[0.02]",
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3"
      >
        {statusIcon}
        <div className={cn("p-1.5 rounded-lg", config.bg)}>
          <Icon className={cn("w-3.5 h-3.5", config.color)} />
        </div>
        <div className="flex-1 text-left">
          <div className="text-sm font-medium text-foreground">{config.label}</div>
          <div className="text-[10px] text-muted-foreground">{node.nodeId}</div>
        </div>
        {latency !== undefined && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="w-3 h-3" />
            {latency}ms
          </div>
        )}
        {node.output?.structured && (
          <div className="text-[10px] text-emerald-400/70 bg-emerald-500/10 px-2 py-0.5 rounded-full">
            JSON
          </div>
        )}
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-2">
              {node.error && (
                <div className="text-xs text-red-400 bg-red-500/10 rounded-lg p-2 border border-red-500/20">
                  {node.error}
                </div>
              )}
              {node.output?.content && (
                <div className="text-[11px] text-muted-foreground bg-white/5 rounded-lg p-2 max-h-48 overflow-auto font-mono leading-relaxed">
                  {node.output.content.slice(0, 2000)}
                  {node.output.content.length > 2000 && "..."}
                </div>
              )}
              {node.output?.structured && (
                <pre className="text-[10px] text-emerald-300/80 bg-emerald-500/5 rounded-lg p-2 overflow-auto max-h-48 border border-emerald-500/10">
                  {safeJsonStringify(node.output.structured, 2)}
                </pre>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main Visualizer ──────────────────────────────────────────────────────────

interface AgentTraceVisualizerProps {
  trace: AgentTrace | null;
  className?: string;
}

export function AgentTraceVisualizer({ trace, className }: AgentTraceVisualizerProps) {
  if (!trace) {
    return (
      <div className={cn("rounded-xl border border-white/5 bg-white/[0.02] p-6 text-center", className)}>
        <Bot className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No active trace</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Run an agent workflow to see execution trace
        </p>
      </div>
    );
  }

  const statusColor =
    trace.status === "completed"
      ? "text-emerald-400"
      : trace.status === "running"
        ? "text-blue-400"
        : trace.status === "failed"
          ? "text-red-400"
          : "text-amber-400";

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className={cn("w-4 h-4", statusColor)} />
          <span className="text-sm font-medium text-foreground">Agent Trace</span>
          <span className={cn("text-[10px] uppercase tracking-wider font-semibold", statusColor)}>
            {trace.status}
          </span>
        </div>
        {trace.metadata.totalLatencyMs > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="w-3 h-3" />
            {trace.metadata.totalLatencyMs}ms
          </div>
        )}
      </div>

      {/* Nodes */}
      <div className="space-y-2">
        <AnimatePresence>
          {trace.nodes.map((node, i) => (
            <TraceNodeCard
              key={`${node.nodeId}_${i}`}
              node={node}
              isActive={trace.currentNodeId === node.nodeId}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Footer */}
      {trace.endedAt && (
        <div className="text-[10px] text-muted-foreground/50 text-center pt-1">
          Trace ID: {trace.traceId.slice(0, 16)}... |{" "}
          {trace.nodes.filter((n) => n.status === "completed").length}/{trace.nodes.length} nodes completed
        </div>
      )}
    </div>
  );
}
