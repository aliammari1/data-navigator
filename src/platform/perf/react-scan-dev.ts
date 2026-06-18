/**
 * Dev-only react-scan integration (architecture.md §13: "react-scan (the
 * re-render storms)").
 *
 * react-scan highlights wasteful React re-renders directly in the running app so
 * the "re-render storms" the architecture calls out are visible while
 * developing. It is a DEVELOPMENT tool only — it must never load in a packaged
 * production build, so:
 *
 *  - the whole module is gated behind `process.env.NODE_ENV !== "production"`,
 *    which dead-code-eliminates the dynamic import in prod bundles, and
 *  - `react-scan` is imported lazily (`await import(...)`) so it is not pulled
 *    into the main client chunk and stays out of the `.size-limit.json` budget.
 *
 * Call `initReactScanDev()` from a client boot effect behind the same dev guard.
 */

let started = false;

/**
 * Enable react-scan in development only. No-op during SSR, in production, and on
 * repeat calls. Failures are swallowed — a dev profiler must never break boot.
 */
export function initReactScanDev(): void {
  if (started) return;
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "production") return;
  started = true;

  // Lazy import so the bundler keeps react-scan out of the production/main chunk.
  void import("react-scan")
    .then(({ scan }) => {
      scan({
        enabled: true,
        // Keep the dev overlay quiet by default; flip these locally as needed.
        log: false,
        showToolbar: true,
      });
    })
    .catch(() => {
      /* dev-only tooling — ignore if react-scan is unavailable */
    });
}
