// tests/e2e-electron/_harness.ts
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  test as base,
  type ElectronApplication,
  _electron as electron,
  expect,
  type Page,
} from "@playwright/test";
import * as eph from "electron-playwright-helpers";

export const REPO_ROOT = process.cwd();
const MAIN_JS_PATH = path.resolve(REPO_ROOT, "build", "main.js");
export const SHARED_PROFILE_DIR = path.resolve(REPO_ROOT, ".e2e-electron-profile");
export const TEST_EMAIL = "e2e-journeys@datanavigator.test";
export const TEST_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "$Password123";

const VIDEO_ROOT = path.resolve(REPO_ROOT, "test-results", "e2e-electron", "videos");
const SCREENSHOT_ROOT = path.resolve(REPO_ROOT, "test-results", "e2e-electron", "screenshots");

export type ElectronApp = ElectronApplication;

export interface LaunchOptions {
  testName?: string;
  userDataDir?: string;
}

/**
 * Finds the primary application window, excluding Electron DevTools windows.
 */
async function getMainWindow(app: ElectronApplication, timeout = 30_000): Promise<Page> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const windows = app.windows();
    const candidate = windows.find((w) => !w.url().startsWith("devtools://"));
    if (candidate) {
      await candidate.waitForLoadState("domcontentloaded");
      return candidate;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  const fallback = await app.firstWindow({ timeout });
  await fallback.waitForLoadState("domcontentloaded");
  return fallback;
}

/**
 * Launches the Electron process with custom user data directory and optional video recording.
 */
export async function launchElectron(
  optionsOrDir: LaunchOptions | string = SHARED_PROFILE_DIR,
): Promise<{ app: ElectronApplication; window: Page }> {
  const options: LaunchOptions =
    typeof optionsOrDir === "string" ? { userDataDir: optionsOrDir } : optionsOrDir;

  const userDataDir = options.userDataDir ?? SHARED_PROFILE_DIR;
  const recordVideo = options.testName
    ? {
        dir: path.join(VIDEO_ROOT, options.testName),
        size: { width: 1440, height: 900 },
      }
    : undefined;

  if (recordVideo) {
    mkdirSync(recordVideo.dir, { recursive: true });
  }

  const app = await electron.launch({
    args: [MAIN_JS_PATH, `--user-data-dir=${userDataDir}`],
    env: { ...process.env, APP_USER_DATA: userDataDir, PLAYWRIGHT_TEST: "true" },
    timeout: 60_000,
    ...(recordVideo ? { recordVideo } : {}),
  });

  const window = await getMainWindow(app);
  return { app, window };
}

export async function closeApp(app: ElectronApplication): Promise<void> {
  await app.close();
}

export async function screenshot(page: Page, name: string): Promise<void> {
  mkdirSync(SCREENSHOT_ROOT, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_ROOT, `${name}.png`) });
}

export interface AuthOptions {
  email?: string;
  password?: string;
  name?: string;
}

/**
 * Handles initial admin setup or returning user workspace unlock deterministically.
 */
// In tests/e2e-electron/_harness.ts

export async function authenticateSession(
  page: Page,
  options: AuthOptions | string = TEST_EMAIL,
  legacyPassword?: string,
): Promise<void> {
  const opts: AuthOptions =
    typeof options === "string"
      ? { email: options, password: legacyPassword ?? TEST_PASSWORD }
      : options;

  const { email = TEST_EMAIL, password = TEST_PASSWORD, name } = opts;

  // Fast path: already on an authenticated dashboard and not locked
  if (page.url().includes("/dashboard")) {
    const lockOrSetup = page.getByRole("button", {
      name: /unlock workspace|complete administrator setup|sign in/i,
    });
    if ((await lockOrSetup.count()) === 0) {
      return;
    }
  }

  const setupBtn = page.getByRole("button", { name: /complete administrator setup/i });
  const unlockBtn = page.getByRole("button", { name: /unlock workspace/i });
  const signInBtn = page.getByRole("button", { name: "Sign in", exact: true });

  const anyActionBtn = setupBtn.or(unlockBtn).or(signInBtn);
  await expect(anyActionBtn).toBeVisible({ timeout: 30_000 });

  if (await setupBtn.isVisible()) {
    // Mode 1: Initial workspace setup
    const nameField = page.getByPlaceholder(/administrator \(optional\)|your name/i);
    if (await nameField.isVisible()) {
      await nameField.fill(name ?? "Administrator");
    }
    await page.getByPlaceholder(/admin@example\.com|email/i).fill(email);
    await page.getByPlaceholder(/^at least 8 characters/i).fill(password);
    await page.getByPlaceholder(/re-enter.*password/i).fill(password);
    await setupBtn.click();
  } else if (await unlockBtn.isVisible()) {
    // Mode 2: Returning workspace unlock
    await page.getByPlaceholder(/enter.*password/i).fill(password);
    await unlockBtn.click();
  } else {
    // Mode 3: Session expired / sign-in screen
    const emailField = page.getByPlaceholder(/admin@example\.com|email/i);
    if ((await emailField.isVisible()) && !(await emailField.inputValue())) {
      await emailField.fill(email);
    }
    await page.getByPlaceholder(/enter.*password/i).fill(password);
    await signInBtn.click();
  }

  try {
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5_000 });
  } catch {
    // Post-signup the app can bounce a fresh session back to the lock
    // screen (/login?reason=expired). Just enter the same password there.
    const retryUnlock = page.getByRole("button", { name: /unlock workspace/i });
    if ((await retryUnlock.count()) === 0) throw new Error(`stuck on ${page.url()}`);
    await page.getByPlaceholder(/enter.*password/i).fill(password);
    await retryUnlock.first().click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  }
}
/**
 * Navigates to target route and automatically handles auth redirection recovery.
 */
export async function navigateTo(page: Page, targetPath: string): Promise<void> {
  const targetUrl = new URL(targetPath, "http://localhost:3000").toString();
  const pathRegex = new RegExp(targetPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (page.url() === targetUrl) return;

  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });

  if (page.url().includes("/login")) {
    await authenticateSession(page);
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  }

  await expect(page).toHaveURL(pathRegex, { timeout: 30_000 });
}

// Aliases for backward compatibility
export const launchApp = launchElectron;
export const signUp = authenticateSession;
export const gotoRoute = navigateTo;

export const test = base.extend<{ electronApp: ElectronApplication; appWindow: Page }>({
  electronApp: async ({}, use) => {
    const { app } = await launchElectron();
    await use(app);
    await app.close();
  },
  appWindow: async ({ electronApp }, use) => {
    const window = await getMainWindow(electronApp);
    await use(window);
  },
});

export { eph, expect };
