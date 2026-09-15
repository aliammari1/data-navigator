// tests/e2e-electron/global-setup.ts
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import type { FullConfig } from "@playwright/test";
import Database from "better-sqlite3";
import {
  closeApp,
  launchApp,
  SHARED_PROFILE_DIR,
  signUp,
  TEST_EMAIL,
  TEST_PASSWORD,
} from "./_harness";

/**
 * Checks whether the shared profile database exists and contains an unexpired session.
 */
function isProfileAuthenticated(profileDir: string): boolean {
  const dbPath = path.join(profileDir, "databases", "auth.db");
  if (!existsSync(dbPath)) return false;

  let db: Database.Database | undefined;
  try {
    db = new Database(dbPath, { readonly: true });

    // Verify user exists
    const user = db.prepare("SELECT id FROM user LIMIT 1").get();
    if (!user) return false;

    // Verify Better Auth session is still unexpired
    const session = db
      .prepare("SELECT expiresAt FROM session ORDER BY expiresAt DESC LIMIT 1")
      .get() as { expiresAt: number | string } | undefined;

    if (!session) return false;

    const expiresAtMs =
      typeof session.expiresAt === "number"
        ? session.expiresAt
        : new Date(session.expiresAt).getTime();

    // Must be valid for at least another 60 seconds
    return expiresAtMs > Date.now() + 60_000;
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

/**
 * Pre-warms core routes so bundlers compile them before Electron windows initialize.
 */
async function prewarmRoutes(baseURL = "http://localhost:3000"): Promise<void> {
  const routes = ["/login", "/dashboard"];
  await Promise.allSettled(routes.map((route) => fetch(new URL(route, baseURL))));
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  if (isProfileAuthenticated(SHARED_PROFILE_DIR)) {
    await prewarmRoutes();
    return;
  }

  // Wipe BEFORE prewarming: prewarm compiles /dashboard, which opens the
  // shared auth.db through the Next server and caches the handle. Wiping
  // after that leaves the server bound to a deleted inode, so every later
  // session lookup misses and the suite loops on /login?reason=expired.
  if (existsSync(SHARED_PROFILE_DIR)) {
    rmSync(SHARED_PROFILE_DIR, { recursive: true, force: true });
  }

  await prewarmRoutes();

  const { app, window } = await launchApp({
    testName: "_global-setup",
    userDataDir: SHARED_PROFILE_DIR,
  });

  try {
    await signUp(window, TEST_EMAIL, TEST_PASSWORD);
  } finally {
    await closeApp(app);
  }
}
