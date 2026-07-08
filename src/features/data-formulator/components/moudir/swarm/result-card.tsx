"use client";

/**
 * Moudir — the swarm's hero answer card.
 *
 * When the swarm finishes, this is the payoff: the manager-facing answer,
 * presented as an editorial "Daily Edition" feature rather than a dashboard
 * card. Big headline, summary prose, the evidence behind it, the artifacts the
 * workers produced (rendered through MoudirArtifact), a confidence stamp, the
 * model used, and follow-up questions the manager can tap to keep going.
 *
 * Theme-aware: it lives on the app's warm surfaces (bg-card / text-foreground /
 * --glass-* tokens) and reads in BOTH light and dark mode. Coral (#17a2c9) is
 * the only brand signal; confidence borrows the fixed status hues. No dark slab,
 * no neon, no shimmer — warm, crafted, prominent.
 */

import { ArrowUpRight, Quote } from "lucide-react";
import { motion } from "motion/react";
import type { SwarmResult } from "../../../core/swarm/types";
import { MoudirArtifact } from "../moudir-artifact";
import { Kicker, MOUDIR, MoudirMark, Pill, Rule, rise, stagger, useMotionOn } from "../moudir-kit";

/** French label + status tone for the run's confidence stamp. */
function confidenceMeta(confidence: SwarmResult["confidence"]): {
  label: string;
  tone: "green" | "gold" | "rose";
} {
  switch (confidence) {
    case "high":
      return { label: "Confiance élevée", tone: "green" };
    case "medium":
      return { label: "Confiance moyenne", tone: "gold" };
    default:
      return { label: "Confiance faible", tone: "rose" };
  }
}

export interface SwarmResultCardProps {
  result: SwarmResult;
  /** Tapping a follow-up chip re-asks Moudir with that question. */
  onFollowUp?: (question: string) => void;
}

export function SwarmResultCard({ result, onFollowUp }: SwarmResultCardProps) {
  const motionOn = useMotionOn();
  const conf = confidenceMeta(result.confidence);

  // The first artifact is promoted to the hero slot; the rest fill the gallery.
  const [lead, ...rest] = result.artifacts;

  return (
    <motion.article
      variants={motionOn ? stagger : undefined}
      initial={motionOn ? "hidden" : false}
      animate="show"
      className="relative flex flex-col gap-7 overflow-hidden rounded-3xl border border-border bg-card p-6 text-foreground shadow-sm sm:p-8"
      style={{
        // Warm frosted feel on top of the app card surface.
        backgroundImage:
          "radial-gradient(120% 80% at 0% -10%, rgba(23, 162, 201,0.07), transparent 55%)",
      }}
    >
      {/* ── Masthead ───────────────────────────────────────────── */}
      <motion.header variants={rise} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2.5">
            <MoudirMark size={30} />
            <Kicker tone="coral">La réponse de Moudir</Kicker>
          </span>
          <Pill tone={conf.tone}>{conf.label}</Pill>
        </div>

        <h2 className="text-balance text-3xl font-semibold leading-[1.12] tracking-tight text-foreground sm:text-4xl">
          {result.headline}
        </h2>

        {result.goal && <p className="text-sm text-muted-foreground">{result.goal}</p>}
      </motion.header>

      {/* ── Summary prose ──────────────────────────────────────── */}
      {result.summary && (
        <motion.p
          variants={rise}
          className="max-w-[68ch] text-pretty text-[15px] leading-relaxed text-muted-foreground sm:text-base"
        >
          {result.summary}
        </motion.p>
      )}

      {/* ── Lead artifact (hero) ───────────────────────────────── */}
      {lead && (
        <motion.div variants={rise}>
          <MoudirArtifact artifact={lead} lead />
        </motion.div>
      )}

      {/* ── Evidence ───────────────────────────────────────────── */}
      {result.evidence.length > 0 && (
        <motion.section variants={rise} className="flex flex-col gap-3">
          <Kicker>Les preuves</Kicker>
          <ul className="flex flex-col gap-2.5">
            {result.evidence.map((line, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground"
              >
                <Quote
                  aria-hidden
                  className="mt-0.5 size-3.5 shrink-0"
                  style={{ color: MOUDIR.coral }}
                />
                <span className="text-pretty">{line}</span>
              </li>
            ))}
          </ul>
        </motion.section>
      )}

      {/* ── Remaining artifacts (gallery) ──────────────────────── */}
      {rest.length > 0 && (
        <motion.section variants={rise} className="flex flex-col gap-4">
          <Rule />
          <Kicker>Ce que l'équipe a produit</Kicker>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {rest.map((artifact) => (
              <MoudirArtifact key={artifact.id} artifact={artifact} />
            ))}
          </div>
        </motion.section>
      )}

      {/* ── Follow-ups ─────────────────────────────────────────── */}
      {result.followUps.length > 0 && (
        <motion.section variants={rise} className="flex flex-col gap-3">
          <Kicker>Pour aller plus loin</Kicker>
          <div className="flex flex-wrap gap-2">
            {result.followUps.map((question, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onFollowUp?.(question)}
                disabled={!onFollowUp}
                className="group inline-flex items-center gap-1.5 rounded-full border border-[#17a2c9]/35 px-3.5 py-1.5 text-left text-[13px] font-medium text-[#17a2c9] transition-colors hover:bg-[#17a2c9]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17a2c9]/50 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
              >
                <span className="text-pretty">{question}</span>
                <ArrowUpRight
                  aria-hidden
                  className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                />
              </button>
            ))}
          </div>
        </motion.section>
      )}

      {/* ── Provenance ─────────────────────────────────────────── */}
      {result.modelUsed && (
        <motion.footer variants={rise} className="flex flex-col gap-3">
          <Rule />
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Composé par Moudir · modèle <span className="text-foreground">{result.modelUsed}</span>
          </p>
        </motion.footer>
      )}
    </motion.article>
  );
}
