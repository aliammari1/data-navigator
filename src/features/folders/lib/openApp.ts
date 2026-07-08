"use client";

/**
 * App-open contract for the folders catalog.
 *
 * The desktop window manager listens for a `desktop:open-app` CustomEvent and
 * opens the target app in-place (shared live stores, no reload). The folders
 * screen uses this to open the import flow or to open the frozen analytics
 * report (Télécom) for a dataset.
 *
 * Shape: `detail: { appId, route }`, `cancelable: true`. The desktop listener
 * calls `preventDefault()` when it claims the open. We keep a `route` for the
 * classic (non-desktop) fallback even though the folders screen is normally
 * hosted inside the desktop.
 */

export type FolderTargetApp = "upload" | "telecom" | "moudir" | "moudir-chat";

const ROUTE_BY_APP: Record<FolderTargetApp, string> = {
  upload: "/dashboard/upload",
  telecom: "/dashboard/telecom-report/overview",
  moudir: "/dashboard/data-formulator",
  "moudir-chat": "/dashboard/moudir",
};

/**
 * Dispatch the desktop open-app event for the given app id. Returns true when a
 * desktop listener claimed it (called `preventDefault`), false otherwise.
 */
export function openDesktopApp(appId: FolderTargetApp): boolean {
  if (typeof window === "undefined") return false;
  const event = new CustomEvent("desktop:open-app", {
    detail: { appId, route: ROUTE_BY_APP[appId] },
    cancelable: true,
  });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

/**
 * Open the Moudir assistant and hand off a question about a dataset via the
 * `moudir:ask` CustomEvent contract (same handoff Spotlight / Commander use).
 */
export function askMoudirAbout(datasetName: string): void {
  if (typeof window === "undefined") return;
  openDesktopApp("moudir-chat");
  window.dispatchEvent(
    new CustomEvent("moudir:ask", {
      detail: {
        prompt: `Analyse le jeu de données « ${datasetName} » : résume sa structure, sa qualité et les points notables.`,
      },
    }),
  );
}
