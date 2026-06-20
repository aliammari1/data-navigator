/**
 * Lighthouse CI config (architecture.md §13: "@lhci/cli (INP/CLS vs localhost
 * offline)").
 *
 * Offline-first by design — there is NO LHCI server and NO upload target other
 * than the local filesystem. `lhci autorun` collects against the locally running
 * Next dev/start server (http://localhost:3000) and asserts Core Web Vitals
 * budgets (INP/CLS/TBT) so a regression fails the dev quality gate without any
 * network round-trip.
 *
 * Run the app first (`pnpm start` or `pnpm next:dev`), then `pnpm audit:lhci`.
 *
 * @type {import('@lhci/cli').LHCIConfig}
 */
module.exports = {
  ci: {
    collect: {
      // Audit the marketing root and the main authenticated surfaces. The dev
      // server must already be running on :3000 (offline, no startServerCommand
      // so LHCI never tries to reach the network to boot it).
      url: [
        "http://localhost:3000/",
        "http://localhost:3000/dashboard",
        "http://localhost:3000/dashboard/data-browser",
        "http://localhost:3000/dashboard/analytics-theater",
      ],
      numberOfRuns: 3,
      settings: {
        // Desktop form factor matches the Electron renderer target.
        preset: "desktop",
        // Pure offline run: never reach out to the PSI API or remote configs.
        chromeFlags: "--no-sandbox --headless=new",
      },
    },
    assert: {
      // Gate the stable, lab-measurable main-thread / layout signals as hard
      // errors (CLS + TBT) and keep the higher-level Web Vitals as advisory
      // warnings. Budgets are sized for a heavy *desktop Electron-renderer*
      // dashboard on noisy CI hardware, not a public over-the-network web page.
      //
      // Deliberately NOT asserted:
      //  - `max-potential-fid`: deprecated by Lighthouse (superseded by INP) and
      //    redundant with TBT, which already captures main-thread blocking.
      //  - `interaction-to-next-paint`: INP cannot be produced by a lab run with
      //    no user interaction — it always reports "auditRan: 0" here, so gating
      //    (even as a warning) is pure noise.
      assertions: {
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "total-blocking-time": ["error", { maxNumericValue: 500 }],
        "largest-contentful-paint": ["warn", { maxNumericValue: 2500 }],
        "first-contentful-paint": ["warn", { maxNumericValue: 1800 }],
        interactive: ["warn", { maxNumericValue: 3800 }],
        // Don't let the overall perf category silently rot.
        "categories:performance": ["warn", { minScore: 0.85 }],
      },
    },
    upload: {
      // Offline invariant: write reports to disk, never to a remote LHCI server.
      target: "filesystem",
      outputDir: ".lighthouseci",
      reportFilenamePattern: "%%PATHNAME%%-%%DATETIME%%-report.%%EXTENSION%%",
    },
  },
};
