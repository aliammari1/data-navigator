// tests/e2e-electron/datasets-import-journey.spec.ts
import { expect, test } from "@playwright/test";
import {
  closeApp,
  eph,
  launchApp,
  screenshot,
  signUp,
  TEST_EMAIL,
  TEST_PASSWORD,
} from "./_harness";

async function gotoRoute(window: import("@playwright/test").Page, path: string): Promise<void> {
  if (window.url().endsWith(path)) return;

  try {
    await window.evaluate((target) => {
      window.location.href = target;
    }, path);
    await window.waitForURL(new RegExp(path.replace(/\//g, "\\/")), { timeout: 45_000 });
    return;
  } catch {
    // Fallback to direct navigation
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await window.goto(`http://localhost:3000${path}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      return;
    } catch (error) {
      lastError = error;
      await window.waitForTimeout(2_000);
    }
  }
  throw lastError;
}

test.describe("Datasets & File Import journey (electron-playwright-helpers)", () => {
  test("exercises file dialog stubbing, upload screen, and catalog folders", async () => {
    test.setTimeout(240_000);

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

        expect(dialogResponse).toBeDefined();
        expect(dialogResponse.canceled).toBe(false);
        expect(dialogResponse.filePaths).toContain(mockDatasetPath);
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
