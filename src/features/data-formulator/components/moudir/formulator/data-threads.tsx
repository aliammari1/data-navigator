"use client";

// FACTS (GateGuard): imported by formulator screens/panels in components/moudir/formulator/* | exports DataThread, DataThreadsProps, DataThreads | reads/writes NO data files

/**
 * DataThreads — "Fils de données" iteration-history rail for the Moudir formulator.
 *
 * A vertical, most-recent-first list of selectable thread cards. Each card shows
 * the originating prompt (clamped to 2 lines), an optional headline, a confidence
 * Pill, and a French relative timestamp. The active thread gets an accent ring and
 * an accent left border. An optional per-card "Dériver" (branch) text-button calls
 * onBranch. Real empty state when there are no threads.
 *
 * Theme-aware: surfaces resolve to glass tokens; the only fixed brand signal is the
 * Signal-Cyan accent (MOUDIR.coral). Status hues come from the confidence Pill tone.
 */

import { GitBranch } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/shared/utils";
import { Kicker, MOUDIR, Pill, rise, stagger, useMotionOn } from "../moudir-kit";

export interface DataThread {
  id: string;
  prompt: string;
  headline?: string;
  confidence?: "high" | "medium" | "low";
  createdAt: number;
}

export interface DataThreadsProps {
  threads: DataThread[];
  activeId?: string | null;
  onSelect(id: string): void;
  onBranch?(id: string): void;
  /** Hide the "Fils de données" kicker when the rail header is provided elsewhere. */
  hideKicker?: boolean;
  className?: string;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const CONFIDENCE_LABEL: Record<NonNullable<DataThread["confidence"]>, string> = {
  high: "Confiance élevée",
  medium: "Confiance moyenne",
  low: "Confiance faible",
};
const CONFIDENCE_TONE: Record<NonNullable<DataThread["confidence"]>, "green" | "gold" | "rose"> = {
  high: "green",
  medium: "gold",
  low: "rose",
};

/** French relative time from a timestamp vs now: "à l'instant" / "il y a Xm" / "il y a Xh". */
function relativeTime(createdAt: number, now: number): string {
  const elapsed = Math.max(0, now - createdAt);
  if (elapsed < MINUTE_MS) {
    return "à l'instant";
  }
  if (elapsed < HOUR_MS) {
    const minutes = Math.floor(elapsed / MINUTE_MS);
    return `il y a ${minutes}m`;
  }
  const hours = Math.floor(elapsed / HOUR_MS);
  return `il y a ${hours}h`;
}

interface ThreadCardProps {
  thread: DataThread;
  active: boolean;
  now: number;
  onSelect(id: string): void;
  onBranch?(id: string): void;
}

function ThreadCard({ thread, active, now, onSelect, onBranch }: ThreadCardProps) {
  const tone = thread.confidence ? CONFIDENCE_TONE[thread.confidence] : null;
  const label = thread.confidence ? CONFIDENCE_LABEL[thread.confidence] : null;

  return (
    <motion.div variants={rise} className="group/thread relative">
      <button
        type="button"
        onClick={() => onSelect(thread.id)}
        aria-current={active ? "true" : undefined}
        className={cn(
          "block w-full rounded-lg px-3 py-2.5 text-left",
          "transition-all duration-200 active:scale-[0.985]",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-[var(--ring,#17a2c9)] focus-visible:ring-offset-0",
        )}
        style={{
          background: active ? "var(--glass-bg-strong)" : "var(--glass-bg)",
          boxShadow: active
            ? `inset 3px 0 0 0 ${MOUDIR.coral}, inset 0 0 0 1px ${MOUDIR.coral}40`
            : "inset 0 0 0 1px var(--glass-border)",
        }}
      >
        <p
          className={cn(
            "text-[13px] leading-snug",
            active ? "font-semibold text-foreground" : "font-medium text-foreground",
          )}
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {thread.prompt}
        </p>

        {thread.headline ? (
          <p className="mt-1 truncate text-[11px] leading-relaxed text-muted-foreground">
            {thread.headline}
          </p>
        ) : null}

        <div className="mt-2 flex items-center justify-between gap-2">
          {tone && label ? (
            <Pill tone={tone} className="px-2 py-0.5 text-[10px]">
              {label}
            </Pill>
          ) : (
            <span aria-hidden className="text-[10px] text-muted-foreground/60">
              —
            </span>
          )}
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {relativeTime(thread.createdAt, now)}
          </span>
        </div>
      </button>

      {onBranch ? (
        <button
          type="button"
          onClick={() => onBranch(thread.id)}
          aria-label="Dériver ce fil"
          className={cn(
            "absolute right-2 top-2 inline-flex items-center gap-1 rounded-md px-1.5 py-1",
            "text-[10px] font-medium",
            "opacity-0 transition-all duration-200",
            "group-hover/thread:opacity-100 focus-visible:opacity-100",
            "hover:bg-[var(--glass-bg-strong)] active:scale-[0.96]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring,#17a2c9)]",
          )}
          style={{ color: MOUDIR.coral }}
        >
          <GitBranch size={11} strokeWidth={2.2} aria-hidden />
          Dériver
        </button>
      ) : null}
    </motion.div>
  );
}

export function DataThreads({
  threads,
  activeId,
  onSelect,
  onBranch,
  hideKicker,
  className,
}: DataThreadsProps) {
  const motionOn = useMotionOn();
  const now = Date.now();
  const ordered = [...threads].sort((a, b) => b.createdAt - a.createdAt);
  const isEmpty = ordered.length === 0;

  // Collapsed: when there is no history, render a single slim hint line so the
  // KPI panel below keeps its room instead of being crowded by a tall empty card.
  if (isEmpty) {
    return (
      <section className={cn("flex items-center gap-2.5", className)}>
        {hideKicker ? null : <Kicker className="shrink-0">Fils de données</Kicker>}
        <span
          aria-hidden
          className="h-1 w-1 shrink-0 rounded-full"
          style={{ background: `${MOUDIR.coral}66` }}
        />
        <p className="truncate text-[11px] leading-none text-muted-foreground">
          Vos itérations apparaîtront ici.
        </p>
      </section>
    );
  }

  return (
    <section className={cn("flex flex-col gap-2.5", className)}>
      {hideKicker ? null : (
        <div className="flex items-baseline justify-between gap-2">
          <Kicker>Fils de données</Kicker>
          <span className="text-[11px] tabular-nums text-muted-foreground">{ordered.length}</span>
        </div>
      )}

      <motion.div
        variants={stagger}
        initial={motionOn ? "hidden" : false}
        animate="show"
        className="flex flex-col gap-2"
      >
        {ordered.map((thread) => (
          <ThreadCard
            key={thread.id}
            thread={thread}
            active={thread.id === activeId}
            now={now}
            onSelect={onSelect}
            onBranch={onBranch}
          />
        ))}
      </motion.div>
    </section>
  );
}
