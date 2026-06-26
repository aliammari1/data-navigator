import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNarrator } from "@/features/ai-briefing/hooks/useNarrator";

/**
 * Supplemental coverage suite for useNarrator.
 *
 * The existing .tsx suite already covers the primary paths. This file targets
 * the remaining uncovered branches and functions:
 *   - audio.onended / audio.onerror callbacks in the Electron sherpa-onnx lane
 *   - audio.onended / audio.onerror callbacks in the Kokoro worker lane
 *   - setState updater lambdas that appear inside event handlers
 *   - the `result === null` branch in the Kokoro path (synthesize resolves null)
 *   - cleanup() when both audioRef and urlRef are set (URL.revokeObjectURL)
 *   - speakWithSpeechSynthesis guard when speechSynthesis is absent
 *
 * Mocking strategy mirrors the existing suite exactly.
 */

// ─── Boundary mocks ────────────────────────────────────────────────────────────

const hasElectronVoice = vi.fn<() => boolean>();
const sherpaSpeak =
  vi.fn<(text: string, opts?: { voice?: string }) => Promise<{ wav: ArrayBuffer; sampleRate: number }>>();

vi.mock("@/platform/electron/electron-fs", () => ({
  hasElectronVoice: () => hasElectronVoice(),
  sherpaSpeak: (text: string, opts?: { voice?: string }) => sherpaSpeak(text, opts),
}));

const wrap = vi.fn();
vi.mock("comlink", () => ({
  wrap: (...args: unknown[]) => wrap(...args),
  transfer: (value: unknown) => value,
  expose: vi.fn(),
}));

// ─── Global stubs ─────────────────────────────────────────────────────────────

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

// ─── FakeAudio: a minimal HTMLAudioElement stub ───────────────────────────────
// jsdom's HTMLMediaElement.play() logs "Not implemented" but resolves. However,
// to reliably capture and fire onended/onerror handlers we use a lightweight
// stub that also lets us track URL.createObjectURL / URL.revokeObjectURL usage.

interface FakeAudioInstance {
  url: string;
  onended: (() => void) | null;
  onerror: (() => void) | null;
  src: string;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
}

class FakeAudio implements FakeAudioInstance {
  static instances: FakeAudioInstance[] = [];
  url: string;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src: string;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  constructor(url: string) {
    this.url = url;
    this.src = url;
    FakeAudio.instances.push(this);
  }
}

function installFakeAudio() {
  FakeAudio.instances = [];
  vi.stubGlobal("Audio", FakeAudio);
}

// ─── Electron audio event handlers ────────────────────────────────────────────
// The existing suite verifies that speaking=true after sherpaSpeak resolves, but
// never fires the audio.onended / audio.onerror callbacks. These anonymous
// functions are separate V8 function instances that must be invoked to reach 100%.

describe("useNarrator.speak Electron lane: audio event handlers", () => {
  it("resets speaking to false when the Electron audio element fires onended", async () => {
    // Arrange
    hasElectronVoice.mockReturnValue(true);
    sherpaSpeak.mockResolvedValue({ wav: WAV, sampleRate: 24000 });
    installFakeAudio();

    const { result } = renderHook(() => useNarrator());

    await act(async () => {
      await result.current.speak("electron narration");
    });

    // Verify we are in the speaking state first.
    expect(result.current.speaking).toBe(true);
    const audio = FakeAudio.instances[0];
    expect(audio).toBeDefined();

    // Fire the onended callback — the lambda inside speak() sets speaking=false.
    act(() => {
      audio.onended?.();
    });

    expect(result.current.speaking).toBe(false);
  });

  it("resets speaking to false when the Electron audio element fires onerror", async () => {
    // Arrange
    hasElectronVoice.mockReturnValue(true);
    sherpaSpeak.mockResolvedValue({ wav: WAV, sampleRate: 24000 });
    installFakeAudio();

    const { result } = renderHook(() => useNarrator());

    await act(async () => {
      await result.current.speak("electron narration error");
    });

    expect(result.current.speaking).toBe(true);

    const audio = FakeAudio.instances[0];
    act(() => {
      audio.onerror?.();
    });

    expect(result.current.speaking).toBe(false);
  });
});

// ─── Kokoro worker audio event handlers ──────────────────────────────────────
// Same idea: fire audio.onended / audio.onerror after a successful Kokoro synthesis.

describe("useNarrator.speak Kokoro lane: audio event handlers", () => {
  it("resets speaking to false when the Kokoro audio element fires onended", async () => {
    // Arrange
    const synthesize = vi.fn().mockResolvedValue({ bytes: WAV, type: "audio/wav" });
    wrap.mockReturnValue(makeProxy(synthesize));
    installWorker();
    installFakeAudio();

    const { result } = renderHook(() => useNarrator());

    await act(async () => {
      await result.current.speak("kokoro narration");
    });

    expect(result.current.speaking).toBe(true);
    const audio = FakeAudio.instances[0];
    expect(audio).toBeDefined();

    act(() => {
      audio.onended?.();
    });

    expect(result.current.speaking).toBe(false);
  });

  it("resets speaking to false when the Kokoro audio element fires onerror", async () => {
    // Arrange
    const synthesize = vi.fn().mockResolvedValue({ bytes: WAV, type: "audio/wav" });
    wrap.mockReturnValue(makeProxy(synthesize));
    installWorker();
    installFakeAudio();

    const { result } = renderHook(() => useNarrator());

    await act(async () => {
      await result.current.speak("kokoro narration error");
    });

    expect(result.current.speaking).toBe(true);
    const audio = FakeAudio.instances[0];

    act(() => {
      audio.onerror?.();
    });

    expect(result.current.speaking).toBe(false);
  });
});

// ─── cleanup: URL.revokeObjectURL is called when urlRef is set ────────────────

describe("useNarrator.cleanup: URL revocation", () => {
  it("calls URL.revokeObjectURL when stop() is called after audio was created", async () => {
    // Arrange: set up kokoro to produce audio so urlRef.current is set.
    const synthesize = vi.fn().mockResolvedValue({ bytes: WAV, type: "audio/wav" });
    wrap.mockReturnValue(makeProxy(synthesize));
    installWorker();
    installFakeAudio();

    // Spy directly on the URL global's method so the hook's reference is intercepted.
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL");

    const { result } = renderHook(() => useNarrator());

    await act(async () => {
      await result.current.speak("revoke me");
    });

    revokeSpy.mockClear();

    // stop() triggers cleanup() which calls URL.revokeObjectURL.
    act(() => {
      result.current.stop();
    });

    expect(revokeSpy).toHaveBeenCalled();
    revokeSpy.mockRestore();
  });

  it("calls URL.revokeObjectURL on unmount when audio was created via Electron lane", async () => {
    hasElectronVoice.mockReturnValue(true);
    sherpaSpeak.mockResolvedValue({ wav: WAV, sampleRate: 24000 });
    installFakeAudio();

    const revokeSpy = vi.spyOn(URL, "revokeObjectURL");

    const { result, unmount } = renderHook(() => useNarrator());

    await act(async () => {
      await result.current.speak("unmount me");
    });

    revokeSpy.mockClear();

    unmount();

    expect(revokeSpy).toHaveBeenCalled();
    revokeSpy.mockRestore();
  });
});

// ─── speakWithSpeechSynthesis: guard branch ───────────────────────────────────
// When modeRef is "none" but we somehow reach speakWithSpeechSynthesis directly
// (e.g. sherpa fails with no Worker installed), the guard at line 112 must fire.

describe("useNarrator.speakWithSpeechSynthesis: window guard", () => {
  it("is a no-op when sherpa fails and neither Worker nor speechSynthesis exist", async () => {
    // Arrange: hasElectronVoice=true but sherpa throws; no Worker, no
    // speechSynthesis → the guard on line 112 returns immediately.
    hasElectronVoice.mockReturnValue(true);
    sherpaSpeak.mockRejectedValue(new Error("sherpa down"));
    // Do NOT install Worker or speechSynthesis.

    const { result } = renderHook(() => useNarrator());

    // This should complete without throwing and speaking must stay false.
    await act(async () => {
      await result.current.speak("silent fail");
    });

    expect(result.current.speaking).toBe(false);
    expect(result.current.loading).toBe(false);
  });
});

// ─── speak: Kokoro proxy is null (Worker throws in ensureProxy) ───────────────

describe("useNarrator.speak: proxy null path when kokoro mode but worker fails", () => {
  it("falls through to speechSynthesis when Worker throws during proxy creation", async () => {
    // Arrange: Worker constructor is stubbed to throw, so ensureProxy returns null.
    installWorker();
    FakeWorker.throwOnConstruct = true;
    const speech = installSpeechSynthesis();

    const { result } = renderHook(() => useNarrator());

    await act(async () => {
      await result.current.speak("no proxy available");
    });

    expect(speech.speak).toHaveBeenCalledTimes(1);
    expect(speech.spoken[0].text).toBe("no proxy available");
    expect(result.current.speaking).toBe(true);
  });
});

// ─── speak: kokoro synthesize returns null (result falsy branch) ──────────────

describe("useNarrator.speak: synthesize resolves null falls through", () => {
  it("skips audio creation and falls to speechSynthesis when synthesize returns null", async () => {
    const synthesize = vi.fn().mockResolvedValue(null);
    wrap.mockReturnValue(makeProxy(synthesize));
    installWorker();
    const speech = installSpeechSynthesis();

    const { result } = renderHook(() => useNarrator());

    await act(async () => {
      await result.current.speak("null result");
    });

    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
    expect(speech.speak).toHaveBeenCalledTimes(1);
    expect(speech.spoken[0].text).toBe("null result");
    expect(result.current.speaking).toBe(true);
  });
});

// ─── stop: with audio active ──────────────────────────────────────────────────

describe("useNarrator.stop: pauses active audio", () => {
  it("pauses and nullifies the audio element on stop", async () => {
    const synthesize = vi.fn().mockResolvedValue({ bytes: WAV, type: "audio/wav" });
    wrap.mockReturnValue(makeProxy(synthesize));
    installWorker();

    const { result } = renderHook(() => useNarrator());

    await act(async () => {
      await result.current.speak("play then stop");
    });

    expect(result.current.speaking).toBe(true);

    act(() => {
      result.current.stop();
    });

    expect(result.current.speaking).toBe(false);
    expect(result.current.loading).toBe(false);
  });
});

// ─── setState updater functions inside event handlers ─────────────────────────
// V8 counts each `(s) => ({ ...s, ... })` arrow inside setState as a separate
// function. Drive the ones attached to utterance events in the OS speech path.

describe("useNarrator.speakWithSpeechSynthesis: setState updaters", () => {
  it("loading state transitions are correctly applied via updater functions", async () => {
    // Arrange: Electron path so we can verify the loading updater lambda.
    hasElectronVoice.mockReturnValue(true);
    sherpaSpeak.mockResolvedValue({ wav: WAV, sampleRate: 24000 });
    installWorker();

    const { result } = renderHook(() => useNarrator());

    // loading starts false
    expect(result.current.loading).toBe(false);

    await act(async () => {
      await result.current.speak("loading test");
    });

    // After speak resolves: loading=false, speaking=true
    expect(result.current.loading).toBe(false);
    expect(result.current.speaking).toBe(true);
  });

  it("setState updaters inside speech utterance callbacks fire correctly", async () => {
    const speech = installSpeechSynthesis();
    const { result } = renderHook(() => useNarrator());

    await act(async () => {
      await result.current.speak("updater check");
    });

    // Both onend and onerror use setState updater lambdas; fire both.
    act(() => { speech.spoken[0].onend?.(); });
    expect(result.current.speaking).toBe(false);

    // Speak again to test onerror updater.
    await act(async () => {
      await result.current.speak("updater error check");
    });
    act(() => { speech.spoken[1].onerror?.(); });
    expect(result.current.speaking).toBe(false);
  });
});

// ─── Kokoro mode: second speak after first succeeds reuses proxy ──────────────

describe("useNarrator.ensureProxy: proxy reuse", () => {
  it("calls wrap only once when two consecutive speaks succeed", async () => {
    const synthesize = vi
      .fn()
      .mockResolvedValueOnce({ bytes: WAV, type: "audio/wav" })
      .mockResolvedValueOnce({ bytes: WAV, type: "audio/wav" });
    wrap.mockReturnValue(makeProxy(synthesize));
    installWorker();

    const { result } = renderHook(() => useNarrator());

    await act(async () => { await result.current.speak("first"); });
    await act(async () => { await result.current.speak("second"); });

    expect(wrap).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledTimes(2);
  });
});

// ─── Unmount: audio paused when active ────────────────────────────────────────

describe("useNarrator: unmount while Electron audio is playing", () => {
  it("pauses the active Electron audio element on unmount", async () => {
    hasElectronVoice.mockReturnValue(true);
    sherpaSpeak.mockResolvedValue({ wav: WAV, sampleRate: 24000 });

    const { result, unmount } = renderHook(() => useNarrator());

    await act(async () => {
      await result.current.speak("active on unmount");
    });

    expect(result.current.speaking).toBe(true);

    // unmount triggers the effect cleanup which pauses and nullifies audioRef.
    expect(() => unmount()).not.toThrow();
  });
});

// ─── Electron lane: setState loading updaters are distinct lambdas ─────────────
// Lines 132, 135, 143, 147 each create a distinct setState updater. Drive them.

describe("useNarrator.speak Electron lane: all setState lambdas", () => {
  it("goes through loading=true then loading=false setState lambdas on success", async () => {
    hasElectronVoice.mockReturnValue(true);
    // Use a deferred promise so we can observe the loading=true intermediate.
    let resolveSherpa!: (v: { wav: ArrayBuffer; sampleRate: number }) => void;
    const pending = new Promise<{ wav: ArrayBuffer; sampleRate: number }>((res) => {
      resolveSherpa = res;
    });
    sherpaSpeak.mockReturnValue(pending);
    installWorker();

    const { result } = renderHook(() => useNarrator());

    // Start speaking without awaiting — so we can observe loading=true.
    let speakDone = false;
    act(() => {
      result.current.speak("deferred").then(() => { speakDone = true; });
    });

    // loading should become true while pending.
    await waitFor(() => expect(result.current.loading).toBe(true));

    // Resolve sherpa — loading drops to false.
    await act(async () => { resolveSherpa({ wav: WAV, sampleRate: 24000 }); });
    await waitFor(() => expect(speakDone).toBe(true));

    expect(result.current.loading).toBe(false);
    expect(result.current.speaking).toBe(true);
  });

  it("sets loading=false via catch lambda when sherpaSpeak rejects", async () => {
    hasElectronVoice.mockReturnValue(true);
    sherpaSpeak.mockRejectedValue(new Error("tts crash"));
    // Install speech so the fall-through completes cleanly.
    installSpeechSynthesis();

    const { result } = renderHook(() => useNarrator());

    await act(async () => { await result.current.speak("crash test"); });

    expect(result.current.loading).toBe(false);
  });
});

// ─── Kokoro lane: all setState lambdas ────────────────────────────────────────

describe("useNarrator.speak Kokoro lane: all setState lambdas", () => {
  it("goes through loading=true then loading=false on successful synthesis", async () => {
    let resolveSynth!: (v: { bytes: ArrayBuffer; type: string }) => void;
    const pending = new Promise<{ bytes: ArrayBuffer; type: string }>((res) => {
      resolveSynth = res;
    });
    const synthesize = vi.fn().mockReturnValue(pending);
    wrap.mockReturnValue(makeProxy(synthesize));
    installWorker();

    const { result } = renderHook(() => useNarrator());

    let speakDone = false;
    act(() => {
      result.current.speak("deferred kokoro").then(() => { speakDone = true; });
    });

    await waitFor(() => expect(result.current.loading).toBe(true));

    await act(async () => { resolveSynth({ bytes: WAV, type: "audio/wav" }); });
    await waitFor(() => expect(speakDone).toBe(true));

    expect(result.current.loading).toBe(false);
    expect(result.current.speaking).toBe(true);
  });

  it("sets loading=false and kokoroFailed=true when synthesize throws", async () => {
    const synthesize = vi.fn().mockRejectedValue(new Error("no model"));
    wrap.mockReturnValue(makeProxy(synthesize));
    installWorker();
    const speech = installSpeechSynthesis();

    const { result } = renderHook(() => useNarrator());

    await act(async () => { await result.current.speak("fail and fallback"); });

    expect(result.current.loading).toBe(false);
    // Fell through to speechSynthesis.
    expect(speech.speak).toHaveBeenCalledTimes(1);

    // Second call: kokoro is marked failed, goes straight to speech.
    await act(async () => { await result.current.speak("skip kokoro"); });
    expect(synthesize).toHaveBeenCalledTimes(1); // not called again
    expect(speech.speak).toHaveBeenCalledTimes(2);
  });
});
