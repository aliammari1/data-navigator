import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression tests for node-llama-cpp backend selection.
 *
 * Context: while diagnosing a SIGILL inside the forced CPU-only model-load
 * path, the engine auto-detects the best backend via `getLlama()` with no
 * forced flags. These tests lock that contract at the only backend chokepoint
 * (`getLlama`), reached through `ensureModel()`.
 */

// node-llama-cpp + electron are native/runtime-only; mock them so the service
// is unit-testable in a plain jsdom/node environment. `holder` is populated at
// module eval (after imports) and read lazily by the mock when getPath is called.
const { getLlamaMock, loadModelMock, holder } = vi.hoisted(() => ({
  getLlamaMock: vi.fn(),
  loadModelMock: vi.fn(),
  holder: { userDataDir: "" },
}));

vi.mock("node-llama-cpp", () => ({ getLlama: getLlamaMock }));
vi.mock("electron", () => ({ app: { getPath: () => holder.userDataDir } }));

import { MODEL_DOWNLOADS } from "../../electron/model-download-service";

// Real temp userData dir + stub GGUF files so the real `existsSync` gate passes
// (the model is only stat-checked here; `loadModel` is mocked).
const USER_DATA_DIR = path.join(os.tmpdir(), `dn-llama-service-test-${process.pid}`);
holder.userDataDir = USER_DATA_DIR;

describe("llama-service backend selection", () => {
  beforeEach(() => {
    const llmDir = path.join(USER_DATA_DIR, "models", "llm");
    mkdirSync(llmDir, { recursive: true });
    for (const m of MODEL_DOWNLOADS.filter((x) => x.lane === "llm")) {
      writeFileSync(path.join(llmDir, m.file), "");
    }

    vi.resetModules();
    getLlamaMock.mockReset();
    loadModelMock.mockReset();
    getLlamaMock.mockResolvedValue({ loadModel: loadModelMock });
    loadModelMock.mockResolvedValue({
      dispose: vi.fn(),
      tokenize: vi.fn((text: string) => [text]),
      detokenize: vi.fn((tokens: unknown[]) => String(tokens[0] ?? "")),
    });
  });

  afterAll(() => {
    rmSync(USER_DATA_DIR, { recursive: true, force: true });
  });

  it("auto-detects the backend by default (no forced flags)", async () => {
    const { ensureModel } = await import("../../electron/llama-service");

    await ensureModel();

    expect(getLlamaMock).toHaveBeenCalledTimes(1);
    expect(getLlamaMock).toHaveBeenCalledWith();
  });

  it("honors an installed Granite 4.0 selection", async () => {
    const granite = "granite-4.0-1b-q4_k_m.gguf";
    const llmDir = path.join(USER_DATA_DIR, "models", "llm");

    const { ensureModel } = await import("../../electron/llama-service");
    await ensureModel(granite);

    expect(loadModelMock).toHaveBeenCalledWith(
      expect.objectContaining({ modelPath: path.join(llmDir, granite) }),
    );
  });

  it("rejects a chat GGUF whose tokenizer cannot round-trip ordinary text", async () => {
    const dispose = vi.fn().mockResolvedValue(undefined);
    loadModelMock.mockResolvedValueOnce({
      dispose,
      tokenize: vi.fn(() => [115, 118]),
      detokenize: vi.fn(() => "$115118"),
    });

    const { ensureModel } = await import("../../electron/llama-service");

    await expect(ensureModel()).rejects.toThrow(/Incompatible GGUF tokenizer/i);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("reuses the backend singleton across calls", async () => {
    const { ensureModel } = await import("../../electron/llama-service");

    await ensureModel();
    await ensureModel();

    expect(getLlamaMock).toHaveBeenCalledTimes(1);
  });

  it("waits for active generation before a public model switch", async () => {
    const { ensureModel, enqueueLlamaTask } = await import("../../electron/llama-service");
    await ensureModel();
    const secondFile = MODEL_DOWNLOADS.filter((entry) => entry.lane === "llm")[1]?.file;
    if (!secondFile) throw new Error("Expected a second LLM model in the catalog");

    let finishGeneration!: () => void;
    let generationStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      generationStarted = resolve;
    });
    const generation = enqueueLlamaTask(async () => {
      generationStarted();
      await new Promise<void>((resolve) => {
        finishGeneration = resolve;
      });
    });
    await started;

    const switching = ensureModel(secondFile);
    await Promise.resolve();
    const loadsWhileGenerating = loadModelMock.mock.calls.length;
    finishGeneration();
    await generation;
    await switching;

    expect(loadsWhileGenerating).toBe(1);
    expect(loadModelMock).toHaveBeenCalledTimes(2);
    expect(loadModelMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ modelPath: path.join(USER_DATA_DIR, "models", "llm", secondFile) }),
    );
  });

  it("keeps Granite 4.0 off Vulkan after corrupted output was reproduced", async () => {
    getLlamaMock.mockResolvedValue({ gpu: "vulkan", loadModel: loadModelMock });
    const { ensureModel } = await import("../../electron/llama-service");

    await ensureModel("granite-4.0-1b-q4_k_m.gguf");

    expect(loadModelMock).toHaveBeenCalledWith(expect.objectContaining({ gpuLayers: 0 }));
  });

  it("keeps GPU acceleration for Granite on other backends", async () => {
    getLlamaMock.mockResolvedValue({ gpu: "cuda", loadModel: loadModelMock });
    const { ensureModel } = await import("../../electron/llama-service");

    await ensureModel("granite-4.0-1b-q4_k_m.gguf");

    expect(loadModelMock).toHaveBeenCalledWith(expect.objectContaining({ gpuLayers: "auto" }));
  });
});
