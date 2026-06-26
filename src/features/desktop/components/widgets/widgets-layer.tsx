"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDashboardHistoryStore } from "@/features/dashboard-home/store/dashboard-history-store";
import {
  type ContextMenuState,
  IconContextMenu,
  type MenuItem,
} from "@/features/desktop/components/icon-context-menu";
import { KPI_METRICS } from "@/features/desktop/components/widgets/kpi-widget";
import { useWidgetTelecomData } from "@/features/desktop/components/widgets/use-widget-telecom-data";
import {
  renderWidgetBody,
  widgetSize,
} from "@/features/desktop/components/widgets/widget-registry";
import {
  type DesktopWidget,
  useDesktopActions,
  useWidgets,
} from "@/features/desktop/store/desktop-store";

/**
 * WidgetsLayer — renders the durable desktop widgets (`useWidgets()`) as
 * free-positioned, pointer-draggable glass cards on the desktop canvas.
 *
 * - Telecom widgets (KPI / sparkline / channels) pull REAL data from
 *   `useTelecomAnalytics` via a single shared `useWidgetTelecomData()` call.
 * - Each card has a small × (removeWidget) and a right-click menu.
 * - Drags persist through `moveWidget`. Tasteful empty: nothing renders when
 *   there are no widgets (and the heavy analytics hook is not even mounted).
 *
 * Mount this on the desktop canvas above the wallpaper and below the windows.
 */
export function WidgetsLayer() {
  const widgets = useWidgets();
  if (widgets.length === 0) return null;
  return <WidgetsLayerInner widgets={widgets} />;
}

function WidgetsLayerInner({ widgets }: { widgets: DesktopWidget[] }) {
  const data = useWidgetTelecomData();
  const { moveWidget, removeWidget, updateWidgetConfig } = useDesktopActions();
  const doRemoveWidget = useDashboardHistoryStore((s) => s.doRemoveWidget);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setContainerSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const dragInfo = useRef<{
    id: string;
    offX: number;
    offY: number;
    moved: boolean;
  } | null>(null);
  const [menu, setMenu] = useState<(ContextMenuState & { items: MenuItem[] }) | null>(null);

  const clampPos = (x: number, y: number, sw: number, sh: number) => ({
    x: containerSize.w > 0 ? Math.max(0, Math.min(x, containerSize.w - sw)) : x,
    y: containerSize.h > 0 ? Math.max(0, Math.min(y, containerSize.h - sh)) : y,
  });

  const onPointerDown = (e: React.PointerEvent, w: DesktopWidget) => {
    if (e.button !== 0) return;
    // Ignore drags that start on the close button.
    if ((e.target as HTMLElement).closest("[data-widget-close]")) return;
    dragInfo.current = {
      id: w.id,
      offX: e.clientX - w.x,
      offY: e.clientY - w.y,
      moved: false,
    };
    setDrag({ id: w.id, x: w.x, y: w.y });
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const info = dragInfo.current;
    if (!info) return;
    info.moved = true;
    const widget = widgets.find((wid) => wid.id === info.id);
    const size = widget ? widgetSize(widget.type) : { w: 0, h: 0 };
    const rawX = Math.max(0, e.clientX - info.offX);
    const rawY = Math.max(0, e.clientY - info.offY);
    setDrag({ id: info.id, ...clampPos(rawX, rawY, size.w, size.h) });
  };

  const onPointerUp = () => {
    const info = dragInfo.current;
    dragInfo.current = null;
    const current = drag;
    setDrag(null);
    if (!info || !info.moved || !current) return;
    moveWidget(info.id, current.x, current.y);
  };

  const openMenu = (e: React.MouseEvent, w: DesktopWidget) => {
    e.preventDefault();
    e.stopPropagation();

    const configItems: MenuItem[] = [];
    if (w.type === "kpi") {
      for (const m of KPI_METRICS) {
        configItems.push({
          label: m.label,
          onClick: () => updateWidgetConfig(w.id, { ...w.config, metric: m.id }),
        });
      }
      configItems.push({ label: "──────", onClick: () => {} });
    }

    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        ...configItems,
        {
          label: "Retirer le widget",
          danger: true,
          onClick: () => {
            const label =
              w.type === "kpi"
                ? `Indicateur (${String(w.config.metric ?? "")})`
                : w.type === "pinned-chart"
                  ? String(w.config.title ?? "Graphique")
                  : w.type;
            doRemoveWidget(w.id, w.type, w.config, w.x, w.y, label);
          },
        },
      ],
    });
  };

  return (
    <div ref={containerRef} className="absolute inset-0">
      {widgets.map((w) => {
        const size = widgetSize(w.type);
        const rawPos = drag?.id === w.id ? drag : { x: w.x, y: w.y };
        const pos = clampPos(rawPos.x, rawPos.y, size.w, size.h);
        const body = renderWidgetBody(w, data);
        if (body === null) return null;
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: desktop widget tile — pointer-drag moves, right-click menu; removal is via the × button.
          <div
            key={w.id}
            className="group absolute select-none rounded-2xl border p-3 shadow-[var(--glass-shadow)]"
            style={{
              left: pos.x,
              top: pos.y,
              width: size.w,
              height: size.h,
              background: "var(--glass-bg)",
              borderColor: "var(--glass-border)",
              backdropFilter: "blur(20px) saturate(140%)",
              WebkitBackdropFilter: "blur(20px) saturate(140%)",
              cursor: drag?.id === w.id ? "grabbing" : "grab",
              zIndex: drag?.id === w.id ? 60 : 20,
              opacity: drag?.id === w.id ? 0.95 : 1,
            }}
            onPointerDown={(e) => onPointerDown(e, w)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onContextMenu={(e) => openMenu(e, w)}
          >
            <button
              type="button"
              data-widget-close
              aria-label="Retirer le widget"
              onClick={() => {
                const label =
                  w.type === "kpi"
                    ? `Indicateur (${String(w.config.metric ?? "")})`
                    : w.type === "pinned-chart"
                      ? String(w.config.title ?? "Graphique")
                      : w.type;
                doRemoveWidget(w.id, w.type, w.config, w.x, w.y, label);
              }}
              className="absolute right-1.5 top-1.5 z-10 grid size-5 place-items-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
              style={{
                background: "var(--glass-bg-strong)",
                color: "var(--glass-text-dim)",
                border: "1px solid var(--glass-hairline)",
              }}
            >
              <X className="size-3" />
            </button>
            <div className="h-full" style={{ color: "var(--glass-text)" }}>
              {body}
            </div>
          </div>
        );
      })}

      <IconContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
