"use client";

import {
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  File,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Globe,
  Grid3x3,
  HardDrive,
  Hash,
  Layers,
  List,
  Lock,
  Search,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { useDataStore } from "@/core/stores/data-store";
import { useFoldersStore } from "@/core/stores/folders-store";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

// ─── Types ─────────────────────────────────────────────────────────────────

type NodeType = "folder" | "csv" | "excel" | "parquet" | "duckdb" | "sql";

interface FSNode {
  id: string;
  name: string;
  type: NodeType;
  parentId: string | null;
  size: number;
  rowCount?: number;
  colCount?: number;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  starred: boolean;
  shared: boolean;
  locked: boolean;
  quality?: number;
  description?: string;
  color?: string;
}

interface DragState {
  dragging: string | null;
  over: string | null;
}

// ─── Utility ───────────────────────────────────────────────────────────────

function formatBytes(b: number): string {
  if (b === 0) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function formatAge(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d ago`;
  return d.toLocaleDateString();
}

function fileTypeStyle(type: NodeType) {
  switch (type) {
    case "folder":
      return { icon: Folder, color: "text-yellow-400", bg: "bg-yellow-500/15" };
    case "csv":
      return {
        icon: FileSpreadsheet,
        color: "text-green-400",
        bg: "bg-green-500/15",
      };
    case "excel":
      return {
        icon: FileSpreadsheet,
        color: "text-emerald-400",
        bg: "bg-emerald-500/15",
      };
    case "parquet":
      return {
        icon: Database,
        color: "text-indigo-400",
        bg: "bg-indigo-500/15",
      };
    case "duckdb":
      return {
        icon: Database,
        color: "text-purple-400",
        bg: "bg-purple-500/15",
      };
    case "sql":
      return { icon: Hash, color: "text-orange-400", bg: "bg-orange-500/15" };
    default:
      return { icon: File, color: "text-muted-foreground", bg: "bg-muted" };
  }
}

function qualityColor(q: number): string {
  if (q >= 0.9) return "#22c55e";
  if (q >= 0.7) return "#f59e0b";
  return "#ef4444";
}

function getFolderSize(id: string, nodes: FSNode[]): number {
  const children = nodes.filter((n) => n.parentId === id);
  return children.reduce((sum, c) => {
    if (c.type === "folder") return sum + getFolderSize(c.id, nodes);
    return sum + c.size;
  }, 0);
}

// ─── TreeNode ───────────────────────────────────────────────────────────────

interface TreeNodeProps {
  node: FSNode;
  allNodes: FSNode[];
  depth: number;
  expanded: Set<string>;
  selected: string | null;
  drag: DragState;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDrop: (targetId: string) => void;
  onStar: (id: string) => void;
}

function TreeNode({
  node,
  allNodes,
  depth,
  expanded,
  selected,
  drag,
  onToggle,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
  onStar,
}: TreeNodeProps) {
  const children = allNodes.filter((n) => n.parentId === node.id);
  const hasChildren = children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isSelected = selected === node.id;
  const isDraggingOver = drag.over === node.id && drag.dragging !== node.id;
  const style = fileTypeStyle(node.type);
  const Icon = node.type === "folder" && isExpanded ? FolderOpen : style.icon;

  return (
    <div>
      <button
        type="button"
        className={`w-full flex items-center gap-1 py-1 px-2 rounded-lg cursor-pointer select-none transition-all group text-left ${
          isSelected
            ? "bg-primary/20 border border-primary/30"
            : isDraggingOver
              ? "bg-primary/15 border border-dashed border-primary/50"
              : "hover:bg-accent border border-transparent"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => onSelect(node.id)}
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          onDragStart(node.id);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDragOver(node.id);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDrop(node.id);
        }}
      >
        <button
          type="button"
          className="w-4 h-4 flex items-center justify-center shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggle(node.id);
          }}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )
          ) : null}
        </button>
        {node.color && node.type === "folder" ? (
          <span className="text-sm shrink-0" style={{ color: node.color }}>
            {isExpanded ? "📂" : "📁"}
          </span>
        ) : (
          <Icon className={`w-4 h-4 shrink-0 ${style.color}`} />
        )}
        <span className="flex-1 text-sm text-foreground truncate min-w-0">
          {node.name}
        </span>
        <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {node.starred && (
            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
          )}
          {node.locked && <Lock className="w-3 h-3 text-muted-foreground" />}
          {node.shared && <Globe className="w-3 h-3 text-blue-400" />}
          {node.quality !== undefined && (
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: qualityColor(node.quality) }}
            />
          )}
        </span>
        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-yellow-400 text-muted-foreground transition-all"
          onClick={(e) => {
            e.stopPropagation();
            onStar(node.id);
          }}
        >
          <Star
            className={`w-3 h-3 ${node.starred ? "fill-yellow-400 text-yellow-400" : ""}`}
          />
        </button>
      </button>
      <AnimatePresence>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            {children
              .sort((a, b) => {
                if (a.type === "folder" && b.type !== "folder") return -1;
                if (a.type !== "folder" && b.type === "folder") return 1;
                return a.name.localeCompare(b.name);
              })
              .map((child) => (
                <TreeNode
                  key={child.id}
                  node={child}
                  allNodes={allNodes}
                  depth={depth + 1}
                  expanded={expanded}
                  selected={selected}
                  drag={drag}
                  onToggle={onToggle}
                  onSelect={onSelect}
                  onDragStart={onDragStart}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  onStar={onStar}
                />
              ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── FileGrid ───────────────────────────────────────────────────────────────

function FileGrid({
  nodes,
  selected,
  onSelect,
  onStar,
}: {
  nodes: FSNode[];
  selected: string | null;
  onSelect: (id: string) => void;
  onStar: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
      {nodes.map((node, idx) => {
        const style = fileTypeStyle(node.type);
        const Icon = style.icon;
        return (
          <motion.div
            key={node.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.03 }}
            onClick={() => onSelect(node.id)}
            className={`p-3 rounded-xl border cursor-pointer transition-all hover:shadow-md group ${
              selected === node.id
                ? "bg-primary/15 border-primary/30"
                : "bg-card border-border hover:border-border"
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className={`p-2 rounded-lg ${style.bg}`}>
                <Icon className={`w-5 h-5 ${style.color}`} />
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onStar(node.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-yellow-400"
              >
                <Star
                  className={`w-3.5 h-3.5 ${node.starred ? "fill-yellow-400 text-yellow-400 opacity-100" : ""}`}
                />
              </button>
            </div>
            <div className="text-xs font-semibold text-foreground truncate">
              {node.name}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {formatBytes(node.size)}
            </div>
            {node.rowCount !== undefined && (
              <div className="text-xs text-muted-foreground">
                {node.rowCount.toLocaleString()} rows
              </div>
            )}
            {node.quality !== undefined && (
              <div className="mt-1.5 h-1 bg-accent rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${node.quality * 100}%`,
                    backgroundColor: qualityColor(node.quality),
                  }}
                />
              </div>
            )}
            <div className="flex items-center gap-1 mt-1.5">
              {node.locked && (
                <Lock className="w-2.5 h-2.5 text-muted-foreground" />
              )}
              {node.shared && <Globe className="w-2.5 h-2.5 text-blue-400" />}
              {node.tags.slice(0, 2).map((t) => (
                <span
                  key={t}
                  className="text-xs bg-muted text-muted-foreground px-1 rounded"
                >
                  {t}
                </span>
              ))}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function FoldersScreen() {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // ── Real data sources ────────────────────────────────────────────────────
  const { datasets, removeDataset } = useDataStore();
  const {
    folders: catalogFolders,
    datasetFolderMap,
    starredDatasets,
    addFolder: storeAddFolder,
    removeFolder: storeRemoveFolder,
    moveFolder: storeMoveFolder,
    starFolder: storeStarFolder,
    moveDataset: storeMoveDataset,
    removeDatasetFromMap,
    starDataset: storeStarDataset,
  } = useFoldersStore();

  // ── UI-only state ────────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["root"]));
  const [selected, setSelected] = useState<string | null>("root");
  const [viewMode, setViewMode] = useState<"tree-grid" | "grid" | "list">(
    "tree-grid",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "size" | "updated" | "quality">(
    "name",
  );
  const [sortAsc, setSortAsc] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [drag, setDrag] = useState<DragState>({ dragging: null, over: null });
  const [activeTab, setActiveTab] = useState<
    "files" | "starred" | "recent" | "stats"
  >("files");
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);

  // Auto-expand root on mount
  useEffect(() => {
    setExpanded(new Set(["root"]));
  }, []);

  // ── Derive FSNode[] from real store data ─────────────────────────────────
  const nodes = useMemo((): FSNode[] => {
    const root: FSNode = {
      id: "root",
      name: "My Datasets",
      type: "folder",
      parentId: null,
      size: 0,
      createdAt: new Date(0),
      updatedAt: new Date(),
      tags: [],
      starred: false,
      shared: false,
      locked: false,
      color: "#6366f1",
    };

    const folderNodes: FSNode[] = catalogFolders.map((f) => ({
      id: f.id,
      name: f.name,
      type: "folder" as NodeType,
      parentId: f.parentId ?? "root",
      size: 0,
      createdAt: new Date(f.createdAt),
      updatedAt: new Date(f.createdAt),
      tags: [],
      starred: f.starred,
      shared: false,
      locked: false,
      color: f.color,
    }));

    const fileNodes: FSNode[] = datasets.map((ds) => ({
      id: ds.id,
      name: ds.name,
      type: ds.format as NodeType,
      parentId: datasetFolderMap[ds.id] ?? "root",
      size: ds.sizeBytes,
      rowCount: ds.rowCount,
      colCount: ds.colCount,
      createdAt: new Date(ds.createdAt),
      updatedAt: new Date(ds.updatedAt),
      tags: ds.tags,
      starred: starredDatasets.includes(ds.id),
      shared: false,
      locked: false,
      quality: ds.qualityScore / 100,
      description: ds.description,
    }));

    return [root, ...folderNodes, ...fileNodes];
  }, [datasets, catalogFolders, datasetFolderMap, starredDatasets]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      setSelected(id);
      const node = nodes.find((n) => n.id === id);
      if (node?.type === "folder")
        setExpanded((prev) => {
          const s = new Set(prev);
          s.add(id);
          return s;
        });
    },
    [nodes],
  );

  const handleStar = useCallback(
    (id: string) => {
      const node = nodes.find((n) => n.id === id);
      if (!node) return;
      if (node.type === "folder" && id !== "root") {
        storeStarFolder(id);
      } else if (node.type !== "folder") {
        storeStarDataset(id);
      }
    },
    [nodes, storeStarFolder, storeStarDataset],
  );

  const handleDelete = useCallback(
    (id: string) => {
      if (id === "root") return;
      const node = nodes.find((n) => n.id === id);
      if (!node) return;
      if (node.type === "folder") {
        // Remove folder and all contents
        storeRemoveFolder(id);
        // Remove datasets that were in this folder (from data store too)
        datasets
          .filter((ds) => datasetFolderMap[ds.id] === id)
          .forEach((ds) => {
            removeDatasetFromMap(ds.id);
            removeDataset(ds.id);
          });
      } else {
        // Remove dataset from data store and folder map
        removeDataset(id);
        removeDatasetFromMap(id);
      }
      if (selected === id) setSelected("root");
    },
    [
      nodes,
      datasets,
      datasetFolderMap,
      storeRemoveFolder,
      removeDataset,
      removeDatasetFromMap,
      selected,
    ],
  );

  const handleDrop = useCallback(
    (targetId: string) => {
      const dragId = drag.dragging;
      if (!dragId || dragId === targetId) return;
      const targetNode = nodes.find((n) => n.id === targetId);
      if (!targetNode || targetNode.type !== "folder") return;
      const dragNode = nodes.find((n) => n.id === dragId);
      if (!dragNode) return;
      if (dragNode.type === "folder") {
        // Moving a folder — avoid moving to its own descendant
        storeMoveFolder(dragId, targetId === "root" ? null : targetId);
      } else {
        // Moving a dataset
        storeMoveDataset(dragId, targetId === "root" ? null : targetId);
      }
      setDrag({ dragging: null, over: null });
    },
    [drag.dragging, nodes, storeMoveFolder, storeMoveDataset],
  );

  const handleNewFolder = useCallback(() => {
    if (!newFolderName.trim()) return;
    const selectedNode = selected ? nodes.find((n) => n.id === selected) : null;
    const parentId =
      selectedNode?.type === "folder" && selected !== "root" ? selected : null;
    storeAddFolder({
      id: `folder-${Date.now()}`,
      name: newFolderName.trim(),
      parentId,
      starred: false,
    });
    setExpanded((prev) => {
      const s = new Set(prev);
      s.add(selected ?? "root");
      return s;
    });
    setNewFolderName("");
    setShowNewFolder(false);
  }, [newFolderName, selected, nodes, storeAddFolder]);

  // ── Derived / computed ────────────────────────────────────────────────────
  const currentFolder = useMemo(
    () => nodes.find((n) => n.id === selected),
    [nodes, selected],
  );

  const currentChildren = useMemo(() => {
    if (!selected || selected === "root")
      return nodes.filter((n) => n.parentId === "root");
    const node = nodes.find((n) => n.id === selected);
    if (node?.type === "folder")
      return nodes.filter((n) => n.parentId === selected);
    return [];
  }, [nodes, selected]);

  const filteredChildren = useMemo(() => {
    let list = [...currentChildren];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (n) =>
          n.name.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (typeFilter !== "all") list = list.filter((n) => n.type === typeFilter);
    list.sort((a, b) => {
      if (a.type === "folder" && b.type !== "folder") return -1;
      if (a.type !== "folder" && b.type === "folder") return 1;
      let va: number | string = 0,
        vb: number | string = 0;
      if (sortBy === "name") {
        va = a.name.toLowerCase();
        vb = b.name.toLowerCase();
      } else if (sortBy === "size") {
        va = a.size;
        vb = b.size;
      } else if (sortBy === "updated") {
        va = a.updatedAt.getTime();
        vb = b.updatedAt.getTime();
      } else if (sortBy === "quality") {
        va = a.quality ?? 0;
        vb = b.quality ?? 0;
      }
      if (typeof va === "string")
        return sortAsc
          ? va.localeCompare(String(vb))
          : String(vb).localeCompare(va);
      return sortAsc
        ? (va as number) - (vb as number)
        : (vb as number) - (va as number);
    });
    return list;
  }, [currentChildren, searchQuery, typeFilter, sortBy, sortAsc]);

  const starredNodes = useMemo(() => nodes.filter((n) => n.starred), [nodes]);
  const recentNodes = useMemo(
    () =>
      [...nodes]
        .filter((n) => n.type !== "folder")
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, 15),
    [nodes],
  );
  const fileNodes = useMemo(
    () => nodes.filter((n) => n.type !== "folder"),
    [nodes],
  );
  const totalSize = useMemo(
    () => fileNodes.reduce((s, n) => s + n.size, 0),
    [fileNodes],
  );
  const totalRows = useMemo(
    () => fileNodes.reduce((s, n) => s + (n.rowCount ?? 0), 0),
    [fileNodes],
  );

  const breadcrumb = useMemo(() => {
    const path: FSNode[] = [];
    let cur = selected ? nodes.find((n) => n.id === selected) : null;
    while (cur) {
      const parentId = cur.parentId;
      path.unshift(cur);
      cur = parentId ? (nodes.find((n) => n.id === parentId) ?? null) : null;
    }
    if (path.length === 0) {
      const root = nodes.find((n) => n.id === "root");
      if (root) path.push(root);
    }
    return path;
  }, [selected, nodes]);

  // ── Chart configs (theme-aware) ───────────────────────────────────────────
  const tooltipBg = isDark ? "#1e293b" : "#ffffff";
  const tooltipBorder = isDark ? "#334155" : "#e2e8f0";
  const tooltipText = isDark ? "#f1f5f9" : "#0f172a";
  const axisLabelColor = isDark ? "#94a3b8" : "#64748b";
  const splitLineColor = isDark ? "#1e293b" : "#f1f5f9";

  const storageChart = useMemo(() => {
    const rootFolders = nodes.filter(
      (n) => n.parentId === "root" && n.type === "folder",
    );
    const colorsMap: Record<string, string> = {};
    const palette = [
      "#6366f1",
      "#22c55e",
      "#f59e0b",
      "#ef4444",
      "#8b5cf6",
      "#3b82f6",
      "#10b981",
    ];
    rootFolders.forEach((f, i) => {
      colorsMap[f.id] = f.color ?? palette[i % palette.length];
    });
    // Add ungrouped (datasets directly on root)
    const ungroupedSize = datasets
      .filter((ds) => !datasetFolderMap[ds.id])
      .reduce((s, ds) => s + ds.sizeBytes, 0);
    const data = [
      ...rootFolders.map((f) => ({
        name: f.name,
        value: getFolderSize(f.id, nodes),
        itemStyle: { color: colorsMap[f.id] },
      })),
      ...(ungroupedSize > 0
        ? [
            {
              name: "Ungrouped",
              value: ungroupedSize,
              itemStyle: { color: "#64748b" },
            },
          ]
        : []),
    ].filter((d) => d.value > 0);
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: tooltipText },
        formatter: (p: { name: string; value: number }) =>
          `${p.name}: ${formatBytes(p.value)}`,
      },
      series: [
        {
          type: "pie",
          radius: ["45%", "72%"],
          data:
            data.length > 0
              ? data
              : [
                  {
                    name: "No data",
                    value: 1,
                    itemStyle: { color: "#475569" },
                  },
                ],
          label: { color: axisLabelColor, fontSize: 11 },
          emphasis: { itemStyle: { shadowBlur: 10 } },
        },
      ],
    };
  }, [
    nodes,
    datasets,
    datasetFolderMap,
    tooltipBg,
    tooltipBorder,
    tooltipText,
    axisLabelColor,
  ]);

  const fileTypeChart = useMemo(() => {
    const counts: Record<string, number> = {};
    fileNodes.forEach((n) => {
      counts[n.type] = (counts[n.type] ?? 0) + 1;
    });
    const typeColors: Record<string, string> = {
      csv: "#22c55e",
      json: "#3b82f6",
      excel: "#10b981",
      parquet: "#6366f1",
      duckdb: "#8b5cf6",
      sql: "#f97316",
    };
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: tooltipText },
      },
      grid: { top: 10, bottom: 20, left: 60, right: 10 },
      xAxis: {
        type: "value",
        axisLabel: { color: axisLabelColor },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      yAxis: {
        type: "category",
        data: Object.keys(counts),
        axisLabel: { color: axisLabelColor },
      },
      series: [
        {
          type: "bar",
          data: Object.values(counts),
          barMaxWidth: 18,
          itemStyle: {
            color: (p: { name: string }) => typeColors[p.name] ?? "#64748b",
          },
          label: {
            show: true,
            position: "right",
            color: axisLabelColor,
            fontSize: 10,
          },
        },
      ],
    };
  }, [
    fileNodes,
    tooltipBg,
    tooltipBorder,
    tooltipText,
    axisLabelColor,
    splitLineColor,
  ]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border p-4 shrink-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-linear-to-br from-yellow-500 to-orange-500 rounded-xl">
              <HardDrive className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Data Catalog
              </h1>
              <p className="text-sm text-muted-foreground">
                {fileNodes.length} files ·{" "}
                {
                  nodes.filter((n) => n.type === "folder" && n.id !== "root")
                    .length
                }{" "}
                folders · {formatBytes(totalSize)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/dashboard/upload")}
              className="flex items-center gap-2 px-3 py-2 bg-accent hover:bg-accent/80 rounded-lg text-sm text-foreground transition-colors"
            >
              <Upload className="w-4 h-4" /> Upload
            </button>
            <button
              type="button"
              onClick={() => setShowNewFolder(true)}
              className="flex items-center gap-2 px-3 py-2 bg-primary hover:bg-primary/90 rounded-lg text-sm text-primary-foreground transition-colors"
            >
              <FolderPlus className="w-4 h-4" /> New Folder
            </button>
            {(["tree-grid", "grid", "list"] as const).map((m) => {
              const icons = { "tree-grid": Layers, grid: Grid3x3, list: List };
              const Icon = icons[m];
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setViewMode(m)}
                  className={`p-2 rounded-lg transition-colors ${viewMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-1 mt-3 bg-card rounded-xl p-1 border border-border w-fit">
          {(["files", "starred", "recent", "stats"] as const).map((tab) => {
            const icons = {
              files: Folder,
              starred: Star,
              recent: Clock,
              stats: BarChart3,
            };
            const Icon = icons[tab];
            const cnts: Record<string, number> = {
              files: fileNodes.length,
              starred: starredNodes.length,
              recent: recentNodes.length,
              stats: 0,
            };
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
                {cnts[tab] > 0 && (
                  <span
                    className={`text-xs px-1 rounded-full ${activeTab === tab ? "bg-primary-foreground/20" : "bg-accent text-foreground"}`}
                  >
                    {cnts[tab]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* New folder modal */}
      <AnimatePresence>
        {showNewFolder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center"
            onClick={() => setShowNewFolder(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-card border border-border rounded-2xl p-6 w-80 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-yellow-400" /> New Folder
              </h3>
              <input
                type="text"
                placeholder="Folder name..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleNewFolder();
                  if (e.key === "Escape") setShowNewFolder(false);
                }}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary mb-3"
              />
              <p className="text-xs text-muted-foreground mb-4">
                Inside:{" "}
                <span className="text-foreground">
                  {currentFolder?.name ?? "My Datasets"}
                </span>
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewFolder(false)}
                  className="flex-1 py-2 bg-accent hover:bg-accent/80 rounded-lg text-sm text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleNewFolder}
                  disabled={!newFolderName.trim()}
                  className="flex-1 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 rounded-lg text-sm text-primary-foreground transition-colors"
                >
                  Create
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === "files" && (
            <motion.div
              key="files"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex overflow-hidden"
              onMouseUp={() => setDrag({ dragging: null, over: null })}
            >
              {(viewMode === "tree-grid" || viewMode === "list") && (
                <div className="w-64 xl:w-72 border-r border-border overflow-y-auto p-2 shrink-0">
                  <div className="text-xs text-muted-foreground px-2 py-1 mb-1">
                    FOLDERS
                  </div>
                  {nodes
                    .filter((n) => n.parentId === null)
                    .map((root) => (
                      <TreeNode
                        key={root.id}
                        node={root}
                        allNodes={nodes}
                        depth={0}
                        expanded={expanded}
                        selected={selected}
                        drag={drag}
                        onToggle={toggleExpand}
                        onSelect={handleSelect}
                        onDragStart={(id) =>
                          setDrag((d) => ({ ...d, dragging: id }))
                        }
                        onDragOver={(id) =>
                          setDrag((d) => ({ ...d, over: id }))
                        }
                        onDrop={handleDrop}
                        onStar={handleStar}
                      />
                    ))}
                </div>
              )}

              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-3 border-b border-border space-y-2 shrink-0">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
                    {breadcrumb.map((item, idx) => (
                      <span key={item.id} className="flex items-center gap-1">
                        {idx > 0 && <ChevronRight className="w-3 h-3" />}
                        <button
                          type="button"
                          onClick={() => handleSelect(item.id)}
                          className={`hover:text-foreground transition-colors ${idx === breadcrumb.length - 1 ? "text-foreground font-semibold" : ""}`}
                        >
                          {item.name}
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <div className="relative flex-1 min-w-32">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
                      />
                    </div>
                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                      className="px-2 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none"
                    >
                      {[
                        "all",
                        "folder",
                        "csv",
                        "json",
                        "excel",
                        "parquet",
                        "duckdb",
                        "sql",
                      ].map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-1">
                      {(["name", "size", "updated", "quality"] as const).map(
                        (s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => {
                              if (sortBy === s) setSortAsc(!sortAsc);
                              else {
                                setSortBy(s);
                                setSortAsc(true);
                              }
                            }}
                            className={`text-xs px-1.5 py-1 rounded ${sortBy === s ? "bg-primary/30 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                          >
                            {s}
                            {sortBy === s ? (sortAsc ? " ↑" : " ↓") : ""}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {filteredChildren.length} item(s)
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                  {filteredChildren.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-3">
                      <Folder className="w-10 h-10 opacity-20" />
                      <p className="text-sm">
                        {datasets.length === 0
                          ? "No datasets uploaded yet"
                          : "Empty folder"}
                      </p>
                      {datasets.length === 0 && (
                        <button
                          type="button"
                          onClick={() => router.push("/dashboard/upload")}
                          className="flex items-center gap-2 px-3 py-2 bg-primary hover:bg-primary/90 rounded-lg text-xs text-primary-foreground"
                        >
                          <Upload className="w-3.5 h-3.5" /> Upload your first
                          dataset
                        </button>
                      )}
                    </div>
                  ) : viewMode === "grid" ? (
                    <FileGrid
                      nodes={filteredChildren}
                      selected={selected}
                      onSelect={handleSelect}
                      onStar={handleStar}
                    />
                  ) : (
                    <div className="space-y-1">
                      {filteredChildren.map((node) => {
                        const style = fileTypeStyle(node.type);
                        const Icon =
                          node.type === "folder" ? Folder : style.icon;
                        return (
                          <motion.div
                            key={node.id}
                            layout
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            onClick={() => handleSelect(node.id)}
                            onDoubleClick={() => {
                              if (node.type === "folder") toggleExpand(node.id);
                            }}
                            className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-all group ${
                              selected === node.id
                                ? "bg-primary/15 border border-primary/30"
                                : "hover:bg-accent border border-transparent"
                            }`}
                          >
                            <Icon
                              className={`w-4 h-4 shrink-0 ${style.color}`}
                            />
                            <span className="flex-1 text-sm text-foreground truncate min-w-0">
                              {node.name}
                            </span>
                            {node.quality !== undefined && (
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{
                                  backgroundColor: qualityColor(node.quality),
                                }}
                              />
                            )}
                            {node.rowCount !== undefined && (
                              <span className="text-xs text-muted-foreground font-mono hidden sm:block">
                                {node.rowCount.toLocaleString()}r
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground font-mono hidden sm:block w-20 text-right">
                              {formatBytes(node.size)}
                            </span>
                            <span className="text-xs text-muted-foreground hidden md:block w-20 text-right">
                              {formatAge(node.updatedAt)}
                            </span>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {node.locked && (
                                <Lock className="w-3 h-3 text-muted-foreground" />
                              )}
                              {node.shared && (
                                <Globe className="w-3 h-3 text-blue-400" />
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStar(node.id);
                                }}
                                className="p-0.5 hover:text-yellow-400 text-muted-foreground"
                              >
                                <Star
                                  className={`w-3 h-3 ${node.starred ? "fill-yellow-400 text-yellow-400" : ""}`}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(node.id);
                                }}
                                className="p-0.5 hover:text-red-400 text-muted-foreground"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "starred" && (
            <motion.div
              key="starred"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 overflow-y-auto p-4"
            >
              <div className="mb-4 text-sm text-muted-foreground">
                {starredNodes.length} starred items
              </div>
              <FileGrid
                nodes={starredNodes}
                selected={selected}
                onSelect={handleSelect}
                onStar={handleStar}
              />
            </motion.div>
          )}

          {activeTab === "recent" && (
            <motion.div
              key="recent"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 overflow-y-auto p-4"
            >
              <div className="space-y-1">
                {recentNodes.map((node, idx) => {
                  const style = fileTypeStyle(node.type);
                  const Icon = style.icon;
                  return (
                    <motion.div
                      key={node.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      onClick={() => {
                        handleSelect(node.id);
                        setActiveTab("files");
                      }}
                      className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-border cursor-pointer transition-all"
                    >
                      <div className={`p-2 rounded-lg ${style.bg}`}>
                        <Icon className={`w-4 h-4 ${style.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-foreground truncate">
                          {node.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {node.rowCount
                            ? `${node.rowCount.toLocaleString()} rows · `
                            : ""}
                          {formatBytes(node.size)}
                        </div>
                      </div>
                      {node.quality !== undefined && (
                        <span
                          className="text-xs font-mono"
                          style={{ color: qualityColor(node.quality) }}
                        >
                          {(node.quality * 100).toFixed(0)}%
                        </span>
                      )}
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatAge(node.updatedAt)}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {activeTab === "stats" && (
            <motion.div
              key="stats"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 overflow-y-auto p-4 space-y-4"
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  {
                    label: "Total Files",
                    value: fileNodes.length,
                    icon: File,
                    color: "bg-blue-600",
                  },
                  {
                    label: "Total Folders",
                    value: nodes.filter(
                      (n) => n.type === "folder" && n.id !== "root",
                    ).length,
                    icon: Folder,
                    color: "bg-yellow-600",
                  },
                  {
                    label: "Total Size",
                    value: formatBytes(totalSize),
                    icon: HardDrive,
                    color: "bg-indigo-600",
                  },
                  {
                    label: "Total Rows",
                    value: totalRows.toLocaleString(),
                    icon: Hash,
                    color: "bg-green-600",
                  },
                ].map((s) => (
                  <motion.div
                    key={s.label}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-card border border-border rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">
                        {s.label}
                      </span>
                      <div className={`p-1.5 rounded-lg ${s.color}`}>
                        <s.icon className="w-3.5 h-3.5 text-white" />
                      </div>
                    </div>
                    <div className="text-xl font-bold text-foreground">
                      {s.value}
                    </div>
                  </motion.div>
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">
                    Storage by Folder
                  </h3>
                  <ReactECharts option={storageChart} style={{ height: 200 }} />
                </div>
                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">
                    Files by Type
                  </h3>
                  <ReactECharts
                    option={fileTypeChart}
                    style={{ height: 200 }}
                  />
                </div>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" /> Data
                  Quality by File
                </h3>
                <div className="space-y-2">
                  {fileNodes
                    .filter((n) => n.quality !== undefined)
                    .sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0))
                    .map((node) => {
                      const style = fileTypeStyle(node.type);
                      const Icon = style.icon;
                      return (
                        <div key={node.id} className="flex items-center gap-3">
                          <Icon
                            className={`w-3.5 h-3.5 shrink-0 ${style.color}`}
                          />
                          <span className="text-xs text-foreground w-36 truncate">
                            {node.name}
                          </span>
                          <div className="flex-1 h-2 bg-accent rounded-full overflow-hidden">
                            <motion.div
                              className="h-full rounded-full"
                              style={{
                                backgroundColor: qualityColor(
                                  node.quality ?? 0,
                                ),
                              }}
                              initial={{ width: 0 }}
                              animate={{
                                width: `${(node.quality ?? 0) * 100}%`,
                              }}
                              transition={{ duration: 0.7 }}
                            />
                          </div>
                          <span
                            className="text-xs font-mono w-10 text-right"
                            style={{ color: qualityColor(node.quality ?? 0) }}
                          >
                            {((node.quality ?? 0) * 100).toFixed(0)}%
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
