"use client";

/**
 * App command bus + per-window page registry.
 *
 * The menu bar lives in the desktop chrome; the behaviour for "Exporter",
 * "Actualiser", "Aller à la page X" lives in each feature screen. These two
 * never import each other — they talk over a tiny CustomEvent bus:
 *
 *   menu item  →  ctx.command("export")  →  dispatchAppCommand(appId, win, "export")
 *   screen     →  useAppCommands(appId, { export: () => downloadReport() })
 *
 * Multi-page apps additionally register their pages with `useRegisterPages` so
 * the View menu can list them and reflect the current page — the "menu changes
 * per page" behaviour — without the menu knowing anything app-specific.
 */

import { useEffect, useRef } from "react";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { AppPage } from "@/features/desktop/core/menu/types";

// ─── Command bus ─────────────────────────────────────────────────────────────

export const APP_COMMAND_EVENT = "desktop:app-command";

export interface AppCommandDetail {
  appId: string;
  /** Window the command targets, when known (focused window at dispatch time). */
  windowId: string | null;
  commandId: string;
  payload?: unknown;
}

/** Fire an app command to whichever screen has subscribed for this app. */
export function dispatchAppCommand(
  appId: string,
  windowId: string | null,
  commandId: string,
  payload?: unknown,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AppCommandDetail>(APP_COMMAND_EVENT, {
      detail: { appId, windowId, commandId, payload },
    }),
  );
}

export type AppCommandHandler = (payload: unknown, detail: AppCommandDetail) => void;

/**
 * Subscribe a feature screen to its app's menu commands.
 *
 * Pass a map of `commandId → handler`. Handlers are read live (no need to
 * memoise them), so closures over fresh state work. Optionally scope to a single
 * window id (for multi-instance apps) — omit it and the screen handles every
 * command for its app.
 */
export function useAppCommands(
  appId: string,
  handlers: Record<string, AppCommandHandler>,
  opts?: { windowId?: string | null },
): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  const windowId = opts?.windowId ?? undefined;

  useEffect(() => {
    const onCmd = (e: Event) => {
      const detail = (e as CustomEvent<AppCommandDetail>).detail;
      if (!detail || detail.appId !== appId) return;
      if (windowId && detail.windowId && detail.windowId !== windowId) return;
      const handler = ref.current[detail.commandId];
      if (handler) handler(detail.payload, detail);
    };
    window.addEventListener(APP_COMMAND_EVENT, onCmd as EventListener);
    return () => window.removeEventListener(APP_COMMAND_EVENT, onCmd as EventListener);
  }, [appId, windowId]);
}

// ─── Per-window page registry ────────────────────────────────────────────────

interface PageEntry {
  items: AppPage[];
  activeId: string | null;
}

interface PageStore {
  byWindow: Record<string, PageEntry>;
  registerPages: (windowId: string, items: AppPage[], activeId?: string | null) => void;
  setActivePage: (windowId: string, pageId: string) => void;
  clearPages: (windowId: string) => void;
}

const EMPTY_PAGES: PageEntry = { items: [], activeId: null };

/** True when two page lists carry the same ids in the same order. */
function sameIds(a: AppPage[], b: AppPage[]): boolean {
  return a.length === b.length && a.every((p, i) => p.id === b[i].id);
}

/** Ephemeral (not persisted): page state is rebuilt whenever a screen mounts. */
export const usePageStore = create<PageStore>((set) => ({
  byWindow: {},
  registerPages: (windowId, items, activeId) =>
    set((s) => {
      const next = activeId ?? items[0]?.id ?? null;
      const prev = s.byWindow[windowId];
      // Idempotent: ignore re-registrations that don't change the pages or the
      // active id, so a screen passing a fresh array each render causes no churn.
      if (prev && prev.activeId === next && sameIds(prev.items, items)) return s;
      return { byWindow: { ...s.byWindow, [windowId]: { items, activeId: next } } };
    }),
  setActivePage: (windowId, pageId) =>
    set((s) => {
      const entry = s.byWindow[windowId];
      if (!entry || entry.activeId === pageId) return s;
      return { byWindow: { ...s.byWindow, [windowId]: { ...entry, activeId: pageId } } };
    }),
  clearPages: (windowId) =>
    set((s) => {
      if (!(windowId in s.byWindow)) return s;
      const next = { ...s.byWindow };
      delete next[windowId];
      return { byWindow: next };
    }),
}));

/** Read a window's registered pages (stable empty default when none). */
export function useWindowPages(windowId: string | null): PageEntry {
  return usePageStore(
    useShallow((s) => (windowId ? (s.byWindow[windowId] ?? EMPTY_PAGES) : EMPTY_PAGES)),
  );
}

/**
 * Register a multi-page screen's pages for its window. Call from the hosted
 * screen with its window id (see `useWindowId`). Pages are cleared on unmount.
 */
export function useRegisterPages(
  windowId: string | null,
  items: AppPage[],
  activeId?: string | null,
): void {
  useEffect(() => {
    if (!windowId) return;
    // `registerPages` is idempotent, so a fresh `items` array each render is fine.
    usePageStore.getState().registerPages(windowId, items, activeId ?? null);
    return () => usePageStore.getState().clearPages(windowId);
  }, [windowId, items, activeId]);
}
