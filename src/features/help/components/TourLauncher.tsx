"use client";

import { CheckCircle2, Play, RotateCcw, Sparkles } from "lucide-react";
import { memo } from "react";
import { cn } from "@/shared/utils";
import type { TourDefinition } from "../data/tours";
import { ALL_TOURS, useOnboarding } from "../lib/use-onboarding";

/**
 * Guided-tour launcher.
 *
 * This is the missing "mount point": the old `react-joyride` tour was never
 * rendered anywhere. Here the driver.js tours are actually reachable and
 * runnable from the Help page (the one route this feature owns), with per-tour
 * completion + replay/reset persisted in Dexie — no localStorage, no network.
 */
function TourRow({
  tour,
  completed,
  onStart,
  onReset,
}: {
  tour: TourDefinition;
  completed: boolean;
  onStart: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div
        className={cn(
          "flex h-8 w-8 flex-none items-center justify-center rounded-lg border",
          completed
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
            : "border-indigo-500/20 bg-indigo-500/10 text-indigo-400",
        )}
      >
        {completed ? <CheckCircle2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">{tour.title}</div>
        <div className="truncate text-xs text-muted-foreground">{tour.description}</div>
      </div>
      {completed && (
        <button
          type="button"
          onClick={onReset}
          aria-label={`Reset ${tour.title}`}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
      )}
      <button
        type="button"
        onClick={onStart}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
      >
        <Play className="h-3.5 w-3.5" />
        {completed ? "Replay" : "Start"}
      </button>
    </div>
  );
}

function TourLauncherImpl() {
  const { isCompleted, startTour, reset, loading } = useOnboarding();

  return (
    <section
      aria-label="Guided tours"
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Sparkles className="h-4 w-4 text-indigo-400" />
        <span className="text-sm font-semibold text-foreground">Guided tours</span>
        <span className="ml-auto text-xs text-muted-foreground">
          Fully offline · saved on this device
        </span>
      </div>

      <div className="divide-y divide-border">
        {ALL_TOURS.map((tour) => (
          <TourRow
            key={tour.id}
            tour={tour}
            completed={!loading && isCompleted(tour.id)}
            onStart={() => void startTour(tour)}
            onReset={() => void reset(tour.id)}
          />
        ))}
      </div>
    </section>
  );
}

export const TourLauncher = memo(TourLauncherImpl);
