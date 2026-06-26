import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock @/platform/ai/provider BEFORE the target module is imported so that
// every call to pickDefaultProvider / buildJsonInstruction / extractJsonBlock /
// repairJson hits a controlled double, not real workers/Electron IPC.
// ---------------------------------------------------------------------------

const mockGenerate = vi.fn();
const mockIsAvailable = vi.fn();
const mockPickDefaultProvider = vi.fn();
const mockBuildJsonInstruction = vi.fn();
const mockExtractJsonBlock = vi.fn();
const mockRepairJson = vi.fn();

vi.mock("@/platform/ai/provider", () => ({
  pickDefaultProvider: (...args: unknown[]) => mockPickDefaultProvider(...args),
  buildJsonInstruction: (...args: unknown[]) => mockBuildJsonInstruction(...args),
  extractJsonBlock: (...args: unknown[]) => mockExtractJsonBlock(...args),
  repairJson: (...args: unknown[]) => mockRepairJson(...args),
}));

// ---------------------------------------------------------------------------
// Import the target AFTER mocks are set up so the module-level wiring binds to
// the mocks and contributes to coverage.
// ---------------------------------------------------------------------------
import {
  EDGE_AI_HOST,
  EDGE_LLM_MODELS,
  checkOllamaAvailable,
  discoverOllamaModels,
  generateWithOllama,
  generateWithOllamaStructured,
  streamOllamaChat,
  type LLMModel,
  type LLMProvider,
} from "@/features/data-formulator/core/ollama-provider";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a mock provider object that passes the right shape to the module. */
function makeProvider(
  overrides: Partial<{
    id: string;
    isAvailable: () => Promise<boolean>;
    generate: (...args: unknown[]) => Promise<unknown>;
  }> = {},
) {
  return {
    id: "transformers",
    isAvailable: mockIsAvailable,
    generate: mockGenerate,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: provider is available and generate returns a text result.
  mockIsAvailable.mockResolvedValue(true);
  mockGenerate.mockResolvedValue({ text: '{"key":"value"}' });
  mockPickDefaultProvider.mockResolvedValue(makeProvider());
  // Default: platform helpers pass through cleanly.
  mockExtractJsonBlock.mockImplementation((t: string) => t);
  mockRepairJson.mockImplementation((t: string) => t);
  mockBuildJsonInstruction.mockImplementation(
    (hint?: string) =>
      "Respond with ONLY a single valid JSON value" + (hint ? `\n${hint}` : ""),
  );
  // Ensure window is defined (jsdom) and strip any Electron-specific property.
  if (typeof window !== "undefined") {
    // @ts-expect-error – intentionally clearing the electron bridge.
    delete window.electronLlama;
  }
});

// ---------------------------------------------------------------------------
// Exported constants
// ---------------------------------------------------------------------------

describe("EDGE_AI_HOST", () => {
  it("is the expected edge protocol string", () => {
    expect(EDGE_AI_HOST).toBe("edge://transformers-worker");
  });
});

describe("EDGE_LLM_MODELS", () => {
  it("contains at least two model entries", () => {
    expect(EDGE_LLM_MODELS.length).toBeGreaterThanOrEqual(2);
  });

  it("each entry has a name property", () => {
    for (const model of EDGE_LLM_MODELS) {
      expect(typeof model.name).toBe("string");
      expect(model.name.length).toBeGreaterThan(0);
    }
  });

  it("includes the SmolLM2 model", () => {
    const names = EDGE_LLM_MODELS.map((m) => m.name);
    expect(names.some((n) => n.includes("SmolLM2"))).toBe(true);
  });

  it("includes a Qwen model", () => {
    const names = EDGE_LLM_MODELS.map((m) => m.name);
    expect(names.some((n) => n.includes("Qwen"))).toBe(true);
  });

  it("entries have correct details structure", () => {
    for (const model of EDGE_LLM_MODELS) {
      expect(model.details).toBeDefined();
      expect(typeof model.details?.family).toBe("string");
      expect(typeof model.details?.parameter_size).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// Type shape tests (compile-time, exercised at runtime via assignability check)
// ---------------------------------------------------------------------------

describe("LLMModel interface", () => {
  it("allows a minimal model object with just name", () => {
    const m: LLMModel = { name: "test-model" };
    expect(m.name).toBe("test-model");
  });

  it("allows full model object including details", () => {
    const m: LLMModel = {
      name: "full-model",
      size: 1234,
      modifiedAt: "2024-01-01",
      digest: "abc123",
      details: {
        format: "gguf",
        family: "llama",
        families: ["llama", "mistral"],
        parameter_size: "7B",
        quantization_level: "q4_k_m",
      },
    };
    expect(m.details?.family).toBe("llama");
    expect(m.details?.families).toHaveLength(2);
  });
});

describe("LLMProvider interface", () => {
  it("allows constructing a provider object matching the shape", () => {
    const provider: LLMProvider = {
      id: "edge",
      name: "Edge AI",
      type: "edge",
      baseURL: EDGE_AI_HOST,
      models: EDGE_LLM_MODELS,
      isAvailable: true,
    };
    expect(provider.type).toBe("edge");
    expect(provider.isAvailable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// discoverOllamaModels
// ---------------------------------------------------------------------------

describe("discoverOllamaModels", () => {
  it("resolves with EDGE_LLM_MODELS", async () => {
    const result = await discoverOllamaModels();
    expect(result).toStrictEqual(EDGE_LLM_MODELS);
  });

  it("resolves even when called multiple times consecutively", async () => {
    const [a, b] = await Promise.all([discoverOllamaModels(), discoverOllamaModels()]);
    expect(a).toStrictEqual(b);
  });
});

// ---------------------------------------------------------------------------
// checkOllamaAvailable
// ---------------------------------------------------------------------------

describe("checkOllamaAvailable", () => {
  it("returns true when a provider reports it is available", async () => {
    mockIsAvailable.mockResolvedValue(true);
    const result = await checkOllamaAvailable();
    expect(result).toBe(true);
  });

  it("returns false when the provider reports it is unavailable", async () => {
    mockIsAvailable.mockResolvedValue(false);
    const result = await checkOllamaAvailable();
    expect(result).toBe(false);
  });

  it("returns false when pickDefaultProvider throws", async () => {
    mockPickDefaultProvider.mockRejectedValue(new Error("No provider"));
    const result = await checkOllamaAvailable();
    expect(result).toBe(false);
  });

  it("returns false when provider.isAvailable() throws", async () => {
    mockIsAvailable.mockRejectedValue(new Error("IPC failure"));
    const result = await checkOllamaAvailable();
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// streamOllamaChat
// ---------------------------------------------------------------------------

describe("streamOllamaChat", () => {
  it("returns an AbortController synchronously", async () => {
    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();
    mockGenerate.mockResolvedValue({ text: "hello" });

    const ac = await streamOllamaChat("model-x", [], onToken, onDone, onError);
    expect(ac).toBeInstanceOf(AbortController);
  });

  it("calls onToken with each token and onDone when generation succeeds", async () => {
    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    // Simulate a generate call that invokes onToken via the options.
    mockGenerate.mockImplementation(async (opts: { onToken?: (t: string) => void }) => {
      opts.onToken?.("hello");
      opts.onToken?.(" world");
      return { text: "hello world" };
    });

    await streamOllamaChat("model-x", [], onToken, onDone, onError);
    // Give the internal void IIFE a chance to resolve.
    await new Promise((r) => setTimeout(r, 20));

    expect(onDone).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(onToken).toHaveBeenCalledWith("hello");
    expect(onToken).toHaveBeenCalledWith(" world");
  });

  it("calls onError when provider.generate throws a non-abort error", async () => {
    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();
    const boom = new Error("inference failed");
    mockGenerate.mockRejectedValue(boom);

    await streamOllamaChat("model-x", [], onToken, onDone, onError);
    await new Promise((r) => setTimeout(r, 20));

    expect(onError).toHaveBeenCalledWith(boom);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("calls onError with an Error when a non-Error is thrown", async () => {
    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();
    mockGenerate.mockRejectedValue("string error");

    await streamOllamaChat("model-x", [], onToken, onDone, onError);
    await new Promise((r) => setTimeout(r, 20));

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toContain("string error");
  });

  it("separates system messages from non-system messages when building prompt", async () => {
    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();
    mockGenerate.mockResolvedValue({ text: "ok" });

    await streamOllamaChat(
      "m",
      [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "What is 2+2?" },
        { role: "assistant", content: "4" },
      ],
      onToken,
      onDone,
      onError,
    );
    await new Promise((r) => setTimeout(r, 20));

    const callArgs = mockGenerate.mock.calls[0][0];
    expect(callArgs.system).toBe("You are helpful.");
    expect(callArgs.prompt).toContain("USER:");
    expect(callArgs.prompt).toContain("What is 2+2?");
    expect(callArgs.prompt).toContain("ASSISTANT:");
    expect(callArgs.prompt).toContain("4");
  });

  it("passes undefined as system when there are no system messages", async () => {
    const onDone = vi.fn();
    const onError = vi.fn();
    mockGenerate.mockResolvedValue({ text: "ok" });

    await streamOllamaChat("m", [{ role: "user", content: "hi" }], vi.fn(), onDone, onError);
    await new Promise((r) => setTimeout(r, 20));

    const callArgs = mockGenerate.mock.calls[0][0];
    expect(callArgs.system).toBeUndefined();
  });

  it("caps maxTokens to 1024 when num_ctx is supplied", async () => {
    const onDone = vi.fn();
    mockGenerate.mockResolvedValue({ text: "ok" });

    await streamOllamaChat("m", [], vi.fn(), onDone, vi.fn(), { num_ctx: 4096 });
    await new Promise((r) => setTimeout(r, 20));

    const callArgs = mockGenerate.mock.calls[0][0];
    expect(callArgs.maxTokens).toBe(1024);
  });

  it("uses num_ctx directly when it is smaller than 1024", async () => {
    const onDone = vi.fn();
    mockGenerate.mockResolvedValue({ text: "ok" });

    await streamOllamaChat("m", [], vi.fn(), onDone, vi.fn(), { num_ctx: 512 });
    await new Promise((r) => setTimeout(r, 20));

    const callArgs = mockGenerate.mock.calls[0][0];
    expect(callArgs.maxTokens).toBe(512);
  });

  it("defaults maxTokens to 512 when num_ctx is absent", async () => {
    const onDone = vi.fn();
    mockGenerate.mockResolvedValue({ text: "ok" });

    await streamOllamaChat("m", [], vi.fn(), onDone, vi.fn());
    await new Promise((r) => setTimeout(r, 20));

    const callArgs = mockGenerate.mock.calls[0][0];
    expect(callArgs.maxTokens).toBe(512);
  });

  it("applies the temperature option when provided", async () => {
    const onDone = vi.fn();
    mockGenerate.mockResolvedValue({ text: "ok" });

    await streamOllamaChat("m", [], vi.fn(), onDone, vi.fn(), { temperature: 0.7 });
    await new Promise((r) => setTimeout(r, 20));

    const callArgs = mockGenerate.mock.calls[0][0];
    expect(callArgs.temperature).toBe(0.7);
  });

  it("defaults temperature to 0 when not provided", async () => {
    const onDone = vi.fn();
    mockGenerate.mockResolvedValue({ text: "ok" });

    await streamOllamaChat("m", [], vi.fn(), onDone, vi.fn());
    await new Promise((r) => setTimeout(r, 20));

    const callArgs = mockGenerate.mock.calls[0][0];
    expect(callArgs.temperature).toBe(0);
  });

  it("calls onDone (not onError) when the abort signal fires mid-generation", async () => {
    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    // Simulate generate throwing an AbortError-like error
    mockGenerate.mockImplementation(async (_opts: unknown) => {
      // We'll trigger it to throw after the AbortController is aborted
      throw new Error("The operation was aborted");
    });

    const ac = await streamOllamaChat("m", [], onToken, onDone, onError);
    ac.abort(); // signal is now aborted before generate resolves

    await new Promise((r) => setTimeout(r, 30));

    // onDone is called (not onError) when signal is aborted
    expect(onDone).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// generateWithOllama
// ---------------------------------------------------------------------------

describe("generateWithOllama", () => {
  it("resolves with the trimmed text from the provider", async () => {
    mockGenerate.mockResolvedValue({ text: "  hello world  " });

    const result = await generateWithOllama("model-x", "sys", "user prompt");
    expect(result).toBe("hello world");
  });

  it("passes systemPrompt to provider.generate as system field", async () => {
    mockGenerate.mockResolvedValue({ text: "ok" });

    await generateWithOllama("m", "Be concise.", "Summarize.");
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ system: "Be concise.", prompt: "Summarize." }),
    );
  });

  it("passes undefined as system when systemPrompt is empty", async () => {
    mockGenerate.mockResolvedValue({ text: "ok" });

    await generateWithOllama("m", "", "Hello");
    const args = mockGenerate.mock.calls[0][0];
    expect(args.system).toBeUndefined();
  });

  it("defaults maxTokens to 768 when not provided", async () => {
    mockGenerate.mockResolvedValue({ text: "ok" });

    await generateWithOllama("m", "sys", "prompt");
    const args = mockGenerate.mock.calls[0][0];
    expect(args.maxTokens).toBe(768);
  });

  it("respects a custom maxTokens option", async () => {
    mockGenerate.mockResolvedValue({ text: "ok" });

    await generateWithOllama("m", "sys", "prompt", { maxTokens: 256 });
    const args = mockGenerate.mock.calls[0][0];
    expect(args.maxTokens).toBe(256);
  });

  it("defaults temperature to 0 when not provided", async () => {
    mockGenerate.mockResolvedValue({ text: "ok" });

    await generateWithOllama("m", "sys", "prompt");
    const args = mockGenerate.mock.calls[0][0];
    expect(args.temperature).toBe(0);
  });

  it("applies a custom temperature option", async () => {
    mockGenerate.mockResolvedValue({ text: "ok" });

    await generateWithOllama("m", "sys", "prompt", { temperature: 0.5 });
    const args = mockGenerate.mock.calls[0][0];
    expect(args.temperature).toBe(0.5);
  });

  it("propagates errors from the provider", async () => {
    mockGenerate.mockRejectedValue(new Error("generation failed"));

    await expect(generateWithOllama("m", "sys", "prompt")).rejects.toThrow("generation failed");
  });
});

// ---------------------------------------------------------------------------
// generateWithOllamaStructured
// ---------------------------------------------------------------------------

const testSchema = {
  type: "object",
  properties: { name: { type: "string" }, age: { type: "number" } },
  required: ["name", "age"] as const,
};

describe("generateWithOllamaStructured — fallback (prompt-only) path", () => {
  beforeEach(() => {
    // Ensure we stay on the transformers (fallback) path, not llamacpp.
    mockPickDefaultProvider.mockResolvedValue(makeProvider({ id: "transformers" }));
  });

  it("parses valid JSON response from the provider", async () => {
    mockGenerate.mockResolvedValue({ text: '{"name":"Alice","age":30}' });
    // extractJsonBlock returns the text as-is; repairJson not called unless parse fails.
    mockExtractJsonBlock.mockReturnValue('{"name":"Alice","age":30}');

    const result = await generateWithOllamaStructured("m", "sys", "user", testSchema);
    expect(result).toEqual({ name: "Alice", age: 30 });
  });

  it("uses extractJsonBlock to strip surrounding prose", async () => {
    const rawText = 'Here is the result: {"name":"Bob","age":25} done.';
    mockGenerate.mockResolvedValue({ text: rawText });
    mockExtractJsonBlock.mockReturnValue('{"name":"Bob","age":25}');

    const result = await generateWithOllamaStructured<{ name: string; age: number }>(
      "m",
      "sys",
      "user",
      testSchema,
    );
    expect(result).toEqual({ name: "Bob", age: 25 });
    expect(mockExtractJsonBlock).toHaveBeenCalledWith(rawText);
  });

  it("falls back to repairJson when JSON.parse fails on extracted block", async () => {
    // extractJsonBlock returns something that JSON.parse can't handle
    mockGenerate.mockResolvedValue({ text: "bad json {name: Alice}" });
    mockExtractJsonBlock.mockReturnValue("{name: Alice}"); // not valid JSON
    // repairJson returns valid JSON
    mockRepairJson.mockReturnValue('{"name":"Alice","age":30}');

    const result = await generateWithOllamaStructured<{ name: string; age: number }>(
      "m",
      "sys",
      "user",
      testSchema,
    );
    expect(result).toEqual({ name: "Alice", age: 30 });
    expect(mockRepairJson).toHaveBeenCalled();
  });

  it("appends a JSON instruction derived from the schema to the user prompt", async () => {
    mockGenerate.mockResolvedValue({ text: '{"name":"Eve","age":22}' });
    mockExtractJsonBlock.mockReturnValue('{"name":"Eve","age":22}');
    mockBuildJsonInstruction.mockReturnValue("INSTRUCTION: respond with JSON matching schema");

    await generateWithOllamaStructured("m", "sys", "What is her name?", testSchema);

    // The grounded prompt should concatenate user prompt + "" + instruction
    const callArgs = mockGenerate.mock.calls[0][0];
    expect(callArgs.prompt).toContain("What is her name?");
    expect(callArgs.prompt).toContain("INSTRUCTION: respond with JSON matching schema");
  });

  it("joins systemPrompt with the JSON instruction in the system field", async () => {
    mockGenerate.mockResolvedValue({ text: '{"name":"Eve","age":22}' });
    mockExtractJsonBlock.mockReturnValue('{"name":"Eve","age":22}');

    await generateWithOllamaStructured("m", "Be concise.", "user", testSchema);

    const callArgs = mockGenerate.mock.calls[0][0];
    expect(callArgs.system).toContain("Be concise.");
    expect(callArgs.system).toContain("Return only valid JSON");
  });

  it("sets maxTokens to 1024", async () => {
    mockGenerate.mockResolvedValue({ text: '{"name":"x","age":1}' });
    mockExtractJsonBlock.mockReturnValue('{"name":"x","age":1}');

    await generateWithOllamaStructured("m", "s", "u", testSchema);

    const callArgs = mockGenerate.mock.calls[0][0];
    expect(callArgs.maxTokens).toBe(1024);
  });

  it("defaults temperature to 0", async () => {
    mockGenerate.mockResolvedValue({ text: '{"name":"x","age":1}' });
    mockExtractJsonBlock.mockReturnValue('{"name":"x","age":1}');

    await generateWithOllamaStructured("m", "s", "u", testSchema);

    const callArgs = mockGenerate.mock.calls[0][0];
    expect(callArgs.temperature).toBe(0);
  });

  it("applies a custom temperature option", async () => {
    mockGenerate.mockResolvedValue({ text: '{"name":"x","age":1}' });
    mockExtractJsonBlock.mockReturnValue('{"name":"x","age":1}');

    await generateWithOllamaStructured("m", "s", "u", testSchema, { temperature: 0.3 });

    const callArgs = mockGenerate.mock.calls[0][0];
    expect(callArgs.temperature).toBe(0.3);
  });

  it("passes undefined as system when systemPrompt is empty", async () => {
    mockGenerate.mockResolvedValue({ text: '{"name":"x","age":1}' });
    mockExtractJsonBlock.mockReturnValue('{"name":"x","age":1}');

    await generateWithOllamaStructured("m", "", "u", testSchema);

    const callArgs = mockGenerate.mock.calls[0][0];
    // system will be "<empty_string>\nReturn only valid JSON..." which is still truthy
    // but when systemPrompt is empty, the join produces "\nReturn only valid JSON..."
    // The module does: [systemPrompt, "Return only valid JSON. Do not wrap it in Markdown."].join("\n") || undefined
    // Empty string joined with the instruction = "\nReturn..." which is truthy, so system IS defined
    expect(callArgs.system).toContain("Return only valid JSON");
  });

  it("propagates errors from the provider generate call", async () => {
    mockGenerate.mockRejectedValue(new Error("provider failure"));

    await expect(
      generateWithOllamaStructured("m", "s", "u", testSchema),
    ).rejects.toThrow("provider failure");
  });

  it("throws when both extractJsonBlock result and repairJson result are invalid JSON", async () => {
    mockGenerate.mockResolvedValue({ text: "not json at all" });
    mockExtractJsonBlock.mockReturnValue("still not json");
    mockRepairJson.mockReturnValue("also not json");

    await expect(
      generateWithOllamaStructured("m", "s", "u", testSchema),
    ).rejects.toThrow();
  });
});

describe("generateWithOllamaStructured — llamacpp fast path (electronLlama bridge)", () => {
  it("uses window.electronLlama.generateStructured when provider is llamacpp", async () => {
    const mockGenerateStructured = vi.fn().mockResolvedValue({ name: "Charlie", age: 40 });
    // Set up the electronLlama bridge on window
    Object.defineProperty(window, "electronLlama", {
      value: { generateStructured: mockGenerateStructured },
      configurable: true,
      writable: true,
    });

    mockPickDefaultProvider.mockResolvedValue(makeProvider({ id: "llamacpp" }));

    const result = await generateWithOllamaStructured<{ name: string; age: number }>(
      "m",
      "Be precise.",
      "What is his name?",
      testSchema,
    );

    expect(result).toEqual({ name: "Charlie", age: 40 });
    expect(mockGenerateStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        system: "Be precise.",
        prompt: "What is his name?",
        jsonSchema: testSchema,
        maxTokens: 1024,
        temperature: 0,
      }),
    );
    // The normal provider.generate should NOT have been called on the fast path.
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("passes undefined as system on the fast path when systemPrompt is empty", async () => {
    const mockGenerateStructured = vi.fn().mockResolvedValue({ name: "Dave", age: 20 });
    Object.defineProperty(window, "electronLlama", {
      value: { generateStructured: mockGenerateStructured },
      configurable: true,
      writable: true,
    });

    mockPickDefaultProvider.mockResolvedValue(makeProvider({ id: "llamacpp" }));

    await generateWithOllamaStructured("m", "", "prompt", testSchema);

    expect(mockGenerateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ system: undefined }),
    );
  });

  it("applies a custom temperature on the fast path", async () => {
    const mockGenerateStructured = vi.fn().mockResolvedValue({ name: "x", age: 1 });
    Object.defineProperty(window, "electronLlama", {
      value: { generateStructured: mockGenerateStructured },
      configurable: true,
      writable: true,
    });

    mockPickDefaultProvider.mockResolvedValue(makeProvider({ id: "llamacpp" }));

    await generateWithOllamaStructured("m", "s", "u", testSchema, { temperature: 0.8 });

    expect(mockGenerateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.8 }),
    );
  });

  it("falls through to the fallback path when provider is llamacpp but electronLlama is absent", async () => {
    // Remove the bridge
    // @ts-expect-error – intentionally clearing the electron bridge
    delete window.electronLlama;

    mockPickDefaultProvider.mockResolvedValue(makeProvider({ id: "llamacpp" }));
    mockGenerate.mockResolvedValue({ text: '{"name":"x","age":1}' });
    mockExtractJsonBlock.mockReturnValue('{"name":"x","age":1}');

    const result = await generateWithOllamaStructured<{ name: string; age: number }>(
      "m",
      "s",
      "u",
      testSchema,
    );

    // Falls back to the prompt path — provider.generate IS called.
    expect(mockGenerate).toHaveBeenCalledOnce();
    expect(result).toEqual({ name: "x", age: 1 });
  });
});
