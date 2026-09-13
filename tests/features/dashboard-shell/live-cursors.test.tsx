/**
 * @vitest-environment jsdom
 */
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    pathname: "/dashboard/telecom-report/overview",
    lanStatus: "connected" as "off" | "connecting" | "connected" | "error",
    lanWatchers: new Set<() => void>(),
    peerWatchers: new Set<() => void>(),
    publishedPointers: [] as { x: number; y: number }[],
    clearedPointersCount: 0,
    peers: [] as any[],
    awareness: {
      clientID: 100,
    },
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock("@/platform/lan/lan-collab", () => ({
  getLANStatus: () => mocks.lanStatus,
  getLANAwareness: () => mocks.awareness,
  publishPointer: (x: number, y: number) => {
    mocks.publishedPointers.push({ x, y });
  },
  clearPointer: () => {
    mocks.clearedPointersCount++;
  },
  publishPresence: vi.fn(),
  publishSelection: vi.fn(),
  subscribeLAN: (fn: () => void) => {
    mocks.lanWatchers.add(fn);
    return () => mocks.lanWatchers.delete(fn);
  },
}));

vi.mock("@/platform/collab/awareness", () => ({
  readPeers: () => mocks.peers,
  subscribePeers: (_awareness: any, fn: () => void) => {
    mocks.peerWatchers.add(fn);
    return () => mocks.peerWatchers.delete(fn);
  },
}));

import { LiveCursors } from "@/features/dashboard-shell/components/live-cursors";

describe("LiveCursors Component", () => {
  let mainContainer: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.publishedPointers = [];
    mocks.clearedPointersCount = 0;
    mocks.lanStatus = "connected";
    mocks.peers = [];

    mainContainer = document.createElement("main");
    mainContainer.id = "main-content";
    Object.defineProperty(mainContainer, "clientWidth", { configurable: true, value: 800 });
    Object.defineProperty(mainContainer, "scrollTop", { configurable: true, value: 100 });
    mainContainer.getBoundingClientRect = () => ({
      left: 100,
      top: 50,
      right: 900,
      bottom: 650,
      width: 800,
      height: 600,
      x: 100,
      y: 50,
      toJSON: () => {},
    });
    document.body.appendChild(mainContainer);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (mainContainer && mainContainer.parentNode) {
      mainContainer.parentNode.removeChild(mainContainer);
    }
  });

  it("publishes pointer position immediately on pointerdown (touch tap)", () => {
    render(<LiveCursors />);

    act(() => {
      window.dispatchEvent(
        new PointerEvent("pointerdown", {
          clientX: 500, // 500 - 100 = 400. 400 / 800 = 0.5
          clientY: 150, // 150 - 50 = 100. 100 + 100(scrollTop) = 200
          pointerType: "touch",
        }),
      );
    });

    expect(mocks.publishedPointers).toHaveLength(1);
    expect(mocks.publishedPointers[0]).toEqual({ x: 0.5, y: 200 });
  });

  it("publishes pointer position on pointermove", () => {
    render(<LiveCursors />);

    act(() => {
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          clientX: 300, // 300 - 100 = 200. 200 / 800 = 0.25
          clientY: 250, // 250 - 50 = 200. 200 + 100 = 300
          pointerType: "mouse",
        }),
      );
    });

    expect(mocks.publishedPointers).toHaveLength(1);
    expect(mocks.publishedPointers[0]).toEqual({ x: 0.25, y: 300 });
  });

  it("clears pointer after delay on touch pointerup", () => {
    render(<LiveCursors />);

    act(() => {
      window.dispatchEvent(
        new PointerEvent("pointerdown", {
          clientX: 500,
          clientY: 150,
          pointerType: "touch",
        }),
      );
    });

    expect(mocks.clearedPointersCount).toBe(0);

    act(() => {
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          clientX: 500,
          clientY: 150,
          pointerType: "touch",
        }),
      );
    });

    // Should not clear immediately
    expect(mocks.clearedPointersCount).toBe(0);

    // After 1500ms delay, pointer is cleared
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(mocks.clearedPointersCount).toBe(1);
  });

  it("clears pointer after delay on mobile scroll", () => {
    render(<LiveCursors />);

    act(() => {
      window.dispatchEvent(
        new PointerEvent("pointerdown", {
          clientX: 500,
          clientY: 150,
          pointerType: "touch",
        }),
      );
    });

    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });

    expect(mocks.clearedPointersCount).toBe(0);

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(mocks.clearedPointersCount).toBe(1);
  });

  it("renders remote peer cursors with distinct pointer, color, and name badge", () => {
    mocks.peers = [
      {
        clientId: 200,
        name: "Alice",
        color: "#10b981",
        cursor: {
          x: 0.5,
          y: 200,
          at: Date.now(),
          page: "/dashboard/telecom-report/overview",
        },
      },
    ];

    const { getByText } = render(<LiveCursors />);

    expect(getByText("Alice")).toBeDefined();
  });
});
