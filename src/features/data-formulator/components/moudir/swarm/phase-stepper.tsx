"use client";

/**
 * Moudir — swarm phase stepper.
 *
 * A compact, horizontal, warm-glass map of the swarm pipeline:
 *   Plan → Dispatch → Travail → Vérification → Synthèse → Terminé
 *
 * It reflects the current `useSwarmStore` phase: the step in flight pulses in
 * coral, completed steps settle to an emerald check, and steps still ahead stay
 * muted. This is a backstage progress signal — restrained, theme-aware, and
 * reduced-motion aware — never a neon ribbon or a shimmer skeleton.
 *
 * Theme: surfaces follow the app tokens (warm glass via --glass-*, foreground /
 * muted-foreground / border). The only fixed signals are Moudir's coral accent
 * and the emerald/rose status hues so meaning stays stable across light & dark.
 */

import { Check, X } from "lucide-react";
import { motion } from "motion/react";
import type { SwarmPhase } from "../../../core/swarm/types";
import { MOUDIR, useMotionOn } from "../moudir-kit";

// ─── Pipeline definition ─────────────────────────────────────────────────────
//
// The ordered, user-visible steps. `done` is folded into the final "Terminé"
// step; `failed` and `idle` are handled as states, not their own steps.

interface Step {
  /** The swarm phase this step represents. */
  phase: Exclude<SwarmPhase, "idle" | "failed">;
  label: string;
}

const STEPS: Step[] = [
  { phase: "planning", label: "Plan" },
  { phase: "dispatching", label: "Dispatch" },
  { phase: "working", label: "Travail" },
  { phase: "verifying", label: "Vérification" },
  { phase: "synthesizing", label: "Synthèse" },
  { phase: "done", label: "Terminé" },
];

/** Index of the step that owns the given phase (idle/failed map to -1 / last). */
function activeIndex(phase: SwarmPhase): number {
  if (phase === "idle") return -1;
  if (phase === "failed") return STEPS.length - 1; // the run stopped on the final step
  return STEPS.findIndex((s) => s.phase === phase);
}

type StepState = "done" | "active" | "pending" | "failed";

// ─── Dot ─────────────────────────────────────────────────────────────────────

function StepDot({ state, motionOn }: { state: StepState; motionOn: boolean }) {
  const ring =
    state === "done"
      ? `${MOUDIR.green}66`
      : state === "failed"
        ? `${MOUDIR.rose}66`
        : state === "active"
          ? `${MOUDIR.coral}59`
          : "var(--border)";
  const fill =
    state === "done"
      ? `${MOUDIR.green}1f`
      : state === "failed"
        ? `${MOUDIR.rose}1f`
        : state === "active"
          ? `${MOUDIR.coral}1f`
          : "transparent";

  return (
    <span
      className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
      style={{ background: fill, boxShadow: `inset 0 0 0 1px ${ring}` }}
    >
      {/* Live pulse — only on the active step, only when motion is allowed. */}
      {state === "active" && motionOn && (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ boxShadow: `inset 0 0 0 1px ${MOUDIR.coral}73` }}
          animate={{ opacity: [0.2, 0.8, 0.2], scale: [1, 1.25, 1] }}
          transition={{ duration: 1.6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        />
      )}
      {state === "done" ? (
        <Check className="h-3 w-3" style={{ color: MOUDIR.green }} strokeWidth={2.5} />
      ) : state === "failed" ? (
        <X className="h-3 w-3" style={{ color: MOUDIR.rose }} strokeWidth={2.5} />
      ) : (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: state === "active" ? MOUDIR.coral : "hsl(var(--muted-foreground))",
            opacity: state === "active" ? 1 : 0.5,
          }}
        />
      )}
    </span>
  );
}

// ─── Stepper ───────────────────────────────────────────────────────────────────

/**
 * Horizontal stepper of the swarm pipeline, driven by the run `phase`.
 *
 * @param phase   The current swarm phase from `useSwarmStore`.
 * @param className  Optional layout overrides for the host row.
 */
export function SwarmPhaseStepper({ phase, className }: { phase: SwarmPhase; className?: string }) {
  const motionOn = useMotionOn();
  const active = activeIndex(phase);
  const failed = phase === "failed";

  return (
    <div
      className={[
        "flex w-full items-center gap-1.5 overflow-x-auto rounded-2xl border px-3 py-2",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        background: "var(--glass-bg)",
        borderColor: "var(--glass-border)",
        boxShadow: "var(--glass-shadow)",
      }}
      role="list"
      aria-label="Progression du swarm"
    >
      {STEPS.map((step, i) => {
        let state: StepState;
        if (failed && i === active) state = "failed";
        else if (i < active) state = "done";
        else if (i === active) state = phase === "done" ? "done" : "active";
        else state = "pending";

        const labelColor =
          state === "active"
            ? MOUDIR.coral
            : state === "failed"
              ? MOUDIR.rose
              : state === "done"
                ? "hsl(var(--foreground))"
                : "hsl(var(--muted-foreground))";

        return (
          <div
            key={step.phase}
            className="flex shrink-0 items-center gap-1.5"
            role="listitem"
            aria-current={state === "active" ? "step" : undefined}
          >
            <StepDot state={state} motionOn={motionOn} />
            <span
              className="whitespace-nowrap text-[11px] font-medium tracking-tight transition-colors duration-300"
              style={{ color: labelColor, opacity: state === "pending" ? 0.7 : 1 }}
            >
              {step.label}
            </span>
            {/* Connector to the next step (skipped after the final one). */}
            {i < STEPS.length - 1 && (
              <span
                className="mx-0.5 h-px w-4 shrink-0 transition-colors duration-300 sm:w-6"
                style={{
                  background: i < active ? `${MOUDIR.green}59` : "var(--border)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
