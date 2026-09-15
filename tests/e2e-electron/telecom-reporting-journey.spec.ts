// tests/e2e-electron/telecom-reporting-journey.spec.ts
import { expect, test } from "@playwright/test";
import {
  closeApp,
  eph,
  gotoRoute,
  launchApp,
  screenshot,
  signUp,
  TEST_EMAIL,
  TEST_PASSWORD,
} from "./_harness";

test.describe("Telecom reporting & analytical views journey", () => {
  test("traverses telecom report views, metrics, and data tables", async () => {
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
        expect(matchingWindows).not.toHaveLength(0);
      });
    } finally {
      await closeApp(app);
    }
  });
});
