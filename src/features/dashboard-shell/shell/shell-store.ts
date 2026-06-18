"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { createDrizzleStorage } from "@/platform/storage";

/**
 * Durable shell layout state.
 *
 * Previously the sidebar `collapsed`, the AI panel `open`/`tab`, and its docked
 * width were ephemeral `useState` in `DashboardLayout` / `DashboardClientShell`,
 * so every reload reset the workspace layout even though `settings-store` already
 * had durable offline storage. This persists them through the same
 * `createDrizzleStorage` write-through adapter (SQLite + localStorage warm copy)
 * under a dedicated `shell` namespace, so layout survives reloads offline.
 */

export type AiPanelTab = "chat" | "insights";

interface ShellState {
  sidebarCollapsed: boolean;
  aiPanelOpen: boolean;
  aiPanelTab: AiPanelTab;
  /** Docked AI panel width as a percentage of the workspace (react-resizable-panels). */
  aiPanelSize: number;
  /**
   * Desktop mode turns the `/dashboard` home into a Puter-style windowed
   * workspace (the default). Toggling off restores the classic sidebar shell.
   */
  desktopMode: boolean;

  setSidebarCollapsed: (value: boolean) => void;
  toggleSidebar: () => void;
  setAiPanelOpen: (value: boolean) => void;
  toggleAiPanel: () => void;
  setAiPanelTab: (tab: AiPanelTab) => void;
  setAiPanelSize: (size: number) => void;
  setDesktopMode: (value: boolean) => void;
  toggleDesktopMode: () => void;
}

export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      aiPanelOpen: false,
      aiPanelTab: "chat",
      aiPanelSize: 32,
      desktopMode: true,

      setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setAiPanelOpen: (value) => set({ aiPanelOpen: value }),
      toggleAiPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),
      setAiPanelTab: (aiPanelTab) => set({ aiPanelTab }),
      setAiPanelSize: (aiPanelSize) => set({ aiPanelSize }),
      setDesktopMode: (value) => set({ desktopMode: value }),
      toggleDesktopMode: () => set((s) => ({ desktopMode: !s.desktopMode })),
    }),
    {
      name: "data-navigator-shell",
      version: 1,
      storage: createJSONStorage(() => createDrizzleStorage({ namespace: "shell" })),
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        aiPanelOpen: s.aiPanelOpen,
        aiPanelTab: s.aiPanelTab,
        aiPanelSize: s.aiPanelSize,
        desktopMode: s.desktopMode,
      }),
    },
  ),
);

// ─── Narrow selector hooks (avoid whole-store subscriptions) ──────────────────

export const useSidebarCollapsed = () => useShellStore((s) => s.sidebarCollapsed);
export const useAiPanelOpen = () => useShellStore((s) => s.aiPanelOpen);
export const useAiPanelTab = () => useShellStore((s) => s.aiPanelTab);
export const useDesktopMode = () => useShellStore((s) => s.desktopMode);

export const useShellActions = () =>
  useShellStore(
    useShallow((s) => ({
      setSidebarCollapsed: s.setSidebarCollapsed,
      toggleSidebar: s.toggleSidebar,
      setAiPanelOpen: s.setAiPanelOpen,
      toggleAiPanel: s.toggleAiPanel,
      setAiPanelTab: s.setAiPanelTab,
      setAiPanelSize: s.setAiPanelSize,
      setDesktopMode: s.setDesktopMode,
      toggleDesktopMode: s.toggleDesktopMode,
    })),
  );
