// tests/e2e-electron/csv-import-journey.spec.ts
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  closeApp,
  gotoRoute,
  launchApp,
  screenshot,
  signUp,
  TEST_EMAIL,
  TEST_PASSWORD,
} from "./_harness";

// 300-row telecom daily-transactions export at the repo root. Imported through
// the real dropzone input so the full pipeline (parse → validate → DuckDB)
// runs in the app exactly as for a user drag-and-drop.
const CSV_PATH = path.resolve(process.cwd(), "DailyTransactions_20260301.csv");
const CSV_NAME = "DailyTransactions_20260301.csv";

test.describe("Daily transactions CSV import", () => {
  test("imports the telecom CSV via dropzone and shows it ready", async () => {
    const { app, window } = await launchApp({
      testName: "csv-import-journey",
    });

    try {
      // Reuses the shared logged-in profile (global-setup signs up once).
      await test.step("authenticate into application", async () => {
        await signUp(window, TEST_EMAIL, TEST_PASSWORD);
      });

      await test.step("open the data import workspace", async () => {
        await gotoRoute(window, "/dashboard/upload");
        await expect(window).toHaveURL(/\/dashboard\/upload/);
        await expect(window.locator("body")).not.toContainText(/application error|404/i);
      });

      await test.step("drop the daily transactions CSV", async () => {
        await window.locator('input[type="file"]').first().setInputFiles(CSV_PATH);
        await expect(window.getByText(CSV_NAME).first()).toBeVisible({ timeout: 30_000 });
        await screenshot(window, "csv-import-parsing");
      });

      await test.step("wait until DuckDB reports the file ready", async () => {
        await expect(window.getByText(/prêt/i).first()).toBeVisible({ timeout: 120_000 });
        await screenshot(window, "csv-import-ready");
      });
    } finally {
      await closeApp(app);
    }
  });
});
