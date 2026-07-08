"use client";

// ─── VirtualList ──────────────────────────────────────────────────────────────
//
// A thin, measured-row virtualizer used for every unbounded list on the
// collaboration screen (comments, changes, chat, audit). Only the visible rows
// mount, so large collaborative histories (hundreds of audit/chat entries)
// render at 60fps on a medium-end CPU and never re-render the whole tree on a
// CRDT observe. Matches the repo virtualization idiom.

import { useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useRef } from "react";

export interface VirtualListProps<T> {
  items: T[];
  /** Stable key per item. */
  getKey: (item: T, index: number) => string;
  /** Estimated row height in px (refined by measurement). */
  estimateSize?: number;
  overscan?: number;
  className?: string;
  /** When true, anchor scroll to the bottom (chat) on mount. */
  renderItem: (item: T, index: number) => ReactNode;
}

export function VirtualList<T>({
  items,
  getKey,
  estimateSize = 96,
  overscan = 8,
  className,
  renderItem,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  return (
    <div ref={parentRef} className={className} style={{ overflowY: "auto" }}>
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
          width: "100%",
        }}
      >
        {virtualizer.getVirtualItems().map((vi) => {
          const item = items[vi.index];
          return (
            <div
              key={getKey(item, vi.index)}
              ref={virtualizer.measureElement}
              data-index={vi.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vi.start}px)`,
              }}
            >
              {renderItem(item, vi.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
