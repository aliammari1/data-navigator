import { expect, test } from "@playwright/test";

/**
 * Data Import and Processing User Journey Tests
 * Covers: Upload page, file handling, parsed data view
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

  test("should navigate from upload to parsed data", async ({ page }) => {
    // Upload page should be loaded
    await expect(page).toHaveURL(/.*upload.*/);

    // Navigate to parsed data page
    await page.goto("/dashboard/parsed");
    await page.waitForLoadState("networkidle");

    // Verify parsed data page loads
    await expect(page.locator("body")).toBeVisible();
    await expect(page).toHaveURL(/.*parsed.*/);
  });

  test("should navigate from upload to folders", async ({ page }) => {
    await expect(page).toHaveURL(/.*upload.*/);

    // Navigate to folders
    await page.goto("/dashboard/folders");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("body")).toBeVisible();
    await expect(page).toHaveURL(/.*folders.*/);
  });

  test("should navigate through data processing pipeline", async ({ page }) => {
    // Step 1: Upload
    await page.goto("/dashboard/upload");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/.*upload.*/);

    // Step 2: Transform
    await page.goto("/dashboard/transform");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/.*transform.*/);

    // Step 3: Parsed Data
    await page.goto("/dashboard/parsed");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/.*parsed.*/);

    // Step 4: History
    await page.goto("/dashboard/history");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/.*history.*/);
  });
});
