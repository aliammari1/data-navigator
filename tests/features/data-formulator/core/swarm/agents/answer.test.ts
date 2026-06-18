import { describe, expect, it, vi } from "vitest";
import { runAnswer } from "@/features/data-formulator/core/swarm/agents/answer";
import type {
  Artifact,
  SwarmContext,
} from "@/features/data-formulator/core/swarm/types";
import type { ChartSpec, ColumnInfo } from "@/features/data-formulator/core/types";
import type { InferenceScheduler } from "@/features/data-formulator/core/swarm/scheduler";

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
    model: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
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
    expect(result.modelUsed).toBe("qwen2.5-1.5b-instruct-q4_k_m.gguf");
  });

  it("keeps the model's confidence when real data backs the answer", async () => {
    const { scheduler } = schedulerReturning(goodAnswer);
    const result = await runAnswer(
      scheduler,
      makeCtx(),
      "goal",
      [chartArtifact([{ x_val: "A", y_val: 1 }])],
    );
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
    const result = await runAnswer(
      scheduler,
      makeCtx(),
      "goal",
      [tableArtifact([]), chartArtifact([{ x_val: "A", y_val: 1 }])],
    );
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
