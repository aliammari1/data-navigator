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

  let authEndpoint: RegExp;

  if (/complete administrator setup/i.test(label)) {
    authEndpoint = /\/api\/auth\/sign-up\/email(?:\?|$)/;
    await page.getByPlaceholder(/administrator \(optional\)/i).fill(E2E_OWNER.name);
    await page.getByPlaceholder(/^admin@example\.com$/i).fill(E2E_OWNER.email);
    await page.getByPlaceholder(/at least 8 characters/i).fill(E2E_OWNER.password);
    await page.getByPlaceholder(/re-enter your master password/i).fill(E2E_OWNER.password);
  } else if (/unlock workspace/i.test(label)) {
    authEndpoint = /\/api\/auth\/sign-in\/email(?:\?|$)/;
    const email = page.getByPlaceholder(/administrator email address/i);
    if (await email.isVisible().catch(() => false)) {
      await email.fill(E2E_OWNER.email);
    }
    await page.getByPlaceholder(/enter master password/i).fill(E2E_OWNER.password);
  } else {
    throw new Error(`Unexpected authentication mode: "${label}"`);
  }

  const authenticatedResponse = page.waitForResponse(
    (response) => authEndpoint.test(response.url()) && response.request().method() === "POST",
  );
  await submit.click();
  const response = await authenticatedResponse;
  expect(response.ok(), `Better Auth rejected ${response.url()}`).toBe(true);

  const sessionCookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === "better-auth.session_token",
  );
  expect(sessionCookie, "Better Auth did not issue a browser session cookie").toBeDefined();

  await expect(page).toHaveURL(/\/dashboard(?:\/|$)/, { timeout: 30_000 });

  await page.context().storageState({ path: AUTH_STATE_PATH });
});
