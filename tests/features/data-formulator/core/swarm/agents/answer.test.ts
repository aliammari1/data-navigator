import { describe, expect, it, vi } from "vitest";
import { runAnswer } from "@/features/data-formulator/core/swarm/agents/answer";
import type { Artifact, SwarmContext } from "@/features/data-formulator/core/swarm/types";
import type { ChartSpec, ColumnInfo } from "@/features/data-formulator/core/types";
import type { InferenceScheduler } from "@/features/data-formulator/core/swarm/scheduler";

import { parseStructured } from "@/platform/ai/provider/structured";

// Mock the structured provider so we can control parseStructured in streaming tests.
vi.mock("@/platform/ai/provider/structured", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/platform/ai/provider/structured")>();
  return {
    ...actual,
    parseStructured: vi.fn(actual.parseStructured),
    buildJsonInstruction: vi.fn(actual.buildJsonInstruction),
  };
});

const columns: ColumnInfo[] = [
  { name: "channel", type: "string", dbType: "VARCHAR" },
  { name: "amount", type: "number", dbType: "DOUBLE" },
];

function makeCtx(overrides: Partial<SwarmContext> = {}): SwarmContext {
  return {
    datasetId: "d1",
    datasetName: "Daily Transactions",
    tableName: "tx_view",
    columns,
    rowSample: [],
    rowCount: 500,
    model: "gemma-4-e4b-it-q4_k_m.gguf",
    ...overrides,
  };
}

function tableArtifact(rows: Record<string, unknown>[]): Artifact {
  return { kind: "table", id: "a1", taskId: "t1", title: "Revenue", rows };
}

function chartArtifact(rows: Record<string, unknown>[]): Artifact {
  const spec: ChartSpec = {
    id: "s1",
    type: "bar",
    title: "By channel",
    limit: 50,
    filters: [],
    encodings: [{ id: "ex", channel: "x", field: "channel" }],
  };
  return { kind: "chart", id: "c1", taskId: "t1", title: "By channel", spec, rows };
}

const goodAnswer = {
  headline: "  USSD leads revenue  ",
  summary: "  USSD is the top channel by total amount.  ",
  evidence: ["USSD total = 10", "  ", "APP total = 4"],
  followUps: ["Break down by week", "  "],
  confidence: "high" as const,
  usedRealData: true,
};

function schedulerReturning(value: unknown): {
  scheduler: InferenceScheduler;
  generateStructured: ReturnType<typeof vi.fn>;
} {
  const generateStructured = vi.fn().mockResolvedValue(value);
  return {
    scheduler: { generateStructured } as unknown as InferenceScheduler,
    generateStructured,
  };
}

describe("runAnswer", () => {
  it("shapes the model output into a SwarmResult, trimming and filtering arrays", async () => {
    const { scheduler } = schedulerReturning(goodAnswer);
    const artifacts = [tableArtifact([{ channel: "USSD", total: 10 }])];

    const result = await runAnswer(scheduler, makeCtx(), "Find the top channel", artifacts);

    expect(result.goal).toBe("Find the top channel");
    expect(result.headline).toBe("USSD leads revenue");
    expect(result.summary).toBe("USSD is the top channel by total amount.");
    // Whitespace-only entries are dropped; the rest are trimmed.
    expect(result.evidence).toEqual(["USSD total = 10", "APP total = 4"]);
    expect(result.followUps).toEqual(["Break down by week"]);
    expect(result.artifacts).toBe(artifacts);
    expect(result.modelUsed).toBe("gemma-4-e4b-it-q4_k_m.gguf");
  });

  it("keeps the model's confidence when real data backs the answer", async () => {
    const { scheduler } = schedulerReturning(goodAnswer);
    const result = await runAnswer(scheduler, makeCtx(), "goal", [
      chartArtifact([{ x_val: "A", y_val: 1 }]),
    ]);
    expect(result.confidence).toBe("high");
  });

  it("caps confidence to 'low' when the model claims real data but no rows exist", async () => {
    const { scheduler } = schedulerReturning({
      ...goodAnswer,
      confidence: "high",
      usedRealData: true,
    });
    // Empty table artifact => no real rows behind the answer.
    const result = await runAnswer(scheduler, makeCtx(), "goal", [tableArtifact([])]);
    expect(result.confidence).toBe("low");
  });

  it("does not downgrade confidence when the model admits it did not use real data", async () => {
    const { scheduler } = schedulerReturning({
      ...goodAnswer,
      confidence: "medium",
      usedRealData: false,
    });
    const result = await runAnswer(scheduler, makeCtx(), "goal", [tableArtifact([])]);
    // hasData is false, but usedRealData is false too, so the cap does not fire.
    expect(result.confidence).toBe("medium");
  });

  it("treats a non-empty chart artifact as real data backing the answer", async () => {
    const { scheduler } = schedulerReturning({
      ...goodAnswer,
      confidence: "high",
      usedRealData: true,
    });
    const result = await runAnswer(scheduler, makeCtx(), "goal", [
      tableArtifact([]),
      chartArtifact([{ x_val: "A", y_val: 1 }]),
    ]);
    expect(result.confidence).toBe("high");
  });

  it("grounds the prompt in the artifact evidence and the user's question", async () => {
    const { scheduler, generateStructured } = schedulerReturning(goodAnswer);
    await runAnswer(
      scheduler,
      makeCtx({ userPrompt: "Quelle est la meilleure chaîne?" }),
      "Find the top channel",
      [tableArtifact([{ channel: "USSD", total: 10 }])],
    );

    const [req] = generateStructured.mock.calls[0];
    expect(req.system).toMatch(/final manager answer/i);
    expect(req.temperature).toBe(0.2);
    expect(req.maxTokens).toBe(700);
    expect(req.prompt).toContain("Goal: Find the top channel");
    expect(req.prompt).toContain("Quelle est la meilleure chaîne?");
    // Real findings are folded in.
    expect(req.prompt).toContain('TABLE "Revenue"');
    expect(req.prompt).toContain('"channel":"USSD"');
  });

  it("includes the 'no data' guard in the prompt when there are no artifacts", async () => {
    const { scheduler, generateStructured } = schedulerReturning({
      ...goodAnswer,
      usedRealData: false,
      confidence: "low",
    });
    await runAnswer(scheduler, makeCtx(), "goal", []);
    const [req] = generateStructured.mock.calls[0];
    expect(req.prompt).toMatch(/no data was successfully retrieved/i);
  });
});

describe("runAnswer — onToken streaming path", () => {
  /**
   * Build a scheduler that supports both `generate` (streaming) and
   * `generateStructured` (grammar-constrained fallback), plus a `signal`.
   */
  function makeStreamingScheduler({
    generateResult,
    generateError,
    structuredResult = goodAnswer,
    aborted = false,
  }: {
    generateResult?: string;
    generateError?: Error;
    structuredResult?: typeof goodAnswer;
    aborted?: boolean;
  }): { scheduler: InferenceScheduler; generate: ReturnType<typeof vi.fn>; generateStructured: ReturnType<typeof vi.fn> } {
    const generate = generateError
      ? vi.fn().mockRejectedValue(generateError)
      : vi.fn().mockResolvedValue(generateResult ?? JSON.stringify(goodAnswer));
    const generateStructured = vi.fn().mockResolvedValue(structuredResult);
    const signal = { aborted } as AbortSignal;
    const scheduler = { generate, generateStructured, signal } as unknown as InferenceScheduler;
    return { scheduler, generate, generateStructured };
  }

  it("calls scheduler.generate and returns a shaped result when streaming succeeds", async () => {
    // parseStructured is mocked to pass through to the real implementation,
    // so we provide a valid JSON string for `generate` to return.
    const rawJson = JSON.stringify(goodAnswer);
    const { scheduler, generate } = makeStreamingScheduler({ generateResult: rawJson });
    const tokens: string[] = [];
    const onToken = (t: string) => tokens.push(t);

    const result = await runAnswer(
      scheduler,
      makeCtx(),
      "Top channel",
      [tableArtifact([{ channel: "USSD", total: 10 }])],
      onToken,
    );

    // scheduler.generate must have been called (not generateStructured).
    expect(generate).toHaveBeenCalledOnce();
    const [req] = generate.mock.calls[0];
    // The JSON instruction is appended to the system prompt.
    expect(req.system).toContain("Respond with ONLY a single valid JSON value");
    // The onToken callback is forwarded.
    expect(req.onToken).toBe(onToken);
    // Result is correctly shaped.
    expect(result.goal).toBe("Top channel");
    expect(result.headline).toBe("USSD leads revenue");
    expect(result.modelUsed).toBe("gemma-4-e4b-it-q4_k_m.gguf");
  });

  it("propagates the error when streaming fails and the signal is aborted", async () => {
    const abortError = new Error("AbortError: run was cancelled");
    const { scheduler } = makeStreamingScheduler({ generateError: abortError, aborted: true });

    await expect(
      runAnswer(scheduler, makeCtx(), "goal", [], () => {}),
    ).rejects.toThrow("AbortError: run was cancelled");
  });

  it("falls back to generateStructured when streaming fails and the signal is not aborted", async () => {
    const parseError = new Error("malformed JSON from small model");
    // usedRealData=false so the mechanical cap does not fire, letting "medium" pass through.
    const { scheduler, generateStructured } = makeStreamingScheduler({
      generateError: parseError,
      aborted: false,
      structuredResult: { ...goodAnswer, confidence: "medium" as const, usedRealData: false },
    });

    const result = await runAnswer(scheduler, makeCtx(), "fallback goal", [], () => {});

    // The grammar-constrained path was used as the fallback.
    expect(generateStructured).toHaveBeenCalledOnce();
    expect(result.goal).toBe("fallback goal");
    // Confidence comes from the structured fallback result (cap does not fire because usedRealData=false).
    expect(result.confidence).toBe("medium");
  });

  it("mechanical confidence cap applies on the streaming path too", async () => {
    // usedRealData=true but no artifact rows — should be capped to 'low'.
    const rawJson = JSON.stringify({ ...goodAnswer, confidence: "high", usedRealData: true });
    const { scheduler } = makeStreamingScheduler({ generateResult: rawJson });

    const result = await runAnswer(
      scheduler,
      makeCtx(),
      "goal",
      [tableArtifact([])],
      () => {},
    );

    expect(result.confidence).toBe("low");
  });

  it("prompt excludes userPrompt line when userPrompt is absent (streaming path)", async () => {
    const rawJson = JSON.stringify(goodAnswer);
    const { scheduler, generate } = makeStreamingScheduler({ generateResult: rawJson });

    await runAnswer(scheduler, makeCtx(), "goal", [], () => {});

    const [req] = generate.mock.calls[0];
    expect(req.prompt).not.toContain("User's question");
  });
});
