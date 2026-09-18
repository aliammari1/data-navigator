import { defineConfig, devices } from "@playwright/test";

const AUTH_STATE_PATH = ".playwright/auth.json";

/**
 * Playwright Configuration
 * E2E tests for complete user journeys across the Data Navigator application
 */

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },

  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      testIgnore: /.*\.setup\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE_PATH },
    },
    {
      name: "firefox",
      testIgnore: /.*\.setup\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Firefox"], storageState: AUTH_STATE_PATH },
    },
    {
      name: "webkit",
      testIgnore: /.*\.setup\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Safari"], storageState: AUTH_STATE_PATH },
    },
    {
      name: "Mobile Chrome",
      testIgnore: /.*\.setup\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Pixel 5"], storageState: AUTH_STATE_PATH },
    },
    {
      name: "Mobile Safari",
      testIgnore: /.*\.setup\.ts/,
      dependencies: ["setup"],
      use: { ...devices["iPhone 12"], storageState: AUTH_STATE_PATH },
    },
  ],

  webServer: {
    command: "npm run next:dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
