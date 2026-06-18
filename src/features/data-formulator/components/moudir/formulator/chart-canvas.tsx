"use client";
// FACTS (GateGuard): imported by formulator screens/layout under components/moudir/formulator/ | exports ChartCanvasProps, ChartCanvas | reads/writes NO data files

/**
 * Moudir — chart canvas: the center stage that is NEVER an empty void.
 *
 * Three states, all warm and theme-aware:
 *  (a) result with a chart artifact -> reuse MoudirArtifact (lead) + headline caption.
 *  (b) running -> a real chart skeleton (shimmering bars + axes) + MoudirMark thinking.
 *  (c) idle -> a framed plot area with ghost bars, axes, gridlines + concise invitation
 *      and small "recette" example chips. Reads like an empty CHART, not a logo in space.
 *
 * GateGuard first-edit context (retry): importers = formulator screen/layout (chart-canvas is
 * rendered by MoudirSwarmScreen.tsx); affected exports = ChartCanvasProps, ChartCanvas; no data
 * files; user instruction: "still ... a lot of issues stiillll ... code a lot and token max
 * yourself in making things better".
 */

import { motion } from "motion/react";
import { cn } from "@/shared/utils";
import type { Artifact, SwarmResult } from "../../../core/swarm/types";
import { MoudirArtifact } from "../moudir-artifact";
import {
  Kicker,
  MOUDIR,
  MoudirMark,
  rise,
  stagger,
  ThinkingDots,
  useMotionOn,
} from "../moudir-kit";

export interface ChartCanvasProps {
  result: SwarmResult | null;
  running?: boolean;
  hasEncoding?: boolean;
  className?: string;
  /** Optional: clicking an example "recette" chip forwards the French prompt upstream. */
  onPickExample?: (prompt: string) => void;
}

/** Ghost bar heights (% of plot height) — an intentional, slightly irregular silhouette. */
const GHOST_BARS = [44, 68, 52, 81, 60, 92, 73, 58] as const;

/** Small French "recette" starters shown in the idle plot. */
const RECETTES = [
  "Transactions par canal",
  "Taux de réussite dans le temps",
  "Top 5 des erreurs",
] as const;

function findChartArtifact(result: SwarmResult): Extract<Artifact, { kind: "chart" }> | null {
  for (const artifact of result.artifacts) {
    if (artifact.kind === "chart") return artifact;
  }
  return null;
}

/**
 * A framed plot: left + bottom axes, faint horizontal gridlines, tick stubs.
 * Theme-aware via currentColor + border tokens; decorative only.
 */
function PlotFrame({ children }: Readonly<{ children: React.ReactNode }>) {
  const gridlines = [0.25, 0.5, 0.75];
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-5 flex flex-col"
      style={{ color: "hsl(var(--muted-foreground))" }}
    >
      {/* plot region (everything above the x-axis) */}
      <div className="relative flex-1">
        {/* faint horizontal gridlines */}
        {gridlines.map((top) => (
          <div
            key={top}
            className="absolute left-0 right-0 h-px bg-border opacity-60"
            style={{ top: `${top * 100}%` }}
          />
        ))}
        {/* y-axis */}
        <div className="absolute bottom-0 left-0 top-0 w-px bg-border" />
        {/* y-axis tick stubs */}
        {[0, 0.5, 1].map((top) => (
          <div
            key={top}
            className="absolute h-px w-1.5 bg-border"
            style={{ top: `calc(${top * 100}% - 0.5px)`, left: "-6px" }}
          />
        ))}
        {children}
      </div>
      {/* x-axis */}
      <div className="h-px w-full bg-border" />
      {/* x-axis tick stubs */}
      <div className="relative h-1.5">
        {[0.16, 0.38, 0.6, 0.82].map((left) => (
          <div
            key={left}
            className="absolute top-0 h-1.5 w-px bg-border"
            style={{ left: `${left * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Static ghost bars (idle) or shimmering bars (running) sitting on the x-axis. */
function GhostBars({ shimmer }: Readonly<{ shimmer: boolean }>) {
  return (
    <div className="absolute inset-x-[8%] bottom-0 top-[6%] flex items-end justify-between gap-[2.5%]">
      {GHOST_BARS.map((height, index) => (
        <div
          key={`ghost-bar-${index}-${height}`}
          className={cn("flex-1 rounded-t-[3px]", shimmer && "animate-pulse")}
          style={{
            height: `${height}%`,
            background: shimmer
              ? `linear-gradient(180deg, ${MOUDIR.coral}40, ${MOUDIR.coral}14)`
              : `linear-gradient(180deg, ${MOUDIR.coral}26, ${MOUDIR.coral}0a)`,
            boxShadow: `inset 0 0 0 1px ${MOUDIR.coral}1f`,
            animationDelay: shimmer ? `${index * 90}ms` : undefined,
          }}
        />
      ))}
    </div>
  );
}

function WorkingState({ animate }: Readonly<{ animate: boolean }>) {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* skeleton header strip */}
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-3">
        <MoudirMark size={26} thinking={animate} />
        <p className="text-sm font-medium text-foreground">Moudir formule le graphique…</p>
        <ThinkingDots className="ml-1" />
      </div>
      {/* shimmering chart skeleton */}
      <div className="relative flex-1">
        <PlotFrame>
          <GhostBars shimmer />
        </PlotFrame>
      </div>
    </div>
  );
}

function RecetteChip({
  label,
  index,
  onPick,
}: Readonly<{
  label: string;
  index: number;
  onPick?: (prompt: string) => void;
}>) {
  const interactive = Boolean(onPick);
  return (
    <motion.button
      variants={rise}
      type="button"
      disabled={!interactive}
      onClick={interactive ? () => onPick?.(label) : undefined}
      className={cn(
        "rounded-full border border-border bg-[var(--glass-bg)] px-3 py-1.5 font-mono text-[11px] tracking-tight text-muted-foreground transition-all duration-200",
        interactive
          ? "cursor-pointer hover:border-[#17a2c9]/60 hover:text-foreground active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17a2c9]/50"
          : "cursor-default",
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {label}
    </motion.button>
  );
}

function EmptyState({
  animate,
  hasEncoding,
  onPickExample,
}: Readonly<{
  animate: boolean;
  hasEncoding: boolean;
  onPickExample?: (prompt: string) => void;
}>) {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* header strip so idle reads as a chart shell, not an empty box */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <Kicker tone="coral">{hasEncoding ? "Prêt à tracer" : "Atelier"}</Kicker>
        <span className="font-mono text-[11px] tracking-tight text-muted-foreground">aperçu</span>
      </div>

      {/* framed plot with ghost bars behind the centered invitation */}
      <div className="relative flex-1">
        <PlotFrame>
          <GhostBars shimmer={false} />
        </PlotFrame>

        <motion.div
          variants={animate ? stagger : undefined}
          initial={animate ? "hidden" : false}
          animate={animate ? "show" : false}
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center"
        >
          <motion.div variants={rise}>
            <MoudirMark size={40} thinking={false} />
          </motion.div>
          <motion.p
            variants={rise}
            className="max-w-md text-sm font-medium leading-relaxed text-foreground"
          >
            Glissez des champs dans les axes, ou décrivez le graphique
          </motion.p>
          <motion.div
            variants={animate ? stagger : undefined}
            className="flex flex-wrap items-center justify-center gap-2"
          >
            {RECETTES.map((label, index) => (
              <RecetteChip key={label} label={label} index={index} onPick={onPickExample} />
            ))}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

export function ChartCanvas({
  result,
  running = false,
  hasEncoding = false,
  className,
  onPickExample,
}: ChartCanvasProps) {
  const animate = useMotionOn();
  const chart = result ? findChartArtifact(result) : null;

  return (
    <section
      className={cn(
        "relative flex min-h-[420px] w-full flex-col overflow-hidden rounded-2xl",
        className,
      )}
      style={{ boxShadow: "inset 0 0 0 1px var(--glass-border)" }}
    >
      {chart ? (
        <motion.div
          variants={animate ? stagger : undefined}
          initial={animate ? "hidden" : false}
          animate={animate ? "show" : false}
          className="flex flex-1 flex-col gap-4 p-6"
        >
          {result?.headline ? (
            <motion.figcaption
              variants={rise}
              className="text-sm font-medium leading-snug text-foreground"
            >
              {result.headline}
            </motion.figcaption>
          ) : null}
          <div className="flex-1">
            <MoudirArtifact artifact={chart} lead />
          </div>
        </motion.div>
      ) : running ? (
        <WorkingState animate={animate} />
      ) : (
        <EmptyState animate={animate} hasEncoding={hasEncoding} onPickExample={onPickExample} />
      )}
    </section>
  );
}
