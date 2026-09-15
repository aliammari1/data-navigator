// tests/e2e-electron/collaboration-journey.spec.ts
import { expect, test } from "@playwright/test";
import { closeApp, eph, gotoRoute, launchApp, screenshot, signUp } from "./_harness";

interface CollabHubStatus {
  running: boolean;
  port?: number;
  ip?: string;
  activeRooms?: number;
  activePeers?: number;
  serviceName?: string;
}

interface DiscoveredHub {
  name: string;
  host: string;
  port: number;
  addresses: string[];
}

test.describe("Collaboration & LAN Hub journey (electron-playwright-helpers)", () => {
  test("manages collaboration hub lifecycle and inspects window via eph helpers", async () => {
    const { app, window } = await launchApp({
      testName: "collaboration-hub-lifecycle",
    });

    // Authenticate / unlock workspace before any assertions
    await signUp(window);

    try {
      // ── Step 1: Verify main window via electron-playwright-helpers ──────────
      await test.step("find and verify main window using getWindowByTitle", async () => {
        const mainWin = await eph.waitForWindowByTitle(app, /Data Navigator/i);
        expect(mainWin).toBeDefined();
        await expect(mainWin.title()).resolves.toMatch(/Data Navigator/i);
      });

      // ── Step 2: Retrieve collaboration host secret via IPC invoke handler ──
      await test.step("retrieve host secret via ipcMainInvokeHandler", async () => {
        const hostSecret = (await eph.ipcMainInvokeHandler(
          app,
          "collabHub:getHostSecret",
        )) as string;

        expect(typeof hostSecret).toBe("string");
        expect(hostSecret.length).toBeGreaterThan(0);
      });

      // ── Step 3: Check initial collab hub status ───────────────────────────
      await test.step("inspect initial collab hub status", async () => {
        const status = (await eph.ipcMainInvokeHandler(app, "collabHub:status")) as CollabHubStatus;

        expect(status).toBeDefined();
        expect(typeof status.running).toBe("boolean");
      });

      // ── Step 4: Start collaboration hub on an ephemeral port ───────────────
      await test.step("start collaboration hub service", async () => {
        const startResult = (await eph.ipcMainInvokeHandler(app, "collabHub:start", {
          port: 14567,
          name: "Test Collab Node",
        })) as CollabHubStatus;

        expect(startResult).toMatchObject({
          running: true,
          port: 14567,
        });
      });

      // ── Step 5: Verify status confirms active hub via native expect.poll ────
      await test.step("verify running hub status via expect.poll", async () => {
        await expect
          .poll(async () => {
            const status = (await eph.ipcMainInvokeHandler(
              app,
              "collabHub:status",
            )) as CollabHubStatus;
            return status?.running;
          })
          .toBe(true);
      });

      // ── Step 6: Query discovery list ──────────────────────────────────────
      await test.step("query discovered peers list", async () => {
        const discovered = (await eph.ipcMainInvokeHandler(
          app,
          "collabHub:getDiscovered",
        )) as DiscoveredHub[];

        expect(Array.isArray(discovered)).toBe(true);
      });

      // ── Step 7: Cleanly stop collaboration hub ────────────────────────────
      await test.step("stop collaboration hub", async () => {
        const stopResult = (await eph.ipcMainInvokeHandler(app, "collabHub:stop")) as {
          stopped: boolean;
        };
        expect(stopResult).toEqual({ stopped: true });

        const statusAfterStop = (await eph.ipcMainInvokeHandler(
          app,
          "collabHub:status",
        )) as CollabHubStatus;
        expect(statusAfterStop.running).toBe(false);
      });

      // ── Step 8: Visit /dashboard/collaborative UI screen ──────────────────
      await test.step("render collaboration dashboard UI", async () => {
        await gotoRoute(window, "/dashboard/collaborative");

        await expect(window).toHaveURL(/\/dashboard\/collaborative/);
        await expect(window.locator("body")).not.toContainText(/application error|404/i);

        await screenshot(window, "collab-dashboard-view");
      });
    } finally {
      // Ensure hub is stopped before closing app
      try {
        await eph.ipcMainInvokeHandler(app, "collabHub:stop");
      } catch {
        // Ignore cleanup error if already terminated
      }
      await closeApp(app);
    }
  });
});
