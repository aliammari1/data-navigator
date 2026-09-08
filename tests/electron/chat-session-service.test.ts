import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for the Moudir chat-session runtime (Phase A2).
 *
 * Locks the contracts that matter for correctness on the real GGUF runtime:
 * - LRU cap of 2 live sessions (medium-PC memory budget) with native disposal;
 * - chat.db → ChatHistoryItem rehydration (tool rows fold into the model turn);
 * - chat turns use functions + documentFunctionParams and NEVER a grammar
 *   (mutually exclusive per prompt() in node-llama-cpp 3.19);
 * - run_sql caps output (LIMIT-inject + row slice + truncation notice);
 * - make_chart surfaces params as a toolEvent WITHOUT executing anything;
 * - abort signal threads through; tool errors come back as readable strings.
 *
 * Same harness as llama-service.test.ts: node-llama-cpp + electron +
 * duckdb-service are mocked so the service is unit-testable in plain node.
 */

type AnyRecord = Record<string, unknown>;

const {
  getLlamaMock,
  loadModelMock,
  createContextMock,
  chatSessionCtorMock,
  promptMock,
  setChatHistoryMock,
  getChatHistoryMock,
  preloadPromptMock,
  createGrammarForJsonSchemaMock,
  grammarParseMock,
  runReadOnlyQueryMock,
  listDatasetsMock,
  holder,
  createdContexts,
  createdSequences,
} = vi.hoisted(() => ({
  getLlamaMock: vi.fn(),
  loadModelMock: vi.fn(),
  createContextMock: vi.fn(),
  chatSessionCtorMock: vi.fn(),
  promptMock: vi.fn(),
  setChatHistoryMock: vi.fn(),
  getChatHistoryMock: vi.fn(),
  preloadPromptMock: vi.fn(),
  createGrammarForJsonSchemaMock: vi.fn(),
  grammarParseMock: vi.fn(),
  runReadOnlyQueryMock: vi.fn(),
  listDatasetsMock: vi.fn(),
  holder: { userDataDir: "" },
  createdContexts: [] as Array<{ getSequence: () => unknown; dispose: ReturnType<typeof vi.fn> }>,
  createdSequences: [] as Array<{ dispose: ReturnType<typeof vi.fn> }>,
}));

vi.mock("node-llama-cpp", () => ({
  getLlama: getLlamaMock,
  LlamaChatSession: chatSessionCtorMock,
  defineChatSessionFunction: (definition: unknown) => definition,
}));
vi.mock("electron", () => ({ app: { getPath: () => holder.userDataDir } }));
vi.mock("../../electron/duckdb-service", () => ({
  runReadOnlyQuery: runReadOnlyQueryMock,
  listDatasets: listDatasetsMock,
}));

import { MODEL_DOWNLOADS } from "../../electron/model-download-service";

// Real temp userData dir + stub GGUF files so ensureModel's existsSync gate
// passes (the model is only stat-checked; loadModel is mocked).
const USER_DATA_DIR = path.join(os.tmpdir(), "dn-chat-session-service-test");
holder.userDataDir = USER_DATA_DIR;

type ChatFunction = {
  description: string;
  params: unknown;
  handler: (params: unknown) => Promise<string>;
};

async function importService() {
  return import("../../electron/chat-session-service");
}

/** Open a session and run one prompt, capturing the options prompt() received. */
async function promptAndCapture(
  extra: Partial<{
    onToken: (chunk: string) => void;
    onTool: (event: unknown) => void;
    onToolStart: (event: unknown) => void;
    signal: AbortSignal;
  }> = {},
) {
  const svc = await importService();
  await svc.openSession({ conversationId: "c1" });

  let captured: AnyRecord = {};
  promptMock.mockImplementation(async (_text: string, options: AnyRecord) => {
    captured = options;
    (options.onTextChunk as ((chunk: string) => void) | undefined)?.("jeton");
    return "réponse finale";
  });

  const result = await svc.promptSession({ conversationId: "c1", text: "salut", ...extra });
  return { svc, captured, result };
}

describe("chat-session-service", () => {
  beforeEach(() => {
    const llmDir = path.join(USER_DATA_DIR, "models", "llm");
    mkdirSync(llmDir, { recursive: true });
    for (const m of MODEL_DOWNLOADS.filter((x) => x.lane === "llm")) {
      writeFileSync(path.join(llmDir, m.file), "");
    }

    vi.resetModules();
    getLlamaMock.mockReset();
    loadModelMock.mockReset();
    createContextMock.mockReset();
    chatSessionCtorMock.mockReset();
    promptMock.mockReset();
    setChatHistoryMock.mockReset();
    getChatHistoryMock.mockReset();
    preloadPromptMock.mockReset();
    createGrammarForJsonSchemaMock.mockReset();
    grammarParseMock.mockReset();
    runReadOnlyQueryMock.mockReset();
    listDatasetsMock.mockReset();
    createdContexts.length = 0;
    createdSequences.length = 0;

    getLlamaMock.mockResolvedValue({
      loadModel: loadModelMock,
      createGrammarForJsonSchema: createGrammarForJsonSchemaMock,
    });
    loadModelMock.mockResolvedValue({
      dispose: vi.fn(),
      createContext: createContextMock,
    });
    createContextMock.mockImplementation(async () => {
      const sequence = { dispose: vi.fn() };
      const context = { getSequence: () => sequence, dispose: vi.fn(async () => {}) };
      createdSequences.push(sequence);
      createdContexts.push(context);
      return context;
    });
    chatSessionCtorMock.mockImplementation(function (this: AnyRecord, options: unknown) {
      this.options = options;
      this.prompt = promptMock;
      this.setChatHistory = setChatHistoryMock;
      this.getChatHistory = getChatHistoryMock;
      this.preloadPrompt = preloadPromptMock;
    });
    getChatHistoryMock.mockReturnValue([]);
    promptMock.mockResolvedValue("ok");
    createGrammarForJsonSchemaMock.mockResolvedValue({ parse: grammarParseMock });
    grammarParseMock.mockReturnValue({});
    runReadOnlyQueryMock.mockResolvedValue([]);
    listDatasetsMock.mockResolvedValue([]);
  });

  afterAll(() => {
    rmSync(USER_DATA_DIR, { recursive: true, force: true });
  });

  it("evicts and disposes the oldest session beyond the LRU cap of 2", async () => {
    const svc = await importService();

    await svc.openSession({ conversationId: "c1" });
    await svc.openSession({ conversationId: "c2" });
    expect(createdContexts).toHaveLength(2);
    expect(createdContexts[0].dispose).not.toHaveBeenCalled();

    await svc.openSession({ conversationId: "c3" });

    expect(createdContexts).toHaveLength(3);
    expect(createdSequences[0].dispose).toHaveBeenCalledTimes(1);
    expect(createdContexts[0].dispose).toHaveBeenCalledTimes(1);
    expect(createdContexts[1].dispose).not.toHaveBeenCalled();
    expect(createdContexts[2].dispose).not.toHaveBeenCalled();

    // The evicted conversation is gone; the two newest still prompt fine.
    await expect(svc.promptSession({ conversationId: "c1", text: "x" })).rejects.toThrow(
      /No open chat session/,
    );
    await expect(svc.promptSession({ conversationId: "c2", text: "x" })).resolves.toBeDefined();
  });

  it("rehydrates history rows into ChatHistoryItem[] with tool rows folded into the model turn", async () => {
    const svc = await importService();

    await svc.openSession({
      conversationId: "c1",
      systemPrompt: "SYS",
      history: [
        { role: "user", content: "Bonjour" },
        { role: "tool", content: "12 lignes" },
        { role: "assistant", content: "Voici le résultat." },
        { role: "user", content: "Et ensuite ?" },
        { role: "tool", content: "3 lignes" },
      ],
    });

    expect(setChatHistoryMock).toHaveBeenCalledTimes(1);
    expect(setChatHistoryMock.mock.calls[0][0]).toEqual([
      { type: "system", text: "SYS" },
      { type: "user", text: "Bonjour" },
      {
        type: "model",
        response: [
          { type: "functionCall", name: "tool", params: {}, result: "12 lignes" },
          "Voici le résultat.",
        ],
      },
      { type: "user", text: "Et ensuite ?" },
      // Trailing tool row with no assistant text yet → text-less model turn.
      {
        type: "model",
        response: [{ type: "functionCall", name: "tool", params: {}, result: "3 lignes" }],
      },
    ]);
  });

  it("flushes dangling tool calls as a text-less model turn when a user row follows directly (no assistant in between)", async () => {
    const svc = await importService();

    await svc.openSession({
      conversationId: "c1",
      history: [
        { role: "user", content: "Bonjour" },
        { role: "tool", content: "12 lignes" },
        // No assistant row here — the next row is another user turn.
        { role: "user", content: "Et donc ?" },
      ],
    });

    expect(setChatHistoryMock.mock.calls[0][0]).toEqual([
      { type: "system", text: expect.any(String) },
      { type: "user", text: "Bonjour" },
      {
        type: "model",
        response: [{ type: "functionCall", name: "tool", params: {}, result: "12 lignes" }],
      },
      { type: "user", text: "Et donc ?" },
    ]);
  });

  it("merges a trailing tool call into the previous model turn instead of pushing a new one", async () => {
    const svc = await importService();

    await svc.openSession({
      conversationId: "c1",
      history: [
        { role: "user", content: "Bonjour" },
        { role: "assistant", content: "Voici." },
        // Trailing tool row right after an assistant turn, no further user row.
        { role: "tool", content: "3 lignes" },
      ],
    });

    expect(setChatHistoryMock.mock.calls[0][0]).toEqual([
      { type: "system", text: expect.any(String) },
      { type: "user", text: "Bonjour" },
      {
        type: "model",
        response: ["Voici.", { type: "functionCall", name: "tool", params: {}, result: "3 lignes" }],
      },
    ]);
  });

  it("preserves a valid custom tool name/params/result carried on a tool row's `parts`", async () => {
    const svc = await importService();

    await svc.openSession({
      conversationId: "c1",
      history: [
        { role: "user", content: "Bonjour" },
        {
          role: "tool",
          content: "fallback text",
          parts: { name: "run_sql", params: { sql: "SELECT 1" }, result: "1 ligne" },
        },
        { role: "assistant", content: "Voici." },
      ],
    });

    expect(setChatHistoryMock.mock.calls[0][0]).toEqual([
      { type: "system", text: expect.any(String) },
      { type: "user", text: "Bonjour" },
      {
        type: "model",
        response: [
          {
            type: "functionCall",
            name: "run_sql",
            params: { sql: "SELECT 1" },
            result: "1 ligne",
          },
          "Voici.",
        ],
      },
    ]);
  });

  it("passes functions + documentFunctionParams and NO grammar to prompt(), streaming tokens", async () => {
    const onToken = vi.fn();
    const { captured, result } = await promptAndCapture({ onToken });

    expect(captured.documentFunctionParams).toBe(true);
    expect(captured.functions).toBeDefined();
    expect(Object.keys(captured.functions as AnyRecord).sort()).toEqual([
      "get_schema",
      "make_chart",
      "profile_column",
      "request_clarification",
      "run_sql",
    ]);
    expect("grammar" in captured).toBe(false);
    expect(onToken).toHaveBeenCalledWith("jeton");
    expect(result.text).toBe("réponse finale");
  });

  it("run_sql injects a LIMIT, slices to 50 rows and notes the truncation", async () => {
    runReadOnlyQueryMock.mockResolvedValue(
      Array.from({ length: 500 }, (_, i) => ({ id: i, name: `ligne-${i}` })),
    );
    const { captured } = await promptAndCapture();

    const runSql = (captured.functions as Record<string, ChatFunction>).run_sql;
    const output = await runSql.handler({ sql: "SELECT * FROM ventes" });

    // Guarded read path got the query with an injected LIMIT (cap + 1).
    expect(runReadOnlyQueryMock).toHaveBeenCalledWith("SELECT * FROM ventes LIMIT 51");
    // 50 data rows + header + truncation notice, ≤ 8KB.
    expect(output).toContain("tronqué");
    expect(output).toContain("id | name");
    expect(output).toContain("ligne-49");
    expect(output).not.toContain("ligne-50");
    expect(output.length).toBeLessThanOrEqual(8_400);
  });

  it("run_sql keeps an existing LIMIT untouched", async () => {
    runReadOnlyQueryMock.mockResolvedValue([{ id: 1 }]);
    const { captured } = await promptAndCapture();

    const runSql = (captured.functions as Record<string, ChatFunction>).run_sql;
    await runSql.handler({ sql: "SELECT * FROM ventes LIMIT 5" });

    expect(runReadOnlyQueryMock).toHaveBeenCalledWith("SELECT * FROM ventes LIMIT 5");
  });

  it("make_chart surfaces params as a toolEvent without executing anything", async () => {
    const onTool = vi.fn();
    const { captured } = await promptAndCapture({ onTool });

    const makeChart = (captured.functions as Record<string, ChatFunction>).make_chart;
    const params = {
      chart_type: "bar",
      x: "canal",
      y: "montant",
      aggregate: "sum",
      title: "Ventes par canal",
    };
    const output = await makeChart.handler(params);

    expect(output).toBe("Graphique préparé: Ventes par canal");
    expect(runReadOnlyQueryMock).not.toHaveBeenCalled();
    expect(onTool).toHaveBeenCalledTimes(1);
    const event = onTool.mock.calls[0][0] as AnyRecord;
    expect(event.name).toBe("make_chart");
    expect(event.params).toEqual(params);
    expect(event.resultSummary).toContain("Graphique préparé");
    expect(typeof event.durationMs).toBe("number");
  });

  it("emits a start event before the completion event for each tool call", async () => {
    const onTool = vi.fn();
    const onToolStart = vi.fn();
    const { captured } = await promptAndCapture({ onTool, onToolStart });

    const runSql = (captured.functions as Record<string, ChatFunction>).run_sql;
    runReadOnlyQueryMock.mockResolvedValue([{ id: 1 }]);
    await runSql.handler({ sql: "SELECT 1" });

    expect(onToolStart).toHaveBeenCalledTimes(1);
    const start = onToolStart.mock.calls[0][0] as AnyRecord;
    expect(start.name).toBe("run_sql");
    expect(start.started).toBe(true);
    expect(start.resultSummary).toBe("");
    expect(onTool).toHaveBeenCalledTimes(1);
    expect((onTool.mock.calls[0][0] as AnyRecord).started).toBeUndefined();
  });

  it("request_clarification asks the question without answering in the model's place", async () => {
    const { captured } = await promptAndCapture();

    const ask = (captured.functions as Record<string, ChatFunction>).request_clarification;
    const output = await ask.handler({ question: "Quelle table ?", options: ["a", "b"] });

    expect(output).toContain("Termine ta réponse là");
    expect(output).not.toContain("Quelle table ?");
  });

  it("threads the abort signal through to prompt() with stopOnAbortSignal", async () => {
    const controller = new AbortController();
    const { captured } = await promptAndCapture({ signal: controller.signal });

    expect(captured.signal).toBe(controller.signal);
    expect(captured.stopOnAbortSignal).toBe(true);
  });

  it("returns a readable string when a tool handler fails — never throws", async () => {
    runReadOnlyQueryMock.mockRejectedValue(new Error("Table ventes absente"));
    const onTool = vi.fn();
    const { captured } = await promptAndCapture({ onTool });

    const runSql = (captured.functions as Record<string, ChatFunction>).run_sql;
    await expect(runSql.handler({ sql: "SELECT * FROM ventes" })).resolves.toContain(
      "Table ventes absente",
    );
    // The failure still streams as a toolEvent so the renderer can show it.
    expect((onTool.mock.calls[0][0] as AnyRecord).resultSummary).toContain("Erreur run_sql");
  });

  it("stringifies a non-Error rejection instead of reading a nonexistent .message", async () => {
    runReadOnlyQueryMock.mockRejectedValue("boom string rejection");
    const { captured } = await promptAndCapture();

    const runSql = (captured.functions as Record<string, ChatFunction>).run_sql;
    const output = await runSql.handler({ sql: "SELECT 1" });

    expect(output).toBe("Erreur run_sql: boom string rejection");
  });

  // ─── run_sql: remaining formatRows/injectLimit branches ────────────────────

  it("run_sql reports zero rows with no header/truncation noise for an empty result", async () => {
    runReadOnlyQueryMock.mockResolvedValue([]);
    const { captured } = await promptAndCapture();

    const runSql = (captured.functions as Record<string, ChatFunction>).run_sql;
    const output = await runSql.handler({ sql: "SELECT * FROM ventes WHERE 1=0" });

    expect(output).toBe("0 ligne.");
  });

  it("run_sql does not inject a LIMIT into a non-limitable statement (e.g. EXPLAIN)", async () => {
    runReadOnlyQueryMock.mockResolvedValue([]);
    const { captured } = await promptAndCapture();

    const runSql = (captured.functions as Record<string, ChatFunction>).run_sql;
    await runSql.handler({ sql: "EXPLAIN SELECT 1" });

    expect(runReadOnlyQueryMock).toHaveBeenCalledWith("EXPLAIN SELECT 1");
  });

  it("run_sql truncates the body past 8000 characters when rows are individually wide, without triggering the row-cap notice", async () => {
    // Each cell caps at 120 chars (formatCell's own truncation), so blowing past
    // the 8000-char body cap under the 50-row limit needs many wide columns
    // rather than one huge cell. 20 columns × ~50 chars × 8 rows ≈ 8.5KB.
    const columns = Array.from({ length: 20 }, (_, c) => `col${c}`);
    const row = Object.fromEntries(columns.map((c) => [c, "y".repeat(50)]));
    runReadOnlyQueryMock.mockResolvedValue(Array.from({ length: 8 }, () => ({ ...row })));
    const { captured } = await promptAndCapture();

    const runSql = (captured.functions as Record<string, ChatFunction>).run_sql;
    const output = await runSql.handler({ sql: "SELECT * FROM wide" });

    // Under the 50-row cap, so the header reports the exact row count, not "50+".
    expect(output).toContain("8 ligne(s)");
    expect(output).not.toContain("lignes (résultat tronqué");
    expect(output).toContain("[Résultat tronqué]");
  });

  it("run_sql formats Date cells as ISO strings and truncates string cells over 120 characters", async () => {
    const when = new Date("2026-01-02T03:04:05.000Z");
    runReadOnlyQueryMock.mockResolvedValue([{ at: when, note: "y".repeat(200) }]);
    const { captured } = await promptAndCapture();

    const runSql = (captured.functions as Record<string, ChatFunction>).run_sql;
    const output = await runSql.handler({ sql: "SELECT * FROM t" });

    expect(output).toContain("2026-01-02T03:04:05.000Z");
    expect(output).toContain(`${"y".repeat(120)}…`);
  });

  // ─── get_schema tool ─────────────────────────────────────────────────────────

  describe("get_schema tool", () => {
    it("reports that no dataset is registered when the catalog is empty", async () => {
      listDatasetsMock.mockResolvedValue([]);
      const { captured } = await promptAndCapture();

      const getSchema = (captured.functions as Record<string, ChatFunction>).get_schema;
      const output = await getSchema.handler({});

      expect(output).toBe(
        "Aucun jeu de données enregistré. L'utilisateur doit d'abord importer un fichier.",
      );
    });

    it("formats view name, display name, row count and column list per dataset", async () => {
      listDatasetsMock.mockResolvedValue([
        {
          viewName: "ds_1",
          displayName: "Ventes 2026",
          rowCount: 500,
          columns: [
            { name: "canal", type: "VARCHAR" },
            { name: "montant", type: "DOUBLE" },
          ],
        },
      ]);
      const { captured } = await promptAndCapture();

      const getSchema = (captured.functions as Record<string, ChatFunction>).get_schema;
      const output = await getSchema.handler({});

      expect(output).toBe("ds_1 (« Ventes 2026 », 500 lignes): canal VARCHAR, montant DOUBLE");
    });
  });

  // ─── profile_column tool ─────────────────────────────────────────────────────

  describe("profile_column tool", () => {
    it("formats min/max/distincts/nulls/total from the first result row", async () => {
      runReadOnlyQueryMock.mockResolvedValue([
        { min: 1, max: 100, distincts: 42, nulls: 3, total: 500 },
      ]);
      const { captured } = await promptAndCapture();

      const profileColumn = (captured.functions as Record<string, ChatFunction>).profile_column;
      const output = await profileColumn.handler({ table: "ventes", column: "montant" });

      expect(runReadOnlyQueryMock).toHaveBeenCalledWith(expect.stringContaining('FROM "ventes"'));
      expect(output).toBe("montant (ventes): min=1, max=100, distincts=42, nulls=3, total=500");
    });

    it("quotes identifiers, doubling an embedded double-quote", async () => {
      runReadOnlyQueryMock.mockResolvedValue([{}]);
      const { captured } = await promptAndCapture();

      const profileColumn = (captured.functions as Record<string, ChatFunction>).profile_column;
      await profileColumn.handler({ table: 'vent"es', column: "col" });

      expect(runReadOnlyQueryMock).toHaveBeenCalledWith(expect.stringContaining('"vent""es"'));
    });

    it("reports all-NULL stats when the aggregate query returns no row", async () => {
      runReadOnlyQueryMock.mockResolvedValue([]);
      const { captured } = await promptAndCapture();

      const profileColumn = (captured.functions as Record<string, ChatFunction>).profile_column;
      const output = await profileColumn.handler({ table: "empty", column: "x" });

      expect(output).toBe("x (empty): min=NULL, max=NULL, distincts=NULL, nulls=NULL, total=NULL");
    });
  });

  // ─── preloadSessionPrompt ────────────────────────────────────────────────────

  describe("preloadSessionPrompt", () => {
    it("preloads the prompt into the open session's KV cache", async () => {
      const svc = await importService();
      await svc.openSession({ conversationId: "c1" });

      await svc.preloadSessionPrompt("c1", "Bonjour");

      expect(preloadPromptMock).toHaveBeenCalledWith("Bonjour");
    });

    it("throws when no session is open for the conversation", async () => {
      const svc = await importService();

      await expect(svc.preloadSessionPrompt("missing", "x")).rejects.toThrow(
        /No open chat session/,
      );
    });
  });

  // ─── getSessionHistory ───────────────────────────────────────────────────────

  describe("getSessionHistory", () => {
    it("returns the live model-side history for an open session", async () => {
      const svc = await importService();
      await svc.openSession({ conversationId: "c1" });
      getChatHistoryMock.mockReturnValue([{ type: "system", text: "SYS" }]);

      expect(svc.getSessionHistory("c1")).toEqual([{ type: "system", text: "SYS" }]);
    });

    it("throws when no session is open for the conversation", async () => {
      const svc = await importService();

      expect(() => svc.getSessionHistory("missing")).toThrow(/No open chat session/);
    });
  });

  // ─── openSession: reused-session + model-switch eviction branches ──────────

  describe("openSession — reuse and model-switch branches", () => {
    it("reuses an already-open session without creating a new context, and re-syncs history when given", async () => {
      const svc = await importService();

      const first = await svc.openSession({ conversationId: "c1" });
      expect(first.reused).toBe(false);
      expect(createdContexts).toHaveLength(1);

      const second = await svc.openSession({
        conversationId: "c1",
        history: [{ role: "user", content: "hi" }],
      });

      expect(second.reused).toBe(true);
      expect(createdContexts).toHaveLength(1); // no second context was created
      expect(setChatHistoryMock).toHaveBeenCalledTimes(1); // only the reuse path re-synced history
    });

    it("reuses an already-open session WITHOUT touching history when none is given", async () => {
      const svc = await importService();
      await svc.openSession({ conversationId: "c1" });

      const second = await svc.openSession({ conversationId: "c1" });

      expect(second.reused).toBe(true);
      expect(setChatHistoryMock).not.toHaveBeenCalled();
    });

    it("evicts sessions bound to a different model when openSession switches the loaded GGUF", async () => {
      const secondModelFile = "second-model.gguf";
      writeFileSync(path.join(USER_DATA_DIR, "models", "llm", secondModelFile), "");
      const svc = await importService();

      await svc.openSession({ conversationId: "c1" });
      expect(createdContexts).toHaveLength(1);

      // Opening on a different model file switches llama-service's loadedModelPath,
      // which makes c1's recorded modelPath stale — it must be evicted + disposed.
      await svc.openSession({ conversationId: "c2", modelFile: secondModelFile });

      expect(createdSequences[0].dispose).toHaveBeenCalledTimes(1);
      expect(createdContexts[0].dispose).toHaveBeenCalledTimes(1);
      await expect(svc.promptSession({ conversationId: "c1", text: "x" })).rejects.toThrow(
        /No open chat session/,
      );
      await expect(svc.promptSession({ conversationId: "c2", text: "x" })).resolves.toBeDefined();
    });
  });

  // ─── promptSession: pre-aborted signal ──────────────────────────────────────

  it("rejects immediately with AbortError when the signal is already aborted before prompt() runs", async () => {
    const svc = await importService();
    await svc.openSession({ conversationId: "c1" });
    const controller = new AbortController();
    controller.abort();

    await expect(
      svc.promptSession({ conversationId: "c1", text: "x", signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError", message: "Chat prompt aborted" });
    expect(promptMock).not.toHaveBeenCalled();
  });

  // ─── disposeSession / disposeAll ─────────────────────────────────────────────

  describe("disposeSession", () => {
    it("returns false when there is no session for the conversation", async () => {
      const svc = await importService();

      await expect(svc.disposeSession("nope")).resolves.toBe(false);
    });

    it("disposes the native sequence + context and removes the session", async () => {
      const svc = await importService();
      await svc.openSession({ conversationId: "c1" });

      await expect(svc.disposeSession("c1")).resolves.toBe(true);

      expect(createdSequences[0].dispose).toHaveBeenCalledTimes(1);
      expect(createdContexts[0].dispose).toHaveBeenCalledTimes(1);
      await expect(svc.promptSession({ conversationId: "c1", text: "x" })).rejects.toThrow(
        /No open chat session/,
      );
    });

    it("swallows native dispose errors from a failing sequence/context (best-effort)", async () => {
      const svc = await importService();
      await svc.openSession({ conversationId: "c1" });
      createdSequences[0].dispose.mockImplementation(() => {
        throw new Error("native sequence gone");
      });
      createdContexts[0].dispose.mockRejectedValue(new Error("native context gone"));

      await expect(svc.disposeSession("c1")).resolves.toBe(true);
    });
  });

  describe("disposeAll", () => {
    it("disposes every live session and clears the registry", async () => {
      const svc = await importService();
      await svc.openSession({ conversationId: "c1" });
      await svc.openSession({ conversationId: "c2" });

      await svc.disposeAll();

      expect(createdSequences[0].dispose).toHaveBeenCalledTimes(1);
      expect(createdSequences[1].dispose).toHaveBeenCalledTimes(1);
      expect(createdContexts[0].dispose).toHaveBeenCalledTimes(1);
      expect(createdContexts[1].dispose).toHaveBeenCalledTimes(1);
      await expect(svc.promptSession({ conversationId: "c1", text: "x" })).rejects.toThrow(
        /No open chat session/,
      );
      await expect(svc.promptSession({ conversationId: "c2", text: "x" })).rejects.toThrow(
        /No open chat session/,
      );
    });

    it("is a no-op when there are no live sessions", async () => {
      const svc = await importService();

      await expect(svc.disposeAll()).resolves.toBeUndefined();
    });
  });

  // ─── generateTitle / suggestFollowUps (grammar-constrained side-calls) ─────

  describe("generateTitle", () => {
    it("returns the model's short title, trimmed", async () => {
      const svc = await importService();
      await svc.openSession({ conversationId: "c1" });
      grammarParseMock.mockReturnValue({ title: "  Résumé des ventes  " });

      const title = await svc.generateTitle("c1");

      expect(title).toBe("Résumé des ventes");
    });

    it("falls back to a default title when the model returns no usable title", async () => {
      const svc = await importService();
      await svc.openSession({ conversationId: "c1" });
      grammarParseMock.mockReturnValue({ title: "   " });

      const title = await svc.generateTitle("c1");

      expect(title).toBe("Nouvelle conversation");
    });

    it("truncates an overly long title to 120 characters with an ellipsis", async () => {
      const svc = await importService();
      await svc.openSession({ conversationId: "c1" });
      grammarParseMock.mockReturnValue({ title: "x".repeat(200) });

      const title = await svc.generateTitle("c1");

      expect(title).toBe(`${"x".repeat(120)}…`);
    });

    it("throws when no session is open for the conversation", async () => {
      const svc = await importService();

      await expect(svc.generateTitle("missing")).rejects.toThrow(/No open chat session/);
    });

    it("skips model turns whose response has no string part (tool-call-only turns), and ignores non-user/model items", async () => {
      const svc = await importService();
      await svc.openSession({ conversationId: "c1" });
      getChatHistoryMock.mockReturnValue([
        { type: "system", text: "SYS prompt — must not surface as a transcript line" },
        { type: "user", text: "Question" },
        {
          type: "model",
          response: [{ type: "functionCall", name: "run_sql", params: {}, result: "x" }],
        },
        { type: "model", response: ["Réponse finale."] },
      ]);
      let capturedPrompt = "";
      promptMock.mockImplementation(async (text: string) => {
        capturedPrompt = text;
        return "ok";
      });

      await svc.generateTitle("c1");

      expect(capturedPrompt).toContain("Utilisateur: Question");
      expect(capturedPrompt).toContain("Moudir: Réponse finale.");
      const conversationSection = capturedPrompt.split("Conversation:\n")[1].split("\n\n")[0];
      // Only 2 lines: the tool-only turn contributed no "Moudir:" line of its own.
      expect(conversationSection.split("\n")).toHaveLength(2);
    });

    it("truncates the transcript to the last 4000 characters, dropping earlier turns", async () => {
      const svc = await importService();
      await svc.openSession({ conversationId: "c1" });
      getChatHistoryMock.mockReturnValue([
        { type: "user", text: "START_MARKER_UNIQUE" },
        { type: "model", response: ["x".repeat(4500)] },
        { type: "user", text: "LATE_MARKER_UNIQUE" },
      ]);
      let capturedPrompt = "";
      promptMock.mockImplementation(async (text: string) => {
        capturedPrompt = text;
        return "ok";
      });

      await svc.generateTitle("c1");

      expect(capturedPrompt).not.toContain("START_MARKER_UNIQUE");
      expect(capturedPrompt).toContain("LATE_MARKER_UNIQUE");
    });
  });

  describe("suggestFollowUps", () => {
    it("returns up to 3 trimmed follow-up questions", async () => {
      const svc = await importService();
      await svc.openSession({ conversationId: "c1" });
      grammarParseMock.mockReturnValue({
        questions: ["  Q1?  ", "Q2?", "Q3?", "Q4 should be dropped?"],
      });

      const questions = await svc.suggestFollowUps("c1");

      expect(questions).toEqual(["Q1?", "Q2?", "Q3?"]);
    });

    it("filters out non-string and blank entries", async () => {
      const svc = await importService();
      await svc.openSession({ conversationId: "c1" });
      grammarParseMock.mockReturnValue({ questions: ["Valid?", "   ", 42, null] });

      const questions = await svc.suggestFollowUps("c1");

      expect(questions).toEqual(["Valid?"]);
    });

    it("returns an empty array when the model doesn't return an array", async () => {
      const svc = await importService();
      await svc.openSession({ conversationId: "c1" });
      grammarParseMock.mockReturnValue({ questions: "not-an-array" });

      const questions = await svc.suggestFollowUps("c1");

      expect(questions).toEqual([]);
    });
  });
});
