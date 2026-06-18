"use client";

import { motion } from "motion/react";
import { useMotionPrefs } from "@/design-system/use-motion-prefs";

/**
 * HomeHero — the warm "Édition du Jour" masthead. A paper/cream strip with a
 * time-of-day greeting, today's date in fr-FR, and a one-line edition tagline.
 * Editorial, not dark-SaaS. Entrance fade honors reduced motion.
 */
export function HomeHero({ subtitle }: { subtitle?: React.ReactNode }) {
  const { reduced } = useMotionPrefs();
  const now = new Date();

  return (
    <motion.header
      initial={reduced ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-2xl border border-border bg-linear-to-br from-amber-50 via-card to-card p-6 shadow-sm dark:from-amber-950/20 dark:via-card dark:to-card md:p-7"
    >
      {/* Soft warm glow, decorative */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-amber-400/15 blur-3xl"
      />
      <div className="relative flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="flex size-5 items-center justify-center rounded-full bg-amber-500 font-serif text-[11px] font-bold text-white">
            é
          </span>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
            L'Édition du Jour
          </p>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            · {capitalize(formatFrDate(now))}
          </span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {greeting()}
        </h1>

        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {subtitle ?? (
            <>
              Votre poste de pilotage analytique — entièrement hors ligne. Tout est calculé
              localement dans DuckDB.
            </>
          )}
        </p>
      </div>
    </motion.header>
  );
}

/** French time-of-day greeting. */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

/** Today's date, fr-FR long form (e.g. "samedi 14 juin 2026"). */
function formatFrDate(date: Date): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
