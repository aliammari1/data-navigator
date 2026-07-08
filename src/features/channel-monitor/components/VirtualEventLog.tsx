"use client";

/**
 * Virtualized alert event log. The previous screen did `.slice(0, 50)` —
 * silently truncating real alert volumes. Here `@tanstack/react-virtual`
 * windows the full (hundreds-to-thousands) event list at 60fps, only rendering
 * the visible rows. Date formatting reuses one shared Intl instance.
 */

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/utils";
import { fmtN } from "@/features/telecom/lib/format";
import { channelLabel } from "../lib/channels";
import { formatDate, formatDateTime } from "../lib/format-helpers";
import { metricLabel, severityBadgeClass, severityDot } from "../lib/ui-helpers";
import type { AlertEvent } from "../store/monitor-store";

const ROW_HEIGHT = 64;

export function VirtualEventLog({
  events,
  selectedId,
  onSelect,
  onAcknowledge,
}: {
  events: AlertEvent[];
  selectedId: string | null;
  onSelect: (ev: AlertEvent) => void;
  onAcknowledge: (id: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  if (events.length === 0) {
    return (
      <div className="text-center text-slate-500 py-8">No events match the current filter</div>
    );
  }

  return (
    <div ref={parentRef} className="max-h-96 overflow-y-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const ev = events[vi.index];
          if (!ev) return null;
          const expanded = selectedId === ev.id;
          return (
            <div
              key={ev.id}
              role="button"
              tabIndex={0}
              className={cn(
                "absolute left-0 right-0 flex items-start gap-3 px-4 py-2.5 border-b border-slate-800/60 hover:bg-slate-800/30 cursor-pointer transition-colors",
                ev.acknowledged && "opacity-50",
              )}
              style={{
                height: ROW_HEIGHT,
                transform: `translateY(${vi.start}px)`,
              }}
              onClick={() => onSelect(ev)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(ev);
                }
              }}
            >
              <span
                className={cn("size-2 rounded-full mt-1.5 shrink-0", severityDot(ev.severity))}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={cn(
                      "text-xs px-1.5 py-0.5 rounded border font-medium shrink-0",
                      severityBadgeClass(ev.severity),
                    )}
                  >
                    {ev.severity.toUpperCase()}
                  </span>
                  <span className="text-slate-200 text-xs font-medium truncate">{ev.label}</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5 truncate">
                  {channelLabel(ev.channel)}
                  {" — "}
                  {metricLabel(ev.metric)}: {fmtN(ev.actualValue, 1)} vs threshold {ev.threshold}
                  {expanded && <> &middot; {formatDateTime(ev.triggeredAt)}</>}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1">
                <span className="text-xs text-slate-500 hidden sm:block">
                  {formatDate(ev.triggeredAt)}
                </span>
                {!ev.acknowledged && (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAcknowledge(ev.id);
                    }}
                  >
                    Ack
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
