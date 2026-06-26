import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { openDesktopApp, askMoudirAbout } from "@/features/folders/lib/openApp";

// The jsdom environment provides window, so we can spy on dispatchEvent directly.

describe("openDesktopApp", () => {
  beforeEach(() => {
    vi.spyOn(window, "dispatchEvent");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false when no listener calls preventDefault", () => {
    const result = openDesktopApp("data-browser");
    expect(result).toBe(false);
  });

  it("dispatches a desktop:open-app CustomEvent with the correct appId", () => {
    openDesktopApp("telecom");
    expect(window.dispatchEvent).toHaveBeenCalledOnce();
    const event = (window.dispatchEvent as ReturnType<typeof vi.spyOn>).mock
      .calls[0][0] as CustomEvent;
    expect(event.type).toBe("desktop:open-app");
    expect(event.detail.appId).toBe("telecom");
  });

  it("includes the correct route for each app", () => {
    const cases: Array<[Parameters<typeof openDesktopApp>[0], string]> = [
      ["data-browser", "/dashboard/data-browser"],
      ["telecom", "/dashboard/telecom-report/overview"],
      ["parsed", "/dashboard/parsed"],
      ["transform", "/dashboard/transform"],
      ["moudir", "/dashboard/data-formulator"],
    ];

    for (const [appId, expectedRoute] of cases) {
      vi.restoreAllMocks();
      vi.spyOn(window, "dispatchEvent");
      openDesktopApp(appId);
      const event = (window.dispatchEvent as ReturnType<typeof vi.spyOn>).mock
        .calls[0][0] as CustomEvent;
      expect(event.detail.route).toBe(expectedRoute);
    }
  });

  it("returns true when a listener calls preventDefault on the event", () => {
    // Add a listener that calls preventDefault to simulate desktop claiming the event.
    const handler = (e: Event) => e.preventDefault();
    window.addEventListener("desktop:open-app", handler);
    try {
      const result = openDesktopApp("data-browser");
      expect(result).toBe(true);
    } finally {
      window.removeEventListener("desktop:open-app", handler);
    }
  });

  it("dispatches a cancelable event", () => {
    openDesktopApp("parsed");
    const event = (window.dispatchEvent as ReturnType<typeof vi.spyOn>).mock
      .calls[0][0] as CustomEvent;
    expect(event.cancelable).toBe(true);
  });

  it("returns false when window is undefined", () => {
    // Temporarily remove window from the global scope to simulate SSR.
    const originalWindow = globalThis.window;
    // @ts-expect-error intentionally deleting window to simulate server environment
    delete globalThis.window;
    try {
      const result = openDesktopApp("data-browser");
      expect(result).toBe(false);
    } finally {
      globalThis.window = originalWindow;
    }
  });
});

describe("askMoudirAbout", () => {
  beforeEach(() => {
    vi.spyOn(window, "dispatchEvent");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches desktop:open-app for moudir then moudir:ask", () => {
    askMoudirAbout("Transactions");

    const calls = (window.dispatchEvent as ReturnType<typeof vi.spyOn>).mock.calls;
    expect(calls).toHaveLength(2);

    const firstEvent = calls[0][0] as CustomEvent;
    expect(firstEvent.type).toBe("desktop:open-app");
    expect(firstEvent.detail.appId).toBe("moudir");

    const secondEvent = calls[1][0] as CustomEvent;
    expect(secondEvent.type).toBe("moudir:ask");
  });

  it("includes the dataset name in the moudir:ask prompt", () => {
    askMoudirAbout("DailyTransactions");

    const calls = (window.dispatchEvent as ReturnType<typeof vi.spyOn>).mock.calls;
    const askEvent = calls[1][0] as CustomEvent;
    expect(askEvent.detail.prompt).toContain("DailyTransactions");
  });

  it("embeds the full French analysis prompt for the dataset", () => {
    const datasetName = "MyDataset";
    askMoudirAbout(datasetName);

    const calls = (window.dispatchEvent as ReturnType<typeof vi.spyOn>).mock.calls;
    const askEvent = calls[1][0] as CustomEvent;
    expect(askEvent.detail.prompt).toBe(
      `Analyse le jeu de données « ${datasetName} » : résume sa structure, sa qualité et les points notables.`,
    );
  });

  it("returns undefined (void) even for a happy path call", () => {
    const result = askMoudirAbout("Test");
    expect(result).toBeUndefined();
  });

  it("returns early without dispatching when window is undefined", () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error intentionally deleting window to simulate server environment
    delete globalThis.window;
    try {
      // Should not throw; dispatches nothing.
      askMoudirAbout("SomeDataset");
      // dispatchEvent spy is on the old window object, so we just check no throw.
    } finally {
      globalThis.window = originalWindow;
    }
    // After restoring window, the spy was on the now-restored window.
    // Since the deletion happened before the call, no events were dispatched.
    expect(
      (window.dispatchEvent as ReturnType<typeof vi.spyOn>).mock.calls,
    ).toHaveLength(0);
  });
});
