/**
 * Desktop window-manager contract.
 *
 * The dashboard "desktop mode" turns the app into a Puter-style workspace:
 * every feature screen can be opened as a free-floating, draggable, resizable
 * window on a warm canvas with a dock and an app launcher. This module is the
 * single source of truth for the window shape so the store, the window frame,
 * the dock and the AI commander never drift.
 */

export interface WindowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DesktopWindow extends WindowRect {
  /** Unique per-open instance id. */
  id: string;
  /** Registry key (see app-registry). */
  appId: string;
  /** Title shown in the window chrome + dock (snapshot of the app title). */
  title: string;
  /** Stacking order — higher is on top. */
  z: number;
  minimized: boolean;
  maximized: boolean;
  /** Saved rect to restore from a maximized state. */
  restore?: WindowRect;
  /** Optional props forwarded to the hosted screen component. */
  props?: Record<string, unknown>;
  /**
   * Optional tab-group id. Windows that share a groupId can be presented as a
   * single tabbed window by integration layers. The store only tracks the
   * grouping; it does not render the tab UI.
   */
  groupId?: string;
}

export interface OpenAppOptions {
  /** Override the default title. */
  title?: string;
  /** Props forwarded to the hosted component. */
  props?: Record<string, unknown>;
  /** Force a brand-new instance even for single-instance apps. */
  forceNew?: boolean;
  /** Open maximized. */
  maximized?: boolean;
}
