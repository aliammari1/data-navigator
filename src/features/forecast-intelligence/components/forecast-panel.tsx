"use client";

/**
 * ForecastPanel — a polished, fully-offline forecasting panel.
 *
 * Given a numeric time series ({date, value}[]) it renders:
 *  - a horizon control,
 *  - a uPlot line chart (history + forecast + confidence band + anomaly
 *    markers) — the hot-path visual, drawn off ECharts for ~10% CPU vs ~70%,
 *  - a metrics strip (MAE / RMSE / MAPE from an internal backtest),
 *  - an "Explain" button that calls the unified AI provider's
 *    generateStructured to produce a short, typed narrative.
 *
 * Compute is memoised: the pure-TS engine runs synchronously inside useMemo,
 * and a Pyodide-backed stronger forecast is attempted in an async effect that
 * upgrades the result in place (with a "computing offline…" indicator). The
 * Pyodide path degrades to null and we keep the pure result, so the panel is
 * useful instantly and never blocks the main thread on the sandbox.
 */

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Info,
  Lightbulb,
  Loader2,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { ReactNode } from "react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { fmtN, fmtPct } from "@/features/telecom/lib/format";
import { useAI } from "@/platform/ai/provider";
import { cn } from "@/shared/utils";
import { forecastSeries, type ForecastResult, type SeriesPoint } from "../core/forecast-engine";
import { forecastSeriesPyodide } from "../core/forecast-pyodide";
import { ForecastChart } from "./ForecastChart";

// ─── AI narrative schema ──────────────────────────────────────────────────────

const NarrativeSchema = z.object({
  summary: z.string(),
  risks: z.array(z.string()),
  recommendation: z.string(),
});
type ForecastNarrative = z.infer<typeof NarrativeSchema>;

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ForecastPanelProps {
  /** Input time series, chronological. */
  series: SeriesPoint[];
  /** Human label for the metric (e.g. "Transaction volume"). */
  metricLabel?: string;
  /** Unit suffix for the value (e.g. "TND", "tx"). */
  unit?: string;
  /** Default forecast horizon (steps). */
  defaultHorizon?: number;
  /** Season length hint (7 = weekly). */
  seasonLength?: number;
  /**
   * When true, attempt a Pyodide-backed forecast that upgrades the pure-TS
   * result once the sandbox is ready. Defaults to true; set false in stories /
   * tests that must stay synchronous and headless.
   */
  enablePyodide?: boolean;
  className?: string;
}

const HORIZON_OPTIONS = [7, 14, 30] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export const ForecastPanel = memo(function ForecastPanel({
  series,
  metricLabel = "Value",
  unit = "",
  defaultHorizon = 7,
  seasonLength = 7,
  enablePyodide = true,
  className,
}: ForecastPanelProps) {
  const ai = useAI();
  const [horizon, setHorizon] = useState<number>(defaultHorizon);

  // ── Pure-TS forecast (synchronous, memoised) ────────────────────────────────
  const baseResult = useMemo<ForecastResult>(
    () => forecastSeries(series, { horizon, seasonLength }),
    [series, horizon, seasonLength],
  );

  // ── Pyodide upgrade (async, non-blocking) ───────────────────────────────────
  const [pyResult, setPyResult] = useState<ForecastResult | null>(null);
  const [computingOffline, setComputingOffline] = useState(false);
  const [pyStatus, setPyStatus] = useState<string>("");

  // Debounce the horizon so toggling 7→14→30 doesn't relaunch the heavy sandbox
  // fit on every click; the advanced fit is horizon-light but the round-trip and
  // narrative reset are not, so coalescing rapid toggles keeps the panel snappy.
  const debouncedHorizon = useDebouncedValue(horizon, 250);

  useEffect(() => {
    if (!enablePyodide || series.length < 3) {
      setPyResult(null);
      return;
    }
    let cancelled = false;
    setComputingOffline(true);
    setPyResult(null);
    forecastSeriesPyodide(series, { horizon: debouncedHorizon, seasonLength }, (s) => {
      if (!cancelled) setPyStatus(s);
    })
      .then((r) => {
        if (!cancelled && r) setPyResult(r);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setComputingOffline(false);
      });
    return () => {
      cancelled = true;
    };
  }, [series, debouncedHorizon, seasonLength, enablePyodide]);

  // Prefer the stronger Pyodide result when present.
  const result = pyResult ?? baseResult;
  const engineLabel = pyResult ? "Pyodide" : "in-browser";

  // ── AI narrative state ──────────────────────────────────────────────────────
  const [narrative, setNarrative] = useState<ForecastNarrative | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reset the narrative whenever the underlying forecast changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: result is the reset trigger, not read inside.
  useEffect(() => {
    setNarrative(null);
    setExplainError(null);
  }, [result]);

  async function handleExplain() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setExplaining(true);
    setExplainError(null);
    try {
      const facts = buildNarrativePrompt(result, metricLabel, unit);
      const out = await ai.generateStructured(
        {
          system:
            "You are a concise telecom analytics advisor. Given forecast facts, " +
            "return a short JSON narrative. Be specific and actionable; do not " +
            "invent numbers beyond those provided.",
          prompt: facts,
          temperature: 0.2,
          maxTokens: 400,
          signal: controller.signal,
        },
        NarrativeSchema,
      );
      setNarrative(out);
    } catch (err) {
      if (!controller.signal.aborted) {
        setExplainError(err instanceof Error ? err.message : "Could not generate explanation.");
      }
    } finally {
      setExplaining(false);
    }
  }

  useEffect(() => () => abortRef.current?.abort(), []);

  const trendUp = result.trend >= 0;

  // ── Empty state (after all hooks, to respect the rules of hooks) ────────────
  if (series.length < 2) {
    return (
      <div
        className={cn(
          "rounded-xl border border-border bg-card p-5 text-card-foreground",
          className,
        )}
      >
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
            <TrendingUp className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            Not enough data to forecast
          </h3>
          <p className="mt-1 max-w-sm text-xs leading-snug text-muted-foreground">
            Provide at least two observations to project a trend.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className={cn("space-y-4", className)} aria-label={`${metricLabel} forecast`}>
      {/* Header + controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{metricLabel} forecast</h3>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
              trendUp
                ? "bg-success/10 text-success"
                : "bg-destructive/10 text-destructive",
            )}
          >
            {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trendUp ? "Rising" : "Falling"}
          </span>
          {result.degraded && (
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              Simplified model
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5" role="group" aria-label="Forecast horizon">
          <span className="mr-1 text-xs text-muted-foreground">Horizon</span>
          {HORIZON_OPTIONS.map((h) => (
            <Button
              key={h}
              size="xs"
              variant={horizon === h ? "default" : "outline"}
              aria-pressed={horizon === h}
              onClick={() => setHorizon(h)}
            >
              {h}d
            </Button>
          ))}
        </div>
      </div>

      {/* Offline-compute indicator */}
      {computingOffline && (
        <div
          className="flex items-center gap-2 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Computing offline{pyStatus ? ` — ${pyStatus}` : "…"}</span>
        </div>
      )}

      {/* Chart — uPlot hot-path renderer (history + forecast + CI band + anomalies). */}
      <div className="rounded-xl border border-border bg-card p-4 text-card-foreground">
        <ForecastChart
          result={result}
          height={320}
          ariaLabel={`Line chart of historical and forecast ${metricLabel} with confidence band`}
        />
        <p className="mt-1 px-1 text-[11px] text-muted-foreground">
          History (solid) · Forecast (dashed) · ±{result.degraded ? 0 : 95}% confidence band ·
          computed {engineLabel}
        </p>
      </div>

      {/* Metrics strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          label="Next-step"
          value={
            result.forecast[0]
              ? `${fmtN(result.forecast[0].value, 0)}${unit ? ` ${unit}` : ""}`
              : "—"
          }
          tone={trendUp ? "up" : "down"}
        />
        <Metric
          label="MAE"
          value={result.metrics ? fmtN(result.metrics.mae, 1) : "—"}
          hint="Mean abs. error"
        />
        <Metric
          label="RMSE"
          value={result.metrics ? fmtN(result.metrics.rmse, 1) : "—"}
          hint="Root mean sq. error"
        />
        <Metric
          label="MAPE"
          value={result.metrics ? fmtPct(result.metrics.mape) : "—"}
          hint="Mean abs. % error"
        />
      </div>

      {/* Anomalies */}
      {result.anomalies.length > 0 && (
        <Callout
          severity="warning"
          title={`${result.anomalies.length} residual ${result.anomalies.length === 1 ? "anomaly" : "anomalies"}`}
        >
          Largest deviation on <span className="font-medium">{result.anomalies[0]!.date}</span>:{" "}
          {fmtN(result.anomalies[0]!.value, 0)} vs expected {fmtN(result.anomalies[0]!.expected, 0)}{" "}
          (z = {result.anomalies[0]!.zScore.toFixed(1)}).
        </Callout>
      )}

      {/* AI narrative */}
      <div className="rounded-xl border border-border bg-card p-4 text-card-foreground">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Sparkles className="w-4 h-4 text-primary" />
            AI narrative
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleExplain}
            disabled={explaining}
            aria-busy={explaining}
          >
            {explaining ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Explaining…
              </>
            ) : (
              <>
                <Cpu className="w-3.5 h-3.5" />
                Explain
              </>
            )}
          </Button>
        </div>

        {explainError && (
          <div className="mt-3">
            <Callout severity="danger" title="Explanation failed">
              {explainError}
            </Callout>
          </div>
        )}

        {!narrative && !explaining && !explainError && (
          <p className="mt-3 text-xs text-muted-foreground">
            Generate a plain-language summary, risks, and a recommendation from the forecast — runs
            on your selected on-device model.
          </p>
        )}

        {narrative && (
          <div className="mt-3 space-y-3">
            <p className="text-[13px] leading-relaxed text-foreground">{narrative.summary}</p>
            {narrative.risks.length > 0 && (
              <div>
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                  Risks
                </div>
                <ul className="space-y-1">
                  {narrative.risks.map((r, i) => (
                    <li key={i} className="flex gap-2 text-[13px] text-foreground">
                      <span className="text-muted-foreground">•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Callout
              severity="accent"
              title="Recommendation"
              icon={<Lightbulb className="w-4 h-4" />}
            >
              {narrative.recommendation}
            </Callout>
          </div>
        )}
      </div>
    </section>
  );
});

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Debounce a fast-changing value (e.g. a horizon toggle) by `delayMs`. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-xl border border-border bg-transparent p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-lg font-bold tabular-nums",
          tone === "up"
            ? "text-success"
            : tone === "down"
              ? "text-destructive"
              : "text-foreground",
        )}
      >
        {value}
      </p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── Callout (semantic-token severity block) ──────────────────────────────────

type CalloutSeverity = "info" | "success" | "warning" | "danger" | "accent";

const CALLOUT_TONE: Record<
  CalloutSeverity,
  { wrap: string; fg: string; icon: ReactNode }
> = {
  info: {
    wrap: "border-primary/30 bg-primary/10",
    fg: "text-primary",
    icon: <Info className="h-4 w-4" />,
  },
  success: {
    wrap: "border-success/30 bg-success/10",
    fg: "text-success",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  warning: {
    wrap: "border-warning/30 bg-warning/10",
    fg: "text-warning",
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  danger: {
    wrap: "border-destructive/30 bg-destructive/10",
    fg: "text-destructive",
    icon: <AlertCircle className="h-4 w-4" />,
  },
  accent: {
    wrap: "border-primary/30 bg-primary/10",
    fg: "text-primary",
    icon: <Sparkles className="h-4 w-4" />,
  },
};

/** Inline severity callout built on shadcn semantic tokens (replaces Atlas). */
function Callout({
  severity,
  title,
  children,
  icon,
  className,
}: {
  severity: CalloutSeverity;
  title?: string;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  const tone = CALLOUT_TONE[severity];
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3 py-2.5",
        tone.wrap,
        className,
      )}
    >
      <div className={cn("mt-0.5 flex-none", tone.fg)}>{icon ?? tone.icon}</div>
      <div className="min-w-0 flex-1">
        {title && (
          <div className={cn("mb-0.5 text-xs font-semibold uppercase tracking-wide", tone.fg)}>
            {title}
          </div>
        )}
        <div className="text-[13px] leading-snug text-foreground">{children}</div>
      </div>
    </div>
  );
}

// ─── Prompt builder (pure) ────────────────────────────────────────────────────

/** Build a compact, fact-only prompt for the structured narrative. */
function buildNarrativePrompt(result: ForecastResult, metricLabel: string, unit: string): string {
  const first = result.forecast[0];
  const last = result.forecast[result.forecast.length - 1];
  const u = unit ? ` ${unit}` : "";
  const lines = [
    `Metric: ${metricLabel}${unit ? ` (in ${unit})` : ""}.`,
    `History points: ${result.history.length}.`,
    `Trend per step: ${result.trend.toFixed(2)} (${result.trend >= 0 ? "rising" : "falling"}).`,
    first
      ? `Next forecast: ${first.value.toFixed(0)}${u} (range ${first.lower.toFixed(0)}–${first.upper.toFixed(0)}).`
      : "",
    last && result.forecast.length > 1
      ? `End of horizon (${result.forecast.length} steps): ${last.value.toFixed(0)}${u}.`
      : "",
    result.metrics
      ? `Backtest accuracy: MAE ${result.metrics.mae.toFixed(1)}, RMSE ${result.metrics.rmse.toFixed(1)}, MAPE ${result.metrics.mape.toFixed(1)}%.`
      : "Backtest: not enough history.",
    result.anomalies.length
      ? `${result.anomalies.length} historical anomaly(ies); largest on ${result.anomalies[0]!.date} (z=${result.anomalies[0]!.zScore.toFixed(1)}).`
      : "No historical anomalies.",
    "",
    'Return JSON: {"summary": one or two sentences, "risks": array of short strings, "recommendation": one actionable sentence}.',
  ];
  return lines.filter(Boolean).join("\n");
}
