"use client";

import { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  KeyboardSensor,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion, AnimatePresence } from "motion/react";
import dynamic from "next/dynamic";
import {
  Pin,
  PinOff,
  Copy,
  Trash2,
  Terminal,
  Plus,
  Lightbulb,
  Wand2,
  Loader2,
  BarChart3,
  GripVertical,
} from "lucide-react";
import { cn } from "@/shared/utils";
import { buildOption } from "@/features/data-formulator/core/chart-options";
import type { ChartSpec, QueryResult } from "@/features/data-formulator/core/types";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

// ─── Card size logic ──────────────────────────────────────────────────────────

function getCardSize(spec: ChartSpec): "hero" | "medium" | "small" {
  if (spec.pinnedAt) return "hero";
  if (spec.type === "pie" || spec.type === "donut" || spec.type === "radar") return "medium";
  return "medium";
}

const SIZE_CLASSES: Record<string, string> = {
  hero: "col-span-2 row-span-2",
  medium: "col-span-1 row-span-1",
  small: "col-span-1 row-span-1",
};

// ─── Sortable chart card ──────────────────────────────────────────────────────

interface BentoChartCardProps {
  spec: ChartSpec;
  result: QueryResult | null | undefined;
  onUpdate: (patch: Partial<ChartSpec>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRefine: (prompt: string) => void;
  onOpenSandbox: () => void;
  onPin: () => void;
  onAttach?: () => void;
  refining: boolean;
}

function BentoChartCard({
  spec,
  result,
  onUpdate,
  onDuplicate,
  onDelete,
  onRefine,
  onOpenSandbox,
  onPin,
  onAttach,
  refining,
}: BentoChartCardProps) {
  const [refinePrompt, setRefinePrompt] = useState("");
  const [hovered, setHovered] = useState(false);

  const option = useMemo(
    () => (result ? buildOption(spec, result.data) : null),
    [spec, result],
  );

  const insight = useMemo(() => {
    if (!result || result.data.length === 0) return spec.insight ?? "";
    return spec.insight || "";
  }, [spec.insight, result]);

  const size = getCardSize(spec);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: spec.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn(SIZE_CLASSES[size])}>
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        whileHover={{ scale: 1.01 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "h-full flex flex-col rounded-2xl overflow-hidden",
          "bg-white/5 backdrop-blur-xl border border-white/10",
          "shadow-lg shadow-black/5",
          "transition-shadow duration-300",
          hovered && "shadow-xl shadow-black/10 border-white/15",
          spec.pinnedAt && "ring-1 ring-amber-500/30",
        )}
      >
        {/* Header */}
        <div className="flex-none px-3 py-2 border-b border-white/5 flex items-center gap-2">
          <button
            type="button"
            className="cursor-grab text-white/20 hover:text-white/50"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
          <input
            value={spec.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            placeholder="Chart title"
            className="flex-1 bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground min-w-0"
          />
          <span className="flex-none px-1.5 py-0.5 rounded-md bg-white/5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            {spec.type}
          </span>
          <button
            type="button"
            onClick={onPin}
            className={cn(
              "p-1 rounded text-muted-foreground hover:text-amber-400 transition-colors",
              spec.pinnedAt && "text-amber-400",
            )}
            title="Pin"
          >
            {spec.pinnedAt ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
          {onAttach && (
            <button
              type="button"
              onClick={onAttach}
              className="p-1 rounded text-muted-foreground hover:text-emerald-400 transition-colors"
              title="Attach to page"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onOpenSandbox}
            className="p-1 rounded text-muted-foreground hover:text-emerald-400 transition-colors"
            title="Python sandbox"
          >
            <Terminal className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Duplicate"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1 rounded text-muted-foreground hover:text-red-400 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Chart */}
        <div className="flex-1 p-2 min-h-0">
          {option ? (
            <ReactECharts
              option={option}
              style={{ height: size === "hero" ? 320 : 220 }}
              opts={{ renderer: "canvas" }}
              notMerge
            />
          ) : result === undefined ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-xs gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Running…
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
              No data
            </div>
          )}
        </div>

        {/* Insight */}
        {insight && (
          <div className="flex-none px-3 py-1.5 border-t border-white/5 bg-white/[0.02] flex items-start gap-1.5">
            <Lightbulb className="w-3 h-3 text-amber-400 flex-none mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{insight}</p>
          </div>
        )}

        {/* Refine bar */}
        <div className="flex-none px-3 py-1.5 border-t border-white/5 flex items-center gap-2">
          <Wand2 className="w-3 h-3 text-violet-400 flex-none" />
          <input
            value={refinePrompt}
            onChange={(e) => setRefinePrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && refinePrompt.trim()) {
                onRefine(refinePrompt);
                setRefinePrompt("");
              }
            }}
            placeholder='Refine…'
            className="flex-1 bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground outline-none"
          />
          {refining && <Loader2 className="w-3 h-3 animate-spin text-violet-400" />}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Bento Grid ───────────────────────────────────────────────────────────────

interface BentoChartGridProps {
  charts: ChartSpec[];
  results: Record<string, QueryResult | null | undefined>;
  onUpdateChart: (id: string, patch: Partial<ChartSpec>) => void;
  onDuplicateChart: (id: string) => void;
  onDeleteChart: (id: string) => void;
  onRefineChart: (id: string, prompt: string) => void;
  onOpenSandbox: (id: string) => void;
  onPinChart: (id: string) => void;
  onAttachChart: (id: string) => void;
  refiningId: string | null;
  onReorder: (charts: ChartSpec[]) => void;
}

export function BentoChartGrid({
  charts,
  results,
  onUpdateChart,
  onDuplicateChart,
  onDeleteChart,
  onRefineChart,
  onOpenSandbox,
  onPinChart,
  onAttachChart,
  refiningId,
  onReorder,
}: BentoChartGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortedCharts = useMemo(
    () => [...charts].sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0)),
    [charts],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = sortedCharts.findIndex((c) => c.id === active.id);
      const newIndex = sortedCharts.findIndex((c) => c.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      onReorder(arrayMove(sortedCharts, oldIndex, newIndex));
    },
    [sortedCharts, onReorder],
  );

  if (charts.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center h-full min-h-[50vh] text-center px-6"
      >
        <div className="w-20 h-20 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center mb-6">
          <BarChart3 className="w-9 h-9 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Empty canvas</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Use a suggested chart, type a natural language query, or create one with{" "}
          <span className="text-foreground font-medium">New chart</span>.
        </p>
      </motion.div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sortedCharts.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-auto">
          <AnimatePresence>
            {sortedCharts.map((c) => (
              <BentoChartCard
                key={c.id}
                spec={c}
                result={results[c.id]}
                onUpdate={(patch) => onUpdateChart(c.id, patch)}
                onDuplicate={() => onDuplicateChart(c.id)}
                onDelete={() => onDeleteChart(c.id)}
                onRefine={(prompt) => onRefineChart(c.id, prompt)}
                onOpenSandbox={() => onOpenSandbox(c.id)}
                onPin={() => onPinChart(c.id)}
                onAttach={() => onAttachChart(c.id)}
                refining={refiningId === c.id}
              />
            ))}
          </AnimatePresence>
        </div>
      </SortableContext>
    </DndContext>
  );
}
