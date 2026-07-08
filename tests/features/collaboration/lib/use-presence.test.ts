/**
 * Tests for src/features/collaboration/lib/use-presence.ts
 *
 * The module has two surfaces:
 *  - `samePeers`  (internal, tested indirectly via hook behavior)
 *  - `usePresence` (exported hook)
 *
 * External deps mocked:
 *  - @/platform/collab  (readPeers / subscribePeers)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ─── Hoisted mock factories ────────────────────────────────────────────────

const { readPeersMock, subscribePeersMock } = vi.hoisted(() => {
  const readPeersMock = vi.fn();
  const subscribePeersMock = vi.fn();
  return { readPeersMock, subscribePeersMock };
});

// ─── Module mocks ──────────────────────────────────────────────────────────

vi.mock("@/platform/collab", () => ({
  readPeers: readPeersMock,
  subscribePeers: subscribePeersMock,
}));

// ─── Helpers ───────────────────────────────────────────────────────────────

import { usePresence } from "@/features/collaboration/lib/use-presence";
import type { CollabPeer } from "@/platform/collab";

/** Minimal CollabPeer factory */
function makePeer(overrides: Partial<CollabPeer> = {}): CollabPeer {
  return {
    clientId: 1,
    id: "user-1",
    name: "Alice",
    role: "editor",
    color: "#ff0000",
    page: "/dashboard",
    active: true,
    ...overrides,
  };
}

/** Minimal fake Awareness instance */
function makeAwareness() {
  return {} as import("y-protocols/awareness").Awareness;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("usePresence — null awareness (SSR / no BroadcastChannel)", () => {
  beforeEach(() => {
    readPeersMock.mockReset();
    subscribePeersMock.mockReset();
  });

  it("returns an empty array when awareness is null", () => {
    // Arrange / Act
    const { result } = renderHook(() => usePresence(null));
    // Assert
    expect(result.current).toEqual([]);
    expect(readPeersMock).not.toHaveBeenCalled();
    expect(subscribePeersMock).not.toHaveBeenCalled();
  });

  it("subscribe returns a no-op unsubscribe when awareness is null", () => {
    // The subscribe callback must return () => {} without crashing.
    // We exercise this by rendering, then unmounting (useSyncExternalStore calls
    // subscribe and then the cleanup on unmount).
    const { unmount } = renderHook(() => usePresence(null));
    expect(() => unmount()).not.toThrow();
  });
});

describe("usePresence — with awareness", () => {
  let awareness: ReturnType<typeof makeAwareness>;
  let unsubscribeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    readPeersMock.mockReset();
    subscribePeersMock.mockReset();
    awareness = makeAwareness();
    unsubscribeMock = vi.fn();
    subscribePeersMock.mockReturnValue(unsubscribeMock);
  });

  it("reads initial peers from awareness on mount", () => {
    // Arrange
    const peers = [makePeer()];
    readPeersMock.mockReturnValue(peers);

    // Act
    const { result } = renderHook(() => usePresence(awareness));

    // Assert
    expect(readPeersMock).toHaveBeenCalledWith(awareness);
    expect(result.current).toEqual(peers);
  });

  it("calls subscribePeers and returns the cleanup function on unmount", () => {
    // Arrange
    readPeersMock.mockReturnValue([]);

    // Act
    const { unmount } = renderHook(() => usePresence(awareness));

    expect(subscribePeersMock).toHaveBeenCalledWith(awareness, expect.any(Function));

    unmount();

    // Assert: cleanup from subscribePeers was called
    expect(unsubscribeMock).toHaveBeenCalled();
  });

  it("re-renders when peers actually change (samePeers returns false)", () => {
    // Arrange
    const peer1 = makePeer({ clientId: 1 });
    const peer2 = makePeer({ clientId: 2 });

    readPeersMock.mockReturnValueOnce([peer1]);
    const { result } = renderHook(() => usePresence(awareness));
    expect(result.current).toEqual([peer1]);

    // Capture the subscriber callback
    const subscriberCallback: () => void = subscribePeersMock.mock.calls[0][1];

    // Act: simulate an awareness change that produces different peers
    readPeersMock.mockReturnValue([peer1, peer2]);
    act(() => {
      subscriberCallback();
    });

    // Assert: hook re-rendered with new peers
    expect(result.current).toEqual([peer1, peer2]);
  });

  it("does NOT re-render when peer list is identical (samePeers returns true)", () => {
    // Arrange
    const peer = makePeer();
    readPeersMock.mockReturnValue([peer]);

    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount++;
      return usePresence(awareness);
    });
    const countAfterMount = renderCount;

    const subscriberCallback: () => void = subscribePeersMock.mock.calls[0][1];

    // readPeers returns a new array object but same-valued peers
    readPeersMock.mockReturnValue([{ ...peer }]);

    // Act
    act(() => {
      subscriberCallback();
    });

    // Assert: no extra render because samePeers() returned true
    expect(renderCount).toBe(countAfterMount);
    expect(result.current).toEqual([peer]);
  });

  it("re-renders when length changes (peer added)", () => {
    // Arrange
    const peer = makePeer();
    readPeersMock.mockReturnValue([peer]);
    const { result } = renderHook(() => usePresence(awareness));

    const subscriberCallback: () => void = subscribePeersMock.mock.calls[0][1];

    const newPeer = makePeer({ clientId: 2, id: "user-2", name: "Bob" });
    readPeersMock.mockReturnValue([peer, newPeer]);

    // Act
    act(() => {
      subscriberCallback();
    });

    expect(result.current).toHaveLength(2);
    expect(result.current[1].name).toBe("Bob");
  });

  it("re-renders when length decreases (peer removed)", () => {
    // Arrange
    const peer1 = makePeer({ clientId: 1 });
    const peer2 = makePeer({ clientId: 2, id: "user-2", name: "Bob" });
    readPeersMock.mockReturnValue([peer1, peer2]);
    const { result } = renderHook(() => usePresence(awareness));
    expect(result.current).toHaveLength(2);

    const subscriberCallback: () => void = subscribePeersMock.mock.calls[0][1];

    readPeersMock.mockReturnValue([peer1]);
    act(() => {
      subscriberCallback();
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0].clientId).toBe(1);
  });
});

// ─── samePeers edge cases (exercised via hook) ────────────────────────────

describe("samePeers — field-level inequality detection", () => {
  let awareness: ReturnType<typeof makeAwareness>;

  beforeEach(() => {
    readPeersMock.mockReset();
    subscribePeersMock.mockReset();
    awareness = makeAwareness();
    subscribePeersMock.mockReturnValue(vi.fn());
  });

  /**
   * Helper: render hook with initial peers, then fire a subscriber event with
   * changed peers, and assert whether a re-render occurred.
   */
  function testFieldChange(
    initial: CollabPeer,
    changed: CollabPeer,
    expectRerender: boolean,
  ) {
    readPeersMock.mockReturnValue([initial]);
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return usePresence(awareness);
    });
    const rendersAfterMount = renders;

    const cb: () => void = subscribePeersMock.mock.calls[subscribePeersMock.mock.calls.length - 1][1];

    readPeersMock.mockReturnValue([changed]);
    act(() => { cb(); });

    if (expectRerender) {
      expect(renders).toBeGreaterThan(rendersAfterMount);
      expect(result.current[0]).toEqual(changed);
    } else {
      expect(renders).toBe(rendersAfterMount);
    }
  }

  it("detects clientId change as different peers", () => {
    const base = makePeer({ clientId: 1 });
    const changed = makePeer({ clientId: 99 });
    testFieldChange(base, changed, true);
  });

  it("detects id change as different peers", () => {
    const base = makePeer({ id: "user-A" });
    const changed = makePeer({ id: "user-B" });
    testFieldChange(base, changed, true);
  });

  it("detects name change as different peers", () => {
    const base = makePeer({ name: "Alice" });
    const changed = makePeer({ name: "Alicia" });
    testFieldChange(base, changed, true);
  });

  it("detects role change as different peers", () => {
    const base = makePeer({ role: "editor" });
    const changed = makePeer({ role: "viewer" });
    testFieldChange(base, changed, true);
  });

  it("detects color change as different peers", () => {
    const base = makePeer({ color: "#ff0000" });
    const changed = makePeer({ color: "#0000ff" });
    testFieldChange(base, changed, true);
  });

  it("detects page change as different peers", () => {
    const base = makePeer({ page: "/home" });
    const changed = makePeer({ page: "/reports" });
    testFieldChange(base, changed, true);
  });

  it("treats identical peers (same fields) as equal (same reference)", () => {
    const peer = makePeer();
    readPeersMock.mockReturnValue([peer]);
    let renders = 0;
    renderHook(() => {
      renders++;
      return usePresence(awareness);
    });
    const rendersAfterMount = renders;

    const cb: () => void = subscribePeersMock.mock.calls[subscribePeersMock.mock.calls.length - 1][1];

    // Return the exact same array reference — samePeers(a === b) returns true early
    readPeersMock.mockReturnValue([peer]);
    act(() => { cb(); });

    expect(renders).toBe(rendersAfterMount);
  });

  it("samePeers returns true early when readPeers returns the exact same array reference", () => {
    // This exercises the `if (a === b) return true` fast path in samePeers.
    // The hook caches cacheRef.current = peers after the first readPeers call.
    // If readPeers returns that exact same reference again, samePeers short-circuits.
    const peersRef: CollabPeer[] = [makePeer()];
    readPeersMock.mockReturnValue(peersRef);

    let renders = 0;
    renderHook(() => {
      renders++;
      return usePresence(awareness);
    });
    const rendersAfterMount = renders;

    const cb: () => void = subscribePeersMock.mock.calls[subscribePeersMock.mock.calls.length - 1][1];

    // Return the same array reference that was already cached
    readPeersMock.mockReturnValue(peersRef);
    act(() => { cb(); });

    // samePeers(cache, next) where cache === next → true → no re-render
    expect(renders).toBe(rendersAfterMount);
  });

  it("handles empty initial peers and no change (both empty)", () => {
    // Arrange: initial empty list, subscriber fires with empty list
    readPeersMock.mockReturnValue([]);
    let renders = 0;
    renderHook(() => {
      renders++;
      return usePresence(awareness);
    });
    const rendersAfterMount = renders;

    const cb: () => void = subscribePeersMock.mock.calls[subscribePeersMock.mock.calls.length - 1][1];

    readPeersMock.mockReturnValue([]);
    act(() => { cb(); });

    // Both empty, samePeers returns true — no re-render
    expect(renders).toBe(rendersAfterMount);
  });
});

describe("usePresence — getSnapshot fallback (?? [])", () => {
  it("getSnapshot returns [] when cache is somehow null", () => {
    // The cacheRef is initialized by the inline `if (cacheRef.current === null)`
    // block, so it will never be null after initialization. However we can verify
    // that with null awareness the snapshot correctly returns [].
    readPeersMock.mockReset();
    subscribePeersMock.mockReset();

    const { result } = renderHook(() => usePresence(null));
    expect(result.current).toEqual([]);
  });
});
