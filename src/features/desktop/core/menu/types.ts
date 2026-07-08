"use client";

/**
 * Data model for the desktop's app-aware menu bar.
 *
 * The top menu bar is macOS-style: a single bar whose menus reflect the focused
 * window's app (and its current page). An app describes its menus as plain data
 * — {@link MenuGroup}[] built from a {@link MenuContext} — and the renderer
 * ({@link AppMenubar}) turns that data into a Radix `Menubar`. Keeping menus as
 * data (not JSX) means every app's bar is authored in one small file, the
 * focused-app swap is just "build a different array", and actions stay wired to
 * documented desktop contracts (store actions + the app-command bus).
 */

import type { LucideIcon } from "lucide-react";
import type { GlassPaletteId, WallpaperId } from "@/features/desktop/store/desktop-store";

/** A normal click-to-run item. `kind` is optional so the common case is terse. */
export interface MenuActionItem {
  kind?: "action";
  /** Stable id (React key + de-dup within a group). */
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Display-only accelerator hint, e.g. "⌘S" (the menu does not bind it). */
  shortcut?: string;
  run: () => void;
  disabled?: boolean;
  /** Render in the destructive/red style (e.g. Close, Delete). */
  danger?: boolean;
}

/** A toggle item with a check indicator. */
export interface MenuCheckboxItem {
  kind: "checkbox";
  id: string;
  label: string;
  icon?: LucideIcon;
  shortcut?: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
  disabled?: boolean;
}

/** A single-choice group rendered as a list of radio items. */
export interface MenuRadioGroupItem {
  kind: "radio";
  /** Stable id for the radio group. */
  id: string;
  value: string;
  options: { value: string; label: string; icon?: LucideIcon }[];
  onSelect: (value: string) => void;
}

/** A nested submenu. */
export interface MenuSubmenuItem {
  kind: "submenu";
  id: string;
  label: string;
  icon?: LucideIcon;
  items: MenuItem[];
}

export interface MenuSeparatorItem {
  kind: "separator";
  id: string;
}

export interface MenuLabelItem {
  kind: "label";
  id: string;
  label: string;
}

export type MenuItem =
  | MenuActionItem
  | MenuCheckboxItem
  | MenuRadioGroupItem
  | MenuSubmenuItem
  | MenuSeparatorItem
  | MenuLabelItem;

/** A top-level menu (one trigger in the bar) and its items. */
export interface MenuGroup {
  /**
   * Standard ids ("app" | "file" | "edit" | "view" | "help") slot into fixed
   * positions and merge with / override the universal defaults; any other id is
   * an app-specific menu placed between View and Window.
   */
  id: string;
  label: string;
  items: MenuItem[];
  /** Render the trigger bold (used for the leading app menu). */
  emphasized?: boolean;
}

/** A page within a multi-page app, surfaced in the View menu. */
export interface AppPage {
  id: string;
  label: string;
  icon?: LucideIcon;
}

/**
 * Everything a menu item needs to act, bound to the focused window. Built once
 * per render by `useMenuContext()` and passed to every app's {@link AppMenuBuilder}.
 * All window-scoped methods are safe no-ops when no window is focused.
 */
export interface MenuContext {
  /** Focused app id, or null on the empty desktop. */
  appId: string | null;
  /** Focused window instance id, or null on the empty desktop. */
  windowId: string | null;
  /** Focused app title (menu bar leading label). */
  title: string;
  /** Focused app accent hue (0–360). */
  hue: number;
  /** Whether the focused window is maximised (drives the Zoom/Restore label). */
  isMaximized: boolean;
  /** Whether the focused window is kept always-on-top. */
  isPinnedOnTop: boolean;
  /** Pages the focused window registered, with the active one (for the View menu). */
  pages: AppPage[];
  activePageId: string | null;

  // ── Window controls (no-op when windowId is null) ────────────────────────
  closeWindow: () => void;
  minimizeWindow: () => void;
  toggleMaximize: () => void;
  togglePinOnTop: () => void;
  snapshot: () => void;

  // ── Desktop-wide ─────────────────────────────────────────────────────────
  openApp: (appId: string, opts?: { props?: Record<string, unknown>; forceNew?: boolean }) => void;
  cascadeArrange: () => void;
  closeAll: () => void;
  exitDesktop: () => void;
  askMoudir: (prompt: string) => void;

  // ── Appearance ───────────────────────────────────────────────────────────
  theme: string | undefined;
  setTheme: (theme: "light" | "dark" | "system") => void;
  wallpaper: WallpaperId;
  setWallpaper: (id: WallpaperId) => void;
  glassPalette: GlassPaletteId;
  setGlassPalette: (id: GlassPaletteId) => void;

  // ── App command bus + pages ──────────────────────────────────────────────
  /**
   * Send a command to the focused app's screen. The screen subscribes with
   * `useAppCommands(appId, { [commandId]: handler })`. This is how app-specific
   * menu items ("Exporter", "Actualiser", …) reach behaviour that lives in the
   * feature screen without the screen being rewritten.
   */
  command: (commandId: string, payload?: unknown) => void;
  /** Switch the focused window's active page (also dispatches a "navigate" command). */
  setActivePage: (pageId: string) => void;
}

/** Builds an app's menus from the live context. Pure; called on every render. */
export type AppMenuBuilder = (ctx: MenuContext) => MenuGroup[];
