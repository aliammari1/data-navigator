/**
 * Achievement store — single reactive source of truth.
 *
 * Replaces the former plain-function module that re-parsed `localStorage` on
 * every accessor call (O(n) JSON.parse per call, multiplied across the render
 * tree) plus the in-component `unlockedIds`/`unlockedDates` dual state. State is
 * now held once in memory via zustand and persisted through zustand's `persist`
 * middleware over the platform Dexie/IndexedDB `StateStorage` adapter
 * (`createDrizzleStorage` from `@/platform/storage`) — async, durable, worker
 * accessible, and protected from eviction via `ensurePersistentStorage()`.
 *
 * Unlocks are additionally mirrored to the canonical app-db achievement tables
 * (`unlockAchievement` / `recordAchievementEvent`) so the unlock log + event
 * stream live in the shared persistence layer, not a feature-local silo.
 *
 * Components subscribe via narrow selectors (`useAchievements.use.*` from
 * `createSelectors`) for per-slice re-render isolation.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  createDrizzleStorage,
  createSelectors,
  recordAchievementEvent,
  unlockAchievement,
} from "@/platform/storage";
import { ACHIEVEMENTS, type AchievementDef } from "../data/achievements";

export interface UnlockEvent {
  /** Achievement id. */
  id: string;
  /** ISO timestamp of the unlock. */
  ts: string;
}

interface AchievementsState {
  /** id -> ISO unlock date (single source of truth for unlocked status). */
  unlocked: Record<string, string>;
  /** Append-only unlock log, capped to keep storage bounded. */
  events: UnlockEvent[];
  /** Achievement ids whose toast/celebration has been acknowledged. */
  claimed: Record<string, true>;
  /**
   * Idempotently unlock an achievement. Returns true only on the first unlock
   * so callers can trigger the celebration exactly once.
   */
  unlock: (id: string) => boolean;
  /** Mark an unlocked achievement's reward as claimed. */
  claim: (id: string) => void;
  /** Reset all progress (used by the dev/reset control). */
  reset: () => void;
}

const EVENTS_CAP = 200;

const useAchievementsBase = create<AchievementsState>()(
  persist(
    (set, get) => ({
      unlocked: {},
      events: [],
      claimed: {},
      unlock: (id) => {
        if (get().unlocked[id]) return false;
        const ts = new Date().toISOString();
        set((s) => ({
          unlocked: { ...s.unlocked, [id]: ts },
          events: [...s.events, { id, ts }].slice(-EVENTS_CAP),
        }));
        // Mirror to the canonical app-db achievement tables (fire-and-forget;
        // the zustand persist layer is the in-feature durability guarantee, this
        // keeps the shared unlock log + event stream in sync for other surfaces).
        void unlockAchievement(id).catch(() => {});
        void recordAchievementEvent("achievement.unlocked", { id, ts }).catch(() => {});
        return true;
      },
      claim: (id) => set((s) => (s.claimed[id] ? s : { claimed: { ...s.claimed, [id]: true } })),
      reset: () => set({ unlocked: {}, events: [], claimed: {} }),
    }),
    {
      name: "ux-achievements-v1",
      // Durable Dexie/IndexedDB-backed StateStorage (same adapter the workspace
      // activity store uses) — replaces the evictable, main-thread-blocking
      // localStorage default.
      storage: createJSONStorage(() => createDrizzleStorage({ namespace: "store" })),
      partialize: (s) => ({ unlocked: s.unlocked, events: s.events, claimed: s.claimed }),
    },
  ),
);

/**
 * Auto-generated `.use.<field>()` selector hooks for narrow, render-isolated
 * subscriptions (platform `createSelectors` discipline).
 */
export const useAchievements = createSelectors(useAchievementsBase);

// ─── Derived selectors (stable references → no per-render recompute churn) ─────

/** Total earned XP from currently-unlocked achievements. */
export const selectXP = (s: AchievementsState): number =>
  ACHIEVEMENTS.reduce((sum, a) => (s.unlocked[a.id] ? sum + a.xp : sum), 0);

/** Count of unlocked achievements. */
export const selectUnlockedCount = (s: AchievementsState): number => Object.keys(s.unlocked).length;

/** Unlocked status map (id -> ISO date). */
export const selectUnlocked = (s: AchievementsState): Record<string, string> => s.unlocked;

/** Append-only unlock log. */
export const selectEvents = (s: AchievementsState): UnlockEvent[] => s.events;

// ─── Imperative accessors (non-reactive; for effects/callbacks outside render) ─
// These read the live zustand state via `getState()` so non-component code can
// pull a snapshot without subscribing.

/** An achievement definition enriched with its current unlock status. */
export type Achievement = AchievementDef & {
  /** ISO unlock timestamp, or null if still locked. */
  unlockedAt: string | null;
};

/** All achievements with their current unlock status merged in. */
export function getAllWithStatus(): Achievement[] {
  const { unlocked } = useAchievementsBase.getState();
  return ACHIEVEMENTS.map((def) => ({ ...def, unlockedAt: unlocked[def.id] ?? null }));
}

/** Total earned XP from currently-unlocked achievements. */
export function getPoints(): number {
  const { unlocked } = useAchievementsBase.getState();
  return ACHIEVEMENTS.reduce((sum, def) => (unlocked[def.id] ? sum + def.xp : sum), 0);
}

/** Total XP available across every achievement. */
export function getTotalPoints(): number {
  return ACHIEVEMENTS.reduce((sum, def) => sum + def.xp, 0);
}

/** Idempotently unlock an achievement by id (no-op if already unlocked). */
export function checkAndUnlock(id: string): boolean {
  return useAchievementsBase.getState().unlock(id);
}
