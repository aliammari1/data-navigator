import { expect, type Page, test } from "@playwright/test";
import { warmUpOnce } from "./_warmup";

/**
 * Data Tooling Journeys
 * Smoke coverage for the three data-tooling routes:
 *   - /dashboard/csv-parser   (Advanced CSV Parser: dropzone + parse controls)
 *   - /dashboard/data-browser (Data Browser: explorer grid / SQL surface)
 *   - /dashboard/report-studio (Executive Report Studio: report builder)
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
  await expect(page.locator("body")).not.toContainText(
    /404|not found|application error/i,
  );
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
  {
    name: "data-browser",
    path: "/dashboard/data-browser",
    anchor: /data browser|duckdb|search rows|select table/i,
  },
  {
    name: "report-studio",
    path: "/dashboard/report-studio",
    anchor: /executive report studio|powerpoint|report configuration|generate/i,
  },
] as const;

test.describe("Data tooling journeys", () => {
  // Independent tests (each re-navigates with its own page) run in parallel, so
  // a single failure isolates instead of skipping the rest of the group.
  test.setTimeout(60_000);

  // One-time, cross-worker warm-up of the three data-tooling routes so on-demand
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

  test("every data tooling route loads its primary surface", async ({
    page,
  }) => {
    for (const route of DATA_TOOL_ROUTES) {
      await gotoPage(page, route.path, route.anchor);
    }
  });

  test("CSV parser route shows the dropzone and parse controls", async ({
    page,
  }) => {
    await gotoPage(page, "/dashboard/csv-parser");

    await expectUsablePage(page, /advanced csv parser/i);

    // Primary input surface: the paste/drop textarea.
    await expect(
      page.getByPlaceholder(/paste delimited text/i),
    ).toBeVisible();

    // Parse controls: the Parse button plus the local-dataset entry point.
    await expect(page.getByRole("button", { name: /^Parse$/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /open local dataset/i }).first(),
    ).toBeVisible();

    // Parse settings (delimiter / header toggles) are part of the surface.
    await expect(page.locator("body")).toContainText(/parse settings|delimiter/i);
  });

  test("data browser route shows the explorer grid and SQL/search surface", async ({
    page,
  }) => {
    await gotoPage(page, "/dashboard/data-browser");

    await expectUsablePage(page, /data browser|duckdb/i);

    // The header heading is always present regardless of dataset state.
    await expect(
      page.getByRole("heading", { name: /data browser/i }),
    ).toBeVisible();

    // Row search is the always-rendered explorer control.
    await expect(page.getByPlaceholder(/search rows/i)).toBeVisible();

    // Upload entry point into the browser is exposed via its aria-label.
    await expect(
      page.getByRole("button", { name: /upload file/i }).first(),
    ).toBeVisible();

    // The explorer exposes an SQL surface (view mode tab when a dataset is
    // loaded, or the dataset picker / DuckDB init copy otherwise). Keep this
    // tolerant of the no-data state.
    await expect(page.locator("body")).toContainText(
      /sql|select table|duckdb|search rows/i,
    );
  });

  test("report studio route shows the report builder and export tabs", async ({
    page,
  }) => {
    await gotoPage(page, "/dashboard/report-studio");

    await expectUsablePage(page, /executive report studio/i);

    await expect(
      page.getByRole("heading", { name: /executive report studio/i }),
    ).toBeVisible();

    // Report builder export format tabs (PowerPoint / Word / PDF / Excel).
    await expect(
      page.getByRole("tab", { name: /powerpoint/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /word document/i }),
    ).toBeVisible();

    // Builder configuration + a generate action are part of the surface.
    await expect(page.locator("body")).toContainText(
      /report configuration|report date|generate/i,
    );
  });
});
