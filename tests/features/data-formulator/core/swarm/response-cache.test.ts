import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for the Moudir AI semantic response cache (response-cache.ts).
 *
 * We mock `@/platform/ai/embeddings` so no real ONNX model or worker is
 * touched. The cache module itself (LRU store, fingerprinting, cosine, exact
 * match) runs fully real and contributes to coverage.
 */

// ── Embeddings boundary mock ─────────────────────────────────────────────────
// Must be declared before the import of the module under test so vi.mock hoisting
// picks it up. The factory captures a spy reference we can control per test.

const embedRawMock = vi.fn<(texts: string[]) => Promise<Float32Array[]>>();

vi.mock("@/platform/ai/embeddings", () => ({
  embedRaw: (...args: [string[]]) => embedRawMock(...args),
}));

// Import AFTER mock registration so the module under test receives our spy.
import {
  invalidateCachedAnswers,
  lookupCachedAnswer,
  storeCachedAnswer,
} from "@/features/data-formulator/core/swarm/response-cache";
import type { SwarmContext, SwarmResult } from "@/features/data-formulator/core/swarm/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal SwarmContext with sensible defaults. */
function makeCtx(overrides: Partial<SwarmContext> = {}): SwarmContext {
  return {
    datasetId: "ds-1",
    datasetName: "Daily Transactions",
    tableName: "tx_view",
    columns: [
      { name: "channel", type: "string", dbType: "VARCHAR" },
      { name: "amount", type: "number", dbType: "DOUBLE" },
    ],
    rowSample: [],
    rowCount: 500,
    model: "test-model",
    ...overrides,
  };
}

/** Build a minimal SwarmResult. */
function makeResult(headline = "Test headline"): SwarmResult {
  return {
    goal: "goal",
    headline,
    summary: "summary",
    evidence: [],
    followUps: [],
    confidence: "high",
    artifacts: [],
    modelUsed: "test-model",
  };
}

/**
 * Build a Float32Array that looks like an embedding vector. Two identical calls
 * will produce the same vector (by seed index). sim(v(0), v(0)) = 1.0.
 * sim(v(0), v(1)) is well below 0.92 so they are different.
 */
function vec(seed: number, length = 4): Float32Array {
  const arr = new Float32Array(length);
  arr[seed % length] = 1; // only one component is non-zero -> orthogonal across seeds
  return arr;
}

// ── Test setup ───────────────────────────────────────────────────────────────

beforeEach(() => {
  // Always start each test with an empty cache.
  invalidateCachedAnswers();
  embedRawMock.mockReset();
});

// ── invalidateCachedAnswers ──────────────────────────────────────────────────

describe("invalidateCachedAnswers", () => {
  it("clears the entire cache when called with no argument", async () => {
    // Arrange: store one entry then clear everything.
    embedRawMock.mockResolvedValue([vec(0)]);
    await storeCachedAnswer("What is the total?", makeCtx(), makeResult("r1"));
    invalidateCachedAnswers(); // no arg -> clears all

    // Act: now a lookup with the SAME question and same ctx should miss.
    embedRawMock.mockResolvedValue([vec(0)]);
    const hit = await lookupCachedAnswer("What is the total?", makeCtx());

    // Assert: the cache was cleared so the lookup misses.
    expect(hit).toBeNull();
  });

  it("removes only entries for the specified datasetId", async () => {
    // Arrange: store two entries for two different datasets.
    const ctxA = makeCtx({ datasetId: "ds-A" });
    const ctxB = makeCtx({ datasetId: "ds-B" });
    embedRawMock.mockResolvedValue([vec(0)]);
    await storeCachedAnswer("Q", ctxA, makeResult("ra"));
    embedRawMock.mockResolvedValue([vec(0)]);
    await storeCachedAnswer("Q", ctxB, makeResult("rb"));

    // Act: remove only ds-A entries.
    invalidateCachedAnswers("ds-A");

    // Exact-normalized lookup: no embedding needed (fast path).
    const hitA = await lookupCachedAnswer("Q", ctxA);
    const hitB = await lookupCachedAnswer("Q", ctxB);

    // Assert: ds-A is gone; ds-B survives.
    expect(hitA).toBeNull();
    expect(hitB).not.toBeNull();
    expect((hitB as SwarmResult).headline).toBe("rb");
  });

  it("does not throw when called on an already-empty cache (with a datasetId)", () => {
    // Arrange: cache is empty (cleared in beforeEach).
    // Act / Assert: must not throw.
    expect(() => invalidateCachedAnswers("ds-X")).not.toThrow();
  });

  it("does not throw when called on an already-empty cache (without a datasetId)", () => {
    expect(() => invalidateCachedAnswers()).not.toThrow();
  });
});

// ── lookupCachedAnswer — exact-normalized fast path ──────────────────────────

describe("lookupCachedAnswer — exact-normalized fast path", () => {
  it("returns the cached result for an identical question on the same dataset", async () => {
    // Arrange
    const ctx = makeCtx();
    const result = makeResult("exact-hit");
    embedRawMock.mockResolvedValue([vec(0)]);
    await storeCachedAnswer("Show revenue by channel", ctx, result);

    // Act: same question verbatim.
    const hit = await lookupCachedAnswer("Show revenue by channel", ctx);

    // Assert: hit returned without ever calling embedRaw a second time.
    expect(hit).not.toBeNull();
    expect((hit as SwarmResult).headline).toBe("exact-hit");
    // embedRaw was called once (during store) but NOT during the exact lookup.
    expect(embedRawMock).toHaveBeenCalledTimes(1);
  });

  it("matches after normalising whitespace and case differences", async () => {
    // Arrange
    const ctx = makeCtx();
    const result = makeResult("norm-hit");
    embedRawMock.mockResolvedValue([vec(0)]);
    await storeCachedAnswer("Show revenue by channel", ctx, result);

    // Act: extra spaces, different case.
    const hit = await lookupCachedAnswer("  show   REVENUE  by  CHANNEL  ", ctx);

    // Assert
    expect(hit).not.toBeNull();
    expect((hit as SwarmResult).headline).toBe("norm-hit");
    // No extra embedRaw call (fast path).
    expect(embedRawMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when the dataset fingerprint differs even on identical questions", async () => {
    // Arrange: store on ds-1.
    const ctxA = makeCtx({ datasetId: "ds-1" });
    const result = makeResult("ds-1-result");
    embedRawMock.mockResolvedValue([vec(0)]);
    await storeCachedAnswer("Same question", ctxA, result);

    // Act: lookup on ds-2 — fingerprint mismatch.
    embedRawMock.mockResolvedValue([vec(0)]);
    const hit = await lookupCachedAnswer("Same question", makeCtx({ datasetId: "ds-2" }));

    // Assert: miss because the fingerprint (datasetId) differs.
    expect(hit).toBeNull();
  });

  it("returns null when the row count changes (different fingerprint)", async () => {
    // Arrange
    const ctx500 = makeCtx({ rowCount: 500 });
    embedRawMock.mockResolvedValue([vec(0)]);
    await storeCachedAnswer("Q", ctx500, makeResult("r500"));

    // Act: same question, same dataset, but row count changed (data import).
    embedRawMock.mockResolvedValue([vec(0)]);
    const hit = await lookupCachedAnswer("Q", makeCtx({ rowCount: 501 }));

    // Assert: row-count change makes the fingerprint different -> miss.
    expect(hit).toBeNull();
  });

  it("returns null when a column is added (column list differs)", async () => {
    // Arrange
    const ctxA = makeCtx();
    embedRawMock.mockResolvedValue([vec(0)]);
    await storeCachedAnswer("Q", ctxA, makeResult("with-two-cols"));

    // Act: same dataset + row count but an extra column added.
    const ctxB = makeCtx({
      columns: [
        { name: "channel", type: "string", dbType: "VARCHAR" },
        { name: "amount", type: "number", dbType: "DOUBLE" },
        { name: "region", type: "string", dbType: "VARCHAR" },
      ],
    });
    embedRawMock.mockResolvedValue([vec(0)]);
    const hit = await lookupCachedAnswer("Q", ctxB);

    // Assert: column set change -> fingerprint differs -> miss.
    expect(hit).toBeNull();
  });
});

// ── lookupCachedAnswer — semantic (cosine) path ──────────────────────────────

describe("lookupCachedAnswer — semantic (cosine) path", () => {
  it("returns a cached result when cosine similarity meets the threshold (>= 0.92)", async () => {
    // Arrange: store a question under vec(0).
    const ctx = makeCtx();
    const result = makeResult("semantic-hit");
    embedRawMock.mockResolvedValue([vec(0)]);
    await storeCachedAnswer("Show me revenue", ctx, result);

    // Act: slightly different wording, but we return vec(0) again so sim = 1.0 >= 0.92.
    embedRawMock.mockResolvedValue([vec(0)]);
    const hit = await lookupCachedAnswer("Show revenue please", ctx);

    // Assert
    expect(hit).not.toBeNull();
    expect((hit as SwarmResult).headline).toBe("semantic-hit");
  });

  it("returns null when cosine similarity is below the threshold (< 0.92)", async () => {
    // Arrange: store under vec(0).
    const ctx = makeCtx();
    embedRawMock.mockResolvedValue([vec(0)]);
    await storeCachedAnswer("Show revenue", ctx, makeResult("stored"));

    // Act: lookup returns vec(1) which is orthogonal to vec(0) -> sim = 0.0 < 0.92.
    embedRawMock.mockResolvedValue([vec(1)]);
    const hit = await lookupCachedAnswer("Something completely different", ctx);

    // Assert
    expect(hit).toBeNull();
  });

  it("picks the candidate with the highest cosine similarity (best-of-two)", async () => {
    // Arrange: two entries with the same fingerprint.
    const ctx = makeCtx();
    const close = makeResult("close-match");
    const far = makeResult("far-match");

    // Store close at vec(0), far at vec(1).
    embedRawMock.mockResolvedValueOnce([vec(0)]);
    await storeCachedAnswer("Show revenue by channel", ctx, close);
    embedRawMock.mockResolvedValueOnce([vec(1)]);
    await storeCachedAnswer("Something else entirely", ctx, far);

    // Act: query vector is vec(0) -> should hit "close-match".
    embedRawMock.mockResolvedValueOnce([vec(0)]);
    const hit = await lookupCachedAnswer("Revenue by channel totals", ctx);

    // Assert
    expect(hit).not.toBeNull();
    expect((hit as SwarmResult).headline).toBe("close-match");
  });

  it("returns null when no candidates exist for the current fingerprint", async () => {
    // Arrange: empty cache (cleared in beforeEach).
    // Act
    embedRawMock.mockResolvedValue([vec(0)]);
    const hit = await lookupCachedAnswer("Any question", makeCtx());

    // Assert: no candidates -> returned null before even calling embedRaw.
    expect(hit).toBeNull();
    // embedRaw must NOT be called because the short-circuit fires first.
    expect(embedRawMock).not.toHaveBeenCalled();
  });

  it("returns null (never throws) when embedRaw rejects during a semantic lookup", async () => {
    // Arrange: store one entry so there IS a candidate to trigger the embed path.
    const ctx = makeCtx();
    embedRawMock.mockResolvedValueOnce([vec(0)]);
    await storeCachedAnswer("Something stored", ctx, makeResult("stored"));

    // Act: lookup with a DIFFERENT question so exact path is skipped; embedRaw fails.
    embedRawMock.mockRejectedValueOnce(new Error("ONNX worker crashed"));
    const hit = await lookupCachedAnswer("Slightly different question", ctx);

    // Assert: caught internally -> returns null.
    expect(hit).toBeNull();
  });
});

// ── storeCachedAnswer ─────────────────────────────────────────────────────────

describe("storeCachedAnswer", () => {
  it("stores an entry that is retrievable by exact match on subsequent lookup", async () => {
    // Arrange
    const ctx = makeCtx();
    const result = makeResult("stored-result");
    embedRawMock.mockResolvedValue([vec(0)]);

    // Act
    await storeCachedAnswer("Total revenue", ctx, result);

    // Assert via exact lookup (no extra embedRaw call expected).
    const hit = await lookupCachedAnswer("Total revenue", ctx);
    expect(hit).not.toBeNull();
    expect((hit as SwarmResult).headline).toBe("stored-result");
  });

  it("does not throw (best-effort) when embedRaw rejects during store", async () => {
    // Arrange
    embedRawMock.mockRejectedValue(new Error("Worker unavailable"));

    // Act / Assert: must not throw.
    await expect(
      storeCachedAnswer("Q", makeCtx(), makeResult("r")),
    ).resolves.toBeUndefined();
  });

  it("converts the raw Float32Array vector to a plain number[] for the stored entry", async () => {
    // Arrange: give a non-trivial vector.
    const raw = new Float32Array([0.1, 0.9, 0.3]);
    embedRawMock.mockResolvedValueOnce([raw]);
    const ctx = makeCtx();
    const result = makeResult("vec-stored");

    await storeCachedAnswer("Q raw", ctx, result);

    // Act: semantic lookup must succeed (sim = 1.0 because we return the same vector).
    embedRawMock.mockResolvedValueOnce([raw]);
    const hit = await lookupCachedAnswer("Q raw different wording", ctx);

    expect(hit).not.toBeNull();
    expect((hit as SwarmResult).headline).toBe("vec-stored");
  });

  it("evicts the oldest entry when the cache exceeds 50 entries (LRU shift)", async () => {
    // Arrange: fill 50 entries, then store a 51st — the first should be evicted.
    const ctx = makeCtx();
    const firstQuestion = "Question 0";
    const firstResult = makeResult("first");

    // Store the entry that should be evicted.
    embedRawMock.mockResolvedValue([vec(0)]);
    await storeCachedAnswer(firstQuestion, ctx, firstResult);

    // Store 50 more entries to overflow the cache.
    for (let i = 1; i <= 50; i++) {
      embedRawMock.mockResolvedValue([vec(i % 4)]);
      await storeCachedAnswer(`Question ${i}`, makeCtx({ datasetId: `ds-${i}` }), makeResult(`r${i}`));
    }

    // Act: the first entry should have been evicted (LRU shift).
    // Exact lookup should miss (entry gone).
    const hit = await lookupCachedAnswer(firstQuestion, ctx);

    // Assert
    expect(hit).toBeNull();
  });

  it("keeps the cache length at or below 50 after many stores", async () => {
    // Arrange
    const ctx = makeCtx();
    for (let i = 0; i < 60; i++) {
      embedRawMock.mockResolvedValue([vec(i % 4)]);
      // Use unique datasetIds so fingerprints differ and each adds a new entry.
      await storeCachedAnswer(`Q${i}`, makeCtx({ datasetId: `ds-${i}` }), makeResult(`r${i}`));
    }

    // Assert: after 60 stores the last 50 entries must be reachable and nothing beyond 50.
    // We verify by checking that the 11th-oldest entry (index 10 from start) is gone.
    // The last 50 are ds-10..ds-59; ds-9 and below are evicted.
    const hitOld = await lookupCachedAnswer("Q9", makeCtx({ datasetId: "ds-9" }));
    expect(hitOld).toBeNull();

    // The most recent entry (ds-59) must still be reachable.
    const hitNew = await lookupCachedAnswer("Q59", makeCtx({ datasetId: "ds-59" }));
    expect(hitNew).not.toBeNull();
  });
});

// ── fingerprint correctness ───────────────────────────────────────────────────

describe("fingerprint — dataset identity", () => {
  it("produces the same hit regardless of column order in the context", async () => {
    // Arrange: store with columns in one order.
    const ctx1 = makeCtx({
      columns: [
        { name: "amount", type: "number", dbType: "DOUBLE" },
        { name: "channel", type: "string", dbType: "VARCHAR" },
      ],
    });
    embedRawMock.mockResolvedValue([vec(0)]);
    await storeCachedAnswer("Q", ctx1, makeResult("sorted-hit"));

    // Act: lookup with columns in a DIFFERENT order (fingerprint sorts columns).
    const ctx2 = makeCtx({
      columns: [
        { name: "channel", type: "string", dbType: "VARCHAR" },
        { name: "amount", type: "number", dbType: "DOUBLE" },
      ],
    });
    const hit = await lookupCachedAnswer("Q", ctx2);

    // Assert: the fingerprint sorts column names so order doesn't matter.
    expect(hit).not.toBeNull();
    expect((hit as SwarmResult).headline).toBe("sorted-hit");
  });
});

// ── cosine edge cases ─────────────────────────────────────────────────────────

describe("cosine — zero-vector guard", () => {
  it("returns null (not an error) when embedRaw returns a zero vector for the lookup", async () => {
    // Arrange: store a non-zero entry.
    const ctx = makeCtx();
    embedRawMock.mockResolvedValueOnce([vec(0)]);
    await storeCachedAnswer("Q stored", ctx, makeResult("stored"));

    // Act: lookup with a zero vector (denom === 0 -> cosine returns 0 -> miss).
    const zeroVec = new Float32Array(4); // all zeros
    embedRawMock.mockResolvedValueOnce([zeroVec]);
    const hit = await lookupCachedAnswer("Q lookup different", ctx);

    // Assert: cosine(zero, anything) === 0 < 0.92 -> miss, not a crash.
    expect(hit).toBeNull();
  });
});

// ── integration: store → lookup → invalidate → miss ──────────────────────────

describe("integration: full lifecycle", () => {
  it("store → exact lookup → invalidate by id → miss", async () => {
    // Arrange
    const ctx = makeCtx({ datasetId: "lifecycle-ds" });
    const result = makeResult("lifecycle-result");
    embedRawMock.mockResolvedValue([vec(0)]);
    await storeCachedAnswer("What is the total revenue?", ctx, result);

    // Verify it is there.
    const before = await lookupCachedAnswer("What is the total revenue?", ctx);
    expect(before).not.toBeNull();

    // Act: invalidate by the specific dataset id.
    invalidateCachedAnswers("lifecycle-ds");

    // Assert: the entry is gone.
    const after = await lookupCachedAnswer("What is the total revenue?", ctx);
    expect(after).toBeNull();
  });

  it("store → invalidate all → store again → lookup succeeds", async () => {
    // Arrange
    const ctx = makeCtx();
    embedRawMock.mockResolvedValue([vec(0)]);
    await storeCachedAnswer("Q", ctx, makeResult("first-store"));
    invalidateCachedAnswers();

    // Re-store.
    embedRawMock.mockResolvedValue([vec(0)]);
    await storeCachedAnswer("Q", ctx, makeResult("second-store"));

    // Act
    const hit = await lookupCachedAnswer("Q", ctx);

    // Assert
    expect(hit).not.toBeNull();
    expect((hit as SwarmResult).headline).toBe("second-store");
  });

  it("two different datasets can coexist in the cache independently", async () => {
    // Arrange
    const ctxA = makeCtx({ datasetId: "ds-A" });
    const ctxB = makeCtx({ datasetId: "ds-B" });
    embedRawMock.mockResolvedValue([vec(0)]);
    await storeCachedAnswer("Revenue", ctxA, makeResult("result-A"));
    embedRawMock.mockResolvedValue([vec(0)]);
    await storeCachedAnswer("Revenue", ctxB, makeResult("result-B"));

    // Act
    const hitA = await lookupCachedAnswer("Revenue", ctxA);
    const hitB = await lookupCachedAnswer("Revenue", ctxB);

    // Assert: each gets its own result.
    expect((hitA as SwarmResult).headline).toBe("result-A");
    expect((hitB as SwarmResult).headline).toBe("result-B");
  });
});
