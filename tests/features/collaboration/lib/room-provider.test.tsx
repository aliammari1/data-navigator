/**
 * Behavioral tests for the RoomProvider and its exported hooks.
 *
 * All external IO boundaries are mocked:
 *  - @/features/collaboration/lib/room  (acquireRoom / releaseRoom — CRDT substrate)
 *  - @/platform/collab                  (setAwarenessUser)
 *  - @/platform/lan/lan-collab          (readLANSettings / getLANPeers / subscribeLAN)
 *
 * The actual JSX + hook logic inside room-provider.tsx runs for real so it
 * contributes to coverage.
 *
 * NOTE: rooms are backed by the singleton app doc — RoomProvider opens NO
 * network transport of its own (that is `connectLAN`'s job in lan-collab).
 * The old per-room connectRoomLAN/disconnectRoomLAN surface no longer exists.
 */

import React from "react";
import { render, screen, act, waitFor, renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted helpers (must run before module imports) ──────────────────────

const {
  acquireRoomMock,
  releaseRoomMock,
  setAwarenessUserMock,
  readLANSettingsMock,
  getLANPeersMock,
  subscribeLANMock,
} = vi.hoisted(() => {
  const acquireRoomMock = vi.fn();
  const releaseRoomMock = vi.fn();
  const setAwarenessUserMock = vi.fn();
  const readLANSettingsMock = vi.fn();
  const getLANPeersMock = vi.fn();
  const subscribeLANMock = vi.fn();
  return {
    acquireRoomMock,
    releaseRoomMock,
    setAwarenessUserMock,
    readLANSettingsMock,
    getLANPeersMock,
    subscribeLANMock,
  };
});

// ─── Module mocks ──────────────────────────────────────────────────────────

vi.mock("@/features/collaboration/lib/room", () => ({
  acquireRoom: (id: string) => acquireRoomMock(id),
  releaseRoom: (id: string) => releaseRoomMock(id),
}));

vi.mock("@/platform/collab", () => ({
  setAwarenessUser: (...args: unknown[]) => setAwarenessUserMock(...args),
}));

vi.mock("@/platform/lan/lan-collab", () => ({
  readLANSettings: () => readLANSettingsMock(),
  getLANPeers: () => getLANPeersMock(),
  subscribeLAN: (fn: () => void) => subscribeLANMock(fn),
}));

// ─── Target under test ─────────────────────────────────────────────────────

import {
  RoomProvider,
  useRoom,
  useLocalPeer,
} from "@/features/collaboration/lib/room-provider";

// ─── Test helpers ──────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  url: "",
  room: "telecom-default",
  pairingCode: "",
  peer: {
    id: "peer-abc",
    name: "Ada",
    role: "editor" as const,
    color: "#2f6bff",
    active: true,
  },
};

/** Build a minimal RoomDoc with a resolved `whenStored`. */
function makeRoomDoc(overrides: { whenStored?: Promise<void>; awareness?: unknown; nullAwareness?: boolean } = {}) {
  return {
    id: "room-1",
    doc: {},
    comments: [],
    changes: [],
    chat: [],
    awareness: overrides.nullAwareness ? null : (overrides.awareness ?? { setLocalStateField: vi.fn() }),
    whenStored: overrides.whenStored ?? Promise.resolve(),
  };
}

/** unsubscribe mock returned by subscribeLAN */
function makeUnsub() {
  return vi.fn();
}

beforeEach(() => {
  // Reset all mocks to their default implementations before each test.
  const unsub = makeUnsub();

  const room = makeRoomDoc();
  acquireRoomMock.mockReturnValue(room);
  releaseRoomMock.mockReturnValue(undefined);
  setAwarenessUserMock.mockReturnValue(undefined);
  readLANSettingsMock.mockReturnValue({ ...DEFAULT_SETTINGS });
  getLANPeersMock.mockReturnValue([]);
  subscribeLANMock.mockReturnValue(unsub);
});

// ─── useRoom outside provider ───────────────────────────────────────────────

describe("useRoom", () => {
  it("throws when used outside RoomProvider", () => {
    // Suppress the React error boundary console noise.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      renderHook(() => useRoom());
    }).toThrow("useRoom must be used inside <RoomProvider>");
    spy.mockRestore();
  });
});

// ─── useLocalPeer outside provider ─────────────────────────────────────────

describe("useLocalPeer", () => {
  it("throws when used outside RoomProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      renderHook(() => useLocalPeer());
    }).toThrow("useLocalPeer must be used inside <RoomProvider>");
    spy.mockRestore();
  });
});

// ─── RoomProvider skeleton while whenStored is pending ─────────────────────

describe("RoomProvider: skeleton state", () => {
  it("renders the loading skeleton before whenStored resolves", () => {
    // whenStored that never resolves → stays on skeleton.
    const room = makeRoomDoc({ whenStored: new Promise(() => {}) });
    acquireRoomMock.mockReturnValue(room);

    render(
      <RoomProvider roomId="room-1">
        <div data-testid="child">content</div>
      </RoomProvider>,
    );

    // Skeleton is visible; children are not.
    expect(screen.getByText(/loading collaboration room/i)).toBeInTheDocument();
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
  });
});

// ─── RoomProvider: stored (happy path) ─────────────────────────────────────

describe("RoomProvider: stored (whenStored resolved)", () => {
  it("renders children once whenStored resolves", async () => {
    // Default beforeEach returns room with Promise.resolve() whenStored.
    render(
      <RoomProvider roomId="room-1">
        <div data-testid="child">content</div>
      </RoomProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("child")).toBeInTheDocument();
    });
    expect(screen.queryByText(/loading collaboration room/i)).not.toBeInTheDocument();
  });

  it("acquires the room with the provided roomId", async () => {
    render(
      <RoomProvider roomId="room-42">
        <span />
      </RoomProvider>,
    );
    await waitFor(() => expect(acquireRoomMock).toHaveBeenCalledWith("room-42"));
  });

  it("releases the room on unmount", async () => {
    const { unmount } = render(
      <RoomProvider roomId="room-1">
        <span />
      </RoomProvider>,
    );
    await waitFor(() => screen.queryByText(/loading/i) === null || true);
    unmount();
    expect(releaseRoomMock).toHaveBeenCalledWith("room-1");
  });
});

// ─── useRoom inside provider ────────────────────────────────────────────────

describe("useRoom inside RoomProvider", () => {
  it("returns the room doc from the provider", async () => {
    const room = makeRoomDoc();
    acquireRoomMock.mockReturnValue(room);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RoomProvider roomId="room-1">{children}</RoomProvider>
    );

    const { result } = renderHook(() => useRoom(), { wrapper });

    await waitFor(() => {
      expect(result.current).toBe(room);
    });
  });
});

// ─── useLocalPeer inside provider ──────────────────────────────────────────

describe("useLocalPeer inside RoomProvider", () => {
  it("returns the local peer identity from LAN settings", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RoomProvider roomId="room-1">{children}</RoomProvider>
    );

    const { result } = renderHook(() => useLocalPeer(), { wrapper });

    await waitFor(() => {
      expect(result.current.id).toBe("peer-abc");
      expect(result.current.name).toBe("Ada");
      expect(result.current.color).toBe("#2f6bff");
    });
  });
});

// ─── subscribeLAN: peer identity sync ──────────────────────────────────────
//
// RoomProvider registers ONE subscribeLAN call: the peer identity sync effect.
// (The old second subscription — the per-room LAN connection effect — was
// deleted with the transport consolidation.)

describe("RoomProvider: LAN subscription peer identity sync", () => {
  it("updates the local peer when subscribeLAN fires and peer is found in peers list", async () => {
    // Collect all subscribers in order.
    const subs: Array<() => void> = [];
    subscribeLANMock.mockImplementation((fn: () => void) => {
      subs.push(fn);
      return vi.fn();
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RoomProvider roomId="room-1">{children}</RoomProvider>
    );
    const { result } = renderHook(() => useLocalPeer(), { wrapper });

    // Wait for all effects to fire (both subscribeLAN calls).
    await waitFor(() => {
      expect(subs.length).toBeGreaterThanOrEqual(1);
      expect(result.current.id).toBe("peer-abc");
    });

    // The peer identity sync subscriber is always the FIRST one registered.
    const peerSub = subs[0];

    // Now simulate the LAN settings update where peer is found in getLANPeers.
    readLANSettingsMock.mockReturnValue({
      ...DEFAULT_SETTINGS,
      peer: { ...DEFAULT_SETTINGS.peer, name: "Ada-updated", color: "#ff0000" },
    });
    getLANPeersMock.mockReturnValue([
      { id: "peer-abc", name: "Ada-updated", color: "#ff0000", role: "editor", active: true },
    ]);

    act(() => {
      peerSub();
    });

    await waitFor(() => {
      expect(result.current.name).toBe("Ada-updated");
      expect(result.current.color).toBe("#ff0000");
    });
  });

  it("falls back to LAN settings name/color when peer not found in getLANPeers", async () => {
    const subs: Array<() => void> = [];
    subscribeLANMock.mockImplementation((fn: () => void) => {
      subs.push(fn);
      return vi.fn();
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RoomProvider roomId="room-1">{children}</RoomProvider>
    );
    const { result } = renderHook(() => useLocalPeer(), { wrapper });

    await waitFor(() => {
      expect(subs.length).toBeGreaterThanOrEqual(1);
      expect(result.current.id).toBe("peer-abc");
    });

    const peerSub = subs[0];

    // Simulate settings update, but getLANPeers returns empty (peer not found).
    readLANSettingsMock.mockReturnValue({
      ...DEFAULT_SETTINGS,
      peer: { ...DEFAULT_SETTINGS.peer, name: "FallbackName", color: "#abcdef" },
    });
    getLANPeersMock.mockReturnValue([]); // no matching peer

    act(() => {
      peerSub();
    });

    await waitFor(() => {
      expect(result.current.name).toBe("FallbackName");
      expect(result.current.color).toBe("#abcdef");
    });
  });

  it("does not trigger re-render when identity has not changed", async () => {
    const subs: Array<() => void> = [];
    subscribeLANMock.mockImplementation((fn: () => void) => {
      subs.push(fn);
      return vi.fn();
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <RoomProvider roomId="room-1">{children}</RoomProvider>
    );
    const { result } = renderHook(() => useLocalPeer(), { wrapper });
    await waitFor(() => {
      expect(subs.length).toBeGreaterThanOrEqual(1);
      expect(result.current.id).toBe("peer-abc");
    });

    const peerBefore = result.current;
    const peerSub = subs[0];

    // Fire subscriber with same data — no change.
    getLANPeersMock.mockReturnValue([]);
    act(() => {
      peerSub();
    });

    // The reference should be the same (no re-render with different peer object).
    expect(result.current).toBe(peerBefore);
  });

  it("calls the unsubscribe fn returned by subscribeLAN on unmount", async () => {
    const unsubs: Array<ReturnType<typeof vi.fn>> = [];
    subscribeLANMock.mockImplementation(() => {
      const unsub = vi.fn();
      unsubs.push(unsub);
      return unsub;
    });

    const { unmount } = render(
      <RoomProvider roomId="room-1">
        <span />
      </RoomProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    unmount();

    // At least one subscriber's cleanup was called.
    expect(unsubs.some((u) => u.mock.calls.length > 0)).toBe(true);
  });
});

// ─── awareness: setAwarenessUser ───────────────────────────────────────────

describe("RoomProvider: awareness user publishing", () => {
  it("calls setAwarenessUser with the room awareness and peer identity", async () => {
    const awareness = { setLocalStateField: vi.fn() };
    const room = makeRoomDoc({ awareness });
    acquireRoomMock.mockReturnValue(room);

    render(
      <RoomProvider roomId="room-1">
        <span />
      </RoomProvider>,
    );

    await waitFor(() => {
      expect(setAwarenessUserMock).toHaveBeenCalled();
    });

    const [calledAwareness, userArg] = setAwarenessUserMock.mock.calls[0] as [
      unknown,
      { id: string; name: string; color: string; role: string },
    ];
    expect(calledAwareness).toBe(awareness);
    expect(userArg.id).toBe("peer-abc");
    expect(userArg.name).toBe("Ada");
    expect(userArg.color).toBe("#2f6bff");
    expect(userArg.role).toBe("editor");
  });

  it("skips setAwarenessUser when room.awareness is falsy", async () => {
    const room = makeRoomDoc({ nullAwareness: true });
    acquireRoomMock.mockReturnValue(room);

    render(
      <RoomProvider roomId="room-1">
        <span />
      </RoomProvider>,
    );

    // Give effects time to run.
    await act(async () => {
      await Promise.resolve();
    });

    expect(setAwarenessUserMock).not.toHaveBeenCalled();
  });
});

// ─── No per-room transport ──────────────────────────────────────────────────

describe("RoomProvider: opens no transport of its own", () => {
  it("registers only the peer-identity subscribeLAN subscription, even with a hub URL configured", async () => {
    const subscribers: Array<() => void> = [];
    subscribeLANMock.mockImplementation((fn: () => void) => {
      subscribers.push(fn);
      return vi.fn();
    });

    readLANSettingsMock.mockReturnValue({
      ...DEFAULT_SETTINGS,
      url: "ws://192.168.1.100:1234",
      pairingCode: "abc123",
    });

    render(
      <RoomProvider roomId="room-1">
        <span data-testid="child" />
      </RoomProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("child")).toBeInTheDocument();
    });

    // The old per-room LAN connection effect registered a SECOND subscription
    // (and opened a second HocuspocusProvider against the same document,
    // duplicating every peer). Only the identity-sync subscription remains —
    // transport is connectLAN's job in @/platform/lan/lan-collab.
    expect(subscribers.length).toBe(1);
  });
});

// ─── Multiple RoomProvider instances ───────────────────────────────────────

describe("RoomProvider: multiple instances", () => {
  it("acquires each room by its distinct roomId", async () => {
    const room1 = makeRoomDoc();
    const room2 = makeRoomDoc();
    acquireRoomMock.mockReturnValueOnce(room1).mockReturnValueOnce(room2);

    render(
      <>
        <RoomProvider roomId="room-A">
          <span data-testid="a" />
        </RoomProvider>
        <RoomProvider roomId="room-B">
          <span data-testid="b" />
        </RoomProvider>
      </>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("a")).toBeInTheDocument();
      expect(screen.getByTestId("b")).toBeInTheDocument();
    });

    expect(acquireRoomMock).toHaveBeenCalledWith("room-A");
    expect(acquireRoomMock).toHaveBeenCalledWith("room-B");
  });
});
