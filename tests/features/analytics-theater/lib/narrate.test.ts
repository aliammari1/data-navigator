import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  narrateScenes,
  SCENE_NARRATION_SCHEMA,
  type NarrationFacts,
  type NarrateDeps,
  type SceneNarration,
} from "@/features/analytics-theater/lib/narrate";
import type { SceneKind } from "@/features/analytics-theater/model/scene";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFacts(overrides: Partial<NarrationFacts> = {}): NarrationFacts {
  return {
    datasetName: "TestDataset",
    rowCount: 1000,
    dateColumn: "txn_date",
    measureColumn: "amount",
    categoryColumn: "channel",
    textColumn: "remarks",
    sceneKinds: ["calendar", "race"],
    ...overrides,
  };
}

function makeDeps(result: SceneNarration, signal?: AbortSignal): NarrateDeps {
  return {
    generateStructured: vi.fn().mockResolvedValue(result),
    signal,
  };
}

const FULL_RESULT: SceneNarration = {
  scenes: [
    { kind: "calendar", narration: "Calendar narration." },
    { kind: "race", narration: "Race narration." },
  ],
};

// ─── SCENE_NARRATION_SCHEMA ───────────────────────────────────────────────────

describe("SCENE_NARRATION_SCHEMA", () => {
  it("validates a well-formed scenes array", () => {
    // Arrange
    const input = {
      scenes: [
        { kind: "calendar", narration: "Valid one-sentence narration." },
        { kind: "race", narration: "Another valid sentence." },
      ],
    };

    // Act
    const result = SCENE_NARRATION_SCHEMA.safeParse(input);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scenes).toHaveLength(2);
    }
  });

  it("rejects an unknown scene kind", () => {
    // Arrange
    const input = { scenes: [{ kind: "unknown-kind", narration: "Something." }] };

    // Act
    const result = SCENE_NARRATION_SCHEMA.safeParse(input);

    // Assert
    expect(result.success).toBe(false);
  });

  it("rejects an empty narration string (min length 1)", () => {
    // Arrange
    const input = { scenes: [{ kind: "calendar", narration: "" }] };

    // Act
    const result = SCENE_NARRATION_SCHEMA.safeParse(input);

    // Assert
    expect(result.success).toBe(false);
  });

  it("rejects a narration exceeding 400 characters (max length)", () => {
    // Arrange
    const longNarration = "A".repeat(401);
    const input = { scenes: [{ kind: "calendar", narration: longNarration }] };

    // Act
    const result = SCENE_NARRATION_SCHEMA.safeParse(input);

    // Assert
    expect(result.success).toBe(false);
  });

  it("accepts exactly 400 characters", () => {
    // Arrange
    const narration = "B".repeat(400);
    const input = { scenes: [{ kind: "calendar", narration }] };

    // Act
    const result = SCENE_NARRATION_SCHEMA.safeParse(input);

    // Assert
    expect(result.success).toBe(true);
  });

  it("accepts an empty scenes array", () => {
    // Arrange
    const input = { scenes: [] };

    // Act
    const result = SCENE_NARRATION_SCHEMA.safeParse(input);

    // Assert
    expect(result.success).toBe(true);
  });

  it("accepts all valid scene kinds", () => {
    // Arrange
    const kinds: SceneKind[] = ["calendar", "race", "sankey", "gantt", "wordcloud", "sunburst"];
    const input = {
      scenes: kinds.map((kind) => ({ kind, narration: "Valid." })),
    };

    // Act
    const result = SCENE_NARRATION_SCHEMA.safeParse(input);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scenes).toHaveLength(6);
    }
  });
});

// ─── narrateScenes — basic invocation ────────────────────────────────────────

describe("narrateScenes — basic invocation", () => {
  it("calls generateStructured with the correct schema and returns kind→narration map", async () => {
    // Arrange
    const facts = makeFacts();
    const deps = makeDeps(FULL_RESULT);

    // Act
    const map = await narrateScenes(facts, deps);

    // Assert
    expect(deps.generateStructured).toHaveBeenCalledOnce();
    expect(map).toEqual({
      calendar: "Calendar narration.",
      race: "Race narration.",
    });
  });

  it("passes SCENE_NARRATION_SCHEMA as the schema argument", async () => {
    // Arrange
    const facts = makeFacts();
    const deps = makeDeps(FULL_RESULT);

    // Act
    await narrateScenes(facts, deps);

    // Assert — second arg to generateStructured must be the Zod schema
    const callArgs = vi.mocked(deps.generateStructured).mock.calls[0];
    expect(callArgs[1]).toBe(SCENE_NARRATION_SCHEMA);
  });

  it("passes signal from deps to generateStructured", async () => {
    // Arrange
    const controller = new AbortController();
    const facts = makeFacts();
    const deps = makeDeps(FULL_RESULT, controller.signal);

    // Act
    await narrateScenes(facts, deps);

    // Assert
    const callArgs = vi.mocked(deps.generateStructured).mock.calls[0];
    expect(callArgs[0].signal).toBe(controller.signal);
  });

  it("passes undefined signal when not provided in deps", async () => {
    // Arrange
    const facts = makeFacts();
    const deps = makeDeps(FULL_RESULT); // no signal

    // Act
    await narrateScenes(facts, deps);

    // Assert
    const callArgs = vi.mocked(deps.generateStructured).mock.calls[0];
    expect(callArgs[0].signal).toBeUndefined();
  });

  it("returns an empty map when result.scenes is empty", async () => {
    // Arrange
    const facts = makeFacts();
    const deps = makeDeps({ scenes: [] });

    // Act
    const map = await narrateScenes(facts, deps);

    // Assert
    expect(map).toEqual({});
  });
});

// ─── narrateScenes — prompt construction ─────────────────────────────────────

describe("narrateScenes — prompt construction", () => {
  it("includes dataset name and row count in the prompt", async () => {
    // Arrange
    const facts = makeFacts({ datasetName: "MyData", rowCount: 5000 });
    const deps = makeDeps(FULL_RESULT);

    // Act
    await narrateScenes(facts, deps);

    // Assert
    const prompt = vi.mocked(deps.generateStructured).mock.calls[0][0].prompt;
    expect(prompt).toContain('"MyData"');
    expect(prompt).toContain("5,000");
  });

  it("uses 'none' for dateColumn when null (nullish coalescing)", async () => {
    // Arrange
    const facts = makeFacts({ dateColumn: null });
    const deps = makeDeps(FULL_RESULT);

    // Act
    await narrateScenes(facts, deps);

    // Assert
    const prompt = vi.mocked(deps.generateStructured).mock.calls[0][0].prompt;
    expect(prompt).toContain("date: none");
  });

  it("uses actual dateColumn when not null", async () => {
    // Arrange
    const facts = makeFacts({ dateColumn: "created_at" });
    const deps = makeDeps(FULL_RESULT);

    // Act
    await narrateScenes(facts, deps);

    // Assert
    const prompt = vi.mocked(deps.generateStructured).mock.calls[0][0].prompt;
    expect(prompt).toContain("date: created_at");
  });

  it("uses 'row counts' for measureColumn when null (nullish coalescing)", async () => {
    // Arrange
    const facts = makeFacts({ measureColumn: null });
    const deps = makeDeps(FULL_RESULT);

    // Act
    await narrateScenes(facts, deps);

    // Assert
    const prompt = vi.mocked(deps.generateStructured).mock.calls[0][0].prompt;
    expect(prompt).toContain("measure: row counts");
  });

  it("uses actual measureColumn when not null", async () => {
    // Arrange
    const facts = makeFacts({ measureColumn: "revenue" });
    const deps = makeDeps(FULL_RESULT);

    // Act
    await narrateScenes(facts, deps);

    // Assert
    const prompt = vi.mocked(deps.generateStructured).mock.calls[0][0].prompt;
    expect(prompt).toContain("measure: revenue");
  });

  it("uses 'none' for categoryColumn when null (nullish coalescing)", async () => {
    // Arrange
    const facts = makeFacts({ categoryColumn: null });
    const deps = makeDeps(FULL_RESULT);

    // Act
    await narrateScenes(facts, deps);

    // Assert
    const prompt = vi.mocked(deps.generateStructured).mock.calls[0][0].prompt;
    expect(prompt).toContain("category: none");
  });

  it("uses actual categoryColumn when not null", async () => {
    // Arrange
    const facts = makeFacts({ categoryColumn: "region" });
    const deps = makeDeps(FULL_RESULT);

    // Act
    await narrateScenes(facts, deps);

    // Assert
    const prompt = vi.mocked(deps.generateStructured).mock.calls[0][0].prompt;
    expect(prompt).toContain("category: region");
  });

  it("uses 'none' for textColumn when null (nullish coalescing)", async () => {
    // Arrange
    const facts = makeFacts({ textColumn: null });
    const deps = makeDeps(FULL_RESULT);

    // Act
    await narrateScenes(facts, deps);

    // Assert
    const prompt = vi.mocked(deps.generateStructured).mock.calls[0][0].prompt;
    expect(prompt).toContain("text: none");
  });

  it("uses actual textColumn when not null", async () => {
    // Arrange
    const facts = makeFacts({ textColumn: "notes" });
    const deps = makeDeps(FULL_RESULT);

    // Act
    await narrateScenes(facts, deps);

    // Assert
    const prompt = vi.mocked(deps.generateStructured).mock.calls[0][0].prompt;
    expect(prompt).toContain("text: notes");
  });

  it("includes each scene kind and its subtitle in the prompt", async () => {
    // Arrange
    const facts = makeFacts({ sceneKinds: ["calendar", "sankey"] });
    const deps = makeDeps({ scenes: [] });

    // Act
    await narrateScenes(facts, deps);

    // Assert
    const prompt = vi.mocked(deps.generateStructured).mock.calls[0][0].prompt;
    // Scene list should include both kinds with their subtitles
    expect(prompt).toContain("- calendar:");
    expect(prompt).toContain("- sankey:");
  });

  it("builds scene list from all six scene kinds", async () => {
    // Arrange
    const allKinds: SceneKind[] = ["calendar", "race", "sankey", "gantt", "wordcloud", "sunburst"];
    const facts = makeFacts({ sceneKinds: allKinds });
    const allResult: SceneNarration = {
      scenes: allKinds.map((kind) => ({ kind, narration: `${kind} narration.` })),
    };
    const deps = makeDeps(allResult);

    // Act
    const map = await narrateScenes(facts, deps);

    // Assert
    const prompt = vi.mocked(deps.generateStructured).mock.calls[0][0].prompt;
    for (const kind of allKinds) {
      expect(prompt).toContain(`- ${kind}:`);
    }
    expect(Object.keys(map)).toHaveLength(6);
  });

  it("includes all required prompt configuration fields", async () => {
    // Arrange
    const facts = makeFacts();
    const deps = makeDeps(FULL_RESULT);

    // Act
    await narrateScenes(facts, deps);

    // Assert
    const requestArg = vi.mocked(deps.generateStructured).mock.calls[0][0];
    expect(requestArg.system).toContain("narrator");
    expect(requestArg.maxTokens).toBe(768);
    expect(requestArg.temperature).toBe(0.3);
    expect(requestArg.prompt).toBeTruthy();
  });
});

// ─── narrateScenes — result mapping ──────────────────────────────────────────

describe("narrateScenes — result mapping", () => {
  it("maps each scene entry to its kind as key and narration as value", async () => {
    // Arrange
    const facts = makeFacts({ sceneKinds: ["wordcloud", "sunburst", "gantt"] });
    const result: SceneNarration = {
      scenes: [
        { kind: "wordcloud", narration: "Wordcloud text." },
        { kind: "sunburst", narration: "Sunburst text." },
        { kind: "gantt", narration: "Gantt text." },
      ],
    };
    const deps = makeDeps(result);

    // Act
    const map = await narrateScenes(facts, deps);

    // Assert
    expect(map).toEqual({
      wordcloud: "Wordcloud text.",
      sunburst: "Sunburst text.",
      gantt: "Gantt text.",
    });
  });

  it("last scene with same kind overwrites earlier entries in the map", async () => {
    // Arrange — two entries for same kind; last one wins
    const facts = makeFacts({ sceneKinds: ["race"] });
    const result: SceneNarration = {
      scenes: [
        { kind: "race", narration: "First race narration." },
        { kind: "race", narration: "Second race narration." },
      ],
    };
    const deps = makeDeps(result);

    // Act
    const map = await narrateScenes(facts, deps);

    // Assert
    expect(map.race).toBe("Second race narration.");
    expect(Object.keys(map)).toHaveLength(1);
  });

  it("handles all six scene kinds returned from generateStructured", async () => {
    // Arrange
    const allKinds: SceneKind[] = ["calendar", "race", "sankey", "gantt", "wordcloud", "sunburst"];
    const facts = makeFacts({ sceneKinds: allKinds });
    const result: SceneNarration = {
      scenes: allKinds.map((kind) => ({ kind, narration: `Narration for ${kind}.` })),
    };
    const deps = makeDeps(result);

    // Act
    const map = await narrateScenes(facts, deps);

    // Assert
    for (const kind of allKinds) {
      expect(map[kind]).toBe(`Narration for ${kind}.`);
    }
  });
});

// ─── narrateScenes — all columns null ────────────────────────────────────────

describe("narrateScenes — all optional columns null", () => {
  it("builds a valid prompt when all optional columns are null", async () => {
    // Arrange — exercises all ?? fallback branches simultaneously
    const facts = makeFacts({
      dateColumn: null,
      measureColumn: null,
      categoryColumn: null,
      textColumn: null,
      sceneKinds: ["calendar"],
    });
    const deps = makeDeps({ scenes: [{ kind: "calendar", narration: "Calendar." }] });

    // Act
    const map = await narrateScenes(facts, deps);

    // Assert
    const prompt = vi.mocked(deps.generateStructured).mock.calls[0][0].prompt;
    expect(prompt).toContain("date: none");
    expect(prompt).toContain("measure: row counts");
    expect(prompt).toContain("category: none");
    expect(prompt).toContain("text: none");
    expect(map.calendar).toBe("Calendar.");
  });
});

// ─── narrateScenes — propagates rejection ────────────────────────────────────

describe("narrateScenes — error propagation", () => {
  it("rejects when generateStructured rejects (no swallowing)", async () => {
    // Arrange
    const facts = makeFacts();
    const deps: NarrateDeps = {
      generateStructured: vi.fn().mockRejectedValue(new Error("LLM unavailable")),
    };

    // Act / Assert
    await expect(narrateScenes(facts, deps)).rejects.toThrow("LLM unavailable");
  });

  it("rejects when generateStructured rejects with abort signal", async () => {
    // Arrange
    const controller = new AbortController();
    const facts = makeFacts();
    const deps: NarrateDeps = {
      generateStructured: vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")),
      signal: controller.signal,
    };

    // Act / Assert
    await expect(narrateScenes(facts, deps)).rejects.toThrow("Aborted");
  });
});

// ─── narrateScenes — scene list from sceneDefinition subtitles ────────────────

describe("narrateScenes — sceneDefinition subtitle integration", () => {
  it("includes the canonical subtitle from sceneDefinition in the scene list", async () => {
    // Arrange
    const facts = makeFacts({ sceneKinds: ["sunburst"] });
    const deps = makeDeps({ scenes: [{ kind: "sunburst", narration: "Sunburst insight." }] });

    // Act
    await narrateScenes(facts, deps);

    // Assert — subtitle comes from sceneDefinition("sunburst")
    const prompt = vi.mocked(deps.generateStructured).mock.calls[0][0].prompt;
    expect(prompt).toContain("sunburst");
    // The subtitle from sceneDefinition is "Two-level hierarchical breakdown..."
    expect(prompt).toContain("Two-level hierarchical breakdown");
  });

  it("includes the calendar scene's canonical subtitle", async () => {
    // Arrange
    const facts = makeFacts({ sceneKinds: ["calendar"] });
    const deps = makeDeps({ scenes: [{ kind: "calendar", narration: "Daily view." }] });

    // Act
    await narrateScenes(facts, deps);

    // Assert
    const prompt = vi.mocked(deps.generateStructured).mock.calls[0][0].prompt;
    expect(prompt).toContain("Daily aggregated volume");
  });

  it("builds an empty scene list when sceneKinds is empty", async () => {
    // Arrange
    const facts = makeFacts({ sceneKinds: [] });
    const deps = makeDeps({ scenes: [] });

    // Act
    const map = await narrateScenes(facts, deps);

    // Assert
    const prompt = vi.mocked(deps.generateStructured).mock.calls[0][0].prompt;
    expect(prompt).toContain("Scenes:\n");
    expect(map).toEqual({});
  });

  it("formats row count with locale separator", async () => {
    // Arrange
    const facts = makeFacts({ rowCount: 1234567 });
    const deps = makeDeps({ scenes: [] });

    // Act
    await narrateScenes(facts, deps);

    // Assert — toLocaleString adds thousands separator
    const prompt = vi.mocked(deps.generateStructured).mock.calls[0][0].prompt;
    // The formatted number should include separators (locale-dependent but always includes the digits)
    expect(prompt).toContain("1");
    expect(prompt).toContain("234");
    expect(prompt).toContain("567");
  });
});
