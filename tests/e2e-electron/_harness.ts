import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { _electron as electron, expect, type Page } from "@playwright/test";

import * as eph from "electron-playwright-helpers";

/**
 * Structural type for Playwright's Electron launch entry point, augmented
 * with electron-playwright-helpers compatibility for IPC invocation, dialog
 * stubbing, window tracking, and main process evaluation.
 */
export type ElectronApp = Parameters<typeof eph.ipcMainInvokeHandler>[0] & {
  firstWindow(options?: { timeout?: number }): Promise<Page>;
  windows(): Promise<Page[]>;
  close(): Promise<void>;
  evaluate<R, Arg = unknown>(
    pageFunction: (electron: unknown, arg: Arg) => R | Promise<R>,
    arg?: Arg,
  ): Promise<R>;
};

interface ElectronNamespace {
  launch(options: {
    args: string[];
    env?: Record<string, string | undefined>;
    timeout?: number;
    recordVideo?: { dir: string; size?: { width: number; height: number } };
  }): Promise<ElectronApp>;
}

const electronNs = electron as unknown as ElectronNamespace;

export { eph };

const REPO_ROOT = process.cwd();
const MAIN_JS_PATH = path.resolve(REPO_ROOT, "build", "main.js");

export const SHARED_PROFILE_DIR = path.resolve(REPO_ROOT, ".e2e-electron-profile");
export const TEST_EMAIL = "e2e-journeys@datanavigator.test";
export const TEST_PASSWORD = "E2eJourneys!2026";

const VIDEO_ROOT = path.resolve(REPO_ROOT, "test-results", "e2e-electron", "videos");
const SCREENSHOT_ROOT = path.resolve(REPO_ROOT, "test-results", "e2e-electron", "screenshots");

const LAUNCH_TIMEOUT_MS = 120_000;
const WINDOW_TIMEOUT_MS = 120_000;

export async function launchApp(opts: {
  testName: string;
  userDataDir?: string;
}): Promise<{ app: ElectronApp; window: Page }> {
  const userDataDir = opts.userDataDir ?? SHARED_PROFILE_DIR;
  const videoDir = path.join(VIDEO_ROOT, opts.testName);
  mkdirSync(videoDir, { recursive: true });

  const app = await electronNs.launch({
    args: [MAIN_JS_PATH, `--user-data-dir=${userDataDir}`],
    env: { ...process.env, APP_USER_DATA: userDataDir },
    timeout: LAUNCH_TIMEOUT_MS,
    recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } },
  });

  const window = await app.firstWindow({ timeout: WINDOW_TIMEOUT_MS });
  try {
    await window.waitForLoadState("domcontentloaded", { timeout: 15_000 });
  } catch {
    // Redirects or cold route compilations may delay domcontentloaded; downstream
    // steps (such as waitForURL or locators) will wait for actual content.
  }

  return { app, window };
}

export async function closeApp(app: ElectronApp): Promise<void> {
  await app.close();
}

export async function screenshot(window: Page, name: string): Promise<void> {
  mkdirSync(SCREENSHOT_ROOT, { recursive: true });
  await window.screenshot({ path: path.join(SCREENSHOT_ROOT, `${name}.png`) });
}

/**
 * Drives the real signup form to completion. Matches the copy/selectors
 * confirmed live against this app's /login screen: heading "Welcome to Data
 * Navigator", email placeholder "you@example.com", password placeholder
 * "At least 8 characters", submit button "Get started".
 */
export async function signUp(window: Page, email: string, password: string): Promise<void> {
  // Wait up to 30s for either /dashboard or /login
  for (let i = 0; i < 30; i++) {
    if (window.url().includes("/dashboard")) return;
    if (window.url().includes("/login")) break;
    await window.waitForTimeout(1000);
  }

  if (window.url().includes("/dashboard")) return;

  const setupBtn = window.getByRole("button", { name: /complete administrator setup/i });
  const unlockBtn = window.getByRole("button", { name: /unlock workspace/i });

  // Wait for either button to be visible
  await expect(setupBtn.or(unlockBtn)).toBeVisible({ timeout: 60_000 });

  if (await setupBtn.isVisible()) {
    await window.getByPlaceholder("admin@example.com").fill(email);
    await window.getByPlaceholder("At least 8 characters").fill(password);
    await window.getByPlaceholder("Re-enter your master password").fill(password);
    await setupBtn.click();
  } else {
    await window.getByPlaceholder("Enter master password").fill(password);
    await unlockBtn.click();
  }

  await window.waitForURL(/\/dashboard/, { timeout: WINDOW_TIMEOUT_MS });
}

export { existsSync };
