"use client";

/**
 * ExplorerView — the main content pane of the file explorer.
 *
 * Renders the selected folder's children (subfolders first, then datasets) as
 * either a tile grid or a detail list, File-Explorer style. Every item is:
 *  - draggable (HTML5 DnD) carrying its node id,
 *  - a drop target when it is a folder (accepts datasets and other folders),
 *  - double-click to open (folder → navigate, dataset → Data Browser),
 *  - right-click / kebab → context menu of actions.
 *
 * It is intentionally NOT virtualized: a single folder's child count is small,
 * and the rich per-item DnD + context affordances matter more here than the
 * giant-list performance the tree/flat views optimize for. The left tree and
 * the starred/recent tabs still use the virtualized FolderTree/FileGrid.
 */

import { Check, Folder, FolderOpen, MoreVertical, Star } from "lucide-react";
import { memo, useCallback } from "react";
import { fileTypeStyle, formatAge, formatBytes, qualityColor } from "../lib/format";
import type { FSNode } from "../types";

const ROOT_ID = "root";

interface ExplorerItemHandlers {
  onOpen: (node: FSNode) => void;
  onSelect: (id: string) => void;
  onStar: (id: string) => void;
  onContextMenu: (node: FSNode, x: number, y: number) => void;
  onDragStart: (id: string) => void;
  onDragOverFolder: (id: string | null) => void;
  onDropOnFolder: (id: string) => void;
}

interface TileProps extends ExplorerItemHandlers {
  node: FSNode;
  isSelected: boolean;
  isDragOver: boolean;
  childCount?: number;
  /** Bulk-selection state (datasets only). When `onToggleSelect` is omitted, no checkbox renders. */
  checked?: boolean;
  onToggleSelect?: (id: string) => void;
}

/** Small bulk-selection checkbox shown on dataset tiles/rows. */
function SelectCheckbox({
  checked,
  onToggle,
  className = "",
}: {
  checked: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? "Désélectionner" : "Sélectionner"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-transparent hover:border-primary"
      } ${className}`}
    >
      <Check className="h-3 w-3" />
    </button>
  );
}

const FolderTile = memo(function FolderTile({
  node,
  isSelected,
  isDragOver,
  childCount,
  onOpen,
  onSelect,
  onStar,
  onContextMenu,
  onDragStart,
  onDragOverFolder,
  onDropOnFolder,
}: TileProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={node.name}
      draggable={node.id !== ROOT_ID}
      onClick={() => onSelect(node.id)}
      onDoubleClick={() => onOpen(node)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(node);
        else if (e.key === " ") {
          e.preventDefault();
          onSelect(node.id);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(node, e.clientX, e.clientY);
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", node.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(node.id);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOverFolder(node.id);
      }}
      onDragLeave={() => onDragOverFolder(null)}
      onDrop={(e) => {
        e.preventDefault();
        onDragOverFolder(null);
        onDropOnFolder(node.id);
      }}
      className={`group relative flex cursor-pointer flex-col gap-2 rounded-xl border p-3 transition-all ${
        isDragOver
          ? "border-dashed border-primary bg-primary/10 ring-2 ring-primary/30"
          : isSelected
            ? "border-primary/40 bg-primary/10"
            : "border-border bg-card hover:border-primary/30 hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="rounded-lg p-2" style={{ backgroundColor: `${node.color ?? "#1E40AF"}1f` }}>
          {isDragOver ? (
            <FolderOpen className="h-6 w-6" style={{ color: node.color ?? "#1E40AF" }} />
          ) : (
            <Folder className="h-6 w-6" style={{ color: node.color ?? "#1E40AF" }} />
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Étoile"
            onClick={(e) => {
              e.stopPropagation();
              onStar(node.id);
            }}
            className="p-1 text-muted-foreground opacity-0 transition-opacity hover:text-yellow-400 group-hover:opacity-100"
          >
            <Star
              className={`h-3.5 w-3.5 ${node.starred ? "fill-yellow-400 text-yellow-400 opacity-100" : ""}`}
            />
          </button>
          <button
            type="button"
            aria-label="Actions"
            onClick={(e) => {
              e.stopPropagation();
              onContextMenu(node, e.clientX, e.clientY);
            }}
            className="p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-foreground">{node.name}</div>
        <div className="text-xs text-muted-foreground">
          {childCount === undefined
            ? "Dossier"
            : `${childCount} élément${childCount === 1 ? "" : "s"}`}
        </div>
      </div>
    </div>
  );
});

const DatasetTile = memo(function DatasetTile({
  node,
  isSelected,
  checked,
  onToggleSelect,
  onOpen,
  onSelect,
  onStar,
  onContextMenu,
  onDragStart,
}: Omit<TileProps, "isDragOver" | "onDragOverFolder" | "onDropOnFolder">) {
  const style = fileTypeStyle(node.type);
  const Icon = style.icon;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={node.name}
      draggable
      onClick={() => onSelect(node.id)}
      onDoubleClick={() => onOpen(node)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(node);
        else if (e.key === " ") {
          e.preventDefault();
          onSelect(node.id);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(node, e.clientX, e.clientY);
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", node.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(node.id);
      }}
      className={`group relative flex cursor-pointer flex-col gap-2 rounded-xl border p-3 transition-all ${
        isSelected
          ? "border-primary/40 bg-primary/10"
          : "border-border bg-card hover:border-primary/30 hover:shadow-md"
      } ${checked ? "ring-2 ring-primary/50" : ""}`}
    >
      {onToggleSelect && (
        <SelectCheckbox
          checked={!!checked}
          onToggle={() => onToggleSelect(node.id)}
          className={`absolute left-2 top-2 z-10 ${checked ? "" : "opacity-0 group-hover:opacity-100"}`}
        />
      )}
      <div className="flex items-start justify-between">
        <div className={`rounded-lg p-2 ${style.bg}`}>
          <Icon className={`h-5 w-5 ${style.color}`} />
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Étoile"
            onClick={(e) => {
              e.stopPropagation();
              onStar(node.id);
            }}
            className="p-1 text-muted-foreground opacity-0 transition-opacity hover:text-yellow-400 group-hover:opacity-100"
          >
            <Star
              className={`h-3.5 w-3.5 ${node.starred ? "fill-yellow-400 text-yellow-400 opacity-100" : ""}`}
            />
          </button>
          <button
            type="button"
            aria-label="Actions"
            onClick={(e) => {
              e.stopPropagation();
              onContextMenu(node, e.clientX, e.clientY);
            }}
            className="p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-foreground">{node.name}</div>
        <div className="text-xs text-muted-foreground">
          {node.rowCount !== undefined ? `${node.rowCount.toLocaleString("fr-FR")} lignes` : ""}
          {node.rowCount !== undefined && node.size > 0 ? " · " : ""}
          {node.size > 0 ? formatBytes(node.size) : ""}
        </div>
      </div>
      {node.quality !== undefined && (
        <div className="h-1 overflow-hidden rounded-full bg-accent">
          <div
            className="h-full rounded-full"
            style={{
              width: `${node.quality * 100}%`,
              backgroundColor: qualityColor(node.quality),
            }}
          />
        </div>
      )}
      <span className="text-xs uppercase tracking-wide text-muted-foreground/70">{node.type}</span>
    </div>
  );
});

const DetailRow = memo(function DetailRow({
  node,
  isSelected,
  isDragOver,
  childCount,
  checked,
  onToggleSelect,
  onOpen,
  onSelect,
  onStar,
  onContextMenu,
  onDragStart,
  onDragOverFolder,
  onDropOnFolder,
}: TileProps) {
  const isFolder = node.type === "folder";
  const style = fileTypeStyle(node.type);
  const Icon = isFolder ? Folder : style.icon;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={node.name}
      draggable={node.id !== ROOT_ID}
      onClick={() => onSelect(node.id)}
      onDoubleClick={() => onOpen(node)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(node);
        else if (e.key === " ") {
          e.preventDefault();
          onSelect(node.id);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(node, e.clientX, e.clientY);
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", node.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(node.id);
      }}
      onDragOver={
        isFolder
          ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              onDragOverFolder(node.id);
            }
          : undefined
      }
      onDragLeave={isFolder ? () => onDragOverFolder(null) : undefined}
      onDrop={
        isFolder
          ? (e) => {
              e.preventDefault();
              onDragOverFolder(null);
              onDropOnFolder(node.id);
            }
          : undefined
      }
      className={`group flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
        isDragOver
          ? "border-dashed border-primary bg-primary/10"
          : isSelected
            ? "border-primary/40 bg-primary/10"
            : "border-transparent hover:bg-accent"
      } ${checked ? "ring-1 ring-primary/40" : ""}`}
    >
      {onToggleSelect ? (
        isFolder ? (
          <span className="w-4 shrink-0" aria-hidden />
        ) : (
          <SelectCheckbox
            checked={!!checked}
            onToggle={() => onToggleSelect(node.id)}
            className="shrink-0"
          />
        )
      ) : null}
      <Icon
        className={`h-4 w-4 shrink-0 ${isFolder ? "" : style.color}`}
        style={isFolder ? { color: node.color ?? "#1E40AF" } : undefined}
      />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{node.name}</span>
      <span className="hidden w-24 text-right text-xs text-muted-foreground sm:block">
        {isFolder
          ? childCount !== undefined
            ? `${childCount} élément${childCount === 1 ? "" : "s"}`
            : "—"
          : node.rowCount !== undefined
            ? `${node.rowCount.toLocaleString("fr-FR")} l.`
            : "—"}
      </span>
      <span className="hidden w-20 text-right font-mono text-xs text-muted-foreground md:block">
        {node.size > 0 ? formatBytes(node.size) : "—"}
      </span>
      <span className="hidden w-20 text-right text-xs text-muted-foreground lg:block">
        {formatAge(node.updatedAt)}
      </span>
      {node.quality !== undefined ? (
        <span
          className="hidden w-2 shrink-0 sm:block"
          style={{ color: qualityColor(node.quality) }}
        >
          <span
            className="block h-2 w-2 rounded-full"
            style={{ backgroundColor: qualityColor(node.quality) }}
          />
        </span>
      ) : (
        <span className="hidden w-2 sm:block" />
      )}
      <button
        type="button"
        aria-label="Étoile"
        onClick={(e) => {
          e.stopPropagation();
          onStar(node.id);
        }}
        className="p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-yellow-400 group-hover:opacity-100"
      >
        <Star
          className={`h-3.5 w-3.5 ${node.starred ? "fill-yellow-400 text-yellow-400 opacity-100" : ""}`}
        />
      </button>
      <button
        type="button"
        aria-label="Actions"
        onClick={(e) => {
          e.stopPropagation();
          onContextMenu(node, e.clientX, e.clientY);
        }}
        className="p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
    </div>
  );
});

export interface ExplorerViewProps extends ExplorerItemHandlers {
  nodes: FSNode[];
  selected: string | null;
  dragOver: string | null;
  dragging: string | null;
  layout: "grid" | "list";
  /** folderId -> direct child count, for tile/row subtitles. */
  childCounts: Map<string, number>;
  /** Bulk-selected dataset ids. When `onToggleSelect` is omitted, no checkboxes render. */
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function ExplorerView({
  nodes,
  selected,
  dragOver,
  dragging,
  layout,
  childCounts,
  selectedIds,
  onToggleSelect,
  ...handlers
}: ExplorerViewProps) {
  const isDragOver = useCallback(
    (id: string) => dragOver === id && dragging !== id,
    [dragOver, dragging],
  );

  if (layout === "list") {
    return (
      <div className="flex h-full flex-col overflow-y-auto">
        <div className="flex items-center gap-3 border-b border-border px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span className="w-4 shrink-0" />
          <span className="flex-1">Nom</span>
          <span className="hidden w-24 text-right sm:block">Contenu</span>
          <span className="hidden w-20 text-right md:block">Taille</span>
          <span className="hidden w-20 text-right lg:block">Modifié</span>
          <span className="hidden w-2 sm:block" />
          <span className="w-12" />
        </div>
        <div className="flex flex-col gap-0.5 py-1">
          {nodes.map((node) => (
            <DetailRow
              key={node.id}
              node={node}
              isSelected={selected === node.id}
              isDragOver={isDragOver(node.id)}
              childCount={node.type === "folder" ? (childCounts.get(node.id) ?? 0) : undefined}
              checked={!!selectedIds?.has(node.id)}
              onToggleSelect={onToggleSelect}
              {...handlers}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
        {nodes.map((node) =>
          node.type === "folder" ? (
            <FolderTile
              key={node.id}
              node={node}
              isSelected={selected === node.id}
              isDragOver={isDragOver(node.id)}
              childCount={childCounts.get(node.id) ?? 0}
              {...handlers}
            />
          ) : (
            <DatasetTile
              key={node.id}
              node={node}
              isSelected={selected === node.id}
              checked={!!selectedIds?.has(node.id)}
              onToggleSelect={onToggleSelect}
              onOpen={handlers.onOpen}
              onSelect={handlers.onSelect}
              onStar={handlers.onStar}
              onContextMenu={handlers.onContextMenu}
              onDragStart={handlers.onDragStart}
            />
          ),
        )}
      </div>
    </div>
  );
}
