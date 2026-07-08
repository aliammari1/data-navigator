import { defineConfig } from "@playwright/test";

/**
 * Electron-level performance harness configuration.
 *
 * Standalone config (mirrors `playwright.storybook.config.ts`'s pattern) —
 * deliberately NOT merged into `playwright.config.ts` (browser/user-journey
 * e2e). This project launches the app's OWN built main process via
 * Playwright's Electron support (`_electron.launch`, see
 * `tests/performance/electron/startup.perf.spec.ts`) rather than driving a
 * browser against a URL, so it needs its own timeouts, worker count, and
 * reporter — none of the `devices`/`projects` browser matrix from the main
 * config applies here.
 *
 * Workflow:
 *   pnpm run electron:build   # tsup -> build/main.js + build/preload.js (~1s)
 *   pnpm run bench:electron   # launches the built app, measures, reports numbers
 *
 * Requires `build/main.js` to exist (run `electron:build` first — this config
 * does not build it automatically, matching `test:vr`'s pattern of requiring
 * `build:storybook` beforehand rather than building inline). No `webServer` is
 * started here: the app boots exactly as `electron build/main.js` would: see
 * the spec file's doc comment for exactly what that means for the "first
 * window load" measurement without a Next.js dev server underneath it.
 */
export default defineConfig({
  testDir: "./tests/performance/electron",
  // One Electron instance at a time: concurrent launches would contend for the
  // app's own single-instance lock (electron/main.ts) and skew the memory /
  // timing numbers this harness exists to measure.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0, // perf numbers must never be silently re-run/averaged by Playwright
  // Electron cold boot (DuckDB init, settings store, window creation) needs
  // more headroom than a browser e2e assertion.
  timeout: 60_000,
  reporter: [["list"]],
});
