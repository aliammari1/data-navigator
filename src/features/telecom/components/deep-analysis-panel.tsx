"use client";
import { Activity, AlertTriangle, BarChart2, Brain, Sparkles, TrendingUp } from "lucide-react";
import { motion } from "motion/react";
import { useMemo } from "react";
import { CANAL_CONFIG } from "@/features/telecom/lib/canal-config";
import { fmtN, fmtPct } from "@/features/telecom/lib/format";
import {
  computeAIInsights,
  computeCanalRiskScore,
  detectHourlyAnomalies,
  linearRegression,
} from "@/features/telecom/lib/insights";
import type * as Types from "@/features/telecom/types";
import { cn } from "@/shared/utils";
import { AIInsightsPanel } from "./ai-insights-panel";
import { AnomalyTimelineChart } from "./anomaly-timeline-chart";
import { NarrativeReport } from "./narrative-report";
import { RiskScoreChart } from "./risk-score-chart";
import { Section } from "./section";

export function DeepAnalysisPanel({
  kpi,
  canals,
  hourly,
  statusData,
  reportDate,
}: {
  kpi: Types.KPISummary;
  canals: Types.CanalSummary[];
  hourly: Types.HourlyRow[];
  statusData: Types.StatusRow[];
  reportDate: string;
}) {
  const anomalies = useMemo(() => detectHourlyAnomalies(hourly), [hourly]);
  const insights = useMemo(
    () => computeAIInsights(kpi, canals, hourly, statusData),
    [kpi, canals, hourly, statusData],
  );

  const trend = useMemo(() => {
    const pts = hourly
      .filter((r) => r.hour >= 6 && r.hour <= 22 && r.total > 0)
      .map((r): [number, number] => [r.hour, r.total]);
    return linearRegression(pts);
  }, [hourly]);

  const trendLabel =
    trend.slope > 10
      ? "En accélération — la charge augmente au fil de la journée"
      : trend.slope < -10
        ? "En décélération — la charge diminue vers la fin de journée"
        : "Stable — distribution de charge constante tout au long de la journée";

  const riskScores = canals.map((c) => ({
    ...c,
    risk: computeCanalRiskScore(c),
  }));
  const criticalCanals = riskScores.filter((c) => c.risk >= 40);

  return (
    <div className="space-y-6">
      <Section title="Synthèse Exécutive" icon={<Brain className="w-4 h-4" />}>
        <NarrativeReport kpi={kpi} canals={canals} hourly={hourly} reportDate={reportDate} />
      </Section>

      <Section
        title="Assistant métier du rapport"
        icon={<Sparkles className="w-4 h-4 text-primary" />}
        badge={`${insights.length} contrôles`}
      >
        <AIInsightsPanel insights={insights} loading={false} />
      </Section>

      <Section
        title="Détection d'Anomalies Horaires"
        icon={<Activity className="w-4 h-4" />}
        badge={anomalies.length > 0 ? `${anomalies.length} anomalies` : "Normal"}
      >
        <div className="space-y-4">
          {anomalies.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
              {anomalies.map((a) => (
                <div
                  key={a.hour}
                  className={cn(
                    "rounded-xl border px-3 py-2.5",
                    a.type === "spike"
                      ? "border-amber-500/25 bg-amber-500/8"
                      : "border-violet-500/25 bg-violet-500/8",
                  )}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span
                      className={cn(
                        "text-xs font-bold",
                        a.type === "spike"
                          ? "text-amber-700 dark:text-amber-300"
                          : "text-violet-700 dark:text-violet-300",
                      )}
                    >
                      {a.hour.toString().padStart(2, "0")}:00 —{" "}
                      {a.type === "spike" ? "Pic de Trafic" : "Baisse Inhabituelle"}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      z={a.zScore.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {Math.abs(a.zScore).toFixed(1)}σ de la moyenne horaire ·{" "}
                    {a.type === "spike" ? "risque de capacité" : "interruption de service ?"}
                  </div>
                </div>
              ))}
            </div>
          )}
          <AnomalyTimelineChart hourly={hourly} anomalies={anomalies} />
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground pt-1">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" /> Pic (&gt;1.8σ
              au-dessus de la moyenne)
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-violet-500 inline-block" /> Chute (&gt;1.8σ en
              dessous de la moyenne)
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-blue-400 inline-block" /> Normal
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Tendance de Charge Intrajournalière (Régression Linéaire)"
        icon={<TrendingUp className="w-4 h-4" />}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="text-[10px] text-muted-foreground mb-1">Direction de la Tendance</div>
            <div
              className={cn(
                "text-sm font-semibold",
                trend.slope > 10
                  ? "text-amber-600 dark:text-amber-400"
                  : trend.slope < -10
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-emerald-600 dark:text-emerald-400",
              )}
            >
              {trend.slope > 0 ? "En hausse" : trend.slope < 0 ? "En baisse" : "Stable"}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">{trendLabel}</div>
          </div>
          <div className="rounded-xl border border-border bg-muted/40 p-4">
            <div className="text-[10px] text-muted-foreground mb-1">Pente (tx/heure)</div>
            <div className="text-sm font-bold text-foreground">
              {trend.slope > 0 ? "+" : ""}
              {trend.slope.toFixed(1)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              Taux de variation par heure
            </div>
          </div>
          <div className="rounded-xl border border-border bg-muted/40 p-4">
            <div className="text-[10px] text-muted-foreground mb-1">Charge de Base (06:00)</div>
            <div className="text-sm font-bold text-foreground">
              {fmtN(Math.round(trend.intercept + 6 * trend.slope))}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              Transactions estimées à l&apos;ouverture
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Modèle de Score de Risque Canal"
        icon={<AlertTriangle className="w-4 h-4" />}
        badge={
          criticalCanals.length > 0 ? `${criticalCanals.length} critique(s)` : "Tout est normal"
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-3">
              Composantes du Score de Risque
            </div>
            <div className="space-y-2">
              {riskScores
                .sort((a, b) => b.risk - a.risk)
                .map((c) => {
                  const cfg = CANAL_CONFIG[c.key];
                  const Icon = cfg.icon;
                  return (
                    <div key={c.key} className="flex items-center gap-3">
                      <Icon className={cn("w-3.5 h-3.5 flex-none", cfg.color)} />
                      <span className="text-xs text-muted-foreground w-28 truncate flex-none">
                        {cfg.shortLabel}
                      </span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${c.risk}%` }}
                          transition={{ duration: 0.7, ease: "easeOut" }}
                          className={cn(
                            "h-full rounded-full",
                            c.risk >= 40
                              ? "bg-red-500"
                              : c.risk >= 20
                                ? "bg-amber-500"
                                : "bg-emerald-500",
                          )}
                        />
                      </div>
                      <span
                        className={cn(
                          "text-xs font-bold w-8 text-right tabular-nums flex-none",
                          c.risk >= 40
                            ? "text-red-600 dark:text-red-400"
                            : c.risk >= 20
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-emerald-600 dark:text-emerald-400",
                        )}
                      >
                        {c.risk}
                      </span>
                    </div>
                  );
                })}
            </div>
            <div className="mt-4 space-y-1 text-[10px] text-muted-foreground">
              <div>
                Score = Pénalité d&apos;échec (×0.5) + Pénalité de remboursement (×2) + Pénalité
                d&apos;instance (×1.5) + Pénalité de concentration
              </div>
              <div className="flex gap-4 mt-1">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> 0–19 Faible
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> 20–39 Moyen
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> 40+ Élevé
                </span>
              </div>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-3">
              Comparaison des Scores de Risque
            </div>
            <RiskScoreChart canals={canals} />
          </div>
        </div>
      </Section>

      {canals.length >= 2 && (
        <Section
          title="Benchmarking de Performance Canal"
          icon={<BarChart2 className="w-4 h-4" />}
          collapsible
          defaultOpen={false}
        >
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  {[
                    "Canal",
                    "Risque",
                    "Taux de Réussite",
                    "vs Moyenne",
                    "Échec %",
                    "Annulation %",
                    "Part",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wide text-muted-foreground font-semibold whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {riskScores
                  .sort((a, b) => b.risk - a.risk)
                  .map((c) => {
                    const cfg = CANAL_CONFIG[c.key];
                    const Icon = cfg.icon;
                    const avgRate = kpi.successRate;
                    const delta = c.successRate - avgRate;
                    return (
                      <tr
                        key={c.key}
                        className="border-b border-border hover:bg-muted/40 transition-colors"
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <Icon className={cn("w-3.5 h-3.5 flex-none", cfg.color)} />
                            <span className="text-foreground font-medium whitespace-nowrap">
                              {cfg.shortLabel}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              "font-bold tabular-nums",
                              c.risk >= 40
                                ? "text-red-600 dark:text-red-400"
                                : c.risk >= 20
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-emerald-600 dark:text-emerald-400",
                            )}
                          >
                            {c.risk}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              "font-semibold tabular-nums",
                              c.successRate >= 95
                                ? "text-emerald-600 dark:text-emerald-400"
                                : c.successRate >= 80
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-red-600 dark:text-red-400",
                            )}
                          >
                            {fmtPct(c.successRate)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              "text-[11px] font-semibold tabular-nums",
                              delta >= 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-red-600 dark:text-red-400",
                            )}
                          >
                            {delta >= 0 ? "+" : ""}
                            {delta.toFixed(1)}pp
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-red-600 dark:text-red-400 tabular-nums">
                          {fmtPct(c.total > 0 ? (c.declined / c.total) * 100 : 0)}
                        </td>
                        <td className="px-3 py-2.5 text-violet-600 dark:text-violet-400 tabular-nums">
                          {fmtPct(c.total > 0 ? (c.refund / c.total) * 100 : 0)}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                          {fmtPct(c.share)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}
