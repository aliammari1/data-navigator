"use client";

/**
 * Moudir — Swarm Console.
 *
 * THE centerpiece. This replaces the chat thread: instead of a single voice
 * talking out loud, the console makes the multi-agent machinery visible. You
 * watch Moudir decompose your question into a team of specialized agents and
 * see every one of them working — in parallel — toward the answer.
 *
 * It is a pure view over `useSwarmStore`: it reads the live run state and
 * orchestrates the staged surfaces, in order:
 *   1. warming   — the offline model is being warmed up before planning.
 *   2. stepper   — where we are in the run (planning → done).
 *   3. plan      — the planner's flight plan, once it exists.
 *   4. the swarm — a responsive grid of agent lanes, one per task, so the
 *                  parallel work is legible at a glance.
 *   5. artifacts — a combined gallery of everything the swarm produced so far.
 *   6. result    — the synthesized answer, hero'd at the top when done.
 *   7. failed    — a calm, honest failure state.
 *
 * Theme-aware (follows the app's light/dark tokens + warm glass), reduced-motion
 * aware, French-first, fully offline. The heavy sub-surfaces live in sibling
 * files; this file only composes them.
 */

import { motion } from "motion/react";
import { useMemo } from "react";
import type { AgentRunState, Artifact } from "../../../core/swarm/types";
import { useSwarmStore } from "../../../store/swarm-store";
import { MoudirArtifact } from "../moudir-artifact";
import {
  Kicker,
  MOUDIR,
  MoudirMark,
  Rule,
  rise,
  stagger,
  ThinkingDots,
  useMotionOn,
} from "../moudir-kit";
import { AgentLane } from "./agent-lane";
import { SwarmPhaseStepper } from "./phase-stepper";
import { SwarmPlanPanel } from "./plan-panel";
import { SwarmResultCard } from "./result-card";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Pull readable prose out of the partial answer JSON as it streams. The answer
 * arrives as a single JSON object (`{"headline":"…","summary":"…",…}`); rather
 * than show raw braces, we surface the in-progress `summary` (falling back to the
 * `headline`) string value. Tolerant of an unterminated trailing string so the
 * text grows token-by-token. Returns "" until a readable field has started.
 */
function streamingProse(buffer: string): string {
  for (const field of ["summary", "headline"] as const) {
    const start = buffer.indexOf(`"${field}"`);
    if (start === -1) continue;
    const colon = buffer.indexOf(":", start + field.length + 2);
    if (colon === -1) continue;
    const quote = buffer.indexOf('"', colon + 1);
    if (quote === -1) continue;
    // Walk from the opening quote, honouring escapes, to the closing quote (or
    // the end of the buffer if the string is still streaming).
    let out = "";
    let escaped = false;
    for (let i = quote + 1; i < buffer.length; i++) {
      const ch = buffer[i];
      if (escaped) {
        out += ch === "n" ? "\n" : ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') break;
      out += ch;
    }
    if (out.trim()) return out;
  }
  return "";
}

/** Stable, de-duplicated artifacts across every agent run (plan order). */
function collectArtifacts(runs: AgentRunState[]): Artifact[] {
  const seen = new Set<string>();
  const out: Artifact[] = [];
  for (const run of runs) {
    for (const artifact of run.artifacts) {
      if (seen.has(artifact.id)) continue;
      seen.add(artifact.id);
      out.push(artifact);
    }
  }
  return out;
}

/**
 * Combined artifacts gallery — editorial, not a uniform card grid: KPIs ride a
 * compact row, a lead visual gets the width, the rest fill a two-up grid.
 */
function ArtifactGallery({ artifacts }: { artifacts: Artifact[] }) {
  if (artifacts.length === 0) return null;

  const kpis = artifacts.filter((a) => a.kind === "kpi");
  const rest = artifacts.filter((a) => a.kind !== "kpi");
  const lead = rest.find((a) => a.kind === "chart") ?? rest[0];
  const others = rest.filter((a) => a !== lead);

  return (
    <motion.section
      variants={stagger}
      className="flex flex-col gap-4"
      aria-label="Éléments produits par l'équipe"
    >
      <div className="flex items-center gap-3">
        <Kicker>Ce que l'équipe a produit</Kicker>
        <Rule className="flex-1" />
      </div>

      <motion.div variants={stagger} className="flex flex-col gap-6">
        {kpis.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {kpis.map((a) => (
              <MoudirArtifact key={a.id} artifact={a} />
            ))}
          </div>
        )}
        {lead && <MoudirArtifact artifact={lead} lead />}
        {others.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2">
            {others.map((a) => (
              <MoudirArtifact key={a.id} artifact={a} />
            ))}
          </div>
        )}
      </motion.div>
    </motion.section>
  );
}

// ─── Warming ─────────────────────────────────────────────────────────────────

/** Model warmup, before the planner can even start. Honest, not loading-theater. */
function WarmingState({ message, progress }: { message: string; progress: number }) {
  const pct = Math.min(100, Math.max(0, Math.round(progress)));
  return (
    <motion.div
      variants={rise}
      initial="hidden"
      animate="show"
      className="flex items-start gap-4 rounded-2xl p-5"
      style={{
        background: MOUDIR.panel,
        border: "1px solid var(--glass-border)",
      }}
    >
      <MoudirMark size={40} thinking />
      <div className="min-w-0 flex-1">
        <Kicker tone="coral">Préparation du modèle</Kicker>
        <p className="mt-1.5 text-base leading-relaxed" style={{ color: MOUDIR.ink }}>
          {message}
        </p>
        {pct > 0 && (
          <div className="mt-3 flex items-center gap-3">
            <div
              className="h-1 w-48 overflow-hidden rounded-full"
              style={{ background: "hsl(var(--muted))" }}
            >
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{ width: `${pct}%`, background: MOUDIR.coral }}
              />
            </div>
            <span className="font-mono text-[11px] tabular-nums" style={{ color: MOUDIR.muted }}>
              {pct}%
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Streaming answer ──────────────────────────────────────────────────────────

/**
 * The answer composing live, token-by-token, during the `synthesizing` phase —
 * so the manager reads Moudir's reply as it is written instead of waiting for the
 * full structured result. Once the run completes, the hero result card replaces
 * this. Shows the thinking state until the first readable prose arrives.
 */
function StreamingAnswer({ buffer }: { buffer: string }) {
  const prose = streamingProse(buffer);
  return (
    <motion.div
      variants={rise}
      initial="hidden"
      animate="show"
      className="flex items-start gap-4 rounded-2xl p-5"
      style={{
        background: MOUDIR.panel,
        border: "1px solid var(--glass-border)",
      }}
    >
      <MoudirMark size={40} thinking />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <Kicker tone="coral">Moudir rédige la réponse</Kicker>
          <ThinkingDots />
        </div>
        {prose ? (
          <p className="mt-2 text-pretty text-base leading-relaxed" style={{ color: MOUDIR.ink }}>
            {prose}
            <span className="ml-0.5 inline-block h-[1.1em] w-px translate-y-[0.15em] animate-pulse bg-[#17a2c9] align-middle" />
          </p>
        ) : (
          <p className="mt-2 text-sm leading-relaxed" style={{ color: MOUDIR.body }}>
            Je compose votre réponse à partir des chiffres vérifiés…
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ─── Idle ────────────────────────────────────────────────────────────────────

/** Warm intro before a run starts. Optional suggestion chips fire `onFollowUp`. */
function IdleIntro({
  suggestions,
  onFollowUp,
}: {
  suggestions?: string[];
  onFollowUp?: (question: string) => void;
}) {
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="mx-auto flex min-h-[55vh] max-w-2xl flex-col justify-center"
    >
      <motion.div variants={rise}>
        <MoudirMark size={52} />
      </motion.div>
      <motion.h1
        variants={rise}
        className="mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-tight"
        style={{ color: MOUDIR.ink }}
      >
        Moudir
      </motion.h1>
      <motion.p
        variants={rise}
        className="mt-3 max-w-lg text-pretty text-lg leading-relaxed"
        style={{ color: MOUDIR.body }}
      >
        Je décompose votre question en une équipe d'agents — ils tirent les chiffres, repèrent
        l'essentiel, vérifient leur propre travail, puis je vous réponds franchement. Entièrement
        hors ligne.
      </motion.p>

      {suggestions && suggestions.length > 0 && onFollowUp && (
        <motion.div variants={rise} className="mt-6 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onFollowUp(s)}
              className="rounded-full border px-3.5 py-2 text-left text-sm transition-colors hover:border-[#17a2c9]/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17a2c9]/50 active:scale-[0.98]"
              style={{
                borderColor: "var(--glass-border)",
                color: MOUDIR.body,
              }}
            >
              {s}
            </button>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── Failed ──────────────────────────────────────────────────────────────────

function FailedState({ error }: { error: string | null }) {
  return (
    <motion.div
      variants={rise}
      initial="hidden"
      animate="show"
      className="flex items-start gap-4 rounded-2xl p-5"
      style={{
        background: MOUDIR.panel,
        border: `1px solid ${MOUDIR.rose}59`,
      }}
    >
      <MoudirMark size={40} />
      <div className="min-w-0 flex-1">
        <Kicker tone="coral">L'analyse s'est arrêtée</Kicker>
        <p className="mt-1.5 text-base leading-relaxed" style={{ color: MOUDIR.ink }}>
          Je me suis arrêté en cours de route.
        </p>
        <p className="mt-1 text-sm leading-relaxed" style={{ color: MOUDIR.body }}>
          {error ??
            "Quelque chose m'a interrompu. Préparez un modèle hors ligne et reposez votre question."}
        </p>
      </div>
    </motion.div>
  );
}

// ─── Console ─────────────────────────────────────────────────────────────────

export interface SwarmConsoleProps {
  /**
   * Fired when the user picks a follow-up question (from the result card) or an
   * idle suggestion chip. The screen owns kicking off the next run.
   */
  onFollowUp?: (question: string) => void;
  /** Optional idle-state suggestion chips. Omitted → a clean intro only. */
  suggestions?: string[];
}

/**
 * The swarm run view. Reads `useSwarmStore` and composes the staged surfaces.
 * New runs simply update the store; this re-renders to match.
 */
export function SwarmConsole({ onFollowUp, suggestions }: SwarmConsoleProps) {
  const motionOn = useMotionOn();

  const phase = useSwarmStore((s) => s.phase);
  const prompt = useSwarmStore((s) => s.prompt);
  const plan = useSwarmStore((s) => s.plan);
  const order = useSwarmStore((s) => s.order);
  const runsMap = useSwarmStore((s) => s.runs);
  const storeArtifacts = useSwarmStore((s) => s.artifacts);
  const result = useSwarmStore((s) => s.result);
  const answerStream = useSwarmStore((s) => s.answerStream);
  const error = useSwarmStore((s) => s.error);
  const warming = useSwarmStore((s) => s.warming);

  const runs = useMemo(() => order.map((id) => runsMap[id]).filter(Boolean), [order, runsMap]);

  // Prefer the store's flattened artifacts (final/accepted set) and fall back to
  // the live ones collected from the lanes while the swarm is still working.
  const liveArtifacts = useMemo(() => collectArtifacts(runs), [runs]);
  const artifacts = storeArtifacts.length > 0 ? storeArtifacts : liveArtifacts;

  const animate = motionOn ? "show" : undefined;

  // ── Idle ─────────────────────────────────────────────────────────────────
  if (phase === "idle") {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <IdleIntro suggestions={suggestions} onFollowUp={onFollowUp} />
      </div>
    );
  }

  const isDone = phase === "done" && Boolean(result);
  const isFailed = phase === "failed";

  return (
    <motion.div
      variants={stagger}
      initial={motionOn ? "hidden" : false}
      animate={animate}
      className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10"
    >
      {/* The question that kicked off this run. */}
      {prompt && (
        <motion.div variants={rise}>
          <Kicker>Votre question</Kicker>
          <p
            className="mt-1.5 text-balance text-2xl font-semibold leading-snug tracking-tight"
            style={{ color: MOUDIR.ink }}
          >
            {prompt}
          </p>
        </motion.div>
      )}

      {/* Hero: the synthesized result, when the run is complete. */}
      {isDone && result && (
        <motion.div variants={rise}>
          <SwarmResultCard result={result} onFollowUp={onFollowUp} />
        </motion.div>
      )}

      {/* The answer streaming in, live, while it is still being composed. */}
      {!isDone && !isFailed && phase === "synthesizing" && (
        <motion.div variants={rise}>
          <StreamingAnswer buffer={answerStream} />
        </motion.div>
      )}

      {/* Failure, stated plainly. */}
      {isFailed && (
        <motion.div variants={rise}>
          <FailedState error={error} />
        </motion.div>
      )}

      {/* Warmup, before the planner can run. */}
      {warming && (
        <motion.div variants={rise}>
          <WarmingState message={warming.message} progress={warming.progress} />
        </motion.div>
      )}

      {/* Where we are in the run. */}
      {!isFailed && (
        <motion.div variants={rise}>
          <SwarmPhaseStepper phase={phase} />
        </motion.div>
      )}

      {/* The planner's flight plan. */}
      {plan && (
        <motion.div variants={rise}>
          <SwarmPlanPanel goal={plan.goal} plan={plan} />
        </motion.div>
      )}

      {/* The swarm at work — every agent visible, in parallel. */}
      {runs.length > 0 && (
        <motion.section
          variants={stagger}
          className="flex flex-col gap-4"
          aria-label="Les agents au travail"
        >
          <div className="flex items-center gap-3">
            <Kicker tone="coral">L'équipe</Kicker>
            <span className="font-mono text-[11px] tabular-nums" style={{ color: MOUDIR.muted }}>
              {runs.length} agent{runs.length > 1 ? "s" : ""}
            </span>
            <Rule className="flex-1" />
            {!isDone && !isFailed && <ThinkingDots />}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {runs.map((run) => (
              <motion.div key={run.task.id} variants={rise}>
                <AgentLane run={run} />
              </motion.div>
            ))}
          </div>
        </motion.section>
      )}

      {/* Everything produced so far. When done the result card carries its own
          artifacts, so only show the combined gallery while still in flight. */}
      {!isDone && artifacts.length > 0 && <ArtifactGallery artifacts={artifacts} />}
    </motion.div>
  );
}
