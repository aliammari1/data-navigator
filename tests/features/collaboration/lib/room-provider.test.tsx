/**
 * Behavioral tests for the RoomProvider and its exported hooks.
 *
 * All external IO boundaries are mocked:
 *  - @/features/collaboration/lib/room  (acquireRoom / releaseRoom — CRDT substrate)
 *  - @/platform/collab                  (connectRoomLAN / disconnectRoomLAN / setAwarenessUser)
 *  - @/platform/lan/lan-collab          (readLANSettings / getLANPeers / subscribeLAN)
 *
 * The actual JSX + hook logic inside room-provider.tsx runs for real so it
 * contributes to coverage.
 */

import React from "react";
import { render, screen, act, waitFor, renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted helpers (must run before module imports) ──────────────────────

const {
  acquireRoomMock,
  releaseRoomMock,
  connectRoomLANMock,
  disconnectRoomLANMock,
  setAwarenessUserMock,
  readLANSettingsMock,
  getLANPeersMock,
  subscribeLANMock,
} = vi.hoisted(() => {
  const acquireRoomMock = vi.fn();
  const releaseRoomMock = vi.fn();
  const connectRoomLANMock = vi.fn().mockResolvedValue(undefined);
  const disconnectRoomLANMock = vi.fn();
  const setAwarenessUserMock = vi.fn();
  const readLANSettingsMock = vi.fn();
  const getLANPeersMock = vi.fn();
  const subscribeLANMock = vi.fn();
  return {
    acquireRoomMock,
    releaseRoomMock,
    connectRoomLANMock,
    disconnectRoomLANMock,
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
  connectRoomLAN: (...args: unknown[]) => connectRoomLANMock(...args),
  disconnectRoomLAN: (...args: unknown[]) => disconnectRoomLANMock(...args),
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
  connectRoomLANMock.mockResolvedValue(undefined);
  disconnectRoomLANMock.mockReturnValue(undefined);
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
// RoomProvider registers TWO subscribeLAN calls:
//   call #1 — peer identity sync effect (the one we want for peer tests)
//   call #2 — LAN connection effect
// We collect all subscribers so tests can target the right one.

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

// ─── LAN connection: connectRoomLAN ────────────────────────────────────────

describe("RoomProvider: LAN connection", () => {
  it("calls connectRoomLAN when LAN settings have a url", async () => {
    readLANSettingsMock.mockReturnValue({
      ...DEFAULT_SETTINGS,
      url: "ws://192.168.1.100:1234",
      room: "my-room",
      pairingCode: "abc123",
    });

    render(
      <RoomProvider roomId="room-1">
        <span />
      </RoomProvider>,
    );

    await waitFor(() => {
      expect(connectRoomLANMock).toHaveBeenCalledWith(
        "room-1",
        expect.objectContaining({
          url: "ws://192.168.1.100:1234",
          room: "my-room",
          pairingCode: "abc123",
        }),
      );
    });
  });

  it("does not call connectRoomLAN when url is empty — stays local-only", async () => {
    // Default settings have url: "".
    readLANSettingsMock.mockReturnValue({ ...DEFAULT_SETTINGS, url: "" });

    render(
      <RoomProvider roomId="room-1">
        <span />
      </RoomProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(connectRoomLANMock).not.toHaveBeenCalled();
  });

  it("calls disconnectRoomLAN when url is empty", async () => {
    readLANSettingsMock.mockReturnValue({ ...DEFAULT_SETTINGS, url: "" });

    render(
      <RoomProvider roomId="room-1">
        <span />
      </RoomProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(disconnectRoomLANMock).toHaveBeenCalledWith("room-1");
  });

  it("calls disconnectRoomLAN on unmount", async () => {
    readLANSettingsMock.mockReturnValue({
      ...DEFAULT_SETTINGS,
      url: "ws://192.168.1.100:1234",
    });

    const { unmount } = render(
      <RoomProvider roomId="room-1">
        <span />
      </RoomProvider>,
    );

    await waitFor(() => expect(connectRoomLANMock).toHaveBeenCalled());

    disconnectRoomLANMock.mockClear();
    unmount();

    expect(disconnectRoomLANMock).toHaveBeenCalledWith("room-1");
  });

  it("swallows connectRoomLAN errors silently (offline / hub unreachable)", async () => {
    readLANSettingsMock.mockReturnValue({
      ...DEFAULT_SETTINGS,
      url: "ws://unreachable:9999",
    });
    connectRoomLANMock.mockRejectedValue(new Error("connection refused"));

    // Should NOT throw.
    render(
      <RoomProvider roomId="room-1">
        <span />
      </RoomProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    // The error is swallowed; children still render after whenStored resolves.
    await waitFor(() => {
      expect(screen.queryByText(/loading collaboration room/i)).not.toBeInTheDocument();
    });
  });

  it("does not reconnect when subscribeLAN fires but the transport signature is unchanged", async () => {
    const subscribers: Array<() => void> = [];
    subscribeLANMock.mockImplementation((fn: () => void) => {
      subscribers.push(fn);
      return vi.fn();
    });

    const settings = {
      ...DEFAULT_SETTINGS,
      url: "ws://192.168.1.100:1234",
    };
    readLANSettingsMock.mockReturnValue(settings);

    render(
      <RoomProvider roomId="room-1">
        <span />
      </RoomProvider>,
    );

    await waitFor(() => {
      expect(connectRoomLANMock).toHaveBeenCalledTimes(1);
      expect(subscribers.length).toBeGreaterThanOrEqual(2);
    });

    // Fire the LAN connection subscriber (second) with the same settings.
    // The signature has not changed, so no new connect should be made.
    act(() => {
      subscribers[1]?.();
    });

    expect(connectRoomLANMock).toHaveBeenCalledTimes(1);
  });

  it("reconnects when subscribeLAN fires and the LAN settings signature changes", async () => {
    // The LAN connection effect calls subscribeLAN(sync) AFTER the peer-identity
    // effect calls subscribeLAN(peerSub). Collect all subscribers; fire each
    // candidate until connectRoomLAN is called a second time.
    const subscribers: Array<() => void> = [];
    subscribeLANMock.mockImplementation((fn: () => void) => {
      subscribers.push(fn);
      return vi.fn();
    });

    readLANSettingsMock.mockReturnValue({
      ...DEFAULT_SETTINGS,
      url: "ws://192.168.1.100:1234",
    });

    render(
      <RoomProvider roomId="room-1">
        <span />
      </RoomProvider>,
    );

    // Wait for initial connect AND for both subscribeLAN calls to have run.
    await waitFor(() => {
      expect(connectRoomLANMock).toHaveBeenCalledTimes(1);
      expect(subscribers.length).toBeGreaterThanOrEqual(2);
    });

    // Change the URL so the transport signature changes.
    readLANSettingsMock.mockReturnValue({
      ...DEFAULT_SETTINGS,
      url: "ws://10.0.0.5:1234",
    });

    // The LAN connection subscriber is the SECOND one registered.
    act(() => {
      subscribers[1]?.();
    });

    await waitFor(() => {
      expect(connectRoomLANMock).toHaveBeenCalledTimes(2);
    });
  });

  it("passes the full peer identity to connectRoomLAN", async () => {
    readLANSettingsMock.mockReturnValue({
      ...DEFAULT_SETTINGS,
      url: "ws://192.168.1.100:1234",
    });

    render(
      <RoomProvider roomId="room-1">
        <span />
      </RoomProvider>,
    );

    await waitFor(() => expect(connectRoomLANMock).toHaveBeenCalled());

    const [, opts] = connectRoomLANMock.mock.calls[0] as [
      string,
      { identity: { id: string; name: string; role: string; color: string } },
    ];
    expect(opts.identity.id).toBe("peer-abc");
    expect(opts.identity.name).toBe("Ada");
    expect(opts.identity.role).toBe("editor");
    expect(opts.identity.color).toBe("#2f6bff");
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
