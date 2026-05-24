"use client";

/**
 * WidgetCard — glassmorphism card with:
 * - accent stripe by chart type
 * - SQL inspector (Monaco slide-down)
 * - AnomalyDrawer trigger
 * - stagger entrance (motion/react)
 */

import { motion } from "motion/react";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { WidgetState } from "@/features/agent-canvas/core/types";
import { cn } from "@/shared/utils";
import { AnomalyDrawer } from "./v3/AnomalyDrawer";
import { WidgetRenderer } from "./WidgetRenderer";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
});

// ─── Accent colors by chart type ─────────────────────────────────────────────

const ACCENT: Record<string, string> = {
  bar: "#3b82f6",
  "horizontal-bar": "#3b82f6",
  "stacked-bar": "#6366f1",
  line: "#10b981",
  area: "#10b981",
  "multi-line": "#10b981",
  pie: "#f59e0b",
  donut: "#f59e0b",
  scatter: "#8b5cf6",
  bubble: "#8b5cf6",
  heatmap: "#ec4899",
  network: "#a78bfa",
  sankey: "#06b6d4",
  calendar: "#22c55e",
  bump: "#f97316",
  "kpi-grid": "#a78bfa",
  "data-table": "#64748b",
  treemap: "#ef4444",
  radar: "#14b8a6",
  gauge: "#eab308",
  funnel: "#f97316",
};

const STATUS_DOT: Record<WidgetState["status"], string> = {
  pending: "bg-slate-600",
  querying: "bg-amber-400 animate-pulse",
  building: "bg-blue-400 animate-pulse",
  done: "bg-emerald-400",
  error: "bg-red-400",
};

interface Props {
  widget: WidgetState;
  dragHandleClass?: string;
  className?: string;
  index: number;
}

export function WidgetCard({
  widget,
  dragHandleClass = "drag-handle",
  className,
  index,
}: Props) {
  const [showSQL, setShowSQL] = useState(false);
  const { spec, status, sql, insight, error } = widget;
  const accent = ACCENT[spec.chartType] ?? "#8b5cf6";

  const handleFilter = (col: string, lower: number, upper: number) => {
    // Apply filter by updating SQL in store
    console.info(`Filter: ${col} BETWEEN ${lower} AND ${upper}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{
        delay: index * 0.08,
        duration: 0.3,
        type: "spring",
        stiffness: 200,
        damping: 20,
      }}
      className={cn(
        "flex flex-col h-full rounded-2xl overflow-hidden backdrop-blur-sm",
        "bg-slate-900/70 border border-slate-700/50",
        "transition-shadow hover:shadow-[0_0_0_1px_rgba(139,92,246,0.25)]",
        className,
      )}
      style={{ borderTopColor: accent, borderTopWidth: 2 }}
    >
      {/* Card header */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 border-b border-slate-700/40 shrink-0",
          dragHandleClass,
          "cursor-grab active:cursor-grabbing select-none",
        )}
      >
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            STATUS_DOT[status],
          )}
        />
        <span className="text-[12px] font-semibold text-white truncate flex-1">
          {spec.title}
        </span>

        {/* Anomaly badge */}
        {widget.rawData && widget.rawData.length > 0 && status === "done" && (
          <AnomalyDrawer widget={widget} onFilter={handleFilter} />
        )}

        <span
          className="text-[9px] text-slate-600 shrink-0 bg-slate-800/80 px-1.5 py-0.5 rounded font-mono"
          style={{ color: accent }}
        >
          {spec.chartType}
        </span>

        {sql && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowSQL((v) => !v);
            }}
            className="text-[10px] text-slate-600 hover:text-violet-300 transition-colors shrink-0"
            title={showSQL ? "Hide SQL" : "Show SQL"}
          >
            {showSQL ? "⌥ hide" : "⌥ sql"}
          </button>
        )}
      </div>

      {/* SQL Monaco slide-down */}
      {showSQL && sql && (
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: 96 }}
          exit={{ height: 0 }}
          className="shrink-0 overflow-hidden border-b border-slate-700/40"
        >
          <MonacoEditor
            height={96}
            language="sql"
            theme="vs-dark"
            value={sql}
            options={{
              readOnly: true,
              fontSize: 10,
              lineHeight: 16,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              scrollbar: { vertical: "hidden" },
              renderLineHighlight: "none",
              padding: { top: 4 },
            }}
          />
        </motion.div>
      )}

      {/* Chart area */}
      <div className="flex-1 min-h-0 p-2">
        <WidgetRenderer widget={widget} height="100%" />
      </div>

      {/* Insight footer */}
      {insight && (
        <div className="px-3 py-1.5 border-t border-slate-700/30 shrink-0 bg-slate-800/20">
          <p className="text-[10px] text-amber-300/80 italic line-clamp-2">
            ✦ {insight}
          </p>
        </div>
      )}

      {/* Error footer */}
      {error && !insight && (
        <div className="px-3 py-1.5 border-t border-red-900/30 shrink-0 bg-red-950/20">
          <p className="text-[10px] text-red-400 line-clamp-2">✗ {error}</p>
        </div>
      )}
    </motion.div>
  );
}
