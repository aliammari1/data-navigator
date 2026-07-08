"use client";

/**
 * Virtualized saved-scenario list for the Revenue Simulator.
 *
 * Saved scenarios are persisted (Dexie) and unbounded — a user can accumulate
 * many. `@tanstack/react-virtual` windows the list so only visible rows render,
 * keeping the panel at 60fps regardless of count (matching the app's other
 * virtualized lists, e.g. channel-monitor's event log).
 */

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { fmtN } from "@/features/telecom/lib/format";
import { cn } from "@/shared/utils";
import type { SavedScenarioRecord } from "../data/forecast-db";

const ROW_HEIGHT = 60;

export function SavedScenarioList({
  scenarios,
  compareSelected,
  onToggleCompare,
  onDelete,
}: {
  scenarios: SavedScenarioRecord[];
  compareSelected: string[];
  onToggleCompare: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: scenarios.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  if (scenarios.length === 0) return null;

  return (
    <div
      ref={parentRef}
      className="mt-4 max-h-72 overflow-y-auto"
      role="list"
      aria-label="Saved scenarios"
    >
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const sc = scenarios[vi.index];
          if (!sc) return null;
          const selected = compareSelected.includes(sc.id);
          return (
            <div
              key={sc.id}
              role="listitem"
              className="absolute left-0 right-0 flex items-center justify-between p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/40"
              style={{
                height: ROW_HEIGHT - 8,
                transform: `translateY(${vi.start}px)`,
              }}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">{sc.name}</p>
                <p
                  className={cn(
                    "text-xs font-medium",
                    sc.delta >= 0 ? "text-emerald-400" : "text-red-400",
                  )}
                >
                  {sc.delta >= 0 ? "+" : ""}
                  {fmtN(sc.delta, 0)} TND
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onToggleCompare(sc.id)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-md border transition-colors",
                    selected
                      ? "border-blue-500 text-blue-400 bg-blue-500/10"
                      : "border-slate-600 text-slate-400 hover:border-slate-500",
                  )}
                >
                  Compare
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(sc.id)}
                  aria-label={`Delete scenario ${sc.name}`}
                  className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
