// tests/e2e-electron/datasets-import-journey.spec.ts
import { expect, test } from "@playwright/test";
import {
  closeApp,
  eph,
  gotoRoute,
  launchApp,
  screenshot,
  signUp,
  TEST_EMAIL,
  TEST_PASSWORD,
} from "./_harness";

test.describe("Datasets & File Import journey (electron-playwright-helpers)", () => {
  test("exercises file dialog stubbing, upload screen, and catalog folders", async () => {
    const { app, window } = await launchApp({
      testName: "datasets-import-journey",
    });

    try {
      // ── Step 1: Ensure authenticated session ──────────────────────────────
      await test.step("authenticate into application", async () => {
        await signUp(window, TEST_EMAIL, TEST_PASSWORD);
      });

      // ── Step 2: Test native open dialog stubbing via eph ───────────────────
      await test.step("stub open dialog for dataset import via eph", async () => {
        const mockDatasetPath = "/tmp/sample-subscribers-data.csv";

        // Pre-configure dialog stub before trigger
        await eph.stubDialog(app, "showOpenDialog", {
          canceled: false,
          filePaths: [mockDatasetPath],
        });

        // Trigger native dialog through Electron's fs IPC bridge
        const dialogResponse = (await eph.ipcMainInvokeHandler(app, "fs:openDialog", {
          title: "Select Dataset to Import",
          properties: ["openFile"],
          filters: [{ name: "Datasets", extensions: ["csv", "json", "parquet", "arrow"] }],
        })) as { canceled: boolean; filePaths: string[] };

        expect(dialogResponse).toMatchObject({
          canceled: false,
          filePaths: [mockDatasetPath],
        });
      });

      // ── Step 3: Visit /dashboard/upload screen ─────────────────────────────
      await test.step("navigate to dataset upload workspace", async () => {
        await gotoRoute(window, "/dashboard/upload");
        await expect(window).toHaveURL(/\/dashboard\/upload/);
        await expect(window.locator("body")).not.toContainText(/application error|404/i);

        await screenshot(window, "dataset-upload-screen");
      });

      // ── Step 4: Visit /dashboard/folders catalog ───────────────────────────
      await test.step("navigate to dataset catalog and folders", async () => {
        await gotoRoute(window, "/dashboard/folders");
        await expect(window).toHaveURL(/\/dashboard\/folders/);
        await expect(window.locator("body")).not.toContainText(/application error|404/i);

        await screenshot(window, "dataset-folders-catalog");
      });
    } finally {
      await closeApp(app);
    }
  });
});
