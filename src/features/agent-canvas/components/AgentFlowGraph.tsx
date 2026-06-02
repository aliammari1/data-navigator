"use client";

/**
 * AgentFlowGraph — @xyflow/react DAG.
 * Live LangGraph node states, animated edges, vaul drawer.
 */

import {
  addEdge,
  Background,
  type Connection,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";
import { motion } from "motion/react";
import { Drawer } from "vaul";
import type { FlowNode } from "@/features/agent-canvas/core/agent-store";
import { useAgentStore } from "@/features/agent-canvas/core/agent-store";
import { cn } from "@/shared/utils";

// ─── Node status colors ───────────────────────────────────────────────────────

const STATUS_RING: Record<FlowNode["status"], string> = {
  idle: "border-slate-700 bg-slate-900",
  running: "border-violet-500 bg-violet-950 animate-pulse",
  done: "border-emerald-500 bg-emerald-950",
  error: "border-red-500 bg-red-950",
  interrupt: "border-amber-500 bg-amber-950",
};

const STATUS_DOT: Record<FlowNode["status"], string> = {
  idle: "bg-slate-600",
  running: "bg-violet-400 animate-ping",
  done: "bg-emerald-400",
  error: "bg-red-400",
  interrupt: "bg-amber-400 animate-bounce",
};

const TYPE_ICON: Record<FlowNode["type"], string> = {
  schema: "🔍",
  react: "🔄",
  plan: "📐",
  critique: "🧐",
  sql: "🗄️",
  chart: "📊",
  narrate: "📝",
  gate: "⏸",
};

// ─── Custom node component ────────────────────────────────────────────────────

interface AgentNodeData extends Record<string, unknown> {
  label: string;
  status: FlowNode["status"];
  type: FlowNode["type"];
  onClick?: () => void;
}

function AgentNode({ data }: { data: AgentNodeData }) {
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        "px-3 py-2 rounded-xl border-2 min-w-[90px] text-center cursor-pointer",
        "transition-all duration-300 select-none",
        STATUS_RING[data.status],
      )}
      onClick={data.onClick}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="bg-slate-700! border-0! w-2! h-2!"
      />
      <div className="flex items-center justify-center gap-1.5">
        <span className="text-sm">{TYPE_ICON[data.type]}</span>
        <div className="flex flex-col items-start">
          <span className="text-[11px] font-semibold text-white leading-tight">
            {data.label}
          </span>
          <div className="flex items-center gap-1 mt-0.5">
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                STATUS_DOT[data.status],
              )}
            />
            <span className="text-[9px] text-slate-500 capitalize">
              {data.status}
            </span>
          </div>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="bg-slate-700! border-0! w-2! h-2!"
      />
    </motion.div>
  );
}

const NODE_TYPES = { agentNode: AgentNode };

// ─── Default graph structure ─────────────────────────────────────────────────

const DEFAULT_FLOW_NODES: FlowNode[] = [
  { id: "schema", label: "Schema", status: "idle", type: "schema" },
  { id: "react_sql_loop", label: "ReAct SQL", status: "idle", type: "react" },
  { id: "planner", label: "Planner", status: "idle", type: "plan" },
  { id: "human_interrupt", label: "Review", status: "idle", type: "gate" },
  { id: "critique", label: "Critique", status: "idle", type: "critique" },
  { id: "revise", label: "Revise", status: "idle", type: "plan" },
  { id: "sql_fan_out", label: "SQL Fan", status: "idle", type: "sql" },
  { id: "narrator", label: "Narrator", status: "idle", type: "narrate" },
];

const GRAPH_EDGES: Array<{
  source: string;
  target: string;
  animated?: boolean;
}> = [
  { source: "schema", target: "react_sql_loop", animated: true },
  { source: "react_sql_loop", target: "planner", animated: true },
  { source: "planner", target: "human_interrupt", animated: false },
  { source: "human_interrupt", target: "critique", animated: false },
  { source: "critique", target: "revise", animated: false },
  { source: "critique", target: "sql_fan_out", animated: true },
  { source: "revise", target: "critique", animated: false },
  { source: "sql_fan_out", target: "narrator", animated: true },
];

// ─── Layout ─────────────────────────────────────────────────────────────────

function computeLayout(nodes: FlowNode[]): Node[] {
  const positions: Record<string, { x: number; y: number }> = {
    schema: { x: 150, y: 20 },
    react_sql_loop: { x: 150, y: 110 },
    planner: { x: 150, y: 200 },
    human_interrupt: { x: 150, y: 290 },
    critique: { x: 150, y: 380 },
    revise: { x: 320, y: 380 },
    sql_fan_out: { x: 150, y: 470 },
    narrator: { x: 150, y: 560 },
  };

  return nodes.map((n) => ({
    id: n.id,
    type: "agentNode",
    position: positions[n.id] ?? { x: 150, y: 200 },
    data: { label: n.label, status: n.status, type: n.type },
  }));
}

function buildEdges(animated: boolean): Edge[] {
  return GRAPH_EDGES.map((e, i) => ({
    id: `e${i}`,
    source: e.source,
    target: e.target,
    animated: animated && e.animated,
    style: { stroke: "#334155", strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#334155" },
    label:
      e.source === "critique" && e.target === "revise"
        ? "needs work"
        : e.source === "critique" && e.target === "sql_fan_out"
          ? "approved"
          : undefined,
    labelStyle: { fill: "#64748b", fontSize: 9 },
    labelBgStyle: { fill: "#0f172a" },
  }));
}

// ─── Stats ticker strip ───────────────────────────────────────────────────────

function StatsStrip() {
  const { tokenCount, toolCallCnt, widgets, startTime, running } =
    useAgentStore();
  const done = widgets.filter((w) => w.status === "done").length;

  const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;

  // Re-render each second while running
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-900/80 border-b border-slate-800 text-[10px] text-slate-500">
      <span className="tabular-nums">⏱ {elapsed}s</span>
      <span className="tabular-nums">✓ {done}</span>
      <span className="tabular-nums">✦ {tokenCount.toLocaleString()}</span>
      <span className="tabular-nums">⚙ {toolCallCnt}</span>
    </div>
  );
}

// ─── Agent log drawer ─────────────────────────────────────────────────────────

function AgentLogDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { thoughts } = useAgentStore();

  return (
    <Drawer.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-slate-700 rounded-t-2xl max-h-[60vh] flex flex-col">
          <Drawer.Title className="sr-only">Agent Log</Drawer.Title>
          <div className="flex-none p-3 border-b border-slate-800 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Agent Log</span>
            <span className="text-xs text-slate-500">
              {thoughts.length} entries
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1 font-mono">
            {thoughts.slice(-100).map((t) => (
              <div key={t.id} className="flex gap-2 text-[10px]">
                <span className="text-slate-600 shrink-0 tabular-nums">
                  {new Date(t.ts).toLocaleTimeString("en", {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                <span className="text-violet-400 shrink-0">[{t.agent}]</span>
                <span
                  className={cn(
                    t.kind === "err"
                      ? "text-red-400"
                      : t.kind === "warn"
                        ? "text-amber-400"
                        : t.kind === "ok"
                          ? "text-emerald-400"
                          : t.kind === "sql"
                            ? "text-cyan-400"
                            : t.kind === "insight"
                              ? "text-amber-300"
                              : "text-slate-400",
                  )}
                >
                  {t.text}
                </span>
              </div>
            ))}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AgentFlowGraph() {
  const { flowNodes: storeNodes, running } = useAgentStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const displayNodes = storeNodes.length > 0 ? storeNodes : DEFAULT_FLOW_NODES;

  const initialNodes: Node[] = useMemo(
    () => computeLayout(displayNodes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const initialEdges: Edge[] = useMemo(
    () => buildEdges(running),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync store nodes → ReactFlow nodes
  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => {
        const store = displayNodes.find((s) => s.id === n.id);
        if (!store) return n;
        return {
          ...n,
          data: {
            ...n.data,
            status: store.status,
            type: store.type,
            label: store.label,
            onClick: () => {
              setSelectedNode(n.id);
              setDrawerOpen(true);
            },
          },
        };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeNodes]);

  // Animate edges when running
  useEffect(() => {
    setEdges(buildEdges(running));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  return (
    <div className="flex flex-col h-full bg-slate-950">
      <StatsStrip />
      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={2}
          colorMode="dark"
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#1e293b" gap={16} size={0.5} />
          <Controls className="bg-slate-800! border-slate-700!" />
          <MiniMap
            className="bg-slate-900! border-slate-700!"
            nodeColor={(n) => {
              const status = (n.data as AgentNodeData).status;
              return status === "done"
                ? "#10b981"
                : status === "running"
                  ? "#F59E0B"
                  : status === "error"
                    ? "#ef4444"
                    : status === "interrupt"
                      ? "#f59e0b"
                      : "#334155";
            }}
          />
        </ReactFlow>
      </div>

      {/* Log drawer trigger */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="mx-3 mb-2 text-[10px] text-slate-600 hover:text-slate-400 text-center py-1 border border-dashed border-slate-800 rounded-lg transition-colors"
      >
        View agent log
      </button>

      <AgentLogDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
