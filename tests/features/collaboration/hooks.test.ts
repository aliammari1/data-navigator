import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const lanCollabMocks = vi.hoisted(() => ({
  getLANPeers: vi.fn(),
  subscribeLAN: vi.fn(),
  readFollowRequest: vi.fn(),
  subscribeLANRoom: vi.fn(),
  publishPresence: vi.fn(),
  readLANSettings: vi.fn(),
}));

vi.mock("@/platform/lan/lan-collab", () => lanCollabMocks);

const collabMocks = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    sharedLanRoom: {
      get: vi.fn((k: string) => store.get(k)),
      set: vi.fn((k: string, v: string) => {
        store.set(k, v);
      }),
    },
  };
});

vi.mock("@/platform/collab", () => ({ sharedLanRoom: collabMocks.sharedLanRoom }));

vi.mock("next/navigation", () => ({
  get usePathname() {
    return () => pathnameState.current;
  },
}));

const pathnameState = vi.hoisted(() => ({ current: "/dashboard/telecom" as string | null }));

import { useCurrentPage } from "@/features/collaboration/hooks/use-current-page";
import { addCursorNote, useCursorNotes } from "@/features/collaboration/hooks/use-cursor-notes";
import { useFollowRequest } from "@/features/collaboration/hooks/use-follow-request";
import { useRemoteCursors } from "@/features/collaboration/hooks/use-remote-cursors";

const PEER = {
  id: "p1",
  name: "Amina",
  color: "#ff0000",
  sectionId: "s1",
  cursor: { x: 10, y: 20, ts: Date.now() },
};

beforeEach(() => {
  vi.clearAllMocks();
  collabMocks.store.clear();
  lanCollabMocks.getLANPeers.mockReturnValue([]);
  lanCollabMocks.subscribeLAN.mockReturnValue(() => {});
  lanCollabMocks.subscribeLANRoom.mockReturnValue(() => {});
  lanCollabMocks.readFollowRequest.mockReturnValue(null);
  lanCollabMocks.readLANSettings.mockReturnValue({
    peer: { id: "me", name: "Me", color: "#00ff00" },
  });
});

describe("useRemoteCursors", () => {
  it("returns [] for null section and lists fresh cursors", () => {
    lanCollabMocks.getLANPeers.mockReturnValue([PEER]);
    const { result, rerender } = renderHook(({ s }) => useRemoteCursors(s), {
      initialProps: { s: null as string | null },
    });
    expect(result.current).toEqual([]);
    rerender({ s: "s1" });
    expect(result.current).toHaveLength(1);
    expect(result.current[0].peer.id).toBe("p1");
  });

  it("drops stale and other-section cursors", () => {
    lanCollabMocks.getLANPeers.mockReturnValue([
      { ...PEER, id: "old", cursor: { x: 0, y: 0, ts: Date.now() - 60_000 } },
      { ...PEER, id: "other", sectionId: "s2" },
      { ...PEER, id: "nocursor", cursor: undefined },
    ]);
    const { result } = renderHook(() => useRemoteCursors("s1"));
    expect(result.current).toEqual([]);
  });

  it("refreshes entries when the peer list changes at equal length", () => {
    lanCollabMocks.getLANPeers.mockReturnValue([PEER]);
    let listener: (() => void) | undefined;
    lanCollabMocks.subscribeLAN.mockImplementation((fn: () => void) => {
      listener = fn;
      return () => {};
    });
    const { result } = renderHook(() => useRemoteCursors("s1"));
    expect(result.current[0].cursor.ts).toBe(PEER.cursor.ts);

    const moved = { ...PEER, cursor: { x: 99, y: 99, ts: Date.now() + 5 } };
    lanCollabMocks.getLANPeers.mockReturnValue([moved]);
    act(() => {
      listener?.();
    });
    expect(result.current[0].cursor.x).toBe(99);

    // Firing again with identical content keeps referential stability.
    const stable = result.current;
    act(() => {
      listener?.();
    });
    expect(result.current).toBe(stable);
  });
});

describe("useFollowRequest", () => {
  it("reads the initial request and updates on room events", () => {
    const req = { fromPeerId: "p2", ts: 123 };
    lanCollabMocks.readFollowRequest.mockReturnValue(req);
    let listener: (() => void) | undefined;
    lanCollabMocks.subscribeLANRoom.mockImplementation((fn: () => void) => {
      listener = fn;
      return () => {};
    });
    const { result } = renderHook(() => useFollowRequest());
    expect(result.current).toEqual(req);

    lanCollabMocks.readFollowRequest.mockReturnValue(null);
    act(() => {
      listener?.();
    });
    expect(result.current).toBeNull();
  });

  it("keeps the reference when the room event yields an equal request", () => {
    const req = { fromPeerId: "p2", ts: 123 };
    lanCollabMocks.readFollowRequest.mockReturnValue(req);
    let listener: (() => void) | undefined;
    lanCollabMocks.subscribeLANRoom.mockImplementation((fn: () => void) => {
      listener = fn;
      return () => {};
    });
    const { result } = renderHook(() => useFollowRequest());
    const stable = result.current;
    act(() => {
      listener?.();
    });
    expect(result.current).toBe(stable);
  });
});

describe("useCurrentPage", () => {
  it("publishes presence on a throttle without crashing", () => {
    vi.useFakeTimers();
    try {
      renderHook(() => useCurrentPage("tab", "s1"));
      act(() => {
        vi.runAllTimers();
      });
      expect(lanCollabMocks.publishPresence).toHaveBeenCalledWith({
        page: "/dashboard/telecom",
        tab: "tab",
        sectionId: "s1",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips publishing when there is no pathname and cleans up on unmount", () => {
    pathnameState.current = null;
    try {
      const { unmount } = renderHook(() => useCurrentPage());
      expect(lanCollabMocks.publishPresence).not.toHaveBeenCalled();
      unmount();
    } finally {
      pathnameState.current = "/dashboard/telecom";
    }
  });
});

describe("cursor notes", () => {
  const base = {
    sectionId: "s1",
    authorPeerId: "me",
    authorName: "Me",
    authorColor: "#00ff00",
    text: "Regarder ce pic",
  };

  it("adds a note and reads it back", () => {
    const note = addCursorNote(base);
    expect(note.id).toBeTruthy();
    expect(note.authorColor).toBe("#00ff00");

    const { result } = renderHook(() => useCursorNotes("s1"));
    expect(result.current.map((n) => n.id)).toContain(note.id);
  });

  it("falls back to the peer color for invalid colors", () => {
    const note = addCursorNote({ ...base, authorColor: "not-a-color" });
    expect(note.authorColor).toBe("#00ff00");
  });

  it("returns [] for null section and tolerates corrupt payloads", () => {
    collabMocks.store.set("cursorNotes:s9", "not-json{{{");
    const { result } = renderHook(() => useCursorNotes("s9"));
    expect(result.current).toEqual([]);
    const { result: nullResult } = renderHook(() => useCursorNotes(null));
    expect(nullResult.current).toEqual([]);
  });

  it("ignores non-array and malformed note payloads", () => {
    collabMocks.store.set("cursorNotes:s8", "42");
    expect(renderHook(() => useCursorNotes("s8")).result.current).toEqual([]);

    collabMocks.store.set("cursorNotes:s8", JSON.stringify([{ id: 42, text: 7 }]));
    expect(renderHook(() => useCursorNotes("s8")).result.current).toEqual([]);
  });

  it("merges subscription updates and dedupes re-shared ids", () => {
    const first = addCursorNote(base);
    let listener: (() => void) | undefined;
    lanCollabMocks.subscribeLANRoom.mockImplementation((fn: () => void) => {
      listener = fn;
      return () => {};
    });
    const { result } = renderHook(() => useCursorNotes("s1"));
    expect(result.current).toHaveLength(1);

    // Same id re-shared (fixed UUID) replaces instead of duplicating.
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(first.id);
    try {
      addCursorNote({ ...base, text: "Updated text" });
    } finally {
      vi.restoreAllMocks();
    }
    act(() => {
      listener?.();
    });
    expect(result.current).toHaveLength(1);
    expect(result.current[0].text).toBe("Updated text");
  });
});
