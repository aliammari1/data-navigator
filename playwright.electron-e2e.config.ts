import path from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * Real-Electron E2E user-journey suite. Standalone config (mirrors
 * playwright.electron-perf.config.ts's pattern) — launches the app's OWN
 * built main process via Playwright's Electron support
 * (tests/e2e-electron/_harness.ts) rather than driving a browser against a
 * URL, so it needs its own timeouts/workers, distinct from
 * playwright.config.ts's browser-emulation e2e suite and from
 * playwright.electron-perf.config.ts's performance-only harness.
 *
 * Workflow:
 *   pnpm run electron:build     # tsup -> build/main.js + build/preload.js
 *   pnpm run test:e2e:electron  # starts next:dev (if not already running),
 *                                # launches the built app per test, records
 *                                # video + screenshots
 *
 * Single-instance lock (electron/main.ts's app.requestSingleInstanceLock()):
 * workers MUST stay 1 and fullyParallel MUST stay false — a second concurrent
 * _electron.launch() against this app does not produce an independent
 * instance, it just focuses the first one, silently corrupting test
 * isolation.
 */
export default defineConfig({
  testDir: "./tests/e2e-electron",
  testMatch: "**/*.spec.ts",
  globalSetup: "./tests/e2e-electron/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 120_000,
  reporter: [["list"]],
  webServer: {
    command: "pnpm run next:dev",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      APP_USER_DATA: path.resolve(process.cwd(), ".e2e-electron-profile"),
      // Electron harness launches the app with PLAYWRIGHT_TEST=true (7-day
      // sessions, no midnight timer). The Next.js server needs the same flag
      // so dashboard/layout fallback can apply identical test leniency;
      // without it the server treats fresh E2E sessions with production
      // strictness while Electron uses test semantics — split-brain.
      PLAYWRIGHT_TEST: "true",
    },
  },
});
