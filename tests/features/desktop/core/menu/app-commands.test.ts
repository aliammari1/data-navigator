import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_COMMAND_EVENT,
  type AppCommandDetail,
  dispatchAppCommand,
  useAppCommands,
  usePageStore,
  useRegisterPages,
  useWindowPages,
} from "@/features/desktop/core/menu/app-commands";
import type { AppPage } from "@/features/desktop/core/menu/types";

/**
 * Behavioral tests for the app-command bus and the per-window page registry.
 *
 * The bus is a thin CustomEvent wrapper over `window`; the page registry is a
 * plain (non-persisted) zustand store. Both are exercised end-to-end here —
 * dispatch → listener, and register → read — rather than mocked, since they
 * have no external boundaries worth stubbing.
 */

const StubIcon = () => null;

function resetPageStore() {
  usePageStore.setState({ byWindow: {} }, false);
}

beforeEach(() => {
  resetPageStore();
});

// ─── dispatchAppCommand ───────────────────────────────────────────────────────

describe("dispatchAppCommand", () => {
  it("dispatches a CustomEvent of type APP_COMMAND_EVENT with the given detail", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    dispatchAppCommand("telecom", "win-1", "export", { format: "csv" });
    const ev = spy.mock.calls.at(-1)?.[0] as CustomEvent<AppCommandDetail>;
    expect(ev.type).toBe(APP_COMMAND_EVENT);
    expect(ev.detail).toEqual({
      appId: "telecom",
      windowId: "win-1",
      commandId: "export",
      payload: { format: "csv" },
    });
    spy.mockRestore();
  });

  it("omits the payload field's value (undefined) when none is passed", () => {
    const spy = vi.spyOn(window, "dispatchEvent");
    dispatchAppCommand("geo", null, "refresh");
    const ev = spy.mock.calls.at(-1)?.[0] as CustomEvent<AppCommandDetail>;
    expect(ev.detail.payload).toBeUndefined();
    expect(ev.detail.windowId).toBeNull();
    spy.mockRestore();
  });
});

// ─── useAppCommands ───────────────────────────────────────────────────────────

describe("useAppCommands", () => {
  it("invokes the handler registered for the dispatched commandId", () => {
    const handler = vi.fn();
    renderHook(() => useAppCommands("telecom", { export: handler }));

    act(() => {
      dispatchAppCommand("telecom", "win-1", "export", { a: 1 });
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      { a: 1 },
      { appId: "telecom", windowId: "win-1", commandId: "export", payload: { a: 1 } },
    );
  });

  it("ignores commands dispatched for a different appId", () => {
    const handler = vi.fn();
    renderHook(() => useAppCommands("telecom", { export: handler }));

    act(() => {
      dispatchAppCommand("geo", "win-1", "export");
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores an unregistered commandId for the same app", () => {
    const handler = vi.fn();
    renderHook(() => useAppCommands("telecom", { export: handler }));

    act(() => {
      dispatchAppCommand("telecom", "win-1", "refresh");
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("scopes to a single windowId when opts.windowId is provided", () => {
    const handler = vi.fn();
    renderHook(() => useAppCommands("telecom", { export: handler }, { windowId: "win-1" }));

    act(() => {
      dispatchAppCommand("telecom", "win-2", "export");
    });
    expect(handler).not.toHaveBeenCalled();

    act(() => {
      dispatchAppCommand("telecom", "win-1", "export");
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("handles every command for its app when opts.windowId is omitted (multi-instance)", () => {
    const handler = vi.fn();
    renderHook(() => useAppCommands("telecom", { export: handler }));

    act(() => {
      dispatchAppCommand("telecom", "win-a", "export");
      dispatchAppCommand("telecom", "win-b", "export");
    });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("still routes commands with a null windowId when the subscriber is unscoped", () => {
    const handler = vi.fn();
    renderHook(() => useAppCommands("telecom", { export: handler }));

    act(() => {
      dispatchAppCommand("telecom", null, "export");
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("reads handlers live via ref so a fresh handlers object each render is honored", () => {
    const handlerV1 = vi.fn();
    const handlerV2 = vi.fn();
    const { rerender } = renderHook(({ handlers }) => useAppCommands("telecom", handlers), {
      initialProps: { handlers: { export: handlerV1 } },
    });

    rerender({ handlers: { export: handlerV2 } });

    act(() => {
      dispatchAppCommand("telecom", "win-1", "export");
    });

    expect(handlerV1).not.toHaveBeenCalled();
    expect(handlerV2).toHaveBeenCalledTimes(1);
  });

  it("stops handling commands after unmount", () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useAppCommands("telecom", { export: handler }));
    unmount();

    act(() => {
      dispatchAppCommand("telecom", "win-1", "export");
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores an event dispatched with no detail (defensive guard)", () => {
    const handler = vi.fn();
    renderHook(() => useAppCommands("telecom", { export: handler }));

    act(() => {
      window.dispatchEvent(new CustomEvent(APP_COMMAND_EVENT));
    });

    expect(handler).not.toHaveBeenCalled();
  });
});

// ─── usePageStore: registerPages ─────────────────────────────────────────────

describe("usePageStore.registerPages", () => {
  const pages: AppPage[] = [
    { id: "overview", label: "Vue d'ensemble", icon: StubIcon },
    { id: "channels", label: "Canaux", icon: StubIcon },
  ];

  it("registers pages for a window and defaults the active id to the first page", () => {
    usePageStore.getState().registerPages("win-1", pages);
    expect(usePageStore.getState().byWindow["win-1"]).toEqual({
      items: pages,
      activeId: "overview",
    });
  });

  it("uses the explicit activeId when provided", () => {
    usePageStore.getState().registerPages("win-1", pages, "channels");
    expect(usePageStore.getState().byWindow["win-1"].activeId).toBe("channels");
  });

  it("falls back to null activeId when pages is an empty array and no activeId given", () => {
    usePageStore.getState().registerPages("win-1", []);
    expect(usePageStore.getState().byWindow["win-1"]).toEqual({ items: [], activeId: null });
  });

  it("is idempotent: re-registering the same ids in the same order with the same active id is a no-op (same state reference)", () => {
    usePageStore.getState().registerPages("win-1", pages, "overview");
    const before = usePageStore.getState();
    usePageStore.getState().registerPages("win-1", pages, "overview");
    expect(usePageStore.getState()).toBe(before);
  });

  it("updates when the active id changes even if the page ids stay the same", () => {
    usePageStore.getState().registerPages("win-1", pages, "overview");
    usePageStore.getState().registerPages("win-1", pages, "channels");
    expect(usePageStore.getState().byWindow["win-1"].activeId).toBe("channels");
  });

  it("updates when the page id list itself changes (different length)", () => {
    usePageStore.getState().registerPages("win-1", pages, "overview");
    const shorter = [pages[0]];
    usePageStore.getState().registerPages("win-1", shorter, "overview");
    expect(usePageStore.getState().byWindow["win-1"].items).toEqual(shorter);
  });

  it("updates when the page id list changes order (same length, different ids per index)", () => {
    usePageStore.getState().registerPages("win-1", pages, "overview");
    const reordered = [pages[1], pages[0]];
    usePageStore.getState().registerPages("win-1", reordered, "overview");
    expect(usePageStore.getState().byWindow["win-1"].items).toEqual(reordered);
  });

  it("tracks pages per window independently", () => {
    usePageStore.getState().registerPages("win-1", pages);
    usePageStore.getState().registerPages("win-2", [pages[0]]);
    expect(usePageStore.getState().byWindow["win-1"].items).toHaveLength(2);
    expect(usePageStore.getState().byWindow["win-2"].items).toHaveLength(1);
  });
});

// ─── usePageStore: setActivePage ─────────────────────────────────────────────

describe("usePageStore.setActivePage", () => {
  it("switches the active page for a registered window", () => {
    usePageStore.getState().registerPages("win-1", [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ]);
    usePageStore.getState().setActivePage("win-1", "b");
    expect(usePageStore.getState().byWindow["win-1"].activeId).toBe("b");
  });

  it("is a no-op (same state reference) when the window has no registered entry", () => {
    const before = usePageStore.getState();
    usePageStore.getState().setActivePage("unknown-window", "x");
    expect(usePageStore.getState()).toBe(before);
  });

  it("is a no-op (same state reference) when the page id is already active", () => {
    usePageStore.getState().registerPages("win-1", [{ id: "a", label: "A" }], "a");
    const before = usePageStore.getState();
    usePageStore.getState().setActivePage("win-1", "a");
    expect(usePageStore.getState()).toBe(before);
  });
});

// ─── usePageStore: clearPages ─────────────────────────────────────────────────

describe("usePageStore.clearPages", () => {
  it("removes a window's registered pages", () => {
    usePageStore.getState().registerPages("win-1", [{ id: "a", label: "A" }]);
    usePageStore.getState().clearPages("win-1");
    expect(usePageStore.getState().byWindow["win-1"]).toBeUndefined();
  });

  it("is a no-op (same state reference) when the window was never registered", () => {
    const before = usePageStore.getState();
    usePageStore.getState().clearPages("never-registered");
    expect(usePageStore.getState()).toBe(before);
  });

  it("leaves other windows' pages untouched", () => {
    usePageStore.getState().registerPages("win-1", [{ id: "a", label: "A" }]);
    usePageStore.getState().registerPages("win-2", [{ id: "b", label: "B" }]);
    usePageStore.getState().clearPages("win-1");
    expect(usePageStore.getState().byWindow["win-2"]).toBeDefined();
  });
});

// ─── useWindowPages ───────────────────────────────────────────────────────────

describe("useWindowPages", () => {
  it("returns the stable empty default when windowId is null", () => {
    const { result } = renderHook(() => useWindowPages(null));
    expect(result.current).toEqual({ items: [], activeId: null });
  });

  it("returns the stable empty default when the window has no registered pages", () => {
    const { result } = renderHook(() => useWindowPages("win-none"));
    expect(result.current).toEqual({ items: [], activeId: null });
  });

  it("reflects pages registered for the given window", () => {
    usePageStore.getState().registerPages("win-1", [{ id: "a", label: "A" }], "a");
    const { result } = renderHook(() => useWindowPages("win-1"));
    expect(result.current).toEqual({ items: [{ id: "a", label: "A" }], activeId: "a" });
  });

  it("re-renders with the updated active page after setActivePage", () => {
    usePageStore.getState().registerPages("win-1", [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ]);
    const { result } = renderHook(() => useWindowPages("win-1"));
    expect(result.current.activeId).toBe("a");

    act(() => {
      usePageStore.getState().setActivePage("win-1", "b");
    });

    expect(result.current.activeId).toBe("b");
  });
});

// ─── useRegisterPages ─────────────────────────────────────────────────────────

describe("useRegisterPages", () => {
  it("registers pages for the given windowId on mount", () => {
    const items: AppPage[] = [{ id: "a", label: "A" }];
    renderHook(() => useRegisterPages("win-1", items));
    expect(usePageStore.getState().byWindow["win-1"].items).toEqual(items);
  });

  it("does nothing when windowId is null", () => {
    renderHook(() => useRegisterPages(null, [{ id: "a", label: "A" }]));
    expect(usePageStore.getState().byWindow).toEqual({});
  });

  it("passes the activeId through when provided", () => {
    renderHook(() =>
      useRegisterPages(
        "win-1",
        [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        "b",
      ),
    );
    expect(usePageStore.getState().byWindow["win-1"].activeId).toBe("b");
  });

  it("clears the window's pages on unmount", () => {
    const { unmount } = renderHook(() => useRegisterPages("win-1", [{ id: "a", label: "A" }]));
    expect(usePageStore.getState().byWindow["win-1"]).toBeDefined();

    unmount();

    expect(usePageStore.getState().byWindow["win-1"]).toBeUndefined();
  });

  it("keeps the window correctly registered after a rerender passes a brand-new (but equal) items array", () => {
    // The effect's dependency array compares `items` by reference, so a fresh
    // array on rerender re-runs cleanup (clearPages) then the effect
    // (registerPages) — registerPages's own idempotency guard only helps when
    // called directly without an intervening clear. What must hold end-to-end
    // is that the window ends up correctly registered again, not left cleared.
    const { rerender } = renderHook(
      ({ items }: { items: AppPage[] }) => useRegisterPages("win-1", items),
      { initialProps: { items: [{ id: "a", label: "A" }] } },
    );
    rerender({ items: [{ id: "a", label: "A" }] });
    expect(usePageStore.getState().byWindow["win-1"]).toEqual({
      items: [{ id: "a", label: "A" }],
      activeId: "a",
    });
  });
});
