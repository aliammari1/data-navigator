"use client";

import { Plus, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { getApp } from "@/features/desktop/core/app-registry";
import { DESKTOP_DND_MIME, type DesktopDragPayload, readDrag } from "@/features/desktop/core/dnd";
import type { DesktopWindow } from "@/features/desktop/core/types";

/**
 * Browser-style tab strip for grouped desktop windows.
 *
 * Windows that share a `groupId` (see `DesktopWindow.groupId`) can be rendered
 * as a single tabbed window. This strip is the chrome for that group: a
 * Windows/Chrome-flavoured tab row adapted to the desktop's Fluent glass theme,
 * with a per-tab close (×), a trailing "new tab" (+), and tear-off support
 * (drag a tab out of the strip to detach it into its own window).
 *
 * It is purely presentational + small local interaction state. The integration
 * layer (window-frame) owns the store wiring: it passes the group's windows,
 * the active id, and the `onSelect` / `onClose` / `onTearOff` / `onNewTab`
 * callbacks that mutate the `groupId` model.
 */

/** Minimal shape a tab needs. A {@link DesktopWindow} satisfies this directly. */
interface WindowTab {
  /** Window instance id. */
  id: string;
  /** Title shown on the tab. */
  title: string;
  /** Registry key — drives the tab's icon + accent hue. */
  appId: string;
}

export interface WindowTabBarProps {
  /** The group these tabs belong to (used as the tear-off drag source marker). */
  groupId: string;
  /** Currently active (front) tab id. */
  activeId: string;
  /** Windows sharing this group, in display order. Accepts DesktopWindow[]. */
  tabs: ReadonlyArray<WindowTab | DesktopWindow>;
  /** Activate a tab (bring its window to the front of the group). */
  onSelect: (id: string) => void;
  /** Close a single tab/window. */
  onClose: (id: string) => void;
  /** Detach a tab into its own standalone window (dragged out of the strip). */
  onTearOff: (id: string) => void;
  /** Optional: open a fresh tab in this group (the trailing + button). */
  onNewTab?: () => void;
}

/** Private drag marker so a torn-off tab is recognised on drop-outside. */
const TAB_DND_MIME = "application/x-data-navigator-tab";

/** Pixels a tab must travel before we treat the drag as a tear-off. */
const TEAR_OFF_THRESHOLD = 28;

interface DragState {
  id: string;
  startY: number;
  torn: boolean;
}

/**
 * A browser-style tab strip for a group of windows.
 *
 * Mount it just above the hosted content of a grouped window. Drag a tab
 * downward/out of the strip past {@link TEAR_OFF_THRESHOLD}px to fire
 * `onTearOff(id)`. The + button calls `onNewTab` when provided.
 */
export function WindowTabBar({
  groupId,
  activeId,
  tabs,
  onSelect,
  onClose,
  onTearOff,
  onNewTab,
}: WindowTabBarProps) {
  // Tracks an in-flight tab drag so we can detect a tear-off gesture without a
  // global listener — the dragend handler resolves it.
  const drag = useRef<DragState | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const onTabDragStart = useCallback(
    (e: React.DragEvent, id: string) => {
      drag.current = { id, startY: e.clientY, torn: false };
      setDraggingId(id);
      try {
        // Mark the drag so external desktop drop targets can ignore it, and so
        // a future "drop on empty canvas = tear off" path can detect it.
        e.dataTransfer.setData(TAB_DND_MIME, JSON.stringify({ groupId, id }));
        e.dataTransfer.setData("text/plain", id);
        e.dataTransfer.effectAllowed = "move";
      } catch {
        // setData can throw outside dragstart in some engines; harmless here.
      }
    },
    [groupId],
  );

  const onTabDrag = useCallback((e: React.DragEvent) => {
    const d = drag.current;
    if (!d || d.torn) return;
    // clientX/Y are 0,0 on the final drag event in some browsers — ignore those.
    if (e.clientX === 0 && e.clientY === 0) return;
    if (Math.abs(e.clientY - d.startY) > TEAR_OFF_THRESHOLD) {
      d.torn = true;
    }
  }, []);

  const onTabDragEnd = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    setDraggingId(null);
    if (d?.torn) onTearOff(d.id);
  }, [onTearOff]);

  return (
    // biome-ignore lint/a11y/useFocusableInteractive: tablist container is a passive role wrapper; tabs themselves are focusable buttons.
    <div
      role="tablist"
      aria-label="Onglets de la fenêtre"
      className="flex h-9 shrink-0 select-none items-stretch gap-0.5 border-b border-[var(--win-border)] bg-[var(--win-titlebar)] px-1.5 pt-1"
    >
      {tabs.map((tab) => {
        const app = getApp(tab.appId);
        const Icon = app?.icon;
        const active = tab.id === activeId;
        const isDragging = tab.id === draggingId;
        return (
          // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard activation is handled by the inner select button; the wrapper only hosts drag + the × control.
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            draggable
            onDragStart={(e) => onTabDragStart(e, tab.id)}
            onDrag={onTabDrag}
            onDragEnd={onTabDragEnd}
            className={`group/tab relative flex min-w-[112px] max-w-[200px] items-center gap-2 rounded-t-lg px-2.5 text-xs transition-colors ${
              active
                ? "bg-[var(--win-surface)] text-foreground/90"
                : "text-foreground/60 hover:bg-foreground/[0.06] hover:text-foreground/80"
            } ${isDragging ? "opacity-50" : ""}`}
            style={
              active
                ? {
                    boxShadow:
                      "inset 0 1px 0 0 var(--win-border), inset 1px 0 0 0 var(--win-border), inset -1px 0 0 0 var(--win-border)",
                  }
                : undefined
            }
          >
            {/* Active-tab accent underline-from-top, warm app hue. */}
            {active && app ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-2 top-0 h-0.5 rounded-full"
                style={{ background: `hsl(${app.hue} 60% 50%)` }}
              />
            ) : null}

            <button
              type="button"
              onClick={() => onSelect(tab.id)}
              className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
              title={tab.title}
            >
              {Icon ? (
                <Icon
                  className="size-3.5 shrink-0"
                  style={{ color: app ? `hsl(${app.hue} 55% 45%)` : undefined }}
                />
              ) : null}
              <span className="truncate font-medium">{tab.title}</span>
            </button>

            <button
              type="button"
              aria-label={`Fermer ${tab.title}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
              className="grid size-5 shrink-0 place-items-center rounded-md text-foreground/50 opacity-0 transition-all hover:bg-foreground/10 hover:text-foreground/90 focus-visible:opacity-100 group-hover/tab:opacity-100 data-[active=true]:opacity-100"
              data-active={active}
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}

      {onNewTab ? (
        <button
          type="button"
          aria-label="Nouvel onglet"
          onClick={onNewTab}
          className="my-1 ml-0.5 grid size-7 shrink-0 place-items-center self-center rounded-md text-foreground/55 transition-colors hover:bg-foreground/10 hover:text-foreground/90"
        >
          <Plus className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

/** Payload carried by a torn-off tab drag. */
interface TabDragPayload {
  groupId: string;
  id: string;
}

// Re-export the desktop drag helpers callers commonly need alongside tabs so a
// drop zone can disambiguate tab drags from dataset/folder drags in one import.
