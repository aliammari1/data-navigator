import { describe, expect, it, vi } from "vitest";
import {
  analysisPlanSchema,
  runAnalysisPlan,
} from "@/features/data-formulator/core/swarm/agents/analyze";
import type { SwarmContext } from "@/features/data-formulator/core/swarm/types";
import type { ColumnInfo } from "@/features/data-formulator/core/types";
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
    rowSample: [{ channel: "USSD", amount: 10 }],
    rowCount: 500,
    model: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
    ...overrides,
  };
}

const validPlan = {
  goal: "Understand channel revenue",
  reasoning: "Group revenue by channel and look for dips.",
  sqlSpecs: [
    { id: "s1", purpose: "Revenue per channel", sql: "SELECT channel FROM t" },
  ],
  chartSpecs: [{ usesSqlId: "s1", type: "bar", x: "channel", y: "amount" }],
  anomalyChecks: [{ usesSqlId: "s1", kind: "dip" }],
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

describe("runAnalysisPlan", () => {
  it("returns the model's structured plan unchanged", async () => {
    const { scheduler } = schedulerReturning(validPlan);
    const plan = await runAnalysisPlan(scheduler, makeCtx());
    expect(plan).toEqual(validPlan);
  });

  it("validates against the plan schema and forwards it to the model", async () => {
    const { scheduler, generateStructured } = schedulerReturning(validPlan);
    await runAnalysisPlan(scheduler, makeCtx());

    expect(generateStructured).toHaveBeenCalledOnce();
    const [req, schema] = generateStructured.mock.calls[0];
    expect(schema).toBe(analysisPlanSchema);
    expect(req.model).toBe("qwen2.5-1.5b-instruct-q4_k_m.gguf");
    expect(req.temperature).toBe(0);
    expect(req.maxTokens).toBe(1024);
    // The analyst-planner system prompt is used.
    expect(req.system).toMatch(/analyst-planner/i);
  });

  it("embeds the dataset grounding block and the user's question in the prompt", async () => {
    const { scheduler, generateStructured } = schedulerReturning(validPlan);
    await runAnalysisPlan(
      scheduler,
      makeCtx({ userPrompt: "Why did USSD drop?" }),
    );

    const [req] = generateStructured.mock.calls[0];
    expect(req.prompt).toContain('DuckDB view (query this exact name): "tx_view"');
    expect(req.prompt).toContain("Question: Why did USSD drop?");
    expect(req.prompt).toContain(
      "Produce the analysis plan now: reasoning first, then the specs.",
    );
    // A grounding systemPrefix is passed for prompt-cache reuse.
    expect(req.systemPrefix).toContain('"tx_view"');
  });

  it("omits the Question line when there is no user prompt", async () => {
    const { scheduler, generateStructured } = schedulerReturning(validPlan);
    await runAnalysisPlan(scheduler, makeCtx({ userPrompt: undefined }));
    const [req] = generateStructured.mock.calls[0];
    expect(req.prompt).not.toContain("Question:");
  });
});

describe("analysisPlanSchema", () => {
  it("parses a minimal valid plan", () => {
    expect(() => analysisPlanSchema.parse(validPlan)).not.toThrow();
  });

  it("allows empty spec arrays", () => {
    const parsed = analysisPlanSchema.parse({
      goal: "g",
      reasoning: "r",
      sqlSpecs: [],
      chartSpecs: [],
      anomalyChecks: [],
    });
    expect(parsed.sqlSpecs).toHaveLength(0);
  });

  it("rejects more than 4 sqlSpecs", () => {
    const tooMany = {
      ...validPlan,
      sqlSpecs: Array.from({ length: 5 }, (_, i) => ({
        id: `s${i}`,
        purpose: "p",
        sql: "SELECT 1",
      })),
    };
    expect(() => analysisPlanSchema.parse(tooMany)).toThrow();
  });

  it("rejects a chartSpec with a chart type outside the allowed vocabulary", () => {
    const bad = {
      ...validPlan,
      chartSpecs: [{ usesSqlId: "s1", type: "sankey", x: "a", y: "b" }],
    };
    expect(() => analysisPlanSchema.parse(bad)).toThrow();
  });

  it("rejects an anomaly check with an unknown kind", () => {
    const bad = {
      ...validPlan,
      anomalyChecks: [{ usesSqlId: "s1", kind: "wobble" }],
    };
    expect(() => analysisPlanSchema.parse(bad)).toThrow();
  });

  it("treats the chart series field as optional", () => {
    const parsed = analysisPlanSchema.parse({
      ...validPlan,
      chartSpecs: [
        { usesSqlId: "s1", type: "line", x: "channel", y: "amount", series: "region" },
      ],
    });
    expect(parsed.chartSpecs[0].series).toBe("region");
  });
});
