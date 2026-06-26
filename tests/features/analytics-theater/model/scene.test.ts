/**
 * Unit tests for src/features/analytics-theater/model/scene.ts
 *
 * The module is fully pure — no IO, no DOM, no external deps — so all
 * branches and every exported function can be exercised directly.
 *
 * Coverage targets:
 * - SCENE_DEFINITIONS constant (shape and content)
 * - sceneDefinition(): found path and not-found fallback (?? branch)
 * - newSceneId(): format and monotonically-increasing counter
 * - newTheaterId(): format and monotonically-increasing counter
 * - defaultTheater(): shape, field mapping, and scene count
 */

import { describe, it, expect } from "vitest";
import {
  SCENE_DEFINITIONS,
  sceneDefinition,
  newSceneId,
  newTheaterId,
  defaultTheater,
} from "@/features/analytics-theater/model/scene";
import type { SceneKind, SceneDefinition, TheaterScene, Theater } from "@/features/analytics-theater/model/scene";

// ─── SCENE_DEFINITIONS constant ──────────────────────────────────────────────

describe("SCENE_DEFINITIONS", () => {
  it("contains exactly 6 scene entries", () => {
    expect(SCENE_DEFINITIONS).toHaveLength(6);
  });

  it("includes all expected SceneKind values in order", () => {
    const kinds = SCENE_DEFINITIONS.map((s) => s.kind);
    expect(kinds).toEqual(["calendar", "race", "sankey", "gantt", "wordcloud", "sunburst"]);
  });

  it("every entry has a non-empty label and subtitle", () => {
    for (const def of SCENE_DEFINITIONS) {
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.subtitle.length).toBeGreaterThan(0);
    }
  });

  it("calendar entry has correct label and subtitle", () => {
    const def = SCENE_DEFINITIONS.find((s) => s.kind === "calendar");
    expect(def).toBeDefined();
    expect(def!.label).toBe("Calendar Heatmap");
    expect(def!.subtitle).toContain("Daily aggregated volume");
  });

  it("race entry has correct label and subtitle", () => {
    const def = SCENE_DEFINITIONS.find((s) => s.kind === "race");
    expect(def).toBeDefined();
    expect(def!.label).toBe("Category Race");
    expect(def!.subtitle).toContain("Animated cumulative ranking");
  });

  it("sankey entry has correct label and subtitle", () => {
    const def = SCENE_DEFINITIONS.find((s) => s.kind === "sankey");
    expect(def).toBeDefined();
    expect(def!.label).toBe("Flow");
    expect(def!.subtitle).toContain("Value flowing from one category");
  });

  it("gantt entry has correct label and subtitle", () => {
    const def = SCENE_DEFINITIONS.find((s) => s.kind === "gantt");
    expect(def).toBeDefined();
    expect(def!.label).toBe("Activity");
    expect(def!.subtitle).toContain("Hourly activity intensity");
  });

  it("wordcloud entry has correct label and subtitle", () => {
    const def = SCENE_DEFINITIONS.find((s) => s.kind === "wordcloud");
    expect(def).toBeDefined();
    expect(def!.label).toBe("Word Cloud");
    expect(def!.subtitle).toContain("Token frequencies");
  });

  it("sunburst entry has correct label and subtitle", () => {
    const def = SCENE_DEFINITIONS.find((s) => s.kind === "sunburst");
    expect(def).toBeDefined();
    expect(def!.label).toBe("Hierarchy");
    expect(def!.subtitle).toContain("Two-level hierarchical breakdown");
  });
});

// ─── sceneDefinition() ───────────────────────────────────────────────────────

describe("sceneDefinition", () => {
  it("returns the matching definition when kind is 'calendar'", () => {
    // Arrange / Act
    const result = sceneDefinition("calendar");

    // Assert
    expect(result.kind).toBe("calendar");
    expect(result.label).toBe("Calendar Heatmap");
  });

  it("returns the matching definition when kind is 'race'", () => {
    const result = sceneDefinition("race");
    expect(result.kind).toBe("race");
  });

  it("returns the matching definition when kind is 'sankey'", () => {
    const result = sceneDefinition("sankey");
    expect(result.kind).toBe("sankey");
  });

  it("returns the matching definition when kind is 'gantt'", () => {
    const result = sceneDefinition("gantt");
    expect(result.kind).toBe("gantt");
  });

  it("returns the matching definition when kind is 'wordcloud'", () => {
    const result = sceneDefinition("wordcloud");
    expect(result.kind).toBe("wordcloud");
  });

  it("returns the matching definition when kind is 'sunburst'", () => {
    const result = sceneDefinition("sunburst");
    expect(result.kind).toBe("sunburst");
  });

  it("falls back to SCENE_DEFINITIONS[0] (calendar) when kind is not found — covers ?? branch", () => {
    // Cast to SceneKind to bypass type checking; exercises the ?? fallback path.
    const result = sceneDefinition("unknown" as SceneKind);

    expect(result).toBe(SCENE_DEFINITIONS[0]);
    expect(result.kind).toBe("calendar");
  });

  it("returns the same object reference as the one in SCENE_DEFINITIONS for a valid kind", () => {
    const result = sceneDefinition("sunburst");
    expect(result).toBe(SCENE_DEFINITIONS[SCENE_DEFINITIONS.length - 1]);
  });
});

// ─── newSceneId() ─────────────────────────────────────────────────────────────

describe("newSceneId", () => {
  it("returns a string starting with 'scene_'", () => {
    const id = newSceneId();
    expect(id).toMatch(/^scene_/);
  });

  it("returns a string with three underscore-separated segments", () => {
    const id = newSceneId();
    const parts = id.split("_");
    // "scene", <base36 timestamp>, <base36 counter>
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("scene");
  });

  it("returns unique ids across multiple calls (counter increments)", () => {
    const ids = Array.from({ length: 10 }, () => newSceneId());
    const unique = new Set(ids);
    expect(unique.size).toBe(10);
  });

  it("each successive id has a counter portion that is strictly greater", () => {
    // Compare the counter suffix parsed from base36
    const id1 = newSceneId();
    const id2 = newSceneId();

    const counter1 = parseInt(id1.split("_")[2], 36);
    const counter2 = parseInt(id2.split("_")[2], 36);

    expect(counter2).toBeGreaterThan(counter1);
  });
});

// ─── newTheaterId() ───────────────────────────────────────────────────────────

describe("newTheaterId", () => {
  it("returns a string starting with 'theater_'", () => {
    const id = newTheaterId();
    expect(id).toMatch(/^theater_/);
  });

  it("returns a string with three underscore-separated segments", () => {
    const id = newTheaterId();
    const parts = id.split("_");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("theater");
  });

  it("returns unique ids across multiple calls", () => {
    const ids = Array.from({ length: 10 }, () => newTheaterId());
    const unique = new Set(ids);
    expect(unique.size).toBe(10);
  });

  it("each successive theater id has a counter portion greater than the previous", () => {
    const id1 = newTheaterId();
    const id2 = newTheaterId();

    const counter1 = parseInt(id1.split("_")[2], 36);
    const counter2 = parseInt(id2.split("_")[2], 36);

    expect(counter2).toBeGreaterThan(counter1);
  });

  it("counter is shared with newSceneId so interleaved calls still produce unique values", () => {
    const scene = newSceneId();
    const theater = newTheaterId();
    const scene2 = newSceneId();

    const c1 = parseInt(scene.split("_")[2], 36);
    const c2 = parseInt(theater.split("_")[2], 36);
    const c3 = parseInt(scene2.split("_")[2], 36);

    expect(c2).toBeGreaterThan(c1);
    expect(c3).toBeGreaterThan(c2);
  });
});

// ─── defaultTheater() ─────────────────────────────────────────────────────────

describe("defaultTheater", () => {
  it("returns a Theater with the provided datasetId and name", () => {
    // Arrange / Act
    const theater = defaultTheater("ds-42", "My Theater");

    // Assert
    expect(theater.datasetId).toBe("ds-42");
    expect(theater.name).toBe("My Theater");
  });

  it("id starts with 'theater_'", () => {
    const theater = defaultTheater("ds-1", "T");
    expect(theater.id).toMatch(/^theater_/);
  });

  it("createdAt and updatedAt are set to approximately Date.now()", () => {
    const before = Date.now();
    const theater = defaultTheater("ds-1", "T");
    const after = Date.now();

    expect(theater.createdAt).toBeGreaterThanOrEqual(before);
    expect(theater.createdAt).toBeLessThanOrEqual(after);
    expect(theater.updatedAt).toBeGreaterThanOrEqual(before);
    expect(theater.updatedAt).toBeLessThanOrEqual(after);
  });

  it("createdAt and updatedAt are equal (set from the same Date.now() call)", () => {
    const theater = defaultTheater("ds-1", "T");
    expect(theater.createdAt).toBe(theater.updatedAt);
  });

  it("scenes array length matches SCENE_DEFINITIONS length (6 scenes)", () => {
    const theater = defaultTheater("ds-1", "T");
    expect(theater.scenes).toHaveLength(SCENE_DEFINITIONS.length);
    expect(theater.scenes).toHaveLength(6);
  });

  it("each scene id starts with 'scene_'", () => {
    const theater = defaultTheater("ds-1", "T");
    for (const scene of theater.scenes) {
      expect(scene.id).toMatch(/^scene_/);
    }
  });

  it("each scene kind matches the corresponding SCENE_DEFINITIONS entry in order", () => {
    const theater = defaultTheater("ds-1", "T");
    for (let i = 0; i < SCENE_DEFINITIONS.length; i++) {
      expect(theater.scenes[i].kind).toBe(SCENE_DEFINITIONS[i].kind);
    }
  });

  it("each scene title maps to the definition's label", () => {
    const theater = defaultTheater("ds-1", "T");
    for (let i = 0; i < SCENE_DEFINITIONS.length; i++) {
      expect(theater.scenes[i].title).toBe(SCENE_DEFINITIONS[i].label);
    }
  });

  it("each scene narration maps to the definition's subtitle", () => {
    const theater = defaultTheater("ds-1", "T");
    for (let i = 0; i < SCENE_DEFINITIONS.length; i++) {
      expect(theater.scenes[i].narration).toBe(SCENE_DEFINITIONS[i].subtitle);
    }
  });

  it("each scene id is unique within the theater", () => {
    const theater = defaultTheater("ds-1", "T");
    const ids = theater.scenes.map((s) => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("different calls produce different theater ids", () => {
    const t1 = defaultTheater("ds-1", "T1");
    const t2 = defaultTheater("ds-1", "T2");
    expect(t1.id).not.toBe(t2.id);
  });

  it("returns a Theater whose shape satisfies the Theater interface fully", () => {
    const theater: Theater = defaultTheater("ds-test", "Full Check");

    expect(typeof theater.id).toBe("string");
    expect(typeof theater.name).toBe("string");
    expect(typeof theater.datasetId).toBe("string");
    expect(Array.isArray(theater.scenes)).toBe(true);
    expect(typeof theater.createdAt).toBe("number");
    expect(typeof theater.updatedAt).toBe("number");
  });

  it("each scene satisfies the TheaterScene interface shape", () => {
    const theater = defaultTheater("ds-test", "Shape Check");
    for (const scene of theater.scenes) {
      const s: TheaterScene = scene;
      expect(typeof s.id).toBe("string");
      expect(typeof s.kind).toBe("string");
      expect(typeof s.title).toBe("string");
      expect(typeof s.narration).toBe("string");
    }
  });

  it("first scene (calendar) has the correct narration from its subtitle", () => {
    const theater = defaultTheater("ds-1", "T");
    const firstScene = theater.scenes[0];
    expect(firstScene.kind).toBe("calendar");
    expect(firstScene.narration).toContain("Daily aggregated volume");
  });

  it("last scene (sunburst) has the correct narration from its subtitle", () => {
    const theater = defaultTheater("ds-1", "T");
    const lastScene = theater.scenes[theater.scenes.length - 1];
    expect(lastScene.kind).toBe("sunburst");
    expect(lastScene.narration).toContain("Two-level hierarchical breakdown");
  });
});

// ─── Type exports (compile-time; verified via type assertions above) ──────────

describe("exported types", () => {
  it("SceneDefinition objects from SCENE_DEFINITIONS conform to the exported interface", () => {
    // If this compiles, the types are correct.
    const def: SceneDefinition = SCENE_DEFINITIONS[0];
    expect(def.kind).toBeDefined();
    expect(def.label).toBeDefined();
    expect(def.subtitle).toBeDefined();
  });
});
