/**
 * Tests for src/features/agent-canvas/core/ai-bridge.ts
 *
 * Mocked boundaries:
 *   - @/platform/ai/provider  (pickDefaultProvider + useAIRuntimeStore)
 *
 * The target module's own logic runs real so it counts toward coverage.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// ── Mock @/platform/ai/provider ────────────────────────────────────────────

const mockProvider = {
  id: "llamacpp" as const,
  label: "LlamaCPP",
  capabilities: {
    streaming: true,
    structuredNative: true,
    offline: true,
    requiresWebGPU: false,
  },
  isAvailable: vi.fn<() => Promise<boolean>>(),
  listModels: vi.fn<() => Promise<{ id: string; label: string }[]>>(),
  ensureReady: vi.fn<(model: string, onProgress?: (p: unknown) => void) => Promise<void>>(),
  generate: vi.fn<(req: unknown) => Promise<{ text: string; model: string; provider: string }>>(),
  generateStructured: vi.fn<(req: unknown, schema: unknown) => Promise<unknown>>(),
};

const mockSetProgress = vi.fn();
const mockSetModel = vi.fn();

const mockStoreState = {
  model: null as string | null,
  providerId: null as string | null,
  setProgress: mockSetProgress,
  setModel: mockSetModel,
};

const mockPickDefaultProvider = vi.fn<(prefer?: string) => Promise<typeof mockProvider>>();

vi.mock("@/platform/ai/provider", () => ({
  pickDefaultProvider: (prefer?: string) => mockPickDefaultProvider(prefer),
  useAIRuntimeStore: {
    getState: () => mockStoreState,
  },
}));

// ── Import target AFTER mocks ──────────────────────────────────────────────
import {
  aiChat,
  aiReady,
  aiReadySync,
  aiStructured,
  resetAI,
  warmAI,
} from "@/features/agent-canvas/core/ai-bridge";

// ── Helpers ────────────────────────────────────────────────────────────────

function setupProvider(
  opts: {
    model?: string;
    providerId?: string;
    modelList?: { id: string; label: string }[];
    generateText?: string;
    structuredResult?: unknown;
    isAvailable?: boolean;
  } = {},
) {
  const {
    model = "test-model-id",
    modelList = [{ id: "test-model-id", label: "Test Model" }],
    generateText = "hello world",
    structuredResult = { answer: 42 },
    isAvailable = true,
  } = opts;

  mockStoreState.model = model;
  mockStoreState.providerId = opts.providerId ?? null;

  mockPickDefaultProvider.mockResolvedValue(mockProvider);
  mockProvider.isAvailable.mockResolvedValue(isAvailable);
  mockProvider.listModels.mockResolvedValue(modelList);
  mockProvider.ensureReady.mockResolvedValue(undefined);
  mockProvider.generate.mockResolvedValue({
    text: `  ${generateText}  `,
    model,
    provider: "llamacpp",
  });
  mockProvider.generateStructured.mockResolvedValue(structuredResult);
}

beforeEach(() => {
  // Reset the module-level cached state in ai-bridge
  resetAI();
  vi.clearAllMocks();
  mockStoreState.model = null;
  mockStoreState.providerId = null;
});

// ── resetAI ────────────────────────────────────────────────────────────────

describe("resetAI", () => {
  it("clears the resolved cache so the next call re-resolves", async () => {
    setupProvider({ model: "m1" });
    await warmAI("m1");
    // After warm, aiReadySync should be true
    expect(aiReadySync()).toBe(true);

    resetAI();

    // After reset, the cache is cleared
    expect(aiReadySync()).toBe(false);
  });

  it("is idempotent — calling it multiple times does not throw", () => {
    expect(() => {
      resetAI();
      resetAI();
      resetAI();
    }).not.toThrow();
  });
});

// ── aiReadySync ────────────────────────────────────────────────────────────

describe("aiReadySync", () => {
  it("returns false before any model is warmed", () => {
    expect(aiReadySync()).toBe(false);
  });

  it("returns true once the provider is warmed (model matches store)", async () => {
    setupProvider({ model: "my-model" });
    await warmAI("my-model");
    expect(aiReadySync()).toBe(true);
  });

  it("returns false when the store model differs from the cached model", async () => {
    setupProvider({ model: "model-a" });
    await warmAI("model-a");
    // Now point the store at a different model
    mockStoreState.model = "model-b";
    expect(aiReadySync()).toBe(false);
  });

  it("returns true when store model is null (no preference — cached is fine)", async () => {
    setupProvider({ model: "any-model" });
    await warmAI("any-model");
    mockStoreState.model = null;
    expect(aiReadySync()).toBe(true);
  });
});

// ── warmAI ────────────────────────────────────────────────────────────────

describe("warmAI", () => {
  it("resolves the provider and warms the requested model", async () => {
    setupProvider({ model: "chosen-model" });
    await warmAI("chosen-model");

    expect(mockProvider.ensureReady).toHaveBeenCalledWith("chosen-model", expect.any(Function));
  });

  it("calls setModel on the store when a modelId is provided", async () => {
    setupProvider({ model: "explicit-model" });
    await warmAI("explicit-model");
    expect(mockSetModel).toHaveBeenCalledWith("explicit-model");
  });

  it("does NOT call setModel when no modelId is passed", async () => {
    setupProvider({ model: "default-model" });
    await warmAI();
    expect(mockSetModel).not.toHaveBeenCalled();
  });

  it("re-resolves the provider on every warmAI call (clears cache first)", async () => {
    setupProvider({ model: "first-model" });
    await warmAI("first-model");
    const firstCallCount = mockPickDefaultProvider.mock.calls.length;

    setupProvider({ model: "second-model" });
    await warmAI("second-model");

    expect(mockPickDefaultProvider.mock.calls.length).toBeGreaterThan(firstCallCount);
  });

  it("passes the progress callback to ensureReady", async () => {
    setupProvider({ model: "m" });
    await warmAI("m");

    const [, onProgress] = mockProvider.ensureReady.mock.calls[0]!;
    // Calling the callback should route to useAIRuntimeStore.getState().setProgress
    onProgress?.({ status: "loading", progress: 50 });
    expect(mockSetProgress).toHaveBeenCalledWith({ status: "loading", progress: 50 });
  });

  it("uses the first model from listModels when store model is null", async () => {
    mockStoreState.model = null;
    mockPickDefaultProvider.mockResolvedValue(mockProvider);
    mockProvider.isAvailable.mockResolvedValue(true);
    mockProvider.listModels.mockResolvedValue([{ id: "auto-detected-model", label: "Auto" }]);
    mockProvider.ensureReady.mockResolvedValue(undefined);

    await warmAI();

    expect(mockProvider.ensureReady).toHaveBeenCalledWith(
      "auto-detected-model",
      expect.any(Function),
    );
  });

  it("throws when no model is available and listModels returns empty", async () => {
    mockStoreState.model = null;
    mockPickDefaultProvider.mockResolvedValue(mockProvider);
    mockProvider.listModels.mockResolvedValue([]);
    mockProvider.ensureReady.mockResolvedValue(undefined);

    await expect(warmAI()).rejects.toThrow(/No model available for provider/);
  });

  it("throws when listModels rejects and store model is null", async () => {
    mockStoreState.model = null;
    mockPickDefaultProvider.mockResolvedValue(mockProvider);
    mockProvider.listModels.mockRejectedValue(new Error("network error"));
    mockProvider.ensureReady.mockResolvedValue(undefined);

    // listModels failure is caught (.catch(() => [])), then model = undefined => throws
    await expect(warmAI()).rejects.toThrow(/No model available for provider/);
  });
});

// ── aiReady ───────────────────────────────────────────────────────────────

describe("aiReady", () => {
  it("returns true when already cached and store model matches", async () => {
    setupProvider({ model: "ready-model" });
    await warmAI("ready-model");

    const result = await aiReady();
    expect(result).toBe(true);
    // No new pickDefaultProvider call needed because cache hit returns early
  });

  it("returns true when no model preference and cache exists", async () => {
    setupProvider({ model: "any" });
    await warmAI("any");
    mockStoreState.model = null;

    const result = await aiReady();
    expect(result).toBe(true);
  });

  it("probes the provider when not yet cached", async () => {
    mockStoreState.model = null;
    mockStoreState.providerId = null;
    mockPickDefaultProvider.mockResolvedValue(mockProvider);
    mockProvider.isAvailable.mockResolvedValue(true);

    const result = await aiReady();
    expect(result).toBe(true);
    expect(mockProvider.isAvailable).toHaveBeenCalled();
  });

  it("returns false when provider.isAvailable returns false", async () => {
    mockStoreState.model = null;
    mockPickDefaultProvider.mockResolvedValue(mockProvider);
    mockProvider.isAvailable.mockResolvedValue(false);

    const result = await aiReady();
    expect(result).toBe(false);
  });

  it("returns false when provider.isAvailable throws", async () => {
    mockStoreState.model = null;
    mockPickDefaultProvider.mockResolvedValue(mockProvider);
    mockProvider.isAvailable.mockRejectedValue(new Error("gpu offline"));

    const result = await aiReady();
    expect(result).toBe(false);
  });

  it("returns false when pickDefaultProvider itself throws", async () => {
    mockStoreState.model = null;
    mockPickDefaultProvider.mockRejectedValue(new Error("no provider"));

    const result = await aiReady();
    expect(result).toBe(false);
  });

  it("uses the providerId from the store when probing", async () => {
    mockStoreState.model = null;
    mockStoreState.providerId = "llamacpp";
    mockPickDefaultProvider.mockResolvedValue(mockProvider);
    mockProvider.isAvailable.mockResolvedValue(true);

    await aiReady();
    expect(mockPickDefaultProvider).toHaveBeenCalledWith("llamacpp");
  });

  it("re-probes when store model differs from the cached model", async () => {
    setupProvider({ model: "v1" });
    await warmAI("v1");

    // Change preferred model
    mockStoreState.model = "v2";
    mockPickDefaultProvider.mockResolvedValue(mockProvider);
    mockProvider.isAvailable.mockResolvedValue(true);

    const callsBefore = mockPickDefaultProvider.mock.calls.length;
    const result = await aiReady();
    expect(result).toBe(true);
    // A new pickDefaultProvider call was made for the probe
    expect(mockPickDefaultProvider.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});

// ── aiChat ────────────────────────────────────────────────────────────────

describe("aiChat", () => {
  it("returns the trimmed text from generate()", async () => {
    setupProvider({ model: "chat-model", generateText: "  hello  " });
    await warmAI("chat-model");

    const result = await aiChat("system prompt", "user prompt");
    expect(result).toBe("hello");
  });

  it("passes system and user to provider.generate()", async () => {
    setupProvider({ model: "chat-model", generateText: "ok" });
    await warmAI("chat-model");

    await aiChat("sys", "usr");
    expect(mockProvider.generate).toHaveBeenCalledWith(
      expect.objectContaining({ system: "sys", prompt: "usr" }),
    );
  });

  it("passes model id to provider.generate()", async () => {
    setupProvider({ model: "precise-model", generateText: "answer" });
    await warmAI("precise-model");

    await aiChat("s", "u");
    expect(mockProvider.generate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "precise-model" }),
    );
  });

  it("uses default maxTokens=512 when not specified", async () => {
    setupProvider({ model: "m", generateText: "t" });
    await warmAI("m");

    await aiChat("s", "u");
    expect(mockProvider.generate).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: 512 }));
  });

  it("uses default temperature=0 when not specified", async () => {
    setupProvider({ model: "m", generateText: "t" });
    await warmAI("m");

    await aiChat("s", "u");
    expect(mockProvider.generate).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0 }));
  });

  it("passes caller-specified maxTokens", async () => {
    setupProvider({ model: "m", generateText: "t" });
    await warmAI("m");

    await aiChat("s", "u", { maxTokens: 256 });
    expect(mockProvider.generate).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: 256 }));
  });

  it("passes caller-specified temperature", async () => {
    setupProvider({ model: "m", generateText: "t" });
    await warmAI("m");

    await aiChat("s", "u", { temperature: 0.7 });
    expect(mockProvider.generate).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.7 }),
    );
  });

  it("passes AbortSignal through to generate()", async () => {
    setupProvider({ model: "m", generateText: "t" });
    await warmAI("m");

    const controller = new AbortController();
    await aiChat("s", "u", { signal: controller.signal });
    expect(mockProvider.generate).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("passes onToken callback through to generate()", async () => {
    setupProvider({ model: "m", generateText: "t" });
    await warmAI("m");

    const onToken = vi.fn();
    await aiChat("s", "u", { onToken });
    expect(mockProvider.generate).toHaveBeenCalledWith(expect.objectContaining({ onToken }));
  });

  it("resolves provider lazily when not yet warmed", async () => {
    setupProvider({ model: "lazy-model", generateText: "lazy result" });

    const result = await aiChat("s", "u");
    expect(result).toBe("lazy result");
    expect(mockProvider.ensureReady).toHaveBeenCalled();
  });
});

// ── aiStructured ──────────────────────────────────────────────────────────

describe("aiStructured", () => {
  const schema = z.object({ answer: z.number() });

  it("returns the structured result from generateStructured()", async () => {
    setupProvider({ model: "struct-model", structuredResult: { answer: 99 } });
    await warmAI("struct-model");

    const result = await aiStructured("sys", "usr", schema);
    expect(result).toEqual({ answer: 99 });
  });

  it("passes system and user to generateStructured()", async () => {
    setupProvider({ model: "m", structuredResult: { answer: 1 } });
    await warmAI("m");

    await aiStructured("the-system", "the-user", schema);
    expect(mockProvider.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ system: "the-system", prompt: "the-user" }),
      schema,
    );
  });

  it("passes the schema as the second argument to generateStructured()", async () => {
    setupProvider({ model: "m", structuredResult: { answer: 0 } });
    await warmAI("m");

    await aiStructured("s", "u", schema);
    const [, passedSchema] = mockProvider.generateStructured.mock.calls[0]!;
    expect(passedSchema).toBe(schema);
  });

  it("uses default maxTokens=1024 when not specified", async () => {
    setupProvider({ model: "m", structuredResult: { answer: 0 } });
    await warmAI("m");

    await aiStructured("s", "u", schema);
    expect(mockProvider.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 1024 }),
      schema,
    );
  });

  it("passes caller-specified maxTokens", async () => {
    setupProvider({ model: "m", structuredResult: { answer: 0 } });
    await warmAI("m");

    await aiStructured("s", "u", schema, { maxTokens: 2048 });
    expect(mockProvider.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 2048 }),
      schema,
    );
  });

  it("passes AbortSignal through to generateStructured()", async () => {
    setupProvider({ model: "m", structuredResult: { answer: 0 } });
    await warmAI("m");

    const controller = new AbortController();
    await aiStructured("s", "u", schema, { signal: controller.signal });
    expect(mockProvider.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
      schema,
    );
  });

  it("resolves provider lazily when not yet warmed", async () => {
    setupProvider({ model: "lazy-struct-model", structuredResult: { answer: 7 } });

    const result = await aiStructured("s", "u", schema);
    expect(result).toEqual({ answer: 7 });
    expect(mockProvider.ensureReady).toHaveBeenCalled();
  });
});

// ── concurrent ensureResolved deduplication ───────────────────────────────

describe("concurrent warmAI / aiChat calls (deduplication)", () => {
  it("concurrent calls share the same in-flight warm promise (ensureReady called once)", async () => {
    mockStoreState.model = "concurrent-model";
    mockPickDefaultProvider.mockResolvedValue(mockProvider);
    mockProvider.listModels.mockResolvedValue([{ id: "concurrent-model", label: "C" }]);
    // Slow ensureReady to make concurrent overlap possible
    let resolveEnsure!: () => void;
    mockProvider.ensureReady.mockReturnValue(
      new Promise<void>((r) => {
        resolveEnsure = r;
      }),
    );
    mockProvider.generate.mockResolvedValue({
      text: "result",
      model: "concurrent-model",
      provider: "llamacpp",
    });

    const p1 = aiChat("s", "u");
    const p2 = aiChat("s", "u");

    resolveEnsure();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe("result");
    expect(r2).toBe("result");
    // ensureReady is called only once even though two callers raced
    expect(mockProvider.ensureReady).toHaveBeenCalledTimes(1);
  });
});

// ── cache re-use ──────────────────────────────────────────────────────────

describe("resolved cache re-use", () => {
  it("does not re-warm when the same model is already cached", async () => {
    setupProvider({ model: "cached-model" });
    await warmAI("cached-model");
    const callCount = mockProvider.ensureReady.mock.calls.length;

    // Second call with the same model in the store
    await aiChat("s", "u");
    // ensureReady should NOT have been called again
    expect(mockProvider.ensureReady.mock.calls.length).toBe(callCount);
  });

  it("re-warms when the requested model changes", async () => {
    setupProvider({ model: "model-v1" });
    await warmAI("model-v1");

    setupProvider({ model: "model-v2" });
    await warmAI("model-v2");

    // ensureReady called for both models
    const models = mockProvider.ensureReady.mock.calls.map((c) => c[0]);
    expect(models).toContain("model-v1");
    expect(models).toContain("model-v2");
  });
});
