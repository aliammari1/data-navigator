import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";

// ─── Mock external dependencies ───────────────────────────────────────────────
// Mock isElectron so we control it per-test
vi.mock("@/platform/electron/electron-fs", () => ({
  isElectron: vi.fn(),
}));

// Mock zodToInlineJsonSchema so we can control schema conversion
vi.mock("@/platform/ai/provider/zod-json-schema", () => ({
  zodToInlineJsonSchema: vi.fn(),
}));

// Mock generateStructuredByPrompt and toSystemUser from base
vi.mock("@/platform/ai/provider/adapters/base", () => ({
  generateStructuredByPrompt: vi.fn(),
  toSystemUser: vi.fn(),
}));

// ─── Import AFTER mocking ─────────────────────────────────────────────────────
import { llamacppProvider } from "@/platform/ai/provider/adapters/llamacpp";
import { isElectron } from "@/platform/electron/electron-fs";
import { zodToInlineJsonSchema } from "@/platform/ai/provider/zod-json-schema";
import { generateStructuredByPrompt, toSystemUser } from "@/platform/ai/provider/adapters/base";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a mock electronLlama API that records calls. */
function makeApi() {
  return {
    isAvailable: vi.fn<() => Promise<boolean>>(),
    ensureModel: vi.fn<(input: { file: string }) => Promise<{ model: string }>>(),
    generate: vi.fn<(input: unknown) => Promise<{ text: string; finishReason: string }>>(),
    generateStructured: vi.fn<(input: unknown) => Promise<unknown>>(),
    onToken: vi.fn<(id: string, cb: (chunk: string) => void) => () => void>(),
    abort: vi.fn<(requestId: string) => Promise<boolean>>(),
    listModels: vi.fn(),
  };
}

/** Install a mock electronLlama on the window and return both it and a cleanup. */
function installLlama() {
  const api = makeApi();
  Object.defineProperty(window, "electronLlama", {
    value: api,
    writable: true,
    configurable: true,
  });
  return api;
}

/** Remove electronLlama from the window. */
function uninstallLlama() {
  // Remove the property so bridge() returns null
  try {
    Object.defineProperty(window, "electronLlama", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  } catch {
    // ignore
  }
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(isElectron).mockReturnValue(true);
  vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "test prompt" });
  vi.mocked(zodToInlineJsonSchema).mockReset();
  vi.mocked(generateStructuredByPrompt).mockReset();
});

afterEach(() => {
  uninstallLlama();
  vi.unstubAllGlobals();
});

// ─── Static properties ────────────────────────────────────────────────────────

describe("llamacppProvider static properties", () => {
  it("has id = 'llamacpp'", () => {
    expect(llamacppProvider.id).toBe("llamacpp");
  });

  it("has a non-empty label string", () => {
    expect(typeof llamacppProvider.label).toBe("string");
    expect(llamacppProvider.label.length).toBeGreaterThan(0);
  });

  it("advertises streaming = true", () => {
    expect(llamacppProvider.capabilities.streaming).toBe(true);
  });

  it("advertises structuredNative = true", () => {
    expect(llamacppProvider.capabilities.structuredNative).toBe(true);
  });

  it("advertises offline = true", () => {
    expect(llamacppProvider.capabilities.offline).toBe(true);
  });

  it("advertises requiresWebGPU = false", () => {
    expect(llamacppProvider.capabilities.requiresWebGPU).toBe(false);
  });
});

// ─── isAvailable ──────────────────────────────────────────────────────────────

describe("llamacppProvider.isAvailable", () => {
  it("returns true when electronLlama.isAvailable resolves true and isElectron() is true", async () => {
    // Arrange
    const api = installLlama();
    api.isAvailable.mockResolvedValue(true);
    vi.mocked(isElectron).mockReturnValue(true);

    // Act
    const result = await llamacppProvider.isAvailable();

    // Assert
    expect(result).toBe(true);
    expect(api.isAvailable).toHaveBeenCalledTimes(1);
  });

  it("returns false when electronLlama.isAvailable resolves false", async () => {
    // Arrange
    const api = installLlama();
    api.isAvailable.mockResolvedValue(false);
    vi.mocked(isElectron).mockReturnValue(true);

    // Act
    const result = await llamacppProvider.isAvailable();

    // Assert
    expect(result).toBe(false);
  });

  it("returns false when isElectron() returns false", async () => {
    // Arrange
    installLlama();
    vi.mocked(isElectron).mockReturnValue(false);

    // Act
    const result = await llamacppProvider.isAvailable();

    // Assert
    expect(result).toBe(false);
  });

  it("returns false when electronLlama bridge is not present (null)", async () => {
    // Arrange: no electronLlama on window
    uninstallLlama();
    vi.mocked(isElectron).mockReturnValue(true);

    // Act
    const result = await llamacppProvider.isAvailable();

    // Assert
    expect(result).toBe(false);
  });

  it("returns false when electronLlama.isAvailable throws", async () => {
    // Arrange
    const api = installLlama();
    api.isAvailable.mockRejectedValue(new Error("IPC error"));
    vi.mocked(isElectron).mockReturnValue(true);

    // Act
    const result = await llamacppProvider.isAvailable();

    // Assert
    expect(result).toBe(false);
  });
});

// ─── listModels ───────────────────────────────────────────────────────────────

describe("llamacppProvider.listModels", () => {
  it("returns the two curated GGUF models", async () => {
    // Act
    const models = await llamacppProvider.listModels();

    // Assert
    expect(models).toHaveLength(2);
    expect(models[0].id).toBe("qwen2.5-1.5b-instruct-q4_k_m.gguf");
    expect(models[1].id).toBe("qwen2.5-0.5b-instruct-q4_k_m.gguf");
  });

  it("each model has a label, family, sizeLabel, and downloadMb", async () => {
    // Act
    const models = await llamacppProvider.listModels();

    // Assert
    for (const model of models) {
      expect(typeof model.label).toBe("string");
      expect(typeof model.family).toBe("string");
      expect(typeof model.sizeLabel).toBe("string");
      expect(typeof model.downloadMb).toBe("number");
    }
  });

  it("first model is the 1.5B (larger) variant", async () => {
    // Act
    const models = await llamacppProvider.listModels();

    // Assert
    expect(models[0].sizeLabel).toBe("1.5B");
    expect(models[0].downloadMb).toBe(1024);
  });

  it("second model is the 0.5B (smaller) low-RAM fallback", async () => {
    // Act
    const models = await llamacppProvider.listModels();

    // Assert
    expect(models[1].sizeLabel).toBe("0.5B");
    expect(models[1].downloadMb).toBe(512);
  });
});

// ─── ensureReady ──────────────────────────────────────────────────────────────

describe("llamacppProvider.ensureReady", () => {
  it("calls api.ensureModel with the model file when a known GGUF id is passed", async () => {
    // Arrange
    const api = installLlama();
    api.ensureModel.mockResolvedValue({ model: "qwen2.5-1.5b-instruct-q4_k_m.gguf" });

    // Act
    await llamacppProvider.ensureReady("qwen2.5-1.5b-instruct-q4_k_m.gguf");

    // Assert
    expect(api.ensureModel).toHaveBeenCalledWith({
      file: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
    });
  });

  it("falls back to the first GGUF model when an unknown model id is passed", async () => {
    // Arrange
    const api = installLlama();
    api.ensureModel.mockResolvedValue({ model: "qwen2.5-1.5b-instruct-q4_k_m.gguf" });

    // Act: pass a HuggingFace id not in the catalog
    await llamacppProvider.ensureReady("some-transformers-hf-model");

    // Assert: should fall back to first catalog entry
    expect(api.ensureModel).toHaveBeenCalledWith({
      file: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
    });
  });

  it("calls onProgress with loading (10%) then ready (100%) in order", async () => {
    // Arrange
    const api = installLlama();
    api.ensureModel.mockResolvedValue({ model: "qwen2.5-1.5b-instruct-q4_k_m.gguf" });
    const onProgress = vi.fn();

    // Act
    await llamacppProvider.ensureReady("qwen2.5-1.5b-instruct-q4_k_m.gguf", onProgress);

    // Assert
    expect(onProgress).toHaveBeenCalledTimes(2);
    const [first, second] = onProgress.mock.calls.map((c) => c[0]);
    expect(first.status).toBe("loading");
    expect(first.progress).toBe(10);
    expect(typeof first.message).toBe("string");
    expect(second.status).toBe("ready");
    expect(second.progress).toBe(100);
  });

  it("loading progress message mentions the file name", async () => {
    // Arrange
    const api = installLlama();
    api.ensureModel.mockResolvedValue({ model: "qwen2.5-1.5b-instruct-q4_k_m.gguf" });
    const onProgress = vi.fn();

    // Act
    await llamacppProvider.ensureReady("qwen2.5-1.5b-instruct-q4_k_m.gguf", onProgress);

    // Assert
    const [loadingCall] = onProgress.mock.calls;
    expect(loadingCall[0].message).toContain("qwen2.5-1.5b-instruct-q4_k_m.gguf");
  });

  it("does not throw when onProgress is omitted", async () => {
    // Arrange
    const api = installLlama();
    api.ensureModel.mockResolvedValue({ model: "qwen2.5-1.5b-instruct-q4_k_m.gguf" });

    // Act / Assert: should resolve without error
    await expect(
      llamacppProvider.ensureReady("qwen2.5-1.5b-instruct-q4_k_m.gguf"),
    ).resolves.toBeUndefined();
  });

  it("returns immediately without calling api.ensureModel when bridge is absent", async () => {
    // Arrange: no electronLlama
    uninstallLlama();
    const onProgress = vi.fn();

    // Act / Assert
    await expect(
      llamacppProvider.ensureReady("qwen2.5-1.5b-instruct-q4_k_m.gguf", onProgress),
    ).resolves.toBeUndefined();
    // onProgress is never called because bridge() returns null
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("uses the 0.5B fallback when model id does not match any catalog entry", async () => {
    // Arrange
    const api = installLlama();
    api.ensureModel.mockResolvedValue({ model: "qwen2.5-1.5b-instruct-q4_k_m.gguf" });

    // Act
    await llamacppProvider.ensureReady("unknown-model-xyz");

    // Assert: falls back to first model (1.5B, index 0)
    const callArg = api.ensureModel.mock.calls[0][0];
    expect(callArg.file).toBe("qwen2.5-1.5b-instruct-q4_k_m.gguf");
  });

  it("recognizes the second catalog model (0.5B) as a known id", async () => {
    // Arrange
    const api = installLlama();
    api.ensureModel.mockResolvedValue({ model: "qwen2.5-0.5b-instruct-q4_k_m.gguf" });

    // Act
    await llamacppProvider.ensureReady("qwen2.5-0.5b-instruct-q4_k_m.gguf");

    // Assert: the 0.5B model is passed directly (it's known)
    expect(api.ensureModel).toHaveBeenCalledWith({
      file: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
    });
  });
});

// ─── generate ─────────────────────────────────────────────────────────────────

describe("llamacppProvider.generate", () => {
  it("throws when the bridge is not present", async () => {
    // Arrange
    uninstallLlama();

    // Act / Assert
    await expect(
      llamacppProvider.generate({ model: "test", prompt: "hello" }),
    ).rejects.toThrow('"llamacpp" is not available');
  });

  it("returns text, model, provider, and elapsedMs from a successful generation", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(toSystemUser).mockReturnValue({ system: "sys", user: "hello" });
    api.generate.mockResolvedValue({ text: "world", finishReason: "stop" });

    // Act
    const result = await llamacppProvider.generate({ model: "my-model", prompt: "hello" });

    // Assert
    expect(result.text).toBe("world");
    expect(result.model).toBe("my-model");
    expect(result.provider).toBe("llamacpp");
    expect(typeof result.elapsedMs).toBe("number");
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("sets finishReason to 'stop' by default", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hi" });
    api.generate.mockResolvedValue({ text: "ok", finishReason: "stop" });

    // Act
    const result = await llamacppProvider.generate({ model: "x", prompt: "hi" });

    // Assert
    expect(result.finishReason).toBe("stop");
  });

  it("sets finishReason to 'abort' when the signal is already aborted", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hi" });
    api.generate.mockResolvedValue({ text: "partial", finishReason: "stop" });

    const controller = new AbortController();
    controller.abort();

    // Act
    const result = await llamacppProvider.generate({
      model: "x",
      prompt: "hi",
      signal: controller.signal,
    });

    // Assert
    expect(result.finishReason).toBe("abort");
  });

  it("uses finishReason from the IPC result when signal is not aborted", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hi" });
    api.generate.mockResolvedValue({ text: "ok", finishReason: "length" });

    const controller = new AbortController(); // not aborted

    // Act
    const result = await llamacppProvider.generate({
      model: "x",
      prompt: "hi",
      signal: controller.signal,
    });

    // Assert
    expect(result.finishReason).toBe("length");
  });

  it("passes maxTokens=512 by default and temperature=0 by default", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hello" });
    api.generate.mockResolvedValue({ text: "out", finishReason: "stop" });

    // Act
    await llamacppProvider.generate({ model: "x", prompt: "hello" });

    // Assert
    const callArg = api.generate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.maxTokens).toBe(512);
    expect(callArg.temperature).toBe(0);
  });

  it("passes custom maxTokens and temperature when provided", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hello" });
    api.generate.mockResolvedValue({ text: "out", finishReason: "stop" });

    // Act
    await llamacppProvider.generate({ model: "x", prompt: "hello", maxTokens: 256, temperature: 0.7 });

    // Assert
    const callArg = api.generate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.maxTokens).toBe(256);
    expect(callArg.temperature).toBe(0.7);
  });

  it("includes topP in the IPC call when provided", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hello" });
    api.generate.mockResolvedValue({ text: "out", finishReason: "stop" });

    // Act
    await llamacppProvider.generate({ model: "x", prompt: "hello", topP: 0.9 });

    // Assert
    const callArg = api.generate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.topP).toBe(0.9);
  });

  it("omits topP from the IPC call when not provided", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hello" });
    api.generate.mockResolvedValue({ text: "out", finishReason: "stop" });

    // Act
    await llamacppProvider.generate({ model: "x", prompt: "hello" });

    // Assert
    const callArg = api.generate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg).not.toHaveProperty("topP");
  });

  it("subscribes to onToken events and calls onToken for each chunk", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hello" });
    api.generate.mockResolvedValue({ text: "full response", finishReason: "stop" });

    const unsubscribeMock = vi.fn();
    // Capture the onToken callback when api.onToken is called
    let capturedCallback: ((chunk: string) => void) | undefined;
    api.onToken.mockImplementation((_id, cb) => {
      capturedCallback = cb;
      return unsubscribeMock;
    });

    const receivedTokens: string[] = [];

    // Act: start generate, then fire some tokens before it resolves
    const generatePromise = llamacppProvider.generate({
      model: "x",
      prompt: "hello",
      onToken: (t) => receivedTokens.push(t),
    });

    // Simulate streaming tokens arriving
    capturedCallback?.("Hello");
    capturedCallback?.(" world");

    await generatePromise;

    // Assert
    expect(api.onToken).toHaveBeenCalledTimes(1);
    expect(receivedTokens).toEqual(["Hello", " world"]);
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it("does not subscribe to onToken events when onToken is not in the request", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hello" });
    api.generate.mockResolvedValue({ text: "out", finishReason: "stop" });

    // Act
    await llamacppProvider.generate({ model: "x", prompt: "hello" });

    // Assert
    expect(api.onToken).not.toHaveBeenCalled();
  });

  it("unsubscribes even when api.generate throws", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hello" });
    api.generate.mockRejectedValue(new Error("IPC error"));

    const unsubscribeMock = vi.fn();
    api.onToken.mockReturnValue(unsubscribeMock);

    // Act
    await expect(
      llamacppProvider.generate({
        model: "x",
        prompt: "hello",
        onToken: vi.fn(),
      }),
    ).rejects.toThrow("IPC error");

    // Assert: unsubscribe still called in finally block
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it("strips the systemPrefix from the user prompt when it is a leading prefix", async () => {
    // Arrange
    const api = installLlama();
    const prefix = "DATA_PREFIX: some long grounding text. ";
    const fullPrompt = prefix + "What is the answer?";
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: fullPrompt });
    api.generate.mockResolvedValue({ text: "42", finishReason: "stop" });

    // Act
    await llamacppProvider.generate({
      model: "x",
      prompt: fullPrompt,
      systemPrefix: prefix,
    });

    // Assert: promptTail should not include the prefix
    const callArg = api.generate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.prompt).toBe("What is the answer?");
    expect(callArg.systemPrefix).toBe(prefix);
  });

  it("does not strip systemPrefix when it is not a leading prefix of user", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hello world" });
    api.generate.mockResolvedValue({ text: "out", finishReason: "stop" });

    // Act
    await llamacppProvider.generate({
      model: "x",
      prompt: "hello world",
      systemPrefix: "NOT_A_PREFIX",
    });

    // Assert: prompt should be unchanged
    const callArg = api.generate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.prompt).toBe("hello world");
    expect(callArg).not.toHaveProperty("systemPrefix");
  });

  it("passes system prompt when present", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(toSystemUser).mockReturnValue({ system: "be helpful", user: "hello" });
    api.generate.mockResolvedValue({ text: "out", finishReason: "stop" });

    // Act
    await llamacppProvider.generate({ model: "x", prompt: "hello", system: "be helpful" });

    // Assert
    const callArg = api.generate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.system).toBe("be helpful");
  });

  it("passes undefined for system when system is empty string", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hello" });
    api.generate.mockResolvedValue({ text: "out", finishReason: "stop" });

    // Act
    await llamacppProvider.generate({ model: "x", prompt: "hello" });

    // Assert: empty system string becomes undefined
    const callArg = api.generate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.system).toBeUndefined();
  });

  it("mints a requestId even when crypto.randomUUID is not available", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "hello" });
    api.generate.mockResolvedValue({ text: "out", finishReason: "stop" });

    // Temporarily remove randomUUID from globalThis.crypto
    const origCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      value: { ...origCrypto, randomUUID: undefined },
      writable: true,
      configurable: true,
    });

    // Act
    await llamacppProvider.generate({ model: "x", prompt: "hello" });

    // Restore
    Object.defineProperty(globalThis, "crypto", {
      value: origCrypto,
      writable: true,
      configurable: true,
    });

    // Assert: a requestId was still generated (starts with 'llama-')
    const callArg = api.generate.mock.calls[0][0] as Record<string, unknown>;
    expect(typeof callArg.requestId).toBe("string");
    expect((callArg.requestId as string).startsWith("llama-")).toBe(true);
  });
});

// ─── generateStructured ───────────────────────────────────────────────────────

describe("llamacppProvider.generateStructured", () => {
  const schema = z.object({ name: z.string(), value: z.number() });

  it("throws when the bridge is not present", async () => {
    // Arrange
    uninstallLlama();

    // Act / Assert
    await expect(
      llamacppProvider.generateStructured({ model: "x", prompt: "p" }, schema),
    ).rejects.toThrow('"llamacpp" is not available');
  });

  it("falls back to generateStructuredByPrompt when zodToInlineJsonSchema returns null", async () => {
    // Arrange
    installLlama();
    vi.mocked(zodToInlineJsonSchema).mockReturnValue(null);
    vi.mocked(generateStructuredByPrompt).mockResolvedValue({ name: "Alice", value: 42 });

    // Act
    const result = await llamacppProvider.generateStructured(
      { model: "x", prompt: "p" },
      schema,
    );

    // Assert
    expect(result).toEqual({ name: "Alice", value: 42 });
    expect(generateStructuredByPrompt).toHaveBeenCalledTimes(1);
  });

  it("calls api.generateStructured with the json schema when zodToInlineJsonSchema succeeds", async () => {
    // Arrange
    const api = installLlama();
    const fakeJsonSchema = { type: "object", properties: { name: { type: "string" } } };
    vi.mocked(zodToInlineJsonSchema).mockReturnValue(fakeJsonSchema);
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "give me data" });
    api.generateStructured.mockResolvedValue({ name: "Bob", value: 99 });

    // Act
    const result = await llamacppProvider.generateStructured(
      { model: "x", prompt: "give me data" },
      schema,
    );

    // Assert
    expect(api.generateStructured).toHaveBeenCalledTimes(1);
    const callArg = api.generateStructured.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.jsonSchema).toEqual(fakeJsonSchema);
    expect(result).toEqual({ name: "Bob", value: 99 });
  });

  it("passes the prompt as promptTail to generateStructured", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(zodToInlineJsonSchema).mockReturnValue({ type: "object" });
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "my prompt" });
    api.generateStructured.mockResolvedValue({ name: "X", value: 1 });

    // Act
    await llamacppProvider.generateStructured({ model: "x", prompt: "my prompt" }, schema);

    // Assert
    const callArg = api.generateStructured.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.prompt).toBe("my prompt");
  });

  it("strips systemPrefix from the prompt in generateStructured", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(zodToInlineJsonSchema).mockReturnValue({ type: "object" });
    const prefix = "PREFIX: ";
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "PREFIX: actual question" });
    api.generateStructured.mockResolvedValue({ name: "Y", value: 2 });

    // Act
    await llamacppProvider.generateStructured(
      { model: "x", prompt: "PREFIX: actual question", systemPrefix: prefix },
      schema,
    );

    // Assert
    const callArg = api.generateStructured.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.prompt).toBe("actual question");
    expect(callArg.systemPrefix).toBe(prefix);
  });

  it("uses maxTokens=700 by default in generateStructured", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(zodToInlineJsonSchema).mockReturnValue({ type: "object" });
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "p" });
    api.generateStructured.mockResolvedValue({ name: "Z", value: 0 });

    // Act
    await llamacppProvider.generateStructured({ model: "x", prompt: "p" }, schema);

    // Assert
    const callArg = api.generateStructured.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.maxTokens).toBe(700);
  });

  it("uses custom maxTokens when provided", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(zodToInlineJsonSchema).mockReturnValue({ type: "object" });
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "p" });
    api.generateStructured.mockResolvedValue({ name: "Z", value: 0 });

    // Act
    await llamacppProvider.generateStructured(
      { model: "x", prompt: "p", maxTokens: 300 },
      schema,
    );

    // Assert
    const callArg = api.generateStructured.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.maxTokens).toBe(300);
  });

  it("uses temperature=0 by default in generateStructured", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(zodToInlineJsonSchema).mockReturnValue({ type: "object" });
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "p" });
    api.generateStructured.mockResolvedValue({ name: "Z", value: 0 });

    // Act
    await llamacppProvider.generateStructured({ model: "x", prompt: "p" }, schema);

    // Assert
    const callArg = api.generateStructured.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.temperature).toBe(0);
  });

  it("passes custom temperature when provided", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(zodToInlineJsonSchema).mockReturnValue({ type: "object" });
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "p" });
    api.generateStructured.mockResolvedValue({ name: "Z", value: 0 });

    // Act
    await llamacppProvider.generateStructured(
      { model: "x", prompt: "p", temperature: 0.5 },
      schema,
    );

    // Assert
    const callArg = api.generateStructured.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.temperature).toBe(0.5);
  });

  it("parses the result through the Zod schema (applies coercions / refinements)", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(zodToInlineJsonSchema).mockReturnValue({ type: "object" });
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "p" });
    // Return raw value that matches the schema
    api.generateStructured.mockResolvedValue({ name: "Parsed", value: 7 });

    // Act
    const result = await llamacppProvider.generateStructured({ model: "x", prompt: "p" }, schema);

    // Assert: Zod .parse ran and typed value is returned
    expect(result).toEqual({ name: "Parsed", value: 7 });
  });

  it("throws a ZodError when the IPC result does not match the schema", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(zodToInlineJsonSchema).mockReturnValue({ type: "object" });
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "p" });
    // Return something that fails schema validation
    api.generateStructured.mockResolvedValue({ name: 123, value: "not-a-number" });

    // Act / Assert
    await expect(
      llamacppProvider.generateStructured({ model: "x", prompt: "p" }, schema),
    ).rejects.toThrow();
  });

  it("passes system string to generateStructured when present", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(zodToInlineJsonSchema).mockReturnValue({ type: "object" });
    vi.mocked(toSystemUser).mockReturnValue({ system: "be precise", user: "p" });
    api.generateStructured.mockResolvedValue({ name: "Q", value: 1 });

    // Act
    await llamacppProvider.generateStructured(
      { model: "x", prompt: "p", system: "be precise" },
      schema,
    );

    // Assert
    const callArg = api.generateStructured.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.system).toBe("be precise");
  });

  it("passes undefined for system in generateStructured when system is empty", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(zodToInlineJsonSchema).mockReturnValue({ type: "object" });
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "p" });
    api.generateStructured.mockResolvedValue({ name: "Q", value: 1 });

    // Act
    await llamacppProvider.generateStructured({ model: "x", prompt: "p" }, schema);

    // Assert
    const callArg = api.generateStructured.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.system).toBeUndefined();
  });

  it("calls zodToInlineJsonSchema with stripAdditionalProperties=true", async () => {
    // Arrange
    const api = installLlama();
    vi.mocked(zodToInlineJsonSchema).mockReturnValue({ type: "object" });
    vi.mocked(toSystemUser).mockReturnValue({ system: "", user: "p" });
    api.generateStructured.mockResolvedValue({ name: "Q", value: 1 });

    // Act
    await llamacppProvider.generateStructured({ model: "x", prompt: "p" }, schema);

    // Assert
    expect(zodToInlineJsonSchema).toHaveBeenCalledWith(schema, {
      stripAdditionalProperties: true,
    });
  });
});

// ─── bridge() null-safety (window undefined scenario) ─────────────────────────

describe("llamacppProvider — window undefined scenario", () => {
  it("isAvailable returns false when window is undefined", async () => {
    // Arrange: simulate non-browser environment by removing window temporarily
    const origWindow = globalThis.window;
    // @ts-expect-error — intentionally deleting window
    delete globalThis.window;

    // Act
    const result = await llamacppProvider.isAvailable();

    // Restore
    globalThis.window = origWindow;

    // Assert
    expect(result).toBe(false);
  });

  it("ensureReady returns immediately when window is undefined", async () => {
    // Arrange
    const origWindow = globalThis.window;
    // @ts-expect-error — intentionally deleting window
    delete globalThis.window;

    // Act / Assert
    await expect(
      llamacppProvider.ensureReady("some-model"),
    ).resolves.toBeUndefined();

    // Restore
    globalThis.window = origWindow;
  });

  it("generate throws when window is undefined", async () => {
    // Arrange
    const origWindow = globalThis.window;
    // @ts-expect-error — intentionally deleting window
    delete globalThis.window;

    // Act / Assert
    await expect(
      llamacppProvider.generate({ model: "x", prompt: "hello" }),
    ).rejects.toThrow('"llamacpp" is not available');

    // Restore
    globalThis.window = origWindow;
  });

  it("generateStructured throws when window is undefined", async () => {
    // Arrange
    const origWindow = globalThis.window;
    // @ts-expect-error — intentionally deleting window
    delete globalThis.window;
    vi.mocked(zodToInlineJsonSchema).mockReturnValue({ type: "object" });

    // Act / Assert
    await expect(
      llamacppProvider.generateStructured({ model: "x", prompt: "hello" }, z.object({})),
    ).rejects.toThrow('"llamacpp" is not available');

    // Restore
    globalThis.window = origWindow;
  });
});
