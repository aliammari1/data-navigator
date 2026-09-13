/**
 * Single source of truth for the app's keyboard shortcuts.
 *
 * Every surface that *displays* shortcuts (such as the Settings → Shortcuts
 * panel) reads from this list, so they can never drift apart or advertise
 * a binding that doesn't exist.
 *
 * Behavioural truth lives in `use-shell-shortcuts.ts` (the `tinykeys` map).
 * Keep this list aligned with those — only add an entry once its handler is
 * actually wired, otherwise the UI lies about features.
 */

export interface ShortcutEntry {
  /** Stable id (React keys / tests). */
  id: string;
  /**
   * Combo tokens rendered left→right. The `"mod"` token renders as `⌘` on
   * macOS and `Ctrl` elsewhere (matches tinykeys' `$mod`). Other tokens render
   * verbatim.
   */
  combo: string[];
  /** Action label (French — the product UI language). */
  label: string;
}

export const APP_SHORTCUTS: ShortcutEntry[] = [
  { id: "command-palette", combo: ["mod", "K"], label: "Palette de commandes" },
  { id: "toggle-ai", combo: ["mod", "\\"], label: "Assistant Moudir" },
  { id: "toggle-sidebar", combo: ["mod", "B"], label: "Barre latérale" },
  { id: "show-shortcuts", combo: ["?"], label: "Afficher les raccourcis" },
];

/** True on Apple platforms, where the modifier key is `⌘` rather than `Ctrl`. */
function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const probe = `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`;
  return /Mac|iPhone|iPad|iPod/i.test(probe);
}

/**
 * Render a single combo token for display. `"mod"` → `⌘`/`Ctrl`, `"shift"` →
 * `⇧`/`Shift`; anything else is returned as-is (already display-ready).
 */
export function formatKey(token: string, mac: boolean = isMacPlatform()): string {
  if (token === "mod") return mac ? "⌘" : "Ctrl";
  if (token === "shift") return mac ? "⇧" : "Shift";
  return token;
}
