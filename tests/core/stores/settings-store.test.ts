import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSettingsStore, type AccentColor, type DensityMode, type SidebarStyle } from "@/core/stores/settings-store";

describe("Settings Store", () => {
  beforeEach(() => {
    // Clear localStorage and mock it
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    });

    const { result } = renderHook(() => useSettingsStore());
    act(() => {
      result.current.resetToDefaults();
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should have correct default values", () => {
    const { result } = renderHook(() => useSettingsStore());

    expect(result.current.theme).toBe("dark");
    expect(result.current.maxFileSize).toBe(10 * 1024 * 1024);
    expect(result.current.maxFiles).toBe(20);
    expect(result.current.accentColor).toBe("indigo");
    expect(result.current.density).toBe("comfortable");
    expect(result.current.sidebarStyle).toBe("dark");
    expect(result.current.animationsEnabled).toBe(true);
    expect(result.current.sidebarPinned).toBe(true);
    expect(result.current.showBreadcrumbs).toBe(true);
    expect(result.current.compactNumbers).toBe(true);
    expect(result.current.pinnedItems).toContain("/dashboard");
    expect(result.current.pinnedItems).toContain("/dashboard/upload");
  });

  it("should update theme", () => {
    const { result } = renderHook(() => useSettingsStore());

    act(() => {
      result.current.setTheme("dark");
    });

    expect(result.current.theme).toBe("dark");
  });

  it("should update accent color", () => {
    const { result } = renderHook(() => useSettingsStore());
    const colors: AccentColor[] = ["indigo", "violet", "cyan", "emerald", "amber", "rose"];

    for (const color of colors) {
      act(() => {
        result.current.setAccentColor(color);
      });
      expect(result.current.accentColor).toBe(color);
    }
  });

  it("should update density", () => {
    const { result } = renderHook(() => useSettingsStore());
    const densities: DensityMode[] = ["compact", "comfortable", "spacious"];

    for (const density of densities) {
      act(() => {
        result.current.setDensity(density);
      });
      expect(result.current.density).toBe(density);
    }
  });

  it("should update sidebar style", () => {
    const { result } = renderHook(() => useSettingsStore());
    const styles: SidebarStyle[] = ["dark", "glass", "minimal"];

    for (const style of styles) {
      act(() => {
        result.current.setSidebarStyle(style);
      });
      expect(result.current.sidebarStyle).toBe(style);
    }
  });

  it("should update max file size", () => {
    const { result } = renderHook(() => useSettingsStore());

    act(() => {
      result.current.setMaxFileSize(100);
    });

    expect(result.current.maxFileSize).toBe(100);
  });

  it("should update max files", () => {
    const { result } = renderHook(() => useSettingsStore());

    act(() => {
      result.current.setMaxFiles(20);
    });

    expect(result.current.maxFiles).toBe(20);
  });

  it("should update default folder id", () => {
    const { result } = renderHook(() => useSettingsStore());

    act(() => {
      result.current.setDefaultFolderId("folder-1");
    });

    expect(result.current.defaultFolderId).toBe("folder-1");

    act(() => {
      result.current.setDefaultFolderId(null);
    });

    expect(result.current.defaultFolderId).toBeNull();
  });

  it("should toggle animations", () => {
    const { result } = renderHook(() => useSettingsStore());

    act(() => {
      result.current.setAnimationsEnabled(false);
    });

    expect(result.current.animationsEnabled).toBe(false);
  });

  it("should toggle sidebar pinned", () => {
    const { result } = renderHook(() => useSettingsStore());

    act(() => {
      result.current.setSidebarPinned(false);
    });

    expect(result.current.sidebarPinned).toBe(false);
  });

  it("should toggle breadcrumbs", () => {
    const { result } = renderHook(() => useSettingsStore());

    act(() => {
      result.current.setShowBreadcrumbs(false);
    });

    expect(result.current.showBreadcrumbs).toBe(false);
  });

  it("should toggle compact numbers", () => {
    const { result } = renderHook(() => useSettingsStore());

    act(() => {
      result.current.setCompactNumbers(true);
    });

    expect(result.current.compactNumbers).toBe(true);
  });

  it("should update data settings", () => {
    const { result } = renderHook(() => useSettingsStore());

    act(() => {
      result.current.setData({ defaultRowLimit: 5000 });
    });

    expect(result.current.data.defaultRowLimit).toBe(5000);
    expect(result.current.data.autoRefreshInterval).toBe(0); // unchanged
  });

  it("should update performance settings", () => {
    const { result } = renderHook(() => useSettingsStore());

    act(() => {
      result.current.setPerformance({ duckdbWorkers: 4 });
    });

    expect(result.current.performance.duckdbWorkers).toBe(4);
  });

  it("should update notification settings", () => {
    const { result } = renderHook(() => useSettingsStore());

    act(() => {
      result.current.setNotifications({ uploads: false });
    });

    expect(result.current.notifications.uploads).toBe(false);
    expect(result.current.notifications.errors).toBe(true); // unchanged
  });

  it("should toggle pinned items", () => {
    const { result } = renderHook(() => useSettingsStore());

    // "/dashboard" is already in pinnedItems by default
    expect(result.current.pinnedItems).toContain("/dashboard");

    act(() => {
      result.current.togglePinnedItem("/dashboard");
    });

    expect(result.current.pinnedItems).not.toContain("/dashboard");

    act(() => {
      result.current.togglePinnedItem("/dashboard");
    });

    expect(result.current.pinnedItems).toContain("/dashboard");
  });

  it("should reset to defaults", () => {
    const { result } = renderHook(() => useSettingsStore());

    act(() => {
      result.current.setTheme("light");
      result.current.setAccentColor("rose");
      result.current.setDensity("compact");
      result.current.setSidebarStyle("minimal");
      result.current.setAnimationsEnabled(false);
    });

    act(() => {
      result.current.resetToDefaults();
    });

    expect(result.current.theme).toBe("dark");
    expect(result.current.accentColor).toBe("indigo");
    expect(result.current.density).toBe("comfortable");
    expect(result.current.sidebarStyle).toBe("dark");
    expect(result.current.animationsEnabled).toBe(true);
    expect(result.current.sidebarPinned).toBe(true);
    expect(result.current.showBreadcrumbs).toBe(true);
    expect(result.current.compactNumbers).toBe(true);
    expect(result.current.pinnedItems).toContain("/dashboard");
    expect(result.current.pinnedItems).toContain("/dashboard/upload");
    expect(result.current.pinnedItems).toContain("/dashboard/ai-analysis");
  });
});
