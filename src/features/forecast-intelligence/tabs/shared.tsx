"use client";

/**
 * Shared building blocks for the forecast tabs.
 *
 * Holds the (now remount-free) AnimatedNumber, dataset-empty/loading states,
 * common types, and small pure helpers derived from REAL DuckDB rows. None of
 * this module generates synthetic data or uses Math.random — every value the
 * tabs render is traced back to the active dataset.
 */

import { motion, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { RawCanalRow } from "@/features/telecom/lib/queries";
import type { DailyTrendRow } from "@/features/telecom/types";
import { cn } from "@/shared/utils";

// ─── Animated Number (value animation, no key-remount thrash) ─────────────────

/**
 * Animates the *value* with a spring on a stable element rather than remounting
 * via `key={Math.round(value)}`. This removes the enter/exit animation churn the
 * old implementation triggered on every integer tick (expensive during slider
 * drags) while keeping a smooth count-up.
 */
export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  const spring = useSpring(value, { stiffness: 120, damping: 20, mass: 0.6 });
  useEffect(() => {
    spring.set(value);
  }, [spring, value]);
  const text = useTransform(spring, (v) => format(v));
  return <motion.span className={className}>{text}</motion.span>;
}

// ─── Dataset states ───────────────────────────────────────────────────────────

export function NoDatasetState({ what }: { what: string }) {
  return (
    <Card className="bg-slate-900/60 ring-slate-700/40">
      <CardContent className="py-16 text-center">
        <p className="text-base font-medium text-slate-200">No dataset loaded</p>
        <p className="mt-1.5 text-sm text-slate-500">
          Load a dataset to compute {what} from your real transactions.
        </p>
      </CardContent>
    </Card>
  );
}

export function NotEnoughDataState({ what }: { what: string }) {
  return (
    <Card className="bg-slate-900/60 ring-slate-700/40">
      <CardContent className="py-16 text-center">
        <p className="text-base font-medium text-slate-200">Not enough history</p>
        <p className="mt-1.5 text-sm text-slate-500">
          {what} needs at least a few days of dated transactions in the active dataset.
        </p>
      </CardContent>
    </Card>
  );
}

export function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-900/60" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl bg-slate-900/60" />
    </div>
  );
}

// ─── Real-data derivations (pure) ─────────────────────────────────────────────

/** Today's baseline (volume, success rate 0–1, avg amount) from the last day. */
export function baselineFromDaily(daily: DailyTrendRow[]): {
  volume: number;
  successRate: number;
  avgAmount: number;
  revenue: number;
} {
  const last = daily[daily.length - 1];
  if (!last) return { volume: 0, successRate: 0, avgAmount: 0, revenue: 0 };
  const volume = last.total;
  const successRate = last.total > 0 ? last.success / last.total : 0;
  const revenue = last.amount;
  const avgAmount = last.total > 0 ? last.amount / last.total : 0;
  return { volume, successRate, avgAmount, revenue };
}

/** Per-channel average ticket from real canal summaries. */
export function channelAvgAmount(ch: RawCanalRow): number {
  return ch.total > 0 ? ch.amount / ch.total : 0;
}

/** Dataset-wide average ticket (TND per transaction) from real daily rows. */
export function avgTicketFromDaily(daily: DailyTrendRow[]): number {
  let txns = 0;
  let amount = 0;
  for (const r of daily) {
    txns += r.total;
    amount += r.amount;
  }
  return txns > 0 ? amount / txns : 0;
}

// Channel risk-card / scatter palette (kept consistent across tabs).
export function riskColor(score: number): {
  bg: string;
  border: string;
  text: string;
  bar: string;
} {
  if (score < 30)
    return {
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
      text: "text-emerald-400",
      bar: "#10b981",
    };
  if (score < 60)
    return {
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      text: "text-amber-400",
      bar: "#f59e0b",
    };
  return {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-400",
    bar: "#ef4444",
  };
}

export { cn };
