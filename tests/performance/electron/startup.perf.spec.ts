import path from "node:path";
// Aliased: `performance` must stay unshadowed at module scope so the
// `window.evaluate` closures below can reference the RENDERER's own global
// `performance` (unqualified). If this import were named `performance`, it
// would lexically shadow the browser global inside those closures — Playwright
// serializes the closure by source text, and the resulting reference to the
// bundler-renamed Node import (e.g. `_nodePerfHooks.performance`) does not
// exist in the browser context, throwing a ReferenceError there.
import { performance as nodeNow } from "node:perf_hooks";
import { _electron as electron, expect, test } from "@playwright/test";

/**
 * Electron app-level performance harness (run with `pnpm run bench:electron`).
 *
 * Launches the BUILT main process (`build/main.js`, produced by
 * `pnpm run electron:build`) directly through Playwright's Electron support —
 * the same experimental API the official docs use
 * (https://playwright.dev/docs/api/class-electron). `@playwright/test`
 * exposes it at runtime as `_electron` (verified against the installed 1.61.1
 * package: `Object.keys(require("@playwright/test"))` includes `_electron`);
 * its narrower PUBLIC `.d.ts` (re-exported from the `playwright/test` subpath,
 * not the full `playwright` package that ships `ElectronApplication`) doesn't
 * type it, so the minimal shape this file actually calls is declared locally
 * below instead of adding a `playwright` / `playwright-core` dependency (this
 * file also sits outside `tsconfig.json`'s program — `tests/` is excluded
 * there, same as every other spec under `tests/` — so this is purely for the
 * reader, not a build-time requirement).
 *
 * Measures three numbers, matching `evals/perf/throughput.eval.ts`'s house
 * style: report the number, assert only SANITY bounds (positive, finite) —
 * never a hard threshold, since absolute numbers are machine-dependent.
 *
 *   (a) cold-start wall-clock: launch() call -> first window's `load` event.
 *   (b) main-process memory footprint shortly after launch (`process.memoryUsage()`
 *       evaluated INSIDE the main process via `electronApp.evaluate`).
 *   (c) one IPC round-trip over `window.electronFS.getDataDir()` — the
 *       simplest channel on the preload bridge (electron/preload.ts): no
 *       dataset/DuckDB dependency, just a main-process round trip. Timed with
 *       the RENDERER's own `performance.now()` so the number is the real IPC
 *       latency, not Playwright's CDP dispatch overhead.
 *
 * IMPORTANT — what "cold start" measures here: this harness launches
 * `build/main.js` standalone, the same way `electron build/main.js` would,
 * with NO Next.js dev server running underneath it. `main.ts` treats itself as
 * `isDev` whenever `!app.isPackaged` (true for this unpackaged launch) and
 * unconditionally `loadURL`s `http://localhost:3000/dashboard` in that branch.
 * Without a dev server there, that navigation fails fast and Chromium's own
 * "can't be reached" error page finishes loading in its place. Electron still
 * runs the preload script on that navigation — `contextBridge` exposes
 * `window.electronFS` regardless of whether the page navigation itself
 * succeeded — so (b) and (c) measure the real thing every time. But (a) then
 * measures "main-process boot + window creation + first (failed) navigation
 * settles", NOT true first paint of the real dashboard UI.
 *
 * To measure genuine first-paint, run `pnpm run next:dev` in another terminal
 * first (matching the real `electron:dev` workflow), then run
 * `pnpm run bench:electron` — this harness does not start that server itself,
 * to keep it fast, deterministic, and environment-independent for CI /
 * sandboxed runs (a live Next.js dev server is a slow, stateful dependency
 * this harness should not require just to report a number).
 */

// ─── Minimal Electron-API surface (see doc comment above) ───────────────────

interface PerfElectronWindow {
  waitForLoadState(
    state?: "load" | "domcontentloaded" | "networkidle",
    options?: { timeout?: number },
  ): Promise<void>;
  evaluate<R>(pageFunction: () => R | Promise<R>): Promise<R>;
}

interface PerfElectronApp {
  firstWindow(options?: { timeout?: number }): Promise<PerfElectronWindow>;
  evaluate<R>(pageFunction: (electronModule: unknown) => R | Promise<R>): Promise<R>;
  close(): Promise<void>;
}

interface PerfElectronNamespace {
  launch(options: { args: string[]; timeout?: number }): Promise<PerfElectronApp>;
}

// `_electron` is a genuine `@playwright/test` runtime export (see doc comment
// above); this only asserts the narrow structural shape this file needs.
const electronNs = electron as unknown as PerfElectronNamespace;

// ─── Paths + constants ───────────────────────────────────────────────────────

const MAIN_JS_PATH = path.resolve(process.cwd(), "build", "main.js");

const LAUNCH_TIMEOUT_MS = 30_000;
const WINDOW_TIMEOUT_MS = 20_000;

// ─── Reporting (mirrors evals/perf/throughput.eval.ts's house style) ────────

/** Log a single metric line for human inspection — the ONLY side effect here. */
function report(label: string, metric: number): void {
  // eslint-disable-next-line no-console
  console.log(`[perf] ${label}: ${metric.toFixed(3)}`);
}

/** Sanity bounds only — never a hard threshold (see module doc comment). */
function assertSaneDuration(label: string, ms: number): void {
  expect(Number.isFinite(ms), `${label}: finite`).toBe(true);
  expect(ms, `${label}: positive`).toBeGreaterThan(0);
}

// ─── Test ────────────────────────────────────────────────────────────────────

test.describe("Electron app performance", () => {
  test("cold start, main-process memory, and IPC round-trip", async () => {
    const launchStart = nodeNow.now();

    // `app.isPackaged` is false for this unpackaged launch, so the
    // `DN_ENABLE_AUTO_UPDATE` opt-in network call in main.ts never triggers
    // regardless of environment — no need to override `env` for offline safety.
    const app = await electronNs.launch({ args: [MAIN_JS_PATH], timeout: LAUNCH_TIMEOUT_MS });

    let window: PerfElectronWindow | undefined;

    try {
      await test.step("(a) cold start: launch() -> first window load event", async () => {
        window = await app.firstWindow({ timeout: WINDOW_TIMEOUT_MS });
        await window.waitForLoadState("load", { timeout: WINDOW_TIMEOUT_MS });

        const coldStartMs = nodeNow.now() - launchStart;
        report("startup.coldStartMs", coldStartMs);
        assertSaneDuration("startup.coldStartMs", coldStartMs);
      });

      await test.step("(b) main-process memory footprint", async () => {
        const memoryUsage = await app.evaluate(() => process.memoryUsage());

        report("startup.mainProcess.rssMb", memoryUsage.rss / (1024 * 1024));
        report("startup.mainProcess.heapUsedMb", memoryUsage.heapUsed / (1024 * 1024));

        expect(Number.isFinite(memoryUsage.rss), "rss finite").toBe(true);
        expect(memoryUsage.rss, "rss positive").toBeGreaterThan(0);
        expect(Number.isFinite(memoryUsage.heapUsed), "heapUsed finite").toBe(true);
        expect(memoryUsage.heapUsed, "heapUsed positive").toBeGreaterThan(0);
      });

      await test.step("(c) IPC round-trip over fs:getDataDir", async () => {
        if (!window) throw new Error("window was not captured by the cold-start step");

        const ipcMs = await window.evaluate(async () => {
          const bridge = (
            window as unknown as { electronFS: { getDataDir: () => Promise<string> } }
          ).electronFS;
          const start = performance.now();
          await bridge.getDataDir();
          return performance.now() - start;
        });

        report("startup.ipcRoundTripMs", ipcMs);
        assertSaneDuration("startup.ipcRoundTripMs", ipcMs);
      });
    } finally {
      await app.close();
    }
  });
});
