"use client";
/**
 * CanvasV3 — react-grid-layout drag/resize canvas.
 * - Yjs-persisted layout
 * - Stagger entrance animations
 * - Generative UI target: widgets materialize as agent calls useFrontendTool
 */

import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { ResponsiveGridLayout } from "react-grid-layout";
import type { ResponsiveLayouts } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import * as Y from "yjs";
import { WidgetCardV3 } from "./WidgetCardV3";
import { useAgentStore } from "@/lib/stores/agent-store";
import type { WidgetState } from "@/lib/agent-canvas/types";

const DRAG_HANDLE = ".drag-handle";

// ─── Yjs layout persistence ───────────────────────────────────────────────────

let _yjsDoc: Y.Doc | null = null;

function getYjsDoc(): Y.Doc {
  if (!_yjsDoc) {
    _yjsDoc = new Y.Doc();
  }
  return _yjsDoc;
}

// ─── Build responsive layouts from widget specs ───────────────────────────────

function buildLayouts(widgets: WidgetState[]): ResponsiveLayouts<string> {
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
          <p className="text-xs text-slate-600">
            Widgets appear here as the agent completes them
          </p>
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

export function CanvasV3() {
  const { widgets, running } = useAgentStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);
  const yjsDoc = useMemo(() => getYjsDoc(), []);
  const layoutMap = yjsDoc.getMap("layouts");

  // Measure container width
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

  // Build layouts from specs (or Yjs-persisted if available)
  const layouts = useMemo<ResponsiveLayouts<string>>(() => {
    return buildLayouts(widgets);
  }, [widgets]);

  // Persist layout changes to Yjs
  const handleLayoutChange = useCallback(
    (_: unknown, allLayouts: ResponsiveLayouts<string>) => {
      yjsDoc.transact(() => {
        layoutMap.set("layouts", allLayouts);
      });
    },
    [yjsDoc, layoutMap],
  );

  // Map widget id → latest state
  const widgetMap = useMemo(() => {
    const m = new Map<string, WidgetState>();
    for (const w of widgets) m.set(w.spec.id, w);
    return m;
  }, [widgets]);

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
        {widgets.map((w, i) => {
          const current = widgetMap.get(w.spec.id) ?? w;
          return (
            <div key={w.spec.id}>
              <WidgetCardV3
                widget={current}
                dragHandleClass="drag-handle"
                className="h-full"
                index={i}
              />
            </div>
          );
        })}
      </ResponsiveGridLayout>
    </div>
  );
}
