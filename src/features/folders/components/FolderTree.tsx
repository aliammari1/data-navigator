"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight, FolderOpen, Star } from "lucide-react";
import { memo, useCallback, useRef } from "react";
import { fileTypeStyle, qualityColor } from "../lib/format";
import type { FlatRow } from "../types";

const ROW_HEIGHT = 30;

interface FolderTreeRowProps {
  row: FlatRow;
  isSelected: boolean;
  isDragOver: boolean;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onStar: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDrop: (id: string) => void;
}

const FolderTreeRow = memo(function FolderTreeRow({
  row,
  isSelected,
  isDragOver,
  onToggle,
  onSelect,
  onStar,
  onDragStart,
  onDragOver,
  onDrop,
}: FolderTreeRowProps) {
  const { node, depth, hasChildren, isExpanded } = row;
  const style = fileTypeStyle(node.type);
  const Icon = node.type === "folder" && isExpanded ? FolderOpen : style.icon;

  return (
    <div
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={hasChildren ? isExpanded : undefined}
      tabIndex={0}
      className={`w-full flex items-center gap-1 py-1 px-2 rounded-lg cursor-pointer select-none transition-colors group text-left ${
        isSelected
          ? "bg-primary/20 border border-primary/30"
          : isDragOver
            ? "bg-primary/15 border border-dashed border-primary/50"
            : "hover:bg-accent border border-transparent"
      }`}
      style={{ paddingLeft: `${depth * 12 + 8}px`, height: ROW_HEIGHT }}
      onClick={() => onSelect(node.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(node.id);
        } else if (e.key === "ArrowRight" && hasChildren && !isExpanded) {
          e.preventDefault();
          onToggle(node.id);
        } else if (e.key === "ArrowLeft" && hasChildren && isExpanded) {
          e.preventDefault();
          onToggle(node.id);
        }
      }}
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
        aria-label={isExpanded ? "Collapse" : "Expand"}
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
      <span className="flex-1 text-sm text-foreground truncate min-w-0">{node.name}</span>
      <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {node.starred && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />}
        {node.quality !== undefined && (
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: qualityColor(node.quality) }}
          />
        )}
      </span>
      <button
        type="button"
        className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-yellow-400 text-muted-foreground transition-colors"
        aria-label="Toggle star"
        onClick={(e) => {
          e.stopPropagation();
          onStar(node.id);
        }}
      >
        <Star className={`w-3 h-3 ${node.starred ? "fill-yellow-400 text-yellow-400" : ""}`} />
      </button>
    </div>
  );
});

interface FolderTreeProps {
  rows: FlatRow[];
  selected: string | null;
  dragOver: string | null;
  dragging: string | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onStar: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDrop: (id: string) => void;
}

/**
 * Virtualized folder tree: only the visible rows (plus overscan) mount,
 * regardless of catalog size. The tree is flattened upstream so the
 * virtualizer owns a simple linear list.
 */
export function FolderTree({
  rows,
  selected,
  dragOver,
  dragging,
  onToggle,
  onSelect,
  onStar,
  onDragStart,
  onDragOver,
  onDrop,
}: FolderTreeProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(() => ROW_HEIGHT, []),
    overscan: 12,
  });

  return (
    <div ref={parentRef} role="tree" aria-label="Folders" className="h-full overflow-y-auto">
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
          width: "100%",
        }}
      >
        {virtualizer.getVirtualItems().map((vi) => {
          const row = rows[vi.index];
          return (
            <div
              key={row.node.id}
              data-index={vi.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vi.start}px)`,
              }}
            >
              <FolderTreeRow
                row={row}
                isSelected={selected === row.node.id}
                isDragOver={dragOver === row.node.id && dragging !== row.node.id}
                onToggle={onToggle}
                onSelect={onSelect}
                onStar={onStar}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
