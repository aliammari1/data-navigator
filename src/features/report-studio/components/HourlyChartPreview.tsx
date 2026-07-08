"use client";

/**
 * On-screen preview of the hourly distribution chart — rendered with the shared
 * OffscreenChart (ECharts in an OffscreenCanvas worker, off the main thread).
 * Same series the exports embed, so the preview matches the output. Heavy chart
 * → OffscreenChart per the platform viz rules (never DOM-screenshot, never a
 * main-thread full ECharts mount).
 */

import { memo, useMemo } from "react";
import { OffscreenChart, buildLineOption } from "@/platform/viz";
import type { ReportHourly } from "../lib/types";

function HourlyChartPreviewImpl({
  hourly,
  primaryColor = "#0066cc",
}: {
  hourly: ReportHourly[];
  primaryColor?: string;
}) {
  const option = useMemo(() => {
    const categories = hourly.map((h) => `${h.hour}:00`);
    return buildLineOption(
      categories,
      [
        { name: "Transactions", data: hourly.map((h) => Math.round(h.count)), color: primaryColor },
        {
          name: "Success Rate %",
          data: hourly.map((h) => Number(h.successRate.toFixed(1))),
          color: "#00aa44",
        },
      ],
      { title: "Hourly Transaction Distribution" },
    );
  }, [hourly, primaryColor]);

  if (hourly.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
        No hourly time-series available for this dataset.
      </div>
    );
  }
  return <OffscreenChart option={option} height={280} />;
}

export const HourlyChartPreview = memo(HourlyChartPreviewImpl);
