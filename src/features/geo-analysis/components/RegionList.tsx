"use client";

/**
 * Virtualized region list.
 *
 * Replaces the old `.map()` over a `max-h + overflow` container, which janked
 * once region counts grew. Real datasets can have hundreds of distinct region
 * values, so rows are windowed with `@tanstack/react-virtual` (already a project
 * dependency) and only the visible slice is rendered.
 */

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { fmtN, fmtPct } from "@/features/telecom/lib/format";
import type { GeoRegion } from "../hooks/use-geo-data";
import { successRateToColor } from "../lib/colors";

export interface RegionListProps {
  regions: GeoRegion[];
  selectedRegion: string | null;
  onSelect: (regionName: string) => void;
  height?: number;
}

const ROW_HEIGHT = 40;

export function RegionList({ regions, selectedRegion, onSelect, height = 320 }: RegionListProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: regions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  if (regions.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-sm text-muted-foreground">
        No regions to display.
      </div>
    );
  }

  return (
    <div ref={parentRef} className="overflow-y-auto" style={{ maxHeight: height }}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const region = regions[virtualRow.index];
          const isSelected = region.name === selectedRegion;
          return (
            <button
              key={region.name}
              type="button"
              onClick={() => onSelect(region.name)}
              className={`absolute left-0 top-0 flex w-full items-center gap-2 px-2 text-left text-xs transition-colors ${
                isSelected ? "bg-muted" : "hover:bg-muted/60"
              }`}
              style={{
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <span className="w-6 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                #{region.rank}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{region.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {fmtN(region.transactions)}
              </span>
              <span
                className="w-12 shrink-0 text-right font-medium tabular-nums"
                style={{ color: successRateToColor(region.successRate) }}
              >
                {fmtPct(region.successRate)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
