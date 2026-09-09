import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────
//
// External/IO boundaries mocked so the real hook logic runs and counts toward
// coverage without touching IndexedDB, driver.js, or Next.js router.
//
// Mocks must be declared before the actual imports (Vitest hoists vi.mock calls).

const getAllTourStatesMock = vi.fn<[], Promise<Map<string, unknown>>>();
const resetTourMock = vi.fn<[string], Promise<void>>();
const resetAllToursMock = vi.fn<[], Promise<void>>();

vi.mock("@/features/help/lib/onboarding-db", () => ({
  getAllTourStates: () => getAllTourStatesMock(),
  resetTour: (id: string) => resetTourMock(id),
  resetAllTours: () => resetAllToursMock(),
  // Other exports not used by the hook:
  saveTourProgress: vi.fn(async () => {}),
  getTourState: vi.fn(async () => undefined),
  addFeedback: vi.fn(async () => null),
  listFeedback: vi.fn(async () => []),
  countFeedback: vi.fn(async () => 0),
  markSeen: vi.fn(async () => {}),
  hasSeen: vi.fn(async () => false),
  onboardingDb: {},
  HELP_APP_VERSION: "0.1.0",
}));

// Fake runner object that each createTourRunner call returns.
const fakeRunner = {
  start: vi.fn<[unknown], Promise<void>>(async () => {}),
  stop: vi.fn<[], void>(),
  isActive: vi.fn<[], boolean>(() => false),
};
vi.mock("@/features/help/lib/tour-runner", () => ({
  createTourRunner: vi.fn(() => fakeRunner),
}));

// driver.js is pulled in transitively; provide an empty stub so jsdom doesn't choke.
vi.mock("driver.js", () => ({ driver: vi.fn(() => ({})) }));
vi.mock("driver.js/dist/driver.css", () => ({}));

// Next.js router — we only need push.
const pushMock = vi.fn<[string], void>();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import type { TourDefinition } from "@/features/help/data/tours";
import type { TourState } from "@/features/help/lib/onboarding-db";
import { ALL_TOURS, useOnboarding } from "@/features/help/lib/use-onboarding";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTourState(tourId: string, completed = false, stepReached = 0): TourState {
  return { tourId, completed, stepReached, updatedAt: Date.now() };
}

function makeTour(id = "test-tour"): TourDefinition {
  return {
    id,
    title: "Test tour",
    description: "A test tour",
    steps: [{ element: "body", popover: { title: "t", description: "d" } }],
  };
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  // Default: Dexie read returns an empty map, no errors.
  getAllTourStatesMock.mockResolvedValue(new Map());
  resetTourMock.mockResolvedValue(undefined);
  resetAllToursMock.mockResolvedValue(undefined);

  fakeRunner.start.mockClear();
  fakeRunner.stop.mockClear();
  fakeRunner.isActive.mockClear();
  fakeRunner.isActive.mockReturnValue(false);

  pushMock.mockClear();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

// =============================================================================
// Initial state
// =============================================================================

describe("useOnboarding — initial state", () => {
  it("starts with loading=true and an empty states Map", async () => {
    // Freeze the Dexie read so we can sample the loading=true window.
    let resolveDb!: (v: Map<string, TourState>) => void;
    getAllTourStatesMock.mockReturnValue(
      new Promise<Map<string, TourState>>((res) => {
        resolveDb = res;
      }),
    );

    const { result } = renderHook(() => useOnboarding());

    // Before the async read settles the hook must be in the loading state.
    expect(result.current.loading).toBe(true);
    expect(result.current.states.size).toBe(0);

    // Settle the promise so the hook can clean up properly.
    await act(async () => {
      resolveDb(new Map());
    });
  });

  it("resolves loading=false once Dexie returns", async () => {
    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("populates states from the Dexie map", async () => {
    const ts = makeTourState("global-onboarding", true, 6);
    getAllTourStatesMock.mockResolvedValue(new Map([["global-onboarding", ts]]));

    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => {
      expect(result.current.states.size).toBe(1);
    });
    expect(result.current.states.get("global-onboarding")).toEqual(ts);
  });

  it("exposes a runner object", async () => {
    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    // runner is the fake created by the mocked createTourRunner.
    expect(result.current.runner).toBe(fakeRunner);
  });

  it("exposes runner.stop as the stop function", async () => {
    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.stop).toBe(fakeRunner.stop);
  });
});

// =============================================================================
// IndexedDB error handling
// =============================================================================

describe("useOnboarding — IndexedDB unavailable", () => {
  it("falls back to an empty Map when getAllTourStates rejects", async () => {
    getAllTourStatesMock.mockRejectedValue(new Error("IndexedDB unavailable"));

    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.states.size).toBe(0);
  });

  it("still sets loading=false even when the read throws", async () => {
    getAllTourStatesMock.mockRejectedValue(new Error("private mode"));

    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });
});

// =============================================================================
// isCompleted
// =============================================================================

describe("useOnboarding — isCompleted", () => {
  it("returns false for an unknown tourId", async () => {
    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isCompleted("nonexistent")).toBe(false);
  });

  it("returns false for a known but incomplete tour", async () => {
    getAllTourStatesMock.mockResolvedValue(new Map([["my-tour", makeTourState("my-tour", false)]]));

    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isCompleted("my-tour")).toBe(false);
  });

  it("returns true for a completed tour", async () => {
    getAllTourStatesMock.mockResolvedValue(
      new Map([["done-tour", makeTourState("done-tour", true)]]),
    );

    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isCompleted("done-tour")).toBe(true);
  });
});

// =============================================================================
// refresh()
// =============================================================================

describe("useOnboarding — refresh", () => {
  it("re-reads Dexie and updates states", async () => {
    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Now provide a second read result.
    const ts = makeTourState("global-onboarding", false, 3);
    getAllTourStatesMock.mockResolvedValue(new Map([["global-onboarding", ts]]));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.states.get("global-onboarding")).toEqual(ts);
  });

  it("treats a Dexie rejection in refresh() as an empty map", async () => {
    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    getAllTourStatesMock.mockRejectedValue(new Error("fail"));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.states.size).toBe(0);
  });

  it("does not call getAllTourStates again if the component unmounted before it settles", async () => {
    // We just verify that unmounting doesn't throw and the cleanup runs.
    let resolveDb!: (v: Map<string, TourState>) => void;
    const latched = new Promise<Map<string, TourState>>((res) => {
      resolveDb = res;
    });
    getAllTourStatesMock.mockReturnValue(latched);

    const { unmount } = renderHook(() => useOnboarding());

    unmount();

    // Settle after unmount — should not update state (no throw expected).
    await act(async () => {
      resolveDb(new Map());
    });
    // No assertion needed: the test passes if nothing throws.
  });
});

// =============================================================================
// reset(tourId)
// =============================================================================

describe("useOnboarding — reset", () => {
  it("calls resetTour with the given id then refreshes", async () => {
    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.reset("my-tour");
    });

    expect(resetTourMock).toHaveBeenCalledWith("my-tour");
    // refresh is called after reset — getAllTourStates is called at mount (1) + here (1).
    expect(getAllTourStatesMock).toHaveBeenCalledTimes(2);
  });

  it("updates states after reset by re-reading Dexie", async () => {
    getAllTourStatesMock
      .mockResolvedValueOnce(new Map([["my-tour", makeTourState("my-tour", true)]]))
      .mockResolvedValueOnce(new Map()); // after reset the row is gone

    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => {
      expect(result.current.states.size).toBe(1);
    });

    await act(async () => {
      await result.current.reset("my-tour");
    });

    expect(result.current.states.size).toBe(0);
  });
});

// =============================================================================
// resetAll()
// =============================================================================

describe("useOnboarding — resetAll", () => {
  it("calls resetAllTours then refreshes", async () => {
    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.resetAll();
    });

    expect(resetAllToursMock).toHaveBeenCalledTimes(1);
    // Refresh triggered: mount call + resetAll call.
    expect(getAllTourStatesMock).toHaveBeenCalledTimes(2);
  });

  it("clears states after resetAll", async () => {
    getAllTourStatesMock
      .mockResolvedValueOnce(
        new Map([
          ["t1", makeTourState("t1", true)],
          ["t2", makeTourState("t2", false)],
        ]),
      )
      .mockResolvedValueOnce(new Map());

    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => {
      expect(result.current.states.size).toBe(2);
    });

    await act(async () => {
      await result.current.resetAll();
    });

    expect(result.current.states.size).toBe(0);
  });
});

// =============================================================================
// startTour()
// =============================================================================

describe("useOnboarding — startTour", () => {
  it("calls runner.start with the given tour definition", async () => {
    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const tour = makeTour("global-onboarding");

    await act(async () => {
      await result.current.startTour(tour);
    });

    expect(fakeRunner.start).toHaveBeenCalledWith(tour);
  });

  it("schedules a refresh via setTimeout after startTour (runner inactive path)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    fakeRunner.isActive.mockReturnValue(false);

    // Use real Promise resolution for getAllTourStates so the hook can load.
    getAllTourStatesMock.mockResolvedValue(new Map());

    const { result } = renderHook(() => useOnboarding());

    // Let the initial load settle by running pending microtasks.
    await act(async () => {
      await Promise.resolve();
    });
    // Force loading to complete.
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const callsBefore = getAllTourStatesMock.mock.calls.length;

    await act(async () => {
      await result.current.startTour(makeTour());
    });

    // Advance past the 500ms setTimeout.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    // The delayed refresh should have fired (runner is inactive).
    expect(getAllTourStatesMock.mock.calls.length).toBeGreaterThan(callsBefore);

    vi.useRealTimers();
  });

  it("adds a window focus listener when the runner is still active after the delay", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    fakeRunner.isActive.mockReturnValue(true);

    getAllTourStatesMock.mockResolvedValue(new Map());

    const addEventListenerSpy = vi.spyOn(window, "addEventListener");

    const { result } = renderHook(() => useOnboarding());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    addEventListenerSpy.mockClear();

    await act(async () => {
      await result.current.startTour(makeTour());
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(addEventListenerSpy).toHaveBeenCalledWith("focus", expect.any(Function));

    addEventListenerSpy.mockRestore();
    vi.useRealTimers();
  });

  it("the focus listener refreshes and removes itself when the runner becomes inactive", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    getAllTourStatesMock.mockResolvedValue(new Map());

    const capturedListeners: Array<EventListenerOrEventListenerObject> = [];
    const realAddEventListener = window.addEventListener.bind(window);
    const addEventListenerSpy = vi
      .spyOn(window, "addEventListener")
      .mockImplementation(
        (type: string, listener: EventListenerOrEventListenerObject, opts?: unknown) => {
          if (type === "focus") {
            capturedListeners.push(listener);
          } else {
            // Pass through non-focus listeners so timers still work.
            (realAddEventListener as typeof window.addEventListener)(
              type as any,
              listener as any,
              opts as any,
            );
          }
        },
      );
    const removeEventListenerSpy = vi
      .spyOn(window, "removeEventListener")
      .mockImplementation(() => {});

    // First isActive call (inside setTimeout): runner is active → register listener.
    // Second isActive call (inside focus listener): runner is now inactive → refresh+remove.
    fakeRunner.isActive
      .mockReturnValueOnce(true) // setTimeout check
      .mockReturnValueOnce(false); // onLeave check

    const { result } = renderHook(() => useOnboarding());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const beforeRefreshCount = getAllTourStatesMock.mock.calls.length;

    await act(async () => {
      await result.current.startTour(makeTour());
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    // Fire the focus event manually.
    expect(capturedListeners.length).toBeGreaterThan(0);
    const listener = capturedListeners[capturedListeners.length - 1];

    await act(async () => {
      if (typeof listener === "function") {
        listener(new Event("focus"));
      } else {
        listener.handleEvent(new Event("focus"));
      }
      await Promise.resolve();
    });

    // refresh was called (getAllTourStates invoked again).
    expect(getAllTourStatesMock.mock.calls.length).toBeGreaterThan(beforeRefreshCount);
    // removeEventListener was called with "focus" and the listener.
    expect(removeEventListenerSpy).toHaveBeenCalledWith("focus", listener);

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
    vi.useRealTimers();
  });

  it("focus listener does NOT refresh when runner is still active", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    getAllTourStatesMock.mockResolvedValue(new Map());

    const capturedListeners: Array<EventListenerOrEventListenerObject> = [];
    const realAddEventListener = window.addEventListener.bind(window);
    const addEventListenerSpy = vi
      .spyOn(window, "addEventListener")
      .mockImplementation(
        (type: string, listener: EventListenerOrEventListenerObject, opts?: unknown) => {
          if (type === "focus") {
            capturedListeners.push(listener);
          } else {
            (realAddEventListener as typeof window.addEventListener)(
              type as any,
              listener as any,
              opts as any,
            );
          }
        },
      );
    const removeEventListenerSpy = vi
      .spyOn(window, "removeEventListener")
      .mockImplementation(() => {});

    // Both isActive calls return true (setTimeout + focus listener checks).
    fakeRunner.isActive.mockReturnValue(true);

    const { result } = renderHook(() => useOnboarding());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await act(async () => {
      await result.current.startTour(makeTour());
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    const beforeCount = getAllTourStatesMock.mock.calls.length;

    expect(capturedListeners.length).toBeGreaterThan(0);
    const listener = capturedListeners[capturedListeners.length - 1];

    await act(async () => {
      if (typeof listener === "function") {
        listener(new Event("focus"));
      } else {
        listener.handleEvent(new Event("focus"));
      }
      await Promise.resolve();
    });

    // Runner still active → no refresh, no removeEventListener.
    expect(getAllTourStatesMock.mock.calls.length).toBe(beforeCount);
    expect(removeEventListenerSpy).not.toHaveBeenCalled();

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
    vi.useRealTimers();
  });
});

// =============================================================================
// Unmount cleanup
// =============================================================================

describe("useOnboarding — cleanup on unmount", () => {
  it("calls runner.stop when the component unmounts", async () => {
    const { result, unmount } = renderHook(() => useOnboarding());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    unmount();

    expect(fakeRunner.stop).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// ALL_TOURS re-export
// =============================================================================

describe("ALL_TOURS re-export", () => {
  it("is an array with at least one tour", () => {
    expect(Array.isArray(ALL_TOURS)).toBe(true);
    expect(ALL_TOURS.length).toBeGreaterThan(0);
  });

  it("contains a global-onboarding tour", () => {
    const ids = ALL_TOURS.map((t) => t.id);
    expect(ids).toContain("global-onboarding");
  });

  it("every tour has an id, title, description and steps array", () => {
    for (const t of ALL_TOURS) {
      expect(typeof t.id).toBe("string");
      expect(typeof t.title).toBe("string");
      expect(typeof t.description).toBe("string");
      expect(Array.isArray(t.steps)).toBe(true);
    }
  });
});

// =============================================================================
// Return shape
// =============================================================================

describe("useOnboarding — return shape", () => {
  it("exposes all required fields", async () => {
    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const keys: Array<keyof typeof result.current> = [
      "states",
      "loading",
      "isCompleted",
      "startTour",
      "reset",
      "resetAll",
      "refresh",
      "stop",
      "runner",
    ];

    for (const key of keys) {
      expect(result.current).toHaveProperty(key);
    }
  });

  it("states is a Map instance", async () => {
    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.states).toBeInstanceOf(Map);
  });
});
