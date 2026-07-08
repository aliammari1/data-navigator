/**
 * `useTour` — thin React hook over driver.js (replaces react-joyride).
 *
 * driver.js is a ~5kB, zero-dependency spotlight engine that repositions only on
 * step change (vs react-joyride's continuous `getBoundingClientRect` measurement
 * + full portal/overlay). It runs fully offline.
 *
 * The hook filters out any step whose target element is not currently in the DOM
 * so the tour can never stall on a missing selector, and persists completion in
 * the durable Dexie/IndexedDB-backed app settings (not localStorage).
 */

"use client";

import { type Config, type DriveStep, driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useCallback, useEffect, useState } from "react";
import { createDrizzleStorage } from "@/platform/storage";
import { TOUR_STEPS } from "./tour-steps";

const TOUR_KEY = "ux-onboarding:tour-completed";
// Durable Dexie/IndexedDB-backed key/value store (not localStorage).
const tourStore = createDrizzleStorage({ namespace: "store" });

function present(step: DriveStep): boolean {
  const el = step.element;
  if (!el) return true;
  if (typeof el === "function") return Boolean(el());
  if (typeof el !== "string") return true;
  if (el === "body") return true;
  return Boolean(document.querySelector(el));
}

export interface UseTour {
  /** Start the guided tour now (filters out steps with missing targets). */
  start: () => void;
  /** Whether the tour has been completed before (async-loaded; defaults true). */
  seen: boolean;
  /** True until the persisted "seen" flag has been read. */
  loading: boolean;
  /** Mark the tour as completed without running it (e.g. "Skip"). */
  markSeen: () => void;
}

const markCompleted = () => {
  void Promise.resolve(tourStore.setItem(TOUR_KEY, "true")).catch(() => {});
};

export function useTour(): UseTour {
  const [seen, setSeen] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void Promise.resolve(tourStore.getItem(TOUR_KEY))
      .then((value) => {
        if (active) setSeen(value === "true");
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const markSeen = useCallback(() => {
    setSeen(true);
    markCompleted();
  }, []);

  const start = useCallback(() => {
    const steps = TOUR_STEPS.filter(present);
    if (steps.length === 0) return;
    const config: Config = {
      showProgress: true,
      overlayColor: "#020617",
      overlayOpacity: 0.6,
      stagePadding: 6,
      stageRadius: 8,
      popoverClass: "dn-tour-popover",
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Finish",
      steps,
      onDestroyStarted: () => {
        // driver.js requires the close path to destroy explicitly when
        // onDestroyStarted is provided.
        instance.destroy();
      },
      onDestroyed: () => {
        setSeen(true);
        markCompleted();
      },
    };
    const instance = driver(config);
    instance.drive();
  }, []);

  return { start, seen, loading, markSeen };
}
