import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  useWindowContext,
  useWindowId,
  WindowProvider,
} from "@/features/desktop/core/menu/window-context";

/**
 * Behavioral tests for the WindowProvider context that lets a hosted feature
 * screen learn which desktop window it is rendered in.
 */

function wrapper(windowId: string, appId: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <WindowProvider windowId={windowId} appId={appId}>
        {children}
      </WindowProvider>
    );
  };
}

describe("useWindowContext — outside a provider", () => {
  it("returns null when rendered with no ancestor WindowProvider", () => {
    const { result } = renderHook(() => useWindowContext());
    expect(result.current).toBeNull();
  });
});

describe("useWindowId — outside a provider", () => {
  it("returns null when rendered with no ancestor WindowProvider", () => {
    const { result } = renderHook(() => useWindowId());
    expect(result.current).toBeNull();
  });
});

describe("useWindowContext — inside a provider", () => {
  it("returns the { windowId, appId } pair supplied to WindowProvider", () => {
    const { result } = renderHook(() => useWindowContext(), {
      wrapper: wrapper("win-1", "telecom"),
    });
    expect(result.current).toEqual({ windowId: "win-1", appId: "telecom" });
  });

  it("reflects a different windowId/appId pair for a second provider instance", () => {
    const { result } = renderHook(() => useWindowContext(), {
      wrapper: wrapper("win-42", "geo"),
    });
    expect(result.current).toEqual({ windowId: "win-42", appId: "geo" });
  });
});

describe("useWindowId — inside a provider", () => {
  it("returns only the windowId from the provided context", () => {
    const { result } = renderHook(() => useWindowId(), {
      wrapper: wrapper("win-7", "forecast"),
    });
    expect(result.current).toBe("win-7");
  });
});

describe("WindowProvider — value stability", () => {
  it("keeps the same context object reference across re-renders when props are unchanged", () => {
    const { result, rerender } = renderHook(() => useWindowContext(), {
      wrapper: wrapper("win-1", "telecom"),
    });
    const first = result.current;
    rerender();
    // useMemo keyed on [windowId, appId] — unchanged inputs must yield the same object.
    expect(result.current).toBe(first);
  });

  it("nested providers give the innermost windowId/appId to a consumer", () => {
    function Nested({ children }: { children: ReactNode }) {
      return (
        <WindowProvider windowId="outer" appId="outer-app">
          <WindowProvider windowId="inner" appId="inner-app">
            {children}
          </WindowProvider>
        </WindowProvider>
      );
    }
    const { result } = renderHook(() => useWindowContext(), { wrapper: Nested });
    expect(result.current).toEqual({ windowId: "inner", appId: "inner-app" });
  });
});
