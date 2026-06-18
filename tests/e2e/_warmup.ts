import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser } from "@playwright/test";

/**
 * Cross-worker, once-only route warm-up for the e2e suite.
 *
 * The journey specs run with `fullyParallel: true` against a single `next dev`
 * server. The first hit of each heavy route triggers on-demand compilation;
 * when 8 workers compile distinct heavy routes simultaneously the dev server is
 * overwhelmed (aborted navigations, multi-minute stalls). A naive per-worker
 * `beforeAll` warm-up makes this worse — every worker recompiles everything.
 *
 * This helper instead coordinates a *single* warm-up pass across all workers
 * using a filesystem lock in the OS temp dir (Playwright gives us no global
 * `beforeAll`, and we may not edit `playwright.config.ts`). Exactly one worker
 * wins the lock and sequentially compiles the routes; every other worker simply
 * waits for the "done" marker before its tests run. Cold-compile cost is paid
 * once, serially, instead of as a parallel thundering herd.
 *
 * Warm-up is best-effort: any failure is swallowed so the per-test navigations
 * (which retry / wait generously) still compile on demand if needed.
 */

const STATE_DIR = join(tmpdir(), "dn-e2e-warmup");

interface WarmupState {
  readonly lock: string;
  readonly done: string;
}

function stateFor(key: string): WarmupState {
  return {
    lock: join(STATE_DIR, `${key}.lock`),
    done: join(STATE_DIR, `${key}.done`),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Age of a file in ms, or Infinity if it does not exist / cannot be read. */
function ageMs(path: string): number {
  try {
    return Date.now() - statSync(path).mtimeMs;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Markers live in the OS temp dir and survive across runs. If a marker is older
 * than this, treat it as belonging to a previous run (the dev server may have
 * been restarted with a cold `.next` cache) and discard it so we warm again.
 */
const MARKER_TTL_MS = 15 * 60_000;

function clearStaleMarkers(state: WarmupState): void {
  for (const path of [state.done, state.lock]) {
    if (existsSync(path) && ageMs(path) > MARKER_TTL_MS) {
      try {
        rmSync(path, { force: true });
      } catch {
        // Best-effort cleanup; a live run will still coordinate correctly.
      }
    }
  }
}

/** Try to atomically claim the warm-up lock for this key. */
function tryAcquireLock(lockPath: string): boolean {
  mkdirSync(STATE_DIR, { recursive: true });
  try {
    // `wx` fails if the file already exists — an atomic test-and-set.
    writeFileSync(lockPath, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a one-time, cross-worker warm-up identified by `key`. The winning worker
 * compiles every path in `paths`; other workers wait for the done-marker.
 */
export async function warmUpOnce(
  browser: Browser,
  key: string,
  paths: readonly string[],
  options: { readonly perNavTimeoutMs?: number; readonly maxWaitMs?: number } = {},
): Promise<void> {
  const { perNavTimeoutMs = 90_000, maxWaitMs = 240_000 } = options;
  const state = stateFor(key);
  const { lock, done } = state;

  // Drop markers left over from an earlier run before deciding leadership.
  clearStaleMarkers(state);

  if (existsSync(done)) return;

  const isLeader = tryAcquireLock(lock);

  if (!isLeader) {
    // Follower: wait for the leader's done-marker (or give up after maxWaitMs so
    // a crashed leader cannot deadlock the suite — tests then compile on demand).
    const start = Date.now();
    while (!existsSync(done) && Date.now() - start < maxWaitMs) {
      await sleep(1_000);
    }
    return;
  }

  // Leader: compile every route once, serially.
  const page = await browser.newPage();
  try {
    for (const path of paths) {
      try {
        await page.goto(path, {
          waitUntil: "domcontentloaded",
          timeout: perNavTimeoutMs,
        });
        await page.waitForLoadState("load", { timeout: 30_000 }).catch(() => {});
      } catch {
        // One slow/aborted warm-up navigation must not abort the whole pass.
      }
    }
  } finally {
    await page.close();
    // Signal followers regardless of individual nav outcomes.
    try {
      writeFileSync(done, String(Date.now()));
    } catch {
      // If we cannot write the marker, followers fall back to their timeout.
    }
  }
}
