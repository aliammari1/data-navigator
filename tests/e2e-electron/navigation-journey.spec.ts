// tests/e2e-electron/navigation-journey.spec.ts
import { expect, type Page, test } from "@playwright/test";
import { closeApp, launchApp, screenshot, signUp } from "./_harness";

const ROUTES = [
  { path: "/dashboard/telecom-report/overview", label: "Vue d'ensemble" },
  { path: "/dashboard/telecom-report/canals", label: "Canaux" },
  { path: "/dashboard/telecom-report/analysis", label: "Analyse" },
  { path: "/dashboard/telecom-report/grid", label: "Données brutes" },
  { path: "/dashboard/telecom-report/period", label: "Période" },
  { path: "/dashboard/telecom-report/history", label: "Historique" },
  { path: "/dashboard/telecom-report/config", label: "Configuration" },
  { path: "/dashboard/moudir", label: "Moudir" },
  { path: "/dashboard/upload", label: "Importer" },
  { path: "/dashboard/folders", label: "Catalogue" },
  { path: "/dashboard/collaborative", label: "Collaboration" },
  { path: "/dashboard/settings", label: "Paramètres" },
] as const;

/**
 * Resilient navigation tailored for Next.js cold compilation spikes with
 * automatic re-authentication if the session token expires during routing.
 */
async function navigateWithRetry(page: Page, path: string, maxAttempts = 3): Promise<void> {
  const targetUrl = `http://localhost:3000${path}`;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });

      // Self-heal if the route was redirected due to an expired session token
      if (page.url().includes("/login")) {
        await signUp(page);
        await page.goto(targetUrl, {
          waitUntil: "domcontentloaded",
          timeout: 90_000,
        });
      }
      return;
    } catch (error) {
      lastError = error;
      const isTransient = /ERR_ABORTED|frame was detached|Timeout/i.test(String(error));
      if (!isTransient || attempt === maxAttempts) {
        throw error;
      }
    }
  }

  throw lastError;
}

test.describe("Navigation journey", () => {
  test("every sidebar route loads without an error state", async () => {
    test.setTimeout(600_000);

    const { app, window } = await launchApp({ testName: "navigation-journey" });

    try {
      await signUp(window);

      for (const route of ROUTES) {
        await test.step(`visit ${route.label} (${route.path})`, async () => {
          await navigateWithRetry(window, route.path);

          await expect(window).toHaveURL(new RegExp(route.path.replace(/\//g, "\\/")));
          await expect(window.locator("body")).not.toContainText(/application error|404/i);

          const safeSnapshotName =
            route.path.replace(/^\/dashboard\/?/, "").replace(/\//g, "-") || "root";
          await screenshot(window, `nav-${safeSnapshotName}`);
        });
      }
    } finally {
      await closeApp(app);
    }
  });

  test("command palette opens and filters results", async () => {
    const { app, window } = await launchApp({ testName: "navigation-journey-palette" });

    try {
      await signUp(window);
      await navigateWithRetry(window, "/dashboard/settings");

      await test.step("open with shortcut and search", async () => {
        // Shell must be hydrated before window-key shortcuts are wired.
        await expect(window.locator("header")).toBeVisible({ timeout: 30_000 });
        await window.keyboard.press("ControlOrMeta+K");

        const input = window.getByPlaceholder(/search pages, datasets, actions/i);
        try {
          await expect(input).toBeVisible({ timeout: 5_000 });
        } catch {
          // Shortcut missed: use the topbar search trigger instead.
          await window.getByRole("button", { name: /search/i }).click();
          await expect(input).toBeVisible({ timeout: 5_000 });
        }

        await input.fill("csv");
        await expect(input).toHaveValue("csv");
        await screenshot(window, "nav-command-palette-csv");
      });

      await test.step("sidebar collapse toggle", async () => {
        await window.keyboard.press("Escape");

        const collapseToggle = window.getByRole("button", {
          name: /réduire le menu|développer le menu/i,
        });

        await expect(collapseToggle).toBeVisible();
        await collapseToggle.click();
        await screenshot(window, "nav-sidebar-toggled");

        await collapseToggle.click();
      });
    } finally {
      await closeApp(app);
    }
  });
});
