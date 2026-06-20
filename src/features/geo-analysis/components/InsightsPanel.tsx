"use client";

/**
 * InsightsPanel
 *
 * On-demand AI narration of the geo aggregates. Inference is button-triggered
 * (never on mount), runs entirely offline through the provider registry, and is
 * grounded on real DuckDB numbers plus the seeded statistical anomaly detection
 * surfaced alongside the narrative.
 */

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtPct } from "@/features/telecom/lib/format";
import type { UseGeoInsightsResult } from "../hooks/use-geo-insights";

export interface InsightsPanelProps {
  insights: UseGeoInsightsResult;
  /** Whether enough region data exists to run the model. */
  canGenerate: boolean;
}

export function InsightsPanel({ insights, canGenerate }: InsightsPanelProps) {
  const { insight, anomalies, generating, error, progress, generate } = insights;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Regional Insights
          </span>
          <Button size="sm" onClick={() => void generate()} disabled={!canGenerate || generating}>
            {generating
              ? progress > 0 && progress < 100
                ? `Preparing model… ${Math.round(progress)}%`
                : "Analysing…"
              : insight
                ? "Regenerate"
                : "Generate insights"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {!insight && !error && !generating && (
          <p className="text-sm text-muted-foreground">
            Generate a grounded, offline summary of the regional landscape — standout regions,
            regions needing attention (via seeded GESD/MAD anomaly detection), the dominant channel
            mix, and one recommendation. Every figure is taken from the active dataset; nothing is
            invented.
          </p>
        )}

        {generating && !insight && (
          <p className="text-sm text-muted-foreground">
            Running anomaly detection and narrating the regional aggregates offline…
          </p>
        )}

        {insight && (
          <div className="space-y-4 text-sm">
            <p className="font-medium text-foreground">{insight.headline}</p>

            {anomalies.length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                <div className="mb-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                  Statistical anomalies ({anomalies[0]?.method.toUpperCase()})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {anomalies.slice(0, 8).map((a) => (
                    <span
                      key={a.region}
                      className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs"
                      title={`score ${a.score.toFixed(2)}`}
                    >
                      {a.region} · {fmtPct(a.successRate)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {insight.topRegions.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold text-muted-foreground">
                  Standout regions
                </div>
                <ul className="space-y-1">
                  {insight.topRegions.map((t) => (
                    <li key={t.region} className="flex gap-2">
                      <span className="shrink-0 font-medium">{t.region}:</span>
                      <span className="text-muted-foreground">{t.note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {insight.riskRegions.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold text-muted-foreground">
                  Needs attention
                </div>
                <ul className="space-y-1">
                  {insight.riskRegions.map((r) => (
                    <li key={r.region} className="flex gap-2">
                      <span className="shrink-0 font-medium">{r.region}:</span>
                      <span className="text-muted-foreground">{r.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div className="mb-1 text-xs font-semibold text-muted-foreground">
                Channel observation
              </div>
              <p className="text-muted-foreground">{insight.channelObservation}</p>
            </div>

            <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
              <div className="mb-1 text-xs font-semibold text-foreground">Recommendation</div>
              <p className="text-muted-foreground">{insight.recommendation}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
