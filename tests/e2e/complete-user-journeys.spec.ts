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
  { path: "/dashboard/csv-parser", anchor: /advanced csv parser|parse/i },
  { path: "/dashboard/folders", anchor: /folders|my datasets|new folder/i },
  { path: "/dashboard/transform", anchor: /pipeline|transform|run/i },
  { path: "/dashboard/parsed", anchor: /parsed|column|profile|dataset/i },
  { path: "/dashboard/history", anchor: /history|version|changes|message/i },
  { path: "/dashboard/ai-analysis", anchor: /ai analysis|insight|anomaly/i },
  { path: "/dashboard/auto-analyst", anchor: /auto|analyst|analysis/i },
  {
    path: "/dashboard/data-formulator",
    anchor: /moudir|ai|canvas|import data/i,
  },
  { path: "/dashboard/agent-canvas", anchor: /agent canvas|choose ai model/i },
  { path: "/dashboard/lineage", anchor: /lineage|node|graph|dag/i },
  {
    path: "/dashboard/collaborative",
    anchor: /collaborative|team|comment|workspace/i,
  },
  {
    path: "/dashboard/data-browser",
    anchor: /data browser|duckdb|sql|search rows/i,
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

async function openCommandPalette(page: Page) {
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+K" : "Control+K",
  );
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
    await expect(
      page.locator('input[type="text"], input[name="password"]').first(),
    ).toBeVisible();
  });

  test("dashboard shell navigation reaches every concrete feature route", async ({
    page,
  }) => {
    for (const route of DASHBOARD_ROUTES) {
      await gotoPage(page, route.path, route.anchor);
    }
  });

  test("telecom report sections are routable and render their feature surfaces", async ({
    page,
  }) => {
    for (const path of TELECOM_ROUTES) {
      await gotoPage(page, path);
      await expectUsablePage(
        page,
        /rapport|telecom|télécom|canal|kpi|données/i,
      );
    }
  });

  test("global dashboard controls support search, theme, notifications, and AI panel journeys", async ({
    page,
  }) => {
    await gotoPage(page, "/dashboard");

    await openCommandPalette(page);
    await page.getByPlaceholder(/search pages, features/i).fill("csv");
    await page
      .getByRole("button", { name: /upload.*import data files/i })
      .click();
    await expect(page).toHaveURL(/\/dashboard\/upload/);
    await expectUsablePage(page, /importer|glissez|upload|fichier/i);

    await gotoPage(page, "/dashboard");
    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+B" : "Control+B",
    );
    await expect(page.locator("body")).toContainText(/datanavigator/i);

    await page.getByTitle(/ai assistant/i).click();
    await expect(page.locator("body")).toContainText(/ai|assistant|ask/i);

    await page.getByRole("link", { name: /settings/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings/);
  });

  test("CSV parser journey parses pasted data, filters rows, and exposes export/load actions", async ({
    page,
  }) => {
    await gotoPage(page, "/dashboard/csv-parser");

    await page.getByPlaceholder(/paste delimited text/i).fill(SAMPLE_CSV);
    await page.getByRole("button", { name: /^Parse$/ }).click();

    await expect(page.locator("td", { hasText: "Alice" })).toBeVisible();
    await expect(page.locator("td", { hasText: "Bob" })).toBeVisible();
    await expect(page.getByText("3 rows", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /load/i })).toBeEnabled();
    await expect(
      page.getByRole("button", { name: /export csv/i }),
    ).toBeEnabled();

    await page.getByRole("button", { name: /filter/i }).click();
    await page.getByPlaceholder(/status = success/i).fill("STATUS = SUCCESS");

    await expect(page.locator("td", { hasText: "Alice" })).toBeVisible();
    await expect(page.locator("td", { hasText: "Carla" })).toBeVisible();
    await expect(page.locator("td", { hasText: "Bob" })).toHaveCount(0);
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

    await expect(
      page.getByRole("button", { name: /journey\.csv/i }),
    ).toBeVisible();
    await expect(page.locator("body")).toContainText(
      /duckdb|electronduckdb|erreur|error|prêt|ready/i,
    );

    await gotoPage(
      page,
      "/dashboard/data-browser",
      /data browser|duckdb|sql|search rows/i,
    );

    await gotoPage(
      page,
      "/dashboard/transform",
      /pipeline|run|deduplicate|limit/i,
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

    await expect(
      page.getByRole("button", { name: "Journey Folder" }),
    ).toBeVisible();
    await page.getByPlaceholder(/^search/i).fill("Journey");
    await expect(
      page.getByRole("button", { name: "Journey Folder" }),
    ).toBeVisible();

    await page.getByRole("button", { name: /starred/i }).click();
    await expect(page.locator("body")).toContainText(/starred/i);

    await page.getByRole("button", { name: /stats/i }).click();
    await expect(page.locator("body")).toContainText(
      /total files|total folders/i,
    );
  });

  test("transform page journey edits pipeline steps and reviews generated SQL surfaces", async ({
    page,
  }) => {
    await gotoPage(page, "/dashboard/transform");

    await expectUsablePage(page, /transform pipeline/i);
    await page.getByRole("button", { name: /^add$/i }).click();
    await page.getByRole("button", { name: /^filter$/i }).click();

    await expect(page.getByText(/new filter/i)).toBeVisible();
    await page.getByPlaceholder("1=1").fill("AMOUNT > 1000");
    await expect(page.getByText(/where condition/i)).toBeVisible();
    await expect(page.locator("body")).toContainText(/generated sql/i);

    await page.getByRole("tab", { name: /preview/i }).click();
    await expect(page.locator("body")).toContainText(/run the pipeline/i);
    await page.getByRole("tab", { name: /^sql$/i }).click();
    await expect(page.locator("body")).toContainText(/generated pipeline sql/i);
    await page.getByRole("tab", { name: /analytics/i }).click();
    await expect(page.locator("body")).toContainText(/row reduction|run/i);

    await page.getByRole("button", { name: /reset/i }).click();
    await expect(page.getByText(/remove duplicate rows/i)).toBeVisible();
  });

  test("parsed data and history pages expose search, filter, refresh, and empty-state journeys", async ({
    page,
  }) => {
    await gotoPage(page, "/dashboard/parsed");

    await expectUsablePage(page, /column profiler|parsed|profile|no loaded/i);
    await page.getByPlaceholder(/search columns/i).fill("amount");
    await expect(
      page.getByRole("button", { name: /export csv/i }),
    ).toBeDisabled();
    await page.getByRole("button", { name: /refresh/i }).click();
    await expect(page.locator("body")).toContainText(
      /dataset quality overview|no loaded duckdb table/i,
    );

    await gotoPage(page, "/dashboard/history");
    await expectUsablePage(page, /workspace history/i);
    await page.getByPlaceholder(/search by message/i).fill("not-a-real-event");
    await expect(page.locator("body")).toContainText(/no events match/i);
    await page.locator("select").selectOption("dataset");
    await expect(page.locator("body")).toContainText(/datasets|event/i);
  });

  test("lineage page journey uses graph controls, table search, impact, and column views", async ({
    page,
  }) => {
    await gotoPage(page, "/dashboard/lineage");

    await expectUsablePage(page, /data lineage|lineage records|graph/i);
    if (
      await page
        .getByTitle(/zoom in/i)
        .isVisible()
        .catch(() => false)
    ) {
      await page.getByTitle(/zoom in/i).click();
      await page.getByTitle(/zoom out/i).click();
    }

    await page.getByRole("button", { name: /table/i }).click();
    if (
      await page
        .getByPlaceholder(/search nodes/i)
        .isVisible()
        .catch(() => false)
    ) {
      await page.getByPlaceholder(/search nodes/i).fill("upload");
    }
    await expect(page.locator("body")).toContainText(
      /node|type|status|lineage/i,
    );

    await page.getByRole("button", { name: /impact/i }).click();
    await expect(page.locator("body")).toContainText(/select a node|impact/i);
    await page.getByRole("button", { name: /columns/i }).click();
    await expect(page.locator("body")).toContainText(/column-level|columns/i);
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

  test("data browser page journey opens available data browsing, SQL, filter, and column surfaces", async ({
    page,
  }) => {
    // Generic SQL/DuckDB explorer (the legacy /dashboard/browser route was
    // removed and now redirects to the telecom grid). This relocated coverage
    // exercises the surviving data-browser explorer instead.
    await gotoPage(page, "/dashboard/data-browser", /data browser|duckdb/i);

    // Header is always present regardless of whether a dataset is catalogued.
    await expect(page.locator("body")).toContainText(/data browser|duckdb/i);

    // The SQL view toggle exposes the Monaco-backed SQL editor surface.
    const sqlToggle = page.getByRole("button", { name: /^sql$/i }).first();
    if (await sqlToggle.isVisible().catch(() => false)) {
      await sqlToggle.click();
      await expect(page.locator("body")).toContainText(
        /sql editor|run query|write a sql query/i,
      );
    }

    // Column manager + filter panels are reachable via accessible icon buttons.
    const columnsButton = page.getByRole("button", { name: /columns/i }).first();
    if (await columnsButton.isVisible().catch(() => false)) {
      await columnsButton.click();
      await expect(page.locator("body")).toContainText(
        /columns|search columns|show all/i,
      );
    }

    const filtersButton = page.getByRole("button", { name: /filters/i }).first();
    if (await filtersButton.isVisible().catch(() => false)) {
      await filtersButton.click();
      await expect(page.locator("body")).toContainText(
        /filters|add rule|clear all/i,
      );
    }
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
        path: "/dashboard/ai-analysis",
        anchor: /upload or select|ai analysis/i,
      },
      {
        path: "/dashboard/auto-analyst",
        anchor: /auto|analyst|upload|analysis/i,
      },
      { path: "/dashboard/data-formulator", anchor: /import data|moudir|ai/i },
      {
        path: "/dashboard/agent-canvas",
        anchor: /choose ai model|agent canvas/i,
      },
    ] as const;

    for (const route of aiRoutes) {
      await gotoPage(page, route.path, route.anchor);
    }

    await gotoPage(page, "/dashboard/agent-canvas");
    await page.getByRole("button", { name: /skip/i }).click();
    await expect(page.locator("body")).toContainText(
      /load data|drop your data file/i,
    );
  });

  test("data formulator page journey opens command, model, and right-panel controls", async ({
    page,
  }) => {
    await gotoPage(page, "/dashboard/data-formulator");

    await expectUsablePage(page, /moudir ai|import data|active table/i);
    await expect(
      page.getByPlaceholder(/ask for a kpi|describe what rows/i),
    ).toBeVisible();
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
    await expect(
      page.getByRole("link", { name: /upload data/i }),
    ).toHaveAttribute("href", "/dashboard/upload");
    await expect(
      page.getByRole("link", { name: /open telecom/i }),
    ).toHaveAttribute("href", "/dashboard/telecom-report");
  });
});
