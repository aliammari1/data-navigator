import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { createDrizzleStorage } from "@/platform/storage/drizzle-storage";

export type AccentColor =
  | "blue"
  | "indigo"
  | "violet"
  | "cyan"
  | "emerald"
  | "amber"
  | "rose";
export type DensityMode = "compact" | "comfortable" | "spacious";
export type SidebarStyle = "dark" | "glass" | "minimal";

interface NotificationSettings {
  uploads: boolean;
  queries: boolean;
  errors: boolean;
  collaboration: boolean;
  digest: boolean;
}

interface DataSettings {
  autoRefreshInterval: number; // seconds, 0 = off
  defaultRowLimit: number;
  defaultDateFormat: string;
  numberLocale: string;
  decimalSeparator: "." | ",";
  nullDisplay: string;
  enableQueryHistory: boolean;
}

interface PerformanceSettings {
  duckdbWorkers: number;
  enableWASMStreaming: boolean;
  maxMemoryMB: number;
  cacheQueries: boolean;
  virtualizeThreshold: number; // rows above which to enable virtual scroll
}

export interface SettingsStore {
  // Legacy (preserved)
  maxFileSize: number;
  maxFiles: number;
  defaultFolderId: string | null;
  theme: "light" | "dark" | "system";

  // Appearance
  accentColor: AccentColor;
  density: DensityMode;
  sidebarStyle: SidebarStyle;
  animationsEnabled: boolean;
  sidebarPinned: boolean;
  showBreadcrumbs: boolean;
  compactNumbers: boolean;

  // Data
  data: DataSettings;

  // Performance
  performance: PerformanceSettings;

  // AI
  // Off by default: the deterministic validators (validate.ts) already catch the
  // dangerous cases, and skipping the batched critic LLM pass shaves a serialized
  // model call off every analysis run. Opt in only when stricter review is wanted.
  enableAiCritic: boolean;

  // Notifications
  notifications: NotificationSettings;

  // Pinned nav items
  pinnedItems: string[];

  // Actions
  setMaxFileSize: (size: number) => void;
  setMaxFiles: (count: number) => void;
  setDefaultFolderId: (id: string | null) => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setAccentColor: (color: AccentColor) => void;
  setDensity: (density: DensityMode) => void;
  setSidebarStyle: (style: SidebarStyle) => void;
  setAnimationsEnabled: (v: boolean) => void;
  setSidebarPinned: (v: boolean) => void;
  setShowBreadcrumbs: (v: boolean) => void;
  setCompactNumbers: (v: boolean) => void;
  setData: (patch: Partial<DataSettings>) => void;
  setPerformance: (patch: Partial<PerformanceSettings>) => void;
  setEnableAiCritic: (v: boolean) => void;
  setNotifications: (patch: Partial<NotificationSettings>) => void;
  togglePinnedItem: (href: string) => void;
  resetToDefaults: () => void;
}

const DEFAULT_DATA: DataSettings = {
  autoRefreshInterval: 0,
  defaultRowLimit: 10000,
  defaultDateFormat: "MMM d, yyyy",
  numberLocale: "en-US",
  decimalSeparator: ".",
  nullDisplay: "—",
  enableQueryHistory: true,
};

const DEFAULT_PERFORMANCE: PerformanceSettings = {
  duckdbWorkers: 4,
  enableWASMStreaming: true,
  maxMemoryMB: 512,
  cacheQueries: true,
  virtualizeThreshold: 500,
};

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  uploads: true,
  queries: false,
  errors: true,
  collaboration: true,
  digest: false,
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      maxFileSize: 10 * 1024 * 1024,
      maxFiles: 20,
      defaultFolderId: null,
      theme: "dark",
      accentColor: "blue",
      density: "comfortable",
      sidebarStyle: "dark",
      animationsEnabled: true,
      sidebarPinned: true,
      showBreadcrumbs: true,
      compactNumbers: true,
      data: DEFAULT_DATA,
      performance: DEFAULT_PERFORMANCE,
      enableAiCritic: false,
      notifications: DEFAULT_NOTIFICATIONS,
      pinnedItems: [
        "/dashboard",
        "/dashboard/upload",
        "/dashboard/ai-analysis",
      ],

      setMaxFileSize: (size) => set({ maxFileSize: size }),
      setMaxFiles: (count) => set({ maxFiles: count }),
      setDefaultFolderId: (id) => set({ defaultFolderId: id }),
      setTheme: (theme) => set({ theme }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setDensity: (density) => set({ density }),
      setSidebarStyle: (sidebarStyle) => set({ sidebarStyle }),
      setAnimationsEnabled: (v) => set({ animationsEnabled: v }),
      setSidebarPinned: (v) => set({ sidebarPinned: v }),
      setShowBreadcrumbs: (v) => set({ showBreadcrumbs: v }),
      setCompactNumbers: (v) => set({ compactNumbers: v }),
      setData: (patch) => set((s) => ({ data: { ...s.data, ...patch } })),
      setPerformance: (patch) =>
        set((s) => ({ performance: { ...s.performance, ...patch } })),
      setEnableAiCritic: (v) => set({ enableAiCritic: v }),
      setNotifications: (patch) =>
        set((s) => ({ notifications: { ...s.notifications, ...patch } })),
      togglePinnedItem: (href) => {
        const items = get().pinnedItems;
        set({
          pinnedItems: items.includes(href)
            ? items.filter((h) => h !== href)
            : [...items, href],
        });
      },
      resetToDefaults: () =>
        set({
          theme: "dark",
          accentColor: "blue",
          density: "comfortable",
          sidebarStyle: "dark",
          animationsEnabled: true,
          sidebarPinned: true,
          showBreadcrumbs: true,
          compactNumbers: true,
          data: DEFAULT_DATA,
          performance: DEFAULT_PERFORMANCE,
          enableAiCritic: false,
          notifications: DEFAULT_NOTIFICATIONS,
          pinnedItems: [
            "/dashboard",
            "/dashboard/upload",
            "/dashboard/ai-analysis",
          ],
        }),
    }),
    {
      name: "data-navigator-settings",
      version: 4,
      // Durable in drizzle (app_setting) with a synchronous localStorage
      // working copy — see createDrizzleStorage.
      storage: createJSONStorage(() => createDrizzleStorage({ namespace: "settings" })),
      // Deep-merge persisted nested settings onto defaults so missing keys
      // backfill and unknown/renamed keys are dropped (zustand only shallow
      // merges the top level, leaking stale nested keys without this).
      migrate: (persisted, _version) => {
        const prev = (persisted ?? {}) as Partial<SettingsStore>;
        return {
          ...prev,
          // →v3: brand accent is now Electric Blue. Carry the old defaults
          // (indigo, then cyan) forward to blue so existing installs adopt the new
          // identity instead of keeping a stale default they never deliberately chose.
          accentColor:
            prev.accentColor === "indigo" || prev.accentColor === "cyan"
              ? "blue"
              : prev.accentColor,
          data: { ...DEFAULT_DATA, ...(prev.data ?? {}) },
          performance: { ...DEFAULT_PERFORMANCE, ...(prev.performance ?? {}) },
          // New in this version — off by default for installs that predate it.
          enableAiCritic: prev.enableAiCritic ?? false,
          notifications: {
            ...DEFAULT_NOTIFICATIONS,
            ...(prev.notifications ?? {}),
          },
        } as SettingsStore;
      },
      // Persist only durable state keys; action functions and any future
      // derived/volatile fields are never written.
      partialize: (s) => ({
        maxFileSize: s.maxFileSize,
        maxFiles: s.maxFiles,
        defaultFolderId: s.defaultFolderId,
        theme: s.theme,
        accentColor: s.accentColor,
        density: s.density,
        sidebarStyle: s.sidebarStyle,
        animationsEnabled: s.animationsEnabled,
        sidebarPinned: s.sidebarPinned,
        showBreadcrumbs: s.showBreadcrumbs,
        compactNumbers: s.compactNumbers,
        data: s.data,
        performance: s.performance,
        enableAiCritic: s.enableAiCritic,
        notifications: s.notifications,
        pinnedItems: s.pinnedItems,
      }),
    },
  ),
);

// ─── Selector hooks ─────────────────────────────────────────────────────────
// Narrow slices so consumers stop calling bare useSettingsStore() and only
// re-render on the fields they read.

export const useAppearanceSettings = () =>
  useSettingsStore(
    useShallow((s) => ({
      theme: s.theme,
      accentColor: s.accentColor,
      density: s.density,
      sidebarStyle: s.sidebarStyle,
      animationsEnabled: s.animationsEnabled,
      sidebarPinned: s.sidebarPinned,
      showBreadcrumbs: s.showBreadcrumbs,
      compactNumbers: s.compactNumbers,
    })),
  );

export const useDataSettings = () => useSettingsStore((s) => s.data);
export const usePerformanceSettings = () =>
  useSettingsStore((s) => s.performance);
export const useEnableAiCritic = () =>
  useSettingsStore((s) => s.enableAiCritic);
export const useNotificationSettings = () =>
  useSettingsStore((s) => s.notifications);
export const usePinnedItems = () => useSettingsStore((s) => s.pinnedItems);

export const useSettingsActions = () =>
  useSettingsStore(
    useShallow((s) => ({
      setMaxFileSize: s.setMaxFileSize,
      setMaxFiles: s.setMaxFiles,
      setDefaultFolderId: s.setDefaultFolderId,
      setTheme: s.setTheme,
      setAccentColor: s.setAccentColor,
      setDensity: s.setDensity,
      setSidebarStyle: s.setSidebarStyle,
      setAnimationsEnabled: s.setAnimationsEnabled,
      setSidebarPinned: s.setSidebarPinned,
      setShowBreadcrumbs: s.setShowBreadcrumbs,
      setCompactNumbers: s.setCompactNumbers,
      setData: s.setData,
      setPerformance: s.setPerformance,
      setEnableAiCritic: s.setEnableAiCritic,
      setNotifications: s.setNotifications,
      togglePinnedItem: s.togglePinnedItem,
      resetToDefaults: s.resetToDefaults,
    })),
  );
