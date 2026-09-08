import { existsSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { closeApp, launchApp, SHARED_PROFILE_DIR, signUp, TEST_EMAIL, TEST_PASSWORD } from "./_harness";

/**
 * Runs ONCE before the whole suite (wired via playwright.electron-e2e.config.ts's
 * `globalSetup`). If the shared profile doesn't exist yet, launches the app
 * against it and signs up once so every journey test in the suite starts
 * already authenticated — a realistic "returning user" session instead of
 * re-running signup in every spec file.
 */
export default async function globalSetup(): Promise<void> {
  // Pre-warm routes so Turbopack compiles them before Electron launches
  try {
    await fetch("http://localhost:3000/login");
    await fetch("http://localhost:3000/dashboard");
  } catch {
    // webServer might still be initializing
  }

  const authDb = path.join(SHARED_PROFILE_DIR, "databases", "auth.db");
  if (existsSync(authDb)) {
    try {
      const db = new Database(authDb, { readonly: true });
      const row = db.prepare("SELECT id FROM user LIMIT 1").get();
      db.close();
      if (row) return;
    } catch {
      // Re-run setup if unreadable
    }
  }

  const { app, window } = await launchApp({ testName: "_global-setup", userDataDir: SHARED_PROFILE_DIR });
  try {
    await signUp(window, TEST_EMAIL, TEST_PASSWORD);
  } finally {
    await closeApp(app);
  }
}
