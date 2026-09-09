/**
 * Tests for src/platform/ai/embeddings.ts
 *
 * The module is a thin API over the inference worker (via inference-client).
 * We mock the entire inference-client boundary so no real ONNX / Worker /
 * Comlink code runs — that keeps the tests fast, deterministic, and
 * offline-safe while still exercising every branch in the target file.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ColMeta } from "@/core/stores/data-store";

// ─── Mock inference-client (the only external boundary) ──────────────────────

const mockEmbedTexts = vi.fn<(texts: string[], model?: string) => Promise<Float32Array[]>>();
const mockPreloadEmbedder = vi.fn<(model?: string) => Promise<void>>();

vi.mock("@/platform/ai/inference-client", () => ({
  embedTexts: (texts: string[], model?: string) => mockEmbedTexts(texts, model),
  preloadEmbedder: (model?: string) => mockPreloadEmbedder(model),
}));

// Import the real module AFTER mock declarations.
import {
  embedRaw,
  isEmbeddingsReady,
  preloadEmbeddings,
  semanticColumnMatch,
  semanticColumnRelations,
} from "@/platform/ai/embeddings";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Construct a minimal ColMeta fixture. */
function col(name: string, type: ColMeta["type"], extra: Partial<ColMeta> = {}): ColMeta {
  return {
    name,
    type,
    nullCount: 0,
    distinctCount: 0,
    sample: [],
    ...extra,
  };
}

/**
 * Build a synthetic Float32Array unit vector of the given dimension.
 * Direction is controlled by `angle` (radians) in a 2-D projection so that
 * cosine similarity between two vectors is predictable in tests.
 */
function unitVec(angle: number, dim = 4): Float32Array {
  const v = new Float32Array(dim).fill(0);
  v[0] = Math.cos(angle);
  v[1] = Math.sin(angle);
  return v;
}

// ─── Module-level state: reset embedderReady between tests ───────────────────
//
// `embedderReady` is a module-level `let` whose initial value is `false`.
// We can verify state transitions but cannot reset it between tests without
// reloading the module. Instead, we structure tests so they each observe only
// the transitions relevant to that particular scenario.

beforeEach(() => {
  vi.clearAllMocks();
  // Default: embedTexts resolves with no-op Float32Arrays.
  mockEmbedTexts.mockResolvedValue([]);
  mockPreloadEmbedder.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── isEmbeddingsReady ───────────────────────────────────────────────────────

describe("isEmbeddingsReady", () => {
  it("returns a boolean", () => {
    // The exact value depends on prior test execution order; we just assert
    // it is a boolean, not undefined.
    expect(typeof isEmbeddingsReady()).toBe("boolean");
  });

  it("returns true after embedRaw is called successfully", async () => {
    // Arrange: supply one Float32Array so embedRaw completes.
    mockEmbedTexts.mockResolvedValue([new Float32Array([1, 0])]);

    // Act
    await embedRaw(["hello"]);

    // Assert
    expect(isEmbeddingsReady()).toBe(true);
  });
});

// ─── embedRaw ────────────────────────────────────────────────────────────────

describe("embedRaw", () => {
  it("delegates to embedTexts and returns the Float32Arrays verbatim", async () => {
    // Arrange
    const expected = [new Float32Array([1, 2, 3]), new Float32Array([4, 5, 6])];
    mockEmbedTexts.mockResolvedValue(expected);

    // Act
    const result = await embedRaw(["foo", "bar"]);

    // Assert
    expect(mockEmbedTexts).toHaveBeenCalledWith(["foo", "bar"], undefined);
    expect(result).toBe(expected); // reference equality — no transformation
  });

  it("passes through an empty array when called with no texts", async () => {
    mockEmbedTexts.mockResolvedValue([]);

    const result = await embedRaw([]);

    expect(result).toEqual([]);
  });

  it("sets embedderReady to true after a successful call", async () => {
    mockEmbedTexts.mockResolvedValue([new Float32Array([0.5])]);

    await embedRaw(["test"]);

    expect(isEmbeddingsReady()).toBe(true);
  });

  it("propagates a rejection from embedTexts", async () => {
    mockEmbedTexts.mockRejectedValue(new Error("worker crashed"));

    await expect(embedRaw(["text"])).rejects.toThrow("worker crashed");
  });
});

// ─── preloadEmbeddings ───────────────────────────────────────────────────────

describe("preloadEmbeddings", () => {
  it("calls preloadEmbedder and sets embedderReady when the promise resolves", async () => {
    // Arrange: track when preloadEmbedder is called.
    let resolveFn!: () => void;
    mockPreloadEmbedder.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveFn = resolve;
      }),
    );

    // Act: call is fire-and-forget (void return).
    preloadEmbeddings();

    expect(mockPreloadEmbedder).toHaveBeenCalledOnce();

    // Resolve the inner promise and let microtasks flush.
    resolveFn();
    await Promise.resolve(); // flush .then(() => { embedderReady = true })
    await Promise.resolve();

    // Assert
    expect(isEmbeddingsReady()).toBe(true);
  });

  it("silently swallows a rejection from preloadEmbedder", async () => {
    mockPreloadEmbedder.mockRejectedValue(new Error("model not found"));

    // This must NOT throw — preloadEmbeddings() .catch() eats the error.
    expect(() => preloadEmbeddings()).not.toThrow();

    // Let the microtask queue drain.
    await new Promise<void>((r) => setTimeout(r, 0));

    // No unhandled rejection; isEmbeddingsReady still has whatever value it had.
    expect(typeof isEmbeddingsReady()).toBe("boolean");
  });
});

// ─── semanticColumnMatch ─────────────────────────────────────────────────────

describe("semanticColumnMatch — happy path", () => {
  it("returns the top-K columns sorted by cosine similarity", async () => {
    // Arrange: query at angle 0, columns at 0, π/2 (orthogonal), π (opposite).
    const query = unitVec(0);
    const vecA = unitVec(0); // perfectly aligned → similarity 1
    const vecB = unitVec(Math.PI / 2); // orthogonal → similarity 0
    const vecC = unitVec(Math.PI); // opposite → similarity −1

    // embed() is called with [query, ...colTexts]
    mockEmbedTexts.mockResolvedValue([query, vecA, vecB, vecC]);

    const columns = [col("metric_a", "number"), col("category_b", "string"), col("date_c", "date")];

    // Act
    const matches = await semanticColumnMatch("metric", columns, 2);

    // Assert — top 2, ordered best first.
    expect(matches).toHaveLength(2);
    expect(matches[0].column.name).toBe("metric_a");
    expect(matches[0].score).toBeCloseTo(1, 4);
    expect(matches[1].column.name).toBe("category_b");
    // Score for orthogonal vector should be close to 0.
    expect(matches[1].score).toBeCloseTo(0, 4);
  });

  it("enriches column texts for number / string / date types", async () => {
    // Arrange: capture what embed() receives.
    mockEmbedTexts.mockResolvedValue([
      new Float32Array([1, 0]),
      new Float32Array([1, 0]),
      new Float32Array([1, 0]),
      new Float32Array([1, 0]),
    ]);

    const columns = [
      col("total_value", "number"),
      col("region_name", "string"),
      col("sale_date", "date"),
    ];
    await semanticColumnMatch("query text", columns, 3);

    // The first element passed to embed() is the raw query; subsequent ones are
    // the enriched column descriptions.
    const [_query, num, str, date] = mockEmbedTexts.mock.calls[0][0];
    expect(num).toContain("numeric metric value");
    expect(str).toContain("category label text");
    expect(date).toContain("date time period");
    // Underscores in names replaced with spaces.
    expect(num).toContain("total value");
    expect(str).toContain("region name");
    expect(date).toContain("sale date");
  });

  it("defaults topK to 3", async () => {
    // Provide five columns and check we only get three back.
    const cols = Array.from({ length: 5 }, (_, i) => col(`col${i}`, "number"));
    const vecs = [new Float32Array([1, 0]), ...cols.map(() => new Float32Array([1, 0]))];
    mockEmbedTexts.mockResolvedValue(vecs);

    const matches = await semanticColumnMatch("something", cols);

    expect(matches).toHaveLength(3);
  });

  it("returns fewer than topK when there are fewer columns", async () => {
    const vecs = [new Float32Array([1, 0]), new Float32Array([0.9, 0])];
    mockEmbedTexts.mockResolvedValue(vecs);

    const matches = await semanticColumnMatch("q", [col("a", "number")], 5);

    expect(matches).toHaveLength(1);
  });

  it("handles the zero-norm degenerate case (all-zero vector) without NaN", async () => {
    const zero = new Float32Array([0, 0, 0]);
    mockEmbedTexts.mockResolvedValue([zero, zero]);

    const matches = await semanticColumnMatch("q", [col("x", "number")], 1);

    // cosineSimilarity returns 0 when denom === 0.
    expect(matches[0].score).toBe(0);
    expect(Number.isNaN(matches[0].score)).toBe(false);
  });
});

describe("semanticColumnMatch — fallback path (embed throws)", () => {
  it("falls back to substring matching when embed rejects", async () => {
    mockEmbedTexts.mockRejectedValue(new Error("ONNX runtime unavailable"));

    const columns = [col("revenue", "number"), col("region", "string"), col("date_field", "date")];
    const matches = await semanticColumnMatch("revenue", columns, 3);

    // 'revenue' matches 'revenue' by substring → score 0.8.
    expect(matches[0].column.name).toBe("revenue");
    expect(matches[0].score).toBeCloseTo(0.8);
    // Others get 0.1 (no match in name).
    expect(matches[1].score).toBeCloseTo(0.1);
  });

  it("fallback result is sorted by score descending and sliced to topK", async () => {
    mockEmbedTexts.mockRejectedValue(new Error("fail"));

    // Query matches second column name but not first.
    const columns = [col("alpha", "number"), col("beta", "string"), col("gamma", "date")];
    const matches = await semanticColumnMatch("beta", columns, 2);

    expect(matches).toHaveLength(2);
    expect(matches[0].column.name).toBe("beta");
    expect(matches[0].score).toBeCloseTo(0.8);
    expect(matches[1].score).toBeCloseTo(0.1);
  });

  it("case-insensitive substring check in fallback", async () => {
    mockEmbedTexts.mockRejectedValue(new Error("fail"));

    const columns = [col("REVENUE", "number")];
    const matches = await semanticColumnMatch("revenue", columns, 1);

    expect(matches[0].score).toBeCloseTo(0.8);
  });
});

// ─── semanticColumnRelations ──────────────────────────────────────────────────

describe("semanticColumnRelations — happy path", () => {
  it("returns pairs with similarity > 0.5, sorted descending", async () => {
    // Three columns: A and B are aligned (sim ≈ 1), A and C are orthogonal (0).
    const vA = unitVec(0);
    const vB = unitVec(0); // same direction → sim ≈ 1
    const vC = unitVec(Math.PI / 2); // orthogonal → sim ≈ 0

    mockEmbedTexts.mockResolvedValue([vA, vB, vC]);

    const columns = [col("a", "number"), col("b", "number"), col("c", "number")];
    const relations = await semanticColumnRelations(columns);

    // Only the A-B pair exceeds threshold 0.5.
    expect(relations).toHaveLength(1);
    expect(relations[0].col1).toBe("a");
    expect(relations[0].col2).toBe("b");
    expect(relations[0].similarity).toBeCloseTo(1, 4);
  });

  it("strips underscores when building the text passed to embed()", async () => {
    mockEmbedTexts.mockResolvedValue([new Float32Array([1, 0]), new Float32Array([1, 0])]);

    await semanticColumnRelations([col("total_sales", "number"), col("net_profit", "number")]);

    const embeddedTexts = mockEmbedTexts.mock.calls[0][0];
    expect(embeddedTexts[0]).toBe("total sales");
    expect(embeddedTexts[1]).toBe("net profit");
  });

  it("returns an empty array when no pair exceeds the 0.5 threshold", async () => {
    const vA = unitVec(0);
    const vB = unitVec(Math.PI / 2); // orthogonal

    mockEmbedTexts.mockResolvedValue([vA, vB]);

    const relations = await semanticColumnRelations([col("a", "number"), col("b", "number")]);

    expect(relations).toEqual([]);
  });

  it("returns an empty array for a single column (no pairs possible)", async () => {
    mockEmbedTexts.mockResolvedValue([new Float32Array([1, 0])]);

    const relations = await semanticColumnRelations([col("only", "number")]);

    expect(relations).toEqual([]);
  });

  it("returns an empty array for an empty column list", async () => {
    mockEmbedTexts.mockResolvedValue([]);

    const relations = await semanticColumnRelations([]);

    expect(relations).toEqual([]);
  });

  it("sorts multiple relations by similarity descending", async () => {
    // A and B are close (angle π/8 ≈ 22.5°), A and C are further (angle π/3 ≈ 60°).
    const vA = unitVec(0);
    const vB = unitVec(Math.PI / 8); // cos(π/8) ≈ 0.924 > 0.5
    const vC = unitVec(Math.PI / 3); // cos(π/3) = 0.5 — boundary; use slightly smaller

    const vCInside = unitVec(Math.PI / 4); // cos(π/4) ≈ 0.707 > 0.5

    mockEmbedTexts.mockResolvedValue([vA, vB, vCInside]);

    const columns = [col("x", "number"), col("y", "number"), col("z", "number")];
    const relations = await semanticColumnRelations(columns);

    // At least two pairs should be above 0.5.
    expect(relations.length).toBeGreaterThanOrEqual(2);

    // Sorted descending.
    for (let i = 1; i < relations.length; i++) {
      expect(relations[i - 1].similarity).toBeGreaterThanOrEqual(relations[i].similarity);
    }
  });
});

describe("semanticColumnRelations — error path", () => {
  it("returns an empty array when embed rejects", async () => {
    mockEmbedTexts.mockRejectedValue(new Error("model not loaded"));

    const columns = [col("a", "number"), col("b", "number")];
    const relations = await semanticColumnRelations(columns);

    expect(relations).toEqual([]);
  });
});
