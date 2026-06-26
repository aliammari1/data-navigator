import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";

// ─── Mock external dependencies ───────────────────────────────────────────────
// Mock the transformers-engine module so no real ONNX / WebWorker code runs
vi.mock("@/platform/ai/transformers-engine", () => ({
  chat: vi.fn(),
  getLLMStatus: vi.fn(),
  isLoaded: vi.fn(),
  loadLLM: vi.fn(),
  unloadLLM: vi.fn(),
}));

// Mock the base adapters so generateStructuredByPrompt and toSystemUser are controllable
vi.mock("@/platform/ai/provider/adapters/base", () => ({
  generateStructuredByPrompt: vi.fn(),
  toSystemUser: vi.fn(),
}));

// ─── Import AFTER mocking ─────────────────────────────────────────────────────
import { transformersProvider } from "@/platform/ai/provider/adapters/transformers";
import {
  chat,
  getLLMStatus,
  isLoaded,
  loadLLM,
  unloadLLM,
} from "@/platform/ai/transformers-engine";
import { generateStructuredByPrompt, toSystemUser } from "@/platform/ai/provider/adapters/base";

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(chat).mockReset();
  vi.mocked(getLLMStatus).mockReset();
  vi.mocked(isLoaded).mockReset();
  vi.mocked(loadLLM).mockReset();
  vi.mocked(unloadLLM).mockReset();
  vi.mocked(generateStructuredByPrompt).mockReset();
  vi.mocked(toSystemUser).mockReset();

  // Sensible defaults
  vi.mocked(isLoaded).mockReturnValue(false);
  vi.mocked(loadLLM).mockResolvedValue(undefined);
  vi.mocked(chat).mockResolvedValue("generated text");
  vi.mocked(getLLMStatus).mockReturnValue({
    loaded: true,
    loading: false,
    modelId: "onnx-community/Qwen2.5-0.5B-Instruct",
    device: "wasm",
  });
  vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "test prompt" });
  vi.mocked(unloadLLM).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── transformersProvider static properties ───────────────────────────────────

describe("transformersProvider static properties", () => {
  it("has id = 'transformers'", () => {
    expect(transformersProvider.id).toBe("transformers");
  });

  it("has a non-empty label string", () => {
    expect(typeof transformersProvider.label).toBe("string");
    expect(transformersProvider.label.length).toBeGreaterThan(0);
  });

  it("advertises streaming = true", () => {
    expect(transformersProvider.capabilities.streaming).toBe(true);
  });

  it("advertises structuredNative = false", () => {
    expect(transformersProvider.capabilities.structuredNative).toBe(false);
  });

  it("advertises offline = true", () => {
    expect(transformersProvider.capabilities.offline).toBe(true);
  });

  it("advertises requiresWebGPU = false", () => {
    expect(transformersProvider.capabilities.requiresWebGPU).toBe(false);
  });
});

// ─── transformersProvider.isAvailable ────────────────────────────────────────

describe("transformersProvider.isAvailable", () => {
  it("returns true when window and Worker are defined (browser environment)", async () => {
    // Arrange: jsdom provides window; we need to stub Worker as it's not in jsdom
    const origWorker = globalThis.Worker;
    Object.defineProperty(globalThis, "Worker", {
      value: class MockWorker {},
      writable: true,
      configurable: true,
    });

    // Act
    const result = await transformersProvider.isAvailable();

    // Restore
    Object.defineProperty(globalThis, "Worker", {
      value: origWorker,
      writable: true,
      configurable: true,
    });

    // Assert
    expect(result).toBe(true);
  });

  it("returns false when window is undefined (non-browser environment)", async () => {
    // Arrange: temporarily remove window from global
    const origWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    // Act
    const result = await transformersProvider.isAvailable();

    // Restore
    Object.defineProperty(globalThis, "window", {
      value: origWindow,
      writable: true,
      configurable: true,
    });

    // Assert
    expect(result).toBe(false);
  });

  it("returns false when Worker is undefined (no worker support)", async () => {
    // Arrange: hide Worker from global
    const origWorker = globalThis.Worker;
    Object.defineProperty(globalThis, "Worker", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    // Act
    const result = await transformersProvider.isAvailable();

    // Restore
    Object.defineProperty(globalThis, "Worker", {
      value: origWorker,
      writable: true,
      configurable: true,
    });

    // Assert
    expect(result).toBe(false);
  });
});

// ─── transformersProvider.listModels ─────────────────────────────────────────

describe("transformersProvider.listModels", () => {
  it("returns exactly 3 curated models", async () => {
    // Act
    const models = await transformersProvider.listModels();

    // Assert
    expect(models).toHaveLength(3);
  });

  it("first model is the Qwen2.5 0.5B ONNX variant", async () => {
    // Act
    const models = await transformersProvider.listModels();

    // Assert
    expect(models[0].id).toBe("onnx-community/Qwen2.5-0.5B-Instruct");
    expect(models[0].label).toBe("Qwen2.5 0.5B (ONNX)");
    expect(models[0].family).toBe("Qwen2.5");
    expect(models[0].sizeLabel).toBe("0.5B");
  });

  it("second model is SmolLM2 360M", async () => {
    // Act
    const models = await transformersProvider.listModels();

    // Assert
    expect(models[1].id).toBe("HuggingFaceTB/SmolLM2-360M-Instruct");
    expect(models[1].label).toBe("SmolLM2 360M");
    expect(models[1].family).toBe("SmolLM2");
    expect(models[1].sizeLabel).toBe("360M");
  });

  it("third model is SmolLM2 1.7B", async () => {
    // Act
    const models = await transformersProvider.listModels();

    // Assert
    expect(models[2].id).toBe("HuggingFaceTB/SmolLM2-1.7B-Instruct");
    expect(models[2].label).toBe("SmolLM2 1.7B");
    expect(models[2].family).toBe("SmolLM2");
    expect(models[2].sizeLabel).toBe("1.7B");
  });

  it("each model has id, label, family, and sizeLabel as strings", async () => {
    // Act
    const models = await transformersProvider.listModels();

    // Assert
    for (const model of models) {
      expect(typeof model.id).toBe("string");
      expect(typeof model.label).toBe("string");
      expect(typeof model.family).toBe("string");
      expect(typeof model.sizeLabel).toBe("string");
    }
  });
});

// ─── transformersProvider.ensureReady ────────────────────────────────────────

describe("transformersProvider.ensureReady", () => {
  it("calls loadLLM with the provided model id", async () => {
    // Act
    await transformersProvider.ensureReady("onnx-community/Qwen2.5-0.5B-Instruct");

    // Assert
    expect(loadLLM).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: "onnx-community/Qwen2.5-0.5B-Instruct" }),
    );
  });

  it("calls loadLLM with preferredDevice='auto'", async () => {
    // Act
    await transformersProvider.ensureReady("onnx-community/Qwen2.5-0.5B-Instruct");

    // Assert
    expect(loadLLM).toHaveBeenCalledWith(
      expect.objectContaining({ preferredDevice: "auto" }),
    );
  });

  it("calls loadLLM with allowRemoteModels=false (air-gapped posture)", async () => {
    // Act
    await transformersProvider.ensureReady("onnx-community/Qwen2.5-0.5B-Instruct");

    // Assert
    expect(loadLLM).toHaveBeenCalledWith(
      expect.objectContaining({ allowRemoteModels: false }),
    );
  });

  it("resolves without error when onProgress is omitted", async () => {
    // Act / Assert
    await expect(
      transformersProvider.ensureReady("onnx-community/Qwen2.5-0.5B-Instruct"),
    ).resolves.toBeUndefined();
  });

  it("forwards the AbortSignal to loadLLM", async () => {
    // Arrange
    const controller = new AbortController();

    // Act
    await transformersProvider.ensureReady(
      "onnx-community/Qwen2.5-0.5B-Instruct",
      undefined,
      controller.signal,
    );

    // Assert
    expect(loadLLM).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("calls onProgress with status='loading' when progress < 1", async () => {
    // Arrange: capture the onProgress callback and fire it
    let capturedOnProgress: ((progress: number, text: string) => void) | undefined;
    vi.mocked(loadLLM).mockImplementation(async (options) => {
      capturedOnProgress = options.onProgress;
    });
    const onProgress = vi.fn();

    // Act
    const ready = transformersProvider.ensureReady(
      "onnx-community/Qwen2.5-0.5B-Instruct",
      onProgress,
    );
    capturedOnProgress?.(0.5, "Downloading model...");
    await ready;

    // Assert: progress=0.5 → status='loading', progress=50
    expect(onProgress).toHaveBeenCalledTimes(1);
    const call = onProgress.mock.calls[0][0];
    expect(call.status).toBe("loading");
    expect(call.progress).toBe(50);
    expect(call.message).toBe("Downloading model...");
  });

  it("calls onProgress with status='ready' when progress >= 1", async () => {
    // Arrange
    let capturedOnProgress: ((progress: number, text: string) => void) | undefined;
    vi.mocked(loadLLM).mockImplementation(async (options) => {
      capturedOnProgress = options.onProgress;
    });
    const onProgress = vi.fn();

    // Act
    const ready = transformersProvider.ensureReady(
      "onnx-community/Qwen2.5-0.5B-Instruct",
      onProgress,
    );
    capturedOnProgress?.(1, "Model ready");
    await ready;

    // Assert: progress=1 → status='ready'
    const call = onProgress.mock.calls[0][0];
    expect(call.status).toBe("ready");
    expect(call.progress).toBe(100);
    expect(call.message).toBe("Model ready");
  });

  it("does not call onProgress when the callback is undefined", async () => {
    // Arrange: fire the internal callback; no external onProgress provided
    let capturedOnProgress: ((progress: number, text: string) => void) | undefined;
    vi.mocked(loadLLM).mockImplementation(async (options) => {
      capturedOnProgress = options.onProgress;
    });

    // Act
    await transformersProvider.ensureReady("onnx-community/Qwen2.5-0.5B-Instruct");

    // Trigger the callback even when onProgress was undefined - should not throw
    expect(() => capturedOnProgress?.(0.5, "test")).not.toThrow();
  });

  it("propagates errors from loadLLM", async () => {
    // Arrange
    vi.mocked(loadLLM).mockRejectedValue(new Error("Model load failed"));

    // Act / Assert
    await expect(
      transformersProvider.ensureReady("onnx-community/Qwen2.5-0.5B-Instruct"),
    ).rejects.toThrow("Model load failed");
  });
});

// ─── transformersProvider.generate ───────────────────────────────────────────

describe("transformersProvider.generate", () => {
  it("calls ensureReady when model is not loaded (modelId mismatch)", async () => {
    // Arrange: status shows a different modelId than what we request
    vi.mocked(getLLMStatus).mockReturnValue({
      loaded: false,
      loading: false,
      modelId: "some-other-model",
      device: null,
    });
    vi.mocked(isLoaded).mockReturnValue(false);
    vi.mocked(toSystemUser).mockReturnValue({ system: "sys", user: "hello" });
    vi.mocked(chat).mockResolvedValue("response");

    // Act
    await transformersProvider.generate({
      model: "onnx-community/Qwen2.5-0.5B-Instruct",
      prompt: "hello",
    });

    // Assert: loadLLM was called via ensureReady
    expect(loadLLM).toHaveBeenCalledTimes(1);
  });

  it("calls ensureReady when modelId matches but model is not loaded", async () => {
    // Arrange: modelId matches but isLoaded returns false
    vi.mocked(getLLMStatus).mockReturnValue({
      loaded: false,
      loading: false,
      modelId: "onnx-community/Qwen2.5-0.5B-Instruct",
      device: null,
    });
    vi.mocked(isLoaded).mockReturnValue(false);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hello" });
    vi.mocked(chat).mockResolvedValue("response");

    // Act
    await transformersProvider.generate({
      model: "onnx-community/Qwen2.5-0.5B-Instruct",
      prompt: "hello",
    });

    // Assert
    expect(loadLLM).toHaveBeenCalledTimes(1);
  });

  it("skips ensureReady when modelId matches and model is loaded", async () => {
    // Arrange: same modelId + isLoaded = true → no ensureReady
    vi.mocked(getLLMStatus).mockReturnValue({
      loaded: true,
      loading: false,
      modelId: "onnx-community/Qwen2.5-0.5B-Instruct",
      device: "wasm",
    });
    vi.mocked(isLoaded).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hello" });
    vi.mocked(chat).mockResolvedValue("fast response");

    // Act
    await transformersProvider.generate({
      model: "onnx-community/Qwen2.5-0.5B-Instruct",
      prompt: "hello",
    });

    // Assert: loadLLM should NOT have been called
    expect(loadLLM).not.toHaveBeenCalled();
  });

  it("returns the generated text in result.text", async () => {
    // Arrange
    vi.mocked(getLLMStatus).mockReturnValue({
      loaded: true,
      loading: false,
      modelId: "onnx-community/Qwen2.5-0.5B-Instruct",
      device: "wasm",
    });
    vi.mocked(isLoaded).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hello" });
    vi.mocked(chat).mockResolvedValue("hello back");

    // Act
    const result = await transformersProvider.generate({
      model: "onnx-community/Qwen2.5-0.5B-Instruct",
      prompt: "hello",
    });

    // Assert
    expect(result.text).toBe("hello back");
  });

  it("returns provider = 'transformers'", async () => {
    // Arrange
    vi.mocked(getLLMStatus).mockReturnValue({
      loaded: true,
      loading: false,
      modelId: "onnx-community/Qwen2.5-0.5B-Instruct",
      device: "wasm",
    });
    vi.mocked(isLoaded).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "p" });
    vi.mocked(chat).mockResolvedValue("out");

    // Act
    const result = await transformersProvider.generate({
      model: "onnx-community/Qwen2.5-0.5B-Instruct",
      prompt: "p",
    });

    // Assert
    expect(result.provider).toBe("transformers");
  });

  it("returns the model from getLLMStatus when modelId is set", async () => {
    // Arrange
    vi.mocked(getLLMStatus).mockReturnValue({
      loaded: true,
      loading: false,
      modelId: "HuggingFaceTB/SmolLM2-1.7B-Instruct",
      device: "wasm",
    });
    vi.mocked(isLoaded).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "p" });
    vi.mocked(chat).mockResolvedValue("out");

    // Act
    const result = await transformersProvider.generate({
      model: "HuggingFaceTB/SmolLM2-1.7B-Instruct",
      prompt: "p",
    });

    // Assert
    expect(result.model).toBe("HuggingFaceTB/SmolLM2-1.7B-Instruct");
  });

  it("falls back to req.model when getLLMStatus().modelId is null", async () => {
    // Arrange: getLLMStatus returns null modelId after generation
    vi.mocked(getLLMStatus)
      .mockReturnValueOnce({
        loaded: true,
        loading: false,
        modelId: "onnx-community/Qwen2.5-0.5B-Instruct",
        device: "wasm",
      })
      .mockReturnValue({
        loaded: true,
        loading: false,
        modelId: null,
        device: null,
      });
    vi.mocked(isLoaded).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "p" });
    vi.mocked(chat).mockResolvedValue("out");

    // Act
    const result = await transformersProvider.generate({
      model: "my-model",
      prompt: "p",
    });

    // Assert
    expect(result.model).toBe("my-model");
  });

  it("returns finishReason='stop' when signal is not aborted", async () => {
    // Arrange
    vi.mocked(getLLMStatus).mockReturnValue({
      loaded: true,
      loading: false,
      modelId: "onnx-community/Qwen2.5-0.5B-Instruct",
      device: "wasm",
    });
    vi.mocked(isLoaded).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "p" });
    vi.mocked(chat).mockResolvedValue("out");
    const controller = new AbortController();

    // Act
    const result = await transformersProvider.generate({
      model: "onnx-community/Qwen2.5-0.5B-Instruct",
      prompt: "p",
      signal: controller.signal,
    });

    // Assert
    expect(result.finishReason).toBe("stop");
  });

  it("returns finishReason='abort' when signal is already aborted", async () => {
    // Arrange
    vi.mocked(getLLMStatus).mockReturnValue({
      loaded: true,
      loading: false,
      modelId: "onnx-community/Qwen2.5-0.5B-Instruct",
      device: "wasm",
    });
    vi.mocked(isLoaded).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "p" });
    vi.mocked(chat).mockResolvedValue("partial");
    const controller = new AbortController();
    controller.abort();

    // Act
    const result = await transformersProvider.generate({
      model: "onnx-community/Qwen2.5-0.5B-Instruct",
      prompt: "p",
      signal: controller.signal,
    });

    // Assert
    expect(result.finishReason).toBe("abort");
  });

  it("returns finishReason='stop' when no signal is provided", async () => {
    // Arrange
    vi.mocked(getLLMStatus).mockReturnValue({
      loaded: true,
      loading: false,
      modelId: "onnx-community/Qwen2.5-0.5B-Instruct",
      device: "wasm",
    });
    vi.mocked(isLoaded).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "p" });
    vi.mocked(chat).mockResolvedValue("out");

    // Act
    const result = await transformersProvider.generate({
      model: "onnx-community/Qwen2.5-0.5B-Instruct",
      prompt: "p",
    });

    // Assert
    expect(result.finishReason).toBe("stop");
  });

  it("includes a non-negative elapsedMs in the result", async () => {
    // Arrange
    vi.mocked(getLLMStatus).mockReturnValue({
      loaded: true,
      loading: false,
      modelId: "onnx-community/Qwen2.5-0.5B-Instruct",
      device: "wasm",
    });
    vi.mocked(isLoaded).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "p" });
    vi.mocked(chat).mockResolvedValue("out");

    // Act
    const result = await transformersProvider.generate({
      model: "onnx-community/Qwen2.5-0.5B-Instruct",
      prompt: "p",
    });

    // Assert
    expect(typeof result.elapsedMs).toBe("number");
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("calls chat with default maxTokens=256 when not specified", async () => {
    // Arrange
    vi.mocked(getLLMStatus).mockReturnValue({
      loaded: true,
      loading: false,
      modelId: "onnx-community/Qwen2.5-0.5B-Instruct",
      device: "wasm",
    });
    vi.mocked(isLoaded).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "sys", user: "hello" });
    vi.mocked(chat).mockResolvedValue("out");

    // Act
    await transformersProvider.generate({
      model: "onnx-community/Qwen2.5-0.5B-Instruct",
      prompt: "hello",
    });

    // Assert
    expect(chat).toHaveBeenCalledWith(
      "sys",
      "hello",
      expect.objectContaining({ maxTokens: 256 }),
    );
  });

  it("calls chat with custom maxTokens when provided", async () => {
    // Arrange
    vi.mocked(getLLMStatus).mockReturnValue({
      loaded: true,
      loading: false,
      modelId: "onnx-community/Qwen2.5-0.5B-Instruct",
      device: "wasm",
    });
    vi.mocked(isLoaded).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hello" });
    vi.mocked(chat).mockResolvedValue("out");

    // Act
    await transformersProvider.generate({
      model: "onnx-community/Qwen2.5-0.5B-Instruct",
      prompt: "hello",
      maxTokens: 128,
    });

    // Assert
    expect(chat).toHaveBeenCalledWith(
      "",
      "hello",
      expect.objectContaining({ maxTokens: 128 }),
    );
  });

  it("calls chat with default temperature=0 when not specified", async () => {
    // Arrange
    vi.mocked(getLLMStatus).mockReturnValue({
      loaded: true,
      loading: false,
      modelId: "onnx-community/Qwen2.5-0.5B-Instruct",
      device: "wasm",
    });
    vi.mocked(isLoaded).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hello" });
    vi.mocked(chat).mockResolvedValue("out");

    // Act
    await transformersProvider.generate({
      model: "onnx-community/Qwen2.5-0.5B-Instruct",
      prompt: "hello",
    });

    // Assert
    expect(chat).toHaveBeenCalledWith(
      "",
      "hello",
      expect.objectContaining({ temperature: 0 }),
    );
  });

  it("calls chat with custom temperature when provided", async () => {
    // Arrange
    vi.mocked(getLLMStatus).mockReturnValue({
      loaded: true,
      loading: false,
      modelId: "onnx-community/Qwen2.5-0.5B-Instruct",
      device: "wasm",
    });
    vi.mocked(isLoaded).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hello" });
    vi.mocked(chat).mockResolvedValue("out");

    // Act
    await transformersProvider.generate({
      model: "onnx-community/Qwen2.5-0.5B-Instruct",
      prompt: "hello",
      temperature: 0.8,
    });

    // Assert
    expect(chat).toHaveBeenCalledWith(
      "",
      "hello",
      expect.objectContaining({ temperature: 0.8 }),
    );
  });

  it("passes topP through to chat when provided", async () => {
    // Arrange
    vi.mocked(getLLMStatus).mockReturnValue({
      loaded: true,
      loading: false,
      modelId: "onnx-community/Qwen2.5-0.5B-Instruct",
      device: "wasm",
    });
    vi.mocked(isLoaded).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hello" });
    vi.mocked(chat).mockResolvedValue("out");

    // Act
    await transformersProvider.generate({
      model: "onnx-community/Qwen2.5-0.5B-Instruct",
      prompt: "hello",
      topP: 0.9,
    });

    // Assert
    expect(chat).toHaveBeenCalledWith(
      "",
      "hello",
      expect.objectContaining({ topP: 0.9 }),
    );
  });

  it("passes onToken streaming callback through to chat", async () => {
    // Arrange
    vi.mocked(getLLMStatus).mockReturnValue({
      loaded: true,
      loading: false,
      modelId: "onnx-community/Qwen2.5-0.5B-Instruct",
      device: "wasm",
    });
    vi.mocked(isLoaded).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hello" });
    vi.mocked(chat).mockResolvedValue("streamed output");
    const onToken = vi.fn();

    // Act
    await transformersProvider.generate({
      model: "onnx-community/Qwen2.5-0.5B-Instruct",
      prompt: "hello",
      onToken,
    });

    // Assert
    expect(chat).toHaveBeenCalledWith(
      "",
      "hello",
      expect.objectContaining({ onToken }),
    );
  });

  it("passes signal through to chat", async () => {
    // Arrange
    vi.mocked(getLLMStatus).mockReturnValue({
      loaded: true,
      loading: false,
      modelId: "onnx-community/Qwen2.5-0.5B-Instruct",
      device: "wasm",
    });
    vi.mocked(isLoaded).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hello" });
    vi.mocked(chat).mockResolvedValue("out");
    const controller = new AbortController();

    // Act
    await transformersProvider.generate({
      model: "onnx-community/Qwen2.5-0.5B-Instruct",
      prompt: "hello",
      signal: controller.signal,
    });

    // Assert
    expect(chat).toHaveBeenCalledWith(
      "",
      "hello",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("calls chat with agentName='ai-provider'", async () => {
    // Arrange
    vi.mocked(getLLMStatus).mockReturnValue({
      loaded: true,
      loading: false,
      modelId: "onnx-community/Qwen2.5-0.5B-Instruct",
      device: "wasm",
    });
    vi.mocked(isLoaded).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "p" });
    vi.mocked(chat).mockResolvedValue("out");

    // Act
    await transformersProvider.generate({
      model: "onnx-community/Qwen2.5-0.5B-Instruct",
      prompt: "p",
    });

    // Assert
    expect(chat).toHaveBeenCalledWith(
      "",
      "p",
      expect.objectContaining({ agentName: "ai-provider" }),
    );
  });
});

// ─── transformersProvider.generateStructured ─────────────────────────────────

describe("transformersProvider.generateStructured", () => {
  const schema = z.object({ answer: z.string() });

  it("delegates to generateStructuredByPrompt", async () => {
    // Arrange
    vi.mocked(generateStructuredByPrompt).mockResolvedValue({ answer: "42" });

    // Act
    const result = await transformersProvider.generateStructured(
      { model: "onnx-community/Qwen2.5-0.5B-Instruct", prompt: "what is the answer?" },
      schema,
    );

    // Assert
    expect(generateStructuredByPrompt).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ answer: "42" });
  });

  it("passes the provider, request, and schema to generateStructuredByPrompt", async () => {
    // Arrange
    vi.mocked(generateStructuredByPrompt).mockResolvedValue({ answer: "yes" });
    const req = {
      model: "onnx-community/Qwen2.5-0.5B-Instruct",
      prompt: "is this correct?",
    };

    // Act
    await transformersProvider.generateStructured(req, schema);

    // Assert
    expect(generateStructuredByPrompt).toHaveBeenCalledWith(
      transformersProvider,
      req,
      schema,
    );
  });

  it("propagates errors from generateStructuredByPrompt", async () => {
    // Arrange
    vi.mocked(generateStructuredByPrompt).mockRejectedValue(new Error("structured failed"));

    // Act / Assert
    await expect(
      transformersProvider.generateStructured(
        { model: "onnx-community/Qwen2.5-0.5B-Instruct", prompt: "p" },
        schema,
      ),
    ).rejects.toThrow("structured failed");
  });
});

// ─── transformersProvider.unload ─────────────────────────────────────────────

describe("transformersProvider.unload", () => {
  it("calls unloadLLM", async () => {
    // Act
    await transformersProvider.unload?.();

    // Assert
    expect(unloadLLM).toHaveBeenCalledTimes(1);
  });

  it("resolves without error", async () => {
    // Arrange
    vi.mocked(unloadLLM).mockResolvedValue(undefined);

    // Act / Assert
    await expect(transformersProvider.unload?.()).resolves.toBeUndefined();
  });

  it("propagates errors from unloadLLM", async () => {
    // Arrange
    vi.mocked(unloadLLM).mockRejectedValue(new Error("unload failed"));

    // Act / Assert
    await expect(transformersProvider.unload?.()).rejects.toThrow("unload failed");
  });
});
