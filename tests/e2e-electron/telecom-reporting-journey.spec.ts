// tests/e2e-electron/telecom-reporting-journey.spec.ts
import { expect, test } from "@playwright/test";
import {
  closeApp,
  eph,
  launchApp,
  screenshot,
  signUp,
  TEST_EMAIL,
  TEST_PASSWORD,
} from "./_harness";

async function gotoRoute(window: import("@playwright/test").Page, path: string): Promise<void> {
  if (window.url().endsWith(path)) return;

  try {
    await window.evaluate((target) => {
      window.location.href = target;
    }, path);
    await window.waitForURL(new RegExp(path.replace(/\//g, "\\/")), { timeout: 45_000 });
    return;
  } catch {
    // Fallback to direct navigation
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await window.goto(`http://localhost:3000${path}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      return;
    } catch (error) {
      lastError = error;
      await window.waitForTimeout(2_000);
    }
  }
  throw lastError;
}

test.describe("Telecom reporting & analytical views journey", () => {
  test("traverses telecom report views, metrics, and data tables", async () => {
    test.setTimeout(300_000);

    const { app, window } = await launchApp({
      testName: "telecom-reporting-journey",
    });

    try {
      // ── Step 1: Ensure authenticated session ──────────────────────────────
      await test.step("authenticate into application", async () => {
        await signUp(window, TEST_EMAIL, TEST_PASSWORD);
      });

      // ── Step 2: Overview tab ──────────────────────────────────────────────
      await test.step("view telecom overview report", async () => {
        await gotoRoute(window, "/dashboard/telecom-report/overview");
        await expect(window).toHaveURL(/\/dashboard\/telecom-report\/overview/);
        await expect(window.locator("body")).not.toContainText(/application error|404/i);

        await screenshot(window, "telecom-report-overview");
      });

      // ── Step 3: Canals tab ────────────────────────────────────────────────
      await test.step("view canals distribution report", async () => {
        await gotoRoute(window, "/dashboard/telecom-report/canals");
        await expect(window).toHaveURL(/\/dashboard\/telecom-report\/canals/);
        await expect(window.locator("body")).not.toContainText(/application error|404/i);

        await screenshot(window, "telecom-report-canals");
      });

      // ── Step 4: Analysis tab ──────────────────────────────────────────────
      await test.step("view detailed telecom analysis", async () => {
        await gotoRoute(window, "/dashboard/telecom-report/analysis");
        await expect(window).toHaveURL(/\/dashboard\/telecom-report\/analysis/);
        await expect(window.locator("body")).not.toContainText(/application error|404/i);

        await screenshot(window, "telecom-report-analysis");
      });

      // ── Step 5: Data Grid tab ─────────────────────────────────────────────
      await test.step("view raw dataset grid", async () => {
        await gotoRoute(window, "/dashboard/telecom-report/grid");
        await expect(window).toHaveURL(/\/dashboard\/telecom-report\/grid/);
        await expect(window.locator("body")).not.toContainText(/application error|404/i);

        await screenshot(window, "telecom-report-grid");
      });

      // ── Step 6: Verify window presence via eph helper ─────────────────────
      await test.step("verify window state using electron-playwright-helpers", async () => {
        const matchingWindows = await eph.getWindowByTitle(app, /Data Navigator/i, { all: true });
        expect(matchingWindows.length).toBeGreaterThan(0);
      });
    } finally {
      await closeApp(app);
    }
  });
});
