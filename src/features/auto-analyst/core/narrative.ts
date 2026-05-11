"use client";
/**
 * Deterministic narrative — turns analysis state into bullet points.
 */

import type {
  AnalystState,
  AnomalyHit,
  ColumnProfile,
  CorrelationCell,
  ForecastSeries,
  NarrativeBullet,
  StatTest,
} from "./types";

function genId(): string {
  return Math.random().toString(36).slice(2, 8);
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

export function generateNarrative(state: AnalystState): NarrativeBullet[] {
  const out: NarrativeBullet[] = [];
  const profiles = state.profile?.result ?? [];
  const quality = state.quality?.result;
  const stats = state.statistics?.result ?? [];
  const anomalies = state.anomalies?.result ?? [];
  const correlations = state.correlations?.result ?? [];
  const forecast = state.forecast?.result ?? [];

  // Headline: dataset shape
  if (profiles.length) {
    const totalRows = profiles[0]?.rowCount ?? 0;
    out.push({
      id: genId(),
      severity: "info",
      title: "Dataset overview",
      detail: `${profiles.length} columns × ${fmt(totalRows)} rows. ${profiles.filter((p) => p.semantic === "numeric").length} numeric, ${profiles.filter((p) => p.semantic === "categorical").length} categorical, ${profiles.filter((p) => p.semantic === "datetime").length} temporal.`,
    });
  }

  // Quality
  if (quality) {
    const tone =
      quality.score >= 80
        ? "success"
        : quality.score >= 60
          ? "info"
          : quality.score >= 40
            ? "warning"
            : "danger";
    out.push({
      id: genId(),
      severity: tone,
      title: `Data quality: ${quality.score}/100`,
      detail:
        quality.recommendations[0]?.detail ??
        `${quality.axes.map((a) => `${a.name} ${a.score}`).join(", ")}.`,
    });
  }

  // Strongest correlation
  const offDiag = correlations.filter((c) => c.a !== c.b);
  if (offDiag.length) {
    const strongest = [...offDiag].sort(
      (a, b) => Math.abs(b.r) - Math.abs(a.r),
    )[0];
    if (Math.abs(strongest.r) >= 0.3) {
      out.push({
        id: genId(),
        severity: Math.abs(strongest.r) >= 0.7 ? "warning" : "info",
        title: `Strong correlation: ${strongest.a} ↔ ${strongest.b}`,
        detail: `Pearson r = ${strongest.r.toFixed(2)} on n=${strongest.n}. ${strongest.r > 0 ? "Move together." : "Move opposite."}`,
      });
    }
  }

  // Most significant test
  const sig = stats.filter((s) => s.significant);
  if (sig.length) {
    const top = sig[0];
    out.push({
      id: genId(),
      severity: "accent",
      title: `${top.kind} on ${top.vars.join(" × ")} is significant`,
      detail: `p = ${top.pValue.toFixed(4)}, ${top.effectSizeName ?? ""} = ${top.effectSize?.toFixed(2) ?? "?"}, n = ${top.n}.${top.caveats[0] ? ` Caveat: ${top.caveats[0]}.` : ""}`,
    });
  }

  // Anomaly headline
  if (anomalies.length) {
    const grouped = anomalies.reduce<Record<string, AnomalyHit[]>>((acc, h) => {
      acc[h.column] ??= [];
      acc[h.column].push(h);
      return acc;
    }, {});
    const top = Object.entries(grouped).sort(
      (a, b) => b[1].length - a[1].length,
    )[0];
    if (top) {
      out.push({
        id: genId(),
        severity: "warning",
        title: `${top[1].length} anomalies in ${top[0]}`,
        detail: `Largest |z| = ${Math.abs(top[1][0].zScore).toFixed(1)}. Investigate row IDs ${top[1]
          .slice(0, 3)
          .map((h) => h.rowId)
          .join(", ")}.`,
      });
    }
  }

  // Forecast
  if (forecast.length) {
    const f = forecast[0];
    const lastY = f.history[f.history.length - 1]?.y ?? 0;
    const nextY = f.forecast[f.forecast.length - 1]?.yhat ?? lastY;
    const pct = lastY === 0 ? 0 : ((nextY - lastY) / Math.abs(lastY)) * 100;
    out.push({
      id: genId(),
      severity: pct >= 5 ? "success" : pct <= -5 ? "danger" : "info",
      title: `${f.column} forecast: ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% over next ${f.forecast.length} periods`,
      detail: `From ${fmt(lastY)} → ${fmt(nextY)} (linear projection, 95% band ${fmt(f.forecast[f.forecast.length - 1]?.yLow95 ?? 0)}–${fmt(f.forecast[f.forecast.length - 1]?.yHigh95 ?? 0)}).`,
    });
  }

  // Sparse-data caveats
  const highNull = profiles.filter((p) => p.nullRate > 0.2);
  if (highNull.length) {
    out.push({
      id: genId(),
      severity: "warning",
      title: `${highNull.length} columns have >20% nulls`,
      detail: highNull
        .slice(0, 4)
        .map((p) => `${p.name} (${(p.nullRate * 100).toFixed(0)}%)`)
        .join(", "),
    });
  }

  return out;
}

// Utility re-exports for tests / other callers
export type {
  AnomalyHit,
  ColumnProfile,
  CorrelationCell,
  ForecastSeries,
  StatTest,
};
