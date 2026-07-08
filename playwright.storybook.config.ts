import { defineConfig, devices } from "@playwright/test";

/**
 * Visual-regression configuration for Storybook.
 *
 * This is intentionally separate from `playwright.config.ts` (user-journey
 * e2e) because it serves the *built* Storybook and compares pixel snapshots.
 *
 * Workflow:
 *   pnpm run build:storybook         # produce storybook-static/
 *   pnpm run test:vr                 # compare against committed baselines
 *   pnpm run test:vr:update          # refresh baselines after intended changes
 *
 * Baselines live in tests/visual/__screenshots__ and should be committed.
 * Note: generate baselines in CI (Linux) to avoid OS font-rendering diffs.
 */
const PORT = Number(process.env.SB_VR_PORT ?? 6007);

export default defineConfig({
  testDir: "./tests/visual",
  snapshotDir: "./tests/visual/__screenshots__",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["html", { open: "never", outputFolder: "playwright-report-vr" }], ["list"]],
  expect: {
    toHaveScreenshot: {
      // Small tolerance absorbs sub-pixel anti-aliasing noise while still
      // catching real layout/colour regressions.
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    },
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "vr-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `pnpm dlx http-server storybook-static --port ${PORT} --silent -c-1`,
    url: `http://127.0.0.1:${PORT}/index.json`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
