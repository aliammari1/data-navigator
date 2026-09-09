/**
 * driver.js tour runner — the SINGLE place in the app that touches driver.js.
 *
 * Replaces the dead, mis-wired `react-joyride` `OnboardingTour.tsx` (which used
 * the wrong v3 `onEvent`/`options={…}` API and was never mounted). driver.js is
 * ~5KB, zero-dependency, MIT, and fully offline — the only asset is its bundled
 * CSS, imported here so the bundler inlines it (never a CDN).
 *
 * Responsibilities the imperative driver.js core does NOT give you:
 * - **skip-if-missing**: drop steps whose target never appears so a collapsed
 *   sidebar / small screen can't stall the tour.
 * - **route navigation between steps**: push the App Router route for the next
 *   step and wait for its target before advancing.
 * - **persistence**: write completion + furthest step to Dexie (not
 *   localStorage), keyed per tour.
 */

import { type Driver, driver } from "driver.js";
import "driver.js/dist/driver.css";

import { isAnchorlessStep, type TourDefinition, type TourStepDef } from "../data/tours";
import { saveTourProgress } from "./onboarding-db";

/** Navigate the App Router to `href` (injected so this stays framework-light). */
export type NavigateFn = (href: string) => void;

export interface TourRunner {
  /** Start a tour from step 0 (resolving/skipping missing anchors first). */
  start: (tour: TourDefinition) => Promise<void>;
  /** Stop and tear down the active tour, if any. */
  stop: () => void;
  /** Whether a tour is currently being driven. */
  isActive: () => boolean;
}

/**
 * Poll for a selector to appear, resolving `true` once present or `false` after
 * `timeoutMs`. `"body"`/anchor-less steps resolve immediately.
 */
function waitForSelector(selector: string, timeoutMs = 4000): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(false);
  if (!selector || selector === "body") return Promise.resolve(true);
  if (document.querySelector(selector)) return Promise.resolve(true);

  return new Promise((resolve) => {
    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
    const id = window.setInterval(() => {
      if (document.querySelector(selector)) {
        window.clearInterval(id);
        resolve(true);
      } else if (now() - start > timeoutMs) {
        window.clearInterval(id);
        resolve(false);
      }
    }, 60);
  });
}

/**
 * Resolve which steps can actually run: keep anchor-less steps, keep steps
 * whose target is already present, and — for steps that declare a `route` —
 * keep them optimistically (the runner navigates + waits at click time).
 * Steps with a static selector that is absent AND have no route are dropped.
 */
function resolveRunnableSteps(steps: TourStepDef[]): TourStepDef[] {
  if (typeof document === "undefined") return steps;
  return steps.filter((step) => {
    if (isAnchorlessStep(step)) return true;
    if (step.route) return true; // navigation may bring the target into view
    return document.querySelector(step.element) !== null;
  });
}

export function createTourRunner(navigate: NavigateFn): TourRunner {
  let active: Driver | null = null;

  function stop() {
    if (active) {
      const d = active;
      active = null;
      d.destroy();
    }
  }

  async function start(tour: TourDefinition): Promise<void> {
    if (typeof window === "undefined") return;

    // Always tear down a previous tour before starting a new one.
    stop();

    const steps = resolveRunnableSteps(tour.steps);
    if (steps.length === 0) return;

    let furthest = 0;

    const persist = (completed: boolean, reached: number) =>
      void saveTourProgress({
        tourId: tour.id,
        completed,
        stepReached: reached,
      });

    const d = driver({
      animate: true,
      showProgress: steps.length > 1,
      allowClose: true,
      overlayColor: "rgba(0,0,0,0.55)",
      stagePadding: 6,
      stageRadius: 8,
      smoothScroll: true,
      steps: steps.map((s) => ({ element: s.element, popover: s.popover })),
      onHighlightStarted: (_el, _step, { state }) => {
        furthest = Math.max(furthest, state.activeIndex ?? furthest);
      },
      onNextClick: async (_el, _step, { state }) => {
        const current = state.activeIndex ?? 0;
        const next = steps[current + 1];

        // Navigate + wait for the next step's target before advancing so a
        // route change can bring the anchor into the DOM.
        if (next?.route && window.location.pathname !== next.route) {
          navigate(next.route);
        }
        if (next && !isAnchorlessStep(next)) {
          const found = await waitForSelector(next.element);
          if (!found && d.isActive()) {
            // Target never appeared — skip it rather than stall.
            if (d.hasNextStep()) {
              d.moveTo(current + 2);
            } else {
              d.destroy();
            }
            return;
          }
        }
        if (!d.isActive()) return;
        if (d.hasNextStep()) {
          d.moveNext();
        } else {
          d.destroy();
        }
      },
      onPrevClick: async (_el, _step, { state }) => {
        const current = state.activeIndex ?? 0;
        const prev = steps[current - 1];
        if (prev?.route && window.location.pathname !== prev.route) {
          navigate(prev.route);
          if (!isAnchorlessStep(prev)) await waitForSelector(prev.element);
        }
        if (d.isActive()) d.movePrevious();
      },
      onDestroyed: () => {
        // Reaching the final step (or closing) ends the tour. Mark complete
        // only if the user reached the last resolvable step.
        const completed = furthest >= steps.length - 1;
        persist(completed, furthest);
        active = null;
      },
    });

    active = d;

    // If the first step targets a route, make sure we're there first.
    const first = steps[0];
    if (first.route && window.location.pathname !== first.route) {
      navigate(first.route);
      if (!isAnchorlessStep(first)) await waitForSelector(first.element);
    }
    if (active === d) d.drive();
  }

  return { start, stop, isActive: () => active?.isActive() ?? false };
}
