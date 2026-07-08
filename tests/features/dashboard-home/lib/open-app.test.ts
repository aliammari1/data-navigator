import { describe, it, expect, vi, beforeEach } from "vitest";
import { dispatchOpenApp, handleLauncherClick } from "@/features/dashboard-home/lib/open-app";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal synthetic React.MouseEvent-shaped object for use with
 * handleLauncherClick. All modifier flags default to false / 0.
 */
function makeMouseEvent(
  overrides: Partial<{
    defaultPrevented: boolean;
    button: number;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
  }> = {},
): React.MouseEvent<HTMLAnchorElement> {
  const preventDefault = vi.fn();
  return {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault,
    ...overrides,
  } as unknown as React.MouseEvent<HTMLAnchorElement>;
}

// ─── dispatchOpenApp ──────────────────────────────────────────────────────────

describe("dispatchOpenApp", () => {
  beforeEach(() => {
    // Ensure window is available and clean event listeners between tests.
    vi.restoreAllMocks();
  });

  it("returns false when window is undefined", () => {
    // Temporarily hide the window global to simulate SSR / no-DOM.
    const saved = globalThis.window;
    // @ts-expect-error intentionally deleting window for branch test
    delete globalThis.window;

    const result = dispatchOpenApp("moudir", "/moudir");

    expect(result).toBe(false);

    // Restore window.
    globalThis.window = saved;
  });

  it("dispatches a 'desktop:open-app' CustomEvent on window", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    dispatchOpenApp("telecom", "/telecom");

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const evt = dispatchSpy.mock.calls[0][0] as CustomEvent;
    expect(evt.type).toBe("desktop:open-app");
  });

  it("includes the appId and route in the event detail", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    dispatchOpenApp("upload", "/upload");

    const evt = dispatchSpy.mock.calls[0][0] as CustomEvent<{ appId: string; route: string }>;
    expect(evt.detail.appId).toBe("upload");
    expect(evt.detail.route).toBe("/upload");
  });

  it("returns false when no listener calls preventDefault (event not claimed)", () => {
    // Default window.dispatchEvent does NOT call preventDefault on the event.
    const result = dispatchOpenApp("forecast", "/forecast");
    expect(result).toBe(false);
  });

  it("returns true when a listener calls preventDefault (event claimed)", () => {
    // Add a one-off listener that claims the event.
    const handler = (e: Event) => e.preventDefault();
    window.addEventListener("desktop:open-app", handler);

    const result = dispatchOpenApp("ai-analysis", "/ai-analysis");

    window.removeEventListener("desktop:open-app", handler);
    expect(result).toBe(true);
  });

  it("passes the event with cancelable: true so preventDefault is effective", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    dispatchOpenApp("monitor", "/monitor");

    const evt = dispatchSpy.mock.calls[0][0] as CustomEvent;
    expect(evt.cancelable).toBe(true);
  });

  it("works for every valid DesktopAppId without throwing", () => {
    const appIds = [
      "moudir",
      "telecom",
      "upload",
      "forecast",
      "ai-analysis",
      "report-studio",
      "monitor",
      "ai-briefing",
      "folders",
      "commander",
    ] as const;

    for (const appId of appIds) {
      expect(() => dispatchOpenApp(appId, `/${appId}`)).not.toThrow();
    }
  });
});

// ─── handleLauncherClick ──────────────────────────────────────────────────────

describe("handleLauncherClick", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a function", () => {
    const handler = handleLauncherClick("moudir", "/moudir");
    expect(typeof handler).toBe("function");
  });

  // ── Early-return conditions ──────────────────────────────────────────────────

  it("does nothing when event.defaultPrevented is true", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const handler = handleLauncherClick("moudir", "/moudir");
    const evt = makeMouseEvent({ defaultPrevented: true });

    handler(evt);

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect((evt as unknown as { preventDefault: ReturnType<typeof vi.fn> }).preventDefault).not.toHaveBeenCalled();
  });

  it("does nothing when event.button is not 0 (e.g. right-click)", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const handler = handleLauncherClick("moudir", "/moudir");
    const evt = makeMouseEvent({ button: 2 });

    handler(evt);

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it("does nothing when event.button is 1 (middle-click)", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const handler = handleLauncherClick("moudir", "/moudir");
    const evt = makeMouseEvent({ button: 1 });

    handler(evt);

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it("does nothing when metaKey is true (⌘-click → new tab on Mac)", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const handler = handleLauncherClick("telecom", "/telecom");
    const evt = makeMouseEvent({ metaKey: true });

    handler(evt);

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it("does nothing when ctrlKey is true (ctrl-click → new tab on Windows/Linux)", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const handler = handleLauncherClick("upload", "/upload");
    const evt = makeMouseEvent({ ctrlKey: true });

    handler(evt);

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it("does nothing when shiftKey is true (shift-click → new window)", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const handler = handleLauncherClick("forecast", "/forecast");
    const evt = makeMouseEvent({ shiftKey: true });

    handler(evt);

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it("does nothing when altKey is true (alt-click → download intent)", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const handler = handleLauncherClick("ai-analysis", "/ai-analysis");
    const evt = makeMouseEvent({ altKey: true });

    handler(evt);

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  // ── Plain left-click: event not claimed ─────────────────────────────────────

  it("dispatches the desktop event on a plain left-click", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const handler = handleLauncherClick("monitor", "/monitor");
    const evt = makeMouseEvent();

    handler(evt);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const dispatchedEvt = dispatchSpy.mock.calls[0][0] as CustomEvent<{ appId: string; route: string }>;
    expect(dispatchedEvt.type).toBe("desktop:open-app");
    expect(dispatchedEvt.detail.appId).toBe("monitor");
    expect(dispatchedEvt.detail.route).toBe("/monitor");
  });

  it("does NOT call event.preventDefault when no desktop handler claims it", () => {
    const handler = handleLauncherClick("ai-briefing", "/ai-briefing");
    const evt = makeMouseEvent();

    handler(evt);

    const preventDefaultMock = (evt as unknown as { preventDefault: ReturnType<typeof vi.fn> }).preventDefault;
    expect(preventDefaultMock).not.toHaveBeenCalled();
  });

  // ── Plain left-click: event claimed by desktop listener ─────────────────────

  it("calls event.preventDefault when a desktop listener claims the event", () => {
    // Register a listener that prevents the default to signal desktop handling.
    const desktopHandler = (e: Event) => e.preventDefault();
    window.addEventListener("desktop:open-app", desktopHandler);

    const handler = handleLauncherClick("folders", "/folders");
    const evt = makeMouseEvent();

    handler(evt);

    window.removeEventListener("desktop:open-app", desktopHandler);

    const preventDefaultMock = (evt as unknown as { preventDefault: ReturnType<typeof vi.fn> }).preventDefault;
    expect(preventDefaultMock).toHaveBeenCalledTimes(1);
  });

  it("forwards the correct appId and route when the event IS claimed", () => {
    const received: { appId: string; route: string }[] = [];
    const desktopHandler = (e: Event) => {
      e.preventDefault();
      received.push((e as CustomEvent<{ appId: string; route: string }>).detail);
    };
    window.addEventListener("desktop:open-app", desktopHandler);

    const handler = handleLauncherClick("commander", "/commander");
    handler(makeMouseEvent());

    window.removeEventListener("desktop:open-app", desktopHandler);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ appId: "commander", route: "/commander" });
  });

  // ── Multiple modifier combinations do not bypass the early return ────────────

  it("does nothing when both metaKey and ctrlKey are true", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const handler = handleLauncherClick("report-studio", "/report-studio");
    const evt = makeMouseEvent({ metaKey: true, ctrlKey: true });

    handler(evt);

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  // ── Separate handler instances are independent ───────────────────────────────

  it("each call to handleLauncherClick returns an independent handler", () => {
    const handler1 = handleLauncherClick("moudir", "/moudir");
    const handler2 = handleLauncherClick("telecom", "/telecom");

    expect(handler1).not.toBe(handler2);
  });

  it("handler captures the appId and route it was created with", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const handler = handleLauncherClick("report-studio", "/report-studio");

    handler(makeMouseEvent());

    const evt = dispatchSpy.mock.calls[0][0] as CustomEvent<{ appId: string; route: string }>;
    expect(evt.detail.appId).toBe("report-studio");
    expect(evt.detail.route).toBe("/report-studio");
  });
});
