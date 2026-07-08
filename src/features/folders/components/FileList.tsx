"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { Folder, Star, Trash2 } from "lucide-react";
import { memo, useCallback, useRef } from "react";
import { fileTypeStyle, formatAge, formatBytes, qualityColor } from "../lib/format";
import type { FSNode } from "../types";

const ROW_HEIGHT = 44;

interface FileListRowProps {
  node: FSNode;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onStar: (id: string) => void;
  onDelete: (id: string) => void;
}

const FileListRow = memo(function FileListRow({
  node,
  isSelected,
  onSelect,
  onToggle,
  onStar,
  onDelete,
}: FileListRowProps) {
  const style = fileTypeStyle(node.type);
  const Icon = node.type === "folder" ? Folder : style.icon;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(node.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(node.id);
        }
      }}
      onDoubleClick={() => {
        if (node.type === "folder") onToggle(node.id);
      }}
      className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-colors group h-full ${
        isSelected
          ? "bg-primary/15 border border-primary/30"
          : "hover:bg-accent border border-transparent"
      }`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${style.color}`} />
      <span className="flex-1 text-sm text-foreground truncate min-w-0">{node.name}</span>
      {node.quality !== undefined && (
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: qualityColor(node.quality) }}
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
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStar(node.id);
          }}
          className="p-0.5 hover:text-yellow-400 text-muted-foreground"
          aria-label="Toggle star"
        >
          <Star className={`w-3 h-3 ${node.starred ? "fill-yellow-400 text-yellow-400" : ""}`} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(node.id);
          }}
          className="p-0.5 hover:text-red-400 text-muted-foreground"
          aria-label="Delete"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
});

interface FileListProps {
  nodes: FSNode[];
  selected: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onStar: (id: string) => void;
  onDelete: (id: string) => void;
}

/** Virtualized flat list view. Only visible rows mount. */
export function FileList({ nodes, selected, onSelect, onToggle, onStar, onDelete }: FileListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(() => ROW_HEIGHT, []),
    overscan: 10,
  });

  return (
    <div ref={parentRef} className="h-full overflow-y-auto">
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
          width: "100%",
        }}
      >
        {virtualizer.getVirtualItems().map((vi) => {
          const node = nodes[vi.index];
          return (
            <div
              key={node.id}
              data-index={vi.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: ROW_HEIGHT,
                transform: `translateY(${vi.start}px)`,
              }}
            >
              <FileListRow
                node={node}
                isSelected={selected === node.id}
                onSelect={onSelect}
                onToggle={onToggle}
                onStar={onStar}
                onDelete={onDelete}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
