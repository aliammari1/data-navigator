// tests/e2e-electron/settings-system-journey.spec.ts
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

test.describe("System settings & diagnostics journey (electron-playwright-helpers)", () => {
  test("exercises settings navigation, audit log queries, and IPC configuration", async () => {
    const { app, window } = await launchApp({
      testName: "settings-system-journey",
    });

    try {
      // ── Step 1: Ensure authenticated session ──────────────────────────────
      await test.step("authenticate into application", async () => {
        await signUp(window, TEST_EMAIL, TEST_PASSWORD);
      });

      // ── Step 2: Test settings IPC roundtrip via eph ───────────────────────
      await test.step("verify settings IPC handlers using eph.ipcMainInvokeHandler", async () => {
        const testSetting = {
          telemetryEnabled: false,
          theme: "system",
          updatedAt: new Date().toISOString(),
        };

        await eph.ipcMainInvokeHandler(
          app,
          "settings:set",
          "system",
          "general_config",
          testSetting,
        );

        const retrieved = await eph.ipcMainInvokeHandler(
          app,
          "settings:get",
          "system",
          "general_config",
        );
        // settings:get returns a { value, updatedAt } envelope, not the raw
        // value; updatedAt is server-stamped, so only its shape is asserted.
        expect(retrieved).toMatchObject({ value: testSetting });
        expect((retrieved as { updatedAt: unknown }).updatedAt).toEqual(expect.any(String));
      });

      // ── Step 3: Visit /dashboard/settings overview ─────────────────────────
      await test.step("render settings screen", async () => {
        await gotoRoute(window, "/dashboard/settings");
        await expect(window).toHaveURL(/\/dashboard\/settings/);
        await expect(window.locator("body")).not.toContainText(/application error|404/i);

        await screenshot(window, "settings-main-view");
      });

      // ── Step 4: Verify audit logs IPC query ────────────────────────────────
      await test.step("query audit logs through analytics IPC", async () => {
        const auditLogs = await eph.ipcMainInvokeHandler(app, "analytics:getAuditLogs", 10);
        expect(auditLogs).toEqual(expect.any(Array));
      });

      // ── Step 5: Verify window state via eph window helper ──────────────────
      await test.step("verify active electron window matching", async () => {
        const matchingWindow = await eph.waitForWindowByTitle(app, /Data Navigator/i);
        expect(matchingWindow).toBeDefined();
        await expect(matchingWindow.title()).resolves.toMatch(/Data Navigator/i);
      });
    } finally {
      await closeApp(app);
    }
  });
});
