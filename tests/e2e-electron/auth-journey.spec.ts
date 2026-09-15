// tests/e2e-electron/auth-journey.spec.ts
import { existsSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import {
  closeApp,
  launchApp,
  SHARED_PROFILE_DIR,
  screenshot,
  TEST_EMAIL,
  TEST_PASSWORD,
} from "./_harness";

const ADMIN_NAME = "Master Administrator";

test.describe("Authentication & Security Lifecycle", () => {
  test.beforeAll(() => {
    // Reset auth tables so OsLogin boots cleanly into first-run setup mode
    const dbPath = path.join(SHARED_PROFILE_DIR, "databases", "auth.db");
    if (existsSync(dbPath)) {
      try {
        const db = new Database(dbPath);
        db.exec("DELETE FROM session; DELETE FROM account; DELETE FROM user;");
        db.close();
      } catch {
        // Database not yet created
      }
    }
  });

  test("exercises signup, lock, unlock, and signout deterministically", async () => {
    test.setTimeout(240_000);

    const { app, window } = await launchApp({
      testName: "auth-security-lifecycle",
      userDataDir: SHARED_PROFILE_DIR,
    });

    try {
      // ── Step 1: Initial Admin Setup ────────────────────────────────────────
      await test.step("complete initial admin setup", async () => {
        const submitBtn = window.getByTestId("auth-submit-btn");
        await expect(submitBtn).toBeVisible({ timeout: 30_000 });

        await window.getByPlaceholder("Administrator (optional)").fill(ADMIN_NAME);
        await window.getByPlaceholder("admin@example.com").fill(TEST_EMAIL);
        await window.getByPlaceholder(/^at least 8 characters/i).fill(TEST_PASSWORD);
        await window.getByPlaceholder(/re-enter.*password/i).fill(TEST_PASSWORD);

        await submitBtn.click();

        await expect(window).toHaveURL(/\/dashboard/, { timeout: 30_000 });
        await screenshot(window, "auth-01-dashboard");
      });

      // ── Step 2: Lock Workspace via Global Shortcut ─────────────────────────
      await test.step("lock workspace with global shortcut", async () => {
        await window.focus();
        await window.keyboard.press("ControlOrMeta+l");

        await expect(window).toHaveURL(/\/login\?reason=locked/, { timeout: 15_000 });
        await expect(
          window.getByText(/workspace locked\. enter your master password/i),
        ).toBeVisible();

        await screenshot(window, "auth-02-locked");
      });

      // ── Step 3: Unlock Workspace with Master Password ───────────────────────
      await test.step("unlock workspace with master password", async () => {
        const passwordInput = window.getByPlaceholder(/enter.*password/i);
        const submitBtn = window.getByTestId("auth-submit-btn");

        // Verify invalid password error state
        await passwordInput.fill("WrongPassword999!");
        await submitBtn.click();
        await expect(window.getByTestId("auth-error-message")).toBeVisible({ timeout: 10_000 });

        // Submit correct master password
        await passwordInput.fill(TEST_PASSWORD);
        await submitBtn.click();

        await expect(window).toHaveURL(/\/dashboard/, { timeout: 20_000 });
        await screenshot(window, "auth-03-unlocked");
      });

      // ── Step 4: Sign Out via Account Panel ─────────────────────────────────
      await test.step("sign out terminates session", async () => {
        await window.goto("http://localhost:3000/dashboard/settings?tab=account", {
          waitUntil: "domcontentloaded",
        });

        const signOutBtn = window.getByTestId("account-signout-btn");
        await expect(signOutBtn).toBeVisible({ timeout: 15_000 });
        await signOutBtn.click();

        await expect(window).toHaveURL(/\/login/, { timeout: 15_000 });
        await screenshot(window, "auth-04-logged-out");
      });
    } finally {
      await closeApp(app);
    }
  });
});
