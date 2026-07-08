"use client";

/**
 * Quick-action launch contract for the home screen.
 *
 * The home screen is hosted two ways:
 *  1. As the "Accueil" desktop app, inside a window manager that can react to a
 *     `desktop:open-app` CustomEvent and open the target app in-place (no reload,
 *     shared live stores).
 *  2. As the classic `/dashboard` route, where there is no desktop listener — so
 *     every launcher also keeps a real `<a href>` route fallback.
 *
 * `openApp` dispatches the event AND, when no desktop handler claims it, falls
 * back to a hard navigation to the route. We detect "claimed" via
 * `event.defaultPrevented`: a desktop listener calls `preventDefault()` to take
 * ownership. Anchors keep working with the keyboard / middle-click / SSR because
 * the launcher renders a genuine `<a>` and we only intercept the plain-left-click.
 */

/** Must match a `DESKTOP_APPS[].id` in `@/features/desktop/core/app-registry`. */
export type DesktopAppId = string;

export interface OpenAppDetail {
  appId: DesktopAppId;
  /** The classic-mode route, so a listener may navigate there if it prefers. */
  route: string;
}

/**
 * Dispatch the desktop open-app event. Returns true when a desktop listener
 * claimed it (called `preventDefault`), false otherwise so the caller can fall
 * back to route navigation.
 */
export function dispatchOpenApp(appId: DesktopAppId, route: string): boolean {
  if (typeof window === "undefined") return false;
  const event = new CustomEvent<OpenAppDetail>("desktop:open-app", {
    detail: { appId, route },
    cancelable: true,
  });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

/**
 * Click handler for a launcher anchor. Honors modified clicks (new tab / window),
 * tries the desktop event first, and lets the native `href` navigation happen
 * only when nothing claimed the open.
 */
export function handleLauncherClick(
  appId: DesktopAppId,
  route: string,
): (event: React.MouseEvent<HTMLAnchorElement>) => void {
  return (event) => {
    // Respect new-tab / new-window / download intents — never hijack those.
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    const claimed = dispatchOpenApp(appId, route);
    if (claimed) {
      // Desktop handled it in-place; suppress the route navigation.
      event.preventDefault();
    }
    // Otherwise: let the anchor navigate to `route` (classic /dashboard mode).
  };
}
