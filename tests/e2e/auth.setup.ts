import path from "node:path";
import { expect, test as setup } from "@playwright/test";

export const AUTH_STATE_PATH = path.join(process.cwd(), ".playwright", "auth.json");

const E2E_OWNER = {
  name: "Playwright E2E Owner",
  email: "playwright-owner@example.test",
  password: "Playwright-E2E-2026!",
} as const;

setup("authenticate browser journeys", async ({ page }) => {
  setup.setTimeout(90_000);

  await page.goto("/login", { waitUntil: "domcontentloaded" });

  const submit = page.getByTestId("auth-submit-btn");
  await expect(submit).toBeVisible({ timeout: 30_000 });

  const label = (await submit.textContent())?.trim() ?? "";
  console.log(`[e2e-auth] initial mode: ${label || "<empty>"}`);

  if (/complete administrator setup/i.test(label)) {
    await page.getByPlaceholder(/administrator \(optional\)/i).fill(E2E_OWNER.name);
    await page.getByPlaceholder(/^admin@example\.com$/i).fill(E2E_OWNER.email);
    await page.getByPlaceholder(/at least 8 characters/i).fill(E2E_OWNER.password);
    await page.getByPlaceholder(/re-enter your master password/i).fill(E2E_OWNER.password);
  } else if (/unlock workspace/i.test(label)) {
    const email = page.getByPlaceholder(/administrator email address/i);
    if (await email.isVisible().catch(() => false)) {
      await email.fill(E2E_OWNER.email);
    }
    await page.getByPlaceholder(/enter master password/i).fill(E2E_OWNER.password);
  } else {
    throw new Error(`Unexpected authentication mode: "${label}"`);
  }

  await submit.click();

  // A fresh sign-up can briefly return to the lock screen while the session
  // cookie/database state settles. The Electron E2E harness already handles
  // this same application behavior; mirror that recovery here instead of
  // treating it as a failed account creation.
  try {
    await expect(page).toHaveURL(/\/dashboard(?:\/|$)/, { timeout: 5_000 });
  } catch {
    const retryUnlock = page.getByRole("button", { name: /unlock workspace/i });
    if (!(await retryUnlock.isVisible().catch(() => false))) {
      const currentSubmit = (await page.getByTestId("auth-submit-btn").textContent().catch(() => ""))?.trim();
      throw new Error(
        `Authentication did not reach dashboard and no unlock recovery was available (url=${page.url()}, mode=${currentSubmit || "<unknown>"}).`,
      );
    }

    await page.getByPlaceholder(/enter.*password/i).fill(E2E_OWNER.password);
    await retryUnlock.click();
    await expect(page).toHaveURL(/\/dashboard(?:\/|$)/, { timeout: 30_000 });
  }

  await page.context().storageState({ path: AUTH_STATE_PATH });
});
