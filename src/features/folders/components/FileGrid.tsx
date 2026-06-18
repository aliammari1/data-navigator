"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { Star } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { fileTypeStyle, formatBytes, qualityColor } from "../lib/format";
import type { FSNode } from "../types";

const ROW_HEIGHT = 132;
const GAP = 12;

interface FileGridCardProps {
  node: FSNode;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onStar: (id: string) => void;
}

const FileGridCard = memo(function FileGridCard({
  node,
  isSelected,
  onSelect,
  onStar,
}: FileGridCardProps) {
  const style = fileTypeStyle(node.type);
  const Icon = style.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      className={`text-left p-3 rounded-xl border cursor-pointer transition-shadow hover:shadow-md group ${
        isSelected ? "bg-primary/15 border-primary/30" : "bg-card border-border hover:border-border"
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
          aria-label="Toggle star"
        >
          <Star
            className={`w-3.5 h-3.5 ${node.starred ? "fill-yellow-400 text-yellow-400 opacity-100" : ""}`}
          />
        </button>
      </div>
      <div className="text-xs font-semibold text-foreground truncate">{node.name}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{formatBytes(node.size)}</div>
      {node.rowCount !== undefined && (
        <div className="text-xs text-muted-foreground">{node.rowCount.toLocaleString()} rows</div>
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
        {node.tags.slice(0, 2).map((t) => (
          <span key={t} className="text-xs bg-muted text-muted-foreground px-1 rounded">
            {t}
          </span>
        ))}
      </div>
    </button>
  );
});

interface FileGridProps {
  nodes: FSNode[];
  selected: string | null;
  onSelect: (id: string) => void;
  onStar: (id: string) => void;
}

/** Responsive column count matching the original Tailwind breakpoints. */
function columnsForWidth(width: number): number {
  if (width >= 1280) return 5; // xl
  if (width >= 768) return 4; // md
  if (width >= 640) return 3; // sm
  return 2;
}

/**
 * Virtualized grid: cards are grouped into rows of `columns`, and only the
 * visible rows mount. Replaces the index-staggered Framer Motion grid that
 * mounted every node and janked the main thread on large catalogs.
 */
export function FileGrid({ nodes, selected, onSelect, onStar }: FileGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(4);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const update = () => setColumns(columnsForWidth(el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rowCount = Math.ceil(nodes.length / columns);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(() => ROW_HEIGHT + GAP, []),
    overscan: 4,
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
          const start = vi.index * columns;
          const rowNodes = nodes.slice(start, start + columns);
          return (
            <div
              key={vi.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vi.start}px)`,
                display: "grid",
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap: GAP,
                paddingBottom: GAP,
              }}
            >
              {rowNodes.map((node) => (
                <FileGridCard
                  key={node.id}
                  node={node}
                  isSelected={selected === node.id}
                  onSelect={onSelect}
                  onStar={onStar}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
