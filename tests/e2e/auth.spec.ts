import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Authentication", () => {
  test("should display the current local authentication screen", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/sign in/i);

    const submit = page.getByTestId("auth-submit-btn");
    await expect(submit).toBeVisible({ timeout: 30_000 });
    await expect(submit).toHaveText(/unlock workspace|complete administrator setup/i);
  });

  test("should protect the dashboard when no session cookie is present", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login\?reason=expired/, { timeout: 15_000 });
  });
});
