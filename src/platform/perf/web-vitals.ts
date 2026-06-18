/**
 * Offline Web-Vitals RUM (architecture.md §13: "web-vitals (offline RUM →
 * IndexedDB)").
 *
 * Captures the Core Web Vitals (CLS, LCP, INP) — plus FCP/TTFB for context —
 * from the live renderer and appends each sample to the central Dexie app-db
 * (`perfMetrics` table) through the platform storage accessors. There is NO
 * network endpoint: this is the zero-network offline-first invariant the rest of
 * the app holds, so the data stays on-device and is read back by the dashboard's
 * perf inspector rather than shipped to a server.
 *
 * This is the renderer-side companion to the build-time budgets enforced by
 * `lighthouserc.cjs` (INP/CLS/TBT vs localhost) and `.size-limit.json`
 * (per-route / per-worker JS budgets): those gate the bundle, this measures the
 * real field experience on the user's machine.
 *
 * Browser-only: `web-vitals` touches `PerformanceObserver`/`document`, so guard
 * against SSR and call `initWebVitals()` from a client boot effect.
 */

import { type Metric, onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";
import { addPerfMetric, prunePerfMetrics } from "@/platform/storage";

let started = false;

/** Current route/pathname so samples can be grouped per-route. */
function currentRoute(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.location.pathname || "/";
  } catch {
    return "";
  }
}

/**
 * Persist one metric. Fire-and-forget: a RUM write must never block paint or
 * surface an error to the user, so failures are swallowed (the log is
 * best-effort, capped, and non-critical).
 */
function persist(metric: Metric): void {
  void addPerfMetric({
    metric: metric.name,
    value: metric.value,
    rating: metric.rating,
    route: currentRoute(),
    delta: metric.delta,
    navigationId: metric.navigationType,
    detail: {
      id: metric.id,
      navigationType: metric.navigationType,
      entryCount: Array.isArray(metric.entries) ? metric.entries.length : 0,
    },
  }).catch(() => {
    /* offline RUM is best-effort — never throw into the render path */
  });
}

/**
 * Wire up the Web-Vitals observers once. Safe to call multiple times (idempotent
 * via the `started` guard) and a no-op during SSR. `reportAllChanges: false`
 * (the default) reports the final, stable value for each metric — exactly what
 * we want for an offline log, not every interim delta.
 *
 * Also trims the RUM log on init so it cannot grow unbounded across sessions.
 */
export function initWebVitals(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  onCLS(persist);
  onLCP(persist);
  onINP(persist);
  onFCP(persist);
  onTTFB(persist);

  // Cap the append log to its newest rows (best-effort, non-blocking).
  void prunePerfMetrics().catch(() => {
    /* non-critical maintenance */
  });
}
