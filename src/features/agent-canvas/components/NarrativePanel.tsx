"use client";
/**
 * NarrativePanel — Monaco read-only executive markdown narrative,
 * HITL plan editor (@dnd-kit/core drag-to-reorder), LangSmith trace tree.
 */

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "motion/react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  MessageSquare,
  GitBranch,
  FileText,
  Check,
  Edit3,
  GripVertical,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/shared/utils";
import { useAgentStore } from "@/features/agent-canvas/core/agent-store";
import type { TraceNode } from "@/features/agent-canvas/core/event-bus";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
});

type TabId = "narrative" | "hitl" | "trace";

// ─── Tab bar ──────────────────────────────────────────────────────────────────

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: "narrative", label: "Summary", icon: <FileText className="w-3 h-3" /> },
  { id: "hitl", label: "Review", icon: <Edit3 className="w-3 h-3" /> },
  { id: "trace", label: "Trace", icon: <GitBranch className="w-3 h-3" /> },
];

// ─── HITL plan editor ─────────────────────────────────────────────────────────

interface SortableWidgetItemProps {
  id: string;
  title: string;
  chart: string;
}

function SortableWidgetItem({ id, title, chart }: SortableWidgetItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all",
        isDragging
          ? "border-violet-500 bg-violet-900/20 shadow-lg"
          : "border-slate-700 bg-slate-800/60 hover:border-slate-600",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab text-slate-600 hover:text-slate-400"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>
      <span className="text-xs text-white truncate flex-1">{title}</span>
      <span className="text-[9px] text-slate-500 bg-slate-700/60 px-1.5 py-0.5 rounded">
        {chart}
      </span>
    </div>
  );
}

function HITLEditor() {
  const plan = useAgentStore((s) => s.plan);
  const interrupt = useAgentStore((s) => s.interrupt);
  const setPlan = useAgentStore((s) => s.setPlan);
  const clearInterrupt = useAgentStore((s) => s.clearInterrupt);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const widgets = plan?.widgets ?? [];

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !plan) return;

      const oldIdx = widgets.findIndex((w) => w.id === active.id);
      const newIdx = widgets.findIndex((w) => w.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return;

      const reordered = arrayMove(widgets, oldIdx, newIdx);
      setPlan({ ...plan, widgets: reordered });
    },
    [plan, widgets, setPlan],
  );

  const handleApprove = () => {
    if (interrupt.resolve) {
      interrupt.resolve("approve");
      clearInterrupt();
    }
  };

  const handleRevise = () => {
    if (interrupt.resolve && plan) {
      interrupt.resolve("revise", plan);
      clearInterrupt();
    }
  };

  if (!plan) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-600 text-xs">
        {interrupt.active ? "Waiting for plan…" : "No plan yet"}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {interrupt.active && (
        <div className="p-3 rounded-xl border border-amber-700/40 bg-amber-900/10">
          <p className="text-xs font-semibold text-amber-300 mb-0.5">
            Human Review Required
          </p>
          <p className="text-[11px] text-amber-200/70">{interrupt.reason}</p>
        </div>
      )}

      <div>
        <p className="text-[10px] text-slate-500 mb-2 font-semibold uppercase tracking-wider">
          Widget Order ({widgets.length})
        </p>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={widgets.map((w) => w.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1.5">
              {widgets.map((w) => (
                <SortableWidgetItem
                  key={w.id}
                  id={w.id}
                  title={w.title}
                  chart={w.chartType}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {interrupt.active && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleApprove}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-600/20 border border-emerald-700/50 text-emerald-300 text-xs hover:bg-emerald-600/30 transition-colors"
          >
            <Check className="w-3 h-3" />
            Approve & Build
          </button>
          <button
            type="button"
            onClick={handleRevise}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-600/20 border border-amber-700/50 text-amber-300 text-xs hover:bg-amber-600/30 transition-colors"
          >
            <Edit3 className="w-3 h-3" />
            Send Edits
          </button>
        </div>
      )}
    </div>
  );
}

// ─── LangSmith offline trace viewer ──────────────────────────────────────────

function TraceNodeItem({
  node,
  depth = 0,
}: {
  node: TraceNode;
  depth?: number;
}) {
  const [open, setOpen] = useState(depth < 1);

  const statusColor =
    node.status === "done"
      ? "text-emerald-400"
      : node.status === "running"
        ? "text-violet-400 animate-pulse"
        : node.status === "error"
          ? "text-red-400"
          : "text-slate-500";

  const typeIcon =
    node.type === "node"
      ? "⬡"
      : node.type === "tool"
        ? "⚙"
        : node.type === "llm"
          ? "✦"
          : "•";

  return (
    <div
      className="ml-3 border-l border-slate-800/60"
      style={{ marginLeft: depth * 12 }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 py-1 px-2 hover:bg-slate-800/40 rounded text-left text-[10px] group"
      >
        <span className="text-slate-600">{typeIcon}</span>
        <span className="text-slate-300 truncate flex-1">{node.name}</span>
        <span className={cn("shrink-0", statusColor)}>{node.status}</span>
        {node.duration && (
          <span className="text-slate-600 shrink-0 tabular-nums">
            {node.duration < 1000
              ? `${node.duration}ms`
              : `${(node.duration / 1000).toFixed(1)}s`}
          </span>
        )}
        {node.children.length > 0 && (
          <ChevronRight
            className={cn(
              "w-2.5 h-2.5 text-slate-600 shrink-0 transition-transform",
              open && "rotate-90",
            )}
          />
        )}
      </button>
      {node.output && (
        <div className="ml-6 mb-1 px-2 py-0.5 text-[9px] text-slate-600 font-mono truncate">
          → {node.output}
        </div>
      )}
      {open &&
        node.children.map((child) => (
          <TraceNodeItem key={child.id} node={child} depth={depth + 1} />
        ))}
    </div>
  );
}

function TraceViewer() {
  const traceRoots = useAgentStore((s) => s.traceRoots);

  if (traceRoots.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-slate-600 text-xs">
        Run pipeline to capture trace
      </div>
    );
  }

  return (
    <div className="p-2 space-y-0.5">
      {traceRoots.map((node) => (
        <TraceNodeItem key={node.id} node={node} />
      ))}
    </div>
  );
}

// ─── Main NarrativePanel ──────────────────────────────────────────────────────

export function NarrativePanel() {
  const narrative = useAgentStore((s) => s.narrative);
  const [tab, setTab] = useState<TabId>("narrative");

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Tab bar */}
      <div className="flex items-center gap-0.5 px-2 pt-2 border-b border-slate-800 bg-slate-950 shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-[11px] transition-colors",
              tab === t.id
                ? "bg-slate-800 text-white border-t border-x border-slate-700"
                : "text-slate-500 hover:text-slate-300",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {tab === "narrative" && (
            <motion.div
              key="narrative"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full"
            >
              {narrative ? (
                <MonacoEditor
                  language="markdown"
                  theme="vs-dark"
                  value={narrative}
                  options={{
                    readOnly: true,
                    fontSize: 12,
                    lineHeight: 20,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    padding: { top: 12 },
                    renderLineHighlight: "none",
                    overviewRulerLanes: 0,
                    fontFamily: "system-ui, sans-serif",
                  }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <MessageSquare className="w-8 h-8 text-slate-700" />
                  <p className="text-xs text-slate-500">
                    Executive summary will appear here
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {tab === "hitl" && (
            <motion.div
              key="hitl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full overflow-y-auto"
            >
              <HITLEditor />
            </motion.div>
          )}

          {tab === "trace" && (
            <motion.div
              key="trace"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full overflow-y-auto"
            >
              <TraceViewer />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
