import { describe, expect, it, vi } from "vitest";
import {
  batchedVerdictSchema,
  describeArtifact,
  runBatchedCritic,
  runCritic,
} from "@/features/data-formulator/core/swarm/agents/critic";
import type {
  AgentTask,
  Artifact,
  SwarmContext,
} from "@/features/data-formulator/core/swarm/types";
import type { ChartSpec, ColumnInfo } from "@/features/data-formulator/core/types";
import type { InferenceScheduler } from "@/features/data-formulator/core/swarm/scheduler";

const columns: ColumnInfo[] = [
  { name: "channel", type: "string", dbType: "VARCHAR" },
  { name: "amount", type: "number", dbType: "DOUBLE" },
];

const ctx: SwarmContext = {
  datasetId: "d1",
  datasetName: "tx",
  tableName: "tx_view",
  columns,
  rowSample: [],
  rowCount: 100,
  model: "gemma-4-e4b-it-q4_k_m.gguf",
};

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: "task-1",
    role: "query",
    title: "Channel revenue",
    instruction: "Compute revenue per channel.",
    dependsOn: [],
    ...overrides,
  };
}

function tableArtifact(rows = [{ channel: "USSD", total: 10 }]): Artifact {
  return {
    kind: "table",
    id: "a1",
    taskId: "task-1",
    title: "Revenue",
    rows,
    sql: "SELECT channel, SUM(amount) total FROM tx_view GROUP BY channel",
  };
}

function chartArtifact(): Artifact {
  const spec: ChartSpec = {
    id: "s1",
    type: "line",
    title: "Trend",
    limit: 50,
    filters: [],
    encodings: [
      { id: "ex", channel: "x", field: "channel" },
      { id: "ey", channel: "y", field: "amount" },
    ],
  };
  return {
    kind: "chart",
    id: "c1",
    taskId: "task-1",
    title: "Trend",
    spec,
    rows: [{ x_val: "A", y_val: 1 }],
    sql: "SELECT 1",
  };
}

/** A scheduler whose only used method is generateStructured. */
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

describe("describeArtifact", () => {
  it("describes a chart with type, encodings, and row count", () => {
    const out = describeArtifact(chartArtifact());
    expect(out).toContain('[chart] "Trend"');
    expect(out).toContain("type=line");
    expect(out).toContain("x=channel");
    expect(out).toContain("y=amount");
    expect(out).toContain("rows=1");
    expect(out).toContain("sql=SELECT 1");
  });

  it("describes a table with its row count and sql", () => {
    const out = describeArtifact(tableArtifact());
    expect(out).toContain('[table] "Revenue"');
    expect(out).toContain("rows=1");
    expect(out).toContain("sql=SELECT");
  });

  it("describes a KPI with label, value, and delta", () => {
    const out = describeArtifact({
      kind: "kpi",
      id: "k1",
      taskId: "task-1",
      title: "Total",
      label: "Revenue",
      value: "10k",
      delta: 4,
    });
    expect(out).toContain('[kpi] "Total"');
    expect(out).toContain("Revenue=10k");
    expect(out).toContain("delta=4");
  });

  it("omits the delta segment for a KPI with no delta", () => {
    const out = describeArtifact({
      kind: "kpi",
      id: "k1",
      taskId: "task-1",
      title: "Total",
      label: "Revenue",
      value: "10k",
    });
    expect(out).not.toContain("delta=");
  });

  it("describes an insight with severity and body", () => {
    const out = describeArtifact({
      kind: "insight",
      id: "i1",
      taskId: "task-1",
      title: "Dip",
      severity: "high",
      body: "USSD dropped 30%",
    });
    expect(out).toContain('[insight] "Dip"');
    expect(out).toContain("severity=high");
    expect(out).toContain("body=USSD dropped 30%");
  });
});

describe("runCritic", () => {
  it("rejects immediately without an LLM call when no artifacts were produced", async () => {
    const { scheduler, generateStructured } = schedulerReturning(undefined);

    const verdict = await runCritic({ scheduler, ctx, task: task(), artifacts: [] });

    expect(generateStructured).not.toHaveBeenCalled();
    expect(verdict).toEqual({
      taskId: "task-1",
      accepted: false,
      reason: "No artifacts produced.",
      confidence: "high",
    });
  });

  it("returns an accepted verdict built from the model output", async () => {
    const { scheduler } = schedulerReturning({
      accepted: true,
      reason: "  Faithful and grounded.  ",
      confidence: "high",
    });

    const verdict = await runCritic({
      scheduler,
      ctx,
      task: task(),
      artifacts: [tableArtifact()],
    });

    expect(verdict.taskId).toBe("task-1");
    expect(verdict.accepted).toBe(true);
    // The reason is trimmed.
    expect(verdict.reason).toBe("Faithful and grounded.");
    expect(verdict.confidence).toBe("high");
  });

  it("returns a rejected verdict when the model rejects", async () => {
    const { scheduler } = schedulerReturning({
      accepted: false,
      reason: "Claims a number the data does not show.",
      confidence: "medium",
    });
    const verdict = await runCritic({
      scheduler,
      ctx,
      task: task(),
      artifacts: [tableArtifact()],
    });
    expect(verdict.accepted).toBe(false);
    expect(verdict.confidence).toBe("medium");
  });

  it("passes a grounded prompt with the schema, task, and artifact report to the model", async () => {
    const { scheduler, generateStructured } = schedulerReturning({
      accepted: true,
      reason: "ok",
      confidence: "low",
    });

    await runCritic({
      scheduler,
      ctx,
      task: task({ title: "Revenue by channel", instruction: "Sum per channel" }),
      artifacts: [tableArtifact()],
    });

    const [req] = generateStructured.mock.calls[0];
    expect(req.model).toBe(ctx.model);
    expect(req.temperature).toBe(0);
    // System primes the skeptical reviewer role.
    expect(req.system).toMatch(/skeptical data-analysis reviewer/i);
    // Prompt carries the real column allowlist, the task, and the artifact report.
    expect(req.prompt).toContain("channel, amount");
    expect(req.prompt).toContain("Task title: Revenue by channel");
    expect(req.prompt).toContain("Task instruction: Sum per channel");
    expect(req.prompt).toContain('[table] "Revenue"');
  });

  it("throws when the model returns no usable verdict", async () => {
    const { scheduler } = schedulerReturning(undefined);
    await expect(
      runCritic({ scheduler, ctx, task: task(), artifacts: [tableArtifact()] }),
    ).rejects.toThrow(/no usable verdict/i);
  });

  it("throws when the verdict's accepted field is not a boolean", async () => {
    const { scheduler } = schedulerReturning({
      accepted: "yes",
      reason: "x",
      confidence: "low",
    });
    await expect(
      runCritic({ scheduler, ctx, task: task(), artifacts: [tableArtifact()] }),
    ).rejects.toThrow(/no usable verdict/i);
  });
});

describe("runBatchedCritic", () => {
  it("returns an empty array without an LLM call for no items", async () => {
    const { scheduler, generateStructured } = schedulerReturning({ verdicts: [] });
    const out = await runBatchedCritic({ scheduler, ctx, items: [] });
    expect(out).toEqual([]);
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("maps each model verdict to a CriticVerdict, trimming reasons", async () => {
    const { scheduler } = schedulerReturning({
      verdicts: [
        { taskId: "t1", accepted: true, reason: "  good  ", confidence: "high" },
        { taskId: "t2", accepted: false, reason: "bad", confidence: "low" },
      ],
    });

    const out = await runBatchedCritic({
      scheduler,
      ctx,
      items: [
        { task: task({ id: "t1" }), artifacts: [tableArtifact()] },
        { task: task({ id: "t2", title: "Trend" }), artifacts: [chartArtifact()] },
      ],
    });

    expect(out).toEqual([
      { taskId: "t1", accepted: true, reason: "good", confidence: "high" },
      { taskId: "t2", accepted: false, reason: "bad", confidence: "low" },
    ]);
  });

  it("builds one prompt covering every task id and its artifacts", async () => {
    const { scheduler, generateStructured } = schedulerReturning({ verdicts: [] });

    await runBatchedCritic({
      scheduler,
      ctx,
      items: [
        { task: task({ id: "t1", title: "A" }), artifacts: [tableArtifact()] },
        { task: task({ id: "t2", title: "B" }), artifacts: [chartArtifact()] },
      ],
    });

    const [req] = generateStructured.mock.calls[0];
    expect(req.prompt).toContain("TASK t1 — A");
    expect(req.prompt).toContain("TASK t2 — B");
    expect(req.prompt).toContain("Return exactly one verdict per taskId above.");
    expect(req.maxTokens).toBe(512);
  });
});

describe("batchedVerdictSchema", () => {
  it("accepts a well-formed batched verdict payload", () => {
    const parsed = batchedVerdictSchema.parse({
      verdicts: [{ taskId: "t1", accepted: true, reason: "ok", confidence: "medium" }],
    });
    expect(parsed.verdicts).toHaveLength(1);
  });

  it("rejects a verdict with an out-of-enum confidence", () => {
    expect(() =>
      batchedVerdictSchema.parse({
        verdicts: [{ taskId: "t1", accepted: true, reason: "ok", confidence: "certain" }],
      }),
    ).toThrow();
  });
});
