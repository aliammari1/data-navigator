/**
 * Scene / Theater model — the heart of the "theater".
 *
 * A theater is an ordered list of scenes bound to a dataset. Each scene is a
 * single visualization driven by ONE DuckDB aggregation over the active
 * dataset's view (no synthetic data, no per-render fabrication). This replaces
 * the old hardcoded `TABS` array.
 */

export type SceneKind =
  | "calendar"
  | "race"
  | "sankey"
  | "gantt"
  | "wordcloud"
  | "sunburst";

export interface SceneDefinition {
  kind: SceneKind;
  /** Short label shown on the tab / step marker. */
  label: string;
  /** Longer narration shown as the scene caption and used for TTS / export notes. */
  subtitle: string;
}

/**
 * Canonical, ordered scene list. Each entry maps to a lazy-loaded scene module.
 * Authored theaters reference these by `kind`; the order here is the default
 * presentation order.
 */
export const SCENE_DEFINITIONS: readonly SceneDefinition[] = [
  {
    kind: "calendar",
    label: "Calendar Heatmap",
    subtitle:
      "Daily aggregated volume across the dataset's date range — spot seasonal patterns and anomalies at a glance.",
  },
  {
    kind: "race",
    label: "Category Race",
    subtitle:
      "Animated cumulative ranking of the top categories over time — watch who leads as the days progress.",
  },
  {
    kind: "sankey",
    label: "Flow",
    subtitle:
      "Value flowing from one category to another, sized by the aggregated measure.",
  },
  {
    kind: "gantt",
    label: "Activity",
    subtitle:
      "Hourly activity intensity per category — when is each category busiest?",
  },
  {
    kind: "wordcloud",
    label: "Word Cloud",
    subtitle:
      "Token frequencies from a free-text column — surface recurring themes and error phrases.",
  },
  {
    kind: "sunburst",
    label: "Hierarchy",
    subtitle:
      "Two-level hierarchical breakdown of the measure by category and sub-category.",
  },
] as const;

export function sceneDefinition(kind: SceneKind): SceneDefinition {
  return (
    SCENE_DEFINITIONS.find((s) => s.kind === kind) ?? SCENE_DEFINITIONS[0]
  );
}

/** A scene as stored inside an authored theater (with editable narration). */
export interface TheaterScene {
  id: string;
  kind: SceneKind;
  title: string;
  /** Narration shown as caption + optional offline TTS + export speaker notes. */
  narration: string;
}

/** A persisted, authored presentation: an ordered list of scenes for a dataset. */
export interface Theater {
  id: string;
  name: string;
  datasetId: string;
  scenes: TheaterScene[];
  createdAt: number;
  updatedAt: number;
}

let counter = 0;
/** Monotonic, collision-resistant id without pulling in a uuid dependency. */
export function newSceneId(): string {
  counter += 1;
  return `scene_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export function newTheaterId(): string {
  counter += 1;
  return `theater_${Date.now().toString(36)}_${counter.toString(36)}`;
}

/**
 * Build a default theater from the canonical scene definitions, using each
 * scene's subtitle as initial narration. Authors can then edit/reorder/persist.
 */
export function defaultTheater(datasetId: string, name: string): Theater {
  const now = Date.now();
  return {
    id: newTheaterId(),
    name,
    datasetId,
    createdAt: now,
    updatedAt: now,
    scenes: SCENE_DEFINITIONS.map((def) => ({
      id: newSceneId(),
      kind: def.kind,
      title: def.label,
      narration: def.subtitle,
    })),
  };
}
