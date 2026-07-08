/**
 * Onboarding / help-feedback persistence.
 *
 * Local-first IndexedDB store (via Dexie, already used by
 * `@/platform/storage/app-db`) that captures help feedback and onboarding/tour
 * progress entirely on-device.
 *
 * - `feedback` replaces the previous hardcoded external "Open an issue on
 *   GitHub" link (`github.com/vercel/next.js/issues`) which was both a wrong
 *   repo and a dead link when offline.
 * - `tours` replaces the old single `localStorage["tour:completed"]` boolean
 *   with per-tour granularity (`completed`, `stepReached`, `updatedAt`) so the
 *   guided tour can be replayed, reset, and resumed.
 * - `seen` records "feature X has been seen once" flags so contextual
 *   coach-marks can be gated app-wide without re-implementing storage.
 *
 * No network, no analytics — entries never leave the machine.
 */

import Dexie, { type Table } from "dexie";

/** App version surfaced with each feedback entry for later triage. */
export const HELP_APP_VERSION = "0.1.0";

export interface FeedbackEntry {
  id?: number;
  message: string;
  route: string;
  createdAt: number;
  appVersion: string;
}

/** Per-tour completion state (replaces `localStorage["tour:completed"]`). */
export interface TourState {
  /** Stable tour id (see `data/tours.ts`). */
  tourId: string;
  completed: boolean;
  /** Highest step index the user reached (for resume / analytics). */
  stepReached: number;
  updatedAt: number;
}

/** "Feature X was seen once" flag for contextual coach-marks. */
export interface SeenFeature {
  featureId: string;
  seenAt: number;
}

class OnboardingDatabase extends Dexie {
  feedback!: Table<FeedbackEntry, number>;
  tours!: Table<TourState, string>;
  seen!: Table<SeenFeature, string>;

  constructor() {
    super("data-navigator-onboarding-v1");

    // v1 — feedback only (shipped). Never edit an existing version block.
    this.version(1).stores({
      // ++id autoincrement primary key, createdAt indexed for ordering.
      feedback: "++id, createdAt",
    });

    // v2 — add onboarding/tour state + seen-feature flags. A NEW version block
    // (never edit v1) so existing clients upgrade in place without data loss.
    this.version(2).stores({
      feedback: "++id, createdAt",
      tours: "tourId, completed, updatedAt",
      seen: "featureId, seenAt",
    });
  }
}

export const onboardingDb = new OnboardingDatabase();

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

/**
 * Persist a feedback entry locally. Returns the generated row id.
 * Trims the message and ignores empty submissions defensively.
 */
export async function addFeedback(input: {
  message: string;
  route: string;
}): Promise<number | null> {
  const message = input.message.trim();
  if (!message) return null;

  return onboardingDb.feedback.add({
    message,
    route: input.route,
    createdAt: Date.now(),
    appVersion: HELP_APP_VERSION,
  });
}

/** Most recent feedback entries first. */
export async function listFeedback(limit = 50): Promise<FeedbackEntry[]> {
  return onboardingDb.feedback.orderBy("createdAt").reverse().limit(limit).toArray();
}

/** Total number of stored feedback entries. */
export async function countFeedback(): Promise<number> {
  return onboardingDb.feedback.count();
}

/* ------------------------------------------------------------------ */
/* Tours                                                               */
/* ------------------------------------------------------------------ */

/** Read a single tour's persisted state (undefined if never started). */
export async function getTourState(tourId: string): Promise<TourState | undefined> {
  return onboardingDb.tours.get(tourId);
}

/** All persisted tour states, keyed by tourId for O(1) lookup. */
export async function getAllTourStates(): Promise<Map<string, TourState>> {
  const rows = await onboardingDb.tours.toArray();
  return new Map(rows.map((r) => [r.tourId, r]));
}

/** Upsert tour progress. `completed` marks the tour finished. */
export async function saveTourProgress(input: {
  tourId: string;
  completed: boolean;
  stepReached: number;
}): Promise<void> {
  await onboardingDb.tours.put({
    tourId: input.tourId,
    completed: input.completed,
    stepReached: input.stepReached,
    updatedAt: Date.now(),
  });
}

/** Forget a tour so it auto-starts / can be replayed from scratch. */
export async function resetTour(tourId: string): Promise<void> {
  await onboardingDb.tours.delete(tourId);
}

/** Forget every tour (e.g. "Reset onboarding" in settings). */
export async function resetAllTours(): Promise<void> {
  await onboardingDb.tours.clear();
}

/* ------------------------------------------------------------------ */
/* Seen-feature flags (contextual coach-marks)                        */
/* ------------------------------------------------------------------ */

/** Mark a feature as seen once. Idempotent. */
export async function markSeen(featureId: string): Promise<void> {
  await onboardingDb.seen.put({ featureId, seenAt: Date.now() });
}

/** Whether a feature has already been seen. */
export async function hasSeen(featureId: string): Promise<boolean> {
  return (await onboardingDb.seen.get(featureId)) !== undefined;
}
