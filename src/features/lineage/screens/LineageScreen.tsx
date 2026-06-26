"use client";

// ─── LineageScreen — orchestration only ──────────────────────────────────────
//
// The 1500-line monolith (hand-rolled SVG canvas, React-state pan/zoom,
// per-node Framer mounts, O(n²) find-walks, per-row motion stagger) is gone.
// This screen now:
//   • gathers serializable build input from local records (data-store +
//     IndexedDB telecom caches),
//   • builds the laid-out model OFF the main thread via `useLineageWorker`
//     (worker → ELK layout → node-sql-parser column lineage → Dexie snapshot),
//   • indexes the model ONCE into Maps/adjacency lists (O(1) lookups,
//     O(V+E) traversal), and
//   • renders @xyflow/react (viewport-culled) + virtualized tables.

import { AlertTriangle, GitBranch, Network, RefreshCw, Search, Table2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useActivityStore } from "@/core/stores/activity-store";
import { useAppContextStore } from "@/core/stores/app-context-store";
import { useDataStore } from "@/core/stores/data-store";
import { useAppCommands, useRegisterPages } from "@/features/desktop/core/menu/app-commands";
import { useWindowId } from "@/features/desktop/core/menu/window-context";
import {
  type CachedAnalyticsMeta,
  type CachedTelecomSourceFileMeta,
  getCachedAnalyticsEntries,
  getCachedTelecomSourceFiles,
} from "@/features/telecom/lib/analytics-cache";
import { type DailyStat, listDailyStats } from "@/features/telecom/lib/daily-stats-cache";
import { ColumnLineageTable } from "../components/ColumnLineageTable";
import { DetailPanel } from "../components/DetailPanel";
import { ImpactPanel } from "../components/ImpactPanel";
import { LineageGraph } from "../components/LineageGraph";
import { LineageTable } from "../components/LineageTable";
import { bfs, buildAdjacency, computeImpact, indexColumnLineage, indexNodes } from "../core/graph";
import type { LNode } from "../core/types";
import { useLineageWorker } from "../worker/useLineageWorker";

type Tab = "graph" | "table" | "impact" | "columns";

const TAB_ICONS = {
  graph: Network,
  table: Table2,
  impact: AlertTriangle,
  columns: GitBranch,
} as const;

function datasetNodeId(activeDatasetId: string): string {
  return `dataset_${activeDatasetId.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 80)}`;
}

export default function LineageScreen() {
  // Narrow selectors keep this screen off the broad-store re-render path.
  const datasets = useDataStore((s) => s.datasets);
  const transforms = useDataStore((s) => s.transforms);
  const savedCharts = useDataStore((s) => s.savedCharts);
  const loadedTableNames = useDataStore((s) => s.loadedTableNames);
  const activeDatasetId = useAppContextStore((s) => s.activeDatasetId);
  const eventsCount = useActivityStore((s) => s.events.length);

  // IndexedDB-cached telecom records (async). `cachesReady` gates the build so
  // we never compute a hash off half-loaded inputs.
  const [telecomSources, setTelecomSources] = useState<CachedTelecomSourceFileMeta[]>([]);
  const [telecomAnalytics, setTelecomAnalytics] = useState<CachedAnalyticsMeta[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [cachesReady, setCachesReady] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const [activeTab, setActiveTab] = useState<Tab>("graph");
  const [selectedNode, setSelectedNode] = useState<LNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // biome-ignore lint/correctness/useExhaustiveDependencies: collection sizes + nonce are intentional refetch triggers
  useEffect(() => {
    let cancelled = false;
    setCachesReady(false);
    (async () => {
      const [sources, analytics, stats] = await Promise.all([
        getCachedTelecomSourceFiles(),
        getCachedAnalyticsEntries(),
        listDailyStats(),
      ]);
      if (cancelled) return;
      setTelecomSources(sources);
      setTelecomAnalytics(analytics);
      setDailyStats(stats);
      setCachesReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    datasets.length,
    transforms.length,
    savedCharts.length,
    loadedTableNames.length,
    eventsCount,
    refreshNonce,
  ]);

  const buildInput = useMemo(
    () => ({
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

  const { model, loading } = useLineageWorker(buildInput, cachesReady);
  const { nodes, edges, columnLineage } = model;

  // ── Index the model ONCE (Maps + adjacency) — O(1)/O(V+E) everywhere. ──
  const nodeById = useMemo(() => indexNodes(nodes), [nodes]);
  const adjacency = useMemo(() => buildAdjacency(edges), [edges]);
  const colIndex = useMemo(() => indexColumnLineage(columnLineage), [columnLineage]);

  // Reselect when the active dataset changes (Map lookup, not find scan).
  useEffect(() => {
    if (!activeDatasetId) return;
    const hit = nodeById.get(datasetNodeId(activeDatasetId));
    if (hit) setSelectedNode(hit);
  }, [activeDatasetId, nodeById]);

  // Keep the selected node reference fresh across rebuilds.
  useEffect(() => {
    if (selectedNode && !nodeById.has(selectedNode.id)) setSelectedNode(null);
  }, [nodeById, selectedNode]);

  const highlighted = useMemo(() => {
    if (!selectedNode) return null;
    return new Set<string>([
      ...bfs(selectedNode.id, adjacency.back),
      ...bfs(selectedNode.id, adjacency.fwd),
      selectedNode.id,
    ]);
  }, [selectedNode, adjacency]);

  const impact = useMemo(() => {
    if (!selectedNode) return [];
    return computeImpact(selectedNode.id, adjacency.fwd, nodeById);
  }, [selectedNode, adjacency.fwd, nodeById]);

  const filteredNodes = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return nodes.filter((n) => {
      const matchSearch =
        !q ||
        n.name.toLowerCase().includes(q) ||
        n.description.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q));
      const matchType = typeFilter === "all" || n.type === typeFilter;
      const matchStatus = statusFilter === "all" || n.status === statusFilter;
      return matchSearch && matchType && matchStatus;
    });
  }, [nodes, searchQuery, typeFilter, statusFilter]);

  const counts = useMemo(() => {
    let active = 0;
    let stale = 0;
    let error = 0;
    for (const n of nodes) {
      if (n.status === "active") active++;
      else if (n.status === "stale") stale++;
      else if (n.status === "error") error++;
    }
    return { active, stale, error };
  }, [nodes]);

  const selectAndShow = (node: LNode | null) => {
    setSelectedNode(node);
    if (node) setActiveTab("graph");
  };

  // ── Desktop menu wiring: surface the four views as pages and let the
  //    "Lignage" / "Fichier" menus drive tab switching + refresh. ──
  const windowId = useWindowId();
  useRegisterPages(
    windowId,
    [
      { id: "graph", label: "Graphe", icon: Network },
      { id: "table", label: "Tableau", icon: Table2 },
      { id: "impact", label: "Analyse d'impact", icon: AlertTriangle },
      { id: "columns", label: "Lignage des colonnes", icon: GitBranch },
    ],
    activeTab,
  );
  useAppCommands("lineage", {
    navigate: (payload) => {
      const pageId = (payload as { pageId?: string } | undefined)?.pageId;
      if (pageId === "graph" || pageId === "table" || pageId === "impact" || pageId === "columns") {
        setActiveTab(pageId);
      }
    },
    refresh: () => {
      setSelectedNode(null);
      setRefreshNonce((n) => n + 1);
    },
  });

  return (
    <div className=" flex flex-col">
      {/* Header */}
      <div className=" shrink-0 px-4 py-3 md:px-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-linear-to-br from-blue-600 to-cyan-600 rounded-xl">
              <Network className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Data Lineage</h1>
              <p className="text-sm text-muted-foreground">
                {nodes.length} nodes · {edges.length} edges
                {counts.error > 0 && (
                  <span className="ml-2 text-red-400">
                    {counts.error} error{counts.error > 1 ? "s" : ""}
                  </span>
                )}
                {counts.stale > 0 && (
                  <span className="ml-2 text-yellow-400">{counts.stale} stale</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 text-xs">
              {[
                { label: "Active", color: "bg-green-500", count: counts.active },
                { label: "Stale", color: "bg-yellow-500", count: counts.stale },
                { label: "Error", color: "bg-red-500", count: counts.error },
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
                setRefreshNonce((n) => n + 1);
              }}
              className="flex items-center gap-2 px-3 py-2 bg-accent hover:bg-accent rounded-lg text-sm text-foreground transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3 bg-card rounded-xl p-1 border border-border w-fit">
          {(["graph", "table", "impact", "columns"] as const).map((tab) => {
            const Icon = TAB_ICONS[tab];
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
                {tab === "impact" && selectedNode && impact.length > 0 && (
                  <span className="bg-red-500/80 text-white text-xs px-1 rounded-full">
                    {impact.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {nodes.length === 0 && !loading && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-md rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <GitBranch className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-40" />
              <h2 className="text-base font-bold text-foreground">No lineage records yet</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Upload a dataset, run a transform, save a chart, or generate a telecom daily
                snapshot. This screen will build the graph from those real local records.
              </p>
            </div>
          </div>
        )}

        {nodes.length > 0 && activeTab === "graph" && (
          <div className="flex-1 flex overflow-hidden relative">
            <div className="flex-1 min-h-0">
              <LineageGraph
                model={model}
                selectedId={selectedNode?.id ?? null}
                highlighted={highlighted}
                onSelect={selectAndShow}
              />
            </div>
            {selectedNode && (
              <DetailPanel
                node={selectedNode}
                nodeById={nodeById}
                colIndex={colIndex}
                onSelect={(n) => setSelectedNode(n)}
                onClose={() => setSelectedNode(null)}
              />
            )}
          </div>
        )}

        {nodes.length > 0 && activeTab === "table" && (
          <div className="flex-1 overflow-hidden flex flex-col p-4">
            <div className="flex gap-3 mb-4 flex-wrap shrink-0">
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
            <LineageTable nodes={filteredNodes} onSelect={selectAndShow} />
          </div>
        )}

        {nodes.length > 0 && activeTab === "impact" && (
          <div className="flex-1 overflow-hidden p-4">
            <ImpactPanel selected={selectedNode} impact={impact} />
          </div>
        )}

        {nodes.length > 0 && activeTab === "columns" && (
          <div className="flex-1 overflow-hidden flex flex-col p-4">
            <div className="shrink-0 mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <GitBranch className="w-4 h-4 text-purple-400" />
              Column-Level Lineage ({columnLineage.length} tracked mappings)
            </div>
            {columnLineage.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                No column lineage tracked yet. Run an SQL transform to derive column-level
                provenance.
              </div>
            ) : (
              <div className="flex-1 min-h-0">
                <ColumnLineageTable columnLineage={columnLineage} nodeById={nodeById} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
