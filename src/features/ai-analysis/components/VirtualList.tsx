"use client";

// ─── VirtualList ──────────────────────────────────────────────────────────────
//
// A thin, measured-row virtualizer used for every unbounded list on the analysis
// screen (anomalies, correlations, segments, column statistics). Only the visible
// rows mount, so wide datasets (many numeric columns / many anomalies) never push
// hundreds of nodes into the DOM. Matches the repo idiom in collab-hub/AuditTrail.

import { useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useRef } from "react";

export interface VirtualListProps<T> {
  items: T[];
  /** Stable key per item. */
  getKey: (item: T, index: number) => string;
  /** Estimated row height in px (refined by measurement). */
  estimateSize?: number;
  /** Max height of the scroll viewport (CSS). */
  maxHeight?: number | string;
  className?: string;
  renderItem: (item: T, index: number) => ReactNode;
}

export function VirtualList<T>({
  items,
  getKey,
  estimateSize = 96,
  maxHeight = 480,
  className,
  renderItem,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 6,
  });

  return (
    <div ref={parentRef} className={className} style={{ maxHeight, overflowY: "auto" }}>
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
