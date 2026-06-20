"use client";

import { Bell, Database, GitBranch, Table2, Upload, Users, X, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import {
  type ActivityEvent,
  type ActivityType,
  useActivityStore,
} from "@/core/stores/activity-store";
import { useNotificationSettings } from "@/core/stores/settings-store";
import { useClickOutside } from "@/features/dashboard-shell/shell/use-click-outside";
import { cn } from "@/shared/utils";

/**
 * Real notification bell sourced from the durable `activity-store` (offline,
 * persisted via drizzle-storage) instead of the old fabricated static `NOTIFS`
 * array. Events are filtered by the user's `settings.notifications` toggles, so
 * the bell reflects actual local activity (uploads / queries / dataset selects /
 * transforms) and honours the offline event source.
 */

type NotifCategory = "uploads" | "queries" | "collaboration" | "errors";

const TYPE_CATEGORY: Record<ActivityType, NotifCategory> = {
  dataset_uploaded: "uploads",
  dataset_selected: "uploads",
  telecom_opened: "uploads",
  telecom_analysis_saved: "collaboration",
  transform_run: "queries",
  query_run: "queries",
};

const TYPE_ICON: Record<ActivityType, React.ElementType> = {
  dataset_uploaded: Upload,
  dataset_selected: Table2,
  telecom_opened: Database,
  telecom_analysis_saved: Users,
  transform_run: GitBranch,
  query_run: Zap,
};

const TYPE_COLOR: Record<ActivityType, string> = {
  dataset_uploaded: "text-emerald-400",
  dataset_selected: "text-blue-400",
  telecom_opened: "text-cyan-400",
  telecom_analysis_saved: "text-violet-400",
  transform_run: "text-amber-400",
  query_run: "text-blue-400",
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const deltaSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (deltaSec < 45) return "just now";
  if (deltaSec < 3600) return `${Math.round(deltaSec / 60)}m ago`;
  if (deltaSec < 86400) return `${Math.round(deltaSec / 3600)}h ago`;
  return `${Math.round(deltaSec / 86400)}d ago`;
}

export function NotificationsBell() {
  const events = useActivityStore((s) => s.events);
  const clearEvents = useActivityStore((s) => s.clearEvents);
  const notifSettings = useNotificationSettings();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setOpen(false), open);

  const visible = useMemo<ActivityEvent[]>(() => {
    return events
      .filter((event) => {
        const category = TYPE_CATEGORY[event.type] ?? "uploads";
        return notifSettings[category] ?? true;
      })
      .slice(0, 20);
  }, [events, notifSettings]);

  // Treat the most recent few as "unread" for the badge — there is no read
  // marker in the activity log, so cap the badge instead of fabricating state.
  const unread = Math.min(visible.length, 9);

  return (
    <div className="relative hidden sm:block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative w-8 h-8 rounded-xl bg-accent hover:bg-accent/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden z-50"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold text-foreground">Activity</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close notifications"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {visible.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                No recent activity yet.
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {visible.map((event) => {
                  const Icon = TYPE_ICON[event.type] ?? Database;
                  return (
                    <div
                      key={event.id}
                      className="flex gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-accent transition-colors"
                    >
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center flex-none bg-accent",
                          TYPE_COLOR[event.type] ?? "text-muted-foreground",
                        )}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground leading-relaxed">{event.message}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {relativeTime(event.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {visible.length > 0 && (
              <div className="px-4 py-2.5 text-center border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    clearEvents();
                    setOpen(false);
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Clear activity
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
