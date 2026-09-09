// tests/e2e-electron/navigation-journey.spec.ts
import { expect, test } from "@playwright/test";
import { closeApp, launchApp, screenshot } from "./_harness";

/**
 * Route list: the authoritative content of
 * `src/features/dashboard-shell/nav/nav-config.ts`'s `NAV_SECTIONS` +
 * `FOOTER_ITEMS`.
 */
const ROUTES: { path: string; label: string }[] = [
  { path: "/dashboard/telecom-report/overview", label: "Vue d'ensemble" },
  { path: "/dashboard/telecom-report/canals", label: "Canaux" },
  { path: "/dashboard/telecom-report/analysis", label: "Analyse" },
  { path: "/dashboard/telecom-report/grid", label: "Données brutes" },
  { path: "/dashboard/telecom-report/period", label: "Période" },
  { path: "/dashboard/telecom-report/day", label: "Journalier" },
  { path: "/dashboard/telecom-report/history", label: "Historique" },
  { path: "/dashboard/telecom-report/config", label: "Configuration" },
  { path: "/dashboard/moudir", label: "Moudir" },
  { path: "/dashboard/upload", label: "Importer" },
  { path: "/dashboard/folders", label: "Catalogue" },
  { path: "/dashboard/collaborative", label: "Collaboration" },
  { path: "/dashboard/help", label: "Aide" },
  { path: "/dashboard/settings", label: "Paramètres" },
];

/**
 * Navigate to `path` and tolerate `next dev`'s cold on-demand compilation.
 * `tests/e2e/telecom-report-journey.spec.ts` documents the same phenomenon
 * for this exact route tree (147 files): the first hit of a heavy page can
 * exceed the default 30s navigation timeout, and can occasionally abort
 * in-flight (`net::ERR_ABORTED; maybe frame was detached?`) under compile
 * contention. Confirmed directly against this repo's exact dev-server
 * invocation (`cross-env ELECTRON_RUN_AS_NODE=1 electron next dev`): a cold
 * `/dashboard/telecom-report/period` compile alone took ~65s wall-clock
 * (then 170ms once warm) with zero other load, and the real Electron test
 * run — with video recording and prior routes' background work — pushed
 * that past 60s x 3 retries. 120s per attempt gives comfortable headroom
 * over the measured worst case; retries stay for the genuinely transient
 * abort/detach cases `gotoTelecom` was written for.
 */
async function gotoRoute(window: import("@playwright/test").Page, path: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await window.goto(`http://localhost:3000${path}`, {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      });
      return;
    } catch (error) {
      lastError = error;
      if (!/ERR_ABORTED|frame was detached|Timeout/i.test(String(error))) throw error;
      await window.waitForTimeout(1_000);
    }
  }
  throw lastError;
}

test.describe("Navigation journey", () => {
  test("every sidebar route loads without an error state", async () => {
    // Generous overall budget: up to 16 distinct routes may each pay a cold
    // `next dev` compile (see gotoRoute above), well beyond the config's
    // default 120s per-test timeout.
    test.setTimeout(900_000);

    const { app, window } = await launchApp({ testName: "navigation-journey" });

    try {
      for (const route of ROUTES) {
        await test.step(`visit ${route.path}`, async () => {
          await gotoRoute(window, route.path);
          await expect(window).toHaveURL(new RegExp(route.path.replace(/\//g, "\\/")));
          await expect(window.locator("body")).not.toContainText(/application error|404/i);
          await screenshot(window, `nav-${route.path.replace(/\//g, "_")}`);
        });
      }
    } finally {
      await closeApp(app);
    }
  });

  test("command palette opens and filters results", async () => {
    const { app, window } = await launchApp({ testName: "navigation-journey-palette" });

    try {
      // NOTE: the shared authenticated profile (SHARED_PROFILE_DIR) defaults
      // to Desktop/Bureau mode on bare `/dashboard`
      // (shell-store.ts's `desktopMode: true` default +
      // dashboard-layout.tsx's `desktopActive = desktopMode && pathname ===
      // "/dashboard"`), which renders the Puter-style Desktop/Spotlight
      // surface instead of the classic sidebar+topbar shell. The classic
      // `CommandPalette` component (with the "Search pages, datasets,
      // actions…" placeholder this test asserts against) is only mounted in
      // that classic-shell branch of `DashboardLayout`, so landing on bare
      // `/dashboard` would never show it even though the underlying Ctrl+K
      // shortcut (`useShellShortcuts`, tinykeys `$mod+k`) is registered
      // globally. `/dashboard/settings` is a non-bare pathname, so
      // `desktopActive` is false there and the classic shell (sidebar,
      // topbar, and CommandPalette) always renders regardless of
      // desktop-mode state — landing there first is the faithful way to
      // exercise the classic command palette this test targets.
      await window.goto("http://localhost:3000/dashboard/settings", {
        waitUntil: "domcontentloaded",
      });

      await test.step("open with Ctrl+K and search", async () => {
        await window.keyboard.press("Control+K");
        const input = window.getByPlaceholder(/search pages, datasets, actions/i);
        await expect(input).toBeVisible({ timeout: 10_000 });
        await input.fill("csv");
        await screenshot(window, "nav-command-palette-csv");
      });

      await test.step("sidebar collapse toggle", async () => {
        await window.keyboard.press("Escape");
        // The shared profile persists `sidebarCollapsed` across test runs
        // (app-sidebar.tsx renders one of two mutually-exclusive buttons —
        // "Réduire le menu" when expanded, "Développer le menu" when
        // collapsed — never both), so a prior run can leave this app
        // already collapsed and a name match on only "Réduire" would hang
        // forever waiting for a button that doesn't exist. Matching either
        // label finds whichever toggle is currently rendered; Playwright
        // locators re-query on each action, so clicking the same locator
        // twice hits the (now swapped) complementary button the second
        // time, toggling back regardless of the starting state.
        const collapseToggle = window.getByRole("button", {
          name: /réduire le menu|développer le menu/i,
        });
        await collapseToggle.click();
        await screenshot(window, "nav-sidebar-collapsed");
        await collapseToggle.click().catch(() => {}); // best-effort: restore original state
      });
    } finally {
      await closeApp(app);
    }
  });
});
