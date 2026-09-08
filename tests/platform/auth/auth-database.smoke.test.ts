/**
 * Regression guard for the auth database's runtime portability.
 *
 * The auth DB is opened from two different Node runtimes: the Electron main
 * process in the packaged app, and the system Node that serves `next dev`. When
 * it ran on the `better-sqlite3` native addon, whichever runtime did not match
 * the compiled binary's ABI crashed with ERR_DLOPEN_FAILED — surfacing as a 500
 * on every `/dashboard` request. It now runs on `node:sqlite`, which is built
 * into whichever runtime loads it.
 *
 * This test opens the database for real (no mocks) under the runtime executing
 * the suite, so an accidental return to a native driver fails here instead of at
 * app boot.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, expect, it } from "vitest";

const dir = mkdtempSync(path.join(tmpdir(), "dn-authdb-smoke-"));

afterAll(() => {
  // The module caches its connection for the process lifetime and exposes no
  // close hook, so on Windows the file stays locked here. Cleanup is best-effort;
  // the OS reclaims its temp dir regardless.
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore — a leftover temp dir must not fail the suite
  }
});

it("opens the auth database and serves a query under this runtime", async () => {
  process.env.APP_USER_DATA = dir;
  const { authDb } = await import("@/platform/auth/auth-database");

  // Touching the lazy proxy is what actually opens the database and applies the
  // schema — the step that previously threw NODE_MODULE_VERSION mismatch.
  await expect(authDb.query.user.findMany()).resolves.toEqual([]);
});
