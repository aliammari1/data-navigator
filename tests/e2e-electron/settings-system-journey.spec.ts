// tests/e2e-electron/settings-system-journey.spec.ts
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

test.describe("System settings & diagnostics journey (electron-playwright-helpers)", () => {
  test("exercises settings navigation, audit log queries, and IPC configuration", async () => {
    test.setTimeout(240_000);

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
        expect(retrieved).toEqual(testSetting);
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
        expect(auditLogs).toBeDefined();
        expect(Array.isArray(auditLogs)).toBe(true);
      });

      // ── Step 5: Verify window state via eph window helper ──────────────────
      await test.step("verify active electron window matching", async () => {
        const matchingWindow = await eph.waitForWindowByTitle(app, /Data Navigator/i, {
          timeout: 15_000,
        });
        expect(matchingWindow).toBeDefined();
      });
    } finally {
      await closeApp(app);
    }
  });
});
