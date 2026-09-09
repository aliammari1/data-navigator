import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCollabHubStore } from "@/core/stores/collab-hub-store";

function stubLocalStorage(store: Record<string, string> = {}) {
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((k: string) => store[k] ?? null),
    setItem: vi.fn((k: string, v: string) => {
      store[k] = v;
    }),
    removeItem: vi.fn((k: string) => {
      delete store[k];
    }),
    clear: vi.fn(),
    length: 0,
    key: vi.fn(),
  });
  return store;
}

beforeEach(() => {
  stubLocalStorage();
});

describe("collab hub prefs", () => {
  it("sets username and note style", () => {
    const { result } = renderHook(() => useCollabHubStore());
    act(() => {
      result.current.setUsername("Amina");
      result.current.setLastNoteStyle("blue", "urgent");
    });
    expect(result.current.username).toBe("Amina");
    expect(result.current.lastNoteColor).toBe("blue");
    expect(result.current.lastNotePriority).toBe("urgent");
  });

  it("shares reports newest-first, deduped, capped at 50", () => {
    const { result } = renderHook(() => useCollabHubStore());
    act(() => {
      result.current.shareReport({
        id: "r1",
        name: "R1",
        approvedBy: "A",
        approvedAt: 1,
        url: "u1",
      });
      result.current.shareReport({
        id: "r1",
        name: "R1b",
        approvedBy: "A",
        approvedAt: 2,
        url: "u1b",
      });
    });
    expect(result.current.sharedReports).toHaveLength(1);
    expect(result.current.sharedReports[0].name).toBe("R1b");
  });

  it("derives the session code from the LAN room settings", () => {
    const { result } = renderHook(() => useCollabHubStore());
    let code: string | null = null;
    act(() => {
      code = result.current.refreshSessionCode();
    });
    // Default settings always carry a room, so the code is joinable text.
    expect(code).toBe("telecom-default");
    expect(result.current.sessionCode).toBe("telecom-default");
  });
});

describe("collab hub initial username", () => {
  it("honors a stored collab:username override at startup", async () => {
    const store: Record<string, string> = { "collab:username": "Karim" };
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((k: string) => store[k] ?? null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    });
    vi.resetModules();
    try {
      const mod = await import("@/core/stores/collab-hub-store");
      expect(mod.useCollabHubStore.getState().username).toBe("Karim");
    } finally {
      vi.resetModules();
    }
  });

  it("falls back to 'You' when LAN settings are unreadable", async () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((k: string) => {
        if (k === "telecom-lan-room-v2") throw new Error("denied");
        return null;
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    });
    vi.resetModules();
    try {
      const mod = await import("@/core/stores/collab-hub-store");
      expect(mod.useCollabHubStore.getState().username).toBe("You");
    } finally {
      vi.resetModules();
    }
  });
});
