import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock boundaries — must be declared before any import of the module under test
// ---------------------------------------------------------------------------

// 1. DuckDB: fetchMaterialRows calls runReadOnlyQuery under the hood via
//    use-reconciliation.ts. We hoist the mock so vi.mock() can reference it.
const { runReadOnlyQuery } = vi.hoisted(() => ({ runReadOnlyQuery: vi.fn() }));
vi.mock("@/platform/duckdb/duckdb", () => ({
  runReadOnlyQuery,
}));

// 2. AI provider — mock useAI to return a controllable generateStructured spy.
const { mockGenerateStructured, mockProgress, mockAvailability } = vi.hoisted(() => ({
  mockGenerateStructured: vi.fn(),
  mockProgress: { status: "ready" as const, progress: 100 },
  mockAvailability: [] as { providerId: string; available: boolean }[],
}));

vi.mock("@/platform/ai/provider", () => ({
  useAI: () => ({
    generateStructured: mockGenerateStructured,
    progress: mockProgress,
    availability: mockAvailability,
  }),
}));

// 3. The annotations store — use the REAL zustand store so setAnnotation side
//    effects are captured and can be asserted on.
//    (No mock needed — zustand works fine in jsdom.)

// ---------------------------------------------------------------------------
// Imports (after mocks are wired)
// ---------------------------------------------------------------------------
import {
  REASON_CODES,
  HypothesisSchema,
  useHypotheses,
  type HypothesisProgress,
  type ReasonCode,
} from "@/features/reconciliation/lib/use-hypotheses";
import { useAnnotationsStore } from "@/features/reconciliation/stores/annotations-store";
import type { DiffConfig } from "@/features/reconciliation/lib/recon-sql";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseCfg(overrides: Partial<DiffConfig> = {}): DiffConfig {
  return {
    expectedView: "exp",
    actualView: "act",
    keyCols: [{ expected: "channel", actual: "channel" }],
    measures: [{ label: "revenue", expected: "rev", actual: "rev" }],
    ...overrides,
  };
}

/** A minimal DuckDB raw row that mapDiffRow can handle. */
function rawRow(key: string, variance = 100) {
  return {
    key_0: key,
    exp_revenue: 1000,
    act_revenue: 1000 + variance,
    var_revenue: variance,
    varpct_revenue: (variance / 1000) * 100,
    diff_status: "CHANGED",
  };
}

function makeHypothesisResult(reasonCode: ReasonCode = "Human Error") {
  return {
    reasonCode,
    confidence: 0.85,
    hypothesis: "The variance was caused by a manual data-entry error on the expected side.",
  };
}

// ---------------------------------------------------------------------------
// Tests: exported constants and schema
// ---------------------------------------------------------------------------

describe("REASON_CODES", () => {
  it("exports the canonical 7-element tuple", () => {
    // Verify the full set so callers relying on this list don't silently drift.
    expect(REASON_CODES).toHaveLength(7);
    expect(REASON_CODES).toContain("Human Error");
    expect(REASON_CODES).toContain("System Issue");
    expect(REASON_CODES).toContain("Expected Variance");
    expect(REASON_CODES).toContain("Pricing Change");
    expect(REASON_CODES).toContain("Campaign Effect");
    expect(REASON_CODES).toContain("Timing / Cutoff");
    expect(REASON_CODES).toContain("Unknown");
  });
});

describe("HypothesisSchema", () => {
  it("accepts a fully valid hypothesis object", () => {
    const result = HypothesisSchema.safeParse({
      reasonCode: "Human Error",
      confidence: 0.75,
      hypothesis: "Short paragraph.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown reasonCode", () => {
    const result = HypothesisSchema.safeParse({
      reasonCode: "Not a real code",
      confidence: 0.5,
      hypothesis: "text",
    });
    expect(result.success).toBe(false);
  });

  it("rejects confidence below 0", () => {
    const result = HypothesisSchema.safeParse({
      reasonCode: "Unknown",
      confidence: -0.1,
      hypothesis: "text",
    });
    expect(result.success).toBe(false);
  });

  it("rejects confidence above 1", () => {
    const result = HypothesisSchema.safeParse({
      reasonCode: "Unknown",
      confidence: 1.1,
      hypothesis: "text",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a hypothesis string that exceeds 600 characters", () => {
    const result = HypothesisSchema.safeParse({
      reasonCode: "Unknown",
      confidence: 0.5,
      hypothesis: "x".repeat(601),
    });
    expect(result.success).toBe(false);
  });

  it("accepts a hypothesis exactly at the 600 character limit", () => {
    const result = HypothesisSchema.safeParse({
      reasonCode: "Unknown",
      confidence: 0.5,
      hypothesis: "x".repeat(600),
    });
    expect(result.success).toBe(true);
  });

  it("accepts confidence at boundary values 0 and 1", () => {
    expect(HypothesisSchema.safeParse({ reasonCode: "Unknown", confidence: 0, hypothesis: "h" }).success).toBe(true);
    expect(HypothesisSchema.safeParse({ reasonCode: "Unknown", confidence: 1, hypothesis: "h" }).success).toBe(true);
  });

  it("accepts every valid reason code", () => {
    for (const code of REASON_CODES) {
      const result = HypothesisSchema.safeParse({ reasonCode: code, confidence: 0.5, hypothesis: "ok" });
      expect(result.success, `Expected ${code} to be valid`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: useHypotheses hook
// ---------------------------------------------------------------------------

describe("useHypotheses", () => {
  beforeEach(() => {
    runReadOnlyQuery.mockReset();
    mockGenerateStructured.mockReset();
    // Reset the annotations store between tests
    useAnnotationsStore.getState().reset();
  });

  // ── Initial state ──────────────────────────────────────────────────────

  it("starts with idle progress (not running, done=0, total=0, no error)", () => {
    const { result } = renderHook(() => useHypotheses(baseCfg()));
    const { progress } = result.current;
    expect(progress.running).toBe(false);
    expect(progress.done).toBe(0);
    expect(progress.total).toBe(0);
    expect(progress.error).toBeNull();
  });

  it("exposes ai.progress and ai.availability from useAI", () => {
    const { result } = renderHook(() => useHypotheses(baseCfg()));
    // These come directly from the mocked useAI return value.
    expect(result.current.aiProgress).toBe(mockProgress);
    expect(result.current.availability).toBe(mockAvailability);
  });

  // ── Null config guard ──────────────────────────────────────────────────

  it("run() is a no-op when cfg is null (progress stays idle)", async () => {
    const { result } = renderHook(() => useHypotheses(null));

    await act(async () => {
      await result.current.run();
    });

    // runReadOnlyQuery must never have been called.
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
    expect(result.current.progress.running).toBe(false);
    expect(result.current.progress.error).toBeNull();
  });

  // ── Happy path: rows are fetched and annotations are written ───────────

  it("processes a single row and writes its annotation to the store", async () => {
    // Arrange: DuckDB returns one material row.
    runReadOnlyQuery.mockResolvedValue([rawRow("USSD", 200)]);
    mockGenerateStructured.mockResolvedValue(makeHypothesisResult("Human Error"));

    const { result } = renderHook(() => useHypotheses(baseCfg()));

    // Act
    await act(async () => {
      await result.current.run(12);
    });

    // Assert: progress is back to idle/done state.
    expect(result.current.progress.running).toBe(false);
    expect(result.current.progress.done).toBe(1);
    expect(result.current.progress.total).toBe(1);
    expect(result.current.progress.error).toBeNull();

    // Assert: annotation was written to the zustand store.
    const annotation = useAnnotationsStore.getState().getAnnotation("USSD");
    expect(annotation.reasonCode).toBe("Human Error");
    expect(annotation.confidence).toBe(0.85);
    expect(annotation.hypothesis).toBe(
      "The variance was caused by a manual data-entry error on the expected side.",
    );
  });

  it("processes multiple rows sequentially, incrementing done after each", async () => {
    // Arrange: two material rows.
    runReadOnlyQuery.mockResolvedValue([rawRow("VOICE", 100), rawRow("DATA", 50)]);
    mockGenerateStructured
      .mockResolvedValueOnce(makeHypothesisResult("System Issue"))
      .mockResolvedValueOnce(makeHypothesisResult("Timing / Cutoff"));

    const { result } = renderHook(() => useHypotheses(baseCfg()));

    await act(async () => {
      await result.current.run(12);
    });

    expect(result.current.progress.done).toBe(2);
    expect(result.current.progress.total).toBe(2);
    expect(result.current.progress.running).toBe(false);

    // Both annotations should be in the store.
    expect(useAnnotationsStore.getState().getAnnotation("VOICE").reasonCode).toBe("System Issue");
    expect(useAnnotationsStore.getState().getAnnotation("DATA").reasonCode).toBe(
      "Timing / Cutoff",
    );
  });

  it("passes maxRows to fetchMaterialRows (forwarded to runReadOnlyQuery)", async () => {
    // Arrange: empty result so the run completes immediately.
    runReadOnlyQuery.mockResolvedValue([]);

    const { result } = renderHook(() => useHypotheses(baseCfg()));

    await act(async () => {
      await result.current.run(5);
    });

    // The SQL generated by buildMaterialRowsSQL contains LIMIT 5; we just
    // verify that runReadOnlyQuery was called (SQL content is tested in
    // recon-sql.test.ts).
    expect(runReadOnlyQuery).toHaveBeenCalledTimes(1);
    const sql: string = runReadOnlyQuery.mock.calls[0][0];
    expect(sql).toContain("5");
  });

  it("uses default maxRows of 12 when run() is called with no argument", async () => {
    runReadOnlyQuery.mockResolvedValue([]);

    const { result } = renderHook(() => useHypotheses(baseCfg()));

    await act(async () => {
      await result.current.run();
    });

    const sql: string = runReadOnlyQuery.mock.calls[0][0];
    expect(sql).toContain("12");
  });

  // ── Per-row error resilience ───────────────────────────────────────────

  it("continues processing remaining rows when one AI call fails", async () => {
    // Arrange: three rows, second AI call throws.
    runReadOnlyQuery.mockResolvedValue([
      rawRow("ROW_A", 10),
      rawRow("ROW_B", 20),
      rawRow("ROW_C", 30),
    ]);
    mockGenerateStructured
      .mockResolvedValueOnce(makeHypothesisResult("Campaign Effect"))
      .mockRejectedValueOnce(new Error("Inference timeout"))
      .mockResolvedValueOnce(makeHypothesisResult("Pricing Change"));

    const { result } = renderHook(() => useHypotheses(baseCfg()));

    await act(async () => {
      await result.current.run(12);
    });

    // All three increments happened (done counts even failed rows).
    expect(result.current.progress.done).toBe(3);
    expect(result.current.progress.total).toBe(3);
    // Outer error state must NOT be set — per-row failures are swallowed.
    expect(result.current.progress.error).toBeNull();
    expect(result.current.progress.running).toBe(false);

    // ROW_A and ROW_C got annotations; ROW_B was silently skipped.
    expect(useAnnotationsStore.getState().getAnnotation("ROW_A").reasonCode).toBe(
      "Campaign Effect",
    );
    expect(useAnnotationsStore.getState().getAnnotation("ROW_B").reasonCode).toBe("Unknown"); // EMPTY_ANNOTATION default
    expect(useAnnotationsStore.getState().getAnnotation("ROW_C").reasonCode).toBe(
      "Pricing Change",
    );
  });

  // ── Outer fetch error ─────────────────────────────────────────────────

  it("sets progress.error when fetchMaterialRows itself throws", async () => {
    // Arrange: DuckDB call rejects.
    runReadOnlyQuery.mockRejectedValue(new Error("DuckDB out of memory"));

    const { result } = renderHook(() => useHypotheses(baseCfg()));

    await act(async () => {
      await result.current.run(12);
    });

    expect(result.current.progress.running).toBe(false);
    expect(result.current.progress.error).toBe("DuckDB out of memory");
    expect(result.current.progress.done).toBe(0);
    expect(result.current.progress.total).toBe(0);
  });

  it("sets a fallback error message when the thrown value is not an Error instance", async () => {
    // Throwing a plain string to exercise the non-Error branch.
    runReadOnlyQuery.mockRejectedValue("something went wrong");

    const { result } = renderHook(() => useHypotheses(baseCfg()));

    await act(async () => {
      await result.current.run(12);
    });

    expect(result.current.progress.error).toBe("Hypothesis generation failed.");
  });

  // ── Progress shape during execution ───────────────────────────────────

  it("sets running=true and total=rows.length after material rows are fetched", async () => {
    // We need to capture intermediate state; spy on the progress updater by
    // observing multiple renders. Use a delayed mock so we can inspect mid-run.

    const resolveQuery = { fn: (_: unknown) => {} };
    runReadOnlyQuery.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveQuery.fn = resolve;
        }),
    );

    const { result } = renderHook(() => useHypotheses(baseCfg()));

    // Start run but don't await yet.
    let runPromise: Promise<void>;
    act(() => {
      runPromise = result.current.run(12);
    });

    // Progress should be running=true, total=0 while the query is in-flight.
    await waitFor(() => {
      expect(result.current.progress.running).toBe(true);
    });
    expect(result.current.progress.total).toBe(0);

    // Now resolve the query with two rows.
    mockGenerateStructured.mockResolvedValue(makeHypothesisResult());
    act(() => {
      resolveQuery.fn([rawRow("X1"), rawRow("X2")]);
    });

    await act(async () => {
      await runPromise!;
    });

    expect(result.current.progress.total).toBe(2);
    expect(result.current.progress.done).toBe(2);
    expect(result.current.progress.running).toBe(false);
  });

  // ── Zero-rows case ─────────────────────────────────────────────────────

  it("completes immediately and sets running=false when there are no material rows", async () => {
    runReadOnlyQuery.mockResolvedValue([]);

    const { result } = renderHook(() => useHypotheses(baseCfg()));

    await act(async () => {
      await result.current.run(12);
    });

    expect(result.current.progress.running).toBe(false);
    expect(result.current.progress.done).toBe(0);
    expect(result.current.progress.total).toBe(0);
    expect(result.current.progress.error).toBeNull();
    expect(mockGenerateStructured).not.toHaveBeenCalled();
  });

  // ── generateStructured request shape ──────────────────────────────────

  it("calls generateStructured with the correct system prompt and HypothesisSchema", async () => {
    runReadOnlyQuery.mockResolvedValue([rawRow("USSD", 100)]);
    mockGenerateStructured.mockResolvedValue(makeHypothesisResult());

    const { result } = renderHook(() => useHypotheses(baseCfg()));

    await act(async () => {
      await result.current.run(12);
    });

    expect(mockGenerateStructured).toHaveBeenCalledTimes(1);
    const [req, schema] = mockGenerateStructured.mock.calls[0];

    // System prompt must mention "reconciliation".
    expect(req.system).toContain("reconciliation");
    // Prompt must reference the row key.
    expect(req.prompt).toContain("USSD");
    // Temperature and maxTokens must be set.
    expect(req.maxTokens).toBe(256);
    expect(req.temperature).toBe(0.2);
    // Schema must be the HypothesisSchema.
    expect(schema).toBe(HypothesisSchema);
  });

  // ── buildPrompt coverage via integration ──────────────────────────────

  it("includes variancePct as 'n/a' in the prompt when variancePct is null", async () => {
    // Arrange a raw row where varpct is null.
    runReadOnlyQuery.mockResolvedValue([
      {
        key_0: "NULL_PCT",
        exp_revenue: 100,
        act_revenue: 200,
        var_revenue: 100,
        varpct_revenue: null,
        diff_status: "CHANGED",
      },
    ]);
    mockGenerateStructured.mockResolvedValue(makeHypothesisResult());

    const { result } = renderHook(() => useHypotheses(baseCfg()));

    await act(async () => {
      await result.current.run(1);
    });

    const [req] = mockGenerateStructured.mock.calls[0];
    // The buildPrompt function formats null variancePct as "n/a".
    expect(req.prompt).toContain("n/a");
  });

  it("formats positive variance with a '+' prefix in the prompt", async () => {
    runReadOnlyQuery.mockResolvedValue([
      {
        key_0: "POS_VAR",
        exp_revenue: 100,
        act_revenue: 200,
        var_revenue: 100,
        varpct_revenue: 100,
        diff_status: "CHANGED",
      },
    ]);
    mockGenerateStructured.mockResolvedValue(makeHypothesisResult());

    const { result } = renderHook(() => useHypotheses(baseCfg()));

    await act(async () => {
      await result.current.run(1);
    });

    const [req] = mockGenerateStructured.mock.calls[0];
    expect(req.prompt).toContain("+100");
  });

  it("does NOT add a '+' prefix for negative variance in the prompt", async () => {
    runReadOnlyQuery.mockResolvedValue([
      {
        key_0: "NEG_VAR",
        exp_revenue: 200,
        act_revenue: 100,
        var_revenue: -100,
        varpct_revenue: -50,
        diff_status: "CHANGED",
      },
    ]);
    mockGenerateStructured.mockResolvedValue(makeHypothesisResult());

    const { result } = renderHook(() => useHypotheses(baseCfg()));

    await act(async () => {
      await result.current.run(1);
    });

    const [req] = mockGenerateStructured.mock.calls[0];
    // Negative variance should just be "-100", NOT "+-100".
    expect(req.prompt).toContain("-100");
    expect(req.prompt).not.toContain("+-100");
  });

  it("formats null expected/actual as '∅' in the prompt", async () => {
    runReadOnlyQuery.mockResolvedValue([
      {
        key_0: "NULL_VALS",
        exp_revenue: null,
        act_revenue: null,
        var_revenue: 0,
        varpct_revenue: null,
        diff_status: "ADDED",
      },
    ]);
    mockGenerateStructured.mockResolvedValue(makeHypothesisResult());

    const { result } = renderHook(() => useHypotheses(baseCfg()));

    await act(async () => {
      await result.current.run(1);
    });

    const [req] = mockGenerateStructured.mock.calls[0];
    expect(req.prompt).toContain("∅");
  });
});
