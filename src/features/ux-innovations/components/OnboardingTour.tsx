/**
 * OnboardingTour — first-visit welcome card + guided walkthrough.
 *
 * The tour engine is now driver.js (via `useTour`), replacing react-joyride's
 * heavier portal/overlay + continuous DOM measurement. Steps are derived from
 * the real nav config and presence-filtered, so they can never point at a route
 * that isn't rendered. Completion is persisted in the durable Dexie-backed app
 * settings, not localStorage.
 */

"use client";

import { HelpCircle, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTour } from "../onboarding/useTour";

interface OnboardingTourProps {
  /** Render a compact "Start Guided Tour" trigger (e.g. for a Help menu). */
  compact?: boolean;
}

export function OnboardingTour({ compact = false }: OnboardingTourProps) {
  const { start, seen, loading, markSeen } = useTour();

  if (compact) {
    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={start}
        className="gap-1.5 text-slate-300 hover:text-slate-100"
      >
        <HelpCircle className="size-4" />
        Start Guided Tour
      </Button>
    );
  }

  // First-visit welcome card — only once the persisted flag has loaded and the
  // tour has not been completed before.
  if (loading || seen) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card className="border-blue-800/50 bg-slate-900 shadow-2xl w-72">
        <CardContent className="pt-5 pb-4 relative">
          <button
            type="button"
            onClick={markSeen}
            className="absolute top-3 right-3 text-slate-500 hover:text-slate-300"
            aria-label="Dismiss"
          >
            <X className="size-3.5" />
          </button>
          <div className="flex items-center gap-2 mb-3">
            <div className="rounded-full bg-blue-600/20 p-2">
              <Sparkles className="size-4 text-blue-400" />
            </div>
            <div>
              <p className="font-semibold text-slate-100 text-sm">Welcome to Data Navigator</p>
              <p className="text-xs text-slate-400">Offline-first analytics</p>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed mb-4">
            Take a 2-minute guided tour to discover the workspace — import, AI briefings, forecasts,
            maps, and more. All offline.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={start}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs"
            >
              Start Tour
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={markSeen}
              className="text-xs border-slate-700"
            >
              Skip
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default OnboardingTour;
