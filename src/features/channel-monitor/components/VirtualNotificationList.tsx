"use client";

/**
 * Virtualized notification history. The old screen did `.slice(0, 20)`. This
 * windows the full list with @tanstack/react-virtual and reuses one shared Intl
 * formatter for timestamps.
 */

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/shared/utils";
import { formatDateTime } from "../lib/format-helpers";
import { severityDot } from "../lib/ui-helpers";
import type { NotificationEntry } from "../store/monitor-store";

const ROW_HEIGHT = 60;

export function VirtualNotificationList({ notifications }: { notifications: NotificationEntry[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: notifications.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  if (notifications.length === 0) {
    return <div className="text-center text-slate-500 py-8">No notifications</div>;
  }

  return (
    <div ref={parentRef} className="max-h-80 overflow-y-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const n = notifications[vi.index];
          if (!n) return null;
          return (
            <div
              key={n.id}
              className={cn(
                "absolute left-0 right-0 flex items-start gap-3 px-4 py-2.5 border-b border-slate-800/60",
                !n.read && "bg-slate-800/20",
              )}
              style={{ height: ROW_HEIGHT, transform: `translateY(${vi.start}px)` }}
            >
              <span
                className={cn("size-2 rounded-full mt-1.5 shrink-0", severityDot(n.severity))}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-200 leading-relaxed truncate">{n.message}</div>
                <div className="text-xs text-slate-500 mt-0.5">{formatDateTime(n.timestamp)}</div>
              </div>
              {!n.read && <span className="size-1.5 rounded-full bg-blue-400 mt-2 shrink-0" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
