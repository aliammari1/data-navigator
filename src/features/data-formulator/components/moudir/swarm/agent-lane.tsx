"use client";

/**
 * Moudir — AgentLane.
 *
 * The core "complexity made visible" unit. One agent's slice of the swarm, shown
 * as a warm glass card that reads in BOTH light and dark mode (it follows the app
 * theme via the shared design tokens + warm glass tokens — never a dark slab).
 *
 * It shows, for a single AgentRunState:
 *   - the role identity (icon + French label from ROLE_META, tinted with the
 *     role's warm accent hue),
 *   - the task title,
 *   - a status Pill (statusMeta — queued/thinking/streaming/running/done/failed/
 *     skipped) with the right tone + a pulsing dot while work is live,
 *   - elapsed time (live ticking while running, frozen once finished),
 *   - a LIVE STREAMING console of `run.partial` (monospace, autoscrolls to the
 *     bottom, with a subtle blinking caret while streaming),
 *   - a critic VERDICT badge when `run.verdict` exists (emerald accepted / rose
 *     rejected, with reason + confidence),
 *   - the produced `run.artifacts`, rendered inline via the shared <MoudirArtifact/>,
 *   - an error block (rose) when the task failed.
 *
 * Editorial, warm, crafted. Coral stays the single brand signal; status hues are
 * fixed so meaning is stable across themes. Motion is reduced-motion aware.
 */

import { Check, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import type { AgentRunState } from "../../../core/swarm/types";
import { MoudirArtifact } from "../moudir-artifact";
import {
  MOUDIR,
  Pill,
  ROLE_META,
  rise,
  statusMeta,
  ThinkingDots,
  useMotionOn,
} from "../moudir-kit";

const STATUS_DOT: Record<ReturnType<typeof statusMeta>["tone"], string> = {
  neutral: "hsl(var(--muted-foreground))",
  coral: MOUDIR.coral,
  gold: MOUDIR.gold,
  green: MOUDIR.green,
  rose: MOUDIR.rose,
};

/** Format an elapsed millisecond span as a short, human "1.2s" / "1m 04s". */
function formatElapsed(ms: number): string {
  if (ms < 0) ms = 0;
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

/**
 * Elapsed time for a run: live-ticks while the task is running (started but not
 * finished), otherwise shows the frozen span. Returns null until the task starts.
 */
function useElapsed(
  startedAt: number | undefined,
  finishedAt: number | undefined,
  live: boolean,
): string | null {
  const [now, setNow] = useState(() => Date.now());

  const ticking = live && startedAt != null && finishedAt == null;
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [ticking]);

  if (startedAt == null) return null;
  const end = finishedAt ?? (ticking ? now : startedAt);
  return formatElapsed(end - startedAt);
}

/** Autoscroll the streaming console to the bottom as new tokens arrive. */
function StreamConsole({ text, streaming }: { text: string; streaming: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-pin on each token.
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  return (
    <div
      ref={ref}
      className="max-h-44 overflow-y-auto rounded-xl px-3 py-2.5 font-mono text-[12px] leading-relaxed"
      style={{
        background: "hsl(var(--muted) / 0.4)",
        boxShadow: "inset 0 0 0 1px var(--glass-border)",
        color: "hsl(var(--foreground) / 0.82)",
      }}
    >
      <span className="whitespace-pre-wrap break-words">{text}</span>
      {streaming && (
        <span
          className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[2px] animate-pulse align-middle"
          style={{ background: MOUDIR.coral }}
          aria-hidden
        />
      )}
    </div>
  );
}

/** The critic's verdict on this task's output: accepted (emerald) / rejected (rose). */
function VerdictBadge({ verdict }: { verdict: NonNullable<AgentRunState["verdict"]> }) {
  const accepted = verdict.accepted;
  const accent = accepted ? MOUDIR.green : MOUDIR.rose;
  const Icon = accepted ? Check : X;
  const confidenceLabel =
    verdict.confidence === "high"
      ? "confiance élevée"
      : verdict.confidence === "medium"
        ? "confiance moyenne"
        : "confiance faible";

  return (
    <div
      className="flex items-start gap-2.5 rounded-xl px-3 py-2.5"
      style={{
        background: `${accent}14`,
        boxShadow: `inset 0 0 0 1px ${accent}3d`,
      }}
    >
      <span
        className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        style={{ background: `${accent}29`, color: accent }}
      >
        <Icon size={13} strokeWidth={2.75} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold" style={{ color: accent }}>
            {accepted ? "Vérifié" : "Rejeté"}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {confidenceLabel}
          </span>
        </div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{verdict.reason}</p>
      </div>
    </div>
  );
}

export function AgentLane({ run }: { run: AgentRunState }) {
  const motionOn = useMotionOn();
  const headingId = useId();

  const { task, status, partial, artifacts, verdict, error } = run;
  const role = ROLE_META[task.role];
  const RoleIcon = role.Icon;
  const meta = statusMeta(status);

  const live = meta.pulse;
  const streaming = status === "streaming";
  const elapsed = useElapsed(run.startedAt, run.finishedAt, live);

  // Per-role warm accent (the icon chip + a faint left edge). HSL hue from the kit.
  const roleAccent = `hsl(${role.hue} 78% 55%)`;
  const dimmed = status === "skipped";

  return (
    <motion.section
      variants={rise}
      aria-labelledby={headingId}
      className="relative overflow-hidden rounded-2xl p-4 transition-opacity"
      style={{
        background: "var(--glass-bg)",
        boxShadow: "inset 0 0 0 1px var(--glass-border)",
        opacity: dimmed ? 0.6 : 1,
      }}
    >
      {/* Faint role-tinted left edge — quiet structure, not a box. */}
      <span
        aria-hidden
        className="absolute inset-y-3 left-0 w-[2px] rounded-full"
        style={{ background: roleAccent, opacity: 0.5 }}
      />

      {/* ─── Header: role identity · title · status · elapsed ─── */}
      <header className="flex items-start gap-3">
        <span
          className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: `hsl(${role.hue} 78% 55% / 0.14)`,
            color: roleAccent,
            boxShadow: `inset 0 0 0 1px hsl(${role.hue} 78% 55% / 0.3)`,
          }}
        >
          <RoleIcon size={16} strokeWidth={2} aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {role.label}
            </span>
            {elapsed && (
              <>
                <span aria-hidden className="h-1 w-1 rounded-full bg-border" />
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {elapsed}
                </span>
              </>
            )}
          </div>
          <h3 id={headingId} className="mt-0.5 truncate text-sm font-semibold text-foreground">
            {task.title}
          </h3>
        </div>

        <Pill tone={meta.tone} className="shrink-0">
          {meta.pulse ? (
            <span
              className="h-1.5 w-1.5 animate-pulse rounded-full"
              style={{ background: STATUS_DOT[meta.tone] }}
              aria-hidden
            />
          ) : (
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: STATUS_DOT[meta.tone] }}
              aria-hidden
            />
          )}
          {meta.label}
        </Pill>
      </header>

      {/* ─── Body: streaming console · verdict · artifacts · error ─── */}
      <div className="mt-3 flex flex-col gap-3">
        {partial.trim().length > 0 && <StreamConsole text={partial} streaming={streaming} />}

        {/* When live with no buffer yet, show the warm thinking indicator. */}
        {live && partial.trim().length === 0 && (
          <div className="flex items-center gap-2 px-1">
            <ThinkingDots />
            <span className="text-[12px] text-muted-foreground">
              {status === "running" ? "Exécution en cours…" : "Réflexion…"}
            </span>
          </div>
        )}

        {verdict && <VerdictBadge verdict={verdict} />}

        {artifacts.length > 0 && (
          <motion.div
            initial={motionOn ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col gap-3"
          >
            {artifacts.map((artifact) => (
              <MoudirArtifact key={artifact.id} artifact={artifact} />
            ))}
          </motion.div>
        )}

        {error && (
          <div
            className="rounded-xl px-3 py-2.5 text-[12px] leading-relaxed"
            style={{
              background: `${MOUDIR.rose}14`,
              boxShadow: `inset 0 0 0 1px ${MOUDIR.rose}3d`,
              color: MOUDIR.rose,
            }}
          >
            <span className="font-mono text-[10px] uppercase tracking-wider opacity-80">
              Erreur
            </span>
            <p className="mt-0.5 break-words">{error}</p>
          </div>
        )}
      </div>
    </motion.section>
  );
}
