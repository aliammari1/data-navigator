/**
 * Tests for src/platform/ai/inference-client.ts
 *
 * Mocks Comlink and the Worker constructor so no real Worker/ONNX code runs.
 * Every branch, early return, and catch block in the module is exercised.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock Comlink ─────────────────────────────────────────────────────────────
// Controllable proxy that returns mocks for every method the
// inference-client calls: embedBatch, embed, loadEmbedder, generate, loadGenerator, dispose.

const mockProxy = {
  embedBatch: vi.fn(),
  embed: vi.fn(),
  loadEmbedder: vi.fn(),
  generate: vi.fn(),
  loadGenerator: vi.fn(),
  dispose: vi.fn(),
};

const mockComlinkProxy = vi.fn((fn: unknown) => fn);
const mockWrap = vi.fn(() => mockProxy);

vi.mock("comlink", () => ({
  wrap: (...args: unknown[]) => mockWrap(...args),
  proxy: (fn: unknown) => mockComlinkProxy(fn),
}));

// ─── Worker mock factory ──────────────────────────────────────────────────────
// Must be a class / regular function so it can be used with `new`.
const mockWorkerTerminate = vi.fn();
function makeMockWorker() {
  return { terminate: mockWorkerTerminate };
}
// A proper constructor function (not an arrow fn) that returns a worker-like object.
function MockWorkerConstructor(this: object) {
  return { terminate: mockWorkerTerminate };
}

// ─── Import the real module AFTER mocks are in place ─────────────────────────
import {
  browserGenerate,
  disposeInferenceWorker,
  embedText,
  embedTexts,
  getInferenceWorker,
  preloadBrowserGenerator,
  preloadEmbedder,
} from "@/platform/ai/inference-client";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Reset singleton state between tests by disposing the worker, then
 * re-install the Worker global stub so subsequent tests can call getInferenceWorker().
 */
async function resetWorker() {
  mockProxy.dispose.mockResolvedValue(undefined);
  await disposeInferenceWorker();
  vi.clearAllMocks();
  // Re-install our mock Worker global after clearAllMocks.
  // unstubGlobals:true restores the original after each test, so we must re-stub.
  // Must be a regular function (not arrow) to support `new`.
  const MockWorkerCtor = vi.fn(MockWorkerConstructor);
  vi.stubGlobal("Worker", MockWorkerCtor);
  // Re-configure mockWrap to return mockProxy each time.
  mockWrap.mockReturnValue(mockProxy);
  mockComlinkProxy.mockImplementation((fn: unknown) => fn);
  return MockWorkerCtor;
}

// ─── getInferenceWorker ───────────────────────────────────────────────────────

describe("getInferenceWorker", () => {
  it("creates a Worker and returns a Comlink proxy on first call", async () => {
    // Arrange
    const MockWorkerCtor = await resetWorker();

    // Act
    const result = getInferenceWorker();

    // Assert
    expect(MockWorkerCtor).toHaveBeenCalledOnce();
    expect(mockWrap).toHaveBeenCalledOnce();
    expect(result).toBe(mockProxy);
  });

  it("returns the same proxy on subsequent calls without creating a new Worker", async () => {
    // Arrange
    const MockWorkerCtor = await resetWorker();

    // Act
    const first = getInferenceWorker();
    const second = getInferenceWorker();

    // Assert: only one Worker instantiation.
    expect(MockWorkerCtor).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it("throws when window is undefined (non-browser context)", async () => {
    // Arrange: reset then remove window.
    await resetWorker();
    const originalWindow = globalThis.window;
    // @ts-expect-error — intentionally removing window for test.
    delete globalThis.window;

    try {
      // Act / Assert
      expect(() => getInferenceWorker()).toThrow(
        "Inference worker is only available in a browser/renderer context.",
      );
    } finally {
      // Restore window so subsequent tests are not affected.
      globalThis.window = originalWindow;
    }
  });

  it("throws when Worker is undefined (non-browser context)", async () => {
    // Arrange: reset to clean state, then stub Worker away.
    await resetWorker();
    vi.stubGlobal("Worker", undefined);

    // Act / Assert
    expect(() => getInferenceWorker()).toThrow(
      "Inference worker is only available in a browser/renderer context.",
    );
    // Restore for following tests — unstubGlobals handles it, but be explicit.
    await resetWorker();
  });
});

// ─── embedTexts ──────────────────────────────────────────────────────────────

describe("embedTexts", () => {
  beforeEach(async () => {
    await resetWorker();
  });

  it("returns an empty array immediately when texts is empty", async () => {
    // Act
    const result = await embedTexts([]);

    // Assert: proxy never contacted.
    expect(result).toEqual([]);
    expect(mockProxy.embedBatch).not.toHaveBeenCalled();
  });

  it("calls embedBatch with the provided texts and optional model", async () => {
    // Arrange
    const expected = [new Float32Array([1, 2, 3])];
    mockProxy.embedBatch.mockResolvedValue(expected);

    // Act
    const result = await embedTexts(["hello", "world"], "my-model");

    // Assert
    expect(mockProxy.embedBatch).toHaveBeenCalledWith(["hello", "world"], "my-model");
    expect(result).toBe(expected);
  });

  it("calls embedBatch without a model when model is omitted", async () => {
    // Arrange
    mockProxy.embedBatch.mockResolvedValue([]);

    // Act
    await embedTexts(["text"]);

    // Assert
    expect(mockProxy.embedBatch).toHaveBeenCalledWith(["text"], undefined);
  });
});

// ─── embedText ───────────────────────────────────────────────────────────────

describe("embedText", () => {
  beforeEach(async () => {
    await resetWorker();
  });

  it("calls embed on the proxy with the text and optional model", async () => {
    // Arrange
    const expected = new Float32Array([0.1, 0.2]);
    mockProxy.embed.mockResolvedValue(expected);

    // Act
    const result = await embedText("hello", "model-x");

    // Assert
    expect(mockProxy.embed).toHaveBeenCalledWith("hello", "model-x");
    expect(result).toBe(expected);
  });

  it("calls embed without model when model is omitted", async () => {
    // Arrange
    mockProxy.embed.mockResolvedValue(new Float32Array([0]));

    // Act
    await embedText("foo");

    // Assert
    expect(mockProxy.embed).toHaveBeenCalledWith("foo", undefined);
  });
});

// ─── preloadEmbedder ─────────────────────────────────────────────────────────

describe("preloadEmbedder", () => {
  beforeEach(async () => {
    await resetWorker();
  });

  it("calls loadEmbedder on the proxy with the provided model", async () => {
    // Arrange
    mockProxy.loadEmbedder.mockResolvedValue(undefined);

    // Act
    await preloadEmbedder("model-y");

    // Assert
    expect(mockProxy.loadEmbedder).toHaveBeenCalledWith("model-y");
  });

  it("calls loadEmbedder without a model when omitted", async () => {
    // Arrange
    mockProxy.loadEmbedder.mockResolvedValue(undefined);

    // Act
    await preloadEmbedder();

    // Assert
    expect(mockProxy.loadEmbedder).toHaveBeenCalledWith(undefined);
  });
});

// ─── browserGenerate ─────────────────────────────────────────────────────────

describe("browserGenerate", () => {
  beforeEach(async () => {
    await resetWorker();
  });

  it("calls generate with the input and undefined when no onToken callback is provided", async () => {
    // Arrange
    const expected = { text: "hello" };
    mockProxy.generate.mockResolvedValue(expected);

    // Act
    const result = await browserGenerate({ prompt: "say hello" });

    // Assert: no Comlink.proxy wrapping, undefined passed.
    expect(mockComlinkProxy).not.toHaveBeenCalled();
    expect(mockProxy.generate).toHaveBeenCalledWith({ prompt: "say hello" }, undefined);
    expect(result).toBe(expected);
  });

  it("wraps onToken with Comlink.proxy when onToken is provided", async () => {
    // Arrange
    const expected = { text: "streamed" };
    mockProxy.generate.mockResolvedValue(expected);
    const onToken = vi.fn();
    // mockComlinkProxy is an identity function by default.

    // Act
    const result = await browserGenerate({ prompt: "stream", maxTokens: 50 }, onToken);

    // Assert: Comlink.proxy was called with the callback.
    expect(mockComlinkProxy).toHaveBeenCalledWith(onToken);
    expect(mockProxy.generate).toHaveBeenCalledWith(
      { prompt: "stream", maxTokens: 50 },
      onToken, // identity mock returns the same fn
    );
    expect(result).toBe(expected);
  });

  it("passes all BrowserGenerateInput fields through to generate", async () => {
    // Arrange
    mockProxy.generate.mockResolvedValue({ text: "ok" });

    // Act
    await browserGenerate({
      system: "You are helpful.",
      prompt: "hi",
      maxTokens: 100,
      temperature: 0.5,
      model: "tiny",
    });

    // Assert
    expect(mockProxy.generate).toHaveBeenCalledWith(
      {
        system: "You are helpful.",
        prompt: "hi",
        maxTokens: 100,
        temperature: 0.5,
        model: "tiny",
      },
      undefined,
    );
  });
});

// ─── preloadBrowserGenerator ─────────────────────────────────────────────────

describe("preloadBrowserGenerator", () => {
  beforeEach(async () => {
    await resetWorker();
  });

  it("calls loadGenerator with model and undefined when no onProgress is provided", async () => {
    // Arrange
    mockProxy.loadGenerator.mockResolvedValue(undefined);

    // Act
    await preloadBrowserGenerator("gen-model");

    // Assert: no Comlink.proxy wrapping.
    expect(mockComlinkProxy).not.toHaveBeenCalled();
    expect(mockProxy.loadGenerator).toHaveBeenCalledWith("gen-model", undefined);
  });

  it("wraps onProgress with Comlink.proxy when onProgress is provided", async () => {
    // Arrange
    mockProxy.loadGenerator.mockResolvedValue(undefined);
    const onProgress = vi.fn();

    // Act
    await preloadBrowserGenerator("gen-model", onProgress);

    // Assert
    expect(mockComlinkProxy).toHaveBeenCalledWith(onProgress);
    expect(mockProxy.loadGenerator).toHaveBeenCalledWith("gen-model", onProgress);
  });

  it("calls loadGenerator with undefined model when model is omitted", async () => {
    // Arrange
    mockProxy.loadGenerator.mockResolvedValue(undefined);

    // Act
    await preloadBrowserGenerator();

    // Assert
    expect(mockProxy.loadGenerator).toHaveBeenCalledWith(undefined, undefined);
  });
});

// ─── disposeInferenceWorker ──────────────────────────────────────────────────

describe("disposeInferenceWorker", () => {
  it("does nothing when no worker has been created (proxy is null)", async () => {
    // Arrange: clean state.
    await resetWorker();

    // Act / Assert: safe to call when proxy is null.
    await expect(disposeInferenceWorker()).resolves.toBeUndefined();
    expect(mockProxy.dispose).not.toHaveBeenCalled();
  });

  it("calls proxy.dispose and worker.terminate when a worker exists", async () => {
    // Arrange: create the worker with a tracked terminate fn.
    const terminate = vi.fn();
    await resetWorker();
    // Override the Worker constructor to return our trackable fake.
    vi.stubGlobal(
      "Worker",
      vi.fn(function (this: object) {
        return { terminate };
      }),
    );
    mockProxy.dispose.mockResolvedValue(undefined);
    getInferenceWorker();

    // Act
    await disposeInferenceWorker();

    // Assert
    expect(mockProxy.dispose).toHaveBeenCalledOnce();
    expect(terminate).toHaveBeenCalledOnce();
  });

  it("sets proxy and worker to null after disposal (second dispose is a no-op)", async () => {
    // Arrange: create worker.
    const terminate = vi.fn();
    await resetWorker();
    vi.stubGlobal(
      "Worker",
      vi.fn(function (this: object) {
        return { terminate };
      }),
    );
    mockProxy.dispose.mockResolvedValue(undefined);
    getInferenceWorker();

    // Act: first dispose clears both proxy and worker.
    await disposeInferenceWorker();

    // Record call counts after the first dispose.
    const disposeCalls = mockProxy.dispose.mock.calls.length;
    const terminateCalls = terminate.mock.calls.length;

    // Second dispose — proxy is null so it should be a complete no-op.
    await disposeInferenceWorker();

    // Assert: no additional calls were made.
    expect(mockProxy.dispose.mock.calls.length).toBe(disposeCalls);
    expect(terminate.mock.calls.length).toBe(terminateCalls);
  });

  it("swallows errors thrown by proxy.dispose and still terminates the worker", async () => {
    // Arrange: make dispose throw.
    const terminate = vi.fn();
    await resetWorker();
    vi.stubGlobal(
      "Worker",
      vi.fn(function (this: object) {
        return { terminate };
      }),
    );
    mockProxy.dispose.mockRejectedValue(new Error("dispose failed"));
    getInferenceWorker();

    // Act: must not throw even if dispose rejects.
    await expect(disposeInferenceWorker()).resolves.toBeUndefined();

    // Assert: terminate was still called.
    expect(terminate).toHaveBeenCalledOnce();
  });

  it("still sets proxy and worker to null even when dispose throws", async () => {
    // Arrange
    const terminate = vi.fn();
    await resetWorker();
    vi.stubGlobal(
      "Worker",
      vi.fn(function (this: object) {
        return { terminate };
      }),
    );
    mockProxy.dispose.mockRejectedValue(new Error("oops"));
    getInferenceWorker();

    // Act
    await disposeInferenceWorker();

    // Assert: second dispose is a no-op (singletons are cleared).
    await disposeInferenceWorker();
    expect(terminate).toHaveBeenCalledTimes(1); // only once from first dispose
  });
});
