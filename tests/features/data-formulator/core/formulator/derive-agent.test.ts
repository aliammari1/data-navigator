import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";

// The derive agent reaches the local model through the provider registry.
// Mock that boundary: `getProvider` hands back a stub whose generate /
// generateStructured delegate to the spies below (referenced lazily inside
// closures, so hoisting is safe).
const generate = vi.fn();
const generateStructured = vi.fn();

vi.mock("@/platform/ai/provider", () => ({
  detectAvailability: async () => [{ id: "llamacpp", label: "stub", available: true }],
  getProvider: () => ({
    id: "llamacpp",
    listModels: async () => [{ id: "stub.gguf", label: "Stub" }],
    generate: (req: unknown) => generate(req),
    generateStructured: (req: unknown, schema: unknown) => generateStructured(req, schema),
  }),
  useAIRuntimeStore: { getState: () => ({ model: "stub.gguf" }) },
}));

import {
  buildDataSummary,
  deriveData,
  extractCodeBlock,
  generateCode,
  refineGoal,
  resolveRuntime,
} from "@/features/data-formulator/core/formulator/derive-agent";
import {
  type DeriveMessage,
  MAX_REPAIR_ATTEMPTS,
  PROMPT_EXAMPLE_VALUES,
  PROMPT_SAMPLE_ROWS,
  type RefinedGoal,
  type TableNode,
} from "@/features/data-formulator/core/formulator/model";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ROWS = Array.from({ length: 10 }, (_, i) => ({
  channel: `canal_${i}`, // 10 distinct values — more than PROMPT_EXAMPLE_VALUES
  amount: i * 10,
  ok: i % 2 === 0,
}));

const parent: TableNode = {
  id: "t1",
  name: "transactions",
  kind: "original",
  parentId: null,
  duckdbView: "tx_view",
  columns: [
    { name: "channel", type: "string", dbType: "VARCHAR" },
    { name: "amount", type: "number", dbType: "DOUBLE" },
    { name: "ok", type: "boolean", dbType: "BOOLEAN" },
  ],
  rowCount: 10,
  rows: ROWS,
  createdAt: 0,
};

function makeGoal(overrides: Partial<RefinedGoal> = {}): RefinedGoal {
  return {
    engine: "sql",
    detailed_instruction: "Compute the failure rate per channel.",
    display_label: "Taux d'échec par canal",
    output_fields: [
      { name: "channel", type: "string" },
      { name: "taux_echec", type: "number" },
    ],
    chart_type: "bar",
    reason: "Aggregation per channel.",
    ...overrides,
  };
}

function deriveInput(overrides: Partial<Parameters<typeof deriveData>[0]> = {}) {
  return {
    tables: [parent],
    parentId: "t1",
    instruction: "calcule le taux d'échec par canal",
    shelfFields: ["channel"],
    unknownFields: ["taux_echec"],
    chartType: "bar",
    ...overrides,
  };
}

beforeEach(() => {
  generate.mockReset();
  generateStructured.mockReset();
});

// ─── buildDataSummary ─────────────────────────────────────────────────────────

describe("buildDataSummary", () => {
  it("emits name, per-column example values and sample rows in DF's format", () => {
    const summary = buildDataSummary([parent], ["t1"]);
    const lines = summary.split("\n");

    expect(lines[0]).toBe("table: transactions (10 rows)");
    expect(lines[1]).toBe("fields:");

    const channelLine = lines.find((l) => l.startsWith("- channel"));
    expect(channelLine).toBeDefined();
    // 10 distinct values in the rows, capped at PROMPT_EXAMPLE_VALUES.
    const examples = (channelLine as string).replace("- channel (string): ", "").split(", ");
    expect(examples).toHaveLength(PROMPT_EXAMPLE_VALUES);
    expect(examples[0]).toBe('"canal_0"');

    // Booleans/numbers render bare (unquoted).
    expect(lines.find((l) => l.startsWith("- amount"))).toContain(": 0, 10, 20");
    expect(lines.find((l) => l.startsWith("- ok"))).toContain(": true, false");

    // Exactly PROMPT_SAMPLE_ROWS compact JSON lines after the marker.
    const markerIdx = lines.indexOf("sample rows:");
    expect(markerIdx).toBeGreaterThan(0);
    const sampleLines = lines.slice(markerIdx + 1);
    expect(sampleLines).toHaveLength(PROMPT_SAMPLE_ROWS);
    expect(JSON.parse(sampleLines[0])).toEqual(ROWS[0]);
  });

  it("is deterministic and only includes the focused tables", () => {
    const other: TableNode = {
      ...parent,
      id: "t2",
      name: "autres_ventes",
      rows: [{ channel: "x", amount: 1, ok: true }],
    };
    const once = buildDataSummary([parent, other], ["t1"]);
    const twice = buildDataSummary([parent, other], ["t1"]);
    expect(once).toBe(twice);
    expect(once).not.toContain("autres_ventes");

    const both = buildDataSummary([parent, other], ["t1", "t2"]);
    expect(both).toContain("table: transactions");
    expect(both).toContain("table: autres_ventes");
  });

  it("omits examples and samples when a node has no rows (original in DuckDB)", () => {
    const bare: TableNode = { ...parent, id: "t3", rows: undefined };
    const summary = buildDataSummary([bare], ["t3"]);
    expect(summary).toContain("- channel (string)\n");
    expect(summary).not.toContain("sample rows:");
  });

  it("formats a bigint example via bigIntJsonReplacer rather than throwing on JSON.stringify", () => {
    const withBigInt: TableNode = {
      ...parent,
      id: "t4",
      columns: [{ name: "big", type: "number", dbType: "BIGINT" }],
      rows: [{ big: 9007199254740993n }],
    };
    const summary = buildDataSummary([withBigInt], ["t4"]);
    const bigLine = summary.split("\n").find((l) => l.startsWith("- big"));
    expect(bigLine).toContain("9007199254740993");
  });

  it("formats a Date example as an ISO string", () => {
    const withDate: TableNode = {
      ...parent,
      id: "t5",
      columns: [{ name: "when", type: "date", dbType: "TIMESTAMP" }],
      rows: [{ when: new Date("2026-01-15T00:00:00.000Z") }],
    };
    const summary = buildDataSummary([withDate], ["t5"]);
    const line = summary.split("\n").find((l) => l.startsWith("- when"));
    expect(line).toContain("2026-01-15T00:00:00.000Z");
  });

  it("formats a plain object example via safeJsonStringify (the generic fallback)", () => {
    const withObject: TableNode = {
      ...parent,
      id: "t6",
      columns: [{ name: "meta", type: "string", dbType: "JSON" }],
      rows: [{ meta: { nested: "value" } }],
    };
    const summary = buildDataSummary([withObject], ["t6"]);
    const line = summary.split("\n").find((l) => l.startsWith("- meta"));
    expect(line).toContain('"nested"');
    expect(line).toContain("value");
  });

  it("formats a null/missing example value as the literal string \"null\"", () => {
    const withNull: TableNode = {
      ...parent,
      id: "t8",
      columns: [{ name: "maybe", type: "string", dbType: "VARCHAR" }],
      rows: [{ maybe: null }, { maybe: undefined }],
    };
    const summary = buildDataSummary([withNull], ["t8"]);
    const line = summary.split("\n").find((l) => l.startsWith("- maybe")) as string;
    expect(line).toContain("null");
  });

  it("truncates an overlong example value with an ellipsis", () => {
    const longString = "x".repeat(200);
    const withLong: TableNode = {
      ...parent,
      id: "t7",
      columns: [{ name: "note", type: "string", dbType: "VARCHAR" }],
      rows: [{ note: longString }],
    };
    const summary = buildDataSummary([withLong], ["t7"]);
    const line = summary.split("\n").find((l) => l.startsWith("- note")) as string;
    expect(line).toContain("…");
    // The example fragment itself must be capped, well short of the full 200 chars.
    expect(line.length).toBeLessThan(longString.length);
  });
});

// ─── resolveRuntime — error branches ──────────────────────────────────────────
//
// The shared top-of-file mock always reports an available provider with a
// selected model, so these three branches (no provider ready, no model at
// all, and the model-list fallback) are never exercised through the other
// describe blocks. Each test isolates its own module instance with
// `vi.resetModules()` + `vi.doMock()` so it doesn't disturb the shared mock
// the rest of this file's tests depend on.

describe("resolveRuntime — error branches", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("throws when no offline provider is available", async () => {
    vi.doMock("@/platform/ai/provider", () => ({
      detectAvailability: async () => [{ id: "llamacpp", label: "stub", available: false }],
      getProvider: () => {
        throw new Error("getProvider should not be reached when nothing is ready");
      },
      useAIRuntimeStore: { getState: () => ({ model: null }) },
    }));
    const mod = await import("@/features/data-formulator/core/formulator/derive-agent");
    await expect(mod.resolveRuntime()).rejects.toThrow("No offline AI model is ready");
  });

  it("throws when neither the store nor the provider's model list yields a model id", async () => {
    vi.doMock("@/platform/ai/provider", () => ({
      detectAvailability: async () => [{ id: "llamacpp", label: "stub", available: true }],
      getProvider: () => ({ id: "llamacpp", listModels: async () => [] }),
      useAIRuntimeStore: { getState: () => ({ model: null }) },
    }));
    const mod = await import("@/features/data-formulator/core/formulator/derive-agent");
    await expect(mod.resolveRuntime()).rejects.toThrow('No model available for provider "llamacpp"');
  });

  it("falls back to the provider's first listed model when the store has none selected", async () => {
    vi.doMock("@/platform/ai/provider", () => ({
      detectAvailability: async () => [{ id: "llamacpp", label: "stub", available: true }],
      getProvider: () => ({
        id: "llamacpp",
        listModels: async () => [{ id: "fallback.gguf", label: "Fallback" }],
      }),
      useAIRuntimeStore: { getState: () => ({ model: null }) },
    }));
    const mod = await import("@/features/data-formulator/core/formulator/derive-agent");
    const result = await mod.resolveRuntime();
    expect(result.model).toBe("fallback.gguf");
  });
});

// ─── refineGoal ───────────────────────────────────────────────────────────────

describe("refineGoal", () => {
  it("sends a grounded prompt and parses a python goal through RefinedGoalSchema", async () => {
    const pythonGoal = makeGoal({ engine: "python" });
    // Parse through the REAL schema handed over by the agent, proving the
    // schema accepts a python response (as the grammar lane would).
    generateStructured.mockImplementation(async (_req, schema) =>
      (schema as ZodType).parse(pythonGoal),
    );

    const summary = buildDataSummary([parent], ["t1"]);
    const goal = await refineGoal({
      summary,
      instruction: "pivot les canaux en colonnes",
      shelfFields: ["channel"],
      unknownFields: ["taux_echec"],
      chartType: "heatmap",
      sqlEligible: false,
    });

    expect(goal).toEqual(pythonGoal);
    const [req, schema] = generateStructured.mock.calls[0];
    expect(schema).toBeDefined();
    expect(req.temperature).toBe(0);
    expect(req.model).toBe("stub.gguf");
    // Grounding: summary + instruction + unknown fields + chart type.
    expect(req.prompt).toContain("table: transactions (10 rows)");
    expect(req.prompt).toContain("Instruction: pivot les canaux en colonnes");
    expect(req.prompt).toContain("taux_echec");
    expect(req.prompt).toContain("Current chart type: heatmap");
    // sqlEligible=false → the system prompt carries the python-only constraint.
    expect(req.system).toContain("SQL lane is unavailable");
    expect(req.system).toContain('MUST be "python"');
  });

  it("omits the python-only rule when the sql lane is eligible", async () => {
    generateStructured.mockResolvedValue(makeGoal());
    await refineGoal({
      summary: "table: t (1 rows)",
      instruction: "somme par canal",
      shelfFields: [],
      unknownFields: [],
      chartType: "auto",
      sqlEligible: true,
    });
    const [req] = generateStructured.mock.calls[0];
    expect(req.system).not.toContain("SQL lane is unavailable");
    expect(req.system).toMatch(/pick "sql"/i);
  });

  it("clamps the engine to python when sqlEligible is false but the model said sql", async () => {
    generateStructured.mockResolvedValue(makeGoal({ engine: "sql" }));
    const goal = await refineGoal({
      summary: "table: t (1 rows)",
      instruction: "x",
      shelfFields: [],
      unknownFields: [],
      chartType: "bar",
      sqlEligible: false,
    });
    expect(goal.engine).toBe("python");
  });
});

// ─── generateCode + fenced-block extraction ───────────────────────────────────

describe("extractCodeBlock", () => {
  it("extracts a tagged block", () => {
    expect(extractCodeBlock("```sql\nSELECT 1 FROM src\n```")).toBe("SELECT 1 FROM src");
  });

  it("accepts a missing language tag", () => {
    expect(extractCodeBlock("```\nSELECT 2 FROM src\n```")).toBe("SELECT 2 FROM src");
  });

  it("strips surrounding prose and takes the LAST fenced block", () => {
    const reply = [
      "Here is my first try:",
      "```sql\nSELECT wrong FROM src\n```",
      "Actually, the correct version is:",
      "```sql\nSELECT right FROM src\n```",
      "This should work now.",
    ].join("\n");
    expect(extractCodeBlock(reply)).toBe("SELECT right FROM src");
  });

  it("recovers an unterminated trailing fence", () => {
    expect(extractCodeBlock("```python\nresult = df.head()")).toBe("result = df.head()");
  });

  it("falls back to the whole reply when the model skipped fencing", () => {
    expect(extractCodeBlock("  SELECT plain FROM src  ")).toBe("SELECT plain FROM src");
  });
});

describe("generateCode", () => {
  it("asks for one sql block reading from src and extracts it", async () => {
    generate.mockResolvedValue({
      text: "Sure!\n```sql\nSELECT channel, AVG(amount) AS m FROM src GROUP BY channel\n```",
    });
    const code = await generateCode(makeGoal(), {
      summary: "table: transactions (10 rows)",
      instruction: "moyenne par canal",
    });
    expect(code).toBe("SELECT channel, AVG(amount) AS m FROM src GROUP BY channel");
    const [req] = generate.mock.calls[0];
    expect(req.system).toContain("FROM src");
    expect(req.system).toContain("DuckDB");
    expect(req.prompt).toContain("Goal: Compute the failure rate per channel.");
    expect(req.prompt).toContain("Output fields: channel (string), taux_echec (number)");
  });

  it("uses the pandas df -> result contract for python goals", async () => {
    generate.mockResolvedValue({ text: "```python\nresult = df.groupby('channel').size()\n```" });
    await generateCode(makeGoal({ engine: "python" }), {
      summary: "s",
      instruction: "x",
    });
    const [req] = generate.mock.calls[0];
    expect(req.system).toContain("`df`");
    expect(req.system).toContain("`result`");
    expect(req.system).toContain("pandas");
  });

  it("frames a repair when priorError is set: prior code + error, corrected code only", async () => {
    generate.mockResolvedValue({ text: "```sql\nSELECT fixed FROM src\n```" });
    await generateCode(makeGoal(), {
      summary: "s",
      instruction: "x",
      priorCode: "SELECT broken FROM src",
      priorError: "Binder Error: broken does not exist",
    });
    const [req] = generate.mock.calls[0];
    expect(req.prompt).toContain("Your previous code failed to run.");
    expect(req.prompt).toContain("SELECT broken FROM src");
    expect(req.prompt).toContain("Binder Error: broken does not exist");
    expect(req.prompt).toContain("corrected code only");
  });
});

// ─── deriveData orchestration ─────────────────────────────────────────────────

describe("deriveData", () => {
  it("repairs once after an execution error and succeeds with attempts=2", async () => {
    generateStructured.mockResolvedValue(makeGoal());
    generate
      .mockResolvedValueOnce({ text: "```sql\nSELECT nope FROM src\n```" })
      .mockResolvedValueOnce({ text: "```sql\nSELECT channel FROM src\n```" });
    const runSql = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "Binder Error: nope" })
      .mockResolvedValueOnce({ ok: true });
    const runPython = vi.fn();

    const out = await deriveData(deriveInput(), { runSql, runPython, sqlEligible: true });

    if ("failed" in out) throw new Error(`expected success, got: ${out.error}`);
    expect(out.attempts).toBe(2);
    expect(out.engine).toBe("sql");
    expect(out.code).toBe("SELECT channel FROM src");
    expect(runSql).toHaveBeenCalledTimes(2);
    expect(runPython).not.toHaveBeenCalled();
    // The repair prompt carried the failing code and the engine error verbatim.
    const repairPrompt = generate.mock.calls[1][0].prompt as string;
    expect(repairPrompt).toContain("SELECT nope FROM src");
    expect(repairPrompt).toContain("Binder Error: nope");
  });

  it("returns failed:true with the last code+error once repairs are exhausted", async () => {
    generateStructured.mockResolvedValue(makeGoal());
    generate.mockResolvedValue({ text: "```sql\nSELECT bad FROM src\n```" });
    const runSql = vi.fn().mockResolvedValue({ ok: false, error: "still broken" });

    const out = await deriveData(deriveInput(), {
      runSql,
      runPython: vi.fn(),
      sqlEligible: true,
    });

    expect(out).toMatchObject({
      failed: true,
      error: "still broken",
      code: "SELECT bad FROM src",
    });
    expect((out as { goal: RefinedGoal | null }).goal).not.toBeNull();
    // Initial generation + MAX_REPAIR_ATTEMPTS repair round-trips.
    expect(generate).toHaveBeenCalledTimes(1 + MAX_REPAIR_ATTEMPTS);
    expect(runSql).toHaveBeenCalledTimes(1 + MAX_REPAIR_ATTEMPTS);
  });

  it("routes python goals to runPython and appends the exchange to the dialog", async () => {
    const priorDialog: DeriveMessage[] = [
      { role: "user", content: "première instruction" },
      { role: "assistant", content: "```sql\nSELECT 0\n```" },
    ];
    generateStructured.mockResolvedValue(makeGoal({ engine: "python" }));
    generate.mockResolvedValue({ text: "```python\nresult = df\n```" });
    const runPython = vi.fn().mockResolvedValue({ ok: true });
    const runSql = vi.fn();

    const out = await deriveData(deriveInput({ dialog: priorDialog }), {
      runSql,
      runPython,
      sqlEligible: false,
    });

    if ("failed" in out) throw new Error(`expected success, got: ${out.error}`);
    expect(runPython).toHaveBeenCalledWith("result = df");
    expect(runSql).not.toHaveBeenCalled();
    // Prior exchange preserved, new user+assistant turns appended (DF-style).
    expect(out.dialog).toHaveLength(4);
    expect(out.dialog.slice(0, 2)).toEqual(priorDialog);
    expect(out.dialog[2]).toEqual({
      role: "user",
      content: "calcule le taux d'échec par canal",
    });
    expect(out.dialog[3].role).toBe("assistant");
    expect(out.dialog[3].content).toContain("result = df");
    // The codegen prompt continued the conversation.
    const codegenPrompt = generate.mock.calls[0][0].prompt as string;
    expect(codegenPrompt).toContain("première instruction");
  });

  it("returns failed:true with goal=null when the refine step itself throws", async () => {
    generateStructured.mockRejectedValue(new Error("no offline model is ready"));
    const out = await deriveData(deriveInput(), {
      runSql: vi.fn(),
      runPython: vi.fn(),
      sqlEligible: true,
    });
    expect(out).toMatchObject({ failed: true, goal: null });
    expect((out as { error: string }).error).toContain("no offline model is ready");
    expect(generate).not.toHaveBeenCalled();
  });

  it("treats a throwing engine as an execution error and feeds it to the repair loop", async () => {
    generateStructured.mockResolvedValue(makeGoal());
    generate
      .mockResolvedValueOnce({ text: "```sql\nSELECT a FROM src\n```" })
      .mockResolvedValueOnce({ text: "```sql\nSELECT b FROM src\n```" });
    const runSql = vi
      .fn()
      .mockRejectedValueOnce(new Error("engine crashed"))
      .mockResolvedValueOnce({ ok: true });

    const out = await deriveData(deriveInput(), {
      runSql,
      runPython: vi.fn(),
      sqlEligible: true,
    });

    if ("failed" in out) throw new Error(`expected success, got: ${out.error}`);
    expect(out.attempts).toBe(2);
    const repairPrompt = generate.mock.calls[1][0].prompt as string;
    expect(repairPrompt).toContain("engine crashed");
  });
});

// ─── deriveData — cooperative cancellation ───────────────────────────────────
//
// Cancellation is checked at each pipeline step boundary. Each test aborts the
// signal at a different boundary (as a side effect of the mocked async call
// immediately before that boundary) to reach the matching `cancelled(...)`
// return, verifying the failure shape carries `cancelled: true` and the
// French "Dérivation annulée" message.

describe("deriveData — cooperative cancellation", () => {
  function expectCancelled(out: Awaited<ReturnType<typeof deriveData>>) {
    if (!("failed" in out)) throw new Error("expected a cancelled failure");
    expect(out.failed).toBe(true);
    expect(out.cancelled).toBe(true);
    expect(out.error).toBe("Dérivation annulée");
    return out;
  }

  it("returns cancelled immediately when the signal is already aborted before refining", async () => {
    const controller = new AbortController();
    controller.abort();

    const out = await deriveData(deriveInput({ signal: controller.signal }), {
      runSql: vi.fn(),
      runPython: vi.fn(),
      sqlEligible: true,
    });

    const cancelled = expectCancelled(out);
    expect(cancelled.goal).toBeNull();
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("returns cancelled after the goal is refined but before codegen starts", async () => {
    const controller = new AbortController();
    generateStructured.mockImplementation(async () => {
      controller.abort();
      return makeGoal();
    });

    const out = await deriveData(deriveInput({ signal: controller.signal }), {
      runSql: vi.fn(),
      runPython: vi.fn(),
      sqlEligible: true,
    });

    const cancelled = expectCancelled(out);
    expect(cancelled.goal).not.toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns cancelled at the top of the execute loop, after codegen but before running the code", async () => {
    const controller = new AbortController();
    generateStructured.mockResolvedValue(makeGoal());
    generate.mockImplementation(async () => {
      controller.abort();
      return { text: "```sql\nSELECT 1 FROM src\n```" };
    });
    const runSql = vi.fn();

    const out = await deriveData(deriveInput({ signal: controller.signal }), {
      runSql,
      runPython: vi.fn(),
      sqlEligible: true,
    });

    const cancelled = expectCancelled(out);
    expect(cancelled.code).toBe("SELECT 1 FROM src");
    expect(runSql).not.toHaveBeenCalled();
  });

  it("returns cancelled before generating a repair, after a failed execution attempt", async () => {
    const controller = new AbortController();
    generateStructured.mockResolvedValue(makeGoal());
    generate.mockResolvedValueOnce({ text: "```sql\nSELECT nope FROM src\n```" });
    const runSql = vi.fn().mockImplementation(async () => {
      controller.abort();
      return { ok: false, error: "Binder Error: nope" };
    });

    const out = await deriveData(deriveInput({ signal: controller.signal }), {
      runSql,
      runPython: vi.fn(),
      sqlEligible: true,
    });

    const cancelled = expectCancelled(out);
    expect(cancelled.code).toBe("SELECT nope FROM src");
    // Only the first codegen call happened — the repair round-trip never fired.
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("returns cancelled from the catch block when the refine step throws while already aborted", async () => {
    const controller = new AbortController();
    generateStructured.mockImplementation(async () => {
      controller.abort();
      throw new Error("model crashed mid-refine");
    });

    const out = await deriveData(deriveInput({ signal: controller.signal }), {
      runSql: vi.fn(),
      runPython: vi.fn(),
      sqlEligible: true,
    });

    const cancelled = expectCancelled(out);
    // The refine call never resolved, so `goal` was never assigned.
    expect(cancelled.goal).toBeNull();
  });
});
