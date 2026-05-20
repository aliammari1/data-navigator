"use client";

/**
 * Canvas Cards
 * Draggable, resizable cards that appear on the workbench canvas.
 */

import { useState, useCallback } from "react";
import { motion } from "motion/react";
import {
  GripVertical,
  X,
  Pin,
  PinOff,
  BarChart3,
  Lightbulb,
  Table2,
  BrainCircuit,
  Zap,
  Wrench,
  GitBranch,
} from "lucide-react";
import { cn } from "@/shared/utils";
import { safeJsonStringify } from "../core/json";
import type { CanvasCard } from "../store/workbench-store";
import type { Encoding } from "../core/types";
import { useWorkbenchStore } from "../store/workbench-store";

// ─── Chart Card ───────────────────────────────────────────────────────────────

function ChartCardContent({ card }: { card: CanvasCard }) {
  const data = card.queryResult?.data ?? [];
  const spec = card.chartSpec;
  const xField = spec?.encodings.find((e: Encoding) => e.channel === "x")?.field;
  const yField = spec?.encodings.find((e: Encoding) => e.channel === "y")?.field;

  const chartData = data.slice(0, 20).map((row: Record<string, unknown>) => ({
    label: String(row[xField ?? ""] ?? "").slice(0, 16),
    value: Number(row[yField ?? ""] ?? 0),
  }));
  const maxValue = Math.max(...chartData.map((d: { value: number }) => d.value), 1);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-1 shrink-0">
        <span className="text-[11px] font-medium text-foreground truncate">{card.title}</span>
        {card.agentRole && (
          <span className="text-[9px] text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">
            {card.agentRole}
          </span>
        )}
      </div>
      <div className="flex-1 flex items-end gap-0.5 min-h-0 overflow-hidden">
        {chartData.map((d: { label: string; value: number }, i: number) => (
          <div key={i} className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${(d.value / maxValue) * 100}%` }}
              transition={{ duration: 0.5, delay: i * 0.02 }}
              className="w-full bg-emerald-500/40 rounded-t-[1px] min-h-[2px]"
            />
            <span className="text-[7px] text-muted-foreground truncate w-full text-center">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Insight Card ─────────────────────────────────────────────────────────────

function InsightCardContent({ card }: { card: CanvasCard }) {
  const severityColor =
    card.insightSeverity === "high"
      ? "text-red-400 bg-red-500/10 border-red-500/20"
      : card.insightSeverity === "medium"
        ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
        : "text-blue-400 bg-blue-500/10 border-blue-500/20";

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-1.5">
        <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-[11px] font-medium text-foreground truncate">{card.title}</span>
        {card.insightSeverity && (
          <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full border", severityColor)}>
            {card.insightSeverity}
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-4">{card.insightText}</p>
    </div>
  );
}

// ─── Table Card ───────────────────────────────────────────────────────────────

function TableCardContent({ card }: { card: CanvasCard }) {
  const rows = card.tableData ?? card.queryResult?.data ?? [];
  if (rows.length === 0) return <div className="text-xs text-muted-foreground">No data</div>;

  const headers = Object.keys(rows[0]);
  const displayRows = rows.slice(0, 8);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-1.5 shrink-0">
        <Table2 className="w-3.5 h-3.5 text-blue-400" />
        <span className="text-[11px] font-medium text-foreground truncate">{card.title}</span>
        <span className="text-[9px] text-muted-foreground ml-auto">{rows.length} rows</span>
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-[9px]">
          <thead>
            <tr className="text-muted-foreground border-b border-white/5">
              {headers.map((h) => (
                <th key={h} className="text-left py-1 pr-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row: Record<string, unknown>, i: number) => (
              <tr key={i} className="text-foreground/70 border-b border-white/[0.03]">
                {headers.map((h, j) => (
                  <td key={j} className="py-1 pr-2 truncate max-w-[80px]">{String(row[h] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCardContent({ card }: { card: CanvasCard }) {
  const deltaPositive = (card.kpiDelta ?? 0) >= 0;
  return (
    <div className="h-full flex flex-col justify-center">
      <span className="text-3xl font-bold text-emerald-400 tabular-nums">{card.kpiValue}</span>
      <span className="text-[11px] text-muted-foreground mt-1">{card.kpiLabel}</span>
      {card.kpiDelta !== undefined && (
        <span className={cn("text-[10px] font-medium mt-0.5", deltaPositive ? "text-emerald-400" : "text-red-400")}>
          {deltaPositive ? "+" : ""}{card.kpiDelta}%
        </span>
      )}
    </div>
  );
}

// ─── Reasoning Card ───────────────────────────────────────────────────────────

function ReasoningCardContent({ card }: { card: CanvasCard }) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-1.5">
        <BrainCircuit className="w-3.5 h-3.5 text-violet-400" />
        <span className="text-[11px] font-medium text-foreground">{card.title}</span>
      </div>
      <div className="flex-1 overflow-auto">
        <p className="text-[10px] text-muted-foreground leading-relaxed font-mono whitespace-pre-wrap">
          {card.reasoningText}
        </p>
      </div>
    </div>
  );
}

// ─── Tool Result Card ─────────────────────────────────────────────────────────

function ToolResultCardContent({ card }: { card: CanvasCard }) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-1.5">
        <Wrench className="w-3.5 h-3.5 text-cyan-400" />
        <span className="text-[11px] font-medium text-foreground">{card.title}</span>
      </div>
      <div className="flex-1 overflow-auto">
        <pre className="text-[9px] text-muted-foreground font-mono whitespace-pre-wrap">
          {safeJsonStringify(card.toolResult, 2).slice(0, 1000)}
        </pre>
      </div>
    </div>
  );
}

// ─── Operation Card ───────────────────────────────────────────────────────────

function OperationCardContent({ card }: { card: CanvasCard }) {
  const detail = card.operationPlan ?? card.operationArtifact;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-1.5 shrink-0">
        <GitBranch className="w-3.5 h-3.5 text-teal-400" />
        <span className="text-[11px] font-medium text-foreground truncate">
          {card.title}
        </span>
      </div>
      <pre className="flex-1 overflow-auto whitespace-pre-wrap rounded-md bg-black/30 p-2 text-[9px] text-muted-foreground">
        {detail
          ? safeJsonStringify(detail, 2).slice(0, 1000)
          : "No operation details"}
      </pre>
    </div>
  );
}

// ─── Card Wrapper ─────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<CanvasCard["type"], typeof BarChart3> = {
  chart: BarChart3,
  insight: Lightbulb,
  table: Table2,
  reasoning: BrainCircuit,
  kpi: Zap,
  toolResult: Wrench,
  operation: GitBranch,
};

const TYPE_BORDER: Record<CanvasCard["type"], string> = {
  chart: "border-white/10 hover:border-emerald-500/30",
  insight: "border-white/10 hover:border-amber-500/30",
  table: "border-white/10 hover:border-blue-500/30",
  reasoning: "border-white/10 hover:border-violet-500/30",
  kpi: "border-white/10 hover:border-emerald-500/30",
  toolResult: "border-white/10 hover:border-cyan-500/30",
  operation: "border-white/10 hover:border-teal-500/30",
};

interface CanvasCardComponentProps {
  card: CanvasCard;
}

export function CanvasCardComponent({ card }: CanvasCardComponentProps) {
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const selectCard = useWorkbenchStore((s) => s.selectCard);
  const moveCard = useWorkbenchStore((s) => s.moveCard);
  const resizeCard = useWorkbenchStore((s) => s.resizeCard);
  const removeCard = useWorkbenchStore((s) => s.removeCard);
  const updateCard = useWorkbenchStore((s) => s.updateCard);
  const selectedCardId = useWorkbenchStore((s) => s.selectedCardId);
  const scale = useWorkbenchStore((s) => s.scale);
  const isSelected = selectedCardId === card.id;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-card-action]")) return;
      e.preventDefault();
      setDragging(true);
      selectCard(card.id);

      const startX = e.clientX;
      const startY = e.clientY;
      const initialX = card.x;
      const initialY = card.y;

      const handleMove = (moveEvent: MouseEvent) => {
        const dx = (moveEvent.clientX - startX) / scale;
        const dy = (moveEvent.clientY - startY) / scale;
        moveCard(card.id, initialX + dx, initialY + dy);
      };

      const handleUp = () => {
        setDragging(false);
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [card.id, card.x, card.y, moveCard, scale, selectCard],
  );

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setResizing(true);

      const startX = e.clientX;
      const startY = e.clientY;
      const initialW = card.w;
      const initialH = card.h;

      const handleMove = (moveEvent: MouseEvent) => {
        const dx = (moveEvent.clientX - startX) / scale;
        const dy = (moveEvent.clientY - startY) / scale;
        resizeCard(card.id, Math.max(180, initialW + dx), Math.max(120, initialH + dy));
      };

      const handleUp = () => {
        setResizing(false);
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [card.id, card.w, card.h, resizeCard, scale],
  );

  const Icon = TYPE_ICONS[card.type];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{
        opacity: 1,
        scale: 1,
        width: card.w,
        height: card.h,
      }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className={cn(
        "absolute rounded-xl border bg-[#0f0f12] backdrop-blur-sm overflow-hidden flex flex-col select-none",
        TYPE_BORDER[card.type],
        isSelected && "ring-1 ring-emerald-500/40",
        dragging && "cursor-grabbing z-50",
        !dragging && "cursor-grab hover:shadow-xl hover:shadow-black/20",
      )}
      style={{ left: card.x, top: card.y, width: card.w, height: card.h }}
      onMouseDown={handleMouseDown}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-white/[0.05] shrink-0">
        <GripVertical className="w-3 h-3 text-muted-foreground/40" />
        <Icon className="w-3 h-3 text-muted-foreground/60" />
        <span className="text-[10px] text-muted-foreground truncate flex-1">{card.title}</span>
        <button
          type="button"
          data-card-action
          onClick={() => updateCard(card.id, { pinned: !card.pinned })}
          className="text-muted-foreground/40 hover:text-foreground transition-colors"
        >
          {card.pinned ? <Pin className="w-3 h-3 text-emerald-400" /> : <PinOff className="w-3 h-3" />}
        </button>
        <button
          type="button"
          data-card-action
          onClick={() => removeCard(card.id)}
          className="text-muted-foreground/40 hover:text-red-400 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 p-3 min-h-0 overflow-hidden">
        {card.type === "chart" && <ChartCardContent card={card} />}
        {card.type === "insight" && <InsightCardContent card={card} />}
        {card.type === "table" && <TableCardContent card={card} />}
        {card.type === "kpi" && <KpiCardContent card={card} />}
        {card.type === "reasoning" && <ReasoningCardContent card={card} />}
        {card.type === "toolResult" && <ToolResultCardContent card={card} />}
        {card.type === "operation" && <OperationCardContent card={card} />}
      </div>

      {/* Resize handle */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-end justify-end pb-1 pr-1"
        onMouseDown={handleResizeMouseDown}
      >
        <div className="w-2 h-2 border-r-2 border-b-2 border-white/20 rounded-br-sm" />
      </div>
    </motion.div>
  );
}
