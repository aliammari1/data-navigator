import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Authentication User Journey Tests
 *
 * The setup project provisions the local owner for authenticated journeys.
 * These tests deliberately reset browser storage so they exercise the public
 * login boundary instead of inheriting the shared authenticated session.
 */
test.describe("Authentication Journey", () => {
  test("should display the current local authentication screen", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    const submit = page.getByTestId("auth-submit-btn");
    await expect(submit).toBeVisible({ timeout: 30_000 });
    await expect(submit).toHaveText(/unlock workspace|complete administrator setup/i);
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test("should remain on login when required credentials are empty", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    await page.getByTestId("auth-submit-btn").click();
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
  });

  test("should protect the dashboard without a session cookie", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login\?reason=expired/, { timeout: 15_000 });
  });
});
