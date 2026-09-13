"use client";

/**
 * Unified Moudir AI Ask & Redirection Bridge.
 *
 * Ensures questions dispatched from anywhere (Inspector, Folders, Telecom, Context menus,
 * Dock, Spotlight) reliably reach Moudir with prompt preserved, whether the Moudir window
 * is open, closed, or running outside desktop mode.
 */

import { useDataStore } from "@/core/stores/data-store";
import { useMoudirChatStore } from "@/features/data-formulator/store/moudir-chat-store";

export interface AskMoudirOptions {
  datasetId?: string | null;
  openApp?: (appId: string, options?: { props?: Record<string, unknown> }) => unknown;
}

export function askMoudir(prompt: string, options?: AskMoudirOptions): void {
  const text = prompt.trim();
  if (!text) return;

  // 1. Stage in the active dataset store if specified
  if (options?.datasetId) {
    useDataStore.getState().setActiveDataset(options.datasetId);
  }

  // 2. Stage in MoudirChatStore immediately so any mounting screen reads it
  useMoudirChatStore.getState().setPendingPrompt(text);

  // 3. If an explicit openApp function was passed (from useDesktopActions), use it
  if (options?.openApp) {
    options.openApp("moudir-chat", { props: { initialPrompt: text } });
  }

  // 4. Dispatch desktop:open-app event with props
  if (typeof window !== "undefined") {
    const desktopOpenEvent = new CustomEvent("desktop:open-app", {
      detail: {
        appId: "moudir-chat",
        route: "/dashboard/moudir",
        props: { initialPrompt: text },
      },
      cancelable: true,
    });
    window.dispatchEvent(desktopOpenEvent);

    // 5. Also dispatch moudir:ask for already mounted listeners
    window.dispatchEvent(new CustomEvent("moudir:ask", { detail: { prompt: text } }));

    // 6. If not claimed by a desktop window manager and outside desktop canvas, navigate via route
    if (!desktopOpenEvent.defaultPrevented && !document.querySelector(".dn-desktop-canvas")) {
      window.location.assign("/dashboard/moudir");
    }
  }
}
