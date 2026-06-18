"use client";

/**
 * App-open contract for the folders catalog.
 *
 * The desktop window manager listens for a `desktop:open-app` CustomEvent and
 * opens the target app in-place (shared live stores, no reload). The folders
 * screen uses this to "open" a dataset in the Data Browser or to open the frozen
 * analytics report (Télécom) for a dataset.
 *
 * We mirror the shape already used by the home screen launcher
 * (`@/features/dashboard-home/lib/open-app`): `detail: { appId, route }`,
 * `cancelable: true`. The desktop listener calls `preventDefault()` when it
 * claims the open. We keep a `route` for the classic `/dashboard` fallback even
 * though the folders screen is normally hosted inside the desktop.
 */

export type FolderTargetApp = "data-browser" | "telecom" | "parsed" | "transform" | "moudir";

const ROUTE_BY_APP: Record<FolderTargetApp, string> = {
  "data-browser": "/dashboard/data-browser",
  telecom: "/dashboard/telecom-report/overview",
  parsed: "/dashboard/parsed",
  transform: "/dashboard/transform",
  moudir: "/dashboard/data-formulator",
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
 * Open Moudir (Studio IA) and hand off a question about a dataset via the
 * `moudir:ask` CustomEvent contract (same handoff Spotlight / Commander use).
 */
export function askMoudirAbout(datasetName: string): void {
  if (typeof window === "undefined") return;
  openDesktopApp("moudir");
  window.dispatchEvent(
    new CustomEvent("moudir:ask", {
      detail: {
        prompt: `Analyse le jeu de données « ${datasetName} » : résume sa structure, sa qualité et les points notables.`,
      },
    }),
  );
}
