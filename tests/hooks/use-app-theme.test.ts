import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Behavioral test suite for useAppTheme — the atomic theme-write hook that
 * fans a single setTheme(value) call out to BOTH the ThemeProvider context
 * (immediate DOM class) and the settings store (Appearance panel + durable
 * persistence). Both boundaries are mocked so the suite is deterministic and
 * dependency-free (no real ThemeProvider tree, no zustand persistence).
 */

// ─── Boundary mocks ──────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  setProviderTheme: vi.fn(),
  setStoreTheme: vi.fn(),
  themeState: {
    theme: "dark" as "light" | "dark" | "system",
    resolvedTheme: "dark" as "light" | "dark",
    systemTheme: "dark" as "light" | "dark",
    themes: ["light", "dark", "system"] as Array<"light" | "dark" | "system">,
  },
}));

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({
    theme: h.themeState.theme,
    resolvedTheme: h.themeState.resolvedTheme,
    systemTheme: h.themeState.systemTheme,
    themes: h.themeState.themes,
    setTheme: h.setProviderTheme,
  }),
}));

vi.mock("@/core/stores/settings-store", () => ({
  useSettingsStore: (selector: (s: { setTheme: typeof h.setStoreTheme }) => unknown) =>
    selector({ setTheme: h.setStoreTheme }),
}));

// Import AFTER the mocks are registered (hoisted by vitest, but explicit here).
import { useAppTheme } from "@/hooks/use-app-theme";

beforeEach(() => {
  h.themeState.theme = "dark";
  h.themeState.resolvedTheme = "dark";
  h.themeState.systemTheme = "dark";
  h.themeState.themes = ["light", "dark", "system"];
  vi.clearAllMocks();
});

// ─── read-through of the underlying ThemeProvider values ─────────────────────

describe("useAppTheme — read-through", () => {
  it("passes theme, resolvedTheme, systemTheme, and themes straight through from useTheme()", () => {
    h.themeState.theme = "system";
    h.themeState.resolvedTheme = "light";
    h.themeState.systemTheme = "light";
    h.themeState.themes = ["light", "dark", "system"];

    const { result } = renderHook(() => useAppTheme());

    expect(result.current.theme).toBe("system");
    expect(result.current.resolvedTheme).toBe("light");
    expect(result.current.systemTheme).toBe("light");
    expect(result.current.themes).toEqual(["light", "dark", "system"]);
  });

  it("exposes a setTheme function", () => {
    const { result } = renderHook(() => useAppTheme());
    expect(typeof result.current.setTheme).toBe("function");
  });
});

// ─── setTheme fans out to both stores ────────────────────────────────────────

describe("useAppTheme — setTheme writes both boundaries", () => {
  it("calls the ThemeProvider setTheme with the new value", () => {
    const { result } = renderHook(() => useAppTheme());

    result.current.setTheme("light");

    expect(h.setProviderTheme).toHaveBeenCalledTimes(1);
    expect(h.setProviderTheme).toHaveBeenCalledWith("light");
  });

  it("also calls the settings-store setTheme with the same value", () => {
    const { result } = renderHook(() => useAppTheme());

    result.current.setTheme("light");

    expect(h.setStoreTheme).toHaveBeenCalledTimes(1);
    expect(h.setStoreTheme).toHaveBeenCalledWith("light");
  });

  it("forwards each of the three theme values identically to both writers", () => {
    const { result } = renderHook(() => useAppTheme());

    for (const value of ["light", "dark", "system"] as const) {
      result.current.setTheme(value);
    }

    expect(h.setProviderTheme.mock.calls.map((c) => c[0])).toEqual(["light", "dark", "system"]);
    expect(h.setStoreTheme.mock.calls.map((c) => c[0])).toEqual(["light", "dark", "system"]);
  });

  it("does not call the settings store before setTheme is invoked", () => {
    renderHook(() => useAppTheme());
    expect(h.setStoreTheme).not.toHaveBeenCalled();
    expect(h.setProviderTheme).not.toHaveBeenCalled();
  });
});

// ─── referential stability (useCallback) ─────────────────────────────────────

describe("useAppTheme — setTheme stability", () => {
  it("returns the same setTheme reference across rerenders when the underlying writers are unchanged", () => {
    const { result, rerender } = renderHook(() => useAppTheme());
    const first = result.current.setTheme;

    rerender();

    expect(result.current.setTheme).toBe(first);
  });
});
