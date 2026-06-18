"use client";

import { ArrowRight, Lightbulb } from "lucide-react";
import { handleLauncherClick } from "@/features/dashboard-home/lib/open-app";

/**
 * Astuce — a small warm tip card nudging the user toward the Commandant IA
 * (voice/keyboard app pilot). Desktop-aware: dispatches `desktop:open-app` and
 * falls back to the classic route.
 */
export function TipCard() {
  // No standalone classic route exists for the Commandant IA window; the desktop
  // event opens the real `commander` app in-place, and the route fallback lands
  // on the conversational Studio IA so classic /dashboard mode still works.
  const route = "/dashboard/data-formulator";
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-5 shadow-sm">
      <span className="flex size-9 flex-none items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300">
        <Lightbulb className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-foreground">Astuce du jour</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Pilotez toute l'application à la voix ou au clavier avec le{" "}
          <span className="font-medium text-foreground">Commandant IA</span> — ouvrez un rapport,
          lancez une analyse ou importez un fichier sans quitter cet écran.
        </p>
        <a
          href={route}
          onClick={handleLauncherClick("commander", route)}
          className="mt-2.5 inline-flex items-center gap-1 text-sm font-medium text-amber-700 transition-colors hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-300 dark:hover:text-amber-200"
        >
          Ouvrir le Commandant IA
          <ArrowRight className="size-3.5" />
        </a>
      </div>
    </div>
  );
}
