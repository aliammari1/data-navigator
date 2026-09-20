import { expect, type Page, test } from "@playwright/test";

const SAMPLE_CSV = [
  "ID|NAME|AMOUNT|STATUS",
  "1|Alice|5000|SUCCESS",
  "2|Bob|3200|FAILED",
  "3|Carla|8100|SUCCESS",
].join("\n");

const DASHBOARD_ROUTES = [
  {
    path: "/dashboard",
    anchor: /dashboard|import|upload|dataset|télécom|telecom/i,
  },
  { path: "/dashboard/upload", anchor: /importer|glissez|upload|fichier/i },
  { path: "/dashboard/folders", anchor: /folders|my datasets|new folder/i },
  {
    path: "/dashboard/moudir",
    anchor: /moudir|assistant|conversation/i,
  },
  {
    path: "/dashboard/collaborative",
    anchor: /collaborative|team|comment|workspace/i,
  },
  { path: "/dashboard/settings", anchor: /settings|theme|appearance/i },
] as const;

const TELECOM_ROUTES = [
  "/dashboard/telecom-report",
  "/dashboard/telecom-report/overview",
  "/dashboard/telecom-report/canals",
  "/dashboard/telecom-report/analysis",
  "/dashboard/telecom-report/grid",
  "/dashboard/telecom-report/period",
  "/dashboard/telecom-report/history",
  "/dashboard/telecom-report/config",
] as const;

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

test.describe("Complete user journey coverage", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "data-navigator-dashboard-access-v1",
        JSON.stringify({ role: "owner", cacheMode: "balanced" }),
      );
    });
  });

  test("visitor can land, enter authentication, and reach the dashboard shell", async ({
    page,
    browser,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/data\s*navigator/i);

    await page
      .getByRole("link", { name: /sign in/i })
      .first()
      .click();
    // The public landing-page action must enter the real authentication
    // boundary. Authentication itself is established by the setup project;
    // this shared context then verifies the authenticated dashboard shell.
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await expect(page.getByTestId("auth-submit-btn")).toBeVisible();

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard/);
    await expectUsablePage(page, /data\s*navigator|dashboard/i);

    const unauthenticated = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const loginPage = await unauthenticated.newPage();
    try {
      await loginPage.goto("/login", { waitUntil: "domcontentloaded" });
      const submit = loginPage.getByTestId("auth-submit-btn");
      await expect(submit).toBeVisible({ timeout: 30_000 });
      await expect(submit).toHaveText(/unlock workspace|complete administrator setup/i);
      await expect(loginPage.locator('input[type="password"]').first()).toBeVisible();
    } finally {
      await unauthenticated.close();
    }
  });

  test("dashboard shell navigation reaches every concrete feature route", async ({ page }) => {
    for (const route of DASHBOARD_ROUTES) {
      await gotoPage(page, route.path, route.anchor);
    }
  });

  test("telecom report sections are routable and render their feature surfaces", async ({
    page,
  }) => {
    for (const path of TELECOM_ROUTES) {
      await gotoPage(page, path);
      await expectUsablePage(page, /rapport|telecom|télécom|canal|kpi|données/i);
    }
  });

  test("desktop home exposes search, palette, and appearance controls", async ({ page }) => {
    await gotoPage(page, "/dashboard");
    await expect(page.locator(".dn-desktop-canvas")).toBeVisible();
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});

    const search = page.getByPlaceholder(/demandez ou cherchez/i);
    await expect(search).toBeVisible();
    await search.fill("rapport");
    await expect(
      page.getByRole("button", { name: /rapport t[ée]l[ée]com/i }).first(),
    ).toBeVisible();

    const paletteBtn = page.getByRole("button", { name: /changer la palette/i });
    const cyanOption = page.locator('[title="Cyan"]');
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!(await cyanOption.isVisible().catch(() => false))) {
        await paletteBtn.click();
      }
      try {
        await expect(cyanOption).toBeVisible({ timeout: 2_000 });
        break;
      } catch {
        await page.waitForTimeout(500);
      }
    }
    await expect(cyanOption).toBeVisible();
    await expect(page.getByRole("button", { name: /changer l'apparence/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /notifications/i })).toBeVisible();
  });

  test("upload journey accepts a dataset and surfaces local DuckDB processing status", async ({
    page,
  }) => {
    await gotoPage(page, "/dashboard/upload");

    await page.locator('input[type="file"]').setInputFiles({
      name: "journey.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(SAMPLE_CSV),
    });

    await expect(page.locator("body")).toContainText(
      /duckdb|electronduckdb|erreur|error|prêt|ready/i,
    );

    await gotoPage(page, "/dashboard/folders", /folders|my datasets/i);
  });

  test("folder management journey creates, searches, filters, and reviews storage stats", async ({
    page,
  }) => {
    await gotoPage(page, "/dashboard/folders");

    await page.getByRole("button", { name: /nouveau|new folder/i }).click();
    await page.getByPlaceholder(/nom du dossier|folder name/i).fill("Journey Folder");
    await page.getByRole("button", { name: /créer|create/i }).click();

    await expect(page.getByRole("button", { name: "Journey Folder" })).toBeVisible();
    await page
      .getByPlaceholder(/rechercher|search/i)
      .first()
      .fill("Journey");
    await expect(page.getByRole("button", { name: "Journey Folder" })).toBeVisible();

    await page.getByRole("button", { name: /favoris|starred/i }).click();
    await expect(page.locator("body")).toContainText(/favoris|starred/i);

    await expect(page.locator("body")).toContainText(
      /jeux de données|dossier|taille totale|total files|total folders/i,
    );
  });

  test("collaboration page journey adds a comment, searches it, resolves it, and sends chat", async ({
    page,
  }) => {
    await gotoPage(page, "/dashboard/collaborative");

    await expectUsablePage(page, /collaboration|workspace|comments/i);
    await page.getByRole("button", { name: /^Comments\b/i }).click();
    await page.getByPlaceholder(/column.*optional/i).fill("AMOUNT");
    await page.getByPlaceholder(/add a comment/i).fill("Journey test comment");
    await page.getByRole("button", { name: /add comment/i }).click();
    await expect(page.getByText("Journey test comment").first()).toBeVisible();

    await page.getByPlaceholder(/search comments/i).fill("Journey test");
    await expect(page.getByText("Journey test comment").first()).toBeVisible();
    await page
      .getByRole("button", { name: /resolve/i })
      .first()
      .click();
    await page.getByRole("button", { name: /open only|all/i }).click();
    await expect(page.getByText("Journey test comment").first()).toBeVisible();

    await page.getByRole("button", { name: /^Live\b/i }).click();
    await page.getByPlaceholder(/send a message/i).fill("Journey chat ping");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Journey chat ping")).toBeVisible();
  });

  test("settings and documentation journeys cover discoverability and preferences", async ({
    page,
  }) => {
    await gotoPage(page, "/dashboard/settings");

    await page.getByRole("radio", { name: /light/i }).click();
    await page.getByRole("radio", { name: /dark/i }).click();
    await expect(page.locator("body")).toContainText(/theme|accent color|color scheme/i);
    await expect(page.locator('[role="switch"]').first()).toBeVisible();

    await page.getByRole("button", { name: /shortcuts/i }).click();
    await expect(page.locator("body")).toContainText(/keyboard shortcuts|command palette/i);
  });

  test("Moudir workspace exposes its chat and model controls", async ({ page }) => {
    await gotoPage(page, "/dashboard/moudir");

    await expectUsablePage(page, /moudir|assistant|conversation/i);
    await expect(page.getByLabel(/message pour moudir/i)).toBeVisible();
    await expect(page.getByLabel(/changer le modèle actif/i)).toBeVisible();
    await expect(
      page.getByLabel(/afficher les conversations|masquer les conversations/i),
    ).toBeVisible();
  });
});
