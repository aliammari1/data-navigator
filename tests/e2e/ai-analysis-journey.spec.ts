import { test, expect } from "@playwright/test";

/**
 * AI Analysis User Journey Tests
 * Covers: AI analysis pages, agent canvas, auto-analyst
 */

test.describe("AI Analysis Journey", () => {
  test("should load AI analysis page", async ({ page }) => {
    await page.goto("/dashboard/ai-analysis");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("body")).toBeVisible();
    await expect(page).toHaveURL(/.*ai-analysis.*/);

    // Look for AI-related content
    const aiElements = page.locator("text=/ai|analysis|insight|anomaly/i");
    const count = await aiElements.count();
    expect(count).toBeGreaterThan(0);
  });

  test("should load auto-analyst page", async ({ page }) => {
    await page.goto("/dashboard/auto-analyst");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("body")).toBeVisible();
    await expect(page).toHaveURL(/.*auto-analyst.*/);
  });

  test("should navigate between AI features", async ({ page }) => {
    // Start at AI Analysis
    await page.goto("/dashboard/ai-analysis");
    await page.waitForLoadState("networkidle");

    // Navigate to Agent Canvas
    await page.goto("/dashboard/agent-canvas");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/.*agent-canvas.*/);

    // Navigate to Data Formulator
    await page.goto("/dashboard/data-formulator");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/.*data-formulator.*/);
  });

  test("should access browser page", async ({ page }) => {
    await page.goto("/dashboard/browser");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("body")).toBeVisible();
    await expect(page).toHaveURL(/.*browser.*/);
  });
});
