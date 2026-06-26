import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { z } from "zod";

// ─── Mock the Zustand store so we control every piece of state/actions ─────────
// The target (use-ai.ts) must stay REAL for coverage to count.

vi.mock("@/platform/ai/provider/store", () => ({
  useAIRuntimeStore: vi.fn(),
}));

// ─── Import target AFTER mocks ─────────────────────────────────────────────────
import { useAI } from "@/platform/ai/provider/use-ai";
import { useAIRuntimeStore } from "@/platform/ai/provider/store";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal fake AIProvider. */
function makeProvider(overrides: Partial<{
  id: string;
  listModels: () => Promise<{ id: string }[]>;
  ensureReady: (...args: unknown[]) => Promise<void>;
  generate: (...args: unknown[]) => Promise<{ text: string; model: string; provider: string; finishReason?: string; elapsedMs?: number }>;
  generateStructured: (...args: unknown[]) => Promise<unknown>;
}> = {}) {
  return {
    id: "llamacpp",
    label: "llama.cpp",
    capabilities: { streaming: true, structuredNative: true, offline: true, requiresWebGPU: false },
    isAvailable: vi.fn().mockResolvedValue(true),
    listModels: vi.fn().mockResolvedValue([{ id: "model-a" }, { id: "model-b" }]),
    ensureReady: vi.fn().mockResolvedValue(undefined),
    generate: vi.fn().mockResolvedValue({
      text: "hello",
      model: "model-a",
      provider: "llamacpp",
      finishReason: "stop",
      elapsedMs: 50,
    }),
    generateStructured: vi.fn().mockResolvedValue({ result: "ok" }),
    ...overrides,
  };
}

/** Build the default store return value. */
function makeStoreState(overrides: Partial<{
  providerId: string | null;
  model: string | null;
  progress: { status: string; progress: number };
  availability: { id: string; label: string; available: boolean }[];
  detecting: boolean;
  setProvider: (id: string) => void;
  setModel: (model: string) => void;
  setProgress: (p: { status: string; progress: number }) => void;
  refreshAvailability: () => Promise<void>;
  resolveProvider: () => Promise<ReturnType<typeof makeProvider>>;
}> = {}) {
  const provider = makeProvider();
  return {
    providerId: "llamacpp" as string | null,
    model: "model-a" as string | null,
    progress: { status: "idle", progress: 0 },
    availability: [{ id: "llamacpp", label: "llama.cpp", available: true }],
    detecting: false,
    setProvider: vi.fn(),
    setModel: vi.fn(),
    setProgress: vi.fn(),
    refreshAvailability: vi.fn().mockResolvedValue(undefined),
    resolveProvider: vi.fn().mockResolvedValue(provider),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Return value shape ────────────────────────────────────────────────────────

describe("useAI return value shape", () => {
  it("returns all expected fields", () => {
    // Arrange
    const state = makeStoreState();
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());

    // Assert
    expect(result.current).toHaveProperty("providerId");
    expect(result.current).toHaveProperty("model");
    expect(result.current).toHaveProperty("progress");
    expect(result.current).toHaveProperty("availability");
    expect(result.current).toHaveProperty("detecting");
    expect(result.current).toHaveProperty("setProvider");
    expect(result.current).toHaveProperty("setModel");
    expect(result.current).toHaveProperty("refreshAvailability");
    expect(result.current).toHaveProperty("ensureReady");
    expect(result.current).toHaveProperty("generate");
    expect(result.current).toHaveProperty("generateStructured");
  });

  it("forwards providerId from the store", () => {
    // Arrange
    const state = makeStoreState({ providerId: "ollama" });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());

    // Assert
    expect(result.current.providerId).toBe("ollama");
  });

  it("forwards model from the store", () => {
    // Arrange
    const state = makeStoreState({ model: "my-model" });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());

    // Assert
    expect(result.current.model).toBe("my-model");
  });

  it("forwards progress from the store", () => {
    // Arrange
    const progress = { status: "loading", progress: 42 };
    const state = makeStoreState({ progress });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());

    // Assert
    expect(result.current.progress).toEqual(progress);
  });

  it("forwards availability from the store", () => {
    // Arrange
    const availability = [{ id: "llamacpp", label: "llama.cpp", available: true }];
    const state = makeStoreState({ availability });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());

    // Assert
    expect(result.current.availability).toEqual(availability);
  });

  it("forwards detecting from the store", () => {
    // Arrange
    const state = makeStoreState({ detecting: true });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());

    // Assert
    expect(result.current.detecting).toBe(true);
  });

  it("forwards setProvider from the store", () => {
    // Arrange
    const setProvider = vi.fn();
    const state = makeStoreState({ setProvider });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());

    // Assert
    expect(result.current.setProvider).toBe(setProvider);
  });

  it("forwards setModel from the store", () => {
    // Arrange
    const setModel = vi.fn();
    const state = makeStoreState({ setModel });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());

    // Assert
    expect(result.current.setModel).toBe(setModel);
  });

  it("forwards refreshAvailability from the store", () => {
    // Arrange
    const refreshAvailability = vi.fn().mockResolvedValue(undefined);
    const state = makeStoreState({ refreshAvailability });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());

    // Assert
    expect(result.current.refreshAvailability).toBe(refreshAvailability);
  });
});

// ─── useEffect: refreshAvailability on mount ───────────────────────────────────

describe("useAI useEffect — refreshAvailability on mount", () => {
  it("calls refreshAvailability when availability is empty and not detecting", async () => {
    // Arrange
    const refreshAvailability = vi.fn().mockResolvedValue(undefined);
    const state = makeStoreState({ availability: [], detecting: false, refreshAvailability });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    renderHook(() => useAI());

    // Assert — useEffect fires after render
    await waitFor(() => {
      expect(refreshAvailability).toHaveBeenCalledOnce();
    });
  });

  it("does NOT call refreshAvailability when availability is non-empty", async () => {
    // Arrange
    const refreshAvailability = vi.fn().mockResolvedValue(undefined);
    const state = makeStoreState({
      availability: [{ id: "llamacpp", label: "llama.cpp", available: true }],
      detecting: false,
      refreshAvailability,
    });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    renderHook(() => useAI());

    // Wait a tick for any potential useEffect
    await new Promise((r) => setTimeout(r, 10));

    // Assert
    expect(refreshAvailability).not.toHaveBeenCalled();
  });

  it("does NOT call refreshAvailability when already detecting", async () => {
    // Arrange
    const refreshAvailability = vi.fn().mockResolvedValue(undefined);
    const state = makeStoreState({ availability: [], detecting: true, refreshAvailability });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    renderHook(() => useAI());

    // Wait a tick
    await new Promise((r) => setTimeout(r, 10));

    // Assert
    expect(refreshAvailability).not.toHaveBeenCalled();
  });
});

// ─── ensureReady ──────────────────────────────────────────────────────────────

describe("useAI.ensureReady", () => {
  it("resolves the provider and returns { provider, model } using the store model", async () => {
    // Arrange
    const provider = makeProvider({ id: "llamacpp" });
    const state = makeStoreState({ model: "store-model", resolveProvider: vi.fn().mockResolvedValue(provider) });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());
    let outcome: { provider: unknown; model: string } | undefined;
    await act(async () => {
      outcome = await result.current.ensureReady();
    });

    // Assert
    expect(outcome?.model).toBe("store-model");
    expect(outcome?.provider).toBe(provider);
  });

  it("uses the overrideModel argument when provided", async () => {
    // Arrange
    const provider = makeProvider();
    const state = makeStoreState({ model: "store-model", resolveProvider: vi.fn().mockResolvedValue(provider) });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());
    let outcome: { provider: unknown; model: string } | undefined;
    await act(async () => {
      outcome = await result.current.ensureReady("override-model");
    });

    // Assert — override takes precedence over store model
    expect(outcome?.model).toBe("override-model");
  });

  it("falls back to first model from listModels when store model is null and no override", async () => {
    // Arrange
    const provider = makeProvider({
      listModels: vi.fn().mockResolvedValue([{ id: "first-from-list" }, { id: "second" }]),
    });
    const state = makeStoreState({ model: null, resolveProvider: vi.fn().mockResolvedValue(provider) });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());
    let outcome: { provider: unknown; model: string } | undefined;
    await act(async () => {
      outcome = await result.current.ensureReady();
    });

    // Assert
    expect(outcome?.model).toBe("first-from-list");
  });

  it("throws when no model can be determined (listModels returns empty array)", async () => {
    // Arrange
    const provider = makeProvider({
      listModels: vi.fn().mockResolvedValue([]),
    });
    const state = makeStoreState({ model: null, resolveProvider: vi.fn().mockResolvedValue(provider) });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());
    let thrownError: unknown;
    await act(async () => {
      try {
        await result.current.ensureReady();
      } catch (e) {
        thrownError = e;
      }
    });

    // Assert
    expect(thrownError).toBeInstanceOf(Error);
    expect((thrownError as Error).message).toMatch(/No model available/);
  });

  it("includes the provider id in the error message when no model available", async () => {
    // Arrange
    const provider = makeProvider({ id: "ollama", listModels: vi.fn().mockResolvedValue([]) });
    const state = makeStoreState({ model: null, resolveProvider: vi.fn().mockResolvedValue(provider) });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());
    let thrownError: unknown;
    await act(async () => {
      try {
        await result.current.ensureReady();
      } catch (e) {
        thrownError = e;
      }
    });

    // Assert
    expect((thrownError as Error).message).toContain("ollama");
  });

  it("calls provider.ensureReady with the resolved model", async () => {
    // Arrange
    const ensureReady = vi.fn().mockResolvedValue(undefined);
    const provider = makeProvider({ ensureReady });
    const state = makeStoreState({ model: "chosen-model", resolveProvider: vi.fn().mockResolvedValue(provider) });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());
    await act(async () => {
      await result.current.ensureReady();
    });

    // Assert
    expect(ensureReady).toHaveBeenCalledWith("chosen-model", state.setProgress, undefined);
  });

  it("passes the AbortSignal through to provider.ensureReady", async () => {
    // Arrange
    const ensureReady = vi.fn().mockResolvedValue(undefined);
    const provider = makeProvider({ ensureReady });
    const state = makeStoreState({ model: "m", resolveProvider: vi.fn().mockResolvedValue(provider) });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);
    const controller = new AbortController();

    // Act
    const { result } = renderHook(() => useAI());
    await act(async () => {
      await result.current.ensureReady(undefined, controller.signal);
    });

    // Assert
    expect(ensureReady).toHaveBeenCalledWith("m", state.setProgress, controller.signal);
  });
});

// ─── generate ─────────────────────────────────────────────────────────────────

describe("useAI.generate", () => {
  it("returns the result from provider.generate", async () => {
    // Arrange
    const expectedResult = { text: "gen output", model: "model-a", provider: "llamacpp", finishReason: "stop", elapsedMs: 10 };
    const provider = makeProvider({ generate: vi.fn().mockResolvedValue(expectedResult) });
    const state = makeStoreState({ model: "model-a", resolveProvider: vi.fn().mockResolvedValue(provider) });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());
    let generated: unknown;
    await act(async () => {
      generated = await result.current.generate({ prompt: "test" });
    });

    // Assert
    expect(generated).toEqual(expectedResult);
  });

  it("sets progress to 'inferring' before calling provider.generate", async () => {
    // Arrange
    const setProgress = vi.fn();
    const calls: { status: string; progress: number }[] = [];
    setProgress.mockImplementation((p: { status: string; progress: number }) => calls.push(p));

    const provider = makeProvider({ generate: vi.fn().mockResolvedValue({ text: "ok", model: "m", provider: "llamacpp" }) });
    const state = makeStoreState({ model: "m", setProgress, resolveProvider: vi.fn().mockResolvedValue(provider) });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());
    await act(async () => {
      await result.current.generate({ prompt: "hi" });
    });

    // Assert — first setProgress call is 'inferring'
    const inferring = calls.find((c) => c.status === "inferring");
    expect(inferring).toBeDefined();
    expect(inferring?.progress).toBe(100);
  });

  it("sets progress to 'ready' in the finally block even when provider.generate succeeds", async () => {
    // Arrange
    const setProgress = vi.fn();
    const calls: { status: string; progress: number }[] = [];
    setProgress.mockImplementation((p: { status: string; progress: number }) => calls.push(p));

    const provider = makeProvider({ generate: vi.fn().mockResolvedValue({ text: "ok", model: "m", provider: "llamacpp" }) });
    const state = makeStoreState({ model: "m", setProgress, resolveProvider: vi.fn().mockResolvedValue(provider) });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());
    await act(async () => {
      await result.current.generate({ prompt: "hi" });
    });

    // Assert — last setProgress call is 'ready'
    const lastCall = calls[calls.length - 1];
    expect(lastCall.status).toBe("ready");
    expect(lastCall.progress).toBe(100);
  });

  it("sets progress to 'ready' in the finally block even when provider.generate throws", async () => {
    // Arrange
    const setProgress = vi.fn();
    const calls: { status: string; progress: number }[] = [];
    setProgress.mockImplementation((p: { status: string; progress: number }) => calls.push(p));

    const provider = makeProvider({ generate: vi.fn().mockRejectedValue(new Error("generate failed")) });
    const state = makeStoreState({ model: "m", setProgress, resolveProvider: vi.fn().mockResolvedValue(provider) });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());
    let thrownError: unknown;
    await act(async () => {
      try {
        await result.current.generate({ prompt: "hi" });
      } catch (e) {
        thrownError = e;
      }
    });

    // Assert — error propagated AND finally ran
    expect(thrownError).toBeInstanceOf(Error);
    const readyCall = calls.find((c) => c.status === "ready");
    expect(readyCall).toBeDefined();
  });

  it("passes merged request with resolved model to provider.generate", async () => {
    // Arrange
    const generateFn = vi.fn().mockResolvedValue({ text: "ok", model: "m", provider: "llamacpp" });
    const provider = makeProvider({ generate: generateFn });
    const state = makeStoreState({ model: "store-model", resolveProvider: vi.fn().mockResolvedValue(provider) });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());
    await act(async () => {
      await result.current.generate({ prompt: "test prompt", system: "be helpful" });
    });

    // Assert
    const callArg = generateFn.mock.calls[0][0];
    expect(callArg.prompt).toBe("test prompt");
    expect(callArg.system).toBe("be helpful");
    expect(callArg.model).toBe("store-model");
  });

  it("overrides the model in the request when req.model is provided", async () => {
    // Arrange
    const generateFn = vi.fn().mockResolvedValue({ text: "ok", model: "custom", provider: "llamacpp" });
    const provider = makeProvider({ generate: generateFn });
    const state = makeStoreState({ model: "store-model", resolveProvider: vi.fn().mockResolvedValue(provider) });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());
    await act(async () => {
      await result.current.generate({ prompt: "hi", model: "custom" });
    });

    // Assert
    expect(generateFn.mock.calls[0][0].model).toBe("custom");
  });

  it("passes the AbortSignal from the request to ensureReady", async () => {
    // Arrange
    const ensureReady = vi.fn().mockResolvedValue(undefined);
    const provider = makeProvider({ ensureReady });
    const state = makeStoreState({ model: "m", resolveProvider: vi.fn().mockResolvedValue(provider) });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);
    const controller = new AbortController();

    // Act
    const { result } = renderHook(() => useAI());
    await act(async () => {
      await result.current.generate({ prompt: "hi", signal: controller.signal });
    });

    // Assert — signal passed through to ensureReady
    expect(ensureReady).toHaveBeenCalledWith("m", state.setProgress, controller.signal);
  });
});

// ─── generateStructured ───────────────────────────────────────────────────────

describe("useAI.generateStructured", () => {
  const PersonSchema = z.object({ name: z.string(), age: z.number() });

  it("returns the structured result from provider.generateStructured", async () => {
    // Arrange
    const expectedResult = { name: "Alice", age: 30 };
    const provider = makeProvider({
      generateStructured: vi.fn().mockResolvedValue(expectedResult),
    });
    const state = makeStoreState({ model: "model-a", resolveProvider: vi.fn().mockResolvedValue(provider) });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());
    let structured: unknown;
    await act(async () => {
      structured = await result.current.generateStructured({ prompt: "get person" }, PersonSchema);
    });

    // Assert
    expect(structured).toEqual(expectedResult);
  });

  it("sets progress to 'inferring' before calling provider.generateStructured", async () => {
    // Arrange
    const setProgress = vi.fn();
    const calls: { status: string; progress: number }[] = [];
    setProgress.mockImplementation((p: { status: string; progress: number }) => calls.push(p));

    const provider = makeProvider({ generateStructured: vi.fn().mockResolvedValue({ name: "Bob", age: 25 }) });
    const state = makeStoreState({ model: "m", setProgress, resolveProvider: vi.fn().mockResolvedValue(provider) });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());
    await act(async () => {
      await result.current.generateStructured({ prompt: "hi" }, PersonSchema);
    });

    // Assert
    const inferring = calls.find((c) => c.status === "inferring");
    expect(inferring).toBeDefined();
    expect(inferring?.progress).toBe(100);
  });

  it("sets progress to 'ready' in the finally block after success", async () => {
    // Arrange
    const setProgress = vi.fn();
    const calls: { status: string; progress: number }[] = [];
    setProgress.mockImplementation((p: { status: string; progress: number }) => calls.push(p));

    const provider = makeProvider({ generateStructured: vi.fn().mockResolvedValue({ name: "Bob", age: 25 }) });
    const state = makeStoreState({ model: "m", setProgress, resolveProvider: vi.fn().mockResolvedValue(provider) });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());
    await act(async () => {
      await result.current.generateStructured({ prompt: "hi" }, PersonSchema);
    });

    // Assert
    const lastCall = calls[calls.length - 1];
    expect(lastCall.status).toBe("ready");
    expect(lastCall.progress).toBe(100);
  });

  it("sets progress to 'ready' in the finally block even when provider.generateStructured throws", async () => {
    // Arrange
    const setProgress = vi.fn();
    const calls: { status: string; progress: number }[] = [];
    setProgress.mockImplementation((p: { status: string; progress: number }) => calls.push(p));

    const provider = makeProvider({ generateStructured: vi.fn().mockRejectedValue(new Error("structured failed")) });
    const state = makeStoreState({ model: "m", setProgress, resolveProvider: vi.fn().mockResolvedValue(provider) });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());
    let thrownError: unknown;
    await act(async () => {
      try {
        await result.current.generateStructured({ prompt: "hi" }, PersonSchema);
      } catch (e) {
        thrownError = e;
      }
    });

    // Assert
    expect(thrownError).toBeInstanceOf(Error);
    const readyCall = calls.find((c) => c.status === "ready");
    expect(readyCall).toBeDefined();
  });

  it("passes merged request with resolved model to provider.generateStructured", async () => {
    // Arrange
    const generateStructuredFn = vi.fn().mockResolvedValue({ name: "Carol", age: 20 });
    const provider = makeProvider({ generateStructured: generateStructuredFn });
    const state = makeStoreState({ model: "store-model", resolveProvider: vi.fn().mockResolvedValue(provider) });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());
    await act(async () => {
      await result.current.generateStructured({ prompt: "get carol", system: "be precise" }, PersonSchema);
    });

    // Assert
    const callArg = generateStructuredFn.mock.calls[0][0];
    expect(callArg.prompt).toBe("get carol");
    expect(callArg.system).toBe("be precise");
    expect(callArg.model).toBe("store-model");
  });

  it("passes the Zod schema to provider.generateStructured", async () => {
    // Arrange
    const generateStructuredFn = vi.fn().mockResolvedValue({ name: "Dave", age: 40 });
    const provider = makeProvider({ generateStructured: generateStructuredFn });
    const state = makeStoreState({ model: "m", resolveProvider: vi.fn().mockResolvedValue(provider) });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());
    await act(async () => {
      await result.current.generateStructured({ prompt: "get" }, PersonSchema);
    });

    // Assert — second argument is the schema
    expect(generateStructuredFn.mock.calls[0][1]).toBe(PersonSchema);
  });

  it("overrides the model from req.model when provided to generateStructured", async () => {
    // Arrange
    const generateStructuredFn = vi.fn().mockResolvedValue({ name: "Eve", age: 28 });
    const provider = makeProvider({ generateStructured: generateStructuredFn });
    const state = makeStoreState({ model: "store-model", resolveProvider: vi.fn().mockResolvedValue(provider) });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());
    await act(async () => {
      await result.current.generateStructured({ prompt: "get", model: "override-model" }, PersonSchema);
    });

    // Assert
    expect(generateStructuredFn.mock.calls[0][0].model).toBe("override-model");
  });

  it("passes the AbortSignal from the request to ensureReady for generateStructured", async () => {
    // Arrange
    const ensureReady = vi.fn().mockResolvedValue(undefined);
    const provider = makeProvider({ ensureReady, generateStructured: vi.fn().mockResolvedValue({ name: "F", age: 1 }) });
    const state = makeStoreState({ model: "m", resolveProvider: vi.fn().mockResolvedValue(provider) });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);
    const controller = new AbortController();

    // Act
    const { result } = renderHook(() => useAI());
    await act(async () => {
      await result.current.generateStructured({ prompt: "hi", signal: controller.signal }, PersonSchema);
    });

    // Assert
    expect(ensureReady).toHaveBeenCalledWith("m", state.setProgress, controller.signal);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("useAI edge cases", () => {
  it("throws from generate when ensureReady throws (no model error)", async () => {
    // Arrange
    const provider = makeProvider({ listModels: vi.fn().mockResolvedValue([]) });
    const state = makeStoreState({ model: null, resolveProvider: vi.fn().mockResolvedValue(provider) });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result } = renderHook(() => useAI());
    let thrownError: unknown;
    await act(async () => {
      try {
        await result.current.generate({ prompt: "hi" });
      } catch (e) {
        thrownError = e;
      }
    });

    // Assert
    expect(thrownError).toBeInstanceOf(Error);
    expect((thrownError as Error).message).toMatch(/No model available/);
  });

  it("throws from generateStructured when ensureReady throws (no model error)", async () => {
    // Arrange
    const provider = makeProvider({ listModels: vi.fn().mockResolvedValue([]) });
    const state = makeStoreState({ model: null, resolveProvider: vi.fn().mockResolvedValue(provider) });
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);
    const schema = z.object({ x: z.string() });

    // Act
    const { result } = renderHook(() => useAI());
    let thrownError: unknown;
    await act(async () => {
      try {
        await result.current.generateStructured({ prompt: "hi" }, schema);
      } catch (e) {
        thrownError = e;
      }
    });

    // Assert
    expect(thrownError).toBeInstanceOf(Error);
    expect((thrownError as Error).message).toMatch(/No model available/);
  });

  it("ensureReady and generate functions are stable references across re-renders (memoized)", () => {
    // Arrange
    const state = makeStoreState();
    vi.mocked(useAIRuntimeStore).mockReturnValue(state);

    // Act
    const { result, rerender } = renderHook(() => useAI());
    const firstEnsureReady = result.current.ensureReady;
    const firstGenerate = result.current.generate;
    const firstGenerateStructured = result.current.generateStructured;

    rerender();

    // Assert — useCallback should keep references stable
    expect(result.current.ensureReady).toBe(firstEnsureReady);
    expect(result.current.generate).toBe(firstGenerate);
    expect(result.current.generateStructured).toBe(firstGenerateStructured);
  });
});
