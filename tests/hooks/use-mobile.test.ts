import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "@/hooks/use-mobile";

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * The setup.ts installs matchMedia via Object.defineProperty with writable:true.
 * Direct assignment works fine.
 */
function setMatchMedia(innerWidth: number, matches: boolean) {
  // Capture the onChange listener so tests can fire it imperatively
  let capturedOnChange: (() => void) | null = null;
  const removeEventListenerSpy = vi.fn();
  const addEventListenerSpy = vi.fn().mockImplementation(
    (_event: string, cb: () => void) => {
      capturedOnChange = cb;
    },
  );

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches,
      media: "",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: addEventListenerSpy,
      removeEventListener: removeEventListenerSpy,
      dispatchEvent: vi.fn(),
    }),
  });

  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: innerWidth,
  });

  return {
    fireChange: (newWidth: number) => {
      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: newWidth,
      });
      capturedOnChange?.();
    },
    removeEventListenerSpy,
    addEventListenerSpy,
  };
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe("useIsMobile", () => {
  afterEach(() => {
    // Restore matchMedia to the setup.ts default mock after each test
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1024,
    });
  });

  // ── initial state: desktop (non-mobile) ──────────────────────────────────

  it("returns false when innerWidth is >= 768 (desktop)", () => {
    setMatchMedia(1024, false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  // ── initial state: mobile ─────────────────────────────────────────────────

  it("returns true when innerWidth is < 768 (mobile)", () => {
    setMatchMedia(375, true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  // ── exact boundary: width == 768 is NOT mobile ───────────────────────────

  it("returns false when innerWidth is exactly 768 (not mobile)", () => {
    setMatchMedia(768, false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  // ── exact boundary: width == 767 IS mobile ────────────────────────────────

  it("returns true when innerWidth is exactly 767 (mobile boundary)", () => {
    setMatchMedia(767, true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  // ── onChange fires → switches to mobile ──────────────────────────────────

  it("updates to true when the media query change event fires and width drops below 768", () => {
    const { fireChange } = setMatchMedia(1024, false);
    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);

    act(() => {
      fireChange(375);
    });

    expect(result.current).toBe(true);
  });

  // ── onChange fires → switches to desktop ─────────────────────────────────

  it("updates to false when the media query change event fires and width rises above 768", () => {
    const { fireChange } = setMatchMedia(375, true);
    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);

    act(() => {
      fireChange(1280);
    });

    expect(result.current).toBe(false);
  });

  // ── cleanup: removeEventListener is called on unmount ────────────────────

  it("removes the media query event listener when the component unmounts", () => {
    const { removeEventListenerSpy } = setMatchMedia(1024, false);
    const { unmount } = renderHook(() => useIsMobile());

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
  });

  // ── matchMedia is called with the correct query string ───────────────────

  it("calls matchMedia with the (max-width: 767px) query", () => {
    const matchMediaSpy = vi.fn().mockReturnValue({
      matches: false,
      media: "",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: matchMediaSpy,
    });
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1024,
    });

    renderHook(() => useIsMobile());

    expect(matchMediaSpy).toHaveBeenCalledWith("(max-width: 767px)");
  });

  // ── return value is always a strict boolean (never undefined) ─────────────

  it("always returns a strict boolean, not undefined", () => {
    setMatchMedia(1024, false);
    const { result } = renderHook(() => useIsMobile());
    expect(typeof result.current).toBe("boolean");
  });
});
