/**
 * Tests for src/features/collaboration/lib/use-lan.ts
 *
 * The module exposes two React hooks:
 *  - useLAN()       – returns { status, peers } from useSyncExternalStore
 *  - useLANAudit()  – returns LANAuditEntry[] from useSyncExternalStore
 *
 * Key insight: `lanCache` and `auditCache` are module-level singletons initialized
 * once when the module first loads. They are only updated when the subscriber
 * callbacks fire. Tests must drive state via the subscriber, not via mock return
 * values at render time.
 *
 * External deps mocked:
 *  - @/platform/lan/lan-collab  (getLANStatus, getLANPeers, readLANAudit,
 *                                 subscribeLAN, subscribeLANAudit)
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoisted mock factories ────────────────────────────────────────────────────

const {
  getLANStatusMock,
  getLANPeersMock,
  readLANAuditMock,
  subscribeLANMock,
  subscribeLANAuditMock,
} = vi.hoisted(() => {
  const getLANStatusMock = vi.fn(() => "off" as "off" | "connecting" | "connected" | "error");
  const getLANPeersMock = vi.fn(() => [] as unknown[]);
  const readLANAuditMock = vi.fn(() => [] as unknown[]);
  // subscribeLAN gets a callback and must return an unsubscribe fn.
  // We store the most-recently registered callback so tests can fire it.
  const subscribeLANMock = vi.fn((_fn: () => void) => vi.fn());
  const subscribeLANAuditMock = vi.fn((_fn: () => void) => vi.fn());
  return {
    getLANStatusMock,
    getLANPeersMock,
    readLANAuditMock,
    subscribeLANMock,
    subscribeLANAuditMock,
  };
});

// ─── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@/platform/lan/lan-collab", () => ({
  getLANStatus: getLANStatusMock,
  getLANPeers: getLANPeersMock,
  readLANAudit: readLANAuditMock,
  subscribeLAN: subscribeLANMock,
  subscribeLANAudit: subscribeLANAuditMock,
}));

// ─── Import target AFTER mocks ─────────────────────────────────────────────────

import { useLAN, useLANAudit } from "@/features/collaboration/lib/use-lan";
import type { LANAuditEntry, LANPeer } from "@/platform/lan/lan-collab";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makePeer(overrides: Partial<LANPeer> = {}): LANPeer {
  return {
    id: "peer-1",
    name: "Alice",
    role: "editor",
    color: "#3b82f6",
    active: true,
    ...overrides,
  };
}

function makeAuditEntry(overrides: Partial<LANAuditEntry> = {}): LANAuditEntry {
  return {
    id: "entry-1",
    at: 1000000,
    event: "peer.connected",
    peerId: "peer-1",
    peerName: "Alice",
    role: "editor",
    room: "test-room",
    ...overrides,
  };
}

/**
 * Helper: render useLAN, fire the subscriber callback with the given
 * getLANStatus / getLANPeers mocks, and return the hook result + helpers.
 */
function renderUseLANAndFireSubscriber(
  initialStatus: "off" | "connecting" | "connected" | "error",
  initialPeers: LANPeer[],
  nextStatus: "off" | "connecting" | "connected" | "error",
  nextPeers: LANPeer[],
) {
  // Set up mock return values for module initialisation (already happened, but
  // these values will be used when the subscriber callback fires).
  getLANStatusMock.mockReturnValue(initialStatus);
  getLANPeersMock.mockReturnValue(initialPeers);

  // Capture unsubscribe mock
  const unsubMock = vi.fn();
  subscribeLANMock.mockReturnValue(unsubMock);

  const { result, unmount } = renderHook(() => useLAN());

  // The subscriber callback passed to subscribeLAN by lanSubscribe
  const subscriberCb: () => void =
    subscribeLANMock.mock.calls[subscribeLANMock.mock.calls.length - 1][0];

  // Update mocks to return new values when subscriber fires
  getLANStatusMock.mockReturnValue(nextStatus);
  getLANPeersMock.mockReturnValue(nextPeers);

  act(() => {
    subscriberCb();
  });

  return { result, unmount, unsubMock, subscriberCb };
}

// ─── useLAN ────────────────────────────────────────────────────────────────────

describe("useLAN — hook mounts and returns a snapshot", () => {
  beforeEach(() => {
    getLANStatusMock.mockReturnValue("off");
    getLANPeersMock.mockReturnValue([]);
    subscribeLANMock.mockReturnValue(vi.fn());
    subscribeLANAuditMock.mockReturnValue(vi.fn());
  });

  it("returns an object with status and peers fields", () => {
    // Arrange / Act
    const { result } = renderHook(() => useLAN());

    // Assert
    expect(result.current).toHaveProperty("status");
    expect(result.current).toHaveProperty("peers");
  });

  it("peers is an array", () => {
    const { result } = renderHook(() => useLAN());
    expect(Array.isArray(result.current.peers)).toBe(true);
  });

  it("status is one of the valid LANStatus values", () => {
    const { result } = renderHook(() => useLAN());
    expect(["off", "connecting", "connected", "error"]).toContain(result.current.status);
  });

  it("calls subscribeLAN on mount", () => {
    renderHook(() => useLAN());
    expect(subscribeLANMock).toHaveBeenCalledWith(expect.any(Function));
  });

  it("calls the unsubscribe function on unmount", () => {
    const unsubMock = vi.fn();
    subscribeLANMock.mockReturnValue(unsubMock);

    const { unmount } = renderHook(() => useLAN());
    unmount();

    expect(unsubMock).toHaveBeenCalled();
  });
});

describe("useLAN — re-renders when status changes (status !== lanCache.status)", () => {
  it("updates status when subscriber fires with a new status", () => {
    // Arrange: render, capturing current snapshot
    getLANStatusMock.mockReturnValue("off");
    getLANPeersMock.mockReturnValue([]);
    subscribeLANMock.mockReturnValue(vi.fn());

    const { result } = renderHook(() => useLAN());
    const statusBefore = result.current.status;

    const subscriberCb: () => void =
      subscribeLANMock.mock.calls[subscribeLANMock.mock.calls.length - 1][0];

    // Act: change status
    const prevStatus = statusBefore;
    const newStatus = prevStatus === "off" ? "connecting" : "off";
    getLANStatusMock.mockReturnValue(newStatus);
    // Return same peers reference so only status changed triggers the if-branch
    const samePeers = result.current.peers;
    getLANPeersMock.mockReturnValue(samePeers);

    act(() => {
      subscriberCb();
    });

    // Assert: status changed
    expect(result.current.status).toBe(newStatus);
  });

  it("transitions from off to connecting", () => {
    getLANStatusMock.mockReturnValue("off");
    getLANPeersMock.mockReturnValue([]);
    const unsubMock = vi.fn();
    subscribeLANMock.mockReturnValue(unsubMock);

    const { result } = renderHook(() => useLAN());
    const subscr = subscribeLANMock.mock.calls[
      subscribeLANMock.mock.calls.length - 1
    ][0] as () => void;

    getLANStatusMock.mockReturnValue("connecting");
    getLANPeersMock.mockReturnValue([]);
    act(() => {
      subscr();
    });

    expect(result.current.status).toBe("connecting");
  });

  it("transitions from connecting to connected", () => {
    // First transition to connecting
    getLANStatusMock.mockReturnValue("off");
    getLANPeersMock.mockReturnValue([]);
    subscribeLANMock.mockReturnValue(vi.fn());

    const { result } = renderHook(() => useLAN());
    const subscr = subscribeLANMock.mock.calls[
      subscribeLANMock.mock.calls.length - 1
    ][0] as () => void;

    getLANStatusMock.mockReturnValue("connecting");
    act(() => {
      subscr();
    });

    // Second transition to connected
    getLANStatusMock.mockReturnValue("connected");
    act(() => {
      subscr();
    });

    expect(result.current.status).toBe("connected");
  });

  it("transitions to error status", () => {
    getLANStatusMock.mockReturnValue("off");
    getLANPeersMock.mockReturnValue([]);
    subscribeLANMock.mockReturnValue(vi.fn());

    const { result } = renderHook(() => useLAN());
    const subscr = subscribeLANMock.mock.calls[
      subscribeLANMock.mock.calls.length - 1
    ][0] as () => void;

    getLANStatusMock.mockReturnValue("error");
    act(() => {
      subscr();
    });

    expect(result.current.status).toBe("error");
  });
});

describe("useLAN — re-renders when peers change (peers !== lanCache.peers)", () => {
  it("updates peers when subscriber fires with a different peers array reference", () => {
    // Arrange
    const initialPeers: LANPeer[] = [];
    getLANStatusMock.mockReturnValue("off");
    getLANPeersMock.mockReturnValue(initialPeers);
    subscribeLANMock.mockReturnValue(vi.fn());

    const { result } = renderHook(() => useLAN());
    const subscr = subscribeLANMock.mock.calls[
      subscribeLANMock.mock.calls.length - 1
    ][0] as () => void;

    // First: change status to "connected" so lanCache is warmed up with a new snapshot
    getLANStatusMock.mockReturnValue("connected");
    getLANPeersMock.mockReturnValue(initialPeers);
    act(() => {
      subscr();
    });

    // Now change peers
    const newPeers = [makePeer()];
    getLANStatusMock.mockReturnValue("connected"); // same status
    getLANPeersMock.mockReturnValue(newPeers); // different reference
    act(() => {
      subscr();
    });

    // Assert
    expect(result.current.peers).toEqual([makePeer()]);
  });

  it("peer list grows: new peer is visible", () => {
    // Arrange
    getLANStatusMock.mockReturnValue("off");
    getLANPeersMock.mockReturnValue([]);
    subscribeLANMock.mockReturnValue(vi.fn());

    const { result } = renderHook(() => useLAN());
    const subscr = subscribeLANMock.mock.calls[
      subscribeLANMock.mock.calls.length - 1
    ][0] as () => void;

    // Act: add a peer
    const peer = makePeer({ id: "peer-x", name: "Xavier" });
    getLANStatusMock.mockReturnValue("connected");
    getLANPeersMock.mockReturnValue([peer]);
    act(() => {
      subscr();
    });

    // Assert
    expect(result.current.peers).toHaveLength(1);
    expect(result.current.peers[0].name).toBe("Xavier");
  });

  it("peer list shrinks: peer departure is visible", () => {
    // Arrange: start with one peer
    getLANStatusMock.mockReturnValue("off");
    getLANPeersMock.mockReturnValue([]);
    subscribeLANMock.mockReturnValue(vi.fn());

    const { result } = renderHook(() => useLAN());
    const subscr = subscribeLANMock.mock.calls[
      subscribeLANMock.mock.calls.length - 1
    ][0] as () => void;

    // Add peer first
    const peer = makePeer({ id: "leaving", name: "Leaving" });
    getLANStatusMock.mockReturnValue("connected");
    getLANPeersMock.mockReturnValue([peer]);
    act(() => {
      subscr();
    });
    expect(result.current.peers).toHaveLength(1);

    // Now remove peer
    getLANStatusMock.mockReturnValue("connected");
    getLANPeersMock.mockReturnValue([]);
    act(() => {
      subscr();
    });

    // Assert
    expect(result.current.peers).toHaveLength(0);
  });
});

describe("useLAN — NO re-render when nothing changed (both branches false)", () => {
  it("does not call onChange when status and peers are unchanged references", () => {
    // Arrange: drive the module cache to a known state
    getLANStatusMock.mockReturnValue("off");
    getLANPeersMock.mockReturnValue([]);
    subscribeLANMock.mockReturnValue(vi.fn());

    const { result } = renderHook(() => useLAN());
    const subscr = subscribeLANMock.mock.calls[
      subscribeLANMock.mock.calls.length - 1
    ][0] as () => void;

    // Drive cache to a known state
    getLANStatusMock.mockReturnValue("connected");
    getLANPeersMock.mockReturnValue([]);
    act(() => {
      subscr();
    });

    // Now capture the stable status/peers references currently in lanCache
    const knownStatus = result.current.status; // "connected"
    const knownPeers = result.current.peers; // []

    let renders = 0;
    const { result: result2 } = renderHook(() => {
      renders++;
      return useLAN();
    });
    const rendersAfterMount = renders;
    const subscr2 = subscribeLANMock.mock.calls[
      subscribeLANMock.mock.calls.length - 1
    ][0] as () => void;

    // Act: return SAME status string and SAME peers reference → the if-branch is false
    getLANStatusMock.mockReturnValue(knownStatus);
    getLANPeersMock.mockReturnValue(knownPeers); // exact same reference as in lanCache
    act(() => {
      subscr2();
    });

    // Assert: no extra render because neither status nor peers changed
    expect(renders).toBe(rendersAfterMount);
    expect(result2.current.status).toBe("connected");
  });

  it("snapshot identity is preserved when nothing changed", () => {
    // Arrange
    getLANStatusMock.mockReturnValue("off");
    getLANPeersMock.mockReturnValue([]);
    subscribeLANMock.mockReturnValue(vi.fn());

    const { result } = renderHook(() => useLAN());
    const subscr = subscribeLANMock.mock.calls[
      subscribeLANMock.mock.calls.length - 1
    ][0] as () => void;

    // Warm cache
    const stablePeers: LANPeer[] = [makePeer({ id: "stable" })];
    getLANStatusMock.mockReturnValue("connected");
    getLANPeersMock.mockReturnValue(stablePeers);
    act(() => {
      subscr();
    });

    const snapshotBefore = result.current;

    // Act: no change
    getLANStatusMock.mockReturnValue("connected");
    getLANPeersMock.mockReturnValue(stablePeers);
    act(() => {
      subscr();
    });

    // Assert: snapshot object reference did NOT change
    expect(result.current).toBe(snapshotBefore);
  });
});

// ─── useLANAudit ──────────────────────────────────────────────────────────────

describe("useLANAudit — hook mounts and returns audit entries", () => {
  beforeEach(() => {
    readLANAuditMock.mockReturnValue([]);
    subscribeLANAuditMock.mockReturnValue(vi.fn());
  });

  it("returns an array", () => {
    const { result } = renderHook(() => useLANAudit());
    expect(Array.isArray(result.current)).toBe(true);
  });

  it("calls subscribeLANAudit on mount", () => {
    renderHook(() => useLANAudit());
    expect(subscribeLANAuditMock).toHaveBeenCalledWith(expect.any(Function));
  });

  it("calls the unsubscribe function on unmount", () => {
    const unsubMock = vi.fn();
    subscribeLANAuditMock.mockReturnValue(unsubMock);

    const { unmount } = renderHook(() => useLANAudit());
    unmount();

    expect(unsubMock).toHaveBeenCalled();
  });
});

describe("useLANAudit — subscriber fires and updates auditCache (always calls onChange)", () => {
  it("updates audit entries when subscriber fires with new entries", () => {
    // Arrange
    readLANAuditMock.mockReturnValue([]);
    subscribeLANAuditMock.mockReturnValue(vi.fn());

    const { result } = renderHook(() => useLANAudit());
    const subscr = subscribeLANAuditMock.mock.calls[
      subscribeLANAuditMock.mock.calls.length - 1
    ][0] as () => void;

    // Act
    const entry = makeAuditEntry({ id: "e-new", event: "peer.connected" });
    readLANAuditMock.mockReturnValue([entry]);
    act(() => {
      subscr();
    });

    // Assert
    expect(result.current).toEqual([entry]);
  });

  it("audit cache reflects multiple entries after subscriber fires", () => {
    // Arrange
    readLANAuditMock.mockReturnValue([]);
    subscribeLANAuditMock.mockReturnValue(vi.fn());

    const { result } = renderHook(() => useLANAudit());
    const subscr = subscribeLANAuditMock.mock.calls[
      subscribeLANAuditMock.mock.calls.length - 1
    ][0] as () => void;

    // Act
    const entries = [
      makeAuditEntry({ id: "a1", event: "peer.connected" }),
      makeAuditEntry({ id: "a2", event: "file.drop" }),
      makeAuditEntry({ id: "a3", event: "peer.disconnected" }),
    ];
    readLANAuditMock.mockReturnValue(entries);
    act(() => {
      subscr();
    });

    // Assert
    expect(result.current).toHaveLength(3);
    expect(result.current[0].event).toBe("peer.connected");
    expect(result.current[1].event).toBe("file.drop");
    expect(result.current[2].event).toBe("peer.disconnected");
  });

  it("audit entries can decrease (entries removed from audit)", () => {
    // Arrange
    readLANAuditMock.mockReturnValue([]);
    subscribeLANAuditMock.mockReturnValue(vi.fn());

    const { result } = renderHook(() => useLANAudit());
    const subscr = subscribeLANAuditMock.mock.calls[
      subscribeLANAuditMock.mock.calls.length - 1
    ][0] as () => void;

    // First: add entries
    const twoEntries = [
      makeAuditEntry({ id: "b1", event: "peer.connected" }),
      makeAuditEntry({ id: "b2", event: "file.drop" }),
    ];
    readLANAuditMock.mockReturnValue(twoEntries);
    act(() => {
      subscr();
    });
    expect(result.current).toHaveLength(2);

    // Act: shrink
    readLANAuditMock.mockReturnValue([twoEntries[0]]);
    act(() => {
      subscr();
    });

    // Assert
    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe("b1");
  });

  it("auditSubscribe always calls onChange even if entries appear identical (no identity check)", () => {
    // Unlike lanSubscribe, auditSubscribe ALWAYS calls onChange —
    // there is no identity check on the array.
    readLANAuditMock.mockReturnValue([]);
    subscribeLANAuditMock.mockReturnValue(vi.fn());

    let renders = 0;
    renderHook(() => {
      renders++;
      return useLANAudit();
    });
    const rendersAfterMount = renders;
    const subscr = subscribeLANAuditMock.mock.calls[
      subscribeLANAuditMock.mock.calls.length - 1
    ][0] as () => void;

    // Act: fire subscriber (readLANAudit returns same-valued but new array)
    readLANAuditMock.mockReturnValue([]);
    act(() => {
      subscr();
    });

    // Assert: re-rendered because auditSubscribe calls onChange unconditionally
    expect(renders).toBeGreaterThan(rendersAfterMount);
  });

  it("fires multiple times sequentially and always gets the latest audit state", () => {
    // Arrange
    readLANAuditMock.mockReturnValue([]);
    subscribeLANAuditMock.mockReturnValue(vi.fn());

    const { result } = renderHook(() => useLANAudit());
    const subscr = subscribeLANAuditMock.mock.calls[
      subscribeLANAuditMock.mock.calls.length - 1
    ][0] as () => void;

    // First fire: 1 entry
    const e1 = makeAuditEntry({ id: "seq-1", event: "peer.connected" });
    readLANAuditMock.mockReturnValue([e1]);
    act(() => {
      subscr();
    });
    expect(result.current).toHaveLength(1);

    // Second fire: 2 entries
    const e2 = makeAuditEntry({ id: "seq-2", event: "file.drop" });
    readLANAuditMock.mockReturnValue([e1, e2]);
    act(() => {
      subscr();
    });
    expect(result.current).toHaveLength(2);

    // Third fire: back to empty
    readLANAuditMock.mockReturnValue([]);
    act(() => {
      subscr();
    });
    expect(result.current).toHaveLength(0);
  });
});

describe("useLANAudit — audit entry shapes", () => {
  beforeEach(() => {
    readLANAuditMock.mockReturnValue([]);
    subscribeLANAuditMock.mockReturnValue(vi.fn());
  });

  it("correctly surfaces LANAuditEntry with all fields", () => {
    const { result } = renderHook(() => useLANAudit());
    const subscr = subscribeLANAuditMock.mock.calls[
      subscribeLANAuditMock.mock.calls.length - 1
    ][0] as () => void;

    const entry = makeAuditEntry({
      id: "full-entry",
      at: 9999999,
      event: "file.announced",
      peerId: "peer-abc",
      peerName: "Bob",
      role: "host",
      room: "test-room",
      detail: "file.txt (1234 bytes)",
    });
    readLANAuditMock.mockReturnValue([entry]);
    act(() => {
      subscr();
    });

    expect(result.current[0]).toMatchObject({
      id: "full-entry",
      at: 9999999,
      event: "file.announced",
      peerId: "peer-abc",
      peerName: "Bob",
      role: "host",
      room: "test-room",
      detail: "file.txt (1234 bytes)",
    });
  });

  it("handles audit entry with numeric 'at' timestamp", () => {
    const { result } = renderHook(() => useLANAudit());
    const subscr = subscribeLANAuditMock.mock.calls[
      subscribeLANAuditMock.mock.calls.length - 1
    ][0] as () => void;

    const entry = makeAuditEntry({ id: "ts-num", at: 1620000000000 });
    readLANAuditMock.mockReturnValue([entry]);
    act(() => {
      subscr();
    });

    expect(result.current[0].at).toBe(1620000000000);
  });

  it("handles audit entry with string 'at' timestamp", () => {
    const { result } = renderHook(() => useLANAudit());
    const subscr = subscribeLANAuditMock.mock.calls[
      subscribeLANAuditMock.mock.calls.length - 1
    ][0] as () => void;

    const entry = makeAuditEntry({ id: "ts-str", at: "2024-01-01T00:00:00Z" });
    readLANAuditMock.mockReturnValue([entry]);
    act(() => {
      subscr();
    });

    expect(result.current[0].at).toBe("2024-01-01T00:00:00Z");
  });
});

describe("useLAN — snapshot functions are stable (lanSnapshot / auditSnapshot)", () => {
  // These tests verify the snapshot functions return the current cache value
  // on each call (the snapshot fn is passed as 3rd arg to useSyncExternalStore).

  it("useLAN snapshot returns the same object reference when cache has not changed", () => {
    getLANStatusMock.mockReturnValue("off");
    getLANPeersMock.mockReturnValue([]);
    subscribeLANMock.mockReturnValue(vi.fn());

    const { result, rerender } = renderHook(() => useLAN());
    const snap1 = result.current;

    rerender();
    const snap2 = result.current;

    // No subscriber event was fired, so lanCache was not updated → same reference
    expect(snap1).toBe(snap2);
  });

  it("useLANAudit snapshot returns the same array reference when cache has not changed", () => {
    readLANAuditMock.mockReturnValue([]);
    subscribeLANAuditMock.mockReturnValue(vi.fn());

    const { result, rerender } = renderHook(() => useLANAudit());
    const snap1 = result.current;

    rerender();
    const snap2 = result.current;

    expect(snap1).toBe(snap2);
  });
});
