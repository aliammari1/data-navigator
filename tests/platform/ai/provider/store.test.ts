import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import {
  detectAvailability,
  getProvider,
  pickDefaultProvider,
} from "@/platform/ai/provider/registry";
import { useAIRuntimeStore } from "@/platform/ai/provider/store";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProvider(
  overrides: Partial<{
    id: string;
    label: string;
    isAvailable: () => Promise<boolean>;
    listModels: () => Promise<{ id: string; label: string }[]>;
  }> = {},
) {
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
    useAIRuntimeStore.getState().setProvider("llamacpp");
    expect(useAIRuntimeStore.getState().providerId).toBe("llamacpp");
  });

  it("resets progress to idle when provider is changed", () => {
    useAIRuntimeStore.getState().setProgress({ status: "loading", progress: 50 });
    useAIRuntimeStore.getState().setProvider("llamacpp");
    expect(useAIRuntimeStore.getState().progress).toEqual({ status: "idle", progress: 0 });
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
    useAIRuntimeStore
      .getState()
      .setProgress({ status: "inferring", progress: 100, message: "generating..." });
    expect(useAIRuntimeStore.getState().progress).toEqual({
      status: "inferring",
      progress: 100,
      message: "generating...",
    });
  });

  it("updates to ready status", () => {
    useAIRuntimeStore.getState().setProgress({ status: "ready", progress: 100 });
    expect(useAIRuntimeStore.getState().progress).toEqual({ status: "ready", progress: 100 });
  });

  it("updates to error status", () => {
    useAIRuntimeStore.getState().setProgress({ status: "error", progress: 0, message: "Failed" });
    expect(useAIRuntimeStore.getState().progress).toEqual({
      status: "error",
      progress: 0,
      message: "Failed",
    });
  });
});

// ─── refreshAvailability ─────────────────────────────────────────────────────

describe("useAIRuntimeStore.refreshAvailability", () => {
  it("sets detecting: true at the start and false at the end (success path)", async () => {
    const availabilityResult = [{ id: "llamacpp" as const, label: "llama.cpp", available: true }];
    vi.mocked(detectAvailability).mockResolvedValue(availabilityResult);
    const provider = makeProvider({ id: "llamacpp" });
    vi.mocked(pickDefaultProvider).mockResolvedValue(provider as never);

    expect(useAIRuntimeStore.getState().detecting).toBe(false);

    const promise = useAIRuntimeStore.getState().refreshAvailability();
    expect(useAIRuntimeStore.getState().detecting).toBe(true);

    await promise;
    expect(useAIRuntimeStore.getState().detecting).toBe(false);
  });

  it("sets availability from detectAvailability result", async () => {
    const availabilityResult = [{ id: "llamacpp" as const, label: "llama.cpp", available: true }];
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

    expect(useAIRuntimeStore.getState().model).toBeNull();
  });

  it("does NOT call pickDefaultProvider when providerId is already set", async () => {
    useAIRuntimeStore.setState({ providerId: "llamacpp" });

    const availabilityResult = [{ id: "llamacpp" as const, label: "llama.cpp", available: true }];
    vi.mocked(detectAvailability).mockResolvedValue(availabilityResult);

    await useAIRuntimeStore.getState().refreshAvailability();

    expect(pickDefaultProvider).not.toHaveBeenCalled();
  });

  it("still sets detecting: false even when detectAvailability throws (finally block)", async () => {
    vi.mocked(detectAvailability).mockRejectedValue(new Error("network error"));

    await expect(useAIRuntimeStore.getState().refreshAvailability()).rejects.toThrow(
      "network error",
    );
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

    await expect(useAIRuntimeStore.getState().refreshAvailability()).resolves.toBeUndefined();

    expect(useAIRuntimeStore.getState().model).toBeNull();
    expect(useAIRuntimeStore.getState().providerId).toBe("llamacpp");
  });
});

// ─── resolveProvider ─────────────────────────────────────────────────────────

describe("useAIRuntimeStore.resolveProvider", () => {
  it("returns the chosen provider when providerId is set and available", async () => {
    useAIRuntimeStore.setState({ providerId: "llamacpp" });
    const provider = makeProvider({ id: "llamacpp" });
    vi.mocked(getProvider).mockReturnValue(provider as never);
    vi.mocked(provider.isAvailable).mockResolvedValue(true);

    const result = await useAIRuntimeStore.getState().resolveProvider();

    expect(getProvider).toHaveBeenCalledWith("llamacpp");
    expect(result).toBe(provider);
    expect(pickDefaultProvider).not.toHaveBeenCalled();
  });

  it("falls back to pickDefaultProvider when the chosen provider is NOT available", async () => {
    useAIRuntimeStore.setState({ providerId: "llamacpp" });
    const chosenProvider = makeProvider({ id: "llamacpp" });
    vi.mocked(getProvider).mockReturnValue(chosenProvider as never);
    vi.mocked(chosenProvider.isAvailable).mockResolvedValue(false);

    const defaultProvider = makeProvider({ id: "llamacpp" });
    vi.mocked(pickDefaultProvider).mockResolvedValue(defaultProvider as never);

    const result = await useAIRuntimeStore.getState().resolveProvider();

    expect(pickDefaultProvider).toHaveBeenCalledOnce();
    expect(result).toBe(defaultProvider);
    expect(useAIRuntimeStore.getState().providerId).toBe("llamacpp");
  });

  it("falls back to pickDefaultProvider when isAvailable throws", async () => {
    useAIRuntimeStore.setState({ providerId: "llamacpp" });
    const chosenProvider = makeProvider({ id: "llamacpp" });
    vi.mocked(getProvider).mockReturnValue(chosenProvider as never);
    vi.mocked(chosenProvider.isAvailable).mockRejectedValue(new Error("timeout"));

    const defaultProvider = makeProvider({ id: "llamacpp" });
    vi.mocked(pickDefaultProvider).mockResolvedValue(defaultProvider as never);

    const result = await useAIRuntimeStore.getState().resolveProvider();

    expect(pickDefaultProvider).toHaveBeenCalledOnce();
    expect(result).toBe(defaultProvider);
  });

  it("falls back to pickDefaultProvider when providerId is a stale value getProvider no longer recognizes", async () => {
    // Simulates a value persisted before a provider was removed (e.g. the old
    // "transformers"/"ollama"/"openai" lanes) — getProvider() throws for it.
    useAIRuntimeStore.setState({ providerId: "stale-provider" as never });
    vi.mocked(getProvider).mockImplementation(() => {
      throw new Error("Unknown AI provider: stale-provider");
    });

    const defaultProvider = makeProvider({ id: "llamacpp" });
    vi.mocked(pickDefaultProvider).mockResolvedValue(defaultProvider as never);

    const result = await useAIRuntimeStore.getState().resolveProvider();

    expect(pickDefaultProvider).toHaveBeenCalledOnce();
    expect(result).toBe(defaultProvider);
    expect(useAIRuntimeStore.getState().providerId).toBe("llamacpp");
  });

  it("always falls back to pickDefaultProvider when providerId is null", async () => {
    const defaultProvider = makeProvider({ id: "llamacpp" });
    vi.mocked(pickDefaultProvider).mockResolvedValue(defaultProvider as never);

    const result = await useAIRuntimeStore.getState().resolveProvider();

    expect(getProvider).not.toHaveBeenCalled();
    expect(pickDefaultProvider).toHaveBeenCalledOnce();
    expect(result).toBe(defaultProvider);
    expect(useAIRuntimeStore.getState().providerId).toBe("llamacpp");
  });
});
