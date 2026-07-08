import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNarrator } from "@/features/ai-briefing/hooks/useNarrator";

/**
 * Behavioral suite for the offline narration hook.
 *
 * The hook talks to four real boundaries we mock or stub:
 *   - `@/platform/electron/electron-fs` (hasElectronVoice / sherpaSpeak) — the
 *     native sherpa-onnx voice lane, mocked via vi.mock.
 *   - `comlink` (Comlink.wrap / Comlink.transfer) — so the kokoro worker proxy
 *     is a controllable fake and the real worker module never loads.
 *   - the global `Worker` constructor — stubbed so `detectMode()`/`ensureProxy()`
 *     can be steered without spawning a real worker.
 *   - `window.speechSynthesis` + `SpeechSynthesisUtterance` — stubbed so the OS
 *     fallback path is observable. jsdom ships neither by default.
 *
 * Everything inside the hook (ref bookkeeping, blob/object-URL creation via the
 * real jsdom URL/Blob/Audio, branch selection) runs for real, so assertions are
 * on genuinely computed state, not stubbed behavior.
 */

// ─── Boundary mocks ─────────────────────────────────────────────────────────

const hasElectronVoice = vi.fn<() => boolean>();
const sherpaSpeak =
  vi.fn<(text: string, opts?: { voice?: string }) => Promise<{ wav: ArrayBuffer; sampleRate: number }>>();

vi.mock("@/platform/electron/electron-fs", () => ({
  hasElectronVoice: () => hasElectronVoice(),
  sherpaSpeak: (text: string, opts?: { voice?: string }) => sherpaSpeak(text, opts),
}));

// Comlink: `wrap` hands back our controllable proxy; `transfer` is identity; the
// real kokoro worker module is never imported because of these.
const wrap = vi.fn();
vi.mock("comlink", () => ({
  wrap: (...args: unknown[]) => wrap(...args),
  transfer: (value: unknown) => value,
  expose: vi.fn(),
}));

// ─── Global stubs ───────────────────────────────────────────────────────────

/** Minimal Worker double — enough to satisfy `new Worker(url, opts)` + teardown. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  static throwOnConstruct = false;
  terminate = vi.fn();
  url: unknown;
  opts: unknown;
  constructor(url: unknown, opts?: unknown) {
    if (FakeWorker.throwOnConstruct) throw new Error("worker construction failed");
    this.url = url;
    this.opts = opts;
    FakeWorker.instances.push(this);
  }
}

class FakeUtterance {
  text: string;
  rate = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

interface SpeechStub {
  speak: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  spoken: FakeUtterance[];
}

function installSpeechSynthesis(): SpeechStub {
  const spoken: FakeUtterance[] = [];
  const stub: SpeechStub = {
    spoken,
    cancel: vi.fn(),
    speak: vi.fn((u: FakeUtterance) => {
      spoken.push(u);
    }),
  };
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: stub,
  });
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  return stub;
}

function removeSpeechSynthesis() {
  // `in window` must be false for the "none" / kokoro-without-speech branches.
  if ("speechSynthesis" in window) {
    // biome-ignore lint/performance/noDelete: test teardown of a stubbed global
    delete (window as unknown as Record<string, unknown>).speechSynthesis;
  }
}

function installWorker() {
  FakeWorker.instances = [];
  FakeWorker.throwOnConstruct = false;
  vi.stubGlobal("Worker", FakeWorker);
}

/** A controllable kokoro proxy whose `synthesize` we drive per test. */
function makeProxy(synthesize: ReturnType<typeof vi.fn>) {
  return { synthesize };
}

const WAV = new Uint8Array([0x52, 0x49, 0x46, 0x46]).buffer; // "RIFF"

beforeEach(() => {
  hasElectronVoice.mockReturnValue(false);
  sherpaSpeak.mockReset();
  wrap.mockReset();
  removeSpeechSynthesis();
});

afterEach(() => {
  vi.unstubAllGlobals();
  removeSpeechSynthesis();
});

// ─── detectMode → initial NarratorState (mount effect) ───────────────────────

describe("useNarrator: engine detection on mount", () => {
  it("reports the Kokoro engine and availability when Worker exists", () => {
    installWorker();

    const { result } = renderHook(() => useNarrator());

    expect(result.current.available).toBe(true);
    expect(result.current.engine).toBe("Kokoro (offline)");
    expect(result.current.speaking).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it("falls back to system voices when Worker is absent but speechSynthesis exists", () => {
    // No Worker stub → typeof Worker === "undefined" in jsdom.
    installSpeechSynthesis();

    const { result } = renderHook(() => useNarrator());

    expect(result.current.available).toBe(true);
    expect(result.current.engine).toBe("System voices");
  });

  it("reports unavailable when neither Worker nor speechSynthesis exist", () => {
    // jsdom default: no Worker, no speechSynthesis.
    const { result } = renderHook(() => useNarrator());

    expect(result.current.available).toBe(false);
    expect(result.current.engine).toBe("Unavailable");
  });
});

// ─── speak: input guard ──────────────────────────────────────────────────────

describe("useNarrator.speak: empty input guard", () => {
  it("does nothing for an empty string", async () => {
    installWorker();
    const { result } = renderHook(() => useNarrator());

    await act(async () => {
      await result.current.speak("");
    });

    expect(hasElectronVoice).not.toHaveBeenCalled();
    expect(wrap).not.toHaveBeenCalled();
    expect(result.current.speaking).toBe(false);
  });

  it("does nothing for whitespace-only input", async () => {
    installWorker();
    const { result } = renderHook(() => useNarrator());

    await act(async () => {
      await result.current.speak("   \n\t  ");
    });

    expect(hasElectronVoice).not.toHaveBeenCalled();
    expect(result.current.speaking).toBe(false);
  });
});

// ─── speak: native sherpa-onnx (electron voice) lane ─────────────────────────

describe("useNarrator.speak: Electron sherpa-onnx lane", () => {
  it("synthesizes via sherpaSpeak, sets speaking, and never touches the worker", async () => {
    hasElectronVoice.mockReturnValue(true);
    sherpaSpeak.mockResolvedValue({ wav: WAV, sampleRate: 24000 });
    installWorker();

    const { result } = renderHook(() => useNarrator());

    await act(async () => {
      await result.current.speak("Quarter is up four percent.");
    });

    expect(sherpaSpeak).toHaveBeenCalledWith("Quarter is up four percent.", { voice: "af_heart" });
    expect(result.current.speaking).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.engine).toBe("Kokoro (offline)");
    // Native lane returns before the kokoro worker proxy is ever created.
    expect(wrap).not.toHaveBeenCalled();
  });

  it("trims the text before handing it to sherpaSpeak", async () => {
    hasElectronVoice.mockReturnValue(true);
    sherpaSpeak.mockResolvedValue({ wav: WAV, sampleRate: 24000 });

    const { result } = renderHook(() => useNarrator());

    await act(async () => {
      await result.current.speak("  hello world  ");
    });

    expect(sherpaSpeak).toHaveBeenCalledWith("hello world", { voice: "af_heart" });
  });

  it("clears loading and falls through to speechSynthesis when sherpaSpeak rejects", async () => {
    hasElectronVoice.mockReturnValue(true);
    sherpaSpeak.mockRejectedValue(new Error("native voice service down"));
    // No Worker → mode "speech" so the fall-through lands on OS voices.
    const speech = installSpeechSynthesis();

    const { result } = renderHook(() => useNarrator());

    await act(async () => {
      await result.current.speak("fallback please");
    });

    expect(sherpaSpeak).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
    // Fell through to the OS voice path.
    expect(speech.speak).toHaveBeenCalledTimes(1);
    expect(speech.spoken[0].text).toBe("fallback please");
    expect(result.current.speaking).toBe(true);
    expect(result.current.engine).toBe("System voices");
  });
});

// ─── speak: Kokoro worker lane ───────────────────────────────────────────────

describe("useNarrator.speak: Kokoro worker lane", () => {
  it("creates the worker proxy once and plays the synthesized audio on success", async () => {
    const synthesize = vi.fn().mockResolvedValue({ bytes: WAV, type: "audio/wav" });
    wrap.mockReturnValue(makeProxy(synthesize));
    installWorker();

    const { result } = renderHook(() => useNarrator());

    await act(async () => {
      await result.current.speak("kokoro narration");
    });

    expect(wrap).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledWith("kokoro narration");
    expect(result.current.speaking).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.engine).toBe("Kokoro (offline)");
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it("reuses the same proxy on a second speak (ensureProxy short-circuit)", async () => {
    const synthesize = vi.fn().mockResolvedValue({ bytes: WAV, type: "audio/wav" });
    wrap.mockReturnValue(makeProxy(synthesize));
    installWorker();

    const { result } = renderHook(() => useNarrator());

    await act(async () => {
      await result.current.speak("first");
    });
    await act(async () => {
      await result.current.speak("second");
    });

    // wrap (worker creation) happened only once across both calls.
    expect(wrap).toHaveBeenCalledTimes(1);
    expect(FakeWorker.instances).toHaveLength(1);
    expect(synthesize).toHaveBeenNthCalledWith(1, "first");
    expect(synthesize).toHaveBeenNthCalledWith(2, "second");
  });

  it("falls through to system voices when synthesize resolves null", async () => {
    const synthesize = vi.fn().mockResolvedValue(null);
    wrap.mockReturnValue(makeProxy(synthesize));
    installWorker();
    // Add speechSynthesis so the fall-through has somewhere to land. Worker is
    // present so detectMode stays "kokoro"; the OS path is reachable directly.
    const speech = installSpeechSynthesis();

    const { result } = renderHook(() => useNarrator());

    await act(async () => {
      await result.current.speak("no audio");
    });

    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
    expect(speech.speak).toHaveBeenCalledTimes(1);
    expect(speech.spoken[0].text).toBe("no audio");
    expect(result.current.speaking).toBe(true);
  });

  it("marks kokoro failed and skips it on subsequent calls when synthesize throws", async () => {
    const synthesize = vi
      .fn()
      .mockRejectedValueOnce(new Error("model not cached"))
      .mockResolvedValue({ bytes: WAV, type: "audio/wav" });
    wrap.mockReturnValue(makeProxy(synthesize));
    installWorker();
    const speech = installSpeechSynthesis();

    const { result } = renderHook(() => useNarrator());

    // First call: kokoro throws → kokoroFailedRef set → OS fallback.
    await act(async () => {
      await result.current.speak("first attempt");
    });
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(speech.speak).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);

    // Second call: kokoro is now disabled → synthesize NOT called again, OS voices used.
    await act(async () => {
      await result.current.speak("second attempt");
    });
    expect(synthesize).toHaveBeenCalledTimes(1); // unchanged
    expect(speech.speak).toHaveBeenCalledTimes(2);
    expect(speech.spoken[1].text).toBe("second attempt");
  });

  it("skips kokoro and uses OS voices when the Worker constructor throws", async () => {
    installWorker();
    FakeWorker.throwOnConstruct = true; // ensureProxy catches → returns null
    const speech = installSpeechSynthesis();

    const { result } = renderHook(() => useNarrator());

    await act(async () => {
      await result.current.speak("worker boom");
    });

    // wrap is never reached because the constructor threw first.
    expect(wrap).not.toHaveBeenCalled();
    expect(speech.speak).toHaveBeenCalledTimes(1);
    expect(speech.spoken[0].text).toBe("worker boom");
    expect(result.current.speaking).toBe(true);
  });
});

// ─── speak: OS speechSynthesis lane ──────────────────────────────────────────

describe("useNarrator.speak: speechSynthesis fallback", () => {
  it("speaks via window.speechSynthesis in speech mode with rate 0.97", async () => {
    const speech = installSpeechSynthesis();

    const { result } = renderHook(() => useNarrator());
    expect(result.current.engine).toBe("System voices");

    await act(async () => {
      await result.current.speak("read this aloud");
    });

    // cancel() runs once in cleanup() and once at the top of speakWithSpeechSynthesis.
    expect(speech.cancel).toHaveBeenCalled();
    expect(speech.speak).toHaveBeenCalledTimes(1);
    const utterance = speech.spoken[0];
    expect(utterance.text).toBe("read this aloud");
    expect(utterance.rate).toBeCloseTo(0.97);
    expect(result.current.speaking).toBe(true);
    expect(result.current.engine).toBe("System voices");
  });

  it("resets speaking to false when the utterance ends", async () => {
    const speech = installSpeechSynthesis();
    const { result } = renderHook(() => useNarrator());

    await act(async () => {
      await result.current.speak("ending soon");
    });
    expect(result.current.speaking).toBe(true);

    act(() => {
      speech.spoken[0].onend?.();
    });
    expect(result.current.speaking).toBe(false);
  });

  it("resets speaking to false when the utterance errors", async () => {
    const speech = installSpeechSynthesis();
    const { result } = renderHook(() => useNarrator());

    await act(async () => {
      await result.current.speak("will error");
    });
    expect(result.current.speaking).toBe(true);

    act(() => {
      speech.spoken[0].onerror?.();
    });
    expect(result.current.speaking).toBe(false);
  });

  it("is a no-op in 'none' mode (no Worker, no speechSynthesis)", async () => {
    // jsdom default: detectMode() === "none". speak() reaches the OS lane, whose
    // guard returns immediately because speechSynthesis is absent.
    const { result } = renderHook(() => useNarrator());
    expect(result.current.engine).toBe("Unavailable");

    await act(async () => {
      await result.current.speak("nobody can hear this");
    });

    expect(result.current.speaking).toBe(false);
  });
});

// ─── stop ────────────────────────────────────────────────────────────────────

describe("useNarrator.stop", () => {
  it("clears speaking + loading and cancels any active OS speech", async () => {
    const speech = installSpeechSynthesis();
    const { result } = renderHook(() => useNarrator());

    await act(async () => {
      await result.current.speak("talking");
    });
    expect(result.current.speaking).toBe(true);
    speech.cancel.mockClear();

    act(() => {
      result.current.stop();
    });

    expect(result.current.speaking).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(speech.cancel).toHaveBeenCalledTimes(1);
  });

  it("is safe to call before anything has been spoken", () => {
    installWorker();
    const { result } = renderHook(() => useNarrator());

    expect(() => {
      act(() => {
        result.current.stop();
      });
    }).not.toThrow();
    expect(result.current.speaking).toBe(false);
    expect(result.current.loading).toBe(false);
  });
});

// ─── teardown ────────────────────────────────────────────────────────────────

describe("useNarrator: unmount teardown", () => {
  it("terminates the kokoro worker on unmount", async () => {
    const synthesize = vi.fn().mockResolvedValue({ bytes: WAV, type: "audio/wav" });
    wrap.mockReturnValue(makeProxy(synthesize));
    installWorker();

    const { result, unmount } = renderHook(() => useNarrator());
    await act(async () => {
      await result.current.speak("warm the worker");
    });
    const worker = FakeWorker.instances[0];

    unmount();

    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("cancels OS speech on unmount", async () => {
    const speech = installSpeechSynthesis();
    const { result, unmount } = renderHook(() => useNarrator());

    await act(async () => {
      await result.current.speak("mid-sentence");
    });
    speech.cancel.mockClear();

    unmount();

    expect(speech.cancel).toHaveBeenCalled();
  });

  it("unmounts cleanly when nothing was ever spoken", () => {
    const { unmount } = renderHook(() => useNarrator());
    expect(() => unmount()).not.toThrow();
  });
});

// ─── stability ───────────────────────────────────────────────────────────────

describe("useNarrator: returned API stability", () => {
  it("keeps speak/stop referentially stable across re-renders", () => {
    installWorker();
    const { result, rerender } = renderHook(() => useNarrator());

    const firstSpeak = result.current.speak;
    const firstStop = result.current.stop;
    rerender();

    expect(result.current.speak).toBe(firstSpeak);
    expect(result.current.stop).toBe(firstStop);
  });
});
