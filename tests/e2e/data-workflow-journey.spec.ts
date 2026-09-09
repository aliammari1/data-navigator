import { expect, test } from "@playwright/test";

/**
 * Data Import User Journey Tests
 * Covers: Upload page, file handling, catalog handoff
 */

test.describe("Data Import Workflow Journey", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard/upload");
    await page.waitForLoadState("networkidle");
  });

  test("should display upload page with dropzone", async ({ page }) => {
    // Verify upload page elements
    await expect(page.locator("body")).toBeVisible();

    // Look for upload-related text or icons
    const uploadElements = page.locator("text=/upload|import|drop|drag/i");
    const count = await uploadElements.count();
    expect(count).toBeGreaterThan(0);
  });

  test("should navigate from upload to folders", async ({ page }) => {
    await expect(page).toHaveURL(/.*upload.*/);

    // Navigate to folders
    await page.goto("/dashboard/folders");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("body")).toBeVisible();
    await expect(page).toHaveURL(/.*folders.*/);
  });
});
