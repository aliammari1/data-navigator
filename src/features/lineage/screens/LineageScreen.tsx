"use client";

import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Database,
  GitBranch,
  GitMerge,
  Network,
  RefreshCw,
  Search,
  Share2,
  Table2,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActivityStore } from "@/core/stores/activity-store";
import { useAppContextStore } from "@/core/stores/app-context-store";
import {
  type CachedAnalyticsMeta,
  type CachedTelecomSourceFileMeta,
  getCachedAnalyticsEntries,
  getCachedTelecomSourceFiles,
} from "@/features/telecom/lib/analytics-cache";
import {
  type DailyStat,
  listDailyStats,
} from "@/features/telecom/lib/daily-stats-cache";
import {
  type Dataset,
  type DataTransform,
  type SavedChart,
  useDataStore,
} from "@/core/stores/data-store";

import type {
  ColumnLineage,
  LEdge,
  LNode,
} from "@/features/lineage/core/types";
import {
  buildRealLineage,
  columnLineageKey,
  computeLayout,
} from "@/features/lineage/core/build-lineage";
// ─── Status helpers ─────────────────────────────────────────────────────────

function statusColor(s: LNode["status"]) {
  switch (s) {
    case "active":
      return "#22c55e";
    case "stale":
      return "#f59e0b";
    case "error":
      return "#ef4444";
    case "pending":
      return "#94a3b8";
    case "running":
      return "#6366f1";
  }
}

function typeStyle(t: LNode["type"]) {
  switch (t) {
    case "source":
      return {
        bg: "bg-blue-500/15",
        border: "border-blue-500/40",
        icon: Database,
        iconColor: "text-blue-400",
      };
    case "transform":
      return {
        bg: "bg-indigo-500/15",
        border: "border-indigo-500/40",
        icon: Zap,
        iconColor: "text-indigo-400",
      };
    case "model":
      return {
        bg: "bg-purple-500/15",
        border: "border-purple-500/40",
        icon: GitMerge,
        iconColor: "text-purple-400",
      };
    case "output":
      return {
        bg: "bg-emerald-500/15",
        border: "border-emerald-500/40",
        icon: BarChart3,
        iconColor: "text-emerald-400",
      };
    case "external":
      return {
        bg: "bg-muted",
        border: "border-border",
        icon: Share2,
        iconColor: "text-muted-foreground",
      };
  }
}

// ─── Sub-components ────────────────────────────────────────────────────────

function StatusDot({ status }: { status: LNode["status"] }) {
  return (
    <span
      className="w-2 h-2 rounded-full shrink-0 inline-block"
      style={{ backgroundColor: statusColor(status) }}
    />
  );
}

interface NodeCardProps {
  node: LNode;
  selected: boolean;
  highlighted: "upstream" | "downstream" | "none" | "selected";
  onClick: () => void;
  position: { x: number; y: number };
}

function NodeCard({
  node,
  selected,
  highlighted,
  onClick,
  position,
}: NodeCardProps) {
  const style = typeStyle(node.type);
  const Icon = style.icon;
  const opacity = highlighted === "none" ? 0.35 : 1;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity, scale: 1 }}
      style={{
        position: "absolute",
        left: position.x,
        top: position.y,
        width: 200,
      }}
      className={`rounded-xl border cursor-pointer select-none transition-shadow ${style.bg} ${style.border} ${
        selected
          ? "ring-2 ring-indigo-400 shadow-lg shadow-indigo-500/25"
          : "hover:shadow-md hover:shadow-black/30"
      }`}
      onClick={onClick}
    >
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <div className={`p-1 rounded ${style.bg}`}>
            <Icon className={`w-3.5 h-3.5 ${style.iconColor}`} />
          </div>
          <span className="text-xs font-bold text-foreground truncate flex-1">
            {node.name}
          </span>
          <StatusDot status={node.status} />
        </div>
        <div className="text-xs text-muted-foreground mb-2 truncate">
          {node.subtype}
        </div>
        <div className="flex items-center gap-2 text-xs">
          {node.rowCount > 0 && (
            <span className="text-foreground font-mono">
              {node.rowCount.toLocaleString()}r
            </span>
          )}
          {node.colCount > 0 && (
            <span className="text-muted-foreground">{node.colCount}c</span>
          )}
          {node.duration && (
            <span
              className={`ml-auto font-mono ${node.duration === "ERR" ? "text-red-400" : "text-muted-foreground"}`}
            >
              {node.duration}
            </span>
          )}
        </div>
        {node.quality > 0 && (
          <div className="mt-2 h-1 bg-accent rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${node.quality * 100}%`,
                backgroundColor:
                  node.quality >= 0.9
                    ? "#22c55e"
                    : node.quality >= 0.7
                      ? "#f59e0b"
                      : "#ef4444",
              }}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}

function EdgeLine({
  from,
  to,
  edge,
  highlighted,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  edge: LEdge;
  highlighted: boolean;
}) {
  const nodeW = 200;
  const nodeH = 90;

  const x1 = from.x + nodeW;
  const y1 = from.y + nodeH / 2;
  const x2 = to.x;
  const y2 = to.y + nodeH / 2;
  const cx = (x1 + x2) / 2;

  const color =
    edge.type === "streaming"
      ? "#6366f1"
      : edge.type === "partial"
        ? "#f59e0b"
        : "#334155";
  const stroke = highlighted ? "#6366f1" : color;
  const strokeW = highlighted ? 2.5 : 1.5;

  return (
    <g>
      <path
        d={`M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeW}
        strokeDasharray={edge.type === "partial" ? "5,3" : undefined}
        markerEnd="url(#arrowhead)"
        opacity={highlighted ? 1 : 0.5}
      />
    </g>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function LineageScreen() {
  const { datasets, transforms, savedCharts, loadedTableNames } =
    useDataStore();
  const activeDatasetId = useAppContextStore((s) => s.activeDatasetId);
  const eventsCount = useActivityStore((s) => s.events.length);
  const [telecomSources, setTelecomSources] = useState<
    CachedTelecomSourceFileMeta[]
  >([]);
  const [telecomAnalytics, setTelecomAnalytics] = useState<
    CachedAnalyticsMeta[]
  >([]);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [loadingLineage, setLoadingLineage] = useState(true);
  const [selectedNode, setSelectedNode] = useState<LNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<
    "graph" | "table" | "impact" | "columns"
  >("graph");
  const [showDetail, setShowDetail] = useState(false);
  const [detailTab, setDetailTab] = useState<
    "info" | "upstreams" | "downstreams" | "columns"
  >("info");
  const [scale, setScale] = useState(0.85);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  const refreshLineage = useCallback(async () => {
    setLoadingLineage(true);
    try {
      const [sources, analytics, stats] = await Promise.all([
        getCachedTelecomSourceFiles(),
        getCachedAnalyticsEntries(),
        listDailyStats(),
      ]);
      setTelecomSources(sources);
      setTelecomAnalytics(analytics);
      setDailyStats(stats);
    } finally {
      setLoadingLineage(false);
    }
  }, []);

  useEffect(() => {
    refreshLineage();
  }, [
    datasets.length,
    transforms.length,
    savedCharts.length,
    loadedTableNames.length,
    eventsCount,
    refreshLineage,
  ]);

  const lineageModel = useMemo(
    () =>
      buildRealLineage({
        datasets,
        transforms,
        savedCharts,
        telecomSources,
        telecomAnalytics,
        dailyStats,
        loadedTableNames,
      }),
    [
      datasets,
      transforms,
      savedCharts,
      telecomSources,
      telecomAnalytics,
      dailyStats,
      loadedTableNames,
    ],
  );

  const nodes = lineageModel.nodes;
  const edges = lineageModel.edges;
  const columnLineage = lineageModel.columnLineage;
  const positions = useMemo(() => computeLayout(nodes), [nodes]);

  useEffect(() => {
    if (!activeDatasetId) return;
    const candidateId = `dataset_${activeDatasetId.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 80)}`;
    const hit = nodes.find((node) => node.id === candidateId);
    if (hit) setSelectedNode(hit);
  }, [activeDatasetId, nodes]);

  const canvasW = useMemo(() => {
    const xs = Object.values(positions).map((p) => p.x);
    if (xs.length === 0) return 900;
    return Math.max(...xs) + 320;
  }, [positions]);

  const canvasH = useMemo(() => {
    const ys = Object.values(positions).map((p) => p.y);
    if (ys.length === 0) return 520;
    return Math.max(...ys) + 180;
  }, [positions]);

  // Highlighted nodes for selected
  const highlightedNodes = useMemo(() => {
    if (!selectedNode) return new Set<string>();
    const upstreams = new Set<string>();
    const downstreams = new Set<string>();
    function walkUp(id: string) {
      const n = nodes.find((x) => x.id === id);
      if (!n) return;
      for (const u of n.upstreams) {
        upstreams.add(u);
        walkUp(u);
      }
    }
    function walkDown(id: string) {
      const n = nodes.find((x) => x.id === id);
      if (!n) return;
      for (const d of n.downstreams) {
        downstreams.add(d);
        walkDown(d);
      }
    }
    walkUp(selectedNode.id);
    walkDown(selectedNode.id);
    return new Set([...upstreams, ...downstreams, selectedNode.id]);
  }, [selectedNode, nodes]);

  // Filtered nodes for table/search
  const filteredNodes = useMemo(() => {
    return nodes.filter((n) => {
      const matchSearch =
        !searchQuery ||
        n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchType = typeFilter === "all" || n.type === typeFilter;
      const matchStatus = statusFilter === "all" || n.status === statusFilter;
      return matchSearch && matchType && matchStatus;
    });
  }, [nodes, searchQuery, typeFilter, statusFilter]);

  // Impact analysis
  const impactAnalysis = useMemo(() => {
    if (!selectedNode) return [];
    const rootId = selectedNode.id;
    const affected: {
      node: LNode;
      distance: number;
      risk: "high" | "medium" | "low";
    }[] = [];
    function walkImpact(id: string, dist: number) {
      const n = nodes.find((x) => x.id === id);
      if (!n || dist > 5) return;
      if (id !== rootId) {
        const existing = affected.find((a) => a.node.id === id);
        if (!existing) {
          const risk = dist === 1 ? "high" : dist === 2 ? "medium" : "low";
          affected.push({ node: n, distance: dist, risk });
        }
      }
      for (const d of n.downstreams) walkImpact(d, dist + 1);
    }
    walkImpact(selectedNode.id, 0);
    return affected.sort((a, b) => a.distance - b.distance);
  }, [selectedNode, nodes]);

  // Column lineage for selected node
  const colLineage = useMemo(() => {
    if (!selectedNode)
      return {
        incoming: [] as ColumnLineage[],
        outgoing: [] as ColumnLineage[],
      };
    return {
      incoming: columnLineage.filter((c) => c.targetNode === selectedNode.id),
      outgoing: columnLineage.filter((c) => c.sourceNode === selectedNode.id),
    };
  }, [selectedNode, columnLineage]);

  // Canvas pan
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-node]")) return;
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    },
    [pan],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return;
      setPan({
        x: panStart.current.px + e.clientX - panStart.current.x,
        y: panStart.current.py + e.clientY - panStart.current.y,
      });
    },
    [isPanning],
  );

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.max(0.3, Math.min(2, s - e.deltaY * 0.001)));
  }, []);

  const errorNodes = nodes.filter((n) => n.status === "error");
  const staleNodes = nodes.filter((n) => n.status === "stale");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border p-4 md:p-5 shrink-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-linear-to-br from-blue-600 to-cyan-600 rounded-xl">
              <Network className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Data Lineage
              </h1>
              <p className="text-sm text-muted-foreground">
                {nodes.length} nodes · {edges.length} edges
                {errorNodes.length > 0 && (
                  <span className="ml-2 text-red-400">
                    {errorNodes.length} error{errorNodes.length > 1 ? "s" : ""}
                  </span>
                )}
                {staleNodes.length > 0 && (
                  <span className="ml-2 text-yellow-400">
                    {staleNodes.length} stale
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 text-xs">
              {[
                {
                  label: "Active",
                  color: "bg-green-500",
                  count: nodes.filter((n) => n.status === "active").length,
                },
                {
                  label: "Stale",
                  color: "bg-yellow-500",
                  count: staleNodes.length,
                },
                {
                  label: "Error",
                  color: "bg-red-500",
                  count: errorNodes.length,
                },
              ].map((s) => (
                <span
                  key={s.label}
                  className="flex items-center gap-1 px-2 py-1 bg-muted rounded-lg text-foreground"
                >
                  <span className={`w-2 h-2 rounded-full ${s.color}`} />
                  {s.count} {s.label}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedNode(null);
                refreshLineage();
              }}
              className="flex items-center gap-2 px-3 py-2 bg-accent hover:bg-accent rounded-lg text-sm text-foreground transition-colors"
            >
              <RefreshCw
                className={`w-4 h-4 ${loadingLineage ? "animate-spin" : ""}`}
              />{" "}
              Refresh
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3 bg-card rounded-xl p-1 border border-border w-fit">
          {(["graph", "table", "impact", "columns"] as const).map((tab) => {
            const icons = {
              graph: Network,
              table: Table2,
              impact: AlertTriangle,
              columns: GitBranch,
            };
            const Icon = icons[tab];
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {tab === "impact" &&
                  selectedNode &&
                  impactAnalysis.length > 0 && (
                    <span className="bg-red-500/80 text-white text-xs px-1 rounded-full">
                      {impactAnalysis.length}
                    </span>
                  )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {nodes.length === 0 && !loadingLineage && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-md rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <GitBranch className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-40" />
              <h2 className="text-base font-bold text-foreground">
                No lineage records yet
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Upload a dataset, run a transform, save a chart, or generate a
                telecom daily snapshot. This screen will build the graph from
                those real local records.
              </p>
            </div>
          </div>
        )}

        {nodes.length > 0 && (
          <AnimatePresence mode="wait">
            {/* ── Graph Tab ─────────────────────────────────────────── */}
            {activeTab === "graph" && (
              <motion.div
                key="graph"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex overflow-hidden relative"
              >
                {/* Toolbar */}
                <div className="absolute top-3 left-3 z-20 flex flex-col gap-1.5">
                  <div className="bg-card border border-border rounded-xl p-1.5 flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => setScale((s) => Math.min(2, s + 0.1))}
                      className="w-7 h-7 flex items-center justify-center text-foreground hover:text-foreground hover:bg-accent rounded-lg text-lg font-mono transition-colors"
                      title="Zoom in"
                    >
                      +
                    </button>
                    <span className="text-xs text-muted-foreground text-center font-mono">
                      {(scale * 100).toFixed(0)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setScale((s) => Math.max(0.3, s - 0.1))}
                      className="w-7 h-7 flex items-center justify-center text-foreground hover:text-foreground hover:bg-accent rounded-lg text-lg font-mono transition-colors"
                      title="Zoom out"
                    >
                      −
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setScale(0.85);
                      setPan({ x: 0, y: 0 });
                    }}
                    className="bg-card border border-border rounded-xl p-1.5 text-xs text-foreground hover:text-foreground transition-colors"
                  >
                    Fit
                  </button>
                </div>

                {/* Legend */}
                <div className="absolute bottom-3 left-3 z-20 bg-card border border-border rounded-xl p-3 text-xs space-y-1.5">
                  <div className="text-muted-foreground font-semibold mb-1">
                    Node types
                  </div>
                  {[
                    { label: "Source", color: "bg-blue-500/60" },
                    { label: "Transform", color: "bg-indigo-500/60" },
                    { label: "Model", color: "bg-purple-500/60" },
                    { label: "Output", color: "bg-emerald-500/60" },
                  ].map((l) => (
                    <div
                      key={l.label}
                      className="flex items-center gap-1.5 text-foreground"
                    >
                      <span className={`w-2.5 h-2.5 rounded ${l.color}`} />
                      {l.label}
                    </div>
                  ))}
                  <div className="border-t border-border pt-1.5 mt-1">
                    <div className="text-muted-foreground font-semibold mb-1">
                      Edges
                    </div>
                    <div className="flex items-center gap-1.5 text-foreground">
                      <span className="w-6 border-t border-muted-foreground" />
                      Full
                    </div>
                    <div className="flex items-center gap-1.5 text-foreground">
                      <span className="w-6 border-t border-dashed border-yellow-500" />
                      Partial
                    </div>
                  </div>
                </div>

                {/* Canvas */}
                {/* biome-ignore lint/a11y/noStaticElementInteractions: graph canvas supports drag and wheel panning */}
                <div
                  ref={canvasRef}
                  className={`flex-1 overflow-hidden relative ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onWheel={handleWheel}
                >
                  <div
                    style={{
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                      transformOrigin: "0 0",
                      width: canvasW,
                      height: canvasH,
                      position: "relative",
                    }}
                  >
                    {/* SVG edges */}
                    <svg
                      role="img"
                      aria-label="Lineage graph connections"
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        overflow: "visible",
                        pointerEvents: "none",
                      }}
                      width={canvasW}
                      height={canvasH}
                    >
                      <defs>
                        <marker
                          id="arrowhead"
                          markerWidth="8"
                          markerHeight="6"
                          refX="8"
                          refY="3"
                          orient="auto"
                        >
                          <polygon
                            points="0 0, 8 3, 0 6"
                            fill="#6366f1"
                            opacity="0.8"
                          />
                        </marker>
                      </defs>
                      {edges.map((edge) => {
                        const from = positions[edge.source];
                        const to = positions[edge.target];
                        if (!from || !to) return null;
                        const isHighlighted = selectedNode
                          ? edge.source === selectedNode.id ||
                            edge.target === selectedNode.id ||
                            (highlightedNodes.has(edge.source) &&
                              highlightedNodes.has(edge.target))
                          : true;
                        return (
                          <EdgeLine
                            key={edge.id}
                            from={from}
                            to={to}
                            edge={edge}
                            highlighted={isHighlighted}
                          />
                        );
                      })}
                    </svg>

                    {/* Node cards */}
                    {nodes.map((node) => {
                      const pos = positions[node.id];
                      if (!pos) return null;
                      const h = selectedNode
                        ? highlightedNodes.has(node.id)
                          ? node.id === selectedNode.id
                            ? "selected"
                            : "upstream"
                          : "none"
                        : "upstream";
                      return (
                        <div key={node.id} data-node="true">
                          <NodeCard
                            node={node}
                            selected={selectedNode?.id === node.id}
                            highlighted={
                              h as
                                | "upstream"
                                | "downstream"
                                | "none"
                                | "selected"
                            }
                            position={pos}
                            onClick={() => {
                              setSelectedNode(
                                node.id === selectedNode?.id ? null : node,
                              );
                              setShowDetail(node.id !== selectedNode?.id);
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Detail panel */}
                <AnimatePresence>
                  {showDetail && selectedNode && (
                    <motion.div
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 320, opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="border-l border-border bg-card overflow-y-auto shrink-0"
                    >
                      <div className="p-4">
                        {/* Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <StatusDot status={selectedNode.status} />
                              <h3 className="text-base font-bold text-foreground">
                                {selectedNode.name}
                              </h3>
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {selectedNode.subtype} · {selectedNode.type}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setShowDetail(false);
                              setSelectedNode(null);
                            }}
                            className="p-1 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Detail tabs */}
                        <div className="flex gap-1 mb-3">
                          {(
                            [
                              "info",
                              "upstreams",
                              "downstreams",
                              "columns",
                            ] as const
                          ).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setDetailTab(t)}
                              className={`flex-1 py-1 text-xs rounded-lg transition-all ${
                                detailTab === t
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>

                        {detailTab === "info" && (
                          <div className="space-y-3">
                            <p className="text-xs text-foreground">
                              {selectedNode.description}
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              {[
                                {
                                  l: "Rows",
                                  v:
                                    selectedNode.rowCount > 0
                                      ? selectedNode.rowCount.toLocaleString()
                                      : "N/A",
                                },
                                {
                                  l: "Columns",
                                  v:
                                    selectedNode.colCount > 0
                                      ? String(selectedNode.colCount)
                                      : "N/A",
                                },
                                { l: "Owner", v: selectedNode.owner },
                                { l: "Updated", v: selectedNode.lastUpdated },
                                {
                                  l: "Duration",
                                  v: selectedNode.duration ?? "—",
                                },
                                {
                                  l: "Quality",
                                  v:
                                    selectedNode.quality > 0
                                      ? `${(selectedNode.quality * 100).toFixed(0)}%`
                                      : "—",
                                },
                              ].map((item) => (
                                <div
                                  key={item.l}
                                  className="bg-muted rounded-lg p-2"
                                >
                                  <div className="text-xs text-muted-foreground">
                                    {item.l}
                                  </div>
                                  <div className="text-sm font-mono text-foreground mt-0.5">
                                    {item.v}
                                  </div>
                                </div>
                              ))}
                            </div>
                            {selectedNode.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {selectedNode.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="text-xs bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded"
                                  >
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}
                            {selectedNode.quality > 0 && (
                              <div>
                                <div className="flex justify-between text-xs mb-1">
                                  <span className="text-muted-foreground">
                                    Quality Score
                                  </span>
                                  <span
                                    style={{
                                      color:
                                        selectedNode.quality >= 0.9
                                          ? "#22c55e"
                                          : selectedNode.quality >= 0.7
                                            ? "#f59e0b"
                                            : "#ef4444",
                                    }}
                                  >
                                    {(selectedNode.quality * 100).toFixed(0)}%
                                  </span>
                                </div>
                                <div className="h-2 bg-accent rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${selectedNode.quality * 100}%`,
                                      backgroundColor:
                                        selectedNode.quality >= 0.9
                                          ? "#22c55e"
                                          : selectedNode.quality >= 0.7
                                            ? "#f59e0b"
                                            : "#ef4444",
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {detailTab === "upstreams" && (
                          <div className="space-y-2">
                            {selectedNode.upstreams.length === 0 ? (
                              <div className="text-xs text-muted-foreground text-center py-4">
                                No upstream dependencies
                              </div>
                            ) : (
                              selectedNode.upstreams.map((uid) => {
                                const un = nodes.find((n) => n.id === uid);
                                if (!un) return null;
                                const us = typeStyle(un.type);
                                const UIcon = us.icon;
                                return (
                                  <button
                                    key={uid}
                                    type="button"
                                    onClick={() => {
                                      setSelectedNode(un);
                                      setDetailTab("info");
                                    }}
                                    className={`w-full text-left p-2.5 rounded-xl border transition-colors ${us.bg} ${us.border} hover:opacity-80`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <UIcon
                                        className={`w-3.5 h-3.5 ${us.iconColor}`}
                                      />
                                      <span className="text-sm text-foreground">
                                        {un.name}
                                      </span>
                                      <StatusDot status={un.status} />
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                      {un.rowCount.toLocaleString()} rows
                                    </div>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        )}

                        {detailTab === "downstreams" && (
                          <div className="space-y-2">
                            {selectedNode.downstreams.length === 0 ? (
                              <div className="text-xs text-muted-foreground text-center py-4">
                                No downstream consumers
                              </div>
                            ) : (
                              selectedNode.downstreams.map((did) => {
                                const dn = nodes.find((n) => n.id === did);
                                if (!dn) return null;
                                const ds = typeStyle(dn.type);
                                const DIcon = ds.icon;
                                return (
                                  <button
                                    key={did}
                                    type="button"
                                    onClick={() => {
                                      setSelectedNode(dn);
                                      setDetailTab("info");
                                    }}
                                    className={`w-full text-left p-2.5 rounded-xl border transition-colors ${ds.bg} ${ds.border} hover:opacity-80`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <DIcon
                                        className={`w-3.5 h-3.5 ${ds.iconColor}`}
                                      />
                                      <span className="text-sm text-foreground">
                                        {dn.name}
                                      </span>
                                      <StatusDot status={dn.status} />
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                      {dn.type}
                                    </div>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        )}

                        {detailTab === "columns" && (
                          <div className="space-y-3">
                            {colLineage.incoming.length > 0 && (
                              <div>
                                <div className="text-xs font-semibold text-muted-foreground mb-2">
                                  Incoming column lineage
                                </div>
                                <div className="space-y-1.5">
                                  {colLineage.incoming.map((cl) => (
                                    <div
                                      key={columnLineageKey(cl)}
                                      className="bg-muted rounded-lg p-2 text-xs"
                                    >
                                      <div className="flex items-center gap-1 text-foreground">
                                        <span className="font-mono text-blue-300">
                                          {cl.sourceCol}
                                        </span>
                                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                        <span className="font-mono text-foreground">
                                          {cl.targetCol}
                                        </span>
                                      </div>
                                      {cl.transform && (
                                        <div className="text-muted-foreground mt-0.5 font-mono">
                                          {cl.transform}
                                        </div>
                                      )}
                                      <div className="text-muted-foreground mt-0.5">
                                        from: {cl.sourceNode}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {colLineage.outgoing.length > 0 && (
                              <div>
                                <div className="text-xs font-semibold text-muted-foreground mb-2">
                                  Outgoing column lineage
                                </div>
                                <div className="space-y-1.5">
                                  {colLineage.outgoing.map((cl) => (
                                    <div
                                      key={columnLineageKey(cl)}
                                      className="bg-muted rounded-lg p-2 text-xs"
                                    >
                                      <div className="flex items-center gap-1 text-foreground">
                                        <span className="font-mono text-foreground">
                                          {cl.sourceCol}
                                        </span>
                                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                        <span className="font-mono text-emerald-300">
                                          {cl.targetCol}
                                        </span>
                                      </div>
                                      {cl.transform && (
                                        <div className="text-muted-foreground mt-0.5 font-mono">
                                          {cl.transform}
                                        </div>
                                      )}
                                      <div className="text-muted-foreground mt-0.5">
                                        to: {cl.targetNode}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {colLineage.incoming.length === 0 &&
                              colLineage.outgoing.length === 0 && (
                                <div className="text-xs text-muted-foreground text-center py-4">
                                  No column lineage tracked for this node
                                </div>
                              )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* ── Table Tab ─────────────────────────────────────────── */}
            {activeTab === "table" && (
              <motion.div
                key="table"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 overflow-hidden flex flex-col p-4"
              >
                <div className="flex gap-3 mb-4 flex-wrap">
                  <div className="relative flex-1 min-w-48">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search nodes..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none"
                  >
                    <option value="all">All types</option>
                    <option value="source">Source</option>
                    <option value="transform">Transform</option>
                    <option value="model">Model</option>
                    <option value="output">Output</option>
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none"
                  >
                    <option value="all">All status</option>
                    <option value="active">Active</option>
                    <option value="stale">Stale</option>
                    <option value="error">Error</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>

                <div className="flex-1 overflow-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card backdrop-blur z-10">
                      <tr>
                        {[
                          "Node",
                          "Type",
                          "Status",
                          "Rows",
                          "Columns",
                          "Quality",
                          "Owner",
                          "Updated",
                        ].map((h) => (
                          <th
                            key={h}
                            className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground border-b border-border"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredNodes.map((node, idx) => {
                        const st = typeStyle(node.type);
                        const Icon = st.icon;
                        return (
                          <motion.tr
                            key={node.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: idx * 0.02 }}
                            onClick={() => {
                              setSelectedNode(node);
                              setShowDetail(true);
                              setActiveTab("graph");
                            }}
                            className="border-b border-border hover:bg-accent cursor-pointer transition-colors"
                          >
                            <td className="py-2.5 px-4">
                              <div className="flex items-center gap-2">
                                <Icon
                                  className={`w-3.5 h-3.5 ${st.iconColor}`}
                                />
                                <span className="text-foreground font-mono">
                                  {node.name}
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-4">
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded ${st.bg} ${st.iconColor}`}
                              >
                                {node.type}
                              </span>
                            </td>
                            <td className="py-2.5 px-4">
                              <div className="flex items-center gap-1.5">
                                <StatusDot status={node.status} />
                                <span className="text-xs text-foreground">
                                  {node.status}
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-foreground font-mono">
                              {node.rowCount > 0
                                ? node.rowCount.toLocaleString()
                                : "—"}
                            </td>
                            <td className="py-2.5 px-4 text-foreground font-mono">
                              {node.colCount > 0 ? node.colCount : "—"}
                            </td>
                            <td className="py-2.5 px-4">
                              {node.quality > 0 ? (
                                <div className="flex items-center gap-1.5">
                                  <div className="w-12 h-1.5 bg-accent rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${node.quality * 100}%`,
                                        backgroundColor:
                                          node.quality >= 0.9
                                            ? "#22c55e"
                                            : node.quality >= 0.7
                                              ? "#f59e0b"
                                              : "#ef4444",
                                      }}
                                    />
                                  </div>
                                  <span className="text-xs font-mono text-foreground">
                                    {(node.quality * 100).toFixed(0)}%
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-muted-foreground text-xs">
                              {node.owner}
                            </td>
                            <td className="py-2.5 px-4 text-muted-foreground text-xs">
                              {node.lastUpdated}
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {/* ── Impact Tab ─────────────────────────────────────────── */}
            {activeTab === "impact" && (
              <motion.div
                key="impact"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 overflow-y-auto p-4"
              >
                {!selectedNode ? (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <AlertTriangle className="w-12 h-12 mb-3 opacity-30" />
                    <p className="text-lg">
                      Select a node in the graph to see impact analysis
                    </p>
                    <p className="text-sm mt-1 text-muted-foreground">
                      Click any node on the Graph tab, then switch here
                    </p>
                  </div>
                ) : (
                  <div className="max-w-3xl mx-auto space-y-4">
                    <div className="bg-card border border-border rounded-xl p-4">
                      <h2 className="text-base font-bold text-foreground mb-1 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-yellow-400" />
                        Impact Analysis:{" "}
                        <span className="font-mono text-indigo-300">
                          {selectedNode.name}
                        </span>
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        If{" "}
                        <strong className="text-foreground">
                          {selectedNode.name}
                        </strong>{" "}
                        changes or fails, the following {impactAnalysis.length}{" "}
                        downstream nodes would be affected:
                      </p>
                    </div>

                    {impactAnalysis.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <CheckCircle2 className="w-8 h-8 mb-2 mx-auto text-green-400" />
                        No downstream impact — this is a terminal node
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {impactAnalysis.map((item, idx) => {
                          const st = typeStyle(item.node.type);
                          const Icon = st.icon;
                          return (
                            <motion.div
                              key={item.node.id}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.05 }}
                              className={`bg-card border rounded-xl p-4 ${
                                item.risk === "high"
                                  ? "border-red-500/30"
                                  : item.risk === "medium"
                                    ? "border-yellow-500/30"
                                    : "border-border"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <Icon className={`w-4 h-4 ${st.iconColor}`} />
                                  <span className="text-foreground font-mono font-semibold">
                                    {item.node.name}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    ({item.node.type})
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                                      item.risk === "high"
                                        ? "bg-red-500/20 text-red-300"
                                        : item.risk === "medium"
                                          ? "bg-yellow-500/20 text-yellow-300"
                                          : "bg-muted text-foreground"
                                    }`}
                                  >
                                    {item.risk} risk
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    +{item.distance} hop
                                    {item.distance > 1 ? "s" : ""}
                                  </span>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1.5">
                                {item.node.description}
                              </p>
                              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                <span>
                                  Owner:{" "}
                                  <span className="text-foreground">
                                    {item.node.owner}
                                  </span>
                                </span>
                                <StatusDot status={item.node.status} />
                                <span className="text-foreground">
                                  {item.node.status}
                                </span>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Columns Tab ────────────────────────────────────────── */}
            {activeTab === "columns" && (
              <motion.div
                key="columns"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 overflow-y-auto p-4"
              >
                <div className="max-w-4xl mx-auto space-y-4">
                  <div className="bg-card border border-border rounded-xl p-4">
                    <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <GitBranch className="w-4 h-4 text-purple-400" />
                      Column-Level Lineage ({columnLineage.length} tracked
                      mappings)
                    </h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2 px-3 text-xs text-muted-foreground">
                              Source Node
                            </th>
                            <th className="text-left py-2 px-3 text-xs text-muted-foreground">
                              Source Column
                            </th>
                            <th className="py-2 px-2 text-xs text-muted-foreground" />
                            <th className="text-left py-2 px-3 text-xs text-muted-foreground">
                              Target Node
                            </th>
                            <th className="text-left py-2 px-3 text-xs text-muted-foreground">
                              Target Column
                            </th>
                            <th className="text-left py-2 px-3 text-xs text-muted-foreground">
                              Transform
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {columnLineage.map((cl, i) => (
                            <motion.tr
                              key={columnLineageKey(cl)}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: i * 0.04 }}
                              className="border-b border-border hover:bg-accent"
                            >
                              <td className="py-2 px-3 text-blue-300 font-mono text-xs">
                                {cl.sourceNode}
                              </td>
                              <td className="py-2 px-3 text-foreground font-mono text-xs">
                                {cl.sourceCol}
                              </td>
                              <td className="py-2 px-2 text-muted-foreground">
                                <ArrowRight className="w-3.5 h-3.5" />
                              </td>
                              <td className="py-2 px-3 text-emerald-300 font-mono text-xs">
                                {cl.targetNode}
                              </td>
                              <td className="py-2 px-3 text-foreground font-mono text-xs">
                                {cl.targetCol}
                              </td>
                              <td className="py-2 px-3">
                                {cl.transform ? (
                                  <code className="text-xs bg-muted text-yellow-300 px-1.5 py-0.5 rounded">
                                    {cl.transform}
                                  </code>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    passthrough
                                  </span>
                                )}
                              </td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Visual column flow */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {nodes.slice(0, 3).map((node) => {
                      const nodeId = node.id;
                      const colsIn = columnLineage.filter(
                        (c) => c.targetNode === nodeId,
                      );
                      const colsOut = columnLineage.filter(
                        (c) => c.sourceNode === nodeId,
                      );
                      const st = typeStyle(node.type);
                      const Icon = st.icon;
                      return (
                        <div
                          key={nodeId}
                          className={`bg-card border rounded-xl p-4 ${st.border}`}
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <Icon className={`w-4 h-4 ${st.iconColor}`} />
                            <span className="text-sm font-bold text-foreground">
                              {node.name}
                            </span>
                          </div>
                          {colsIn.length > 0 && (
                            <div className="mb-2">
                              <div className="text-xs text-muted-foreground mb-1">
                                Receives
                              </div>
                              {colsIn.map((c) => (
                                <div
                                  key={columnLineageKey(c)}
                                  className="text-xs text-blue-300 font-mono py-0.5"
                                >
                                  {c.sourceCol} → {c.targetCol}
                                </div>
                              ))}
                            </div>
                          )}
                          {colsOut.length > 0 && (
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">
                                Sends
                              </div>
                              {colsOut.map((c) => (
                                <div
                                  key={columnLineageKey(c)}
                                  className="text-xs text-emerald-300 font-mono py-0.5"
                                >
                                  {c.sourceCol} → {c.targetCol}
                                </div>
                              ))}
                            </div>
                          )}
                          {colsIn.length === 0 && colsOut.length === 0 && (
                            <div className="text-xs text-muted-foreground">
                              No tracked column lineage
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
