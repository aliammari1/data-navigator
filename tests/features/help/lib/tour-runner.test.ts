import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks (true boundaries only) ────────────────────────────────────────────
//
// `driver.js` is the imperative third-party tour engine — the single external
// boundary the runner drives. We replace `driver()` with a factory that captures
// the passed config and hands back a fully controllable fake `Driver` whose
// methods are spies with tunable return values. This lets each test invoke the
// lifecycle hooks (onHighlightStarted / onNextClick / onPrevClick / onDestroyed)
// the way the real engine would and assert exactly what the runner does.
//
// `./onboarding-db` writes to Dexie/IndexedDB — also a boundary — so we stub
// `saveTourProgress`. Everything else (`../data/tours`, including the pure
// `isAnchorlessStep`) is exercised for real.

const driverMock = vi.fn();
vi.mock("driver.js", () => ({
  driver: (config: unknown) => driverMock(config),
}));
// The bundled CSS import must resolve to *something* in jsdom.
vi.mock("driver.js/dist/driver.css", () => ({}));

const saveTourProgressMock = vi.fn(async () => {});
vi.mock("@/features/help/lib/onboarding-db", () => ({
  saveTourProgress: (input: unknown) => saveTourProgressMock(input),
}));

import { createTourRunner, type NavigateFn } from "@/features/help/lib/tour-runner";
import type { TourDefinition, TourStepDef } from "@/features/help/data/tours";

// ─── Fake Driver factory ─────────────────────────────────────────────────────

interface FakeDriver {
  isActive: ReturnType<typeof vi.fn>;
  drive: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  moveNext: ReturnType<typeof vi.fn>;
  movePrevious: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  hasNextStep: ReturnType<typeof vi.fn>;
  hasPreviousStep: ReturnType<typeof vi.fn>;
}

/** A controllable stand-in for a driver.js `Driver` instance. */
function makeFakeDriver(overrides: Partial<Record<keyof FakeDriver, boolean>> = {}): FakeDriver {
  return {
    isActive: vi.fn(() => overrides.isActive ?? true),
    drive: vi.fn(),
    destroy: vi.fn(),
    moveNext: vi.fn(),
    movePrevious: vi.fn(),
    moveTo: vi.fn(),
    hasNextStep: vi.fn(() => overrides.hasNextStep ?? true),
    hasPreviousStep: vi.fn(() => overrides.hasPreviousStep ?? true),
  };
}

/** Grab the config object the runner handed to `driver()` on its Nth call. */
function capturedConfig(callIndex = 0): Record<string, any> {
  return driverMock.mock.calls[callIndex]?.[0] as Record<string, any>;
}

// ─── Step / tour builders ────────────────────────────────────────────────────

const step = (overrides: Partial<TourStepDef> = {}): TourStepDef => ({
  element: overrides.element ?? "body",
  route: overrides.route,
  popover: overrides.popover ?? { title: "t", description: "d" },
});

const tour = (steps: TourStepDef[], id = "test-tour"): TourDefinition => ({
  id,
  title: "Test",
  description: "desc",
  steps,
});

/** Synthetic hook context shaped like driver.js's `{ state }`. */
const ctx = (activeIndex: number | undefined) =>
  ({ state: { activeIndex } }) as Parameters<NonNullable<unknown>>[never] as any;

/**
 * Drive a promise that internally polls via `setInterval` + `performance.now()`
 * to settlement WITHOUT burning real wall-clock time. Used for the
 * `waitForSelector` timeout paths (4s real → instant fake). Requires fake timers
 * to be active. We advance past the 4000ms `timeoutMs` in 60ms ticks, yielding
 * to the microtask queue between batches so the awaited `resolve(false)` lands.
 */
async function settleWithFakeTimers<T>(promise: Promise<T>): Promise<T> {
  let settled = false;
  const tracked = promise.then(
    (v) => {
      settled = true;
      return v;
    },
    (e) => {
      settled = true;
      throw e;
    },
  );
  // 4000ms timeout / 60ms tick ≈ 67 ticks; advance generously with a hard cap.
  for (let i = 0; i < 200 && !settled; i++) {
    await vi.advanceTimersByTimeAsync(120);
  }
  return tracked;
}

// ─── Shared fixtures ─────────────────────────────────────────────────────────

let navigate: ReturnType<typeof vi.fn>;
let anchors: HTMLElement[];

/** Add a real element so `document.querySelector(selector)` finds it. */
function mountAnchor(href: string): HTMLElement {
  const a = document.createElement("a");
  a.setAttribute("href", href);
  document.body.appendChild(a);
  anchors.push(a);
  return a;
}

beforeEach(() => {
  navigate = vi.fn();
  anchors = [];
  driverMock.mockReset();
  saveTourProgressMock.mockClear();
  // Default: every start() gets a fresh, fully-active fake driver.
  driverMock.mockImplementation(() => makeFakeDriver());
  // Reset the route between tests (jsdom default is "/").
  window.history.replaceState({}, "", "/");
  // Fake timers keep the `waitForSelector` polling (setInterval +
  // performance.now) deterministic and instant — no 4s real waits. We fake
  // performance too so the timeout math advances with the virtual clock.
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "Date", "performance"] });
});

afterEach(() => {
  vi.useRealTimers();
  for (const a of anchors) a.remove();
  document.body.innerHTML = "";
});

// =============================================================================
// resolveRunnableSteps (via start) — which steps survive the runnable filter
// =============================================================================

describe("createTourRunner.start — runnable-step resolution", () => {
  it("does not start (no driver created) when every static-selector step is missing", async () => {
    const runner = createTourRunner(navigate);
    // A selector-only step whose target is absent AND no route → dropped.
    await runner.start(tour([step({ element: "[data-tour='nope']" })]));

    expect(driverMock).not.toHaveBeenCalled();
  });

  it("keeps an anchor-less ('body') step even when nothing is in the DOM", async () => {
    const runner = createTourRunner(navigate);
    await runner.start(tour([step({ element: "body" })]));

    expect(driverMock).toHaveBeenCalledTimes(1);
    expect(capturedConfig().steps).toHaveLength(1);
  });

  it("keeps an empty-string element step (also anchor-less)", async () => {
    const runner = createTourRunner(navigate);
    await runner.start(tour([step({ element: "" })]));

    expect(capturedConfig().steps).toHaveLength(1);
  });

  it("keeps a static-selector step when its target is already present", async () => {
    mountAnchor("/dashboard/upload");
    const runner = createTourRunner(navigate);
    await runner.start(tour([step({ element: '[href="/dashboard/upload"]' })]));

    expect(capturedConfig().steps).toHaveLength(1);
  });

  it("keeps a missing-target step optimistically when it declares a route", async () => {
    const runner = createTourRunner(navigate);
    // First-step routing navigates then waits for the (absent) target; the
    // driver is still created with the step, then drive() runs after the wait.
    await settleWithFakeTimers(
      runner.start(
        tour([step({ element: "[data-tour='later']", route: "/dashboard/deep-analytics" })]),
      ),
    );

    // No DOM target, but the route lets navigation bring it in at click time.
    expect(capturedConfig().steps).toHaveLength(1);
  });

  it("drops only the unresolvable steps and keeps the rest, preserving order", async () => {
    mountAnchor("/dashboard/upload");
    const runner = createTourRunner(navigate);
    await runner.start(
      tour([
        step({ element: "body" }), // kept (anchorless)
        step({ element: "[data-tour='ghost']" }), // dropped (absent, no route)
        step({ element: '[href="/dashboard/upload"]' }), // kept (present)
        step({ element: "[data-tour='routed']", route: "/x" }), // kept (route)
      ]),
    );

    const els = capturedConfig().steps.map((s: { element: string }) => s.element);
    expect(els).toEqual(["body", '[href="/dashboard/upload"]', "[data-tour='routed']"]);
  });
});

// =============================================================================
// driver() config wiring
// =============================================================================

describe("createTourRunner.start — driver config", () => {
  it("enables progress UI only when more than one step survives", async () => {
    mountAnchor("/a");
    mountAnchor("/b");
    const runner = createTourRunner(navigate);
    await runner.start(
      tour([step({ element: '[href="/a"]' }), step({ element: '[href="/b"]' })]),
    );

    expect(capturedConfig().showProgress).toBe(true);
  });

  it("disables progress UI for a single-step tour", async () => {
    const runner = createTourRunner(navigate);
    await runner.start(tour([step({ element: "body" })]));

    expect(capturedConfig().showProgress).toBe(false);
  });

  it("maps each step to { element, popover } and carries the popover through", async () => {
    const runner = createTourRunner(navigate);
    const pop = { title: "Hello", description: "World", align: "center" as const };
    await runner.start(tour([step({ element: "body", popover: pop })]));

    expect(capturedConfig().steps).toEqual([{ element: "body", popover: pop }]);
  });

  it("calls d.drive() to begin the tour once the driver is the active one", async () => {
    const fake = makeFakeDriver();
    driverMock.mockImplementation(() => fake);
    const runner = createTourRunner(navigate);

    await runner.start(tour([step({ element: "body" })]));

    expect(fake.drive).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// First-step route navigation
// =============================================================================

describe("createTourRunner.start — first-step routing", () => {
  it("navigates to the first step's route when not already there", async () => {
    window.history.replaceState({}, "", "/dashboard");
    const runner = createTourRunner(navigate);
    await runner.start(
      tour([step({ element: "body", route: "/dashboard/upload" })]),
    );

    expect(navigate).toHaveBeenCalledWith("/dashboard/upload");
  });

  it("does NOT navigate when already on the first step's route", async () => {
    window.history.replaceState({}, "", "/dashboard/upload");
    const runner = createTourRunner(navigate);
    await runner.start(
      tour([step({ element: "body", route: "/dashboard/upload" })]),
    );

    expect(navigate).not.toHaveBeenCalled();
  });

  it("does NOT navigate when the first step has no route", async () => {
    const runner = createTourRunner(navigate);
    await runner.start(tour([step({ element: "body" })]));

    expect(navigate).not.toHaveBeenCalled();
  });

  it("waits for the first step's selector after navigating (non-anchorless)", async () => {
    window.history.replaceState({}, "", "/dashboard");
    // Target is present, so waitForSelector resolves immediately and drive() runs.
    mountAnchor("/dashboard/upload");
    const fake = makeFakeDriver();
    driverMock.mockImplementation(() => fake);
    const runner = createTourRunner(navigate);

    await runner.start(
      tour([step({ element: '[href="/dashboard/upload"]', route: "/dashboard/upload" })]),
    );

    expect(navigate).toHaveBeenCalledWith("/dashboard/upload");
    expect(fake.drive).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// onHighlightStarted — furthest-step tracking
// =============================================================================

describe("onHighlightStarted — furthest tracking", () => {
  it("advances `furthest` so onDestroyed marks a fully-walked tour complete", async () => {
    mountAnchor("/a");
    mountAnchor("/b");
    const runner = createTourRunner(navigate);
    await runner.start(
      tour([step({ element: '[href="/a"]' }), step({ element: '[href="/b"]' })], "walk"),
    );

    const cfg = capturedConfig();
    // Simulate the engine highlighting step 0 then step 1 (the last index).
    cfg.onHighlightStarted(undefined, undefined, ctx(0));
    cfg.onHighlightStarted(undefined, undefined, ctx(1));
    cfg.onDestroyed(undefined, undefined, ctx(1));

    expect(saveTourProgressMock).toHaveBeenCalledWith({
      tourId: "walk",
      completed: true,
      stepReached: 1,
    });
  });

  it("never lets `furthest` regress when a later highlight reports a lower index", async () => {
    mountAnchor("/a");
    mountAnchor("/b");
    const runner = createTourRunner(navigate);
    await runner.start(
      tour([step({ element: '[href="/a"]' }), step({ element: '[href="/b"]' })], "regress"),
    );

    const cfg = capturedConfig();
    cfg.onHighlightStarted(undefined, undefined, ctx(1)); // reached last
    cfg.onHighlightStarted(undefined, undefined, ctx(0)); // back to first
    cfg.onDestroyed(undefined, undefined, ctx(0));

    // furthest stays at 1 → completed.
    expect(saveTourProgressMock).toHaveBeenCalledWith({
      tourId: "regress",
      completed: true,
      stepReached: 1,
    });
  });

  it("falls back to the existing furthest when activeIndex is undefined", async () => {
    const runner = createTourRunner(navigate);
    await runner.start(tour([step({ element: "body" })], "noidx"));

    const cfg = capturedConfig();
    // activeIndex undefined → Math.max(furthest, furthest) stays 0.
    cfg.onHighlightStarted(undefined, undefined, ctx(undefined));
    cfg.onDestroyed(undefined, undefined, ctx(undefined));

    expect(saveTourProgressMock).toHaveBeenCalledWith({
      tourId: "noidx",
      completed: true, // single step: furthest(0) >= steps.length-1 (0)
      stepReached: 0,
    });
  });
});

// =============================================================================
// onDestroyed — persistence + completion semantics
// =============================================================================

describe("onDestroyed — persistence", () => {
  it("marks NOT completed when the user left before the last step", async () => {
    mountAnchor("/a");
    mountAnchor("/b");
    mountAnchor("/c");
    const runner = createTourRunner(navigate);
    await runner.start(
      tour(
        [
          step({ element: '[href="/a"]' }),
          step({ element: '[href="/b"]' }),
          step({ element: '[href="/c"]' }),
        ],
        "early-exit",
      ),
    );

    const cfg = capturedConfig();
    cfg.onHighlightStarted(undefined, undefined, ctx(1)); // reached only step 1 of 3
    cfg.onDestroyed(undefined, undefined, ctx(1));

    expect(saveTourProgressMock).toHaveBeenCalledWith({
      tourId: "early-exit",
      completed: false, // furthest 1 < steps.length-1 (2)
      stepReached: 1,
    });
  });

  it("persists with furthest=0 and completed=false when destroyed without any highlight on a multi-step tour", async () => {
    mountAnchor("/a");
    mountAnchor("/b");
    const runner = createTourRunner(navigate);
    await runner.start(
      tour([step({ element: '[href="/a"]' }), step({ element: '[href="/b"]' })], "nohi"),
    );

    capturedConfig().onDestroyed(undefined, undefined, ctx(0));

    expect(saveTourProgressMock).toHaveBeenCalledWith({
      tourId: "nohi",
      completed: false,
      stepReached: 0,
    });
  });

  it("clears the active driver so isActive() reports false afterwards", async () => {
    const fake = makeFakeDriver();
    driverMock.mockImplementation(() => fake);
    const runner = createTourRunner(navigate);
    await runner.start(tour([step({ element: "body" })], "clear"));

    expect(runner.isActive()).toBe(true); // fake.isActive() → true while active

    capturedConfig().onDestroyed(undefined, undefined, ctx(0));

    // active set to null inside onDestroyed → isActive() short-circuits to false.
    expect(runner.isActive()).toBe(false);
  });
});

// =============================================================================
// onNextClick — navigation, skip-on-missing, advance, finish
// =============================================================================

describe("onNextClick", () => {
  it("navigates to the next step's route when it differs from the current path", async () => {
    window.history.replaceState({}, "", "/dashboard/upload");
    mountAnchor("/dashboard/ai-analysis"); // make the next target resolvable
    const fake = makeFakeDriver();
    driverMock.mockImplementation(() => fake);
    const runner = createTourRunner(navigate);

    await runner.start(
      tour([
        step({ element: "body" }),
        step({
          element: '[href="/dashboard/ai-analysis"]',
          route: "/dashboard/ai-analysis",
        }),
      ]),
    );

    await capturedConfig().onNextClick(undefined, undefined, ctx(0));

    expect(navigate).toHaveBeenCalledWith("/dashboard/ai-analysis");
    expect(fake.moveNext).toHaveBeenCalledTimes(1);
  });

  it("does NOT navigate when the next step's route equals the current path", async () => {
    window.history.replaceState({}, "", "/same");
    mountAnchor("/t");
    const runner = createTourRunner(navigate);
    await runner.start(
      tour([
        step({ element: "body" }),
        step({ element: '[href="/t"]', route: "/same" }),
      ]),
    );

    await capturedConfig().onNextClick(undefined, undefined, ctx(0));

    expect(navigate).not.toHaveBeenCalled();
  });

  it("advances with moveNext when the next anchor-less step needs no waiting", async () => {
    mountAnchor("/a");
    const fake = makeFakeDriver();
    driverMock.mockImplementation(() => fake);
    const runner = createTourRunner(navigate);
    // step0 present, step1 is anchorless body → no waitForSelector.
    await runner.start(tour([step({ element: '[href="/a"]' }), step({ element: "body" })]));

    await capturedConfig().onNextClick(undefined, undefined, ctx(0));

    expect(fake.moveNext).toHaveBeenCalledTimes(1);
    expect(fake.moveTo).not.toHaveBeenCalled();
  });

  it("skips a missing next target via moveTo(current+2) when more steps remain", async () => {
    mountAnchor("/a");
    const fake = makeFakeDriver({ hasNextStep: true });
    driverMock.mockImplementation(() => fake);
    const runner = createTourRunner(navigate);
    // step1 has a route (so it survives the filter) but its target never mounts.
    await runner.start(
      tour([
        step({ element: '[href="/a"]' }),
        step({ element: "[data-tour='never']", route: "/r" }),
        step({ element: "body" }),
      ]),
    );

    // waitForSelector polls until timeout (target absent) → resolves false.
    await settleWithFakeTimers(capturedConfig().onNextClick(undefined, undefined, ctx(0)));

    expect(fake.moveTo).toHaveBeenCalledWith(2);
    expect(fake.moveNext).not.toHaveBeenCalled();
  });

  it("destroys instead of skipping when the missing target is the last step", async () => {
    mountAnchor("/a");
    const fake = makeFakeDriver({ hasNextStep: false });
    driverMock.mockImplementation(() => fake);
    const runner = createTourRunner(navigate);
    await runner.start(
      tour([
        step({ element: '[href="/a"]' }),
        step({ element: "[data-tour='never']", route: "/r" }),
      ]),
    );

    await settleWithFakeTimers(capturedConfig().onNextClick(undefined, undefined, ctx(0)));

    expect(fake.destroy).toHaveBeenCalledTimes(1);
    expect(fake.moveTo).not.toHaveBeenCalled();
    expect(fake.moveNext).not.toHaveBeenCalled();
  });

  it("does nothing further once the missing-target branch returns (no double action)", async () => {
    mountAnchor("/a");
    const fake = makeFakeDriver({ hasNextStep: true });
    driverMock.mockImplementation(() => fake);
    const runner = createTourRunner(navigate);
    await runner.start(
      tour([
        step({ element: '[href="/a"]' }),
        step({ element: "[data-tour='never']", route: "/r" }),
        step({ element: "body" }),
      ]),
    );

    await settleWithFakeTimers(capturedConfig().onNextClick(undefined, undefined, ctx(0)));

    // The early `return` after moveTo means moveNext/destroy are not also called.
    expect(fake.moveNext).not.toHaveBeenCalled();
    expect(fake.destroy).not.toHaveBeenCalled();
  });

  it("finishes via destroy() when advancing past the final step (hasNextStep=false)", async () => {
    mountAnchor("/a");
    mountAnchor("/b");
    const fake = makeFakeDriver({ hasNextStep: false });
    driverMock.mockImplementation(() => fake);
    const runner = createTourRunner(navigate);
    await runner.start(
      tour([step({ element: '[href="/a"]' }), step({ element: '[href="/b"]' })]),
    );

    // From the last real step: next step is undefined → no wait, falls through.
    await capturedConfig().onNextClick(undefined, undefined, ctx(1));

    expect(fake.destroy).toHaveBeenCalledTimes(1);
    expect(fake.moveNext).not.toHaveBeenCalled();
  });

  it("aborts (no advance) when the driver became inactive before the wait resolved", async () => {
    mountAnchor("/a");
    // isActive() reports false → the `if (!d.isActive()) return;` guard fires.
    const fake = makeFakeDriver({ isActive: false });
    driverMock.mockImplementation(() => fake);
    const runner = createTourRunner(navigate);
    await runner.start(tour([step({ element: '[href="/a"]' }), step({ element: "body" })]));

    await capturedConfig().onNextClick(undefined, undefined, ctx(0));

    expect(fake.moveNext).not.toHaveBeenCalled();
    expect(fake.destroy).not.toHaveBeenCalled();
    expect(fake.moveTo).not.toHaveBeenCalled();
  });

  it("treats undefined activeIndex as step 0 when computing the next step", async () => {
    mountAnchor("/a");
    const fake = makeFakeDriver();
    driverMock.mockImplementation(() => fake);
    const runner = createTourRunner(navigate);
    await runner.start(tour([step({ element: '[href="/a"]' }), step({ element: "body" })]));

    // activeIndex undefined → current=0 → next=steps[1] (body, anchorless) → moveNext.
    await capturedConfig().onNextClick(undefined, undefined, ctx(undefined));

    expect(fake.moveNext).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// onPrevClick — back navigation
// =============================================================================

describe("onPrevClick", () => {
  it("navigates back to the previous step's route then movesPrevious", async () => {
    window.history.replaceState({}, "", "/dashboard/ai-analysis");
    mountAnchor("/dashboard/upload");
    const fake = makeFakeDriver();
    driverMock.mockImplementation(() => fake);
    const runner = createTourRunner(navigate);
    await runner.start(
      tour([
        step({ element: '[href="/dashboard/upload"]', route: "/dashboard/upload" }),
        step({ element: "body" }),
      ]),
    );

    // Going back from index 1 → prev=steps[0] which has a differing route.
    await capturedConfig().onPrevClick(undefined, undefined, ctx(1));

    expect(navigate).toHaveBeenCalledWith("/dashboard/upload");
    expect(fake.movePrevious).toHaveBeenCalledTimes(1);
  });

  it("does NOT navigate back when already on the previous step's route", async () => {
    window.history.replaceState({}, "", "/dashboard/upload");
    mountAnchor("/dashboard/upload");
    const fake = makeFakeDriver();
    driverMock.mockImplementation(() => fake);
    const runner = createTourRunner(navigate);
    await runner.start(
      tour([
        step({ element: '[href="/dashboard/upload"]', route: "/dashboard/upload" }),
        step({ element: "body" }),
      ]),
    );

    await capturedConfig().onPrevClick(undefined, undefined, ctx(1));

    expect(navigate).not.toHaveBeenCalled();
    expect(fake.movePrevious).toHaveBeenCalledTimes(1);
  });

  it("moves previous without navigating when the previous step has no route", async () => {
    mountAnchor("/a");
    const fake = makeFakeDriver();
    driverMock.mockImplementation(() => fake);
    const runner = createTourRunner(navigate);
    await runner.start(tour([step({ element: "body" }), step({ element: '[href="/a"]' })]));

    await capturedConfig().onPrevClick(undefined, undefined, ctx(1));

    expect(navigate).not.toHaveBeenCalled();
    expect(fake.movePrevious).toHaveBeenCalledTimes(1);
  });

  it("does not move previous when the driver is no longer active", async () => {
    mountAnchor("/a");
    const fake = makeFakeDriver({ isActive: false });
    driverMock.mockImplementation(() => fake);
    const runner = createTourRunner(navigate);
    await runner.start(tour([step({ element: "body" }), step({ element: '[href="/a"]' })]));

    await capturedConfig().onPrevClick(undefined, undefined, ctx(1));

    expect(fake.movePrevious).not.toHaveBeenCalled();
  });

  it("handles a missing previous step (index 0 → prev undefined) without navigating", async () => {
    const fake = makeFakeDriver();
    driverMock.mockImplementation(() => fake);
    const runner = createTourRunner(navigate);
    await runner.start(tour([step({ element: "body" })]));

    // current 0 → steps[-1] is undefined → prev?.route is skipped, still movesPrevious.
    await capturedConfig().onPrevClick(undefined, undefined, ctx(0));

    expect(navigate).not.toHaveBeenCalled();
    expect(fake.movePrevious).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// stop() + isActive()
// =============================================================================

describe("stop / isActive", () => {
  it("isActive() returns false before any tour has started", () => {
    const runner = createTourRunner(navigate);
    expect(runner.isActive()).toBe(false);
  });

  it("isActive() reflects the active driver's isActive() once started", async () => {
    driverMock.mockImplementation(() => makeFakeDriver({ isActive: true }));
    const runner = createTourRunner(navigate);
    await runner.start(tour([step({ element: "body" })]));

    expect(runner.isActive()).toBe(true);
  });

  it("isActive() returns false when the underlying driver reports inactive", async () => {
    driverMock.mockImplementation(() => makeFakeDriver({ isActive: false }));
    const runner = createTourRunner(navigate);
    await runner.start(tour([step({ element: "body" })]));

    expect(runner.isActive()).toBe(false);
  });

  it("stop() destroys the active driver and clears active", async () => {
    const fake = makeFakeDriver();
    driverMock.mockImplementation(() => fake);
    const runner = createTourRunner(navigate);
    await runner.start(tour([step({ element: "body" })]));

    runner.stop();

    expect(fake.destroy).toHaveBeenCalledTimes(1);
    expect(runner.isActive()).toBe(false);
  });

  it("stop() is a safe no-op when no tour is active", () => {
    const runner = createTourRunner(navigate);
    expect(() => runner.stop()).not.toThrow();
  });

  it("stop() nulls `active` BEFORE destroy so a destroy-triggered re-entrancy sees no active driver", async () => {
    // Mirrors the runner's ordering: active=null then d.destroy(). If destroy
    // synchronously called back into the runner, isActive() would already be false.
    const fake = makeFakeDriver();
    let activeDuringDestroy: boolean | null = null;
    fake.destroy.mockImplementation(() => {
      activeDuringDestroy = runner.isActive();
    });
    driverMock.mockImplementation(() => fake);
    const runner = createTourRunner(navigate);
    await runner.start(tour([step({ element: "body" })]));

    runner.stop();

    expect(activeDuringDestroy).toBe(false);
  });
});

// =============================================================================
// start() — teardown of a prior tour + empty-tour guard
// =============================================================================

describe("start — lifecycle guards", () => {
  it("tears down a previously-running tour before starting a new one", async () => {
    const first = makeFakeDriver();
    const second = makeFakeDriver();
    driverMock.mockImplementationOnce(() => first).mockImplementationOnce(() => second);
    const runner = createTourRunner(navigate);

    await runner.start(tour([step({ element: "body" })], "one"));
    await runner.start(tour([step({ element: "body" })], "two"));

    // The first driver is destroyed by the implicit stop() inside the 2nd start.
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(second.drive).toHaveBeenCalledTimes(1);
  });

  it("returns early without creating a driver when no steps are runnable", async () => {
    const runner = createTourRunner(navigate);
    await runner.start(tour([step({ element: "[data-tour='absent']" })]));

    expect(driverMock).not.toHaveBeenCalled();
    expect(saveTourProgressMock).not.toHaveBeenCalled();
  });

  it("returns early when the tour has no steps at all", async () => {
    const runner = createTourRunner(navigate);
    await runner.start(tour([]));

    expect(driverMock).not.toHaveBeenCalled();
  });
});

// =============================================================================
// waitForSelector — polling resolves true when element appears during interval
// =============================================================================

describe("waitForSelector — element appears during polling (lines 50-51)", () => {
  it("resolves true via the interval callback when the target mounts after the poll starts", async () => {
    // The next step's element is absent when onNextClick is called, so
    // waitForSelector enters the interval loop. We add the element to the DOM
    // after one tick so the interval callback's querySelector() branch fires.
    const selector = "[data-tour='late-arrival']";
    const fake = makeFakeDriver({ isActive: true, hasNextStep: true });
    driverMock.mockImplementation(() => fake);
    const runner = createTourRunner(navigate);

    await runner.start(
      tour([
        step({ element: "body" }),
        // step[1]: selector-based, NOT in DOM yet — survives filter because it
        // has a route, so resolveRunnableSteps keeps it optimistically.
        step({ element: selector, route: "/r" }),
        step({ element: "body" }),
      ]),
    );

    const cfg = capturedConfig();

    // Kick off onNextClick — this calls waitForSelector(selector) which enters
    // the setInterval loop because the element isn't in the DOM yet.
    const clickPromise = cfg.onNextClick(undefined, undefined, ctx(0));

    // Advance one interval tick (60ms) without adding the element — selector absent.
    await vi.advanceTimersByTimeAsync(60);

    // Now add the element so the NEXT interval tick finds it (lines 50-51).
    const el = document.createElement("div");
    el.setAttribute("data-tour", "late-arrival");
    document.body.appendChild(el);
    anchors.push(el);

    // Advance another tick so the interval callback runs and finds the element.
    await vi.advanceTimersByTimeAsync(120);

    await clickPromise;

    // waitForSelector resolved true → no skip, driver advances normally.
    expect(fake.moveNext).toHaveBeenCalledTimes(1);
    expect(fake.moveTo).not.toHaveBeenCalled();
  });

  it("resolves true via the interval when performance is unavailable (Date.now fallback)", async () => {
    // Cover the `Date.now()` fallback branch in lines 46-47 by temporarily
    // removing performance from the global scope during the wait.
    const selector = "[data-tour='date-now-path']";
    const fake = makeFakeDriver({ isActive: true, hasNextStep: true });
    driverMock.mockImplementation(() => fake);
    const runner = createTourRunner(navigate);

    await runner.start(
      tour([
        step({ element: "body" }),
        step({ element: selector, route: "/r" }),
        step({ element: "body" }),
      ]),
    );

    const cfg = capturedConfig();

    // Remove performance so the ternary falls back to Date.now().
    const originalPerformance = globalThis.performance;
    // @ts-expect-error intentionally removing performance to test Date.now fallback
    delete globalThis.performance;

    const clickPromise = cfg.onNextClick(undefined, undefined, ctx(0));

    // Advance one tick without the element.
    await vi.advanceTimersByTimeAsync(60);

    // Add the element so the next tick resolves true.
    const el = document.createElement("div");
    el.setAttribute("data-tour", "date-now-path");
    document.body.appendChild(el);
    anchors.push(el);

    // Advance another tick so interval finds the element.
    await vi.advanceTimersByTimeAsync(120);

    await clickPromise;

    // Restore performance.
    globalThis.performance = originalPerformance;

    expect(fake.moveNext).toHaveBeenCalledTimes(1);
    expect(fake.moveTo).not.toHaveBeenCalled();
  });
});

// =============================================================================
// onPrevClick — uncovered branch paths
// =============================================================================

describe("onPrevClick — additional branch coverage", () => {
  it("uses activeIndex=0 as fallback when activeIndex is undefined (line 145 ?? branch)", async () => {
    const fake = makeFakeDriver();
    driverMock.mockImplementation(() => fake);
    const runner = createTourRunner(navigate);
    await runner.start(tour([step({ element: "body" }), step({ element: "body" })]));

    // ctx(undefined) → current = undefined ?? 0 = 0 → prev = steps[-1] = undefined
    // → no navigation, just movePrevious.
    await capturedConfig().onPrevClick(undefined, undefined, ctx(undefined));

    expect(navigate).not.toHaveBeenCalled();
    expect(fake.movePrevious).toHaveBeenCalledTimes(1);
  });

  it("skips waitForSelector when previous step with route IS anchorless (line 149 false branch)", async () => {
    // prev is anchorless (element="" or "body") but has a route.
    // The branch `if (!isAnchorlessStep(prev))` is false → no waitForSelector.
    window.history.replaceState({}, "", "/other");
    const fake = makeFakeDriver();
    driverMock.mockImplementation(() => fake);
    const runner = createTourRunner(navigate);

    await runner.start(
      tour([
        // step[0]: anchorless WITH a route — when going back to it from step[1],
        // we navigate but do NOT await waitForSelector (it's anchorless).
        step({ element: "body", route: "/target" }),
        step({ element: "body" }),
      ]),
    );

    await capturedConfig().onPrevClick(undefined, undefined, ctx(1));

    // navigate was called (route differs from "/other").
    expect(navigate).toHaveBeenCalledWith("/target");
    // movePrevious was called without any wait — fake timer not needed.
    expect(fake.movePrevious).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// start() — active guard before drive() (line 170)
// =============================================================================

describe("start — active guard before drive (line 170)", () => {
  it("does not call drive() when stop() is called after navigate+wait but before drive()", async () => {
    // To hit the `if (active === d)` false branch, we need stop() to run
    // between the first-step route navigation and d.drive().
    // We fake a stop() inside the navigate callback so it fires synchronously.
    window.history.replaceState({}, "", "/");
    // First step: has a route AND a real selector that's absent → waitForSelector
    // will enter the interval loop; stop() fires while we're waiting.
    const selector = "[data-tour='before-drive']";
    const fake = makeFakeDriver();
    driverMock.mockImplementation(() => fake);

    let runnerRef: ReturnType<typeof createTourRunner>;
    const navigateSpy = vi.fn(() => {
      // Calling stop() inside navigate nulls `active` before drive() is reached.
      runnerRef.stop();
    });

    runnerRef = createTourRunner(navigateSpy);

    const startPromise = runnerRef.start(
      tour([step({ element: selector, route: "/other" })]),
    );

    // The navigate spy fired synchronously during start, calling stop() which
    // nulls active. Now settle any pending waitForSelector polling.
    await settleWithFakeTimers(startPromise);

    // active was set to null by stop() before the `if (active === d)` check,
    // so drive() must NOT have been called.
    expect(fake.drive).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Integration-style: a full real-ish tour definition flows end to end
// =============================================================================

describe("integration — real tour definitions", () => {
  it("runs a two-step real tour: highlights, advances, and persists completion", async () => {
    mountAnchor("/dashboard/upload");
    mountAnchor("/dashboard/help");
    const fake = makeFakeDriver({ hasNextStep: false });
    driverMock.mockImplementation(() => fake);
    const runner = createTourRunner(navigate);

    await runner.start(
      tour(
        [
          step({ element: '[href="/dashboard/upload"]' }),
          step({ element: '[href="/dashboard/help"]' }),
        ],
        "global-onboarding",
      ),
    );

    const cfg = capturedConfig();
    cfg.onHighlightStarted(undefined, undefined, ctx(0));
    cfg.onHighlightStarted(undefined, undefined, ctx(1));
    // User clicks next on the last step → no next route, falls to destroy().
    await cfg.onNextClick(undefined, undefined, ctx(1));
    expect(fake.destroy).toHaveBeenCalled();

    // Engine fires onDestroyed in response.
    cfg.onDestroyed(undefined, undefined, ctx(1));
    expect(saveTourProgressMock).toHaveBeenLastCalledWith({
      tourId: "global-onboarding",
      completed: true,
      stepReached: 1,
    });
  });
});
