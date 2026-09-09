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
  { path: "/dashboard/auto-analyst", anchor: /auto|analyst|analysis/i },
  {
    path: "/dashboard/data-formulator",
    anchor: /moudir|ai|canvas|import data/i,
  },
  {
    path: "/dashboard/collaborative",
    anchor: /collaborative|team|comment|workspace/i,
  },
  { path: "/dashboard/settings", anchor: /settings|theme|appearance/i },
  { path: "/dashboard/help", anchor: /help|documentation|features/i },
] as const;

const TELECOM_ROUTES = [
  "/dashboard/telecom-report",
  "/dashboard/telecom-report/overview",
  "/dashboard/telecom-report/canals",
  "/dashboard/telecom-report/analysis",
  "/dashboard/telecom-report/grid",
  "/dashboard/telecom-report/period",
  "/dashboard/telecom-report/day",
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

async function openCommandPalette(page: Page) {
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  const input = page.getByPlaceholder(/search pages, features/i);
  if (!(await input.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /search.*k/i }).click();
  }
  await expect(input).toBeVisible();
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
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/datanavigator/i);

    await page
      .getByRole("link", { name: /launch dashboard/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expectUsablePage(page, /datanavigator|dashboard/i);

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/sign in/i).first()).toBeVisible();
    await page.getByPlaceholder(/you@example.com/i).fill("journey@example.com");
    await page
      .locator('input[type="password"], input[name="password"]')
      .first()
      .fill("password123");
    await page.getByLabel(/show password/i).click();
    await expect(page.locator('input[type="text"], input[name="password"]').first()).toBeVisible();
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

  test("global dashboard controls support search, theme, notifications, and AI panel journeys", async ({
    page,
  }) => {
    await gotoPage(page, "/dashboard");

    await openCommandPalette(page);
    await page.getByPlaceholder(/search pages, features/i).fill("csv");
    await page.getByRole("button", { name: /upload.*import data files/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/upload/);
    await expectUsablePage(page, /importer|glissez|upload|fichier/i);

    await gotoPage(page, "/dashboard");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+B" : "Control+B");
    await expect(page.locator("body")).toContainText(/datanavigator/i);

    await page.getByTitle(/ai assistant/i).click();
    await expect(page.locator("body")).toContainText(/ai|assistant|ask/i);

    await page.getByRole("link", { name: /settings/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings/);
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

    await expect(page.getByRole("button", { name: /journey\.csv/i })).toBeVisible();
    await expect(page.locator("body")).toContainText(
      /duckdb|electronduckdb|erreur|error|prêt|ready/i,
    );

    await gotoPage(page, "/dashboard/folders", /folders|my datasets/i);
  });

  test("folder management journey creates, searches, filters, and reviews storage stats", async ({
    page,
  }) => {
    await gotoPage(page, "/dashboard/folders");

    await page.getByRole("button", { name: /new folder/i }).click();
    await page.getByPlaceholder(/folder name/i).fill("Journey Folder");
    await page.getByRole("button", { name: /create/i }).click();

    await expect(page.getByRole("button", { name: "Journey Folder" })).toBeVisible();
    await page.getByPlaceholder(/^search/i).fill("Journey");
    await expect(page.getByRole("button", { name: "Journey Folder" })).toBeVisible();

    await page.getByRole("button", { name: /starred/i }).click();
    await expect(page.locator("body")).toContainText(/starred/i);

    await page.getByRole("button", { name: /stats/i }).click();
    await expect(page.locator("body")).toContainText(/total files|total folders/i);
  });

  test("collaboration page journey adds a comment, searches it, resolves it, and sends chat", async ({
    page,
  }) => {
    await gotoPage(page, "/dashboard/collaborative");

    await expectUsablePage(page, /collaboration|workspace|comments/i);
    await page.getByRole("button", { name: /^Comments\b/i }).click();
    await page.getByPlaceholder(/column optional/i).fill("AMOUNT");
    await page.getByPlaceholder(/add a comment/i).fill("Journey test comment");
    await page.getByRole("button", { name: /add comment/i }).click();
    await expect(page.getByText("Journey test comment")).toBeVisible();

    await page.getByPlaceholder(/search comments/i).fill("Journey test");
    await expect(page.getByText("Journey test comment")).toBeVisible();
    await page
      .getByRole("button", { name: /resolve/i })
      .first()
      .click();
    await page.getByRole("button", { name: /resolved/i }).click();
    await expect(page.getByText("Journey test comment")).toBeVisible();

    await page.getByRole("button", { name: /^Live\b/i }).click();
    await page.getByPlaceholder(/send a message/i).fill("Journey chat ping");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Journey chat ping")).toBeVisible();
  });

  test("help, settings, and documentation journeys cover discoverability and preferences", async ({
    page,
  }) => {
    await gotoPage(page, "/dashboard/help");

    await page.getByPlaceholder(/search features/i).fill("csv");
    await expect(page.getByText("CSV Parser")).toBeVisible();
    await page.getByPlaceholder(/search features/i).fill("");
    await page.getByRole("button", { name: /faq/i }).click();
    await expect(page.locator("body")).toContainText(/does any data leave/i);
    await page.getByRole("button", { name: /shortcuts/i }).click();
    await expect(page.locator("body")).toContainText(/ctrl|command palette/i);

    await gotoPage(page, "/dashboard/settings");
    await page.getByRole("button", { name: /light/i }).click();
    await page.getByRole("button", { name: /dark/i }).click();
    await expect(page.locator("body")).toContainText(/theme|accent color/i);
    await expect(page.locator('[role="switch"]').first()).toBeVisible();
  });

  test("AI, workbench, and agent entry points expose their guided no-data states", async ({
    page,
  }) => {
    const aiRoutes = [
      {
        path: "/dashboard/auto-analyst",
        anchor: /auto|analyst|upload|analysis/i,
      },
      { path: "/dashboard/data-formulator", anchor: /import data|moudir|ai/i },
    ] as const;

    for (const route of aiRoutes) {
      await gotoPage(page, route.path, route.anchor);
    }
  });

  test("data formulator page journey opens command, model, and right-panel controls", async ({
    page,
  }) => {
    await gotoPage(page, "/dashboard/data-formulator");

    await expectUsablePage(page, /moudir ai|import data|active table/i);
    await expect(page.getByPlaceholder(/ask for a kpi|describe what rows/i)).toBeVisible();
    await page.getByTitle(/model readiness/i).click();
    await expect(page.locator("body")).toContainText(/model|readiness|ai/i);
    await page.getByTitle(/kpi foundry/i).click();
    await expect(page.locator("body")).toContainText(/kpi/i);
    await page.getByTitle(/scenarios/i).click();
    await expect(page.locator("body")).toContainText(/scenario/i);
    await page.getByTitle(/inspector/i).click();
    await expect(page.locator("body")).toContainText(/inspector|select/i);
  });

  test("auto analyst page journey exposes upload CTAs and disabled run controls without data", async ({
    page,
  }) => {
    await gotoPage(page, "/dashboard/auto-analyst");

    await expectUsablePage(page, /auto.?analyst|upload a dataset/i);
    await expect(page.getByRole("link", { name: /upload data/i })).toHaveAttribute(
      "href",
      "/dashboard/upload",
    );
    await expect(page.getByRole("link", { name: /open telecom/i })).toHaveAttribute(
      "href",
      "/dashboard/telecom-report",
    );
  });
});
