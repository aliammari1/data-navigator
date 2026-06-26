/**
 * UxInnovationsScreen — the routed entry point for the gamification +
 * onboarding feature.
 *
 * The heavy `AchievementSystem` (and its lazy tabs / confetti) is code-split via
 * `next/dynamic` so the achievements + lucide icon set + confetti library land
 * in an async chunk, not this route's first-load JS. The OnboardingTour mounts
 * alongside it (driver.js engine) for the first-visit walkthrough.
 */

"use client";

import dynamic from "next/dynamic";
import { useAppCommands } from "@/features/desktop/core/menu/app-commands";
import { OnboardingTour } from "../components/OnboardingTour";
import { useTour } from "../onboarding/useTour";
import { useAchievements } from "../store/achievements-store";

const AchievementSystem = dynamic(
  () => import("../components/AchievementSystem").then((m) => m.AchievementSystem),
  {
    ssr: false,
    loading: () => <AchievementsSkeleton />,
  },
);

function AchievementsSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-12 w-64 rounded-lg bg-slate-800/60" />
      <div className="h-28 rounded-2xl bg-slate-800/40" />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-slate-800/40" />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="h-44 rounded-xl bg-slate-800/30" />
        ))}
      </div>
    </div>
  );
}

export default function UxInnovationsScreen() {
  // Bridge the desktop menu to the screen's existing behaviour: the guided tour
  // (driver.js engine) and the achievement store reset both already exist here.
  const reset = useAchievements.use.reset();
  const { start } = useTour();
  useAppCommands("ux-innovations", {
    tour: () => start(),
    reset: () => reset(),
  });

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <AchievementSystem />
      <OnboardingTour />
    </div>
  );
}
