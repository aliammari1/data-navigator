"use client";

/**
 * VirtualDataTable — row + column virtualized table for widget data-tables and
 * the SQL IDE results grid. Uses `@tanstack/react-virtual` so large/wide result
 * sets never blow up the DOM node count (the old DataTable rendered up to 200
 * raw <tr> with every cell mounted).
 */

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { cn } from "@/shared/utils";

interface Props {
  headers: string[];
  rows: string[][];
  className?: string;
  rowHeight?: number;
  /** Estimated px width per column for horizontal virtualization. */
  columnWidth?: number;
}

export function VirtualDataTable({
  headers,
  rows,
  className,
  rowHeight = 28,
  columnWidth = 160,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });

  // Column virtualization keeps wide grids cheap (the agent emits SELECT * with
  // 40+ columns for some data-table widgets).
  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: headers.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => columnWidth,
    overscan: 4,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualCols = columnVirtualizer.getVirtualItems();
  const totalWidth = columnVirtualizer.getTotalSize();
  const totalHeight = rowVirtualizer.getTotalSize();

  return (
    <div
      ref={scrollRef}
      className={cn(
        "h-full overflow-auto rounded-lg border border-slate-700/40 text-xs",
        className,
      )}
    >
      {/* Sticky header row (only virtualized columns rendered). */}
      <div
        className="sticky top-0 z-10 bg-slate-800/90 backdrop-blur-sm"
        style={{ width: totalWidth, height: rowHeight }}
      >
        {virtualCols.map((vc) => (
          <div
            key={vc.key}
            className="absolute top-0 truncate border-b border-slate-700/40 px-3 py-1.5 font-medium text-slate-400"
            style={{
              left: vc.start,
              width: vc.size,
              height: rowHeight,
            }}
            title={headers[vc.index]}
          >
            {headers[vc.index]}
          </div>
        ))}
      </div>

      {/* Virtualized body. */}
      <div
        style={{
          width: totalWidth,
          height: totalHeight,
          position: "relative",
        }}
      >
        {virtualRows.map((vr) => {
          const row = rows[vr.index];
          return (
            <div
              key={vr.key}
              className={cn("absolute left-0", vr.index % 2 === 0 ? "" : "bg-slate-800/20")}
              style={{
                top: vr.start,
                width: totalWidth,
                height: vr.size,
              }}
            >
              {virtualCols.map((vc) => {
                const cell = row?.[vc.index] ?? "";
                return (
                  <div
                    key={vc.key}
                    className="absolute truncate px-3 py-1 text-slate-300"
                    style={{
                      left: vc.start,
                      width: vc.size,
                      height: vr.size,
                    }}
                    title={cell}
                  >
                    {cell}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
