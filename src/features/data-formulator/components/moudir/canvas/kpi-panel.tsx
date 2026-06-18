"use client";

/**
 * Moudir — right-side KPI panel (developed, always useful).
 *
 * FACTS (GateGuard): new file under the canvas Moudir experience (remove three.js
 * direction). Importers: MoudirSwarmScreen.tsx (leader wires it as the right panel
 * — see spec §6). Data: REAL telecom KPIs derived from useTelecomAnalytics
 * (KPISummary / HourlyRow[] / CanalSummary[] / StatusRow[] / ForecastPoint[]),
 * passed in as props (the integration seam called out in spec §3.1 — the panel is
 * a pure view and never queries DuckDB itself). Swarm result/artifacts read from
 * the shared SwarmResult shape. User instruction: "canvas Moudir experience,
 * remove three.js". No three.js / r3f. "use client". French-first. Offline-safe.
 *
 * Two jobs (spec §3):
 *   (a) ALWAYS show the live telecom KPIs of the active dataset (informative even
 *       at idle): taux de réussite (hero, with delta + sparkline), transactions,
 *       canaux actifs, top erreur, and an hourly-volume sparkline + 4h forecast.
 *   (b) FOLD IN the swarm's synthesized answer (headline + confidence) and its
 *       artifact thumbnails when a result exists — reusing the existing
 *       SwarmResultCard + MoudirArtifact grammar.
 *
 * Warm glass, theme-aware (light + dark via --glass-* tokens), reduced-motion
 * aware (entrance motion only when allowed). Coral is the only brand signal;
 * status hues stay fixed.
 */

import { motion } from "motion/react";
import { useMemo } from "react";
import { fmtCompact, fmtN, fmtPct } from "@/features/telecom/lib/format";
import type { CanalSummary, HourlyRow, KPISummary, StatusRow } from "@/features/telecom/types";
import type { ForecastPoint } from "@/platform/browser/forecast-onnx";
import { cn } from "@/shared/utils";
import type { SwarmResult } from "../../../core/swarm/types";
import { MoudirArtifact } from "../moudir-artifact";
import { Kicker, MOUDIR, MoudirMark, Pill, Rule, rise, stagger, useMotionOn } from "../moudir-kit";
import { Sparkline } from "./sparkline";

// ─── Props (the integration seam) ────────────────────────────────────────────

export interface KpiPanelProps {
  /** Live KPI summary of the active dataset (null until analytics resolve). */
  kpi: KPISummary | null;
  /** Hourly series — drives the success-rate + volume sparklines. */
  hourly: HourlyRow[];
  /** Channel summaries — drives the "canal dominant" / active-channels card. */
  canals: CanalSummary[];
  /** Status breakdown — drives the "top erreur" card. */
  statusData: StatusRow[];
  /** Offline ONNX forecast (next hours) — dashed tail on the volume sparkline. */
  forecast?: ForecastPoint[];
  /** The synthesized swarm result, when a run has completed. */
  result?: SwarmResult | null;
  /** Tapping a follow-up chip re-asks Moudir. */
  onFollowUp?: (question: string) => void;
  /** When true (default), the panel scrolls internally so tall content (e.g. a long
   *  "Top erreur" label + swarm answer + artifacts) never clips against the rail. */
  scrollable?: boolean;
  className?: string;
}

// ─── Local helpers ───────────────────────────────────────────────────────────

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

/** A warm-glass metric card shell (inset hairline, editorial). */
function MetricCard({
  children,
  className,
  span,
}: {
  children: React.ReactNode;
  className?: string;
  span?: boolean;
}) {
  return (
    <motion.div
      variants={rise}
      className={cn("flex flex-col gap-1.5 rounded-2xl p-3", span && "col-span-2", className)}
      style={{
        background: MOUDIR.panel,
        boxShadow: "inset 0 0 0 1px var(--glass-border)",
      }}
    >
      {children}
    </motion.div>
  );
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </span>
  );
}

/** ▲/▼ delta in green/rose; hidden when undefined. */
function Delta({ value, suffix = "" }: { value?: number; suffix?: string }) {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return null;
  const up = value >= 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[12px] font-medium tabular-nums"
      style={{ color: up ? MOUDIR.green : MOUDIR.rose }}
    >
      {up ? "▲" : "▼"} {Math.abs(value).toFixed(1)}
      {suffix}
    </span>
  );
}

// ─── KPI rail (always on) ────────────────────────────────────────────────────

function KpiRail({
  kpi,
  hourly,
  canals,
  statusData,
  forecast,
}: {
  kpi: KPISummary | null;
  hourly: HourlyRow[];
  canals: CanalSummary[];
  statusData: StatusRow[];
  forecast: ForecastPoint[];
}) {
  const motionOn = useMotionOn();

  // Derived series + summaries, recomputed only when inputs change.
  const {
    successSeries,
    successDelta,
    volumeSeries,
    forecastVolume,
    activeChannels,
    topChannel,
    topError,
  } = useMemo(() => {
    const sorted = [...hourly].sort((a, b) => a.hour - b.hour);
    const successSeries = sorted.map((h) => (h.total > 0 ? (h.success / h.total) * 100 : 0));
    const volumeSeries = sorted.map((h) => h.total);

    // Delta = last hour's success rate vs the mean of the prior hours.
    let successDelta: number | undefined;
    if (successSeries.length >= 2) {
      const last = successSeries[successSeries.length - 1];
      const prior = successSeries.slice(0, -1);
      const mean = prior.reduce((a, b) => a + b, 0) / prior.length;
      successDelta = last - mean;
    }

    const forecastVolume = (forecast ?? []).map((f) => f.predictedTotal);

    const activeChannels = canals.filter((c) => c.total > 0).length;
    const topChannel = canals.length > 0 ? [...canals].sort((a, b) => b.total - a.total)[0] : null;

    // Top error = the largest non-success status row.
    const failures = [...statusData]
      .filter((s) => {
        const k = s.status.toLowerCase();
        return !k.includes("success") && !k.includes("réuss") && !k.includes("ok");
      })
      .sort((a, b) => b.count - a.count);
    const totalTx = kpi?.totalTransactions ?? statusData.reduce((a, s) => a + s.count, 0);
    const topError =
      failures.length > 0
        ? {
            label: failures[0].status,
            count: failures[0].count,
            share: totalTx > 0 ? (failures[0].count / totalTx) * 100 : 0,
          }
        : null;

    return {
      successSeries,
      successDelta,
      volumeSeries,
      forecastVolume,
      activeChannels,
      topChannel,
      topError,
    };
  }, [hourly, canals, statusData, forecast, kpi]);

  const severeError = topError != null && topError.share >= 5;

  return (
    <motion.div
      variants={motionOn ? stagger : undefined}
      initial={motionOn ? "hidden" : false}
      animate="show"
      className="grid grid-cols-2 gap-3"
    >
      {/* ── Hero: Taux de réussite (full width, taller sparkline) ── */}
      <MetricCard span>
        <div className="flex items-center justify-between">
          <CardLabel>Taux de réussite</CardLabel>
          <Delta value={successDelta} suffix="pt" />
        </div>
        <div className="flex items-end justify-between gap-3">
          <span
            className="text-4xl font-semibold tabular-nums leading-none text-foreground"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {kpi ? fmtPct(kpi.successRate) : "—"}
          </span>
          <Sparkline
            values={successSeries}
            color={MOUDIR.coral}
            width={140}
            height={40}
            strokeWidth={2}
          />
        </div>
      </MetricCard>

      {/* ── Transactions (volume sparkline + forecast tail) ── */}
      <MetricCard>
        <CardLabel>Transactions</CardLabel>
        <span className="text-2xl font-semibold tabular-nums leading-none text-foreground">
          {kpi ? fmtCompact(kpi.totalTransactions) : "—"}
        </span>
        <Sparkline
          values={volumeSeries}
          forecast={forecastVolume}
          color={MOUDIR.coral}
          width={120}
          height={28}
        />
      </MetricCard>

      {/* ── Canaux actifs / dominant ── */}
      <MetricCard>
        <CardLabel>Canaux actifs</CardLabel>
        <span className="text-2xl font-semibold tabular-nums leading-none text-foreground">
          {activeChannels || "—"}
        </span>
        {topChannel ? (
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: topChannel.color }}
            />
            <span className="truncate text-[12px] text-muted-foreground">
              {topChannel.label} · {fmtPct(topChannel.share)}
            </span>
          </div>
        ) : (
          <span className="text-[12px] text-muted-foreground">—</span>
        )}
      </MetricCard>

      {/* ── Top erreur (severity-tinted share bar; ≥5% reads rose) ── */}
      <MetricCard span>
        <div className="flex items-center justify-between">
          <CardLabel>Top erreur</CardLabel>
          {topError && (
            <span
              className="font-mono text-[11px] tabular-nums"
              style={{ color: severeError ? MOUDIR.rose : "hsl(var(--muted-foreground))" }}
            >
              {fmtPct(topError.share)}
            </span>
          )}
        </div>
        {topError ? (
          <>
            <span
              className="text-[15px] font-semibold leading-snug text-foreground"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                wordBreak: "break-word",
              }}
              title={topError.label}
            >
              {topError.label}
            </span>
            <span className="text-[12px] tabular-nums text-muted-foreground">
              {fmtN(topError.count)} transactions
            </span>
            {/* Tiny share bar instead of a sparkline. */}
            <div
              className="mt-1 h-1.5 w-full overflow-hidden rounded-full"
              style={{ background: "hsl(var(--muted) / 0.5)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.max(2, topError.share))}%`,
                  background: severeError ? MOUDIR.rose : MOUDIR.gold,
                }}
              />
            </div>
          </>
        ) : (
          <span className="text-[12px] text-muted-foreground">Aucune erreur dominante</span>
        )}
      </MetricCard>
    </motion.div>
  );
}

// ─── Swarm answer (folds in when done) ───────────────────────────────────────

function SwarmAnswer({
  result,
  onFollowUp,
}: {
  result: SwarmResult;
  onFollowUp?: (question: string) => void;
}) {
  const conf = confidenceMeta(result.confidence);
  // Narrow panel → single column of artifact thumbnails (spec §3.4).
  const artifacts = result.artifacts ?? [];

  return (
    <motion.section variants={rise} className="flex flex-col gap-3">
      <div
        className="flex flex-col gap-2.5 rounded-2xl p-3.5"
        style={{
          background: MOUDIR.panel,
          boxShadow: "inset 0 0 0 1px var(--glass-border)",
          backgroundImage:
            "radial-gradient(120% 80% at 0% -10%, rgba(23, 162, 201,0.07), transparent 55%)",
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2">
            <MoudirMark size={24} />
            <Kicker tone="coral">La réponse de Moudir</Kicker>
          </span>
          <Pill tone={conf.tone}>{conf.label}</Pill>
        </div>

        <h3 className="text-balance text-xl font-semibold leading-snug tracking-tight text-foreground">
          {result.headline}
        </h3>

        {result.summary && (
          <p className="text-[13px] leading-relaxed text-muted-foreground">{result.summary}</p>
        )}

        {result.followUps.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {result.followUps.slice(0, 3).map((question, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onFollowUp?.(question)}
                disabled={!onFollowUp}
                className="inline-flex items-center rounded-full border border-[#17a2c9]/35 px-3 py-1 text-left text-[12px] font-medium text-[#17a2c9] transition-colors hover:bg-[#17a2c9]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17a2c9]/50 disabled:cursor-default disabled:opacity-60"
              >
                {question}
              </button>
            ))}
          </div>
        )}
      </div>

      {artifacts.length > 0 && (
        <div className="flex flex-col gap-3">
          <Kicker>Ce que l'équipe a produit</Kicker>
          <div className="flex flex-col gap-4">
            {artifacts.map((artifact, i) => (
              <MoudirArtifact key={artifact.id} artifact={artifact} lead={i === 0} />
            ))}
          </div>
        </div>
      )}
    </motion.section>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export function KpiPanel({
  kpi,
  hourly,
  canals,
  statusData,
  forecast = [],
  result = null,
  onFollowUp,
  scrollable = true,
  className,
}: Readonly<KpiPanelProps>) {
  const motionOn = useMotionOn();

  return (
    <motion.aside
      variants={motionOn ? stagger : undefined}
      initial={motionOn ? "hidden" : false}
      animate="show"
      aria-label="Indicateurs clés et réponse de Moudir"
      className={cn(
        "flex min-h-0 flex-col gap-4 p-3 sm:p-4",
        scrollable && "overflow-y-auto overscroll-contain",
        className,
      )}
    >
      {/* When a run is done, the answer leads; KPIs become supporting evidence. */}
      {result && (
        <>
          <SwarmAnswer result={result} onFollowUp={onFollowUp} />
          <Rule />
        </>
      )}

      <div className="flex flex-col gap-3">
        <motion.div variants={rise} className="flex items-center justify-between">
          <Kicker>Le rapport en chiffres</Kicker>
          <Kicker tone="muted" className="text-[9px]">
            Hors-ligne
          </Kicker>
        </motion.div>

        <KpiRail
          kpi={kpi}
          hourly={hourly}
          canals={canals}
          statusData={statusData}
          forecast={forecast}
        />
      </div>
    </motion.aside>
  );
}
