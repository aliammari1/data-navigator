"use client";

import { AmountWidget } from "@/features/desktop/components/widgets/amount-widget";
import { ChannelsWidget } from "@/features/desktop/components/widgets/channels-widget";
import { ClockWidget } from "@/features/desktop/components/widgets/clock-widget";
import { CustomersWidget } from "@/features/desktop/components/widgets/customers-widget";
import { DailyTrendWidget } from "@/features/desktop/components/widgets/daily-trend-widget";
import { HourlyBarWidget } from "@/features/desktop/components/widgets/hourly-bar-widget";
import { KpiWidget } from "@/features/desktop/components/widgets/kpi-widget";
import { MiniReportWidget } from "@/features/desktop/components/widgets/mini-report-widget";
import { PinnedChartWidget } from "@/features/desktop/components/widgets/pinned-chart-widget";
import { RevenueGroupWidget } from "@/features/desktop/components/widgets/revenue-group-widget";
import { SparklineWidget } from "@/features/desktop/components/widgets/sparkline-widget";
import { StatusDonutWidget } from "@/features/desktop/components/widgets/status-donut-widget";
import { SuccessRateWidget } from "@/features/desktop/components/widgets/success-rate-widget";
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
  amount: { size: { w: 180, h: 116 }, needsData: true, label: "Montant" },
  customers: { size: { w: 180, h: 116 }, needsData: true, label: "Abonnés" },
  "status-donut": { size: { w: 220, h: 140 }, needsData: true, label: "Statuts" },
  "hourly-bar": { size: { w: 260, h: 116 }, needsData: true, label: "Volume / heure" },
  "mini-report": { size: { w: 200, h: 180 }, needsData: true, label: "Mini rapport" },
  "pinned-chart": { size: { w: 300, h: 200 }, needsData: false, label: "Graphique épinglé" },
  "revenue-group": { size: { w: 220, h: 168 }, needsData: true, label: "Revenu / groupe" },
  "success-rate": { size: { w: 220, h: 168 }, needsData: true, label: "Taux par groupe" },
  "daily-trend": { size: { w: 260, h: 116 }, needsData: true, label: "Tendance journalière" },
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
    case "amount":
      return <AmountWidget data={data} config={widget.config} />;
    case "customers":
      return <CustomersWidget data={data} config={widget.config} />;
    case "status-donut":
      return <StatusDonutWidget data={data} config={widget.config} />;
    case "hourly-bar":
      return <HourlyBarWidget data={data} config={widget.config} />;
    case "mini-report":
      return <MiniReportWidget data={data} config={widget.config} />;
    case "pinned-chart":
      return <PinnedChartWidget config={widget.config} />;
    case "revenue-group":
      return <RevenueGroupWidget data={data} config={widget.config} />;
    case "success-rate":
      return <SuccessRateWidget data={data} config={widget.config} />;
    case "daily-trend":
      return <DailyTrendWidget data={data} config={widget.config} />;
    default:
      return null;
  }
}
