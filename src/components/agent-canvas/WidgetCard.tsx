"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { WidgetRenderer } from "./WidgetRenderer";
import type { WidgetState } from "@/lib/agent-canvas/types";

interface Props {
  widget: WidgetState;
  /** react-grid-layout injects drag handle class */
  dragHandleClass?: string;
  className?: string;
}

export function WidgetCard({
  widget,
  dragHandleClass = "drag-handle",
  className,
}: Props) {
  const [showSQL, setShowSQL] = useState(false);
  const { spec, status, sql, insight, error } = widget;

  const statusDot =
    status === "done"
      ? "bg-emerald-400"
      : status === "error"
        ? "bg-red-400"
        : status === "pending"
          ? "bg-slate-600"
          : "bg-amber-400 animate-pulse";

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-slate-900/70 border border-slate-700/50 rounded-2xl overflow-hidden backdrop-blur-sm",
        "transition-shadow hover:shadow-[0_0_0_1px_rgba(139,92,246,0.3)]",
        className,
      )}
    >
      {/* Card header */}
      <div
        className={cn(
          "flex items-center gap-2 px-4 py-2.5 border-b border-slate-700/40 shrink-0",
          dragHandleClass,
          "cursor-grab active:cursor-grabbing select-none",
        )}
      >
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", statusDot)} />
        <span className="text-sm font-semibold text-white truncate flex-1">
          {spec.title}
        </span>
        <span className="text-[10px] text-slate-500 shrink-0 tabular-nums bg-slate-800 px-1.5 py-0.5 rounded">
          {spec.chartType}
        </span>
        {sql && (
          <button
            onClick={() => setShowSQL((v) => !v)}
            className="text-[10px] text-slate-500 hover:text-violet-300 transition-colors shrink-0"
            title={showSQL ? "Hide SQL" : "Show SQL"}
          >
            {showSQL ? "⌥ hide" : "⌥ sql"}
          </button>
        )}
      </div>

      {/* SQL overlay */}
      {showSQL && sql && (
        <div className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-700/40 shrink-0 max-h-32 overflow-auto">
          <pre className="text-[10px] text-cyan-300 font-mono whitespace-pre-wrap">
            {sql}
          </pre>
        </div>
      )}

      {/* Chart area */}
      <div className="flex-1 min-h-0 p-3">
        <WidgetRenderer widget={widget} height="100%" />
      </div>

      {/* Insight footer */}
      {insight && (
        <div className="px-4 py-2 border-t border-slate-700/30 shrink-0 bg-slate-800/30">
          <p className="text-[11px] text-amber-300/80 italic line-clamp-2">
            ✦ {insight}
          </p>
        </div>
      )}

      {/* Error footer */}
      {error && !insight && (
        <div className="px-4 py-2 border-t border-red-900/30 shrink-0 bg-red-950/20">
          <p className="text-[11px] text-red-400 line-clamp-2">✗ {error}</p>
        </div>
      )}
    </div>
  );
}
