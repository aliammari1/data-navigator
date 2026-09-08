// tests/e2e-electron/auth-journey.spec.ts
import path from "node:path";
import { expect, test } from "@playwright/test";
import { closeApp, launchApp, screenshot, signUp } from "./_harness";

/**
 * Auth journey: sign up with a brand-new account, sign out, and sign back in
 * against the real Electron app + real better-auth backend.
 *
 * This is the one journey in the suite that does NOT use `SHARED_PROFILE_DIR`
 * — every other spec piggybacks on the shared, already-authenticated profile
 * so it can skip straight to `/dashboard`. This journey's whole point is to
 * exercise the real signup form, so it needs a profile + account that have
 * genuinely never authenticated. `RUN_ID` keys both the profile dir and the
 * email so re-running this spec locally (e.g. while iterating on selectors)
 * never "fast-paths" past signup on a stale profile or hits a real
 * "this email is already registered" server error.
 */
const RUN_ID = Date.now();
const FRESH_PROFILE_DIR = path.resolve(
  process.cwd(),
  "test-results",
  "e2e-electron",
  ".auth-profile",
  `run-${RUN_ID}`,
);
const EMAIL = `auth-journey-${RUN_ID}@datanavigator.test`;
const PASSWORD = "AuthJourney!2026";
const NAME = "E2E Journey";

const REDIRECT_TIMEOUT_MS = 30_000;

test.describe("Auth journey", () => {
  test("sign up, sign out, sign back in", async () => {
    const { app, window } = await launchApp({
      testName: "auth-journey",
      userDataDir: FRESH_PROFILE_DIR,
    });

    try {
      await test.step("fresh signup lands in the dashboard", async () => {
        await window.getByPlaceholder("Your name (optional)").fill(NAME);
        // signUp() re-navigates to /login and fills email+password+submit; the
        // name field above must be filled first since signUp() only owns the
        // email/password/submit steps and expects the form already open.
        await signUp(window, EMAIL, PASSWORD);
        await screenshot(window, "auth-01-post-signup-dashboard");
      });

      await test.step("sign out returns to the login screen", async () => {
        // A fresh profile's `/dashboard` renders the desktop-mode Puter-style
        // home screen: shell-store.ts defaults `desktopMode: true`, and
        // dashboard-layout.tsx only mounts the classic sidebar+topbar shell
        // when NOT `(desktopMode && pathname === "/dashboard")`. So the
        // topbar avatar dropdown (used for sign-out elsewhere in this app) is
        // not present on the page we land on straight after signup.
        // `/dashboard/settings` is a different pathname, so it always renders
        // the classic shell regardless of desktop-mode state, and
        // AccountPanel (src/features/settings/components/panels/account-panel.tsx)
        // exposes an equivalent real "Sign out" button wired to the same
        // authClient.signOut() call. Deep-link straight to its tab via
        // `?tab=account` (SettingsScreen reads `?tab=` on mount).
        await window.goto("http://localhost:3000/dashboard/settings?tab=account");
        const signOutButton = window.getByRole("button", { name: "Sign out", exact: true });
        await signOutButton.waitFor({ state: "visible", timeout: REDIRECT_TIMEOUT_MS });
        await signOutButton.click();
        await window.waitForURL(/\/login/, { timeout: REDIRECT_TIMEOUT_MS });
        await screenshot(window, "auth-02-post-logout-login-screen");
      });

      await test.step("sign back in with the same credentials", async () => {
        // os-login.tsx tracks a separate "recognized browser" marker in
        // localStorage (`dn.auth.user`), written on signup and never cleared
        // by sign-out (sign-out only clears the server-side session cookie).
        // So this second /login visit resolves to "lock" mode — password
        // only, name/email already known — rather than back to the
        // "setup"/create-account form the first signup used.
        const signInButton = window.getByRole("button", { name: "Sign in", exact: true });
        await signInButton.waitFor({ state: "visible", timeout: REDIRECT_TIMEOUT_MS });
        await window.getByPlaceholder("Enter your password").fill(PASSWORD);
        await signInButton.click();
        await expect(window).toHaveURL(/\/dashboard/, { timeout: REDIRECT_TIMEOUT_MS });
        await screenshot(window, "auth-03-post-login-dashboard");
      });
    } finally {
      await closeApp(app);
    }
  });
});
