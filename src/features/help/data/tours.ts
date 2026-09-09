/**
 * Guided-tour definitions (driver.js, route-aware).
 *
 * Plain data module (no `"use client"`) so it can be imported by the runner,
 * the launcher UI, and the command palette without dragging in the component
 * tree.
 *
 * Design rules (see `docs/planning/v2/features/help.md` §4.3):
 * - Anchor steps on **durable selectors** — sidebar `[href="/dashboard/…"]`
 *   links and the existing orphan `[data-tour="…"]` anchors — not transient
 *   DOM. The runner skips any step whose target never appears, so missing
 *   anchors degrade gracefully instead of stalling the tour.
 * - Carry an optional `route` so a global tour can navigate between pages
 *   mid-tour (the runner pushes the route and waits for the target).
 * - `element: "body"` (or omitted) renders a centred, anchor-less popover
 *   (welcome / outro). These are never skipped.
 *
 * All copy is local; never reintroduce external links.
 */

import type { DriveStep } from "driver.js";

export interface TourStepDef extends Omit<DriveStep, "element"> {
  /**
   * CSS selector for the highlighted element, OR `"body"` for an anchor-less
   * centred popover. Prefer durable selectors (`[href="…"]`,
   * `[data-tour="…"]`).
   */
  element: string;
  /** App Router path to navigate to before showing this step. */
  route?: string;
}

export interface TourDefinition {
  id: string;
  title: string;
  description: string;
  steps: TourStepDef[];
}

/** A step that needs no DOM anchor (centred welcome / outro popover). */
export function isAnchorlessStep(step: TourStepDef): boolean {
  return step.element === "body" || step.element === "";
}

/**
 * Global first-run product tour across the core dashboard surfaces.
 * Targets the durable sidebar nav links (`[href="/dashboard/…"]`) which exist
 * whenever the dashboard shell is rendered.
 */
export const GLOBAL_TOUR: TourDefinition = {
  id: "global-onboarding",
  title: "Welcome tour",
  description: "A 2-minute offline walkthrough of the core features.",
  steps: [
    {
      element: "body",
      popover: {
        title: "Welcome to DataNavigator",
        description:
          "A 2-minute, fully-offline tour of the key features. Use Next/Back, or press Esc to leave at any time — your progress is saved on this device.",
        align: "center",
      },
    },
    {
      route: "/dashboard/upload",
      element: '[href="/dashboard/upload"]',
      popover: {
        title: "Upload data",
        description:
          "Import CSV / JSON / XLSX / TSV. Columns are auto-typed and loaded into DuckDB WASM for SQL — all in your browser, nothing uploaded.",
        side: "right",
        align: "start",
      },
    },
    {
      route: "/dashboard/collaborative",
      element: '[href="/dashboard/collaborative"]',
      popover: {
        title: "Collaboration",
        description:
          "Comments, presence and change tracking via Yjs CRDTs — works offline-first and syncs over your LAN when peers reconnect.",
        side: "right",
        align: "start",
      },
    },
    {
      route: "/dashboard/help",
      element: '[href="/dashboard/help"]',
      popover: {
        title: "Help is always here",
        description:
          "Search features and FAQ, view shortcuts, leave local feedback, or replay this tour any time from the Help page.",
        side: "right",
        align: "start",
      },
    },
    {
      element: "body",
      popover: {
        title: "You're set",
        description:
          "That's the whirlwind tour. Everything runs on this device, fully offline. Happy analysing!",
        align: "center",
      },
    },
  ],
};

/** Every tour the launcher / palette can offer. The global tour comes first. */
export const ALL_TOURS: readonly TourDefinition[] = [GLOBAL_TOUR] as const;
