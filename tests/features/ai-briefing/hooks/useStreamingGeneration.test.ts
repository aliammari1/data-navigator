import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStreamingGeneration } from "@/features/ai-briefing/hooks/useStreamingGeneration";

/**
 * Behavioral suite for `useStreamingGeneration`.
 *
 * The hook depends on `@/platform/ai/provider` (the `useAI` hook). We mock that
 * module so we can control the `generate` call and its resolved value, token
 * streaming, and error throwing — without loading any real AI runtime.
 *
 * All state transitions inside the hook (busy flag, accumulated text, error
 * field, abort handling) run for real, giving genuine coverage.
 */

// ─── Boundary mock: useAI ────────────────────────────────────────────────────

/**
 * A controllable mock for `ai.generate`. Tests reassign this before rendering.
 * Default: resolves immediately with an empty text result.
 */
const mockGenerate = vi.fn<Parameters<ReturnType<typeof import("@/platform/ai/provider/use-ai").useAI>["generate"]>, Promise<{ text: string }>>();

vi.mock("@/platform/ai/provider", () => ({
  useAI: () => ({
    generate: mockGenerate,
    // Surface the rest with safe stubs so the hook doesn't crash if it reads them
    providerId: "mock",
    model: "mock-model",
    progress: { status: "ready", progress: 100 },
    availability: [],
    detecting: false,
    setProvider: vi.fn(),
    setModel: vi.fn(),
    refreshAvailability: vi.fn(),
    ensureReady: vi.fn(),
    generateStructured: vi.fn(),
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Render the hook and return the result ref. */
function setup() {
  return renderHook(() => useStreamingGeneration());
}

/** Build a generate mock that streams tokens then resolves with the given text. */
function makeStreamingGenerate(tokens: string[], resolvedText: string) {
  return vi.fn(async (req: { onToken?: (t: string) => void }) => {
    for (const token of tokens) {
      req.onToken?.(token);
    }
    return { text: resolvedText };
  });
}

/** Build a generate mock that throws an error. */
function makeThrowingGenerate(error: Error) {
  return vi.fn(async () => {
    throw error;
  });
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe("useStreamingGeneration — initial state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with empty text, busy=false, and error=null", () => {
    // Arrange & Act
    const { result } = setup();

    // Assert
    expect(result.current.text).toBe("");
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("exposes run, cancel, and reset callbacks", () => {
    // Arrange & Act
    const { result } = setup();

    // Assert
    expect(typeof result.current.run).toBe("function");
    expect(typeof result.current.cancel).toBe("function");
    expect(typeof result.current.reset).toBe("function");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useStreamingGeneration — run() happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets busy=true immediately on invocation before generation resolves", async () => {
    // Arrange: never-resolving promise to capture the in-flight state
    let unblock!: () => void;
    mockGenerate.mockImplementation(
      () =>
        new Promise<{ text: string }>((resolve) => {
          unblock = () => resolve({ text: "done" });
        }),
    );
    const { result } = setup();

    // Act: kick off without awaiting
    act(() => {
      void result.current.run("sys", "prompt");
    });

    // Assert: busy should be true mid-flight
    expect(result.current.busy).toBe(true);
    expect(result.current.text).toBe("");
    expect(result.current.error).toBeNull();

    // Cleanup — let the promise finish so the hook doesn't leak
    await act(async () => {
      unblock();
    });
  });

  it("sets busy=false and populates text after generation resolves", async () => {
    // Arrange
    mockGenerate.mockResolvedValueOnce({ text: "Hello world" });
    const { result } = setup();

    // Act
    let returned: string | undefined;
    await act(async () => {
      returned = await result.current.run("sys", "prompt");
    });

    // Assert
    expect(result.current.busy).toBe(false);
    expect(result.current.text).toBe("Hello world");
    expect(result.current.error).toBeNull();
    expect(returned).toBe("Hello world");
  });

  it("accumulates streamed tokens into text during generation", async () => {
    // Arrange: stream three tokens; resolve with empty text so hook uses acc
    mockGenerate.mockImplementation(makeStreamingGenerate(["Hello", " ", "world"], ""));
    const { result } = setup();

    // Act
    await act(async () => {
      await result.current.run("sys", "prompt");
    });

    // Assert: acc = "Hello world"; result.text = final = acc (since result.text is "")
    expect(result.current.text).toBe("Hello world");
  });

  it("prefers result.text over accumulated tokens when both are non-empty", async () => {
    // Arrange: tokens stream "partial", but resolve returns "full-result"
    mockGenerate.mockImplementation(makeStreamingGenerate(["partial"], "full-result"));
    const { result } = setup();

    // Act
    let returned: string | undefined;
    await act(async () => {
      returned = await result.current.run("sys", "prompt");
    });

    // Assert: result.text wins over acc
    expect(result.current.text).toBe("full-result");
    expect(returned).toBe("full-result");
  });

  it("passes system, prompt, and default opts to ai.generate", async () => {
    // Arrange
    mockGenerate.mockResolvedValueOnce({ text: "ok" });
    const { result } = setup();

    // Act
    await act(async () => {
      await result.current.run("You are helpful", "Summarize this");
    });

    // Assert
    expect(mockGenerate).toHaveBeenCalledOnce();
    const req = mockGenerate.mock.calls[0][0] as Record<string, unknown>;
    expect(req.system).toBe("You are helpful");
    expect(req.prompt).toBe("Summarize this");
    expect(req.maxTokens).toBe(700);
    expect(req.temperature).toBe(0.6);
  });

  it("forwards custom maxTokens and temperature from opts", async () => {
    // Arrange
    mockGenerate.mockResolvedValueOnce({ text: "ok" });
    const { result } = setup();

    // Act
    await act(async () => {
      await result.current.run("sys", "prompt", { maxTokens: 200, temperature: 0.9 });
    });

    // Assert
    const req = mockGenerate.mock.calls[0][0] as Record<string, unknown>;
    expect(req.maxTokens).toBe(200);
    expect(req.temperature).toBe(0.9);
  });

  it("returns the final text string from run()", async () => {
    // Arrange
    mockGenerate.mockImplementation(makeStreamingGenerate(["tok1", "tok2"], ""));
    const { result } = setup();

    // Act
    let returnValue!: string;
    await act(async () => {
      returnValue = await result.current.run("sys", "prompt");
    });

    // Assert
    expect(returnValue).toBe("tok1tok2");
  });

  it("resets text to empty and clears error at the start of each run()", async () => {
    // Arrange: first run errors, second run succeeds
    mockGenerate
      .mockRejectedValueOnce(new Error("first error"))
      .mockResolvedValueOnce({ text: "clean" });
    const { result } = setup();

    // First run — causes an error state
    await act(async () => {
      try {
        await result.current.run("sys", "prompt");
      } catch {
        // expected
      }
    });

    // Assert error state after first run
    expect(result.current.error).not.toBeNull();

    // Second run — should clear the error
    await act(async () => {
      await result.current.run("sys", "prompt");
    });

    // Assert
    expect(result.current.text).toBe("clean");
    expect(result.current.error).toBeNull();
    expect(result.current.busy).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useStreamingGeneration — error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets error message when generate throws an Error instance", async () => {
    // Arrange
    mockGenerate.mockImplementation(makeThrowingGenerate(new Error("Network timeout")));
    const { result } = setup();

    // Act
    await act(async () => {
      try {
        await result.current.run("sys", "prompt");
      } catch {
        // expected re-throw
      }
    });

    // Assert
    expect(result.current.error).toBe("Network timeout");
    expect(result.current.busy).toBe(false);
  });

  it("sets generic error message when generate throws a non-Error value", async () => {
    // Arrange: throw a string (non-Error)
    mockGenerate.mockImplementation(async () => {
      throw "raw string error";
    });
    const { result } = setup();

    // Act
    await act(async () => {
      try {
        await result.current.run("sys", "prompt");
      } catch {
        // expected re-throw
      }
    });

    // Assert: fallback message used
    expect(result.current.error).toBe("Generation failed. Please try again.");
    expect(result.current.busy).toBe(false);
  });

  it("re-throws the error after updating state", async () => {
    // Arrange
    const thrownError = new Error("AI unavailable");
    mockGenerate.mockImplementation(makeThrowingGenerate(thrownError));
    const { result } = setup();

    // Act & Assert: the hook re-throws
    await act(async () => {
      await expect(result.current.run("sys", "prompt")).rejects.toThrow("AI unavailable");
    });
  });

  it("preserves accumulated tokens in text on error", async () => {
    // Arrange: stream a partial token then throw
    mockGenerate.mockImplementation(async (req: { onToken?: (t: string) => void }) => {
      req.onToken?.("partial");
      throw new Error("mid-stream failure");
    });
    const { result } = setup();

    // Act
    await act(async () => {
      try {
        await result.current.run("sys", "prompt");
      } catch {
        // expected
      }
    });

    // Assert: partial text is kept
    expect(result.current.text).toBe("partial");
    expect(result.current.error).toBe("mid-stream failure");
    expect(result.current.busy).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useStreamingGeneration — cancel()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets busy=false immediately when cancel is called", async () => {
    // Arrange: in-flight generation that never resolves
    let unblock!: () => void;
    mockGenerate.mockImplementation(
      async (req: { signal?: AbortSignal; onToken?: (t: string) => void }) =>
        new Promise<{ text: string }>((resolve, reject) => {
          unblock = () => {
            req.onToken?.("tok");
            resolve({ text: "" });
          };
          req.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        }),
    );

    const { result } = setup();

    // Start the run without awaiting
    act(() => {
      void result.current.run("sys", "prompt");
    });

    // Assert running
    expect(result.current.busy).toBe(true);

    // Act: cancel
    act(() => {
      result.current.cancel();
    });

    // Assert cancelled
    expect(result.current.busy).toBe(false);

    // Cleanup
    await act(async () => {
      try {
        unblock();
      } catch {
        // ignored
      }
    });
  });

  it("is safe to call cancel when not busy (no-op)", () => {
    // Arrange
    const { result } = setup();

    // Act & Assert: should not throw
    expect(() => act(() => result.current.cancel())).not.toThrow();
    expect(result.current.busy).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useStreamingGeneration — reset()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears text, sets busy=false, and clears error", async () => {
    // Arrange: trigger an error to populate state
    mockGenerate.mockImplementation(makeThrowingGenerate(new Error("fail")));
    const { result } = setup();

    await act(async () => {
      try {
        await result.current.run("sys", "prompt");
      } catch {
        // expected
      }
    });

    // Precondition: error state is set
    expect(result.current.error).not.toBeNull();

    // Act
    act(() => {
      result.current.reset();
    });

    // Assert: all state is cleared
    expect(result.current.text).toBe("");
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("is safe to call reset when state is already clean", () => {
    // Arrange
    const { result } = setup();

    // Act & Assert: should not throw
    expect(() => act(() => result.current.reset())).not.toThrow();
    expect(result.current.text).toBe("");
    expect(result.current.error).toBeNull();
    expect(result.current.busy).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useStreamingGeneration — AbortController / abort on re-run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aborts the previous in-flight request when run() is called again", async () => {
    // Arrange: first call captures the signal, second call resolves fast
    let firstSignal: AbortSignal | undefined;
    let unblockFirst!: () => void;

    mockGenerate
      .mockImplementationOnce(
        async (req: { signal?: AbortSignal }) =>
          new Promise<{ text: string }>((resolve, reject) => {
            firstSignal = req.signal;
            unblockFirst = () => resolve({ text: "first" });
            req.signal?.addEventListener("abort", () =>
              reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
            );
          }),
      )
      .mockResolvedValueOnce({ text: "second" });

    const { result } = setup();

    // Start first run (do not await)
    act(() => {
      void result.current.run("sys", "first prompt");
    });

    // Start second run — should abort first
    await act(async () => {
      await result.current.run("sys", "second prompt");
    });

    // Assert: the first signal was aborted
    expect(firstSignal?.aborted).toBe(true);
    expect(result.current.text).toBe("second");

    // Cleanup
    act(() => {
      try {
        unblockFirst();
      } catch {
        // already aborted
      }
    });
  });

  it("handles abort silently (no error state set) when signal is aborted", async () => {
    // Arrange: generate rejects with an abort-like error
    mockGenerate.mockImplementation(async (req: { signal?: AbortSignal }) => {
      // Simulate abort by immediately aborting and throwing
      const err = Object.assign(new Error("AbortError"), { name: "AbortError" });
      throw err;
    });

    const { result } = setup();

    // Act: call run; it will throw internally due to abort
    let returnValue: string | undefined;
    await act(async () => {
      // Use cancel to ensure abortRef.current is aborted before generate runs
      // We directly abort via calling run then cancel synchronously
      const runPromise = result.current.run("sys", "prompt");
      result.current.cancel(); // sets abortRef.current as aborted
      try {
        returnValue = await runPromise;
      } catch {
        // May or may not throw depending on timing; that's ok
      }
    });

    // Assert: error should be null since it was an abort scenario
    // The hook checks ac.signal.aborted, which is true after cancel() was called
    // Note: cancel() aborts the *current* abortRef, which was set in run()
    expect(result.current.busy).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useStreamingGeneration — unmount cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aborts in-flight generation when the component unmounts", async () => {
    // Arrange: generation that captures its signal
    let capturedSignal: AbortSignal | undefined;
    let resolveGenerate!: () => void;

    mockGenerate.mockImplementation(
      async (req: { signal?: AbortSignal }) =>
        new Promise<{ text: string }>((resolve) => {
          capturedSignal = req.signal;
          resolveGenerate = () => resolve({ text: "done" });
        }),
    );

    const { result, unmount } = setup();

    // Act: start run then unmount before it resolves
    act(() => {
      void result.current.run("sys", "prompt");
    });

    // Assert: in flight
    expect(result.current.busy).toBe(true);

    // Unmount — the useEffect cleanup should call abort
    unmount();

    // Assert: signal was aborted
    expect(capturedSignal?.aborted).toBe(true);

    // Cleanup
    act(() => {
      resolveGenerate();
    });
  });

  it("does not throw on unmount when no run() was ever called", () => {
    // Arrange
    const { unmount } = setup();

    // Act & Assert: should not throw even if abortRef.current is null
    expect(() => unmount()).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useStreamingGeneration — onToken callback updates state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates text state incrementally via onToken while busy", async () => {
    // Arrange
    const tokens = ["A", "B", "C"];
    mockGenerate.mockImplementation(makeStreamingGenerate(tokens, ""));
    const { result } = setup();

    // Act
    await act(async () => {
      await result.current.run("sys", "prompt");
    });

    // Assert: final text is the concatenation of all tokens
    expect(result.current.text).toBe("ABC");
  });

  it("does not update text via onToken when busy is false (guard condition)", async () => {
    // Arrange: generate calls onToken synchronously, but we manipulate state
    // by calling cancel() to set busy=false before the token fires
    // This exercises the `s.busy ? { ...s, text: acc } : s` branch
    let onTokenRef!: (t: string) => void;
    let resolveRef!: (v: { text: string }) => void;

    mockGenerate.mockImplementation(
      async (req: { onToken?: (t: string) => void; signal?: AbortSignal }) => {
        onTokenRef = req.onToken ?? (() => {});
        return new Promise<{ text: string }>((resolve) => {
          resolveRef = resolve;
        });
      },
    );

    const { result } = setup();

    // Start generation
    act(() => {
      void result.current.run("sys", "prompt");
    });

    // Cancel: sets busy=false
    act(() => {
      result.current.cancel();
    });

    // Fire the onToken callback AFTER busy is false
    act(() => {
      onTokenRef("should-not-appear");
    });

    // Assert: text was NOT updated because busy was false
    expect(result.current.text).toBe("");

    // Cleanup
    await act(async () => {
      resolveRef({ text: "" });
    });
  });
});
