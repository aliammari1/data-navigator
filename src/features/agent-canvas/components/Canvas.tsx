"use client";
/**
 * Canvas — react-grid-layout drag/resize canvas.
 *
 * Layout is persisted durably via the foundation collaboration substrate
 * (`@/platform/collab` → y-indexeddb): each dataset gets a room doc, layouts are
 * stored in `room.meta`, gated on `whenStored`, and READ BACK on reload so the
 * arrangement survives offline restarts. This replaces the previous dead,
 * never-read-back in-memory `Y.Doc`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LayoutItem, ResponsiveLayouts } from "react-grid-layout";
import { ResponsiveGridLayout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { acquireRoom, releaseRoom } from "@/platform/collab";
import { useAgentStore } from "@/features/agent-canvas/core/agent-store";
import type { WidgetState } from "@/features/agent-canvas/core/types";
import { WidgetCard } from "./WidgetCard";

const DRAG_HANDLE = ".drag-handle";

// ─── Build responsive layouts from widget specs ───────────────────────────────

function specLayouts(widgets: WidgetState[]): ResponsiveLayouts<string> {
  const items = widgets.map((w) => ({
    i: w.spec.id,
    x: w.spec.position.x,
    y: w.spec.position.y,
    w: w.spec.position.w,
    h: w.spec.position.h,
    minW: 3,
    minH: 3,
  }));
  return {
    lg: items,
    md: items.map((l) => ({ ...l, w: Math.min(l.w, 10) })),
    sm: items.map((l) => ({ ...l, w: 4, x: 0 })),
  };
}

/** Merge a persisted layout over the spec defaults (so new widgets still appear). */
function mergeLayouts(
  base: ResponsiveLayouts<string>,
  saved: ResponsiveLayouts<string> | undefined,
): ResponsiveLayouts<string> {
  if (!saved) return base;
  const out = { ...base } as ResponsiveLayouts<string>;
  for (const bp of Object.keys(base) as Array<keyof ResponsiveLayouts<string>>) {
    const savedByI = new Map<string, LayoutItem>((saved[bp] ?? []).map((l) => [l.i, l] as const));
    out[bp] = (base[bp] ?? []).map((l) => savedByI.get(l.i) ?? l);
  }
  return out;
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyCanvas({ running }: { running: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
      {running ? (
        <>
          <div className="flex gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-violet-500 animate-bounce"
                style={{ animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </div>
          <p className="text-sm text-slate-400">Agent building widgets…</p>
          <p className="text-xs text-slate-600">Widgets appear here as the agent completes them</p>
        </>
      ) : (
        <>
          <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-3xl">
            📊
          </div>
          <p className="text-sm text-slate-400">Canvas is empty</p>
          <p className="text-xs text-slate-600">
            Upload data and run the pipeline to generate widgets
          </p>
        </>
      )}
    </div>
  );
}

// ─── Main Canvas ──────────────────────────────────────────────────────────────

export function Canvas() {
  // Narrow selectors — a thought/event push no longer re-renders the canvas.
  const widgets = useAgentStore((s) => s.widgets);
  const running = useAgentStore((s) => s.running);
  const tableName = useAgentStore((s) => s.tableName);

  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);
  const [savedLayouts, setSavedLayouts] = useState<ResponsiveLayouts<string> | undefined>(
    undefined,
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const roomId = tableName ? `agent-canvas:${tableName}` : null;

  // Acquire the durable room doc for this dataset; read the persisted layout
  // back once IndexedDB has loaded, then keep a handle for debounced writes.
  const roomRef = useRef<ReturnType<typeof acquireRoom> | null>(null);
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    const room = acquireRoom(roomId);
    roomRef.current = room;
    void room.whenStored.then(() => {
      if (cancelled) return;
      const stored = room.meta.get("layouts") as ResponsiveLayouts<string> | undefined;
      if (stored) setSavedLayouts(stored);
    });
    return () => {
      cancelled = true;
      roomRef.current = null;
      releaseRoom(roomId);
    };
  }, [roomId]);

  // Measure container width.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    const rect = el.getBoundingClientRect();
    if (rect.width > 0) setWidth(rect.width);
    return () => ro.disconnect();
  }, []);

  const layouts = useMemo<ResponsiveLayouts<string>>(
    () => mergeLayouts(specLayouts(widgets), savedLayouts),
    [widgets, savedLayouts],
  );

  // Persist layout changes (debounced) into the room doc → y-indexeddb.
  const handleLayoutChange = useCallback((_: unknown, allLayouts: ResponsiveLayouts<string>) => {
    const room = roomRef.current;
    if (!room) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      room.doc.transact(() => {
        room.meta.set("layouts", allLayouts);
      });
    }, 400);
  }, []);

  if (widgets.length === 0) {
    return <EmptyCanvas running={running} />;
  }

  return (
    <div ref={containerRef} className="w-full h-full overflow-auto">
      <ResponsiveGridLayout
        width={width}
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 768, sm: 480 }}
        cols={{ lg: 12, md: 10, sm: 4 }}
        rowHeight={60}
        margin={[10, 10]}
        containerPadding={[4, 4]}
        dragConfig={{ handle: DRAG_HANDLE }}
        resizeConfig={{ handles: ["se"] }}
        onLayoutChange={handleLayoutChange}
        autoSize
      >
        {widgets.map((w, i) => (
          <div key={w.spec.id}>
            <WidgetCard widget={w} dragHandleClass="drag-handle" className="h-full" index={i} />
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  );
}
