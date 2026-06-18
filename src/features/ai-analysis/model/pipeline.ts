// ─── Analysis pipeline (pure, transport-agnostic) ─────────────────────────────
//
// This module owns the WHOLE analysis pipeline as a single pure async function.
// It depends only on a `query` callback (a read-only DuckDB channel), the seeded
// platform analysis kernels (injected as `kernels`), and the stats helpers — no
// React, no DOM — so it can run inline on the renderer or be hosted behind a
// Comlink worker without change.
//
// Design vs. the legacy inline pipeline:
//   - Statistics are pushed DOWN into DuckDB (one multi-arm aggregate query),
//     not pulled UP into JS arrays. No `LIMIT 2000/3000` materialisation.
//   - Correlations use native `corr()` (one query), fixing the misaligned-pairs
//     bug and the first-N-rows sampling bias.
//   - Anomalies layer IQR fences (from SQL quantiles) WITH a real Generalized ESD
//     (S-H-ESD) test from the seeded platform analysis worker on a reservoir
//     sample — never a hand-rolled main-thread z>3 rule.
//   - Forecasting prefers a seasonal Holt-Winters model (seeded platform kernel)
//     over a flat OLS line, falling back to OLS only when there are too few
//     periods to fit it.
//   - "Patterns" is REAL seeded k-means over a standardised, reservoir-sampled
//     per-row feature matrix — not a GROUP BY relabelled as clustering, and not
//     the legacy web-llm-coupled insights.ts kMeans.

import {
  buildCategoricalStatsSQL,
  buildClusterSampleSQL,
  buildCorrelationSQL,
  buildHistogramSQL,
  buildIndexSeriesSQL,
  buildNumericStatsSQL,
  buildOutlierCountSQL,
  buildOutlierSampleSQL,
  buildSeriesSQL,
  buildTopValuesSQL,
} from "./sql";
import { correlationStrength, linearRegression } from "./stats";
import type {
  Anomaly,
  ClusterGroup,
  ColStat,
  Correlation,
  ForecastPoint,
} from "./types";

// ─── Seeded analysis kernels (injected from the platform analysis worker) ─────
//
// The pipeline runs inside its own Comlink worker; rather than spawning a NESTED
// worker, the caller injects these as Comlink-proxied callbacks that forward to
// the shared `getAnalysisProxy()` worker. All are seeded (default 42) so results
// are deterministic and reproducible across runs. When the platform worker is
// unavailable the caller supplies inline implementations (identical kernels).

export interface AnalysisKernels {
  /** Seeded k-means → cluster labels + de-normalisable centroids. */
  kMeans(
    data: number[][],
    options: { k: number; seed?: number },
  ): Promise<{ labels: number[]; centroids: number[][]; totalWithinss: number }>;
  /** Generalized ESD (S-H-ESD) anomaly indices + scores over a 1-D sample. */
  gesdAnomalies(
    values: number[],
    options: { maxAnomalies?: number; alpha?: number },
  ): Promise<{ indices: number[]; scores: number[] }>;
  /** Additive Holt-Winters forecast (fitted + horizon). */
  holtWinters(
    values: number[],
    options: { period?: number; horizon?: number },
  ): Promise<{ fitted: number[]; forecast: number[] }>;
}

export interface AnalysisInput {
  tableName: string;
  numericCols: string[];
  catCols: string[];
  dateCols: string[];
  /** Total rows in the table (for missing-rate context). */
  rowCount: number;
  /** Reservoir sample size for the few JS-side steps (clustering). */
  sampleSize: number;
  /** Number of histogram bins per numeric column. */
  histogramBins: number;
}

export interface AnalysisStage {
  progress: number;
  stage: string;
}

export type ProgressFn = (stage: AnalysisStage) => void;

export type QueryFn = (sql: string) => Promise<Record<string, unknown>[]>;

export interface AnalysisResult {
  colStats: ColStat[];
  anomalies: Anomaly[];
  correlations: Correlation[];
  forecasts: ForecastPoint[];
  clusters: ClusterGroup[];
  /** The metric/date columns the forecast was built from (for UI copy). */
  forecastMeta: { metricCol: string | null; dateCol: string | null; method: string };
}

const CLUSTER_COLORS = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#a855f7",
];

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function maybeNum(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// ─── Column statistics (single-pass pushdown) ────────────────────────────────

async function computeColumnStats(
  input: AnalysisInput,
  query: QueryFn,
): Promise<ColStat[]> {
  const out: ColStat[] = [];

  if (input.numericCols.length > 0) {
    const rows = await query(buildNumericStatsSQL(input.tableName, input.numericCols));
    const byCol = new Map<string, Record<string, unknown>>();
    for (const r of rows) byCol.set(String(r.col), r);

    // Histograms: one width_bucket query per column, but no raw-value JS pull.
    for (const col of input.numericCols) {
      const r = byCol.get(col);
      if (!r) continue;
      const total = num(r.total);
      const nonNull = num(r.non_null);
      const min = maybeNum(r.min_val);
      const max = maybeNum(r.max_val);

      let histogram: number[] | undefined;
      if (min !== undefined && max !== undefined && max > min) {
        const bins = input.histogramBins;
        const histRows = await query(
          buildHistogramSQL(input.tableName, col, min, max, bins),
        );
        const dense = new Array<number>(bins).fill(0);
        for (const hr of histRows) {
          const bin = num(hr.bin); // 1..bins
          if (bin >= 1 && bin <= bins) dense[bin - 1] = num(hr.c);
        }
        histogram = dense;
      }

      out.push({
        name: col,
        type: "numeric",
        min,
        max,
        avg: maybeNum(r.avg_val),
        stddev: maybeNum(r.std_val),
        median: maybeNum(r.median_val),
        q1: maybeNum(r.q1),
        q3: maybeNum(r.q3),
        p01: maybeNum(r.p01),
        p99: maybeNum(r.p99),
        nullCount: total - nonNull,
        distinctCount: num(r.distinct_count),
        rowCount: total,
        histogram,
        skewness: maybeNum(r.skew),
        kurtosis: maybeNum(r.kurt),
      });
    }
  }

  if (input.catCols.length > 0) {
    const rows = await query(buildCategoricalStatsSQL(input.tableName, input.catCols));
    const byCol = new Map<string, Record<string, unknown>>();
    for (const r of rows) byCol.set(String(r.col), r);

    for (const col of input.catCols) {
      const r = byCol.get(col);
      if (!r) continue;
      const total = num(r.total);
      const nonNull = num(r.non_null);
      const distinct = num(r.distinct_count);

      // Only fetch top-N for columns of sane cardinality.
      let topValues: { value: string; count: number }[] | undefined;
      if (distinct > 0 && distinct <= 10_000) {
        const topRows = await query(buildTopValuesSQL(input.tableName, col, 10));
        topValues = topRows.map((tr) => ({
          value: String(tr.val ?? ""),
          count: num(tr.cnt),
        }));
      }

      out.push({
        name: col,
        type: "categorical",
        nullCount: total - nonNull,
        distinctCount: distinct,
        rowCount: total,
        topValues,
      });
    }
  }

  return out;
}

// ─── Anomalies (IQR fences + seeded GESD over pushed-down moments) ────────────

async function detectAnomalies(
  input: AnalysisInput,
  numericStats: ColStat[],
  query: QueryFn,
  kernels: AnalysisKernels,
): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = [];

  for (const stat of numericStats) {
    const avg = stat.avg ?? 0;
    const std = stat.stddev ?? 0;
    const q1 = stat.q1;
    const q3 = stat.q3;

    // Reservoir-sampled values for this column drive the rigorous GESD test.
    // One representative sample per numeric column (NOT the whole column).
    const colSample = await query(
      buildIndexSeriesSQL(input.tableName, stat.name, Math.min(input.sampleSize, 4000)),
    ).catch(() => [] as Record<string, unknown>[]);
    const sampleValues = colSample.map((r) => num(r.y)).filter((v) => Number.isFinite(v));

    // Generalized ESD (S-H-ESD) — real t-distribution critical values, seeded.
    if (sampleValues.length >= 10) {
      const gesd = await kernels
        .gesdAnomalies(sampleValues, {
          alpha: 0.05,
          maxAnomalies: Math.max(1, Math.floor(sampleValues.length * 0.05)),
        })
        .catch(() => ({ indices: [] as number[], scores: [] as number[] }));
      if (gesd.indices.length > 0) {
        const sampleRate = gesd.indices.length / sampleValues.length;
        // Project the sample anomaly rate onto the full column for an estimate.
        const estimatedRows = Math.round(sampleRate * (stat.rowCount || sampleValues.length));
        const flagged = gesd.indices
          .map((i) => sampleValues[i])
          .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
        const maxScore = gesd.scores.length > 0 ? Math.max(...gesd.scores) : 0;
        anomalies.push({
          id: `gesd_${stat.name}`,
          column: stat.name,
          type: "outlier",
          method: "Generalized ESD (S-H-ESD)",
          description: `${gesd.indices.length} extreme value${gesd.indices.length > 1 ? "s" : ""} in a reservoir sample (${(sampleRate * 100).toFixed(1)}%, ≈${estimatedRows.toLocaleString()} rows) exceed the Student-t critical value λ at α=0.05 — Rosner's Generalized ESD test.`,
          severity: sampleRate > 0.05 ? "critical" : sampleRate > 0.01 ? "warning" : "info",
          affectedRows: estimatedRows,
          score: Math.min(1, maxScore / 6),
          values: flagged.slice(0, 5),
        });
      }
    }

    // IQR fences (robust, distribution-free) — computed from SQL quantiles.
    if (q1 !== undefined && q3 !== undefined && q3 > q1) {
      const iqr = q3 - q1;
      const lowerFence = q1 - 1.5 * iqr;
      const upperFence = q3 + 1.5 * iqr;

      // Sample the worst outliers (bounded) for display — no full-column pull.
      const sampleRows = await query(
        buildOutlierSampleSQL(input.tableName, stat.name, lowerFence, upperFence, 12),
      );
      const values = sampleRows.map((r) => num(r.v));

      // Exact count of fenced rows via a cheap aggregate.
      const countRows = await query(
        buildOutlierCountSQL(input.tableName, stat.name, lowerFence, upperFence),
      ).catch(() => [] as Record<string, unknown>[]);
      const outlierCount = num(countRows[0]?.c);

      if (outlierCount > 0) {
        const rate = stat.rowCount > 0 ? outlierCount / stat.rowCount : 0;
        // Calibrated score: blend of prevalence and how far the worst sample is
        // beyond the fence (in IQR units), squashed to [0,1].
        const maxDev =
          values.length > 0
            ? Math.max(
                ...values.map((v) =>
                  v < lowerFence
                    ? (lowerFence - v) / iqr
                    : v > upperFence
                      ? (v - upperFence) / iqr
                      : 0,
                ),
              )
            : 0;
        const score = Math.min(1, 0.5 * Math.min(1, rate * 20) + 0.5 * Math.min(1, maxDev / 5));
        anomalies.push({
          id: `iqr_${stat.name}`,
          column: stat.name,
          type: "outlier",
          method: "IQR (Tukey fence)",
          description: `${outlierCount.toLocaleString()} IQR outliers (${(rate * 100).toFixed(1)}% of rows) fall outside [${lowerFence.toFixed(2)}, ${upperFence.toFixed(2)}] — Q1−1.5·IQR … Q3+1.5·IQR.`,
          severity: rate > 0.05 ? "critical" : rate > 0.01 ? "warning" : "info",
          affectedRows: outlierCount,
          score,
          values: values.slice(0, 5),
          threshold: upperFence,
        });
      }
    }

    // Distribution shift via skewness (SQL-computed moment).
    if (stat.skewness !== undefined && Math.abs(stat.skewness) > 2) {
      anomalies.push({
        id: `skew_${stat.name}`,
        column: stat.name,
        type: "distribution_shift",
        method: "Sample skewness (g1)",
        description: `"${stat.name}" is highly skewed (g1=${stat.skewness.toFixed(2)}). The distribution departs from normality${stat.kurtosis !== undefined ? `, excess kurtosis=${stat.kurtosis.toFixed(2)}` : ""}.`,
        severity: Math.abs(stat.skewness) > 5 ? "warning" : "info",
        affectedRows: 0,
        score: Math.min(Math.abs(stat.skewness) / 10, 1),
      });
    }

    // Missingness (already counted in SQL).
    if (stat.nullCount > 0 && stat.rowCount > 0) {
      const nullRate = stat.nullCount / stat.rowCount;
      anomalies.push({
        id: `null_${stat.name}`,
        column: stat.name,
        type: "missing",
        method: "Null-rate scan",
        description: `${stat.nullCount.toLocaleString()} null values (${(nullRate * 100).toFixed(1)}% missing) in "${stat.name}".`,
        severity: nullRate > 0.1 ? "critical" : nullRate > 0.05 ? "warning" : "info",
        affectedRows: stat.nullCount,
        score: nullRate,
      });
    }

    // Near-constant column (very low variance relative to mean).
    if (std === 0 && stat.distinctCount <= 1 && stat.rowCount > 1) {
      anomalies.push({
        id: `const_${stat.name}`,
        column: stat.name,
        type: "invalid",
        method: "Variance check",
        description: `"${stat.name}" is constant (single distinct value) across ${stat.rowCount.toLocaleString()} rows — likely carries no signal.`,
        severity: "info",
        affectedRows: stat.rowCount,
        score: 0.2,
      });
    } else if (avg !== 0 && std > 0 && std / Math.abs(avg) < 0.001) {
      anomalies.push({
        id: `lowvar_${stat.name}`,
        column: stat.name,
        type: "invalid",
        method: "Variance check",
        description: `"${stat.name}" has near-zero variance (σ/μ < 0.1%) — values are effectively uniform.`,
        severity: "info",
        affectedRows: 0,
        score: 0.15,
      });
    }
  }

  return anomalies.sort((a, b) => b.score - a.score);
}

// ─── Correlations (single native corr() query) ───────────────────────────────

async function computeCorrelations(
  input: AnalysisInput,
  query: QueryFn,
): Promise<Correlation[]> {
  if (input.numericCols.length < 2) return [];
  const sql = buildCorrelationSQL(input.tableName, input.numericCols);
  if (!sql) return [];
  const rows = await query(sql);
  const r0 = rows[0];
  if (!r0) return [];

  const out: Correlation[] = [];
  for (let i = 0; i < input.numericCols.length; i++) {
    for (let j = i + 1; j < input.numericCols.length; j++) {
      const raw = r0[`r_${i}_${j}`];
      const r = maybeNum(raw);
      if (r === undefined) continue; // null corr (constant column) → skip
      const strength = correlationStrength(r);
      if (strength === "none") continue;
      out.push({
        col1: input.numericCols[i],
        col2: input.numericCols[j],
        pearson: r,
        strength,
        direction: r > 0 ? "positive" : r < 0 ? "negative" : "none",
      });
    }
  }
  out.sort((a, b) => Math.abs(b.pearson) - Math.abs(a.pearson));
  return out;
}

// ─── Forecast (SQL aggregation → seasonal Holt-Winters, OLS fallback) ────────

const HORIZON = 6;

/**
 * Fit a forecast over an observed series. Prefers an additive Holt-Winters model
 * (seeded platform kernel — captures level, trend AND seasonality) when there are
 * enough periods; otherwise falls back to plain OLS extrapolation. The CI is a
 * residual-stddev band around the fitted/forecast values.
 */
async function fitSeries(
  ys: number[],
  labelFor: (i: number) => string,
  futureLabelFor: (k: number) => string,
  kernels: AnalysisKernels,
  seasonHint: number,
): Promise<{ points: ForecastPoint[]; method: string }> {
  const points: ForecastPoint[] = [];
  if (ys.length < 4) return { points, method: "none" };

  // Try seasonal Holt-Winters first (needs at least 2 full seasons).
  const period = seasonHint >= 2 && ys.length >= 2 * seasonHint ? seasonHint : 1;
  let fitted: number[] | null = null;
  let forecast: number[] | null = null;
  let method = "";

  if (period >= 2) {
    const hw = await kernels
      .holtWinters(ys, { period, horizon: HORIZON })
      .catch(() => null);
    if (hw && hw.fitted.length === ys.length) {
      fitted = hw.fitted;
      forecast = hw.forecast;
      method = `Holt-Winters (additive, seasonal period ${period})`;
    }
  }
  if (!fitted) {
    const hw = await kernels.holtWinters(ys, { period: 1, horizon: HORIZON }).catch(() => null);
    if (hw && hw.fitted.length === ys.length) {
      fitted = hw.fitted;
      forecast = hw.forecast;
      method = "Holt linear (double exponential smoothing)";
    }
  }
  if (!fitted || !forecast) {
    // Final fallback: OLS line (kernel unavailable).
    const xs = ys.map((_, i) => i);
    const reg = linearRegression(xs, ys);
    fitted = ys.map((_, i) => reg.slope * i + reg.intercept);
    forecast = Array.from({ length: HORIZON }, (_, k) => reg.slope * (ys.length + k) + reg.intercept);
    method = "OLS (linear extrapolation)";
  }

  const residuals = ys.map((y, i) => y - (fitted as number[])[i]);
  const sigma = residualStdDev(residuals);

  ys.forEach((v, i) => {
    const pred = (fitted as number[])[i];
    points.push({
      period: labelFor(i),
      actual: v,
      predicted: pred,
      lower: pred - 1.96 * sigma,
      upper: pred + 1.96 * sigma,
    });
  });
  forecast.forEach((pred, k) => {
    points.push({
      period: futureLabelFor(k + 1),
      predicted: pred,
      lower: pred - 1.96 * sigma,
      upper: pred + 1.96 * sigma,
    });
  });
  return { points, method };
}

async function computeForecast(
  input: AnalysisInput,
  query: QueryFn,
  kernels: AnalysisKernels,
): Promise<{ points: ForecastPoint[]; meta: AnalysisResult["forecastMeta"] }> {
  const metricCol = input.numericCols[0] ?? null;
  const dateCol = input.dateCols[0] ?? null;
  if (!metricCol) {
    return { points: [], meta: { metricCol: null, dateCol: null, method: "none" } };
  }

  if (dateCol) {
    const rows = await query(buildSeriesSQL(input.tableName, dateCol, metricCol, 120));
    if (rows.length >= 4) {
      const ys = rows.map((r) => num(r.avg_metric));
      const labels = rows.map((r) => String(r.period));

      // Step forward off the last YYYY-MM period label (12-month seasonality).
      const lastPeriod = labels[labels.length - 1];
      const [yStr, mStr] = lastPeriod.split("-");
      let yr = Number(yStr);
      let mo = Number(mStr);
      const futureLabel = () => {
        mo += 1;
        if (mo > 12) {
          mo = 1;
          yr += 1;
        }
        return `${yr}-${String(mo).padStart(2, "0")} (forecast)`;
      };

      const { points, method } = await fitSeries(
        ys,
        (i) => labels[i],
        () => futureLabel(),
        kernels,
        12,
      );
      return { points, meta: { metricCol, dateCol, method } };
    }
  }

  // No usable date column → reservoir-sampled index series as a time proxy.
  const rows = await query(buildIndexSeriesSQL(input.tableName, metricCol, 200));
  const ys = rows.map((r) => num(r.y));
  const { points, method } = await fitSeries(
    ys,
    (i) => `Row ${i + 1}`,
    (k) => `Row ${ys.length + k} (forecast)`,
    kernels,
    1,
  );
  return { points, meta: { metricCol, dateCol: null, method } };
}

function residualStdDev(residuals: number[]): number {
  if (residuals.length < 2) return 0;
  const m = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  const variance =
    residuals.reduce((a, b) => a + (b - m) ** 2, 0) / (residuals.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

// ─── Patterns: REAL k-means over a standardised feature matrix ───────────────

async function computeClusters(
  input: AnalysisInput,
  numericStats: ColStat[],
  query: QueryFn,
  kernels: AnalysisKernels,
): Promise<ClusterGroup[]> {
  const featureCols = input.numericCols.slice(0, 4);
  if (featureCols.length === 0) return [];

  const sampleRows = await query(
    buildClusterSampleSQL(input.tableName, featureCols, Math.min(input.sampleSize, 4000)),
  );
  if (sampleRows.length < 6) return [];

  // Standardise each feature (z-score) using the SQL-computed mean/stddev so
  // dimensions with large magnitudes don't dominate the Euclidean distance.
  const statByCol = new Map(numericStats.map((s) => [s.name, s]));
  const matrix: number[][] = sampleRows.map((row) =>
    featureCols.map((col) => {
      const s = statByCol.get(col);
      const mean = s?.avg ?? 0;
      const std = s?.stddev && s.stddev > 0 ? s.stddev : 1;
      return (num(row[col]) - mean) / std;
    }),
  );

  const k = Math.min(4, Math.max(2, Math.floor(Math.sqrt(matrix.length / 2))));
  // Seeded platform k-means (deterministic, default seed 42). Returns per-row
  // labels + centroids in standardised space + within-cluster SS.
  const result = await kernels.kMeans(matrix, { k, seed: 42 }).catch(() => null);
  if (!result || result.centroids.length === 0) return [];

  // Cluster sizes from the seeded labels.
  const sizes = new Array<number>(result.centroids.length).fill(0);
  for (const lbl of result.labels) {
    if (lbl >= 0 && lbl < sizes.length) sizes[lbl]++;
  }

  // Rank clusters by sample size (largest first) for stable display order.
  const order = result.centroids
    .map((_, i) => i)
    .sort((a, b) => sizes[b] - sizes[a]);

  return order.map((clusterIdx, displayIdx) => {
    // De-standardise the centroid back into original feature units for display.
    const centroid: Record<string, number> = {};
    const characteristics: string[] = [];
    featureCols.forEach((col, dim) => {
      const s = statByCol.get(col);
      const mean = s?.avg ?? 0;
      const std = s?.stddev && s.stddev > 0 ? s.stddev : 1;
      const z = result.centroids[clusterIdx]?.[dim] ?? 0;
      centroid[col] = z * std + mean;
      if (z > 0.5) characteristics.push(`High ${col}`);
      else if (z < -0.5) characteristics.push(`Low ${col}`);
    });
    return {
      id: displayIdx,
      label: `Segment ${displayIdx + 1}`,
      size: sizes[clusterIdx],
      centroid,
      characteristics: characteristics.length > 0 ? characteristics : ["Typical"],
      color: CLUSTER_COLORS[displayIdx % CLUSTER_COLORS.length],
    };
  });
}

// ─── Orchestration ───────────────────────────────────────────────────────────

export async function runAnalysisPipeline(
  input: AnalysisInput,
  query: QueryFn,
  kernels: AnalysisKernels,
  onStage: ProgressFn = () => {},
): Promise<AnalysisResult> {
  onStage({ progress: 12, stage: "Column statistics (single-pass SQL)" });
  const colStats = await computeColumnStats(input, query);
  const numericStats = colStats.filter((s) => s.type === "numeric");

  onStage({ progress: 38, stage: "Anomaly detection (GESD + IQR)" });
  const anomalies = await detectAnomalies(input, numericStats, query, kernels);

  onStage({ progress: 58, stage: "Correlations (native corr())" });
  const correlations = await computeCorrelations(input, query);

  onStage({ progress: 74, stage: "Forecast (Holt-Winters)" });
  const { points: forecasts, meta: forecastMeta } = await computeForecast(
    input,
    query,
    kernels,
  );

  onStage({ progress: 90, stage: "Pattern discovery (seeded k-means)" });
  const clusters = await computeClusters(input, numericStats, query, kernels);

  onStage({ progress: 100, stage: "Analysis complete" });
  return { colStats, anomalies, correlations, forecasts, clusters, forecastMeta };
}
