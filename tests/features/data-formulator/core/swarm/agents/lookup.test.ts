import { beforeEach, describe, expect, it, vi } from "vitest";

// runLookup -> runTableArtifact -> runReadOnlyQuery. Mock the DuckDB boundary.
const runReadOnlyQuery = vi.fn();
vi.mock("@/platform/duckdb/duckdb", () => ({
  runReadOnlyQuery: (sql: string) => runReadOnlyQuery(sql),
}));

import { runLookup } from "@/features/data-formulator/core/swarm/agents/lookup";
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
    rowSample: [],
    rowCount: 500,
    model: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
    ...overrides,
  };
}

/**
 * Scheduler stub: `generateStructured` returns the queued model outputs in
 * order (one per attempt); `io` simply runs the factory so the (mocked) SQL run
 * executes synchronously.
 */
function makeScheduler(outputs: unknown[]): {
  scheduler: InferenceScheduler;
  generateStructured: ReturnType<typeof vi.fn>;
} {
  const generateStructured = vi.fn();
  for (const out of outputs) generateStructured.mockResolvedValueOnce(out);
  const scheduler = {
    generateStructured,
    io: <T>(factory: () => Promise<T>) => factory(),
  } as unknown as InferenceScheduler;
  return { scheduler, generateStructured };
}

beforeEach(() => {
  runReadOnlyQuery.mockReset();
});

describe("runLookup", () => {
  it("runs the model's SQL once and returns a finished result with the table artifact", async () => {
    runReadOnlyQuery.mockResolvedValue([{ channel: "USSD", n: 3 }]);
    const { scheduler, generateStructured } = makeScheduler([
      {
        sql: "SELECT channel, COUNT(*) n FROM tx_view GROUP BY channel LIMIT 200",
        headline: "  Three USSD rows  ",
        summary: "  USSD has 3 transactions.  ",
        confidence: "high",
      },
    ]);

    const result = await runLookup(scheduler, makeCtx({ userPrompt: "How many USSD?" }));

    expect(generateStructured).toHaveBeenCalledOnce();
    expect(runReadOnlyQuery).toHaveBeenCalledOnce();
    expect(result.goal).toBe("How many USSD?");
    expect(result.headline).toBe("Three USSD rows");
    expect(result.summary).toBe("USSD has 3 transactions.");
    expect(result.confidence).toBe("high");
    expect(result.evidence).toEqual([]);
    expect(result.followUps).toEqual([]);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].kind).toBe("table");
    expect(result.artifacts[0]).toMatchObject({ rows: [{ channel: "USSD", n: 3 }] });
    expect(result.modelUsed).toBe("qwen2.5-1.5b-instruct-q4_k_m.gguf");
  });

  it("falls back to the headline as the goal when there is no user prompt", async () => {
    runReadOnlyQuery.mockResolvedValue([{ x: 1 }]);
    const { scheduler } = makeScheduler([
      { sql: "SELECT 1 x", headline: "Answer", summary: "s", confidence: "medium" },
    ]);
    const result = await runLookup(scheduler, makeCtx({ userPrompt: undefined }));
    expect(result.goal).toBe("Answer");
  });

  it("downgrades confidence to 'low' when the query returns no rows", async () => {
    runReadOnlyQuery.mockResolvedValue([]);
    const { scheduler } = makeScheduler([
      { sql: "SELECT 1 WHERE 1=0", headline: "Nothing", summary: "none", confidence: "high" },
    ]);
    const result = await runLookup(scheduler, makeCtx());
    expect(result.confidence).toBe("low");
    expect(result.artifacts[0]).toMatchObject({ rows: [] });
  });

  it("retries with a corrected-SQL prompt after a rejected (non-read-only) statement", async () => {
    runReadOnlyQuery.mockResolvedValue([{ ok: 1 }]);
    const { scheduler, generateStructured } = makeScheduler([
      { sql: "DELETE FROM tx_view", headline: "bad", summary: "x", confidence: "low" },
      { sql: "SELECT 1 ok", headline: "good", summary: "y", confidence: "high" },
    ]);

    const result = await runLookup(scheduler, makeCtx());

    expect(generateStructured).toHaveBeenCalledTimes(2);
    // The second prompt feeds the previous failure + failing SQL back to the model.
    const secondPrompt = generateStructured.mock.calls[1][0].prompt as string;
    expect(secondPrompt).toContain("Your previous SQL failed:");
    expect(secondPrompt).toContain("DELETE FROM tx_view");
    expect(secondPrompt).toContain("Return corrected SQL.");
    expect(result.headline).toBe("good");
    // Only the successful (second) attempt actually queried DuckDB.
    expect(runReadOnlyQuery).toHaveBeenCalledOnce();
  });

  it("throws after exhausting attempts when every statement is invalid", async () => {
    const { scheduler, generateStructured } = makeScheduler([
      { sql: "DROP TABLE tx_view", headline: "a", summary: "x", confidence: "low" },
      { sql: "UPDATE tx_view SET x=1", headline: "b", summary: "y", confidence: "low" },
    ]);

    await expect(runLookup(scheduler, makeCtx())).rejects.toThrow(
      /Lookup failed to produce a runnable query/,
    );
    expect(generateStructured).toHaveBeenCalledTimes(2);
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("retries when the SQL is valid but the query itself throws", async () => {
    runReadOnlyQuery
      .mockRejectedValueOnce(new Error("no such column: nope"))
      .mockResolvedValueOnce([{ ok: 1 }]);
    const { scheduler, generateStructured } = makeScheduler([
      { sql: "SELECT nope FROM tx_view", headline: "h1", summary: "s1", confidence: "low" },
      { sql: "SELECT 1 ok", headline: "h2", summary: "s2", confidence: "high" },
    ]);

    const result = await runLookup(scheduler, makeCtx());

    expect(result.headline).toBe("h2");
    expect(runReadOnlyQuery).toHaveBeenCalledTimes(2);
    const secondPrompt = generateStructured.mock.calls[1][0].prompt as string;
    expect(secondPrompt).toContain("no such column: nope");
  });

  it("sends a grounded base prompt (schema + question) to the model on the first attempt", async () => {
    runReadOnlyQuery.mockResolvedValue([{ x: 1 }]);
    const { scheduler, generateStructured } = makeScheduler([
      { sql: "SELECT 1 x", headline: "h", summary: "s", confidence: "low" },
    ]);

    await runLookup(scheduler, makeCtx({ userPrompt: "How many rows?" }));

    const [req, schema] = generateStructured.mock.calls[0];
    expect(req.model).toBe("qwen2.5-1.5b-instruct-q4_k_m.gguf");
    expect(req.temperature).toBe(0);
    expect(req.system).toMatch(/direct data lookup/i);
    expect(req.prompt).toContain('DuckDB view (query this exact name): "tx_view"');
    expect(req.prompt).toContain("Question: How many rows?");
    // The lookup schema is passed for grammar-constrained decoding.
    expect(schema).toBeDefined();
  });
});
