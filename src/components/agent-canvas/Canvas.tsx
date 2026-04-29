"use client";
import { useMemo, useRef, useState, useEffect } from "react";
import { ResponsiveGridLayout } from "react-grid-layout";
import type { ResponsiveLayouts } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { WidgetCard } from "./WidgetCard";
import type { WidgetState } from "@/lib/agent-canvas/types";

const DRAG_HANDLE = ".drag-handle";

interface Props {
  widgets: WidgetState[];
}

export function Canvas({ widgets }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);

  // Measure container width with ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    // Initial measure
    const rect = el.getBoundingClientRect();
    if (rect.width > 0) setWidth(rect.width);
    return () => ro.disconnect();
  }, []);

  // Build RGL layouts from widget specs
  const layouts = useMemo<ResponsiveLayouts<string>>(() => {
    const items = widgets.map((w) => ({
      i: w.spec.id,
      x: w.spec.position.x,
      y: w.spec.position.y,
      w: w.spec.position.w,
      h: w.spec.position.h,
      minW: 3,
      minH: 2,
    }));
    return {
      lg: items,
      md: items.map((l) => ({ ...l, w: Math.min(l.w, 10) })),
      sm: items.map((l) => ({ ...l, w: 4, x: 0 })),
    };
  }, [widgets]);

  // Map widget id → latest state for O(1) lookup
  const widgetMap = useMemo(() => {
    const m = new Map<string, WidgetState>();
    for (const w of widgets) m.set(w.spec.id, w);
    return m;
  }, [widgets]);

  if (widgets.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-600 text-sm">
        Waiting for plan…
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full">
      <ResponsiveGridLayout
        width={width}
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 768, sm: 480 }}
        cols={{ lg: 12, md: 10, sm: 4 }}
        rowHeight={60}
        margin={[12, 12]}
        containerPadding={[0, 0]}
        dragConfig={{ handle: DRAG_HANDLE }}
        resizeConfig={{ handles: ["se"] }}
        autoSize
      >
        {widgets.map((w) => {
          const current = widgetMap.get(w.spec.id) ?? w;
          return (
            <div key={w.spec.id} className="h-full">
              <WidgetCard
                widget={current}
                dragHandleClass="drag-handle"
                className="h-full"
              />
            </div>
          );
        })}
      </ResponsiveGridLayout>
    </div>
  );
}
