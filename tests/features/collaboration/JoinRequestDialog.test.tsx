import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JoinRequestDialog } from "@/features/collaboration/components/JoinRequestDialog";

let mockLANStatus = "off";
const mockSubscribers = new Set<() => void>();

vi.mock("@/platform/lan/lan-collab", () => ({
  getLANStatus: () => mockLANStatus,
  subscribeLAN: (fn: () => void) => {
    mockSubscribers.add(fn);
    return () => {
      mockSubscribers.delete(fn);
    };
  },
  getActiveLANSettings: () => ({
    peer: { role: "host" },
  }),
  readLANSettings: () => ({
    peer: { role: "host" },
  }),
}));

describe("JoinRequestDialog polling behavior", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockLANStatus = "off";
    mockSubscribers.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does NOT poll /api/guest/pending when LAN status is off", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ guests: [] }),
    });
    globalThis.fetch = fetchSpy;

    render(<JoinRequestDialog />);

    // Advance timer by 10 seconds
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("polls /api/guest/pending when LAN status transitions to connected", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        guests: [
          {
            id: "guest-1",
            name: "Alice",
            role: "editor",
            requestedAt: Date.now(),
          },
        ],
      }),
    });
    globalThis.fetch = fetchSpy;

    render(<JoinRequestDialog />);

    // Initially off -> no fetch
    expect(fetchSpy).not.toHaveBeenCalled();

    // LAN connects!
    await act(async () => {
      mockLANStatus = "connected";
      for (const sub of mockSubscribers) sub();
    });

    // Should immediately tick once
    expect(fetchSpy).toHaveBeenCalledWith("/api/guest/pending", { cache: "no-store" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Advance 3 seconds -> second poll
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Disconnect -> timer should stop
    await act(async () => {
      mockLANStatus = "off";
      for (const sub of mockSubscribers) sub();
    });

    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    // Count should still be 2
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
