import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";

// ─── Mock external dependencies ───────────────────────────────────────────────
// Mock the llm-engine module so no real WebGPU / WebLLM code runs
vi.mock("@/platform/ai/llm-engine", () => ({
  generateText: vi.fn(),
  getLLMEngineState: vi.fn(),
  initLLMEngine: vi.fn(),
  isLLMReady: vi.fn(),
  unloadLLMEngine: vi.fn(),
}));

// Mock the base adapters so generateStructuredByPrompt and toSystemUser are controllable
vi.mock("@/platform/ai/provider/adapters/base", () => ({
  generateStructuredByPrompt: vi.fn(),
  toSystemUser: vi.fn(),
}));

// ─── Import AFTER mocking ─────────────────────────────────────────────────────
import {
  isWebLLMOptIn,
  setWebLLMOptIn,
  webllmProvider,
} from "@/platform/ai/provider/adapters/webllm";
import {
  generateText,
  getLLMEngineState,
  initLLMEngine,
  isLLMReady,
  unloadLLMEngine,
} from "@/platform/ai/llm-engine";
import { generateStructuredByPrompt, toSystemUser } from "@/platform/ai/provider/adapters/base";

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  // Clear localStorage between tests
  localStorage.clear();
  // Reset all mocks
  vi.mocked(generateText).mockReset();
  vi.mocked(getLLMEngineState).mockReset();
  vi.mocked(initLLMEngine).mockReset();
  vi.mocked(isLLMReady).mockReset();
  vi.mocked(unloadLLMEngine).mockReset();
  vi.mocked(generateStructuredByPrompt).mockReset();
  vi.mocked(toSystemUser).mockReset();

  // Sensible defaults
  vi.mocked(isLLMReady).mockReturnValue(false);
  vi.mocked(initLLMEngine).mockResolvedValue(undefined);
  vi.mocked(generateText).mockResolvedValue("generated text");
  vi.mocked(getLLMEngineState).mockReturnValue({
    status: "ready",
    progress: 100,
    model: "Qwen2-0.5B-Instruct-q4f16_1-MLC",
    error: null,
  });
  vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "test prompt" });
  vi.mocked(unloadLLMEngine).mockResolvedValue(undefined);
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

// ─── isWebLLMOptIn ────────────────────────────────────────────────────────────

describe("isWebLLMOptIn", () => {
  it("returns false when localStorage does not have the flag set", () => {
    // Arrange: localStorage is empty (cleared in beforeEach)

    // Act
    const result = isWebLLMOptIn();

    // Assert
    expect(result).toBe(false);
  });

  it("returns true when localStorage has the flag set to 'true'", () => {
    // Arrange
    localStorage.setItem("ai.webgpu.enabled", "true");

    // Act
    const result = isWebLLMOptIn();

    // Assert
    expect(result).toBe(true);
  });

  it("returns false when localStorage has the flag set to 'false'", () => {
    // Arrange
    localStorage.setItem("ai.webgpu.enabled", "false");

    // Act
    const result = isWebLLMOptIn();

    // Assert
    expect(result).toBe(false);
  });

  it("returns false when localStorage has an arbitrary value (not 'true')", () => {
    // Arrange
    localStorage.setItem("ai.webgpu.enabled", "yes");

    // Act
    const result = isWebLLMOptIn();

    // Assert
    expect(result).toBe(false);
  });

  it("returns false when localStorage is undefined (non-browser environment)", () => {
    // Arrange: temporarily hide localStorage from the global
    const origLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    // Act
    const result = isWebLLMOptIn();

    // Restore
    Object.defineProperty(globalThis, "localStorage", {
      value: origLocalStorage,
      writable: true,
      configurable: true,
    });

    // Assert
    expect(result).toBe(false);
  });
});

// ─── setWebLLMOptIn ───────────────────────────────────────────────────────────

describe("setWebLLMOptIn", () => {
  it("persists 'true' in localStorage when enabled=true", () => {
    // Act
    setWebLLMOptIn(true);

    // Assert
    expect(localStorage.getItem("ai.webgpu.enabled")).toBe("true");
  });

  it("persists 'false' in localStorage when enabled=false", () => {
    // Arrange: start with true
    localStorage.setItem("ai.webgpu.enabled", "true");

    // Act
    setWebLLMOptIn(false);

    // Assert
    expect(localStorage.getItem("ai.webgpu.enabled")).toBe("false");
  });

  it("does nothing when localStorage is undefined", () => {
    // Arrange: temporarily hide localStorage
    const origLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    // Act: should not throw
    expect(() => setWebLLMOptIn(true)).not.toThrow();

    // Restore
    Object.defineProperty(globalThis, "localStorage", {
      value: origLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  it("round-trips: setWebLLMOptIn(true) then isWebLLMOptIn() returns true", () => {
    // Act
    setWebLLMOptIn(true);

    // Assert
    expect(isWebLLMOptIn()).toBe(true);
  });

  it("round-trips: setWebLLMOptIn(false) then isWebLLMOptIn() returns false", () => {
    // Arrange: start with true
    setWebLLMOptIn(true);

    // Act
    setWebLLMOptIn(false);

    // Assert
    expect(isWebLLMOptIn()).toBe(false);
  });
});

// ─── webllmProvider static properties ────────────────────────────────────────

describe("webllmProvider static properties", () => {
  it("has id = 'webllm'", () => {
    expect(webllmProvider.id).toBe("webllm");
  });

  it("has a non-empty label string", () => {
    expect(typeof webllmProvider.label).toBe("string");
    expect(webllmProvider.label.length).toBeGreaterThan(0);
  });

  it("advertises streaming = false", () => {
    expect(webllmProvider.capabilities.streaming).toBe(false);
  });

  it("advertises structuredNative = false", () => {
    expect(webllmProvider.capabilities.structuredNative).toBe(false);
  });

  it("advertises offline = true", () => {
    expect(webllmProvider.capabilities.offline).toBe(true);
  });

  it("advertises requiresWebGPU = true", () => {
    expect(webllmProvider.capabilities.requiresWebGPU).toBe(true);
  });
});

// ─── webllmProvider.isAvailable ───────────────────────────────────────────────

describe("webllmProvider.isAvailable", () => {
  it("returns false when opt-in flag is not set (even if WebGPU is present)", async () => {
    // Arrange: no localStorage flag set; provide a GPU adapter
    Object.defineProperty(navigator, "gpu", {
      value: { requestAdapter: vi.fn().mockResolvedValue({}) },
      writable: true,
      configurable: true,
    });

    // Act
    const result = await webllmProvider.isAvailable();

    // Assert
    expect(result).toBe(false);
  });

  it("returns false when opt-in is true but navigator.gpu is absent", async () => {
    // Arrange
    localStorage.setItem("ai.webgpu.enabled", "true");
    Object.defineProperty(navigator, "gpu", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    // Act
    const result = await webllmProvider.isAvailable();

    // Assert
    expect(result).toBe(false);
  });

  it("returns false when opt-in is true but requestAdapter returns null", async () => {
    // Arrange
    localStorage.setItem("ai.webgpu.enabled", "true");
    Object.defineProperty(navigator, "gpu", {
      value: { requestAdapter: vi.fn().mockResolvedValue(null) },
      writable: true,
      configurable: true,
    });

    // Act
    const result = await webllmProvider.isAvailable();

    // Assert
    expect(result).toBe(false);
  });

  it("returns true when opt-in is set AND requestAdapter returns a truthy adapter", async () => {
    // Arrange
    localStorage.setItem("ai.webgpu.enabled", "true");
    Object.defineProperty(navigator, "gpu", {
      value: { requestAdapter: vi.fn().mockResolvedValue({ limits: {} }) },
      writable: true,
      configurable: true,
    });

    // Act
    const result = await webllmProvider.isAvailable();

    // Assert
    expect(result).toBe(true);
  });

  it("returns false when opt-in is true but requestAdapter throws", async () => {
    // Arrange
    localStorage.setItem("ai.webgpu.enabled", "true");
    Object.defineProperty(navigator, "gpu", {
      value: { requestAdapter: vi.fn().mockRejectedValue(new Error("GPU error")) },
      writable: true,
      configurable: true,
    });

    // Act
    const result = await webllmProvider.isAvailable();

    // Assert: hasWebGPU() catches the error and returns false
    expect(result).toBe(false);
  });

  it("returns false when navigator is undefined", async () => {
    // Arrange: opt-in is set but there is no navigator
    localStorage.setItem("ai.webgpu.enabled", "true");
    const origNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    // Act
    const result = await webllmProvider.isAvailable();

    // Restore
    Object.defineProperty(globalThis, "navigator", {
      value: origNavigator,
      writable: true,
      configurable: true,
    });

    // Assert
    expect(result).toBe(false);
  });
});

// ─── webllmProvider.listModels ────────────────────────────────────────────────

describe("webllmProvider.listModels", () => {
  it("returns exactly 3 curated models", async () => {
    // Act
    const models = await webllmProvider.listModels();

    // Assert
    expect(models).toHaveLength(3);
  });

  it("first model is the Qwen2 0.5B variant", async () => {
    // Act
    const models = await webllmProvider.listModels();

    // Assert
    expect(models[0].id).toBe("Qwen2-0.5B-Instruct-q4f16_1-MLC");
    expect(models[0].label).toBe("Qwen2 0.5B");
    expect(models[0].family).toBe("Qwen2");
    expect(models[0].sizeLabel).toBe("0.5B");
    expect(models[0].downloadMb).toBe(500);
  });

  it("second model is the TinyLlama 1.1B variant", async () => {
    // Act
    const models = await webllmProvider.listModels();

    // Assert
    expect(models[1].id).toBe("TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC");
    expect(models[1].label).toBe("TinyLlama 1.1B");
    expect(models[1].family).toBe("TinyLlama");
    expect(models[1].sizeLabel).toBe("1.1B");
    expect(models[1].downloadMb).toBe(700);
  });

  it("third model is the Llama 3.2 1B variant", async () => {
    // Act
    const models = await webllmProvider.listModels();

    // Assert
    expect(models[2].id).toBe("Llama-3.2-1B-Instruct-q4f16_1-MLC");
    expect(models[2].label).toBe("Llama 3.2 1B");
    expect(models[2].family).toBe("Llama");
    expect(models[2].sizeLabel).toBe("1B");
    expect(models[2].downloadMb).toBe(900);
  });

  it("each model has id, label, family, sizeLabel, and downloadMb", async () => {
    // Act
    const models = await webllmProvider.listModels();

    // Assert
    for (const model of models) {
      expect(typeof model.id).toBe("string");
      expect(typeof model.label).toBe("string");
      expect(typeof model.family).toBe("string");
      expect(typeof model.sizeLabel).toBe("string");
      expect(typeof model.downloadMb).toBe("number");
    }
  });
});

// ─── webllmProvider.ensureReady ───────────────────────────────────────────────

describe("webllmProvider.ensureReady", () => {
  it("calls initLLMEngine with the provided model id", async () => {
    // Act
    await webllmProvider.ensureReady("Qwen2-0.5B-Instruct-q4f16_1-MLC");

    // Assert
    expect(initLLMEngine).toHaveBeenCalledWith(
      "Qwen2-0.5B-Instruct-q4f16_1-MLC",
      expect.any(Function),
    );
  });

  it("does not throw when onProgress is omitted", async () => {
    // Act / Assert
    await expect(
      webllmProvider.ensureReady("Qwen2-0.5B-Instruct-q4f16_1-MLC"),
    ).resolves.toBeUndefined();
  });

  it("maps known status values and forwards progress to onProgress", async () => {
    // Arrange: capture the progress callback and fire it manually
    let capturedCallback: ((s: { status: string; progress: number; error: string | null }) => void) | undefined;
    vi.mocked(initLLMEngine).mockImplementation(async (_model, cb) => {
      capturedCallback = cb as typeof capturedCallback;
    });
    const onProgress = vi.fn();

    // Act
    const ready = webllmProvider.ensureReady("Qwen2-0.5B-Instruct-q4f16_1-MLC", onProgress);
    // Fire progress events before the promise resolves
    capturedCallback?.({ status: "loading", progress: 50, error: null });
    capturedCallback?.({ status: "ready", progress: 100, error: null });
    await ready;

    // Assert
    expect(onProgress).toHaveBeenCalledTimes(2);
    const [first, second] = onProgress.mock.calls.map((c) => c[0]);
    expect(first.status).toBe("loading");
    expect(first.progress).toBe(50);
    expect(first.message).toBeUndefined();
    expect(second.status).toBe("ready");
    expect(second.progress).toBe(100);
  });

  it("maps 'idle' status through to AIProgress", async () => {
    // Arrange
    let capturedCallback: ((s: { status: string; progress: number; error: string | null }) => void) | undefined;
    vi.mocked(initLLMEngine).mockImplementation(async (_model, cb) => {
      capturedCallback = cb as typeof capturedCallback;
    });
    const onProgress = vi.fn();

    // Act
    const ready = webllmProvider.ensureReady("Qwen2-0.5B-Instruct-q4f16_1-MLC", onProgress);
    capturedCallback?.({ status: "idle", progress: 0, error: null });
    await ready;

    // Assert
    expect(onProgress.mock.calls[0][0].status).toBe("idle");
  });

  it("maps 'inferring' status through to AIProgress", async () => {
    // Arrange
    let capturedCallback: ((s: { status: string; progress: number; error: string | null }) => void) | undefined;
    vi.mocked(initLLMEngine).mockImplementation(async (_model, cb) => {
      capturedCallback = cb as typeof capturedCallback;
    });
    const onProgress = vi.fn();

    // Act
    const ready = webllmProvider.ensureReady("Qwen2-0.5B-Instruct-q4f16_1-MLC", onProgress);
    capturedCallback?.({ status: "inferring", progress: 75, error: null });
    await ready;

    // Assert
    expect(onProgress.mock.calls[0][0].status).toBe("inferring");
  });

  it("maps 'error' status through to AIProgress and includes error message", async () => {
    // Arrange
    let capturedCallback: ((s: { status: string; progress: number; error: string | null }) => void) | undefined;
    vi.mocked(initLLMEngine).mockImplementation(async (_model, cb) => {
      capturedCallback = cb as typeof capturedCallback;
    });
    const onProgress = vi.fn();

    // Act
    const ready = webllmProvider.ensureReady("Qwen2-0.5B-Instruct-q4f16_1-MLC", onProgress);
    capturedCallback?.({ status: "error", progress: 0, error: "Out of memory" });
    await ready;

    // Assert
    const call = onProgress.mock.calls[0][0];
    expect(call.status).toBe("error");
    expect(call.message).toBe("Out of memory");
  });

  it("defaults unknown status to 'loading'", async () => {
    // Arrange
    let capturedCallback: ((s: { status: string; progress: number; error: string | null }) => void) | undefined;
    vi.mocked(initLLMEngine).mockImplementation(async (_model, cb) => {
      capturedCallback = cb as typeof capturedCallback;
    });
    const onProgress = vi.fn();

    // Act
    const ready = webllmProvider.ensureReady("Qwen2-0.5B-Instruct-q4f16_1-MLC", onProgress);
    capturedCallback?.({ status: "unknown-future-status", progress: 30, error: null });
    await ready;

    // Assert: unknown status falls back to 'loading'
    expect(onProgress.mock.calls[0][0].status).toBe("loading");
  });

  it("sets message to undefined when error is null", async () => {
    // Arrange
    let capturedCallback: ((s: { status: string; progress: number; error: string | null }) => void) | undefined;
    vi.mocked(initLLMEngine).mockImplementation(async (_model, cb) => {
      capturedCallback = cb as typeof capturedCallback;
    });
    const onProgress = vi.fn();

    // Act
    const ready = webllmProvider.ensureReady("Qwen2-0.5B-Instruct-q4f16_1-MLC", onProgress);
    capturedCallback?.({ status: "loading", progress: 20, error: null });
    await ready;

    // Assert: null error becomes undefined message
    expect(onProgress.mock.calls[0][0].message).toBeUndefined();
  });
});

// ─── webllmProvider.generate ──────────────────────────────────────────────────

describe("webllmProvider.generate", () => {
  it("calls ensureReady when LLM is not ready", async () => {
    // Arrange
    vi.mocked(isLLMReady).mockReturnValue(false);
    vi.mocked(toSystemUser).mockReturnValue({ system: "sys", user: "hello" });
    vi.mocked(generateText).mockResolvedValue("response text");
    vi.mocked(getLLMEngineState).mockReturnValue({
      status: "ready",
      progress: 100,
      model: "Qwen2-0.5B-Instruct-q4f16_1-MLC",
      error: null,
    });

    // Act
    await webllmProvider.generate({ model: "Qwen2-0.5B-Instruct-q4f16_1-MLC", prompt: "hello" });

    // Assert: initLLMEngine was called (via ensureReady)
    expect(initLLMEngine).toHaveBeenCalledTimes(1);
  });

  it("skips ensureReady when LLM is already ready", async () => {
    // Arrange
    vi.mocked(isLLMReady).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hello" });
    vi.mocked(generateText).mockResolvedValue("fast response");
    vi.mocked(getLLMEngineState).mockReturnValue({
      status: "ready",
      progress: 100,
      model: "Qwen2-0.5B-Instruct-q4f16_1-MLC",
      error: null,
    });

    // Act
    await webllmProvider.generate({ model: "Qwen2-0.5B-Instruct-q4f16_1-MLC", prompt: "hello" });

    // Assert: initLLMEngine should NOT have been called
    expect(initLLMEngine).not.toHaveBeenCalled();
  });

  it("returns the generated text in result.text", async () => {
    // Arrange
    vi.mocked(isLLMReady).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hello" });
    vi.mocked(generateText).mockResolvedValue("hello back");
    vi.mocked(getLLMEngineState).mockReturnValue({
      status: "ready",
      progress: 100,
      model: "Qwen2-0.5B-Instruct-q4f16_1-MLC",
      error: null,
    });

    // Act
    const result = await webllmProvider.generate({
      model: "Qwen2-0.5B-Instruct-q4f16_1-MLC",
      prompt: "hello",
    });

    // Assert
    expect(result.text).toBe("hello back");
  });

  it("returns provider = 'webllm'", async () => {
    // Arrange
    vi.mocked(isLLMReady).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "p" });
    vi.mocked(generateText).mockResolvedValue("out");
    vi.mocked(getLLMEngineState).mockReturnValue({
      status: "ready",
      progress: 100,
      model: "Qwen2-0.5B-Instruct-q4f16_1-MLC",
      error: null,
    });

    // Act
    const result = await webllmProvider.generate({ model: "Qwen2-0.5B-Instruct-q4f16_1-MLC", prompt: "p" });

    // Assert
    expect(result.provider).toBe("webllm");
  });

  it("returns the model from getLLMEngineState when it is set", async () => {
    // Arrange
    vi.mocked(isLLMReady).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "p" });
    vi.mocked(generateText).mockResolvedValue("out");
    vi.mocked(getLLMEngineState).mockReturnValue({
      status: "ready",
      progress: 100,
      model: "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC",
      error: null,
    });

    // Act
    const result = await webllmProvider.generate({
      model: "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC",
      prompt: "p",
    });

    // Assert: model comes from state, not from req.model
    expect(result.model).toBe("TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC");
  });

  it("falls back to req.model when getLLMEngineState().model is null", async () => {
    // Arrange
    vi.mocked(isLLMReady).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "p" });
    vi.mocked(generateText).mockResolvedValue("out");
    vi.mocked(getLLMEngineState).mockReturnValue({
      status: "ready",
      progress: 100,
      model: null,
      error: null,
    });

    // Act
    const result = await webllmProvider.generate({ model: "my-model", prompt: "p" });

    // Assert
    expect(result.model).toBe("my-model");
  });

  it("returns finishReason='stop' when signal is not aborted", async () => {
    // Arrange
    vi.mocked(isLLMReady).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "p" });
    vi.mocked(generateText).mockResolvedValue("out");
    vi.mocked(getLLMEngineState).mockReturnValue({
      status: "ready",
      progress: 100,
      model: "Qwen2-0.5B-Instruct-q4f16_1-MLC",
      error: null,
    });
    const controller = new AbortController();

    // Act
    const result = await webllmProvider.generate({
      model: "Qwen2-0.5B-Instruct-q4f16_1-MLC",
      prompt: "p",
      signal: controller.signal,
    });

    // Assert
    expect(result.finishReason).toBe("stop");
  });

  it("returns finishReason='abort' when signal is already aborted", async () => {
    // Arrange
    vi.mocked(isLLMReady).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "p" });
    vi.mocked(generateText).mockResolvedValue("partial");
    vi.mocked(getLLMEngineState).mockReturnValue({
      status: "ready",
      progress: 100,
      model: "Qwen2-0.5B-Instruct-q4f16_1-MLC",
      error: null,
    });
    const controller = new AbortController();
    controller.abort();

    // Act
    const result = await webllmProvider.generate({
      model: "Qwen2-0.5B-Instruct-q4f16_1-MLC",
      prompt: "p",
      signal: controller.signal,
    });

    // Assert
    expect(result.finishReason).toBe("abort");
  });

  it("returns finishReason='stop' when no signal is provided", async () => {
    // Arrange
    vi.mocked(isLLMReady).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "p" });
    vi.mocked(generateText).mockResolvedValue("out");
    vi.mocked(getLLMEngineState).mockReturnValue({
      status: "ready",
      progress: 100,
      model: "Qwen2-0.5B-Instruct-q4f16_1-MLC",
      error: null,
    });

    // Act
    const result = await webllmProvider.generate({ model: "Qwen2-0.5B-Instruct-q4f16_1-MLC", prompt: "p" });

    // Assert
    expect(result.finishReason).toBe("stop");
  });

  it("includes a non-negative elapsedMs in the result", async () => {
    // Arrange
    vi.mocked(isLLMReady).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "p" });
    vi.mocked(generateText).mockResolvedValue("out");
    vi.mocked(getLLMEngineState).mockReturnValue({
      status: "ready",
      progress: 100,
      model: "Qwen2-0.5B-Instruct-q4f16_1-MLC",
      error: null,
    });

    // Act
    const result = await webllmProvider.generate({ model: "Qwen2-0.5B-Instruct-q4f16_1-MLC", prompt: "p" });

    // Assert
    expect(typeof result.elapsedMs).toBe("number");
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("calls generateText with default maxTokens=512 when not specified", async () => {
    // Arrange
    vi.mocked(isLLMReady).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "sys", user: "hello" });
    vi.mocked(generateText).mockResolvedValue("out");
    vi.mocked(getLLMEngineState).mockReturnValue({
      status: "ready",
      progress: 100,
      model: "Qwen2-0.5B-Instruct-q4f16_1-MLC",
      error: null,
    });

    // Act
    await webllmProvider.generate({ model: "Qwen2-0.5B-Instruct-q4f16_1-MLC", prompt: "hello" });

    // Assert
    expect(generateText).toHaveBeenCalledWith("hello", expect.objectContaining({ maxTokens: 512 }));
  });

  it("calls generateText with custom maxTokens when provided", async () => {
    // Arrange
    vi.mocked(isLLMReady).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hello" });
    vi.mocked(generateText).mockResolvedValue("out");
    vi.mocked(getLLMEngineState).mockReturnValue({
      status: "ready",
      progress: 100,
      model: "Qwen2-0.5B-Instruct-q4f16_1-MLC",
      error: null,
    });

    // Act
    await webllmProvider.generate({ model: "Qwen2-0.5B-Instruct-q4f16_1-MLC", prompt: "hello", maxTokens: 256 });

    // Assert
    expect(generateText).toHaveBeenCalledWith("hello", expect.objectContaining({ maxTokens: 256 }));
  });

  it("calls generateText with default temperature=0.7 when not specified", async () => {
    // Arrange
    vi.mocked(isLLMReady).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hello" });
    vi.mocked(generateText).mockResolvedValue("out");
    vi.mocked(getLLMEngineState).mockReturnValue({
      status: "ready",
      progress: 100,
      model: "Qwen2-0.5B-Instruct-q4f16_1-MLC",
      error: null,
    });

    // Act
    await webllmProvider.generate({ model: "Qwen2-0.5B-Instruct-q4f16_1-MLC", prompt: "hello" });

    // Assert
    expect(generateText).toHaveBeenCalledWith("hello", expect.objectContaining({ temperature: 0.7 }));
  });

  it("calls generateText with custom temperature when provided", async () => {
    // Arrange
    vi.mocked(isLLMReady).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hello" });
    vi.mocked(generateText).mockResolvedValue("out");
    vi.mocked(getLLMEngineState).mockReturnValue({
      status: "ready",
      progress: 100,
      model: "Qwen2-0.5B-Instruct-q4f16_1-MLC",
      error: null,
    });

    // Act
    await webllmProvider.generate({ model: "Qwen2-0.5B-Instruct-q4f16_1-MLC", prompt: "hello", temperature: 0.3 });

    // Assert
    expect(generateText).toHaveBeenCalledWith("hello", expect.objectContaining({ temperature: 0.3 }));
  });

  it("passes systemPrompt to generateText when system is non-empty", async () => {
    // Arrange
    vi.mocked(isLLMReady).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "be helpful", user: "hello" });
    vi.mocked(generateText).mockResolvedValue("out");
    vi.mocked(getLLMEngineState).mockReturnValue({
      status: "ready",
      progress: 100,
      model: "Qwen2-0.5B-Instruct-q4f16_1-MLC",
      error: null,
    });

    // Act
    await webllmProvider.generate({
      model: "Qwen2-0.5B-Instruct-q4f16_1-MLC",
      prompt: "hello",
      system: "be helpful",
    });

    // Assert
    expect(generateText).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({ systemPrompt: "be helpful" }),
    );
  });

  it("passes systemPrompt=undefined to generateText when system is empty string", async () => {
    // Arrange
    vi.mocked(isLLMReady).mockReturnValue(true);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hello" });
    vi.mocked(generateText).mockResolvedValue("out");
    vi.mocked(getLLMEngineState).mockReturnValue({
      status: "ready",
      progress: 100,
      model: "Qwen2-0.5B-Instruct-q4f16_1-MLC",
      error: null,
    });

    // Act
    await webllmProvider.generate({ model: "Qwen2-0.5B-Instruct-q4f16_1-MLC", prompt: "hello" });

    // Assert: empty system string becomes undefined systemPrompt
    expect(generateText).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({ systemPrompt: undefined }),
    );
  });
});

// ─── webllmProvider.generateStructured ───────────────────────────────────────

describe("webllmProvider.generateStructured", () => {
  const schema = z.object({ answer: z.string() });

  it("delegates to generateStructuredByPrompt", async () => {
    // Arrange
    vi.mocked(generateStructuredByPrompt).mockResolvedValue({ answer: "42" });

    // Act
    const result = await webllmProvider.generateStructured(
      { model: "Qwen2-0.5B-Instruct-q4f16_1-MLC", prompt: "what is the answer?" },
      schema,
    );

    // Assert
    expect(generateStructuredByPrompt).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ answer: "42" });
  });

  it("passes the provider, request, and schema to generateStructuredByPrompt", async () => {
    // Arrange
    vi.mocked(generateStructuredByPrompt).mockResolvedValue({ answer: "yes" });
    const req = { model: "Qwen2-0.5B-Instruct-q4f16_1-MLC", prompt: "is this correct?" };

    // Act
    await webllmProvider.generateStructured(req, schema);

    // Assert
    expect(generateStructuredByPrompt).toHaveBeenCalledWith(
      webllmProvider,
      req,
      schema,
    );
  });

  it("propagates errors from generateStructuredByPrompt", async () => {
    // Arrange
    vi.mocked(generateStructuredByPrompt).mockRejectedValue(new Error("structured failed"));

    // Act / Assert
    await expect(
      webllmProvider.generateStructured(
        { model: "Qwen2-0.5B-Instruct-q4f16_1-MLC", prompt: "p" },
        schema,
      ),
    ).rejects.toThrow("structured failed");
  });
});

// ─── webllmProvider.unload ────────────────────────────────────────────────────

describe("webllmProvider.unload", () => {
  it("calls unloadLLMEngine", async () => {
    // Act
    await webllmProvider.unload?.();

    // Assert
    expect(unloadLLMEngine).toHaveBeenCalledTimes(1);
  });

  it("resolves without error", async () => {
    // Arrange
    vi.mocked(unloadLLMEngine).mockResolvedValue(undefined);

    // Act / Assert
    await expect(webllmProvider.unload?.()).resolves.toBeUndefined();
  });

  it("propagates errors from unloadLLMEngine", async () => {
    // Arrange
    vi.mocked(unloadLLMEngine).mockRejectedValue(new Error("unload failed"));

    // Act / Assert
    await expect(webllmProvider.unload?.()).rejects.toThrow("unload failed");
  });
});
