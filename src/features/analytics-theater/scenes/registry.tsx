"use client";

/**
 * Lazy scene registry. Each scene is its own `next/dynamic` chunk (`ssr:false`)
 * so the heavy ECharts surface for an inactive scene is never parsed — the route
 * chunk stays small and only the visible scene's code loads.
 */

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { SceneLoadingState } from "../components/scene-states";
import type { SceneKind } from "../model/scene";

const loading = () => <SceneLoadingState label="Loading scene…" />;

export const SCENE_COMPONENTS: Record<SceneKind, ComponentType> = {
  calendar: dynamic(() => import("./CalendarScene"), { ssr: false, loading }),
  race: dynamic(() => import("./RaceScene"), { ssr: false, loading }),
  sankey: dynamic(() => import("./SankeyScene"), { ssr: false, loading }),
  gantt: dynamic(() => import("./GanttScene"), { ssr: false, loading }),
  wordcloud: dynamic(() => import("./WordCloudScene"), { ssr: false, loading }),
  sunburst: dynamic(() => import("./SunburstScene"), { ssr: false, loading }),
};
