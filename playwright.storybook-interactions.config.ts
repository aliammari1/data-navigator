import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.SB_TEST_PORT ?? 6006);

export default defineConfig({
  testDir: "./tests/visual",
  testMatch: "storybook.interactions.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec http-server storybook-static --port ${port} --silent -c-1`,
    url: `http://127.0.0.1:${port}/index.json`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
