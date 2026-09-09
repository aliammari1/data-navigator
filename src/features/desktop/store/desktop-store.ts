"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { getApp } from "@/features/desktop/core/app-registry";
import {
  type CanvasBox,
  clampRectToCanvas,
  defaultRectForCanvas,
  getDesktopCanvas,
  maximizedRect,
} from "@/features/desktop/core/layout";
import type { DesktopWindow, OpenAppOptions, WindowRect } from "@/features/desktop/core/types";
import { createDrizzleStorage } from "@/platform/storage";

/**
 * Durable desktop workspace state.
 *
 * Open windows, their geometry, stacking order and the chosen wallpaper survive
 * reloads through the same write-through SQLite+localStorage adapter the shell
 * uses, so the workspace feels like a real desktop OS session.
 */

export const WALLPAPERS = [
  { id: "dawn", label: "Aube", css: "var(--wp-dawn)" },
  { id: "paper", label: "Papier", css: "var(--wp-paper)" },
  { id: "dusk", label: "Crépuscule", css: "var(--wp-dusk)" },
  { id: "ink", label: "Encre", css: "var(--wp-ink)" },
] as const;

export type WallpaperId = (typeof WALLPAPERS)[number]["id"];

// Glass palette ids are kept (sand/peach/amber) for compatibility with the
// [data-glass] CSS, but all three are now cyan-family (see globals.css).
export const GLASS_PALETTES = [
  { id: "sand", label: "Cyan", swatch: "linear-gradient(135deg,#ebf7fb,#5cbfd6)" },
  { id: "peach", label: "Sarcelle", swatch: "linear-gradient(135deg,#e4f6f5,#2dd4bf)" },
  { id: "amber", label: "Azur", swatch: "linear-gradient(135deg,#e4f0fb,#3b9fe0)" },
] as const;

export type GlassPaletteId = (typeof GLASS_PALETTES)[number]["id"];

/** A pinned snapshot tile living on the desktop canvas (durable). */
export interface DesktopSnapshot {
  id: string;
  title: string;
  kind: "chart" | "table" | "answer" | "image";
  /** App that produced the snapshot (used for the badge / re-open). */
  appId: string;
  /** Rendered HTML payload (chart/table markup). */
  html?: string;
  /** Plain-text payload (answers). */
  text?: string;
  /** Image data URL / object URL payload. */
  image?: string;
  createdAt: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A live desktop widget (KPI tile, sparkline, clock, channel breakdown). */
export interface DesktopWidget {
  id: string;
  type:
    | "kpi"
    | "sparkline"
    | "clock"
    | "channels"
    | "amount"
    | "customers"
    | "status-donut"
    | "hourly-bar"
    | "mini-report"
    | "pinned-chart"
    | "revenue-group"
    | "success-rate"
    | "daily-trend";
  config: Record<string, unknown>;
  x: number;
  y: number;
}

/** A saved workspace: a snapshot of the open windows + look at a point in time. */
export interface DesktopWorkspace {
  id: string;
  name: string;
  windows: DesktopWindow[];
  wallpaper: string;
  glassPalette: string;
  createdAt: number;
}

/** A soft-deleted item living in the Recycle Bin until restored or purged. */
export interface RecycleItem {
  id: string;
  kind: "folder" | "dataset" | "shortcut";
  name: string;
  deletedAt: number;
  /** Enough data to restore the item (kind-specific). */
  payload: Record<string, unknown>;
}

interface DesktopState {
  windows: DesktopWindow[];
  zCounter: number;
  launcherOpen: boolean;
  /** Centered spotlight (Start search) open state. */
  spotlightOpen: boolean;
  wallpaper: WallpaperId;
  /** macOS glass chrome palette (dock / Launchpad / menu bar). */
  glassPalette: GlassPaletteId;
  /** Spawn cascade offset so new windows don't perfectly overlap. */
  spawnSeed: number;
  /** Free-positioned desktop icon coordinates, keyed by icon id. */
  iconPositions: Record<string, { x: number; y: number }>;
  /** Soft-deleted items (folders/datasets) awaiting restore or purge. */
  recycleBin: RecycleItem[];

  /** Pinned snapshot tiles on the desktop canvas (durable). */
  snapshots: DesktopSnapshot[];
  /** Live desktop widgets (durable). */
  widgets: DesktopWidget[];
  /** Saved workspaces (durable). */
  workspaces: DesktopWorkspace[];
  /** Window ids forced always-on-top (durable). */
  pinnedOnTop: string[];
  /** Per-app dock progress: 0..1, or -1 for indeterminate. Ephemeral. */
  dockProgress: Record<string, number>;
  /** Global date filter for widgets — ISO date string "YYYY-MM-DD" or null for full dataset. */
  widgetDate: string | null;
  setWidgetDate: (date: string | null) => void;
  updateWidgetConfig: (id: string, config: Record<string, unknown>) => void;

  openApp: (appId: string, opts?: OpenAppOptions) => string | undefined;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  toggleMaximize: (id: string, parent?: { w: number; h: number }) => void;
  setRect: (id: string, rect: Partial<WindowRect>) => void;
  setTitle: (id: string, title: string) => void;
  setLauncherOpen: (open: boolean) => void;
  toggleLauncher: () => void;
  setSpotlightOpen: (open: boolean) => void;
  toggleSpotlight: () => void;
  setWallpaper: (id: WallpaperId) => void;
  setGlassPalette: (id: GlassPaletteId) => void;
  closeAll: () => void;
  cascadeArrange: (parent: { w: number; h: number }) => void;
  /** Refit every window to the live canvas after a viewport resize / on mount. */
  reflowWindows: (canvas?: CanvasBox) => void;

  // Desktop icons
  setIconPosition: (id: string, pos: { x: number; y: number }) => void;

  // Recycle bin
  recycle: (item: Omit<RecycleItem, "deletedAt">) => void;
  restoreFromBin: (id: string) => RecycleItem | undefined;
  purgeFromBin: (id: string) => void;
  emptyBin: () => void;

  // Snapshots (pinned tiles)
  pinSnapshot: (
    s: Omit<DesktopSnapshot, "id" | "createdAt"> &
      Partial<Pick<DesktopSnapshot, "id" | "createdAt">>,
  ) => string;
  moveSnapshot: (id: string, x: number, y: number) => void;
  removeSnapshot: (id: string) => void;

  // Widgets
  addWidget: (w: Omit<DesktopWidget, "id"> & Partial<Pick<DesktopWidget, "id">>) => string;
  moveWidget: (id: string, x: number, y: number) => void;
  removeWidget: (id: string) => void;

  // Workspaces
  saveWorkspace: (name: string) => string;
  restoreWorkspace: (id: string) => void;
  deleteWorkspace: (id: string) => void;

  // Always-on-top
  togglePinOnTop: (id: string) => void;

  // Dock progress
  setDockProgress: (appId: string, value: number | null) => void;

  // Window tab grouping
  setWindowGroup: (id: string, groupId: string | undefined) => void;
}

let idSeq = 0;
const nextId = () => `win-${Date.now().toString(36)}-${(idSeq++).toString(36)}`;
const nextSnapshotId = () => `snap-${Date.now().toString(36)}-${(idSeq++).toString(36)}`;
const nextWidgetId = () => `wgt-${Date.now().toString(36)}-${(idSeq++).toString(36)}`;
const nextWorkspaceId = () => `ws-${Date.now().toString(36)}-${(idSeq++).toString(36)}`;

/** Z bump applied to pinned-on-top windows in selectors. */
const PIN_Z_BUMP = 100000;

function defaultRect(appId: string, seed: number): WindowRect {
  const app = getApp(appId);
  const w = app?.defaultSize.w ?? 880;
  const h = app?.defaultSize.h ?? 640;
  // Shrink the app's preferred size to the live canvas and cascade-place it, so
  // a 1180×820 app never opens off-screen on a small / resized display.
  return defaultRectForCanvas({ w, h }, seed);
}

export const useDesktopStore = create<DesktopState>()(
  persist(
    (set, get) => ({
      windows: [],
      zCounter: 10,
      launcherOpen: false,
      spotlightOpen: false,
      wallpaper: "dawn",
      glassPalette: "sand",
      spawnSeed: 0,
      iconPositions: {},
      recycleBin: [],
      snapshots: [],
      widgets: [],
      workspaces: [],
      pinnedOnTop: [],
      dockProgress: {},
      widgetDate: null,

      openApp: (appId, opts) => {
        const app = getApp(appId);
        if (!app) return undefined;
        const state = get();

        if (app.singleInstance && !opts?.forceNew) {
          const existing = state.windows.find((w) => w.appId === appId);
          if (existing) {
            get().restoreWindow(existing.id);
            get().focusWindow(existing.id);
            set({ launcherOpen: false });
            return existing.id;
          }
        }

        const id = nextId();
        const z = state.zCounter + 1;
        const rect = defaultRect(appId, state.spawnSeed);
        const win: DesktopWindow = {
          id,
          appId,
          title: opts?.title ?? app.title,
          ...rect,
          z,
          minimized: false,
          maximized: Boolean(opts?.maximized),
          props: opts?.props,
        };
        set({
          windows: [...state.windows, win],
          zCounter: z,
          spawnSeed: state.spawnSeed + 1,
          launcherOpen: false,
        });
        return id;
      },

      closeWindow: (id) =>
        set((s) => ({
          windows: s.windows.filter((w) => w.id !== id),
          pinnedOnTop: s.pinnedOnTop.filter((p) => p !== id),
        })),

      focusWindow: (id) =>
        set((s) => {
          const z = s.zCounter + 1;
          return {
            zCounter: z,
            windows: s.windows.map((w) => (w.id === id ? { ...w, z, minimized: false } : w)),
          };
        }),

      minimizeWindow: (id) =>
        set((s) => ({
          windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: true } : w)),
        })),

      restoreWindow: (id) =>
        set((s) => ({
          windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: false } : w)),
        })),

      toggleMaximize: (id, parent) =>
        set((s) => ({
          windows: s.windows.map((w) => {
            if (w.id !== id) return w;
            if (w.maximized && w.restore) {
              return { ...w, maximized: false, ...w.restore, restore: undefined };
            }
            // `parent`, when passed, is the desktop CANVAS box — it already
            // excludes the menu bar + dock, so the window fills it with a small
            // inset and NO extra chrome subtraction. Only the raw-window fallback
            // still reserves ~64px for the dock.
            const pad = 8;
            const hasParent = Boolean(parent);
            const pw = parent?.w ?? (typeof window !== "undefined" ? window.innerWidth : 1280);
            const ph = parent?.h ?? (typeof window !== "undefined" ? window.innerHeight : 800);
            const dockReserve = hasParent ? 0 : 64;
            return {
              ...w,
              maximized: true,
              restore: { x: w.x, y: w.y, w: w.w, h: w.h },
              x: pad,
              y: pad,
              w: pw - pad * 2,
              h: ph - pad * 2 - dockReserve,
            };
          }),
        })),

      setRect: (id, rect) =>
        set((s) => ({
          windows: s.windows.map((w) => (w.id === id ? { ...w, ...rect } : w)),
        })),

      setTitle: (id, title) =>
        set((s) => ({
          windows: s.windows.map((w) => (w.id === id ? { ...w, title } : w)),
        })),

      setLauncherOpen: (launcherOpen) => set({ launcherOpen, spotlightOpen: false }),
      toggleLauncher: () => set((s) => ({ launcherOpen: !s.launcherOpen, spotlightOpen: false })),
      setSpotlightOpen: (spotlightOpen) => set({ spotlightOpen, launcherOpen: false }),
      toggleSpotlight: () => set((s) => ({ spotlightOpen: !s.spotlightOpen, launcherOpen: false })),
      setWallpaper: (wallpaper) => set({ wallpaper }),
      setGlassPalette: (glassPalette) => set({ glassPalette }),
      closeAll: () => set({ windows: [], pinnedOnTop: [] }),

      setIconPosition: (id, pos) =>
        set((s) => ({ iconPositions: { ...s.iconPositions, [id]: pos } })),

      recycle: (item) =>
        set((s) => ({
          recycleBin: [{ ...item, deletedAt: Date.now() }, ...s.recycleBin],
        })),

      restoreFromBin: (id) => {
        const item = get().recycleBin.find((r) => r.id === id);
        set((s) => ({ recycleBin: s.recycleBin.filter((r) => r.id !== id) }));
        return item;
      },

      purgeFromBin: (id) => set((s) => ({ recycleBin: s.recycleBin.filter((r) => r.id !== id) })),

      emptyBin: () => set({ recycleBin: [] }),

      pinSnapshot: (snap) => {
        const id = snap.id ?? nextSnapshotId();
        const full: DesktopSnapshot = {
          ...snap,
          id,
          createdAt: snap.createdAt ?? Date.now(),
        };
        set((s) => ({ snapshots: [full, ...s.snapshots] }));
        return id;
      },

      moveSnapshot: (id, x, y) =>
        set((s) => ({
          snapshots: s.snapshots.map((sn) => (sn.id === id ? { ...sn, x, y } : sn)),
        })),

      removeSnapshot: (id) => set((s) => ({ snapshots: s.snapshots.filter((sn) => sn.id !== id) })),

      addWidget: (widget) => {
        const id = widget.id ?? nextWidgetId();
        const full: DesktopWidget = { ...widget, id };
        set((s) => ({ widgets: [...s.widgets, full] }));
        return id;
      },

      moveWidget: (id, x, y) =>
        set((s) => ({
          widgets: s.widgets.map((w) => (w.id === id ? { ...w, x, y } : w)),
        })),

      removeWidget: (id) => set((s) => ({ widgets: s.widgets.filter((w) => w.id !== id) })),

      saveWorkspace: (name) => {
        const s = get();
        const id = nextWorkspaceId();
        const ws: DesktopWorkspace = {
          id,
          name,
          // Deep-ish copy so later mutations don't bleed into the saved snapshot.
          windows: s.windows.map((w) => ({ ...w })),
          wallpaper: s.wallpaper,
          glassPalette: s.glassPalette,
          createdAt: Date.now(),
        };
        set((st) => ({ workspaces: [ws, ...st.workspaces] }));
        return id;
      },

      restoreWorkspace: (id) =>
        set((s) => {
          const ws = s.workspaces.find((w) => w.id === id);
          if (!ws) return s;
          // Re-stack the restored windows above whatever is open and keep zCounter ahead.
          let z = s.zCounter;
          const windows = ws.windows.map((w) => {
            z += 1;
            return { ...w, z, minimized: false };
          });
          return {
            windows,
            zCounter: z,
            wallpaper: (ws.wallpaper as WallpaperId) ?? s.wallpaper,
            glassPalette: (ws.glassPalette as GlassPaletteId) ?? s.glassPalette,
            pinnedOnTop: s.pinnedOnTop.filter((p) => windows.some((w) => w.id === p)),
          };
        }),

      deleteWorkspace: (id) =>
        set((s) => ({ workspaces: s.workspaces.filter((w) => w.id !== id) })),

      togglePinOnTop: (id) =>
        set((s) => ({
          pinnedOnTop: s.pinnedOnTop.includes(id)
            ? s.pinnedOnTop.filter((p) => p !== id)
            : [...s.pinnedOnTop, id],
        })),

      setDockProgress: (appId, value) =>
        set((s) => {
          const next = { ...s.dockProgress };
          if (value === null) {
            delete next[appId];
          } else {
            next[appId] = value;
          }
          return { dockProgress: next };
        }),

      setWidgetDate: (date) => set({ widgetDate: date }),
      updateWidgetConfig: (id, config) =>
        set((s) => ({
          widgets: s.widgets.map((w) => (w.id === id ? { ...w, config } : w)),
        })),

      setWindowGroup: (id, groupId) =>
        set((s) => ({
          windows: s.windows.map((w) => (w.id === id ? { ...w, groupId } : w)),
        })),

      reflowWindows: (canvas) =>
        set((s) => {
          const box = canvas ?? getDesktopCanvas();
          const max = maximizedRect(box);
          let changed = false;
          const windows = s.windows.map((w) => {
            // Maximised windows always refill the (possibly new) usable canvas.
            if (w.maximized) {
              if (w.x === max.x && w.y === max.y && w.w === max.w && w.h === max.h) return w;
              changed = true;
              return { ...w, ...max };
            }
            const fit = clampRectToCanvas({ x: w.x, y: w.y, w: w.w, h: w.h }, box);
            if (fit.x === w.x && fit.y === w.y && fit.w === w.w && fit.h === w.h) return w;
            changed = true;
            return { ...w, ...fit };
          });
          // Avoid a needless state write (and re-render) when nothing moved.
          return changed ? { windows } : s;
        }),

      cascadeArrange: (parent) =>
        set((s) => {
          const visible = s.windows.filter((w) => !w.minimized);
          let z = s.zCounter;
          const windows = s.windows.map((w) => {
            const idx = visible.findIndex((v) => v.id === w.id);
            if (idx === -1) return w;
            const off = idx * 36;
            z += 1;
            return {
              ...w,
              maximized: false,
              x: 60 + off,
              y: 56 + off,
              w: Math.min(w.w, parent.w - 120 - off),
              h: Math.min(w.h, parent.h - 140 - off),
              z,
            };
          });
          return { windows, zCounter: z };
        }),
    }),
    {
      name: "data-navigator-desktop",
      version: 2,
      storage: createJSONStorage(() => createDrizzleStorage({ namespace: "desktop" })),
      partialize: (s) => ({
        windows: s.windows.map((w) => ({ ...w, minimized: false })),
        zCounter: s.zCounter,
        wallpaper: s.wallpaper,
        glassPalette: s.glassPalette,
        spawnSeed: s.spawnSeed,
        iconPositions: s.iconPositions,
        recycleBin: s.recycleBin,
        snapshots: s.snapshots,
        widgets: s.widgets,
        workspaces: s.workspaces,
        pinnedOnTop: s.pinnedOnTop,
      }),
    },
  ),
);

export const useDesktopWindows = () => useDesktopStore((s) => s.windows);
export const useLauncherOpen = () => useDesktopStore((s) => s.launcherOpen);
export const useSpotlightOpen = () => useDesktopStore((s) => s.spotlightOpen);
export const useWallpaper = () => useDesktopStore((s) => s.wallpaper);
export const useGlassPalette = () => useDesktopStore((s) => s.glassPalette);
export const useRecycleBin = () => useDesktopStore((s) => s.recycleBin);
export const useIconPositions = () => useDesktopStore((s) => s.iconPositions);
export const useSnapshots = () => useDesktopStore((s) => s.snapshots);
export const useWidgets = () => useDesktopStore((s) => s.widgets);
export const useWorkspaces = () => useDesktopStore((s) => s.workspaces);
export const usePinnedOnTop = () => useDesktopStore((s) => s.pinnedOnTop);
export const useDockProgress = () => useDesktopStore((s) => s.dockProgress);
export const useWidgetDate = () => useDesktopStore((s) => s.widgetDate);

/**
 * Windows with an effective z that bumps pinned-on-top windows above the rest.
 * Use this instead of the raw `windows` array when you want always-on-top
 * windows to render above everything else without mutating their stored z.
 */
export const useWindowsWithPinZ = () => {
  // Subscribe to the raw slices (stable references) and allocate in a memo.
  // `useShallow` here would compare only one level deep, and every pinned window
  // produces a fresh `{ ...w }` on each call, so the snapshot would never be
  // shallow-equal once anything was pinned — an infinite render loop.
  const windows = useDesktopStore((s) => s.windows);
  const pinnedOnTop = useDesktopStore((s) => s.pinnedOnTop);
  return useMemo(
    () => windows.map((w) => (pinnedOnTop.includes(w.id) ? { ...w, z: w.z + PIN_Z_BUMP } : w)),
    [windows, pinnedOnTop],
  );
};

export const useDesktopActions = () =>
  useDesktopStore(
    useShallow((s) => ({
      openApp: s.openApp,
      closeWindow: s.closeWindow,
      focusWindow: s.focusWindow,
      minimizeWindow: s.minimizeWindow,
      restoreWindow: s.restoreWindow,
      toggleMaximize: s.toggleMaximize,
      setRect: s.setRect,
      setTitle: s.setTitle,
      setLauncherOpen: s.setLauncherOpen,
      toggleLauncher: s.toggleLauncher,
      setSpotlightOpen: s.setSpotlightOpen,
      toggleSpotlight: s.toggleSpotlight,
      setWallpaper: s.setWallpaper,
      setGlassPalette: s.setGlassPalette,
      closeAll: s.closeAll,
      cascadeArrange: s.cascadeArrange,
      reflowWindows: s.reflowWindows,
      // Desktop icons
      setIconPosition: s.setIconPosition,
      // Recycle bin
      recycle: s.recycle,
      restoreFromBin: s.restoreFromBin,
      purgeFromBin: s.purgeFromBin,
      emptyBin: s.emptyBin,
      // Snapshots
      pinSnapshot: s.pinSnapshot,
      moveSnapshot: s.moveSnapshot,
      removeSnapshot: s.removeSnapshot,
      // Widgets
      addWidget: s.addWidget,
      moveWidget: s.moveWidget,
      removeWidget: s.removeWidget,
      // Workspaces
      saveWorkspace: s.saveWorkspace,
      restoreWorkspace: s.restoreWorkspace,
      deleteWorkspace: s.deleteWorkspace,
      // Always-on-top
      togglePinOnTop: s.togglePinOnTop,
      // Dock progress
      setDockProgress: s.setDockProgress,
      // Widget date filter + config
      setWidgetDate: s.setWidgetDate,
      updateWidgetConfig: s.updateWidgetConfig,
      // Window tabs
      setWindowGroup: s.setWindowGroup,
    })),
  );
