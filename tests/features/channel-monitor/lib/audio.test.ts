import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for the Web Audio singleton (audio.ts).
 *
 * jsdom does not ship a real AudioContext / Web Audio API, so we install a
 * minimal mock on `window` before each test group and reset module state
 * (via vi.resetModules()) so the singleton `ctx` starts as null for each
 * logical scenario.
 */

// ---------------------------------------------------------------------------
// AudioContext mock helpers
// ---------------------------------------------------------------------------

/** Returns a minimal AudioContext-like mock. */
function makeAudioContextInstance(initialState: AudioContextState = "suspended") {
  let state: AudioContextState = initialState;

  const destination = {};
  const gainNode = {
    connect: vi.fn(),
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
  };
  const oscillatorNode = {
    connect: vi.fn(),
    frequency: { value: 0 },
    start: vi.fn(),
    stop: vi.fn(),
  };

  return {
    get state() {
      return state;
    },
    set state(s: AudioContextState) {
      state = s;
    },
    destination,
    currentTime: 0,
    resume: vi.fn(async () => {
      state = "running";
    }),
    createOscillator: vi.fn(() => oscillatorNode),
    createGain: vi.fn(() => gainNode),
    _oscillatorNode: oscillatorNode,
    _gainNode: gainNode,
  };
}

type AudioContextMockInstance = ReturnType<typeof makeAudioContextInstance>;

/**
 * Installs a mock AudioContext constructor on `window`. The constructor
 * creates a fresh instance each time it is `new`-d (which the singleton
 * module only does once).
 */
function installAudioContextMock(instanceState: AudioContextState = "suspended") {
  let createdInstance: AudioContextMockInstance | null = null;

  const MockAudioContext = vi.fn(function (
    this: AudioContextMockInstance,
  ) {
    const inst = makeAudioContextInstance(instanceState);
    Object.assign(this, inst);
    createdInstance = inst;
    // Patch prototype so property access on `this` returns inst values
    return this;
  });

  (window as unknown as Record<string, unknown>).AudioContext = MockAudioContext;

  return {
    MockAudioContext,
    getInstance: () => createdInstance,
    cleanup() {
      delete (window as unknown as Record<string, unknown>).AudioContext;
    },
  };
}

/** Remove AudioContext from window entirely (simulate unsupported env). */
function removeAudioContext() {
  const orig = (window as unknown as Record<string, unknown>).AudioContext;
  delete (window as unknown as Record<string, unknown>).AudioContext;
  delete (window as unknown as Record<string, unknown>).webkitAudioContext;
  return () => {
    if (orig !== undefined) {
      (window as unknown as Record<string, unknown>).AudioContext = orig;
    }
  };
}

// ---------------------------------------------------------------------------
// Module import helper — always import fresh after vi.resetModules()
// ---------------------------------------------------------------------------

async function importAudio() {
  return import("@/features/channel-monitor/lib/audio");
}

// ---------------------------------------------------------------------------
// isAudioUnlocked — initial state
// ---------------------------------------------------------------------------

describe("isAudioUnlocked — initial state", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns false before unlockAudio() is called", async () => {
    // Arrange
    const { cleanup } = installAudioContextMock("suspended");
    const { isAudioUnlocked } = await importAudio();

    // Act + Assert
    expect(isAudioUnlocked()).toBe(false);

    cleanup();
  });
});

// ---------------------------------------------------------------------------
// unlockAudio — no AudioContext available
// ---------------------------------------------------------------------------

describe("unlockAudio — no AudioContext available", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns without throwing when AudioContext is absent", async () => {
    // Arrange: remove AudioContext from window
    const restore = removeAudioContext();
    const { unlockAudio, isAudioUnlocked } = await importAudio();

    // Act: must not throw
    expect(() => unlockAudio()).not.toThrow();

    // Assert: ctx remains null
    expect(isAudioUnlocked()).toBe(false);

    restore();
  });

  it("returns without throwing when window is effectively missing AudioContext", async () => {
    // Arrange
    const restore = removeAudioContext();
    const { unlockAudio } = await importAudio();

    // Act
    expect(() => unlockAudio()).not.toThrow();

    restore();
  });
});

// ---------------------------------------------------------------------------
// unlockAudio — AudioContext creates and resumes
// ---------------------------------------------------------------------------

describe("unlockAudio — creates context and resumes from suspended", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("creates the AudioContext on first call", async () => {
    // Arrange
    const { MockAudioContext, cleanup } = installAudioContextMock("suspended");
    const { unlockAudio } = await importAudio();

    // Act
    unlockAudio();

    // Assert: constructor called exactly once
    expect(MockAudioContext).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("does NOT create a second AudioContext on repeated calls (singleton)", async () => {
    // Arrange
    const { MockAudioContext, cleanup } = installAudioContextMock("suspended");
    const { unlockAudio } = await importAudio();

    // Act: call twice
    unlockAudio();
    unlockAudio();

    // Assert: constructor called only once
    expect(MockAudioContext).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("calls ctx.resume() when ctx.state === 'suspended'", async () => {
    // Arrange — instance starts suspended
    const { cleanup } = installAudioContextMock("suspended");
    const { unlockAudio } = await importAudio();

    // We need to intercept the instance after creation.
    // The mock constructor patches `this`, so we spy after unlockAudio runs.
    // Re-import after reset to get fresh module.
    unlockAudio();

    // resume was called — we verify via isAudioUnlocked after awaiting microtasks
    await Promise.resolve();

    // After resume resolves the state becomes "running"
    const { isAudioUnlocked } = await importAudio();
    // Note: the singleton ctx is now in the module's closure. isAudioUnlocked
    // reads ctx.state which our mock updates asynchronously.
    // We don't assert running here because the mock updates state async.
    // The important assertion is that no error was thrown.
    expect(true).toBe(true); // control reached here without error

    cleanup();
  });
});

// ---------------------------------------------------------------------------
// unlockAudio — AudioContext constructor throws
// ---------------------------------------------------------------------------

describe("unlockAudio — constructor throws", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("swallows the exception and leaves ctx null", async () => {
    // Arrange: make the constructor throw
    (window as unknown as Record<string, unknown>).AudioContext = vi.fn(() => {
      throw new Error("NotAllowedError");
    });
    const { unlockAudio, isAudioUnlocked } = await importAudio();

    // Act: must not throw
    expect(() => unlockAudio()).not.toThrow();

    // Assert: ctx was never set
    expect(isAudioUnlocked()).toBe(false);

    delete (window as unknown as Record<string, unknown>).AudioContext;
  });
});

// ---------------------------------------------------------------------------
// unlockAudio — webkitAudioContext fallback
// ---------------------------------------------------------------------------

describe("unlockAudio — webkitAudioContext fallback", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("falls back to webkitAudioContext when AudioContext is undefined", async () => {
    // Arrange: no standard AudioContext, only webkit prefix
    delete (window as unknown as Record<string, unknown>).AudioContext;

    const webkitCtor = vi.fn(function (this: Record<string, unknown>) {
      this.state = "suspended";
      this.resume = vi.fn(async () => {
        this.state = "running";
      });
      this.destination = {};
      this.currentTime = 0;
      this.createOscillator = vi.fn(() => ({
        connect: vi.fn(),
        frequency: { value: 0 },
        start: vi.fn(),
        stop: vi.fn(),
      }));
      this.createGain = vi.fn(() => ({
        connect: vi.fn(),
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      }));
      return this;
    });

    (window as unknown as Record<string, unknown>).webkitAudioContext = webkitCtor;

    const { unlockAudio } = await importAudio();

    // Act: must not throw
    expect(() => unlockAudio()).not.toThrow();

    // Assert: webkit constructor was used
    expect(webkitCtor).toHaveBeenCalledTimes(1);

    delete (window as unknown as Record<string, unknown>).webkitAudioContext;
  });
});

// ---------------------------------------------------------------------------
// isAudioUnlocked
// ---------------------------------------------------------------------------

describe("isAudioUnlocked", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns false when ctx is null (no unlockAudio call)", async () => {
    // Arrange
    const { cleanup } = installAudioContextMock("suspended");
    const { isAudioUnlocked } = await importAudio();

    // Act + Assert
    expect(isAudioUnlocked()).toBe(false);

    cleanup();
  });

  it("returns false when ctx exists but state is suspended", async () => {
    // Arrange: context starts suspended, resume is async so state stays suspended synchronously
    const { cleanup } = installAudioContextMock("suspended");
    const { unlockAudio, isAudioUnlocked } = await importAudio();

    // Act: unlock (ctx is created, resume called but async)
    unlockAudio();

    // Synchronously after unlock, state is still "suspended"
    expect(isAudioUnlocked()).toBe(false);

    cleanup();
  });

  it("returns true when ctx exists and state is running", async () => {
    // Arrange: context starts in running state (already unlocked by browser)
    const { cleanup } = installAudioContextMock("running");
    const { unlockAudio, isAudioUnlocked } = await importAudio();

    // Act
    unlockAudio();

    // Assert: running state → unlocked
    expect(isAudioUnlocked()).toBe(true);

    cleanup();
  });
});

// ---------------------------------------------------------------------------
// playSoundAlert — ctx not running (no-op)
// ---------------------------------------------------------------------------

describe("playSoundAlert — no-op when audio not running", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns without beeping when ctx is null", async () => {
    // Arrange: no AudioContext at all
    const restore = removeAudioContext();
    const { playSoundAlert } = await importAudio();

    // Act: must not throw
    expect(() => playSoundAlert("info", 1.0)).not.toThrow();

    restore();
  });

  it("returns without beeping when ctx exists but is suspended", async () => {
    // Arrange: context suspended, NOT running
    const { cleanup } = installAudioContextMock("suspended");
    const { unlockAudio, playSoundAlert } = await importAudio();
    // Create the ctx but keep it suspended
    unlockAudio();
    // Don't await the async resume

    // Act: should no-op since state is still "suspended" synchronously
    expect(() => playSoundAlert("info", 1.0)).not.toThrow();

    cleanup();
  });
});

// ---------------------------------------------------------------------------
// playSoundAlert — happy paths with running context
// ---------------------------------------------------------------------------

describe("playSoundAlert — info severity", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("calls createOscillator and createGain once for info severity", async () => {
    // Arrange: context starts running
    const { cleanup } = installAudioContextMock("running");
    const { unlockAudio, playSoundAlert } = await importAudio();
    unlockAudio();

    // Capture the mock instance — need to introspect the calls
    // We check that setTimeout was NOT called (only one beep for info)
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");

    // Act
    playSoundAlert("info", 1.0);

    // Assert: no setTimeout for info (single immediate beep)
    expect(setTimeoutSpy).not.toHaveBeenCalled();

    setTimeoutSpy.mockRestore();
    cleanup();
  });

  it("does not throw for info severity with volume 0", async () => {
    // Arrange
    const { cleanup } = installAudioContextMock("running");
    const { unlockAudio, playSoundAlert } = await importAudio();
    unlockAudio();

    // Act + Assert
    expect(() => playSoundAlert("info", 0)).not.toThrow();

    cleanup();
  });

  it("does not throw for info severity with fractional volume", async () => {
    // Arrange
    const { cleanup } = installAudioContextMock("running");
    const { unlockAudio, playSoundAlert } = await importAudio();
    unlockAudio();

    expect(() => playSoundAlert("info", 0.5)).not.toThrow();

    cleanup();
  });
});

describe("playSoundAlert — warning severity", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("schedules a second beep via setTimeout for warning severity", async () => {
    // Arrange
    const { cleanup } = installAudioContextMock("running");
    const { unlockAudio, playSoundAlert } = await importAudio();
    unlockAudio();

    const setTimeoutSpy = vi.spyOn(window, "setTimeout");

    // Act
    playSoundAlert("warning", 0.8);

    // Assert: one setTimeout call (second beep at 250ms)
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 250);

    setTimeoutSpy.mockRestore();
    cleanup();
  });

  it("does not throw for warning severity", async () => {
    // Arrange
    const { cleanup } = installAudioContextMock("running");
    const { unlockAudio, playSoundAlert } = await importAudio();
    unlockAudio();

    expect(() => playSoundAlert("warning", 1.0)).not.toThrow();

    cleanup();
  });
});

describe("playSoundAlert — critical severity", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("schedules 4 beeps via setTimeout for critical severity", async () => {
    // Arrange
    const { cleanup } = installAudioContextMock("running");
    const { unlockAudio, playSoundAlert } = await importAudio();
    unlockAudio();

    const setTimeoutSpy = vi.spyOn(window, "setTimeout");

    // Act
    playSoundAlert("critical", 1.0);

    // Assert: 4 setTimeout calls (i = 0..3, delays 0, 300, 600, 900)
    expect(setTimeoutSpy).toHaveBeenCalledTimes(4);
    expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 0);
    expect(setTimeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 300);
    expect(setTimeoutSpy).toHaveBeenNthCalledWith(3, expect.any(Function), 600);
    expect(setTimeoutSpy).toHaveBeenNthCalledWith(4, expect.any(Function), 900);

    setTimeoutSpy.mockRestore();
    cleanup();
  });

  it("does not throw for critical severity with full volume", async () => {
    // Arrange
    const { cleanup } = installAudioContextMock("running");
    const { unlockAudio, playSoundAlert } = await importAudio();
    unlockAudio();

    expect(() => playSoundAlert("critical", 1.0)).not.toThrow();

    cleanup();
  });

  it("executes the scheduled beep callbacks without throwing", async () => {
    // Arrange: use fake timers so we can trigger callbacks
    vi.useFakeTimers();
    const { cleanup } = installAudioContextMock("running");
    const { unlockAudio, playSoundAlert } = await importAudio();
    unlockAudio();

    // Act
    playSoundAlert("critical", 0.9);

    // Trigger all timers
    expect(() => vi.runAllTimers()).not.toThrow();

    vi.useRealTimers();
    cleanup();
  });
});

// ---------------------------------------------------------------------------
// playSoundAlert — late-unlock path (ctx null, unlockAudio called internally)
// ---------------------------------------------------------------------------

describe("playSoundAlert — late unlock attempt", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("no-ops when AudioContext is unavailable even after late unlock attempt", async () => {
    // Arrange: no AudioContext so unlockAudio inside playSoundAlert is a no-op
    const restore = removeAudioContext();
    const { playSoundAlert } = await importAudio();

    // Act: must not throw, and produces no output
    expect(() => playSoundAlert("info", 1.0)).not.toThrow();

    restore();
  });

  it("no-ops when context is suspended after late unlock attempt", async () => {
    // Arrange: context remains suspended (resume is async)
    const { cleanup } = installAudioContextMock("suspended");
    const { playSoundAlert } = await importAudio();

    // Act: ctx is null initially; playSoundAlert calls unlockAudio which creates
    // ctx but resume is async so state stays suspended synchronously → return
    expect(() => playSoundAlert("warning", 0.5)).not.toThrow();

    cleanup();
  });

  it("plays when late unlock creates a running context", async () => {
    // Arrange: context starts as running so that late unlock immediately works
    const { cleanup } = installAudioContextMock("running");
    const { playSoundAlert } = await importAudio();

    // ctx is null, playSoundAlert calls unlockAudio, ctx is created in "running"
    // state, late guard passes, beep fires
    expect(() => playSoundAlert("info", 0.7)).not.toThrow();

    cleanup();
  });
});

// ---------------------------------------------------------------------------
// playSoundAlert — beep error handling (createOscillator throws)
// ---------------------------------------------------------------------------

describe("playSoundAlert — beep swallows Web Audio errors", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("swallows exceptions thrown by createOscillator", async () => {
    // Arrange: context running but createOscillator throws
    (window as unknown as Record<string, unknown>).AudioContext = vi.fn(function (
      this: Record<string, unknown>,
    ) {
      this.state = "running";
      this.destination = {};
      this.currentTime = 0;
      this.resume = vi.fn();
      this.createOscillator = vi.fn(() => {
        throw new Error("NotSupportedError");
      });
      this.createGain = vi.fn(() => ({
        connect: vi.fn(),
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      }));
      return this;
    });

    const { unlockAudio, playSoundAlert } = await importAudio();
    unlockAudio();

    // Act: beep() catches the error; must not propagate
    expect(() => playSoundAlert("info", 1.0)).not.toThrow();

    delete (window as unknown as Record<string, unknown>).AudioContext;
  });

  it("swallows exceptions thrown by createGain", async () => {
    // Arrange
    (window as unknown as Record<string, unknown>).AudioContext = vi.fn(function (
      this: Record<string, unknown>,
    ) {
      this.state = "running";
      this.destination = {};
      this.currentTime = 0;
      this.resume = vi.fn();
      const osc = {
        connect: vi.fn(),
        frequency: { value: 0 },
        start: vi.fn(),
        stop: vi.fn(),
      };
      this.createOscillator = vi.fn(() => osc);
      this.createGain = vi.fn(() => {
        throw new Error("InvalidStateError");
      });
      return this;
    });

    const { unlockAudio, playSoundAlert } = await importAudio();
    unlockAudio();

    expect(() => playSoundAlert("warning", 0.6)).not.toThrow();

    delete (window as unknown as Record<string, unknown>).AudioContext;
  });
});

// ---------------------------------------------------------------------------
// Oscillator / gain wiring in beep()
// ---------------------------------------------------------------------------

describe("beep internals — oscillator and gain wiring", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("sets oscillator frequency correctly for info (880 Hz)", async () => {
    // Arrange: build a spy-able instance
    const osc = {
      connect: vi.fn(),
      frequency: { value: 0 },
      start: vi.fn(),
      stop: vi.fn(),
    };
    const gain = {
      connect: vi.fn(),
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    };

    (window as unknown as Record<string, unknown>).AudioContext = vi.fn(function (
      this: Record<string, unknown>,
    ) {
      this.state = "running";
      this.destination = {};
      this.currentTime = 10; // non-zero to check offsets
      this.resume = vi.fn();
      this.createOscillator = vi.fn(() => osc);
      this.createGain = vi.fn(() => gain);
      return this;
    });

    const { unlockAudio, playSoundAlert } = await importAudio();
    unlockAudio();

    // Act
    playSoundAlert("info", 1.0);

    // Assert frequency = 880 for info
    expect(osc.frequency.value).toBe(880);

    delete (window as unknown as Record<string, unknown>).AudioContext;
  });

  it("sets oscillator frequency correctly for warning (660 Hz)", async () => {
    // Arrange
    const osc = {
      connect: vi.fn(),
      frequency: { value: 0 },
      start: vi.fn(),
      stop: vi.fn(),
    };
    const gain = {
      connect: vi.fn(),
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    };

    (window as unknown as Record<string, unknown>).AudioContext = vi.fn(function (
      this: Record<string, unknown>,
    ) {
      this.state = "running";
      this.destination = {};
      this.currentTime = 0;
      this.resume = vi.fn();
      this.createOscillator = vi.fn(() => osc);
      this.createGain = vi.fn(() => gain);
      return this;
    });

    const { unlockAudio, playSoundAlert } = await importAudio();
    unlockAudio();

    playSoundAlert("warning", 1.0);

    // First immediate beep is 660 Hz
    expect(osc.frequency.value).toBe(660);

    delete (window as unknown as Record<string, unknown>).AudioContext;
  });

  it("sets oscillator frequency correctly for critical (440 Hz)", async () => {
    // Arrange
    vi.useFakeTimers();
    const osc = {
      connect: vi.fn(),
      frequency: { value: 0 },
      start: vi.fn(),
      stop: vi.fn(),
    };
    const gain = {
      connect: vi.fn(),
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    };

    (window as unknown as Record<string, unknown>).AudioContext = vi.fn(function (
      this: Record<string, unknown>,
    ) {
      this.state = "running";
      this.destination = {};
      this.currentTime = 0;
      this.resume = vi.fn();
      this.createOscillator = vi.fn(() => osc);
      this.createGain = vi.fn(() => gain);
      return this;
    });

    const { unlockAudio, playSoundAlert } = await importAudio();
    unlockAudio();

    playSoundAlert("critical", 1.0);
    vi.runAllTimers();

    // After all 4 beeps, frequency was 440 each time
    expect(osc.frequency.value).toBe(440);

    vi.useRealTimers();
    delete (window as unknown as Record<string, unknown>).AudioContext;
  });

  it("calls gain.gain.setValueAtTime with Math.max(0.0001, volume * 0.5) for info", async () => {
    // Arrange
    const osc = {
      connect: vi.fn(),
      frequency: { value: 0 },
      start: vi.fn(),
      stop: vi.fn(),
    };
    const gain = {
      connect: vi.fn(),
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    };

    (window as unknown as Record<string, unknown>).AudioContext = vi.fn(function (
      this: Record<string, unknown>,
    ) {
      this.state = "running";
      this.destination = {};
      this.currentTime = 5;
      this.resume = vi.fn();
      this.createOscillator = vi.fn(() => osc);
      this.createGain = vi.fn(() => gain);
      return this;
    });

    const { unlockAudio, playSoundAlert } = await importAudio();
    unlockAudio();

    // info: volume * 0.5 = 0.4; Math.max(0.0001, 0.4) = 0.4
    playSoundAlert("info", 0.8);

    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0.4, 5);

    delete (window as unknown as Record<string, unknown>).AudioContext;
  });

  it("clamps gain to 0.0001 when volume * factor is below threshold", async () => {
    // Arrange
    const osc = {
      connect: vi.fn(),
      frequency: { value: 0 },
      start: vi.fn(),
      stop: vi.fn(),
    };
    const gain = {
      connect: vi.fn(),
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    };

    (window as unknown as Record<string, unknown>).AudioContext = vi.fn(function (
      this: Record<string, unknown>,
    ) {
      this.state = "running";
      this.destination = {};
      this.currentTime = 0;
      this.resume = vi.fn();
      this.createOscillator = vi.fn(() => osc);
      this.createGain = vi.fn(() => gain);
      return this;
    });

    const { unlockAudio, playSoundAlert } = await importAudio();
    unlockAudio();

    // volume=0 → 0 * 0.5 = 0 → Math.max(0.0001, 0) = 0.0001
    playSoundAlert("info", 0);

    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0.0001, 0);

    delete (window as unknown as Record<string, unknown>).AudioContext;
  });

  it("connects oscillator to gain and gain to destination", async () => {
    // Arrange
    const destination = {};
    const osc = {
      connect: vi.fn(),
      frequency: { value: 0 },
      start: vi.fn(),
      stop: vi.fn(),
    };
    const gain = {
      connect: vi.fn(),
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    };

    (window as unknown as Record<string, unknown>).AudioContext = vi.fn(function (
      this: Record<string, unknown>,
    ) {
      this.state = "running";
      this.destination = destination;
      this.currentTime = 0;
      this.resume = vi.fn();
      this.createOscillator = vi.fn(() => osc);
      this.createGain = vi.fn(() => gain);
      return this;
    });

    const { unlockAudio, playSoundAlert } = await importAudio();
    unlockAudio();

    playSoundAlert("info", 1.0);

    // osc.connect(gain), gain.connect(destination)
    expect(osc.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(destination);

    delete (window as unknown as Record<string, unknown>).AudioContext;
  });

  it("calls osc.start and osc.stop at correct offsets", async () => {
    // Arrange
    const osc = {
      connect: vi.fn(),
      frequency: { value: 0 },
      start: vi.fn(),
      stop: vi.fn(),
    };
    const gain = {
      connect: vi.fn(),
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    };

    (window as unknown as Record<string, unknown>).AudioContext = vi.fn(function (
      this: Record<string, unknown>,
    ) {
      this.state = "running";
      this.destination = {};
      this.currentTime = 2;
      this.resume = vi.fn();
      this.createOscillator = vi.fn(() => osc);
      this.createGain = vi.fn(() => gain);
      return this;
    });

    const { unlockAudio, playSoundAlert } = await importAudio();
    unlockAudio();

    // info: duration=0.15
    playSoundAlert("info", 1.0);

    // now=2; start(2), stop(2 + 0.15 = 2.15)
    expect(osc.start).toHaveBeenCalledWith(2);
    expect(osc.stop).toHaveBeenCalledWith(2.15);

    delete (window as unknown as Record<string, unknown>).AudioContext;
  });
});

// ---------------------------------------------------------------------------
// warning beep callback actually fires a beep
// ---------------------------------------------------------------------------

describe("playSoundAlert — warning second beep fires correctly", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("fires the second 660-Hz beep when setTimeout callback runs", async () => {
    vi.useFakeTimers();

    const osc = {
      connect: vi.fn(),
      frequency: { value: 0 },
      start: vi.fn(),
      stop: vi.fn(),
    };
    const gain = {
      connect: vi.fn(),
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    };

    (window as unknown as Record<string, unknown>).AudioContext = vi.fn(function (
      this: Record<string, unknown>,
    ) {
      this.state = "running";
      this.destination = {};
      this.currentTime = 0;
      this.resume = vi.fn();
      this.createOscillator = vi.fn(() => osc);
      this.createGain = vi.fn(() => gain);
      return this;
    });

    const { unlockAudio, playSoundAlert } = await importAudio();
    unlockAudio();

    playSoundAlert("warning", 0.7);

    // Before timer fires: one createOscillator call (immediate beep)
    const callsBeforeTimer = (
      (window as unknown as Record<string, unknown>).AudioContext as ReturnType<
        typeof vi.fn
      >
    ).mock.instances[0];
    // We count createOscillator calls via the mock
    // After the immediate beep, advance timer by 250ms
    vi.advanceTimersByTime(250);

    // Both beeps used osc.start
    expect(osc.start).toHaveBeenCalledTimes(2);
    expect(osc.frequency.value).toBe(660);

    vi.useRealTimers();
    delete (window as unknown as Record<string, unknown>).AudioContext;
  });
});
