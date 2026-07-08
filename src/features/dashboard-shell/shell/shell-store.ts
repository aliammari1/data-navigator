"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { createDrizzleStorage } from "@/platform/storage";

/**
 * Durable shell layout state.
 *
 * Previously the sidebar `collapsed` state was ephemeral `useState` in
 * `DashboardLayout` / `DashboardClientShell`, so every reload reset the
 * workspace layout even though `settings-store` already had durable offline
 * storage. This persists it through the same `createDrizzleStorage`
 * write-through adapter (SQLite + localStorage warm copy) under a dedicated
 * `shell` namespace, so layout survives reloads offline.
 */

interface ShellState {
  sidebarCollapsed: boolean;
  /**
   * Desktop mode turns the `/dashboard` home into a Puter-style windowed
   * workspace (the default). Toggling off restores the classic sidebar shell.
   */
  desktopMode: boolean;

  setSidebarCollapsed: (value: boolean) => void;
  toggleSidebar: () => void;
  setDesktopMode: (value: boolean) => void;
  toggleDesktopMode: () => void;
}

export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      desktopMode: true,

      setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setDesktopMode: (value) => set({ desktopMode: value }),
      toggleDesktopMode: () => set((s) => ({ desktopMode: !s.desktopMode })),
    }),
    {
      name: "data-navigator-shell",
      version: 1,
      storage: createJSONStorage(() => createDrizzleStorage({ namespace: "shell" })),
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        desktopMode: s.desktopMode,
      }),
    },
  ),
);

// ─── Narrow selector hooks (avoid whole-store subscriptions) ──────────────────

export const useSidebarCollapsed = () => useShellStore((s) => s.sidebarCollapsed);
export const useDesktopMode = () => useShellStore((s) => s.desktopMode);

export const useShellActions = () =>
  useShellStore(
    useShallow((s) => ({
      setSidebarCollapsed: s.setSidebarCollapsed,
      toggleSidebar: s.toggleSidebar,
      setDesktopMode: s.setDesktopMode,
      toggleDesktopMode: s.toggleDesktopMode,
    })),
  );
