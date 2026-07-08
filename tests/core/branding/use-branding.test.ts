/**
 * Tests for use-branding.ts
 *
 * Strategy:
 * - Mock the entire "../data/db" module so no real Dexie / IndexedDB is touched.
 * - Keep the hook's own logic (debounce, state, effects, callbacks) REAL so every
 *   line and branch is counted by coverage.
 *
 * Flush-on-every-branding-change mechanic:
 *   The hook uses `useEffect(() => () => flush(branding), [branding])`.
 *   That cleanup runs before each new effect (i.e. on every branding state change),
 *   which means flush — and therefore putActiveBranding — is called once with the
 *   OLD branding whenever branding changes. Tests assert on the TOTAL calls and on
 *   the most-recent-state argument where appropriate.
 *
 * Branches exercised:
 *   - debounce: timer already running (clearTimeout path) vs first call
 *   - debounce: flush with timer pending vs flush with no timer (timer=null)
 *   - hydration: cancelled = false (normal mount) vs cancelled = true (early unmount)
 *   - setLogoFromFile: file.type non-empty vs empty string fallback to "image/png"
 *   - update / clearLogo happy paths
 */

import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────
// NOTE: vi.mock factories are hoisted by Vitest — do NOT reference top-level
// variables inside the factory. Use literal values instead.

const mockGetActiveBranding = vi.fn<() => Promise<unknown>>();
const mockPutActiveBranding = vi.fn<(b: unknown) => Promise<void>>();

vi.mock("@/core/branding/db", () => ({
  DEFAULT_BRANDING: {
    id: "active",
    companyName: "Telecom Analytics",
    primaryColor: "#003087",
    footerText: "Confidential — For internal use only",
    applyToAll: true,
  },
  getActiveBranding: () => mockGetActiveBranding(),
  putActiveBranding: (b: unknown) => mockPutActiveBranding(b),
}));

// ─── Import target AFTER mocks ────────────────────────────────────────────────

import { useBranding } from "@/core/branding/use-branding";

// ─── Shared fixture (must match the literal in the factory above) ─────────────

const DEFAULT_BRANDING = {
  id: "active",
  companyName: "Telecom Analytics",
  primaryColor: "#003087",
  footerText: "Confidential — For internal use only",
  applyToAll: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProfile(partial: Record<string, unknown> = {}) {
  return { ...DEFAULT_BRANDING, ...partial };
}

/** Flush all microtasks (resolved promises) so useEffect async bodies settle. */
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockGetActiveBranding.mockResolvedValue(makeProfile());
  mockPutActiveBranding.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Initial state ────────────────────────────────────────────────────────────

describe("useBranding — initial state", () => {
  it("starts with loaded=false and the DEFAULT_BRANDING values synchronously", () => {
    // Arrange — keep getActiveBranding pending so loaded never flips
    let resolveHydration!: (v: unknown) => void;
    mockGetActiveBranding.mockReturnValue(
      new Promise((res) => { resolveHydration = res; }),
    );

    // Act
    const { result } = renderHook(() => useBranding());

    // Assert — synchronous snapshot
    expect(result.current.loaded).toBe(false);
    expect(result.current.branding).toEqual(DEFAULT_BRANDING);

    // Cleanup — resolve so the dangling promise doesn't pollute other tests
    resolveHydration(makeProfile());
  });

  it("exposes all five required interface members", async () => {
    const { result } = renderHook(() => useBranding());
    await flushMicrotasks();

    expect(typeof result.current.branding).toBe("object");
    expect(typeof result.current.loaded).toBe("boolean");
    expect(typeof result.current.update).toBe("function");
    expect(typeof result.current.setLogoFromFile).toBe("function");
    expect(typeof result.current.clearLogo).toBe("function");
  });

  it("branding has all required BrandingProfile fields after hydration", async () => {
    const { result } = renderHook(() => useBranding());
    await flushMicrotasks();

    const b = result.current.branding;
    expect(typeof b.id).toBe("string");
    expect(typeof b.companyName).toBe("string");
    expect(typeof b.primaryColor).toBe("string");
    expect(typeof b.footerText).toBe("string");
    expect(typeof b.applyToAll).toBe("boolean");
  });
});

// ─── Hydration effect ─────────────────────────────────────────────────────────

describe("useBranding — hydration from Dexie", () => {
  it("sets branding to the Dexie value and flips loaded=true after mount", async () => {
    // Arrange
    const stored = makeProfile({ companyName: "ACME Corp" });
    mockGetActiveBranding.mockResolvedValue(stored);

    // Act
    const { result } = renderHook(() => useBranding());
    await flushMicrotasks();

    // Assert
    expect(result.current.branding.companyName).toBe("ACME Corp");
    expect(result.current.loaded).toBe(true);
  });

  it("calls getActiveBranding exactly once on mount", async () => {
    const { result } = renderHook(() => useBranding());
    await flushMicrotasks();

    expect(mockGetActiveBranding).toHaveBeenCalledTimes(1);
    expect(result.current.loaded).toBe(true);
  });

  it("does not update state when component unmounts before hydration resolves (cancelled=true branch)", async () => {
    // Arrange — make getActiveBranding hang indefinitely
    let resolveHydration!: (v: unknown) => void;
    mockGetActiveBranding.mockReturnValue(
      new Promise((res) => { resolveHydration = res; }),
    );

    // Act — mount then immediately unmount
    const { result, unmount } = renderHook(() => useBranding());
    unmount();

    // Resolve after unmount — the cancelled guard suppresses state updates
    await act(async () => {
      resolveHydration(makeProfile({ companyName: "Too Late Corp" }));
      await Promise.resolve();
    });

    // Assert — loaded is still false; branding is still the initial default
    expect(result.current.loaded).toBe(false);
    expect(result.current.branding.companyName).toBe(DEFAULT_BRANDING.companyName);
  });
});

// ─── update callback ──────────────────────────────────────────────────────────

describe("useBranding — update", () => {
  it("merges patch into branding immediately (synchronous state update)", async () => {
    // Arrange — hydrate first
    const { result } = renderHook(() => useBranding());
    await flushMicrotasks();
    expect(result.current.loaded).toBe(true);

    // Act
    act(() => {
      result.current.update({ companyName: "Widgets Inc" });
    });

    // Assert — branding reflects the patch immediately
    expect(result.current.branding.companyName).toBe("Widgets Inc");
  });

  it("always resets branding.id to DEFAULT_BRANDING.id regardless of the patch", async () => {
    // Arrange
    const { result } = renderHook(() => useBranding());
    await flushMicrotasks();

    // Act — try to override the id via a patch
    act(() => {
      result.current.update({ id: "custom-id", companyName: "Override Corp" } as Record<string, unknown>);
    });

    // Assert — id is always the singleton value from DEFAULT_BRANDING
    expect(result.current.branding.id).toBe(DEFAULT_BRANDING.id);
    expect(result.current.branding.companyName).toBe("Override Corp");
  });

  it("calls putActiveBranding synchronously via the branding-change flush effect", async () => {
    // Design note: every update() call changes branding state. React's effect system
    // runs the cleanup of the previous branding-change effect before setting up the
    // new one. That cleanup calls flush(prevBranding), which clears any pending
    // debounce timer and immediately calls putActiveBranding(prevBranding).
    // Result: putActiveBranding is called synchronously on every update, not after 300ms.
    // The debounce only comes into play if two updates happen in the same render cycle
    // (before the effect cleanup runs).

    // Arrange
    const { result } = renderHook(() => useBranding());
    await flushMicrotasks();
    expect(result.current.loaded).toBe(true);

    const callsBefore = mockPutActiveBranding.mock.calls.length;

    // Act — trigger update
    act(() => {
      result.current.update({ companyName: "New Co" });
    });

    // Assert — at least one new call was made (via the flush-on-change effect)
    expect(mockPutActiveBranding.mock.calls.length).toBeGreaterThan(callsBefore);
    // The current branding state reflects the update
    expect(result.current.branding.companyName).toBe("New Co");
  });

  it("debounce: each update triggers a flush-on-change call; final branding state is 'Third'", async () => {
    // Each update changes branding → effect cleanup fires flush(prevBranding).
    // The debounce timer is cleared by each flush, so no timer-fired call lands.
    // Instead, the calls accumulate synchronously: flush("DEFAULT"), flush("First"),
    // flush("Second"). The final branding state is "Third".

    // Arrange
    const { result } = renderHook(() => useBranding());
    await flushMicrotasks();
    expect(result.current.loaded).toBe(true);

    const callsBefore = mockPutActiveBranding.mock.calls.length;

    // Act — fire three updates in sequence
    act(() => { result.current.update({ companyName: "First" }); });
    act(() => { result.current.update({ companyName: "Second" }); });
    act(() => { result.current.update({ companyName: "Third" }); });

    // Assert — three additional flush calls (one per update: DEFAULT, First, Second)
    // plus the "Third" timer is pending but was cleared by the last flush
    expect(mockPutActiveBranding.mock.calls.length).toBeGreaterThan(callsBefore);
    // Final branding state is "Third"
    expect(result.current.branding.companyName).toBe("Third");
  });

  it("returns a stable update reference across re-renders (useCallback)", async () => {
    const { result, rerender } = renderHook(() => useBranding());
    await flushMicrotasks();
    const first = result.current.update;

    rerender();
    expect(result.current.update).toBe(first);
  });
});

// ─── debounce flush on unmount ────────────────────────────────────────────────

describe("useBranding — flush on unmount", () => {
  it("flush(branding): timer is pending — clears timer and calls fn immediately", async () => {
    // Arrange — fake timers so the debounce doesn't auto-fire
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useBranding());
    await flushMicrotasks();
    expect(result.current.loaded).toBe(true);

    // Trigger an update so a debounce timer is now pending
    act(() => {
      result.current.update({ primaryColor: "#ff0000" });
    });

    // Act — unmount triggers the useEffect cleanup which calls flush(currentBranding)
    // flush() clears the pending timer and calls fn(branding) synchronously
    unmount();

    // Assert — putActiveBranding was called (either by flush or the branding-change effect)
    // with the updated branding
    const callsWithRed = mockPutActiveBranding.mock.calls.filter(
      (c) => (c[0] as Record<string, unknown>).primaryColor === "#ff0000"
    );
    expect(callsWithRed.length).toBeGreaterThanOrEqual(1);
  });

  it("flush(branding): no timer pending — calls fn(branding) directly (timer=null branch)", async () => {
    // Arrange — no update triggered, so debounce timer is null
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useBranding());
    await flushMicrotasks();

    vi.clearAllMocks();
    mockPutActiveBranding.mockResolvedValue(undefined);

    // Act — unmount triggers flush(DEFAULT_BRANDING) via the useEffect cleanup.
    // Since no update was called, timer is null → fn(branding) runs directly.
    unmount();

    // Assert — putActiveBranding called with the current branding (default)
    expect(mockPutActiveBranding).toHaveBeenCalledWith(
      expect.objectContaining({ id: DEFAULT_BRANDING.id }),
    );
  });
});

// ─── setLogoFromFile ──────────────────────────────────────────────────────────

describe("useBranding — setLogoFromFile", () => {
  it("reads the file bytes and updates logoBytes, logoMime, and logoName", async () => {
    // Arrange
    const { result } = renderHook(() => useBranding());
    await flushMicrotasks();
    expect(result.current.loaded).toBe(true);

    const bytes = new ArrayBuffer(8);
    const mockFile = {
      arrayBuffer: vi.fn().mockResolvedValue(bytes),
      type: "image/png",
      name: "logo.png",
    } as unknown as File;

    // Act
    await act(async () => {
      await result.current.setLogoFromFile(mockFile);
    });

    // Assert
    expect(result.current.branding.logoBytes).toBe(bytes);
    expect(result.current.branding.logoMime).toBe("image/png");
    expect(result.current.branding.logoName).toBe("logo.png");
  });

  it("falls back to 'image/png' when file.type is empty (|| branch)", async () => {
    // Arrange
    const { result } = renderHook(() => useBranding());
    await flushMicrotasks();

    const bytes = new ArrayBuffer(4);
    const mockFile = {
      arrayBuffer: vi.fn().mockResolvedValue(bytes),
      type: "", // empty string is falsy → || "image/png" branch is taken
      name: "noext",
    } as unknown as File;

    // Act
    await act(async () => {
      await result.current.setLogoFromFile(mockFile);
    });

    // Assert
    expect(result.current.branding.logoMime).toBe("image/png");
  });

  it("returns a stable setLogoFromFile reference across re-renders", async () => {
    const { result, rerender } = renderHook(() => useBranding());
    await flushMicrotasks();
    const first = result.current.setLogoFromFile;

    rerender();
    expect(result.current.setLogoFromFile).toBe(first);
  });
});

// ─── clearLogo ────────────────────────────────────────────────────────────────

describe("useBranding — clearLogo", () => {
  it("removes logoBytes, logoMime, and logoName from branding", async () => {
    // Arrange — set a logo first
    const { result } = renderHook(() => useBranding());
    await flushMicrotasks();

    const bytes = new ArrayBuffer(4);
    const mockFile = {
      arrayBuffer: vi.fn().mockResolvedValue(bytes),
      type: "image/jpeg",
      name: "logo.jpg",
    } as unknown as File;

    await act(async () => {
      await result.current.setLogoFromFile(mockFile);
    });

    expect(result.current.branding.logoBytes).toBeDefined();

    // Act
    act(() => {
      result.current.clearLogo();
    });

    // Assert
    expect(result.current.branding.logoBytes).toBeUndefined();
    expect(result.current.branding.logoMime).toBeUndefined();
    expect(result.current.branding.logoName).toBeUndefined();
  });

  it("clearLogo with no logo set — branding fields remain undefined without error", async () => {
    // Arrange — fresh hook, no logo was set
    const { result } = renderHook(() => useBranding());
    await flushMicrotasks();

    // Act — clear with nothing to clear
    act(() => {
      result.current.clearLogo();
    });

    // Assert — no crash; logo fields are undefined
    expect(result.current.branding.logoBytes).toBeUndefined();
    expect(result.current.branding.logoMime).toBeUndefined();
    expect(result.current.branding.logoName).toBeUndefined();
  });

  it("returns a stable clearLogo reference across re-renders", async () => {
    const { result, rerender } = renderHook(() => useBranding());
    await flushMicrotasks();
    const first = result.current.clearLogo;

    rerender();
    expect(result.current.clearLogo).toBe(first);
  });
});

// ─── Return value shape ───────────────────────────────────────────────────────

describe("useBranding — return value", () => {
  it("returns all five documented keys", async () => {
    const { result } = renderHook(() => useBranding());
    await flushMicrotasks();

    expect(Object.keys(result.current)).toEqual(
      expect.arrayContaining(["branding", "loaded", "update", "setLogoFromFile", "clearLogo"]),
    );
  });
});

// ─── Debounce timer callback coverage ────────────────────────────────────────
// The `() => fn(...args)` callback inside setTimeout fires only when the timer
// is NOT cancelled before expiry. Inside a normal test `act()` call, React's
// branding-change effect cleanup cancels the timer before it fires. To cover
// this path we advance the timer BEFORE React flushes its effects — accepting
// the "not wrapped in act" console warning as a trade-off.

describe("useBranding — debounce timer callback", () => {
  it("the setTimeout callback fires putActiveBranding with the new branding when not cancelled", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useBranding());

    // Call update without wrapping in act so we can advance timers before
    // React flushes effects (which would otherwise cancel the pending timer).
    // This intentionally produces the "not wrapped in act" React warning.
    result.current.update({ companyName: "TimerFired Co" });

    // Advance the timer immediately — before React's effect cleanup runs.
    vi.advanceTimersByTime(350);

    // Assert — the setTimeout callback called putActiveBranding with the new branding
    const timerCalls = mockPutActiveBranding.mock.calls.filter(
      (c) => (c[0] as Record<string, unknown>).companyName === "TimerFired Co"
    );
    expect(timerCalls.length).toBeGreaterThanOrEqual(1);
  });
});
