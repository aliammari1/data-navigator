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
const USER_DATA_DIR = path.join(os.tmpdir(), "dn-llama-service-test");
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
    loadModelMock.mockResolvedValue({ dispose: vi.fn() });
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

  it("reuses the backend singleton across calls", async () => {
    const { ensureModel } = await import("../../electron/llama-service");

    await ensureModel();
    await ensureModel();

    expect(getLlamaMock).toHaveBeenCalledTimes(1);
  });
});
