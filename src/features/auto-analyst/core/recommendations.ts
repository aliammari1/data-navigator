"use client";
/**
 * Action items derived from the rest of the analysis state.
 */

import type { AnalystState, Recommendation } from "./types";

function genId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function generateRecommendations(state: AnalystState): Recommendation[] {
  const out: Recommendation[] = [];
  const profiles = state.profile?.result ?? [];
  const quality = state.quality?.result;
  const stats = state.statistics?.result ?? [];
  const anomalies = state.anomalies?.result ?? [];
  const forecast = state.forecast?.result ?? [];
  const correlations = state.correlations?.result ?? [];

  // Quality recommendations
  if (quality) {
    for (const r of quality.recommendations.slice(0, 3)) {
      out.push({
        id: genId(),
        severity: r.severity,
        action: r.title,
        why: r.detail,
        evidence: r.fix,
      });
    }
  }

  // Anomalies → investigate
  const anomalyCols = [...new Set(anomalies.map((a) => a.column))];
  if (anomalyCols.length) {
    out.push({
      id: genId(),
      severity: anomalies.length > 50 ? "danger" : "warning",
      action: `Investigate ${anomalies.length} anomalies in ${anomalyCols.length} columns`,
      why: `Top affected: ${anomalyCols.slice(0, 3).join(", ")}.`,
      evidence: `Largest |z| = ${Math.abs(anomalies[0]?.zScore ?? 0).toFixed(1)} on ${anomalies[0]?.column}.`,
    });
  }

  // Significant test → cite the finding
  const sig = stats.find((s) => s.significant);
  if (sig) {
    out.push({
      id: genId(),
      severity: "info",
      action: `Communicate finding: ${sig.vars.join(" × ")}`,
      why: `${sig.kind} significant at p=${sig.pValue.toFixed(3)}, ${sig.effectSizeName} = ${sig.effectSize?.toFixed(2)}.`,
      evidence: sig.caveats[0],
    });
  }

  // Forecast trending down
  for (const f of forecast.slice(0, 1)) {
    const lastY = f.history[f.history.length - 1]?.y ?? 0;
    const nextY = f.forecast[f.forecast.length - 1]?.yhat ?? lastY;
    if (lastY > 0 && (nextY - lastY) / lastY < -0.05) {
      out.push({
        id: genId(),
        severity: "danger",
        action: `Set up alert on ${f.column}`,
        why: `Forecast projects ${(((nextY - lastY) / lastY) * 100).toFixed(1)}% decline over horizon.`,
      });
    } else if (lastY > 0 && (nextY - lastY) / lastY > 0.1) {
      out.push({
        id: genId(),
        severity: "info",
        action: `Plan for ${f.column} growth`,
        why: `Forecast projects ${(((nextY - lastY) / lastY) * 100).toFixed(1)}% lift.`,
      });
    }
  }

  // High-correlation pair → drop redundant feature
  const offDiag = correlations.filter((c) => c.a !== c.b);
  const tooHigh = offDiag.find((c) => Math.abs(c.r) >= 0.95);
  if (tooHigh) {
    out.push({
      id: genId(),
      severity: "info",
      action: `Consider dropping one of ${tooHigh.a} / ${tooHigh.b}`,
      why: `Pearson r = ${tooHigh.r.toFixed(2)} — they're effectively the same signal.`,
    });
  }

  // Profile sparsity → cleanup
  const sparse = profiles.find((p) => p.nullRate > 0.4);
  if (sparse) {
    out.push({
      id: genId(),
      severity: "warning",
      action: `Decide what to do about ${sparse.name}`,
      why: `${(sparse.nullRate * 100).toFixed(0)}% of values are NULL — impute, drop, or flag missingness.`,
    });
  }

  return out;
}
