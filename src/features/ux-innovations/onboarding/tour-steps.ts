/**
 * Tour steps — DERIVED from the real dashboard nav config, never hardcoded
 * routes. The former tour pointed at selectors for routes that didn't exist
 * (`ai-briefing`, `forecast`, `geo-analysis`, …) and silently failed to anchor;
 * sourcing steps from `NAV_SECTIONS` guarantees the tour can only ever target
 * routes the sidebar actually renders, and a runtime presence filter
 * (`useTour`) skips any whose element is momentarily absent.
 */

import type { DriveStep } from "driver.js";
import { NAV_SECTIONS } from "@/features/dashboard-shell/nav/nav-config";

/** Hand-written blurbs for marquee screens; falls back to the nav description. */
const TOUR_BLURBS: Record<string, string> = {
  "/dashboard/upload":
    "Import CSV or Excel files. Everything is parsed locally with DuckDB — no upload to any server.",
  "/dashboard/ai-briefing":
    "Offline AI briefings, anomaly reports, and action plans powered by a local LLM — no internet required.",
  "/dashboard/forecast":
    "Forecast future values and run what-if scenarios with Holt-Winters and clustering, entirely in-browser.",
  "/dashboard/geo-analysis":
    "Map your data by region with self-hosted tiles. Spot geographic hotspots at a glance.",
  "/dashboard/analytics-theater":
    "Export board-ready PDF, PowerPoint, and Word reports in one click — rendered off the main thread.",
  "/dashboard/monitor": "Configure alerts and watch live operations against your KPI thresholds.",
  "/dashboard/collaborative":
    "Share workspaces with your team over the LAN. No cloud — everything stays on your local network.",
};

/** Curated subset (in order) of nav hrefs to feature in the walkthrough. */
const TOUR_ORDER = [
  "/dashboard/upload",
  "/dashboard/telecom-report",
  "/dashboard/ai-briefing",
  "/dashboard/forecast",
  "/dashboard/geo-analysis",
  "/dashboard/analytics-theater",
  "/dashboard/monitor",
  "/dashboard/collaborative",
];

const ALL_NAV = NAV_SECTIONS.flatMap((s) => s.items);

export const TOUR_STEPS: DriveStep[] = [
  {
    element: "body",
    popover: {
      title: "Welcome to Data Navigator",
      description:
        "A quick 2-minute tour of your offline-first analytics workspace. Use Next / Back to move through it.",
      align: "center",
    },
  },
  ...TOUR_ORDER.flatMap((href): DriveStep[] => {
    const item = ALL_NAV.find((n) => n.href === href);
    if (!item) return [];
    return [
      {
        element: `[href="${href}"]`,
        popover: {
          title: item.title,
          description: TOUR_BLURBS[href] ?? item.description,
          side: "right",
          align: "start",
        },
      },
    ];
  }),
];
