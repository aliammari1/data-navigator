"use client";

/**
 * Channel checkbox list — virtualized with @tanstack/react-virtual so a real
 * dataset with hundreds/thousands of channels windows to ~visible rows instead
 * of mapping the full array (which re-rendered on every keystroke before).
 *
 * Memoized so typing in the branding panel never re-renders these rows.
 */

import { memo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ReportChannel } from "../lib/types";

function StatusBadge({ rate }: { rate: number }) {
  const label =
    rate >= 95 ? "Excellent" : rate >= 85 ? "Good" : rate >= 70 ? "Warning" : "Critical";
  const cls =
    rate >= 95
      ? "bg-green-500/15 text-green-400 ring-green-500/30"
      : rate >= 85
        ? "bg-blue-500/15 text-blue-400 ring-blue-500/30"
        : rate >= 70
          ? "bg-yellow-500/15 text-yellow-400 ring-yellow-500/30"
          : "bg-red-500/15 text-red-400 ring-red-500/30";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {label}
    </span>
  );
}

export interface ChannelSelectorProps {
  channels: ReportChannel[];
  selected: string[];
  onToggle: (name: string) => void;
  onToggleAll: () => void;
}

const ROW_H = 32;

function ChannelSelectorImpl({ channels, selected, onToggle, onToggleAll }: ChannelSelectorProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const selectedSet = new Set(selected);
  const allSelected = channels.length > 0 && selected.length === channels.length;

  const virtualizer = useVirtualizer({
    count: channels.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 10,
  });

  return (
    <div className="space-y-1.5">
      <button type="button" className="text-xs text-primary hover:underline" onClick={onToggleAll}>
        {allSelected ? "Deselect all" : "Select all"}
      </button>
      <div
        ref={parentRef}
        className="max-h-64 overflow-auto rounded-md border border-border/50"
        // bounded height + overflow:auto is required for the virtualizer to scroll
      >
        <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
          {virtualizer.getVirtualItems().map((v) => {
            const ch = channels[v.index];
            if (!ch) return null;
            return (
              <label
                key={ch.name}
                className="absolute left-0 top-0 flex w-full items-center gap-2 px-2 cursor-pointer group"
                style={{ height: ROW_H, transform: `translateY(${v.start}px)` }}
              >
                <input
                  type="checkbox"
                  checked={selectedSet.has(ch.name)}
                  onChange={() => onToggle(ch.name)}
                  className="rounded border-input accent-primary"
                />
                <span className="text-sm flex-1 truncate text-muted-foreground group-hover:text-foreground">
                  {ch.name}
                </span>
                <StatusBadge rate={ch.successRate} />
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export const ChannelSelector = memo(ChannelSelectorImpl);
