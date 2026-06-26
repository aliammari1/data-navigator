import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock @/platform/ai/llm-engine ───────────────────────────────────────────
// All I/O and GPU-bound work lives in llm-engine. We control it entirely
// through vi.fn()s so the hook logic stays real and testable under jsdom.

const mockGetLLMEngineState = vi.fn();
const mockInitLLMEngine = vi.fn<(model?: string) => Promise<void>>();
const mockGenerateText = vi.fn<
  (prompt: string, opts?: { systemPrompt?: string; maxTokens?: number }) => Promise<string>
>();
const mockUnloadLLMEngine = vi.fn<() => Promise<void>>();

// subscribeLLMEngine is called in useEffect to register a setState callback.
// We capture that callback so tests can manually push new state snapshots.
type StateCallback = (s: import("@/platform/ai/llm-engine").LLMEngineState) => void;
let capturedSubscriber: StateCallback | null = null;
const mockSubscribeLLMEngine = vi.fn((cb: StateCallback) => {
  capturedSubscriber = cb;
  // Return the unsubscribe function the hook will call on unmount
  return () => {
    capturedSubscriber = null;
  };
});

vi.mock("@/platform/ai/llm-engine", () => ({
  getLLMEngineState: () => mockGetLLMEngineState(),
  subscribeLLMEngine: (cb: StateCallback) => mockSubscribeLLMEngine(cb),
  initLLMEngine: (model?: string) => mockInitLLMEngine(model),
  generateText: (
    prompt: string,
    opts?: { systemPrompt?: string; maxTokens?: number },
  ) => mockGenerateText(prompt, opts),
  unloadLLMEngine: () => mockUnloadLLMEngine(),
}));

import { useLLMEngine, useLLMGenerate } from "@/platform/ai/llm-hooks";
import type { LLMEngineState } from "@/platform/ai/llm-engine";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function idleState(): LLMEngineState {
  return { status: "idle", progress: 0, model: null, error: null };
}

function readyState(): LLMEngineState {
  return { status: "ready", progress: 100, model: "Qwen2-0.5B-Instruct-q4f16_1-MLC", error: null };
}

// ─── useLLMEngine ─────────────────────────────────────────────────────────────

describe("useLLMEngine", () => {
  beforeEach(() => {
    capturedSubscriber = null;
    mockGetLLMEngineState.mockReturnValue(idleState());
    mockSubscribeLLMEngine.mockImplementation((cb: StateCallback) => {
      capturedSubscriber = cb;
      return () => {
        capturedSubscriber = null;
      };
    });
    mockInitLLMEngine.mockResolvedValue(undefined);
    mockGenerateText.mockResolvedValue("hello");
    mockUnloadLLMEngine.mockResolvedValue(undefined);
  });

  it("initializes state from getLLMEngineState on mount", () => {
    // Arrange
    mockGetLLMEngineState.mockReturnValue(idleState());

    // Act
    const { result } = renderHook(() => useLLMEngine());

    // Assert
    expect(result.current.state.status).toBe("idle");
    expect(result.current.state.progress).toBe(0);
    expect(result.current.state.model).toBeNull();
    expect(result.current.state.error).toBeNull();
  });

  it("subscribes to state updates via subscribeLLMEngine on mount", () => {
    // Arrange / Act
    renderHook(() => useLLMEngine());

    // Assert: subscription was registered
    expect(mockSubscribeLLMEngine).toHaveBeenCalledTimes(1);
    expect(capturedSubscriber).toBeInstanceOf(Function);
  });

  it("updates state when the subscriber receives a new engine state", async () => {
    // Arrange
    const { result } = renderHook(() => useLLMEngine());
    expect(result.current.state.status).toBe("idle");

    // Act: push a state update through the subscriber
    act(() => {
      capturedSubscriber!(readyState());
    });

    // Assert
    expect(result.current.state.status).toBe("ready");
    expect(result.current.state.progress).toBe(100);
    expect(result.current.state.model).toBe("Qwen2-0.5B-Instruct-q4f16_1-MLC");
  });

  it("unsubscribes when the component unmounts", () => {
    // Arrange
    const { unmount } = renderHook(() => useLLMEngine());
    expect(capturedSubscriber).not.toBeNull();

    // Act
    unmount();

    // Assert: capturedSubscriber cleared by the unsubscribe fn
    expect(capturedSubscriber).toBeNull();
  });

  it("init calls initLLMEngine with the provided model", async () => {
    // Arrange
    const { result } = renderHook(() => useLLMEngine());

    // Act
    await act(async () => {
      await result.current.init("TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC");
    });

    // Assert
    expect(mockInitLLMEngine).toHaveBeenCalledWith("TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC");
  });

  it("init calls initLLMEngine with undefined when no model is supplied", async () => {
    // Arrange
    const { result } = renderHook(() => useLLMEngine());

    // Act
    await act(async () => {
      await result.current.init();
    });

    // Assert: called without a model argument (undefined)
    expect(mockInitLLMEngine).toHaveBeenCalledWith(undefined);
  });

  it("generate calls generateText with prompt and options", async () => {
    // Arrange
    mockGenerateText.mockResolvedValue("generated output");
    const { result } = renderHook(() => useLLMEngine());

    // Act
    let output: string | undefined;
    await act(async () => {
      output = await result.current.generate("my prompt", { systemPrompt: "be helpful", maxTokens: 128 });
    });

    // Assert
    expect(mockGenerateText).toHaveBeenCalledWith("my prompt", {
      systemPrompt: "be helpful",
      maxTokens: 128,
    });
    expect(output).toBe("generated output");
  });

  it("generate calls generateText with prompt only when opts is omitted", async () => {
    // Arrange
    mockGenerateText.mockResolvedValue("result");
    const { result } = renderHook(() => useLLMEngine());

    // Act
    await act(async () => {
      await result.current.generate("simple prompt");
    });

    // Assert
    expect(mockGenerateText).toHaveBeenCalledWith("simple prompt", undefined);
  });

  it("returns unloadLLMEngine as the unload function", async () => {
    // Arrange
    const { result } = renderHook(() => useLLMEngine());

    // Act
    await act(async () => {
      await result.current.unload();
    });

    // Assert
    expect(mockUnloadLLMEngine).toHaveBeenCalledTimes(1);
  });

  it("exposes state, init, generate, and unload in the returned object", () => {
    // Arrange / Act
    const { result } = renderHook(() => useLLMEngine());

    // Assert: all expected properties are present
    expect(result.current).toHaveProperty("state");
    expect(result.current).toHaveProperty("init");
    expect(result.current).toHaveProperty("generate");
    expect(result.current).toHaveProperty("unload");
    expect(typeof result.current.init).toBe("function");
    expect(typeof result.current.generate).toBe("function");
    expect(typeof result.current.unload).toBe("function");
  });
});

// ─── useLLMGenerate ───────────────────────────────────────────────────────────

describe("useLLMGenerate", () => {
  beforeEach(() => {
    mockGenerateText.mockResolvedValue("default response");
  });

  it("starts with loading=false and error=null", () => {
    // Act
    const { result } = renderHook(() => useLLMGenerate());

    // Assert
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("exposes a generate function", () => {
    // Act
    const { result } = renderHook(() => useLLMGenerate());

    // Assert
    expect(typeof result.current.generate).toBe("function");
  });

  it("returns the generated text on success", async () => {
    // Arrange
    mockGenerateText.mockResolvedValue("LLM response");
    const { result } = renderHook(() => useLLMGenerate());

    // Act
    let output: string | undefined;
    await act(async () => {
      output = await result.current.generate("tell me a joke");
    });

    // Assert
    expect(output).toBe("LLM response");
    expect(mockGenerateText).toHaveBeenCalledWith("tell me a joke", undefined);
  });

  it("passes opts to generateText when provided", async () => {
    // Arrange
    mockGenerateText.mockResolvedValue("with opts");
    const { result } = renderHook(() => useLLMGenerate());

    // Act
    await act(async () => {
      await result.current.generate("prompt", { systemPrompt: "You are a bot" });
    });

    // Assert
    expect(mockGenerateText).toHaveBeenCalledWith("prompt", { systemPrompt: "You are a bot" });
  });

  it("sets loading=true while the request is in flight, then false after completion", async () => {
    // Arrange: make generateText hang until we release it
    let resolve!: (v: string) => void;
    const pending = new Promise<string>((res) => {
      resolve = res;
    });
    mockGenerateText.mockReturnValue(pending);

    const { result } = renderHook(() => useLLMGenerate());
    expect(result.current.loading).toBe(false);

    // Act: start the generate call (don't await yet)
    let generatePromise!: Promise<string>;
    act(() => {
      generatePromise = result.current.generate("async prompt");
    });

    // Assert: loading should now be true
    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    // Release the pending promise
    resolve("done");
    await act(async () => {
      await generatePromise;
    });

    // Assert: loading goes back to false after the promise resolves
    expect(result.current.loading).toBe(false);
  });

  it("clears error to null at the start of each generate call", async () => {
    // Arrange: first call sets an error
    mockGenerateText.mockRejectedValueOnce(new Error("first error"));
    mockGenerateText.mockResolvedValueOnce("ok");

    const { result } = renderHook(() => useLLMGenerate());

    // First call: fails
    await act(async () => {
      await result.current.generate("prompt 1");
    });
    expect(result.current.error).toBe("first error");

    // Second call: succeeds — error should be cleared
    await act(async () => {
      await result.current.generate("prompt 2");
    });
    expect(result.current.error).toBeNull();
  });

  it("sets error to err.message and returns '' when generateText throws an Error", async () => {
    // Arrange
    mockGenerateText.mockRejectedValue(new Error("inference failed"));
    const { result } = renderHook(() => useLLMGenerate());

    // Act
    let output: string | undefined;
    await act(async () => {
      output = await result.current.generate("bad prompt");
    });

    // Assert
    expect(output).toBe("");
    expect(result.current.error).toBe("inference failed");
    expect(result.current.loading).toBe(false);
  });

  it("sets error to String(err) and returns '' when generateText throws a non-Error value", async () => {
    // Arrange: throw a plain string (not an Error instance)
    mockGenerateText.mockRejectedValue("plain string error");
    const { result } = renderHook(() => useLLMGenerate());

    // Act
    let output: string | undefined;
    await act(async () => {
      output = await result.current.generate("non-error throw");
    });

    // Assert
    expect(output).toBe("");
    expect(result.current.error).toBe("plain string error");
    expect(result.current.loading).toBe(false);
  });

  it("sets loading=false in the finally block even when an error occurs", async () => {
    // Arrange
    mockGenerateText.mockRejectedValue(new Error("crash"));
    const { result } = renderHook(() => useLLMGenerate());

    // Act
    await act(async () => {
      await result.current.generate("will fail");
    });

    // Assert: finally block must reset loading regardless of error path
    expect(result.current.loading).toBe(false);
  });

  it("handles a non-Error object thrown by generateText", async () => {
    // Arrange: throw a number
    mockGenerateText.mockRejectedValue(42);
    const { result } = renderHook(() => useLLMGenerate());

    // Act
    let output: string | undefined;
    await act(async () => {
      output = await result.current.generate("number throw");
    });

    // Assert: String(42) === "42"
    expect(output).toBe("");
    expect(result.current.error).toBe("42");
  });

  it("handles an undefined thrown value from generateText", async () => {
    // Arrange
    mockGenerateText.mockRejectedValue(undefined);
    const { result } = renderHook(() => useLLMGenerate());

    // Act
    let output: string | undefined;
    await act(async () => {
      output = await result.current.generate("undefined throw");
    });

    // Assert: String(undefined) === "undefined"
    expect(output).toBe("");
    expect(result.current.error).toBe("undefined");
  });

  it("returns an empty string when generateText resolves with an empty string", async () => {
    // Arrange
    mockGenerateText.mockResolvedValue("");
    const { result } = renderHook(() => useLLMGenerate());

    // Act
    let output: string | undefined;
    await act(async () => {
      output = await result.current.generate("empty response");
    });

    // Assert
    expect(output).toBe("");
    expect(result.current.error).toBeNull();
  });

  it("can be called multiple times sequentially", async () => {
    // Arrange
    mockGenerateText
      .mockResolvedValueOnce("first")
      .mockResolvedValueOnce("second");

    const { result } = renderHook(() => useLLMGenerate());

    // Act
    let out1: string | undefined;
    let out2: string | undefined;

    await act(async () => {
      out1 = await result.current.generate("call 1");
    });

    await act(async () => {
      out2 = await result.current.generate("call 2");
    });

    // Assert
    expect(out1).toBe("first");
    expect(out2).toBe("second");
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
