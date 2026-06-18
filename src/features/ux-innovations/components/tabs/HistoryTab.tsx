/**
 * History tab — the user's OWN real unlock log (single-user, offline-legal).
 * Replaces the former fake multi-user social "Recent Activity" feed
 * (ACTIVITY_EVENTS with invented names).
 *
 * Rows come straight from the real unlock event store. The list virtualizes
 * with `@tanstack/react-virtual` once it exceeds the runtime
 * `virtualizeThreshold` (read from the shared performance config so the
 * Settings → performance toggle is actually honored).
 */

"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertCircle, Trophy } from "lucide-react";
import { useMemo, useRef } from "react";
import { getRuntimePerformanceConfig } from "@/platform/storage";
import { cn } from "@/shared/utils";
import { ACHIEVEMENTS, getCategoryMeta } from "../../data/achievements";
import { selectEvents, type UnlockEvent, useAchievements } from "../../store/achievements-store";

function relativeTime(ts: string): string {
  const diffMs = Date.now() - new Date(ts).getTime();
  const diffH = Math.floor(diffMs / 3_600_000);
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "yesterday";
  return `${diffD}d ago`;
}

const ROW_HEIGHT = 64;

interface RowProps {
  event: UnlockEvent;
  isLatest: boolean;
}

function HistoryRow({ event, isLatest }: RowProps) {
  const def = ACHIEVEMENTS.find((a) => a.id === event.id);
  const cat = def ? getCategoryMeta(def.category) : getCategoryMeta("DATA_EXPERT");
  const Icon = def?.icon ?? Trophy;
  return (
    <div
      className={cn(
        "flex items-center gap-4 px-4 py-3 border-b border-slate-800 last:border-b-0",
        isLatest ? "bg-blue-950/10 border-l-2 border-l-blue-600" : "bg-slate-900",
      )}
    >
      <div className={cn("p-2 rounded-lg flex-shrink-0 border", cat.bgColor, cat.borderColor)}>
        <Icon className={cn("size-4", cat.textColor)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200">
          Unlocked{" "}
          <span className="font-semibold text-slate-100">{def?.name ?? event.id}</span>
        </p>
        <p className="text-xs text-slate-500 mt-0.5">{relativeTime(event.ts)}</p>
      </div>
      <span className={cn("text-xs font-bold flex-shrink-0", cat.textColor)}>+{def?.xp ?? 0} XP</span>
    </div>
  );
}

export default function HistoryTab() {
  const events = useAchievements(selectEvents);

  // Newest first.
  const ordered = useMemo(() => [...events].reverse(), [events]);

  const threshold = useMemo(() => getRuntimePerformanceConfig().virtualizeThreshold, []);
  const useVirtual = ordered.length > threshold;

  if (ordered.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 py-12 text-center">
        <AlertCircle className="size-8 text-slate-600 mx-auto mb-3" />
        <p className="text-sm text-slate-500">No achievements unlocked yet</p>
        <p className="text-xs text-slate-600 mt-1">
          Import data, run queries, and explore screens to start earning XP.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Your Unlock History</h3>
        <span className="text-xs text-slate-500">{ordered.length} unlocked</span>
      </div>
      {useVirtual ? (
        <VirtualHistory rows={ordered} />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {ordered.map((event, idx) => (
            <HistoryRow key={`${event.id}-${event.ts}`} event={event} isLatest={idx === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

function VirtualHistory({ rows }: { rows: UnlockEvent[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  return (
    <div
      ref={scrollRef}
      className="rounded-xl border border-slate-800 overflow-auto"
      style={{ maxHeight: 560 }}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const event = rows[vi.index];
          return (
            <div
              key={`${event.id}-${event.ts}`}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: vi.size,
                transform: `translateY(${vi.start}px)`,
              }}
            >
              <HistoryRow event={event} isLatest={vi.index === 0} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
