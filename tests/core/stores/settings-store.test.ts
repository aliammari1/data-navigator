import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AccentColor,
  type DensityMode,
  type SidebarStyle,
  useAppearanceSettings,
  useDataSettings,
  useEnableAiCritic,
  useNotificationSettings,
  usePerformanceSettings,
  usePinnedItems,
  useSettingsActions,
  useSettingsStore,
} from "@/core/stores/settings-store";

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
    expect(result.current.accentColor).toBe("blue");
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
    expect(result.current.accentColor).toBe("blue");
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

  it("should enable and disable AI critic", () => {
    const { result } = renderHook(() => useSettingsStore());

    act(() => {
      result.current.setEnableAiCritic(true);
    });
    expect(result.current.enableAiCritic).toBe(true);

    act(() => {
      result.current.setEnableAiCritic(false);
    });
    expect(result.current.enableAiCritic).toBe(false);
  });

  describe("selector hooks", () => {
    it("useAppearanceSettings returns appearance slice", () => {
      const { result } = renderHook(() => useAppearanceSettings());
      expect(result.current).toMatchObject({
        theme: "dark",
        accentColor: "blue",
        density: "comfortable",
        sidebarStyle: "dark",
        animationsEnabled: true,
        sidebarPinned: true,
        showBreadcrumbs: true,
        compactNumbers: true,
      });
    });

    it("useDataSettings returns data settings", () => {
      const { result } = renderHook(() => useDataSettings());
      expect(result.current.defaultRowLimit).toBe(10000);
      expect(result.current.numberLocale).toBe("en-US");
    });

    it("usePerformanceSettings returns performance settings", () => {
      const { result } = renderHook(() => usePerformanceSettings());
      expect(result.current.duckdbWorkers).toBe(4);
      expect(result.current.maxMemoryMB).toBe(512);
    });

    it("useEnableAiCritic returns AI critic flag", () => {
      const { result } = renderHook(() => useEnableAiCritic());
      expect(result.current).toBe(false);
    });

    it("useNotificationSettings returns notification settings", () => {
      const { result } = renderHook(() => useNotificationSettings());
      expect(result.current.uploads).toBe(true);
      expect(result.current.errors).toBe(true);
    });

    it("usePinnedItems returns pinned items", () => {
      const { result } = renderHook(() => usePinnedItems());
      expect(result.current).toContain("/dashboard");
    });

    it("useSettingsActions returns all action functions", () => {
      const { result } = renderHook(() => useSettingsActions());
      expect(typeof result.current.setTheme).toBe("function");
      expect(typeof result.current.setMaxFileSize).toBe("function");
      expect(typeof result.current.setMaxFiles).toBe("function");
      expect(typeof result.current.setDefaultFolderId).toBe("function");
      expect(typeof result.current.setAccentColor).toBe("function");
      expect(typeof result.current.setDensity).toBe("function");
      expect(typeof result.current.setSidebarStyle).toBe("function");
      expect(typeof result.current.setAnimationsEnabled).toBe("function");
      expect(typeof result.current.setSidebarPinned).toBe("function");
      expect(typeof result.current.setShowBreadcrumbs).toBe("function");
      expect(typeof result.current.setCompactNumbers).toBe("function");
      expect(typeof result.current.setData).toBe("function");
      expect(typeof result.current.setPerformance).toBe("function");
      expect(typeof result.current.setEnableAiCritic).toBe("function");
      expect(typeof result.current.setNotifications).toBe("function");
      expect(typeof result.current.togglePinnedItem).toBe("function");
      expect(typeof result.current.resetToDefaults).toBe("function");
    });
  });

  describe("migrate function", () => {
    // Access the migrate function directly from persist options to test all branches
    // without requiring a full storage hydration round-trip.
    const getMigrate = () => useSettingsStore.persist.getOptions().migrate as
      (persisted: unknown, version: number) => unknown;

    it("migrates null/undefined persisted state using empty object fallback", () => {
      const migrate = getMigrate();
      const result = migrate(null, 3) as Record<string, unknown>;
      // accentColor should be undefined (not indigo/cyan), so it stays undefined
      expect(result.accentColor).toBeUndefined();
      expect(result.enableAiCritic).toBe(false);
    });

    it("migrates indigo accent color to blue", () => {
      const migrate = getMigrate();
      const result = migrate({ accentColor: "indigo" }, 3) as Record<string, unknown>;
      expect(result.accentColor).toBe("blue");
    });

    it("migrates cyan accent color to blue", () => {
      const migrate = getMigrate();
      const result = migrate({ accentColor: "cyan" }, 3) as Record<string, unknown>;
      expect(result.accentColor).toBe("blue");
    });

    it("preserves non-legacy accent colors during migration", () => {
      const migrate = getMigrate();
      const result = migrate({ accentColor: "rose" }, 3) as Record<string, unknown>;
      expect(result.accentColor).toBe("rose");
    });

    it("deep-merges data settings onto defaults when prev.data is present", () => {
      const migrate = getMigrate();
      const result = migrate({ data: { defaultRowLimit: 999 } }, 3) as Record<string, unknown>;
      const data = result.data as Record<string, unknown>;
      expect(data.defaultRowLimit).toBe(999);
      // Default fields backfilled
      expect(data.autoRefreshInterval).toBe(0);
    });

    it("uses empty object for data when prev.data is missing (nullish branch)", () => {
      const migrate = getMigrate();
      const result = migrate({}, 3) as Record<string, unknown>;
      const data = result.data as Record<string, unknown>;
      // All defaults should be present
      expect(data.defaultRowLimit).toBe(10000);
    });

    it("deep-merges performance settings onto defaults when prev.performance is present", () => {
      const migrate = getMigrate();
      const result = migrate({ performance: { duckdbWorkers: 8 } }, 3) as Record<string, unknown>;
      const perf = result.performance as Record<string, unknown>;
      expect(perf.duckdbWorkers).toBe(8);
      expect(perf.maxMemoryMB).toBe(512);
    });

    it("uses empty object for performance when prev.performance is missing (nullish branch)", () => {
      const migrate = getMigrate();
      const result = migrate({}, 3) as Record<string, unknown>;
      const perf = result.performance as Record<string, unknown>;
      expect(perf.duckdbWorkers).toBe(4);
    });

    it("preserves enableAiCritic when it is explicitly true", () => {
      const migrate = getMigrate();
      const result = migrate({ enableAiCritic: true }, 3) as Record<string, unknown>;
      expect(result.enableAiCritic).toBe(true);
    });

    it("defaults enableAiCritic to false when missing from persisted state (nullish branch)", () => {
      const migrate = getMigrate();
      const result = migrate({}, 3) as Record<string, unknown>;
      expect(result.enableAiCritic).toBe(false);
    });

    it("deep-merges notifications onto defaults when prev.notifications is present", () => {
      const migrate = getMigrate();
      const result = migrate({ notifications: { uploads: false } }, 3) as Record<string, unknown>;
      const notifs = result.notifications as Record<string, unknown>;
      expect(notifs.uploads).toBe(false);
      expect(notifs.errors).toBe(true);
    });

    it("uses empty object for notifications when prev.notifications is missing (nullish branch)", () => {
      const migrate = getMigrate();
      const result = migrate({}, 3) as Record<string, unknown>;
      const notifs = result.notifications as Record<string, unknown>;
      expect(notifs.uploads).toBe(true);
    });
  });
});
