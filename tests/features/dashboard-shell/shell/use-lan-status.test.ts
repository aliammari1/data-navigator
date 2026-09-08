/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock the LAN transport so tests can drive raw status / peers / persisted
// hub config without a real Hocuspocus connection.
// NOTE: vi.mock factories are hoisted — state lives in vi.hoisted().
// ---------------------------------------------------------------------------
const lan = vi.hoisted(() => {
  const state = {
    status: "off" as "off" | "connecting" | "connected" | "error",
    peers: [] as unknown[],
    activeSettings: null as { url: string } | null,
    url: "",
    watchers: new Set<() => void>(),
  };
  return {
    state,
    emit() {
      for (const fn of state.watchers) fn();
    },
  };
});

vi.mock("@/platform/lan/lan-collab", () => ({
  getActiveLANSettings: () => lan.state.activeSettings,
  getLANPeers: () => lan.state.peers,
  getLANStatus: () => lan.state.status,
  readLANSettings: () => ({
    url: lan.state.url,
    room: "telecom-default",
    pairingCode: "",
    peer: { id: "p1", name: "Me", role: "editor", color: "#000", active: true },
  }),
  subscribeLAN: (fn: () => void) => {
    lan.state.watchers.add(fn);
    return () => lan.state.watchers.delete(fn);
  },
}));

import { useLanStatus } from "@/features/dashboard-shell/shell/use-lan-status";

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: online,
  });
}

describe("useLanStatus", () => {
  beforeEach(() => {
    lan.state.status = "off";
    lan.state.peers = [];
    lan.state.activeSettings = null;
    lan.state.url = "";
    lan.state.watchers.clear();
    setOnline(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolves to 'disabled' when no hub URL is configured", async () => {
    const { result } = renderHook(() => useLanStatus());
    await waitFor(() => expect(result.current.state).toBe("disabled"));
  });

  it("resolves to 'unreachable' once a hub URL is persisted but no session is live", async () => {
    lan.state.url = "ws://192.168.1.20:1234";
    const { result } = renderHook(() => useLanStatus());
    await waitFor(() => expect(result.current.state).toBe("unreachable"));
  });

  it("resolves to 'offline' when a hub is configured but the browser is offline", async () => {
    lan.state.url = "ws://192.168.1.20:1234";
    setOnline(false);
    const { result } = renderHook(() => useLanStatus());
    await waitFor(() => expect(result.current.state).toBe("offline"));
  });

  it("maps raw connecting/connected/error statuses through to the resting model", async () => {
    lan.state.url = "ws://192.168.1.20:1234";
    lan.state.status = "connecting";
    const { result } = renderHook(() => useLanStatus());
    await waitFor(() => expect(result.current.state).toBe("connecting"));

    act(() => {
      lan.state.status = "connected";
      lan.state.peers = [{ id: "a" }, { id: "b" }];
      lan.emit();
    });
    await waitFor(() => expect(result.current.state).toBe("connected"));
    expect(result.current.peerCount).toBe(2);

    act(() => {
      lan.state.status = "error";
      lan.emit();
    });
    await waitFor(() => expect(result.current.state).toBe("unreachable"));
  });

  it("reacts to browser online/offline events after mount", async () => {
    lan.state.url = "ws://192.168.1.20:1234";
    lan.state.status = "connected";
    const { result } = renderHook(() => useLanStatus());
    await waitFor(() => expect(result.current.state).toBe("connected"));

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    await waitFor(() => expect(result.current.state).toBe("offline"));

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(result.current.state).toBe("connected"));
  });
});
