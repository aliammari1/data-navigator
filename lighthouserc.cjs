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
      // Budget the field-correlated lab metrics. INP is approximated in the lab
      // by TBT/max-potential-FID, so we gate CLS + TBT + max-potential-FID
      // directly and keep the higher-level Web Vitals as warnings.
      assertions: {
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "total-blocking-time": ["error", { maxNumericValue: 300 }],
        "max-potential-fid": ["error", { maxNumericValue: 200 }],
        "largest-contentful-paint": ["warn", { maxNumericValue: 2500 }],
        "first-contentful-paint": ["warn", { maxNumericValue: 1800 }],
        interactive: ["warn", { maxNumericValue: 3800 }],
        "interaction-to-next-paint": ["warn", { maxNumericValue: 200 }],
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
