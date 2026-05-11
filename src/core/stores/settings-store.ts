import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AccentColor =
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
  csvDelimiter: "," | ";" | "\t" | "|";
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
  csvDelimiter: ",",
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
      accentColor: "indigo",
      density: "comfortable",
      sidebarStyle: "dark",
      animationsEnabled: true,
      sidebarPinned: true,
      showBreadcrumbs: true,
      compactNumbers: true,
      data: DEFAULT_DATA,
      performance: DEFAULT_PERFORMANCE,
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
          accentColor: "indigo",
          density: "comfortable",
          sidebarStyle: "dark",
          animationsEnabled: true,
          sidebarPinned: true,
          showBreadcrumbs: true,
          compactNumbers: true,
          data: DEFAULT_DATA,
          performance: DEFAULT_PERFORMANCE,
          notifications: DEFAULT_NOTIFICATIONS,
          pinnedItems: [
            "/dashboard",
            "/dashboard/upload",
            "/dashboard/ai-analysis",
          ],
        }),
    }),
    { name: "data-navigator-settings" },
  ),
);
