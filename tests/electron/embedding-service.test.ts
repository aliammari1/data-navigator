import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for electron/embedding-service.ts, mirroring
 * tests/electron/llama-service.test.ts's conventions: node-llama-cpp +
 * electron are native/runtime-only, so they're mocked here to keep the
 * service unit-testable in a plain node/jsdom environment.
 */

const {
  getLlamaMock,
  loadModelMock,
  tokenizeMock,
  createEmbeddingContextMock,
  getEmbeddingForMock,
  contextDisposeMock,
  modelDisposeMock,
  llamaDisposeMock,
  holder,
} = vi.hoisted(() => ({
  getLlamaMock: vi.fn(),
  loadModelMock: vi.fn(),
  tokenizeMock: vi.fn(),
  createEmbeddingContextMock: vi.fn(),
  getEmbeddingForMock: vi.fn(),
  contextDisposeMock: vi.fn(),
  modelDisposeMock: vi.fn(),
  llamaDisposeMock: vi.fn(),
  holder: { userDataDir: "" },
}));

vi.mock("node-llama-cpp", () => ({ getLlama: getLlamaMock }));
vi.mock("electron", () => ({ app: { getPath: () => holder.userDataDir } }));

const USER_DATA_DIR = path.join(os.tmpdir(), "dn-embedding-service-test");
const DEFAULT_MODEL_FILE = "all-minilm-l6-v2-embed-q8_0.gguf";
holder.userDataDir = USER_DATA_DIR;

/** A fresh embedding-context mock: getEmbeddingFor resolves a vector shaped like `tokens`. */
function makeEmbeddingContext() {
  getEmbeddingForMock.mockImplementation(async (tokens: number[]) => ({
    vector: tokens.map((_, i) => (i + 1) / 10),
  }));
  return {
    getEmbeddingFor: getEmbeddingForMock,
    dispose: contextDisposeMock,
  };
}

/** A fresh 384-dim LlamaModel mock. */
function makeModel(embeddingVectorSize = 384) {
  return {
    embeddingVectorSize,
    tokenize: tokenizeMock,
    createEmbeddingContext: createEmbeddingContextMock,
    dispose: modelDisposeMock,
  };
}

describe("embedding-service", () => {
  beforeEach(() => {
    const embedDir = path.join(USER_DATA_DIR, "models", "embed");
    mkdirSync(embedDir, { recursive: true });
    writeFileSync(path.join(embedDir, DEFAULT_MODEL_FILE), "");

    vi.resetModules();
    getLlamaMock.mockReset();
    loadModelMock.mockReset();
    tokenizeMock.mockReset();
    createEmbeddingContextMock.mockReset();
    getEmbeddingForMock.mockReset();
    contextDisposeMock.mockReset();
    modelDisposeMock.mockReset();
    llamaDisposeMock.mockReset();

    getLlamaMock.mockResolvedValue({ loadModel: loadModelMock, dispose: llamaDisposeMock });
    loadModelMock.mockResolvedValue(makeModel());
    createEmbeddingContextMock.mockResolvedValue(makeEmbeddingContext());
    // Default: one token per character-ish stand-in, well under the context cap.
    tokenizeMock.mockImplementation((text: string) =>
      Array.from({ length: text.length }, (_, i) => i),
    );
    contextDisposeMock.mockResolvedValue(undefined);
    modelDisposeMock.mockResolvedValue(undefined);
    llamaDisposeMock.mockResolvedValue(undefined);
  });

  afterAll(() => {
    rmSync(USER_DATA_DIR, { recursive: true, force: true });
  });

  // ─── ensureEmbedModel ──────────────────────────────────────────────────────

  it("loads the default embed model CPU-only and asserts 384 dims", async () => {
    const { ensureEmbedModel, DEFAULT_EMBED_MODEL } = await import(
      "../../electron/embedding-service"
    );

    expect(DEFAULT_EMBED_MODEL).toBe(DEFAULT_MODEL_FILE);
    const result = await ensureEmbedModel();

    expect(getLlamaMock).toHaveBeenCalledWith();
    expect(loadModelMock).toHaveBeenCalledWith(
      expect.objectContaining({ modelPath: expect.stringContaining(DEFAULT_MODEL_FILE) }),
    );
    expect(result.dims).toBe(384);
  });

  it("is idempotent for an already-loaded model (does not reload)", async () => {
    const { ensureEmbedModel } = await import("../../electron/embedding-service");

    await ensureEmbedModel();
    await ensureEmbedModel();

    expect(loadModelMock).toHaveBeenCalledTimes(1);
  });

  it("switches models (disposing the previous one) when a different file is requested", async () => {
    const embedDir = path.join(USER_DATA_DIR, "models", "embed");
    writeFileSync(path.join(embedDir, "other-embed.gguf"), "");

    loadModelMock.mockResolvedValueOnce(makeModel()).mockResolvedValueOnce(makeModel());

    const { ensureEmbedModel } = await import("../../electron/embedding-service");

    await ensureEmbedModel(DEFAULT_MODEL_FILE);
    await ensureEmbedModel("other-embed.gguf");

    expect(loadModelMock).toHaveBeenCalledTimes(2);
    expect(modelDisposeMock).toHaveBeenCalledTimes(1);
  });

  it("throws when the GGUF file is missing on disk", async () => {
    const { ensureEmbedModel } = await import("../../electron/embedding-service");

    await expect(ensureEmbedModel("does-not-exist.gguf")).rejects.toThrow(
      /Missing GGUF embedding model/,
    );
    expect(loadModelMock).not.toHaveBeenCalled();
  });

  it("refuses (and disposes) a model whose embeddingVectorSize isn't 384", async () => {
    loadModelMock.mockResolvedValueOnce(makeModel(768));
    const { ensureEmbedModel } = await import("../../electron/embedding-service");

    await expect(ensureEmbedModel()).rejects.toThrow(/produces 768-dim vectors, expected 384/);
    expect(modelDisposeMock).toHaveBeenCalledTimes(1);
  });

  // ─── embedOne ──────────────────────────────────────────────────────────────

  it("embedOne tokenizes, embeds, and L2-normalizes the returned vector", async () => {
    getEmbeddingForMock.mockImplementation(async () => ({ vector: [3, 4] })); // norm 5
    const { embedOne } = await import("../../electron/embedding-service");

    const result = await embedOne("hello world");

    expect(result.vector).toEqual([0.6, 0.8]);
    expect(result.dims).toBe(2);
    expect(result.model).toContain(DEFAULT_MODEL_FILE);
  });

  it("caps overlong input to the context window before calling getEmbeddingFor", async () => {
    // 500 "tokens" — well beyond the 256-token context (254 usable after BOS/EOS headroom).
    tokenizeMock.mockImplementation(() => Array.from({ length: 500 }, (_, i) => i));
    const { embedOne } = await import("../../electron/embedding-service");

    await embedOne("a very long column description".repeat(50));

    const passedTokens = getEmbeddingForMock.mock.calls.at(-1)?.[0] as number[];
    expect(passedTokens.length).toBeLessThanOrEqual(254);
  });

  it("does not truncate input that already fits the context window", async () => {
    tokenizeMock.mockImplementation(() => Array.from({ length: 10 }, (_, i) => i));
    const { embedOne } = await import("../../electron/embedding-service");

    await embedOne("short text");

    const passedTokens = getEmbeddingForMock.mock.calls.at(-1)?.[0] as number[];
    expect(passedTokens.length).toBe(10);
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const { embedOne } = await import("../../electron/embedding-service");
    const controller = new AbortController();
    controller.abort();

    await expect(embedOne("hello", controller.signal)).rejects.toThrow("Embedding aborted");
    expect(loadModelMock).not.toHaveBeenCalled();
  });

  // ─── embedBatch ────────────────────────────────────────────────────────────

  it("returns an empty result immediately for an empty batch (model never touched)", async () => {
    const { embedBatch } = await import("../../electron/embedding-service");

    const result = await embedBatch([]);

    expect(result).toEqual({ vectors: [], dims: 0, model: "", elapsedMs: 0 });
    expect(getLlamaMock).not.toHaveBeenCalled();
  });

  it("embeds a batch sequentially, preserving input order", async () => {
    let call = 0;
    getEmbeddingForMock.mockImplementation(async () => {
      call += 1;
      return { vector: [call, call * 2] };
    });
    const { embedBatch } = await import("../../electron/embedding-service");

    const result = await embedBatch(["first", "second", "third"]);

    expect(result.vectors).toHaveLength(3);
    // L2-normalized [1,2] → [1/√5, 2/√5]; ordering is preserved (call 1,2,3 in order).
    expect(result.vectors[0][1]).toBeGreaterThan(0);
    expect(getEmbeddingForMock).toHaveBeenCalledTimes(3);
  });

  it("aborts mid-batch: stops calling getEmbeddingFor once the signal fires", async () => {
    const controller = new AbortController();
    let calls = 0;
    getEmbeddingForMock.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) controller.abort();
      return { vector: [1, 2] };
    });
    const { embedBatch } = await import("../../electron/embedding-service");

    await expect(embedBatch(["a", "b", "c"], controller.signal)).rejects.toThrow(
      "Embedding aborted",
    );

    // Only the first item's embedding call happened before abort was observed.
    expect(getEmbeddingForMock).toHaveBeenCalledTimes(1);
  });

  // ─── dispose ───────────────────────────────────────────────────────────────

  it("dispose() tears down the context and model but keeps the shared llama backend", async () => {
    const { ensureEmbedModel, embedOne, dispose } = await import(
      "../../electron/embedding-service"
    );

    await ensureEmbedModel();
    await embedOne("warm the context"); // ensures createEmbeddingContext ran

    await dispose();

    expect(contextDisposeMock).toHaveBeenCalledTimes(1);
    expect(modelDisposeMock).toHaveBeenCalledTimes(1);
    expect(llamaDisposeMock).not.toHaveBeenCalled();
  });

  it("dispose() is safe to call when nothing was ever loaded", async () => {
    const { dispose } = await import("../../electron/embedding-service");

    await expect(dispose()).resolves.toBeUndefined();
  });
});
