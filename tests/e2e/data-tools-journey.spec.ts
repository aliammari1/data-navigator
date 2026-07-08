import { expect, type Page, test } from "@playwright/test";
import { warmUpOnce } from "./_warmup";

/**
 * Data Tooling Journeys
 * Smoke coverage for the data-tooling route:
 *   - /dashboard/csv-parser   (Advanced CSV Parser: dropzone + parse controls)
 *
 * Each route must load (no 404 / app-error) and expose its primary surface.
 * Anchors stay tolerant (case-insensitive, alternations) so they survive the
 * windowed desktop shell, French UI labels, and the no-data initial state.
 *
 * Mirrors the helpers/patterns in complete-user-journeys.spec.ts:
 *   - the dashboard-access localStorage seed so the shell renders ungated
 *   - the gotoPage(page, path, anchor) + expectUsablePage(page, anchor) pair
 */

async function expectUsablePage(page: Page, anchor: RegExp) {
  await expect(page.locator("body")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/404|not found|application error/i);
  await expect(page.locator("body")).toContainText(anchor);
}

async function gotoPage(page: Page, path: string, anchor?: RegExp) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(new RegExp(path.replace(/\//g, "\\/")));
  if (anchor) await expectUsablePage(page, anchor);
}

const DATA_TOOL_ROUTES = [
  {
    name: "csv-parser",
    path: "/dashboard/csv-parser",
    anchor: /advanced csv parser|parse settings|delimiter|paste delimited/i,
  },
] as const;

test.describe("Data tooling journeys", () => {
  // Independent tests (each re-navigates with its own page) run in parallel, so
  // a single failure isolates instead of skipping the rest of the group.
  test.setTimeout(60_000);

  // One-time, cross-worker warm-up of the data-tooling route so on-demand
  // `next dev` compilation is paid once (serially, on a single worker) instead
  // of as a parallel thundering herd inside the tests' first assertions.
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(150_000);
    await warmUpOnce(
      browser,
      "data-tools",
      DATA_TOOL_ROUTES.map((route) => route.path),
    );
  });

  test.beforeEach(async ({ page }) => {
    // Seed the dashboard-access flag so the shell renders without the
    // role/cache gate, matching the complete-user-journeys suite.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "data-navigator-dashboard-access-v1",
        JSON.stringify({ role: "owner", cacheMode: "balanced" }),
      );
    });
  });

  test("every data tooling route loads its primary surface", async ({ page }) => {
    for (const route of DATA_TOOL_ROUTES) {
      await gotoPage(page, route.path, route.anchor);
    }
  });

  test("CSV parser route shows the dropzone and parse controls", async ({ page }) => {
    await gotoPage(page, "/dashboard/csv-parser");

    await expectUsablePage(page, /advanced csv parser/i);

    // Primary input surface: the paste/drop textarea.
    await expect(page.getByPlaceholder(/paste delimited text/i)).toBeVisible();

    // Parse controls: the Parse button plus the local-dataset entry point.
    await expect(page.getByRole("button", { name: /^Parse$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /open local dataset/i }).first()).toBeVisible();

    // Parse settings (delimiter / header toggles) are part of the surface.
    await expect(page.locator("body")).toContainText(/parse settings|delimiter/i);
  });
});
