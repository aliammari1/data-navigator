"use client";

import { ChannelsWidget } from "@/features/desktop/components/widgets/channels-widget";
import { ClockWidget } from "@/features/desktop/components/widgets/clock-widget";
import { KpiWidget } from "@/features/desktop/components/widgets/kpi-widget";
import { SparklineWidget } from "@/features/desktop/components/widgets/sparkline-widget";
import type { WidgetTelecomData } from "@/features/desktop/components/widgets/use-widget-telecom-data";
import type { DesktopWidget } from "@/features/desktop/store/desktop-store";

/**
 * Widget registry — single source of truth mapping a `DesktopWidget.type` to its
 * renderer, default card size, and whether it needs live telecom analytics.
 *
 * `renderWidgetBody` returns the inner body for a widget (no chrome); the
 * `WidgetsLayer` wraps it in the draggable glass card. Telecom-backed widgets
 * receive the shared `WidgetTelecomData`; the clock ignores it.
 */
export interface WidgetSize {
  w: number;
  h: number;
}

interface WidgetDefinition {
  /** Default card footprint in px (used when laying out new widgets). */
  size: WidgetSize;
  /** Whether this widget reads from the live telecom analytics pipeline. */
  needsData: boolean;
  /** Human label (French) for menus / accessibility. */
  label: string;
}

export const WIDGET_DEFINITIONS: Record<DesktopWidget["type"], WidgetDefinition> = {
  kpi: { size: { w: 180, h: 116 }, needsData: true, label: "Indicateur" },
  sparkline: { size: { w: 220, h: 116 }, needsData: true, label: "Courbe horaire" },
  channels: { size: { w: 220, h: 168 }, needsData: true, label: "Canaux" },
  clock: { size: { w: 180, h: 116 }, needsData: false, label: "Horloge" },
};

/** Default footprint for a widget type (fallback 180×116 for unknown types). */
export function widgetSize(type: DesktopWidget["type"]): WidgetSize {
  return WIDGET_DEFINITIONS[type]?.size ?? { w: 180, h: 116 };
}

/**
 * Render a widget's inner body for the given type.
 * Returns `null` for an unknown type so the layer can skip it gracefully.
 */
export function renderWidgetBody(widget: DesktopWidget, data: WidgetTelecomData): React.ReactNode {
  switch (widget.type) {
    case "kpi":
      return <KpiWidget data={data} config={widget.config} />;
    case "sparkline":
      return <SparklineWidget data={data} config={widget.config} />;
    case "channels":
      return <ChannelsWidget data={data} config={widget.config} />;
    case "clock":
      return <ClockWidget config={widget.config} />;
    default:
      return null;
  }
}
