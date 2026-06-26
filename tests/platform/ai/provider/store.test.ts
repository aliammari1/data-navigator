import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock external dependencies ───────────────────────────────────────────────
// These are mocked so store.ts's own logic is the subject under test.

vi.mock("@/platform/storage", () => ({
  createDrizzleStorage: vi.fn(() => ({
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  })),
}));

// Mock registry functions so we can control availability / default provider
vi.mock("@/platform/ai/provider/registry", () => ({
  detectAvailability: vi.fn(),
  getProvider: vi.fn(),
  pickDefaultProvider: vi.fn(),
}));

// ─── Import the real store AFTER mocking ─────────────────────────────────────
import { useAIRuntimeStore } from "@/platform/ai/provider/store";
import { detectAvailability, getProvider, pickDefaultProvider } from "@/platform/ai/provider/registry";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProvider(overrides: Partial<{
  id: string;
  label: string;
  isAvailable: () => Promise<boolean>;
  listModels: () => Promise<{ id: string; label: string }[]>;
}> = {}) {
  return {
    id: "llamacpp",
    label: "llama.cpp",
    capabilities: { streaming: true, structuredNative: true, offline: true, requiresWebGPU: false },
    isAvailable: vi.fn().mockResolvedValue(true),
    listModels: vi.fn().mockResolvedValue([{ id: "model-a", label: "Model A" }]),
    ensureReady: vi.fn().mockResolvedValue(undefined),
    generate: vi.fn().mockResolvedValue({ text: "ok", model: "model-a", provider: "llamacpp" }),
    generateStructured: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

/** Reset the store to its initial state between tests. */
function resetStore() {
  useAIRuntimeStore.setState({
    providerId: null,
    model: null,
    progress: { status: "idle", progress: 0 },
    availability: [],
    detecting: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Initial state ────────────────────────────────────────────────────────────

describe("useAIRuntimeStore — initial state", () => {
  it("has null providerId by default", () => {
    expect(useAIRuntimeStore.getState().providerId).toBeNull();
  });

  it("has null model by default", () => {
    expect(useAIRuntimeStore.getState().model).toBeNull();
  });

  it("has idle progress by default", () => {
    expect(useAIRuntimeStore.getState().progress).toEqual({ status: "idle", progress: 0 });
  });

  it("has empty availability array by default", () => {
    expect(useAIRuntimeStore.getState().availability).toEqual([]);
  });

  it("has detecting: false by default", () => {
    expect(useAIRuntimeStore.getState().detecting).toBe(false);
  });
});

// ─── setProvider ─────────────────────────────────────────────────────────────

describe("useAIRuntimeStore.setProvider", () => {
  it("updates providerId", () => {
    useAIRuntimeStore.getState().setProvider("ollama");
    expect(useAIRuntimeStore.getState().providerId).toBe("ollama");
  });

  it("resets progress to idle when provider is changed", () => {
    // First set progress to non-idle
    useAIRuntimeStore.getState().setProgress({ status: "loading", progress: 50 });
    // Then switch provider
    useAIRuntimeStore.getState().setProvider("openai");
    expect(useAIRuntimeStore.getState().progress).toEqual({ status: "idle", progress: 0 });
  });

  it("accepts all valid provider ids", () => {
    const ids = ["llamacpp", "webllm", "transformers", "ollama", "openai"] as const;
    for (const id of ids) {
      useAIRuntimeStore.getState().setProvider(id);
      expect(useAIRuntimeStore.getState().providerId).toBe(id);
    }
  });
});

// ─── setModel ────────────────────────────────────────────────────────────────

describe("useAIRuntimeStore.setModel", () => {
  it("updates the model field", () => {
    useAIRuntimeStore.getState().setModel("my-model-v2");
    expect(useAIRuntimeStore.getState().model).toBe("my-model-v2");
  });

  it("can set model to any string", () => {
    useAIRuntimeStore.getState().setModel("gguf-quantized-q4");
    expect(useAIRuntimeStore.getState().model).toBe("gguf-quantized-q4");
  });
});

// ─── setProgress ─────────────────────────────────────────────────────────────

describe("useAIRuntimeStore.setProgress", () => {
  it("updates progress state", () => {
    useAIRuntimeStore.getState().setProgress({ status: "loading", progress: 42 });
    expect(useAIRuntimeStore.getState().progress).toEqual({ status: "loading", progress: 42 });
  });

  it("can set progress with a message", () => {
    useAIRuntimeStore.getState().setProgress({ status: "inferring", progress: 100, message: "generating..." });
    expect(useAIRuntimeStore.getState().progress).toEqual({ status: "inferring", progress: 100, message: "generating..." });
  });

  it("updates to ready status", () => {
    useAIRuntimeStore.getState().setProgress({ status: "ready", progress: 100 });
    expect(useAIRuntimeStore.getState().progress).toEqual({ status: "ready", progress: 100 });
  });

  it("updates to error status", () => {
    useAIRuntimeStore.getState().setProgress({ status: "error", progress: 0, message: "Failed" });
    expect(useAIRuntimeStore.getState().progress).toEqual({ status: "error", progress: 0, message: "Failed" });
  });
});

// ─── refreshAvailability ─────────────────────────────────────────────────────

describe("useAIRuntimeStore.refreshAvailability", () => {
  it("sets detecting: true at the start and false at the end (success path)", async () => {
    const availabilityResult = [{ id: "llamacpp" as const, label: "llama.cpp", available: true }];
    vi.mocked(detectAvailability).mockResolvedValue(availabilityResult);
    const provider = makeProvider({ id: "llamacpp" });
    vi.mocked(pickDefaultProvider).mockResolvedValue(provider as never);

    // Verify it starts as false (from reset)
    expect(useAIRuntimeStore.getState().detecting).toBe(false);

    const promise = useAIRuntimeStore.getState().refreshAvailability();
    // detecting should be true immediately after calling
    expect(useAIRuntimeStore.getState().detecting).toBe(true);

    await promise;
    expect(useAIRuntimeStore.getState().detecting).toBe(false);
  });

  it("sets availability from detectAvailability result", async () => {
    const availabilityResult = [
      { id: "llamacpp" as const, label: "llama.cpp", available: true },
      { id: "ollama" as const, label: "Ollama", available: false },
    ];
    vi.mocked(detectAvailability).mockResolvedValue(availabilityResult);
    const provider = makeProvider({ id: "llamacpp" });
    vi.mocked(pickDefaultProvider).mockResolvedValue(provider as never);

    await useAIRuntimeStore.getState().refreshAvailability();
    expect(useAIRuntimeStore.getState().availability).toEqual(availabilityResult);
  });

  it("auto-selects default provider when providerId is null", async () => {
    const availabilityResult = [{ id: "llamacpp" as const, label: "llama.cpp", available: true }];
    vi.mocked(detectAvailability).mockResolvedValue(availabilityResult);
    const provider = makeProvider({ id: "llamacpp" });
    vi.mocked(pickDefaultProvider).mockResolvedValue(provider as never);

    await useAIRuntimeStore.getState().refreshAvailability();

    expect(pickDefaultProvider).toHaveBeenCalledOnce();
    expect(useAIRuntimeStore.getState().providerId).toBe("llamacpp");
  });

  it("uses first model from listModels when model is null", async () => {
    const availabilityResult = [{ id: "llamacpp" as const, label: "llama.cpp", available: true }];
    vi.mocked(detectAvailability).mockResolvedValue(availabilityResult);
    const provider = makeProvider({
      id: "llamacpp",
      listModels: vi.fn().mockResolvedValue([
        { id: "first-model", label: "First Model" },
        { id: "second-model", label: "Second Model" },
      ]),
    });
    vi.mocked(pickDefaultProvider).mockResolvedValue(provider as never);

    await useAIRuntimeStore.getState().refreshAvailability();

    expect(useAIRuntimeStore.getState().model).toBe("first-model");
  });

  it("keeps existing model when model is already set (not null)", async () => {
    // Set an existing model in the store
    useAIRuntimeStore.setState({ model: "existing-model" });

    const availabilityResult = [{ id: "llamacpp" as const, label: "llama.cpp", available: true }];
    vi.mocked(detectAvailability).mockResolvedValue(availabilityResult);
    const provider = makeProvider({
      id: "llamacpp",
      listModels: vi.fn().mockResolvedValue([{ id: "list-model", label: "List Model" }]),
    });
    vi.mocked(pickDefaultProvider).mockResolvedValue(provider as never);

    await useAIRuntimeStore.getState().refreshAvailability();

    // Should keep existing model via `get().model ?? models[0]?.id ?? null`
    expect(useAIRuntimeStore.getState().model).toBe("existing-model");
  });

  it("sets model to null when listModels returns empty array and model is null", async () => {
    const availabilityResult = [{ id: "llamacpp" as const, label: "llama.cpp", available: true }];
    vi.mocked(detectAvailability).mockResolvedValue(availabilityResult);
    const provider = makeProvider({
      id: "llamacpp",
      listModels: vi.fn().mockResolvedValue([]),
    });
    vi.mocked(pickDefaultProvider).mockResolvedValue(provider as never);

    await useAIRuntimeStore.getState().refreshAvailability();

    // models[0]?.id ?? null → null when empty
    expect(useAIRuntimeStore.getState().model).toBeNull();
  });

  it("does NOT call pickDefaultProvider when providerId is already set", async () => {
    // Set a provider ID first
    useAIRuntimeStore.setState({ providerId: "ollama" });

    const availabilityResult = [{ id: "ollama" as const, label: "Ollama", available: true }];
    vi.mocked(detectAvailability).mockResolvedValue(availabilityResult);

    await useAIRuntimeStore.getState().refreshAvailability();

    expect(pickDefaultProvider).not.toHaveBeenCalled();
  });

  it("still sets detecting: false even when detectAvailability throws (finally block)", async () => {
    vi.mocked(detectAvailability).mockRejectedValue(new Error("network error"));

    await expect(useAIRuntimeStore.getState().refreshAvailability()).rejects.toThrow("network error");
    expect(useAIRuntimeStore.getState().detecting).toBe(false);
  });

  it("handles listModels failure by falling back to empty array (catch path)", async () => {
    const availabilityResult = [{ id: "llamacpp" as const, label: "llama.cpp", available: true }];
    vi.mocked(detectAvailability).mockResolvedValue(availabilityResult);
    const provider = makeProvider({
      id: "llamacpp",
      listModels: vi.fn().mockRejectedValue(new Error("cannot list models")),
    });
    vi.mocked(pickDefaultProvider).mockResolvedValue(provider as never);

    // Should NOT throw even when listModels fails
    await expect(useAIRuntimeStore.getState().refreshAvailability()).resolves.toBeUndefined();

    // Model should be null when listModels fails (empty catch → [])
    expect(useAIRuntimeStore.getState().model).toBeNull();
    // Provider ID should still be set
    expect(useAIRuntimeStore.getState().providerId).toBe("llamacpp");
  });
});

// ─── resolveProvider ─────────────────────────────────────────────────────────

describe("useAIRuntimeStore.resolveProvider", () => {
  it("returns the chosen provider when providerId is set and not 'transformers' and is available", async () => {
    useAIRuntimeStore.setState({ providerId: "llamacpp" });
    const provider = makeProvider({ id: "llamacpp" });
    vi.mocked(getProvider).mockReturnValue(provider as never);
    vi.mocked(provider.isAvailable).mockResolvedValue(true);

    const result = await useAIRuntimeStore.getState().resolveProvider();

    expect(getProvider).toHaveBeenCalledWith("llamacpp");
    expect(result).toBe(provider);
  });

  it("falls back to pickDefaultProvider when chosen provider is NOT available", async () => {
    useAIRuntimeStore.setState({ providerId: "ollama" });
    const chosenProvider = makeProvider({ id: "ollama" });
    vi.mocked(getProvider).mockReturnValue(chosenProvider as never);
    // isAvailable returns false → falls back
    vi.mocked(chosenProvider.isAvailable).mockResolvedValue(false);

    const defaultProvider = makeProvider({ id: "llamacpp" });
    vi.mocked(pickDefaultProvider).mockResolvedValue(defaultProvider as never);

    const result = await useAIRuntimeStore.getState().resolveProvider();

    expect(pickDefaultProvider).toHaveBeenCalledOnce();
    expect(result).toBe(defaultProvider);
    // updates providerId to the default
    expect(useAIRuntimeStore.getState().providerId).toBe("llamacpp");
  });

  it("falls back to pickDefaultProvider when isAvailable throws", async () => {
    useAIRuntimeStore.setState({ providerId: "openai" });
    const chosenProvider = makeProvider({ id: "openai" });
    vi.mocked(getProvider).mockReturnValue(chosenProvider as never);
    // isAvailable throws → catch(() => false) → falls back
    vi.mocked(chosenProvider.isAvailable).mockRejectedValue(new Error("timeout"));

    const defaultProvider = makeProvider({ id: "llamacpp" });
    vi.mocked(pickDefaultProvider).mockResolvedValue(defaultProvider as never);

    const result = await useAIRuntimeStore.getState().resolveProvider();

    expect(pickDefaultProvider).toHaveBeenCalledOnce();
    expect(result).toBe(defaultProvider);
  });

  it("always falls back to pickDefaultProvider when providerId is 'transformers'", async () => {
    useAIRuntimeStore.setState({ providerId: "transformers" });

    const defaultProvider = makeProvider({ id: "llamacpp" });
    vi.mocked(pickDefaultProvider).mockResolvedValue(defaultProvider as never);

    const result = await useAIRuntimeStore.getState().resolveProvider();

    // getProvider should NOT be called for 'transformers'
    expect(getProvider).not.toHaveBeenCalled();
    expect(pickDefaultProvider).toHaveBeenCalledOnce();
    expect(result).toBe(defaultProvider);
  });

  it("always falls back to pickDefaultProvider when providerId is null", async () => {
    // providerId is already null from reset
    const defaultProvider = makeProvider({ id: "llamacpp" });
    vi.mocked(pickDefaultProvider).mockResolvedValue(defaultProvider as never);

    const result = await useAIRuntimeStore.getState().resolveProvider();

    expect(getProvider).not.toHaveBeenCalled();
    expect(pickDefaultProvider).toHaveBeenCalledOnce();
    expect(result).toBe(defaultProvider);
    // updates providerId from null to the default
    expect(useAIRuntimeStore.getState().providerId).toBe("llamacpp");
  });

  it("sets providerId from the default provider when falling back (null case)", async () => {
    // providerId is null
    const defaultProvider = makeProvider({ id: "transformers" });
    vi.mocked(pickDefaultProvider).mockResolvedValue(defaultProvider as never);

    await useAIRuntimeStore.getState().resolveProvider();

    expect(useAIRuntimeStore.getState().providerId).toBe("transformers");
  });

  it("sets providerId from the default provider when falling back (unavailable case)", async () => {
    useAIRuntimeStore.setState({ providerId: "webllm" });
    const chosenProvider = makeProvider({ id: "webllm" });
    vi.mocked(getProvider).mockReturnValue(chosenProvider as never);
    vi.mocked(chosenProvider.isAvailable).mockResolvedValue(false);

    const defaultProvider = makeProvider({ id: "llamacpp" });
    vi.mocked(pickDefaultProvider).mockResolvedValue(defaultProvider as never);

    await useAIRuntimeStore.getState().resolveProvider();

    expect(useAIRuntimeStore.getState().providerId).toBe("llamacpp");
  });

  it("handles 'ollama' provider when available without falling back", async () => {
    useAIRuntimeStore.setState({ providerId: "ollama" });
    const provider = makeProvider({ id: "ollama" });
    vi.mocked(getProvider).mockReturnValue(provider as never);
    vi.mocked(provider.isAvailable).mockResolvedValue(true);

    const result = await useAIRuntimeStore.getState().resolveProvider();

    expect(pickDefaultProvider).not.toHaveBeenCalled();
    expect(result).toBe(provider);
  });

  it("handles 'webllm' provider when available without falling back", async () => {
    useAIRuntimeStore.setState({ providerId: "webllm" });
    const provider = makeProvider({ id: "webllm" });
    vi.mocked(getProvider).mockReturnValue(provider as never);
    vi.mocked(provider.isAvailable).mockResolvedValue(true);

    const result = await useAIRuntimeStore.getState().resolveProvider();

    expect(pickDefaultProvider).not.toHaveBeenCalled();
    expect(result).toBe(provider);
  });

  it("handles 'openai' provider when available without falling back", async () => {
    useAIRuntimeStore.setState({ providerId: "openai" });
    const provider = makeProvider({ id: "openai" });
    vi.mocked(getProvider).mockReturnValue(provider as never);
    vi.mocked(provider.isAvailable).mockResolvedValue(true);

    const result = await useAIRuntimeStore.getState().resolveProvider();

    expect(pickDefaultProvider).not.toHaveBeenCalled();
    expect(result).toBe(provider);
  });
});
