"use client";

/**
 * FoldersScreen — an advanced, File-Explorer-style catalog for datasets.
 *
 * Layout (Windows-Explorer inspired, app-token themed):
 *   [ overview strip ........................................ ]
 *   [ toolbar: breadcrumbs · search · sort · view toggle .... ]
 *   [ folder tree | content (folders + datasets) | details   ]
 *
 * Everything persists through the real Zustand stores:
 *   - folders-store: folders[], datasetFolderMap, starredDatasets + CRUD/move
 *   - data-store:    datasets[], setActiveDataset, removeDataset
 *
 * Interactions:
 *   - Click selects, double-click opens (folder → navigate, dataset → Browser).
 *   - Full folder CRUD: New (in current folder), inline Rename, Delete (confirm),
 *     Set color, Star.
 *   - HTML5 drag-and-drop: drag a dataset onto a folder → moveDataset; drag a
 *     folder onto another → moveFolder (cycle-guarded).
 *   - Right-click / kebab → context menu with dataset/folder actions, including
 *     "Open", "Open report", "Move to folder…", "Star", "Remove".
 *   - Opening apps uses the desktop `desktop:open-app` CustomEvent contract.
 *
 * The optional `initialFolderId` prop lets the desktop open the catalog directly
 * inside a folder (e.g. from a "reveal in catalog" action). Omitted/null = root.
 */

import {
  BarChart3,
  Check,
  ChevronRight,
  Database,
  Eye,
  FilePlus2,
  Folder,
  FolderPlus,
  Grid3x3,
  HardDrive,
  Layers,
  List,
  type LucideIcon,
  Palette,
  Pencil,
  Search,
  Sparkles,
  Star,
  Table2,
  Trash2,
  Upload,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { useDataStore } from "@/core/stores/data-store";
import { useFoldersStore } from "@/core/stores/folders-store";
import type { EChartsOption } from "@/platform/viz";
import { BulkActionBar } from "../components/BulkActionBar";
import { CatalogChart } from "../components/CatalogChart";
import { ContextMenu, type MenuItem } from "../components/ContextMenu";
import { DatasetPreview } from "../components/DatasetPreview";
import { ExplorerView } from "../components/ExplorerView";
import { FileGrid } from "../components/FileGrid";
import { FilterChips } from "../components/FilterChips";
import { FolderTree } from "../components/FolderTree";
import { RecentRail } from "../components/RecentRail";
import { useAutoOrganize } from "../hooks/useAutoOrganize";
import { useFolderIndex } from "../hooks/useFolderIndex";
import { useFolderNodes } from "../hooks/useFolderNodes";
import { useFolderSearch } from "../hooks/useFolderSearch";
import { type CatalogFilter, filterFileNodes, matchesFilter } from "../lib/catalog-filters";
import {
  breadcrumbPath,
  computeFolderSizes,
  flattenVisible,
  wouldCreateCycle,
} from "../lib/folderTree";
import { FOLDER_COLORS, fileTypeStyle, formatBytes, qualityColor } from "../lib/format";
import { askMoudirAbout, openDesktopApp } from "../lib/openApp";
import type { FSNode, SortKey } from "../types";

const ROOT_ID = "root";

interface FoldersScreenProps {
  /** Open directly inside this folder id (desktop "reveal in catalog"). */
  initialFolderId?: string | null;
}

interface MenuState {
  node: FSNode;
  x: number;
  y: number;
}

export default function FoldersScreen({ initialFolderId = null }: FoldersScreenProps = {}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // ── Stores (narrow selectors) ──────────────────────────────────────────────
  const datasets = useDataStore((s) => s.datasets);
  const removeDataset = useDataStore((s) => s.removeDataset);
  const setActiveDataset = useDataStore((s) => s.setActiveDataset);

  const datasetFolderMap = useFoldersStore((s) => s.datasetFolderMap);
  const storeAddFolder = useFoldersStore((s) => s.addFolder);
  const storeRemoveFolder = useFoldersStore((s) => s.removeFolder);
  const storeRenameFolder = useFoldersStore((s) => s.renameFolder);
  const storeStarFolder = useFoldersStore((s) => s.starFolder);
  const storeMoveFolder = useFoldersStore((s) => s.moveFolder);
  const storeMoveDataset = useFoldersStore((s) => s.moveDataset);
  const removeDatasetFromMap = useFoldersStore((s) => s.removeDatasetFromMap);
  const storeStarDataset = useFoldersStore((s) => s.starDataset);

  // ── Catalog → nodes + index ────────────────────────────────────────────────
  const nodes = useFolderNodes();
  const index = useFolderIndex(nodes);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState<Set<string>>(new Set([ROOT_ID]));
  const [selected, setSelected] = useState<string>(ROOT_ID);
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<FSNode | null>(null);

  // Catalogue additions: smart filter, bulk selection, dataset preview modal.
  const [activeFilter, setActiveFilter] = useState<CatalogFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);

  const organizer = useAutoOrganize();
  const searchMatchIds = useFolderSearch(nodes, searchQuery);

  // ── Apply initialFolderId once it resolves in the index ────────────────────
  const appliedInitial = useRef(false);
  useEffect(() => {
    if (appliedInitial.current) return;
    if (!initialFolderId) {
      appliedInitial.current = true;
      return;
    }
    const node = index.byId.get(initialFolderId);
    if (node?.type === "folder") {
      setSelected(initialFolderId);
      // Expand the ancestor chain so the tree reveals it.
      setExpanded((prev) => {
        const next = new Set(prev);
        let cur: string | null = initialFolderId;
        const seen = new Set<string>();
        while (cur && !seen.has(cur)) {
          seen.add(cur);
          next.add(cur);
          cur = index.byId.get(cur)?.parentId ?? null;
        }
        next.add(ROOT_ID);
        return next;
      });
      appliedInitial.current = true;
    }
  }, [initialFolderId, index]);

  // rAF-throttled drag-over to avoid a re-render storm.
  const dragOverPending = useRef<string | null>(null);
  const dragOverRaf = useRef(0);
  const scheduleDragOver = useCallback((id: string | null) => {
    dragOverPending.current = id;
    if (dragOverRaf.current) return;
    dragOverRaf.current = requestAnimationFrame(() => {
      dragOverRaf.current = 0;
      setDragOver(dragOverPending.current);
    });
  }, []);
  useEffect(
    () => () => {
      if (dragOverRaf.current) cancelAnimationFrame(dragOverRaf.current);
    },
    [],
  );

  // ── Derived data ────────────────────────────────────────────────────────────
  const fileNodes = useMemo(() => nodes.filter((n) => n.type !== "folder"), [nodes]);
  const starredNodes = useMemo(() => nodes.filter((n) => n.starred), [nodes]);
  const folderNodes = useMemo(
    () => nodes.filter((n) => n.type === "folder" && n.id !== ROOT_ID),
    [nodes],
  );
  const totalSize = useMemo(() => fileNodes.reduce((s, n) => s + n.size, 0), [fileNodes]);
  const totalRows = useMemo(
    () => fileNodes.reduce((s, n) => s + (n.rowCount ?? 0), 0),
    [fileNodes],
  );

  const childCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const [parentId, children] of index.childrenOf.entries()) {
      if (parentId != null) m.set(parentId, children.length);
    }
    return m;
  }, [index]);

  const folderSizes = useMemo(() => computeFolderSizes(index, ROOT_ID), [index]);

  const treeRows = useMemo(() => flattenVisible(index, [ROOT_ID], expanded), [index, expanded]);

  const breadcrumb = useMemo(() => breadcrumbPath(index, selected), [index, selected]);

  const currentFolder = index.byId.get(selected);

  const currentChildren = useMemo(() => {
    const parentId = selected || ROOT_ID;
    return index.childrenOf.get(parentId) ?? [];
  }, [index, selected]);

  const filterCtx = useMemo(
    () => ({
      isUnclassified: (id: string) => !datasetFolderMap[id],
      now: Date.now(),
    }),
    [datasetFolderMap],
  );

  const filteredChildren = useMemo(() => {
    // A non-"all" chip surfaces matching datasets across the WHOLE catalogue
    // (flat); "all" keeps the normal folder-scoped view.
    let list =
      activeFilter === "all"
        ? currentChildren
        : filterFileNodes(fileNodes, activeFilter, filterCtx);
    if (searchMatchIds) list = list.filter((n) => searchMatchIds.has(n.id));
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (a.type === "folder" && b.type !== "folder") return -1;
      if (a.type !== "folder" && b.type === "folder") return 1;
      let va: number | string = 0;
      let vb: number | string = 0;
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
        return sortAsc ? va.localeCompare(String(vb)) : String(vb).localeCompare(va);
      return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return sorted;
  }, [currentChildren, fileNodes, activeFilter, filterCtx, searchMatchIds, sortBy, sortAsc]);

  const ungroupedCount = useMemo(
    () => fileNodes.filter((n) => !datasetFolderMap[n.id]).length,
    [fileNodes, datasetFolderMap],
  );

  // Catalogue additions — derived data.
  const filterCounts = useMemo(() => {
    const counts: Partial<Record<CatalogFilter, number>> = {};
    for (const f of ["csv", "parquet", "unclassified", "low-quality", "recent"] as const) {
      counts[f] = fileNodes.filter((n) => matchesFilter(n, f, filterCtx)).length;
    }
    return counts;
  }, [fileNodes, filterCtx]);

  const recentNodes = useMemo(
    () =>
      [...fileNodes]
        .sort(
          (a, b) =>
            Math.max(b.createdAt.getTime(), b.updatedAt.getTime()) -
            Math.max(a.createdAt.getTime(), a.updatedAt.getTime()),
        )
        .slice(0, 6),
    [fileNodes],
  );

  const previewDataset = useMemo(
    () => (previewId ? (datasets.find((d) => d.id === previewId) ?? null) : null),
    [previewId, datasets],
  );

  const bulkFolders = useMemo(
    () => folderNodes.map((f) => ({ id: f.id, name: f.name })),
    [folderNodes],
  );

  // ── Handlers: navigation / selection ───────────────────────────────────────
  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelected(id);
  }, []);

  const navigateInto = useCallback(
    (node: FSNode) => {
      if (node.type === "folder") {
        setSelected(node.id);
        setExpanded((prev) => new Set(prev).add(node.id));
      } else {
        // Open dataset in the Data Browser (frozen, shared store).
        setActiveDataset(node.id);
        openDesktopApp("data-browser");
      }
    },
    [setActiveDataset],
  );

  // ── Handlers: store mutations ──────────────────────────────────────────────
  const handleStar = useCallback(
    (id: string) => {
      const node = index.byId.get(id);
      if (!node) return;
      if (node.type === "folder" && id !== ROOT_ID) storeStarFolder(id);
      else if (node.type !== "folder") storeStarDataset(id);
    },
    [index, storeStarFolder, storeStarDataset],
  );

  const handleCreateFolder = useCallback(() => {
    const name = newFolderName.trim();
    if (!name) return;
    const parentId = currentFolder?.type === "folder" && selected !== ROOT_ID ? selected : null;
    storeAddFolder({
      id: `folder-${Date.now()}-${Math.round(performance.now())}`,
      name,
      parentId,
      starred: false,
      color: "#1E40AF",
    });
    setExpanded((prev) => new Set(prev).add(selected));
    setNewFolderName("");
    setShowNewFolder(false);
  }, [newFolderName, currentFolder, selected, storeAddFolder]);

  const beginRename = useCallback((node: FSNode) => {
    setRenamingId(node.id);
    setRenameValue(node.name);
  }, []);

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      storeRenameFolder(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  }, [renamingId, renameValue, storeRenameFolder]);

  // folders-store has no setColor, so update colour directly through the store's
  // raw setter (moveFolder/rename only touch their fields). We patch via a
  // dedicated zustand setState call to keep persistence intact.
  const setFolderColorById = useCallback((id: string, color: string) => {
    useFoldersStore.setState((s) => ({
      folders: s.folders.map((f) => (f.id === id ? { ...f, color } : f)),
    }));
  }, []);

  const performDelete = useCallback(
    (node: FSNode) => {
      if (node.id === ROOT_ID) return;
      if (node.type === "folder") {
        // Datasets inside reflow to root via the store; we keep them in the
        // catalog (do NOT delete the datasets themselves).
        storeRemoveFolder(node.id);
      } else {
        removeDataset(node.id);
        removeDatasetFromMap(node.id);
      }
      if (selected === node.id) setSelected(node.parentId ?? ROOT_ID);
    },
    [storeRemoveFolder, removeDataset, removeDatasetFromMap, selected],
  );

  // ── Bulk selection + preview + quick actions ───────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const bulkMove = useCallback(
    (folderId: string | null) => {
      for (const id of selectedIds) storeMoveDataset(id, folderId);
      clearSelection();
    },
    [selectedIds, storeMoveDataset, clearSelection],
  );

  const bulkStar = useCallback(() => {
    for (const id of selectedIds) storeStarDataset(id);
    clearSelection();
  }, [selectedIds, storeStarDataset, clearSelection]);

  const bulkRemove = useCallback(() => {
    for (const id of selectedIds) {
      removeDataset(id);
      removeDatasetFromMap(id);
    }
    clearSelection();
  }, [selectedIds, removeDataset, removeDatasetFromMap, clearSelection]);

  const closePreview = useCallback(() => setPreviewId(null), []);

  const openInExplorer = useCallback(
    (id: string) => {
      setActiveDataset(id);
      openDesktopApp("data-browser");
    },
    [setActiveDataset],
  );

  /** Switch the smart filter; cross-view selections would be confusing, so clear them. */
  const changeFilter = useCallback((filter: CatalogFilter) => {
    setActiveFilter(filter);
    setSelectedIds(new Set());
  }, []);

  // ── Drag and drop ──────────────────────────────────────────────────────────
  const handleDrop = useCallback(
    (targetId: string) => {
      const dragId = dragging;
      setDragging(null);
      setDragOver(null);
      if (!dragId || dragId === targetId) return;
      const targetNode = index.byId.get(targetId);
      if (targetNode?.type !== "folder") return;
      const dragNode = index.byId.get(dragId);
      if (!dragNode) return;
      const newParent = targetId === ROOT_ID ? null : targetId;
      if (dragNode.type === "folder") {
        if (wouldCreateCycle(index, dragId, newParent)) return;
        storeMoveFolder(dragId, newParent);
      } else {
        storeMoveDataset(dragId, newParent);
      }
    },
    [dragging, index, storeMoveFolder, storeMoveDataset],
  );

  // ── Context menu builders ──────────────────────────────────────────────────
  const moveSubmenu = useCallback(
    (node: FSNode): MenuItem[] => {
      const targets: MenuItem[] = [
        {
          id: "move-root",
          label: "Tous les fichiers (racine)",
          icon: HardDrive,
          onSelect: () =>
            node.type === "folder"
              ? !wouldCreateCycle(index, node.id, null) && storeMoveFolder(node.id, null)
              : storeMoveDataset(node.id, null),
        },
        ...folderNodes
          .filter((f) => f.id !== node.id)
          .filter((f) => node.type !== "folder" || !wouldCreateCycle(index, node.id, f.id))
          .map((f) => ({
            id: `move-${f.id}`,
            label: f.name,
            icon: Folder,
            onSelect: () =>
              node.type === "folder"
                ? storeMoveFolder(node.id, f.id)
                : storeMoveDataset(node.id, f.id),
          })),
      ];
      return targets;
    },
    [folderNodes, index, storeMoveFolder, storeMoveDataset],
  );

  const colorSubmenu = useCallback(
    (node: FSNode): MenuItem[] =>
      FOLDER_COLORS.map((c) => ({
        id: `color-${c.value}`,
        label: c.name,
        onSelect: () => setFolderColorById(node.id, c.value),
        accessory: (
          <span className="flex items-center gap-1.5">
            <span
              className="h-3.5 w-3.5 rounded-full border border-border"
              style={{ backgroundColor: c.value }}
            />
            {node.color === c.value && <Check className="h-3.5 w-3.5 text-primary" />}
          </span>
        ),
      })),
    [setFolderColorById],
  );

  const menuItems = useMemo<MenuItem[]>(() => {
    if (!menu) return [];
    const node = menu.node;
    if (node.type === "folder") {
      const isRoot = node.id === ROOT_ID;
      return [
        {
          id: "open",
          label: "Ouvrir",
          icon: FolderPlus,
          onSelect: () => navigateInto(node),
        },
        {
          id: "rename",
          label: "Renommer",
          icon: Pencil,
          disabled: isRoot,
          onSelect: () => beginRename(node),
        },
        {
          id: "color",
          label: "Couleur",
          icon: Palette,
          disabled: isRoot,
          submenu: colorSubmenu(node),
        },
        {
          id: "star",
          label: node.starred ? "Retirer l'étoile" : "Mettre en avant",
          icon: Star,
          disabled: isRoot,
          onSelect: () => handleStar(node.id),
        },
        {
          id: "move",
          label: "Déplacer vers…",
          icon: Folder,
          disabled: isRoot,
          submenu: moveSubmenu(node),
        },
        {
          id: "delete",
          label: "Supprimer le dossier",
          icon: Trash2,
          danger: true,
          disabled: isRoot,
          separator: true,
          onSelect: () => setConfirmDelete(node),
        },
      ];
    }
    // Dataset menu
    return [
      {
        id: "preview",
        label: "Aperçu",
        icon: Eye,
        onSelect: () => setPreviewId(node.id),
      },
      {
        id: "open",
        label: "Ouvrir dans l'explorateur",
        icon: Table2,
        onSelect: () => {
          setActiveDataset(node.id);
          openDesktopApp("data-browser");
        },
      },
      {
        id: "report",
        label: "Ouvrir le rapport (analytique figée)",
        icon: BarChart3,
        onSelect: () => {
          setActiveDataset(node.id);
          openDesktopApp("telecom");
        },
      },
      {
        id: "star",
        label: node.starred ? "Retirer l'étoile" : "Mettre en avant",
        icon: Star,
        onSelect: () => handleStar(node.id),
      },
      {
        id: "move",
        label: "Déplacer vers…",
        icon: Folder,
        submenu: moveSubmenu(node),
      },
      {
        id: "remove",
        label: "Retirer du catalogue",
        icon: Trash2,
        danger: true,
        separator: true,
        onSelect: () => setConfirmDelete(node),
      },
    ];
  }, [menu, navigateInto, beginRename, colorSubmenu, handleStar, moveSubmenu, setActiveDataset]);

  const openContextMenu = useCallback((node: FSNode, x: number, y: number) => {
    setMenu({ node, x, y });
  }, []);

  // ── AI auto-organize ───────────────────────────────────────────────────────
  const handleAutoOrganize = useCallback(async () => {
    const plan = await organizer.organize();
    if (plan && plan.groups.length > 0) {
      const applied = organizer.applyPlan(plan);
      if (applied > 0) setExpanded((prev) => new Set(prev).add(ROOT_ID));
    }
  }, [organizer]);

  // ── Storage-by-folder chart (theme aware) ──────────────────────────────────
  const axisLabelColor = isDark ? "#94a3b8" : "#64748b";
  const storageChart = useMemo<EChartsOption>(() => {
    const rootFolders = (index.childrenOf.get(ROOT_ID) ?? []).filter((n) => n.type === "folder");
    const palette = ["#1E40AF", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#10b981", "#a855f7"];
    const ungroupedSize = (index.childrenOf.get(ROOT_ID) ?? [])
      .filter((n) => n.type !== "folder")
      .reduce((s, n) => s + n.size, 0);
    const data = [
      ...rootFolders.map((f, i) => ({
        name: f.name,
        value: folderSizes.get(f.id) ?? 0,
        itemStyle: { color: f.color ?? palette[i % palette.length] },
      })),
      ...(ungroupedSize > 0
        ? [
            {
              name: "Non classés",
              value: ungroupedSize,
              itemStyle: { color: "#64748b" },
            },
          ]
        : []),
    ].filter((d) => d.value > 0);

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item" as const,
        valueFormatter: (v: number | string) => formatBytes(Number(v)),
      },
      series: [
        {
          type: "pie" as const,
          radius: ["45%", "72%"],
          center: ["50%", "50%"],
          data:
            data.length > 0
              ? data
              : [
                  {
                    name: "Aucune donnée",
                    value: 1,
                    itemStyle: { color: "#475569" },
                  },
                ],
          label: { color: axisLabelColor, fontSize: 11 },
          emphasis: { itemStyle: { shadowBlur: 10 } },
        },
      ],
    } as unknown as EChartsOption;
  }, [index, folderSizes, axisLabelColor]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const overview: { label: string; value: string; icon: LucideIcon; tint: string }[] = [
    {
      label: "Jeux de données",
      value: fileNodes.length.toLocaleString("fr-FR"),
      icon: Database,
      tint: "text-blue-500",
    },
    {
      label: "Lignes totales",
      value: totalRows.toLocaleString("fr-FR"),
      icon: Layers,
      tint: "text-green-500",
    },
    {
      label: "Dossiers",
      value: folderNodes.length.toLocaleString("fr-FR"),
      icon: Folder,
      tint: "text-amber-500",
    },
    {
      label: "En favoris",
      value: starredNodes.length.toLocaleString("fr-FR"),
      icon: Star,
      tint: "text-yellow-500",
    },
  ];

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* Header */}
      <header className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-primary to-primary/70 p-2">
              <HardDrive className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Catalogue de données</h1>
              <p className="text-sm text-muted-foreground">
                {fileNodes.length} jeux · {folderNodes.length} dossiers · {formatBytes(totalSize)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openDesktopApp("data-browser")}
              className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm transition-colors hover:bg-accent/80"
            >
              <Upload className="h-4 w-4" /> Importer
            </button>
            <button
              type="button"
              onClick={handleAutoOrganize}
              disabled={organizer.running || ungroupedCount === 0}
              title={
                ungroupedCount === 0
                  ? "Tout est déjà organisé"
                  : `Classer ${ungroupedCount} jeu(x) non classé(s) avec l'IA`
              }
              className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm transition-colors hover:bg-accent/80 disabled:opacity-50"
            >
              <Sparkles
                className={`h-4 w-4 ${organizer.running ? "animate-pulse text-primary" : ""}`}
              />
              {organizer.running ? "Classement…" : "Auto-classer"}
            </button>
            <button
              type="button"
              onClick={() => {
                setNewFolderName("");
                setShowNewFolder(true);
              }}
              className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <FolderPlus className="h-4 w-4" /> Nouveau dossier
            </button>
          </div>
        </div>

        {organizer.error && <div className="mt-2 text-xs text-amber-500">{organizer.error}</div>}

        {/* Overview strip */}
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {overview.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2"
            >
              <s.icon className={`h-5 w-5 shrink-0 ${s.tint}`} />
              <div className="min-w-0">
                <div className="truncate text-lg font-bold leading-tight">{s.value}</div>
                <div className="truncate text-xs text-muted-foreground">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </header>

      {/* Body: tree | content | details */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: folder tree */}
        <aside className="flex w-60 shrink-0 flex-col border-r border-border xl:w-64">
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Dossiers
          </div>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: drag-release surface clears DnD state; keyboard moves use the context menu. */}
          <div
            className="min-h-0 flex-1 px-2 pb-2"
            onMouseUp={() => {
              setDragging(null);
              setDragOver(null);
            }}
          >
            <FolderTree
              rows={treeRows}
              selected={selected}
              dragOver={dragOver}
              dragging={dragging}
              onToggle={toggleExpand}
              onSelect={handleSelect}
              onStar={handleStar}
              onDragStart={setDragging}
              onDragOver={scheduleDragOver}
              onDrop={handleDrop}
            />
          </div>
        </aside>

        {/* Center: content */}
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="shrink-0 space-y-2 border-b border-border p-3">
            <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {breadcrumb.map((item, idx) => (
                <span key={item.id} className="flex items-center gap-1">
                  {idx > 0 && <ChevronRight className="h-3 w-3" />}
                  <button
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className={`rounded px-1 py-0.5 transition-colors hover:bg-accent hover:text-foreground ${
                      idx === breadcrumb.length - 1 ? "font-semibold text-foreground" : ""
                    }`}
                  >
                    {item.id === ROOT_ID ? "Tous les fichiers" : item.name}
                  </button>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-40 flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Rechercher dossiers et jeux…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card py-1.5 pl-8 pr-3 text-sm placeholder-muted-foreground focus:border-primary focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-1">
                {(["name", "size", "updated", "quality"] as const).map((s) => {
                  const labels: Record<SortKey, string> = {
                    name: "Nom",
                    size: "Taille",
                    updated: "Modifié",
                    quality: "Qualité",
                  };
                  return (
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
                      className={`rounded px-1.5 py-1 text-xs transition-colors ${
                        sortBy === s
                          ? "bg-primary/20 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {labels[s]}
                      {sortBy === s ? (sortAsc ? " ↑" : " ↓") : ""}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
                {(
                  [
                    ["grid", Grid3x3],
                    ["list", List],
                  ] as const
                ).map(([mode, Icon]) => (
                  <button
                    key={mode}
                    type="button"
                    aria-label={mode}
                    onClick={() => setLayout(mode)}
                    className={`rounded-md p-1.5 transition-colors ${
                      layout === mode
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
            <FilterChips active={activeFilter} counts={filterCounts} onChange={changeFilter} />
            <div className="text-xs text-muted-foreground">
              {activeFilter === "all"
                ? `${filteredChildren.length} élément${filteredChildren.length === 1 ? "" : "s"}`
                : `${filteredChildren.length} résultat${
                    filteredChildren.length === 1 ? "" : "s"
                  } · tout le catalogue`}
            </div>
          </div>

          {/* Drop-to-root surface + items */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: explorer surface accepts drops to move items to the current folder; keyboard moves are done via the context menu. */}
          <div
            className="min-h-0 flex-1 p-3"
            onMouseUp={() => {
              setDragging(null);
              setDragOver(null);
            }}
            onDragOver={(e) => {
              // Allow dropping on empty background → drop into current folder.
              e.preventDefault();
            }}
            onDrop={(e) => {
              if (e.target === e.currentTarget) handleDrop(selected);
            }}
          >
            {filteredChildren.length === 0 ? (
              <EmptyState
                hasDatasets={datasets.length > 0}
                searching={!!searchMatchIds}
                onImport={() => openDesktopApp("data-browser")}
                onNewFolder={() => setShowNewFolder(true)}
              />
            ) : (
              <ExplorerView
                nodes={filteredChildren}
                selected={selected}
                dragOver={dragOver}
                dragging={dragging}
                layout={layout}
                childCounts={childCounts}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onOpen={navigateInto}
                onSelect={handleSelect}
                onStar={handleStar}
                onContextMenu={openContextMenu}
                onDragStart={setDragging}
                onDragOverFolder={scheduleDragOver}
                onDropOnFolder={handleDrop}
              />
            )}
          </div>
        </section>

        {/* Right: details / overview */}
        <aside className="hidden w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border p-3 xl:flex">
          <DetailsPanel
            node={currentFolder}
            childCount={
              currentFolder?.type === "folder"
                ? (childCounts.get(currentFolder.id) ?? 0)
                : undefined
            }
            folderSize={
              currentFolder?.type === "folder"
                ? (folderSizes.get(currentFolder.id) ?? 0)
                : undefined
            }
            onOpen={navigateInto}
            onStar={handleStar}
            onRename={beginRename}
            onPreview={setPreviewId}
          />
          <RecentRail
            nodes={recentNodes}
            onPreview={(n) => setPreviewId(n.id)}
            onOpen={(n) => openInExplorer(n.id)}
          />
          <div className="rounded-xl border border-border bg-card p-3">
            <h3 className="mb-2 text-sm font-semibold">Stockage par dossier</h3>
            <CatalogChart option={storageChart} height={180} />
          </div>
          {starredNodes.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-3">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Star className="h-3.5 w-3.5 text-yellow-400" /> Favoris
              </h3>
              <div className="h-48">
                <FileGrid
                  nodes={starredNodes.filter((n) => n.type !== "folder")}
                  selected={selected}
                  onSelect={handleSelect}
                  onStar={handleStar}
                />
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Inline rename overlay (anchored modal — simple + robust) */}
      <AnimatePresence>
        {renamingId && (
          <Overlay onClose={() => setRenamingId(null)}>
            <h3 className="mb-3 flex items-center gap-2 text-lg font-bold">
              <Pencil className="h-5 w-5 text-amber-500" /> Renommer
            </h3>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setRenamingId(null);
              }}
              // biome-ignore lint/a11y/noAutofocus: modal focus on open is expected UX
              autoFocus
              className="mb-4 w-full rounded-lg border border-border bg-muted px-3 py-2 placeholder-muted-foreground focus:border-primary focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRenamingId(null)}
                className="flex-1 rounded-lg bg-accent py-2 text-sm transition-colors hover:bg-accent/80"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={commitRename}
                disabled={!renameValue.trim()}
                className="flex-1 rounded-lg bg-primary py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                Renommer
              </button>
            </div>
          </Overlay>
        )}
      </AnimatePresence>

      {/* New folder overlay */}
      <AnimatePresence>
        {showNewFolder && (
          <Overlay onClose={() => setShowNewFolder(false)}>
            <h3 className="mb-3 flex items-center gap-2 text-lg font-bold">
              <FolderPlus className="h-5 w-5 text-primary" /> Nouveau dossier
            </h3>
            <input
              type="text"
              placeholder="Nom du dossier…"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
                if (e.key === "Escape") setShowNewFolder(false);
              }}
              // biome-ignore lint/a11y/noAutofocus: modal focus on open is expected UX
              autoFocus
              className="mb-2 w-full rounded-lg border border-border bg-muted px-3 py-2 placeholder-muted-foreground focus:border-primary focus:outline-none"
            />
            <p className="mb-4 text-xs text-muted-foreground">
              Dans :{" "}
              <span className="text-foreground">
                {selected === ROOT_ID
                  ? "Tous les fichiers"
                  : (currentFolder?.name ?? "Tous les fichiers")}
              </span>
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowNewFolder(false)}
                className="flex-1 rounded-lg bg-accent py-2 text-sm transition-colors hover:bg-accent/80"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="flex-1 rounded-lg bg-primary py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                Créer
              </button>
            </div>
          </Overlay>
        )}
      </AnimatePresence>

      {/* Delete confirm overlay */}
      <AnimatePresence>
        {confirmDelete && (
          <Overlay onClose={() => setConfirmDelete(null)}>
            <h3 className="mb-2 flex items-center gap-2 text-lg font-bold">
              <Trash2 className="h-5 w-5 text-red-500" />
              {confirmDelete.type === "folder" ? "Supprimer le dossier" : "Retirer du catalogue"}
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              {confirmDelete.type === "folder" ? (
                <>
                  Supprimer « <span className="text-foreground">{confirmDelete.name}</span> » ? Les
                  jeux de données qu'il contient seront déplacés vers la racine (ils ne sont pas
                  supprimés).
                </>
              ) : (
                <>
                  Retirer « <span className="text-foreground">{confirmDelete.name}</span> » du
                  catalogue ?
                </>
              )}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-lg bg-accent py-2 text-sm transition-colors hover:bg-accent/80"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  performDelete(confirmDelete);
                  setConfirmDelete(null);
                }}
                className="flex-1 rounded-lg bg-red-500 py-2 text-sm text-white transition-colors hover:bg-red-500/90"
              >
                {confirmDelete.type === "folder" ? "Supprimer" : "Retirer"}
              </button>
            </div>
          </Overlay>
        )}
      </AnimatePresence>

      {/* Context menu */}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}

      {/* Dataset preview ("review of the file") with open-in-Explorer + quick actions */}
      {previewDataset && (
        <DatasetPreview
          dataset={previewDataset}
          onClose={closePreview}
          onOpenExplorer={() => {
            openInExplorer(previewDataset.id);
            closePreview();
          }}
          onProfile={() => {
            setActiveDataset(previewDataset.id);
            openDesktopApp("parsed");
            closePreview();
          }}
          onTransform={() => {
            setActiveDataset(previewDataset.id);
            openDesktopApp("transform");
            closePreview();
          }}
          onAskMoudir={() => {
            askMoudirAbout(previewDataset.name);
            closePreview();
          }}
        />
      )}

      {/* Bulk action bar (multi-selected datasets) */}
      <BulkActionBar
        count={selectedIds.size}
        folders={bulkFolders}
        onMove={bulkMove}
        onStar={bulkStar}
        onRemove={bulkRemove}
        onClear={clearSelection}
      />

      {/* Auto-organize toast */}
      <AnimatePresence>
        {organizer.running && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-4 right-4 z-[120] flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-2xl"
          >
            <Sparkles className="h-4 w-4 animate-pulse text-primary" />
            <div className="text-sm">
              Classement des jeux de données…
              {organizer.progress?.message ? (
                <span className="text-muted-foreground"> {organizer.progress.message}</span>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.94, opacity: 0 }}
        className="w-80 rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function EmptyState({
  hasDatasets,
  searching,
  onImport,
  onNewFolder,
}: {
  hasDatasets: boolean;
  searching: boolean;
  onImport: () => void;
  onNewFolder: () => void;
}) {
  if (searching) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
        <Search className="h-9 w-9 opacity-20" />
        <p className="text-sm">Aucun résultat pour cette recherche.</p>
      </div>
    );
  }
  if (!hasDatasets) {
    return (
      <div className="flex h-56 flex-col items-center justify-center gap-3 text-muted-foreground">
        <Database className="h-10 w-10 opacity-20" />
        <p className="text-sm">Aucun jeu de données pour l'instant.</p>
        <button
          type="button"
          onClick={onImport}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground hover:bg-primary/90"
        >
          <Upload className="h-3.5 w-3.5" /> Importer un jeu de données
        </button>
      </div>
    );
  }
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-3 text-muted-foreground">
      <Folder className="h-10 w-10 opacity-20" />
      <p className="text-sm">Ce dossier est vide.</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onNewFolder}
          className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs hover:bg-accent/80"
        >
          <FolderPlus className="h-3.5 w-3.5" /> Sous-dossier
        </button>
        <button
          type="button"
          onClick={onImport}
          className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs hover:bg-accent/80"
        >
          <FilePlus2 className="h-3.5 w-3.5" /> Ajouter des données
        </button>
      </div>
    </div>
  );
}

function DetailsPanel({
  node,
  childCount,
  folderSize,
  onOpen,
  onStar,
  onRename,
  onPreview,
}: {
  node: FSNode | undefined;
  childCount?: number;
  folderSize?: number;
  onOpen: (node: FSNode) => void;
  onStar: (id: string) => void;
  onRename: (node: FSNode) => void;
  onPreview?: (id: string) => void;
}) {
  if (!node) {
    return (
      <div className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
        Sélectionnez un élément pour voir ses détails.
      </div>
    );
  }
  const isFolder = node.type === "folder";
  const style = fileTypeStyle(node.type);
  const Icon = isFolder ? Folder : style.icon;
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-3 flex items-start gap-3">
        <div
          className={`rounded-lg p-2 ${isFolder ? "" : style.bg}`}
          style={isFolder ? { backgroundColor: `${node.color ?? "#1E40AF"}1f` } : undefined}
        >
          <Icon
            className={`h-6 w-6 ${isFolder ? "" : style.color}`}
            style={isFolder ? { color: node.color ?? "#1E40AF" } : undefined}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="break-words text-sm font-semibold">{node.name}</div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {isFolder ? "Dossier" : node.type}
          </div>
        </div>
      </div>
      <dl className="space-y-1.5 text-xs">
        {isFolder ? (
          <>
            <Row label="Éléments" value={`${childCount ?? 0}`} />
            <Row label="Taille" value={formatBytes(folderSize ?? 0)} />
          </>
        ) : (
          <>
            {node.rowCount !== undefined && (
              <Row label="Lignes" value={node.rowCount.toLocaleString("fr-FR")} />
            )}
            {node.colCount !== undefined && <Row label="Colonnes" value={`${node.colCount}`} />}
            <Row label="Taille" value={formatBytes(node.size)} />
            {node.quality !== undefined && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Qualité</dt>
                <dd className="font-mono" style={{ color: qualityColor(node.quality) }}>
                  {(node.quality * 100).toFixed(0)}%
                </dd>
              </div>
            )}
          </>
        )}
        <Row label="Modifié" value={node.updatedAt.toLocaleDateString("fr-FR")} />
      </dl>
      {node.id !== ROOT_ID && (
        <div className="mt-3 flex gap-2">
          {!isFolder && onPreview && (
            <button
              type="button"
              onClick={() => onPreview(node.id)}
              className="flex-1 rounded-lg bg-accent px-2 py-1.5 text-xs text-foreground hover:bg-accent/80"
            >
              Aperçu
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpen(node)}
            className="flex-1 rounded-lg bg-primary px-2 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
          >
            Ouvrir
          </button>
          <button
            type="button"
            onClick={() => onStar(node.id)}
            aria-label="Étoile"
            className="rounded-lg bg-accent px-2 py-1.5 text-muted-foreground hover:text-yellow-400"
          >
            <Star className={`h-4 w-4 ${node.starred ? "fill-yellow-400 text-yellow-400" : ""}`} />
          </button>
          {isFolder && (
            <button
              type="button"
              onClick={() => onRename(node)}
              aria-label="Renommer"
              className="rounded-lg bg-accent px-2 py-1.5 text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
