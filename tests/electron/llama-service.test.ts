import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression tests for node-llama-cpp backend selection.
 *
 * Context: on dual-GPU / weak-iGPU machines (e.g. an Optimus laptop whose
 * Vulkan auto-detect lands on an old Intel Iris Xe driver), creating the llama
 * context crashed with `vk::Queue::submit: ErrorDeviceLost`. The product target
 * is "works offline on medium-end PCs", so the engine initializes CPU-only by
 * default — the Vulkan path is never attempted unless explicitly opted in via
 * `DN_LLAMA_GPU`. These tests lock that contract at the only backend chokepoint
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

// Real temp userData dir + a stub GGUF file so the real `existsSync` gate passes
// (the model is only stat-checked here; `loadModel` is mocked).
const USER_DATA_DIR = path.join(os.tmpdir(), "dn-llama-service-test");
const DEFAULT_MODEL_FILE = "qwen2.5-1.5b-instruct-q4_k_m.gguf";
holder.userDataDir = USER_DATA_DIR;

describe("llama-service backend selection", () => {
  beforeEach(() => {
    const llmDir = path.join(USER_DATA_DIR, "models", "llm");
    mkdirSync(llmDir, { recursive: true });
    writeFileSync(path.join(llmDir, DEFAULT_MODEL_FILE), "");

    vi.resetModules();
    getLlamaMock.mockReset();
    loadModelMock.mockReset();
    getLlamaMock.mockResolvedValue({ loadModel: loadModelMock });
    loadModelMock.mockResolvedValue({ dispose: vi.fn() });
  });

  afterAll(() => {
    rmSync(USER_DATA_DIR, { recursive: true, force: true });
  });

  it("initializes CPU-only by default and never attempts a GPU backend", async () => {
    const { ensureModel } = await import("../../electron/llama-service");

    await ensureModel();

    expect(getLlamaMock).toHaveBeenCalledTimes(1);
    expect(getLlamaMock).toHaveBeenCalledWith({ gpu: false });
    // No zero-arg call → the auto-detect (Vulkan/Metal/CUDA) path was skipped.
    expect(getLlamaMock).not.toHaveBeenCalledWith();
  });

  it("attempts a GPU backend only when DN_LLAMA_GPU is explicitly set", async () => {
    vi.stubEnv("DN_LLAMA_GPU", "1");
    const { ensureModel } = await import("../../electron/llama-service");

    await ensureModel();

    expect(getLlamaMock).toHaveBeenCalledWith();
  });

  it("falls back to CPU when an opted-in GPU backend fails to initialize", async () => {
    vi.stubEnv("DN_LLAMA_GPU", "1");
    getLlamaMock
      .mockRejectedValueOnce(new Error("vk::Queue::submit: ErrorDeviceLost"))
      .mockResolvedValueOnce({ loadModel: loadModelMock });

    const { ensureModel } = await import("../../electron/llama-service");

    await ensureModel();

    expect(getLlamaMock).toHaveBeenCalledTimes(2);
    expect(getLlamaMock).toHaveBeenLastCalledWith({ gpu: false });
  });
});
