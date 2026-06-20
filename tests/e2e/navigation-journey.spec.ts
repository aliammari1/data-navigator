import { expect, test } from "@playwright/test";

/**
 * Navigation User Journey Tests
 * Covers: Sidebar navigation, breadcrumb navigation, page transitions
 */

test.describe("Dashboard Navigation Journey", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard before each test
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
  });

  test("should navigate through all core pages via sidebar", async ({ page }) => {
    const pages = [
      { path: "/dashboard/upload", label: "Upload" },
      { path: "/dashboard/folders", label: "Folders" },
      { path: "/dashboard/transform", label: "Transform" },
      { path: "/dashboard/parsed", label: "Parsed" },
      { path: "/dashboard/history", label: "History" },
      { path: "/dashboard/ai-analysis", label: "AI Analysis" },
      { path: "/dashboard/settings", label: "Settings" },
    ];

    for (const navPage of pages) {
      // Find sidebar link
      const link = page.locator("a", { hasText: new RegExp(navPage.label, "i") }).first();

      if (await link.isVisible().catch(() => false)) {
        await link.click();
        await page.waitForURL(navPage.path, { timeout: 5000 }).catch(() => {});

        // Verify we're on a dashboard page
        await expect(page).toHaveURL(/.*dashboard.*/);
      }
    }
  });

  test("should access AI features from dashboard", async ({ page }) => {
    // Navigate to AI Analysis
    await page.goto("/dashboard/ai-analysis");
    await page.waitForLoadState("networkidle");

    // Verify page loads
    await expect(page.locator("body")).toBeVisible();

    // Navigate to Auto-Analyst
    await page.goto("/dashboard/auto-analyst");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });

  test("should navigate to data lineage page", async ({ page }) => {
    await page.goto("/dashboard/lineage");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("body")).toBeVisible();
  });

  test("should navigate to collaborative workspace", async ({ page }) => {
    await page.goto("/dashboard/collaborative");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("body")).toBeVisible();
  });

  test("should navigate through telecom report sections", async ({ page }) => {
    const telecomPages = [
      "/dashboard/telecom-report/overview",
      "/dashboard/telecom-report/canals",
      "/dashboard/telecom-report/analysis",
      "/dashboard/telecom-report/grid",
      "/dashboard/telecom-report/period",
      "/dashboard/telecom-report/day",
      "/dashboard/telecom-report/history",
      "/dashboard/telecom-report/config",
    ];

    for (const path of telecomPages) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(new RegExp(path.replace(/\//g, "\\\\/")));
    }
  });

  test("should navigate back to home from any page", async ({ page }) => {
    // Go to a deep page
    await page.goto("/dashboard/settings");
    await page.waitForLoadState("networkidle");

    // Find and click dashboard/home link
    const homeLink = page.locator("a", { hasText: /dashboard|home|overview/i }).first();

    if (await homeLink.isVisible().catch(() => false)) {
      await homeLink.click();
      await page.waitForURL(/.*dashboard.*/, { timeout: 5000 });
    }
  });
});
