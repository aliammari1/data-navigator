// tests/e2e-electron/features-helpers.spec.ts
import { expect, test } from "@playwright/test";
import { closeApp, eph, launchApp } from "./_harness";

test.describe("Native features & IPC integration (electron-playwright-helpers)", () => {
  test("stubs native file dialogs and exercises settings & auth IPC handlers", async () => {
    const { app } = await launchApp({
      testName: "features-helpers",
    });

    try {
      // ── Step 1: Stub showOpenDialog using eph.stubDialog ────────────────────
      await test.step("stub native open dialog and invoke fs:openDialog IPC", async () => {
        const mockFilePath = "/tmp/mock-data-navigator-dataset.csv";

        await eph.stubDialog(app, "showOpenDialog", {
          canceled: false,
          filePaths: [mockFilePath],
        });

        const dialogResult = (await eph.ipcMainInvokeHandler(app, "fs:openDialog", {
          title: "Select Dataset",
          properties: ["openFile"],
          filters: [{ name: "Data", extensions: ["csv", "json", "parquet"] }],
        })) as { canceled: boolean; filePaths: string[] };

        expect(dialogResult).toMatchObject({
          canceled: false,
          filePaths: [mockFilePath],
        });
      });

      // ── Step 2: Stub showSaveDialog using eph.stubDialog ────────────────────
      await test.step("stub native save dialog and invoke fs:saveDialog IPC", async () => {
        const mockSavePath = "/tmp/mock-exported-report.parquet";

        await eph.stubDialog(app, "showSaveDialog", {
          canceled: false,
          filePath: mockSavePath,
        });

        const saveResult = (await eph.ipcMainInvokeHandler(app, "fs:saveDialog", {
          title: "Export Dataset",
          defaultPath: "export.parquet",
        })) as { canceled: boolean; filePath?: string };

        expect(saveResult).toMatchObject({
          canceled: false,
          filePath: mockSavePath,
        });
      });

      // ── Step 3: Exercise Settings IPC handlers roundtrip ───────────────────
      await test.step("verify settings get, set, delete roundtrip", async () => {
        const namespace = "e2e_tests";
        const key = "playwright_helper_feature";
        const testValue = { enabled: true, mode: "real_electron", timestamp: Date.now() };

        await eph.ipcMainInvokeHandler(app, "settings:set", namespace, key, testValue);

        const fetched = (await eph.ipcMainInvokeHandler(app, "settings:get", namespace, key)) as {
          value: typeof testValue;
          updatedAt: string;
        };
        expect(fetched?.value).toEqual(testValue);

        await eph.ipcMainInvokeHandler(app, "settings:delete", namespace, key);

        const fetchedAfterDelete = (await eph.ipcMainInvokeHandler(
          app,
          "settings:get",
          namespace,
          key,
        )) as { value: unknown } | null;
        expect(fetchedAfterDelete?.value).toBeNull();
      });

      // ── Step 4: Exercise Auth IPC queries ──────────────────────────────────
      await test.step("verify auth status IPC handlers", async () => {
        const isLocked = await eph.ipcMainInvokeHandler(app, "auth:isLocked");
        expect(isLocked).toEqual(expect.any(Boolean));

        const hasOwner = await eph.ipcMainInvokeHandler(app, "auth:hasOwner");
        expect(hasOwner).toEqual(expect.any(Boolean));
      });

      // ── Step 5: Verify main window page title using window helper ──────────
      await test.step("locate window using waitForWindowByTitle", async () => {
        const page = await eph.waitForWindowByTitle(app, /Data Navigator/i);
        expect(page).toBeDefined();
        await expect(page.title()).resolves.toMatch(/Data Navigator/i);
      });
    } finally {
      await closeApp(app);
    }
  });
});
