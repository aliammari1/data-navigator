/**
 * ML Web Worker — TF.js operations off main thread via Comlink.
 *
 * Exports:
 * - kMeansClustering
 * - detectAnomalies
 * - computeCorrelationMatrix
 * - forecastTimeSeries
 * - computePCA
 */

import * as tf from "@tensorflow/tfjs";
import * as Comlink from "comlink";

const EPSILON = 1e-12;

let tfReadyPromise: Promise<void> | null = null;

async function ensureTfReady(): Promise<void> {
  tfReadyPromise ??= tf.ready();
  await tfReadyPromise;
}

function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
}

function assertFiniteVector(values: number[], label: string): void {
  if (!Array.isArray(values)) {
    throw new Error(`${label} must be an array`);
  }

  for (let i = 0; i < values.length; i++) {
    assertFiniteNumber(values[i], `${label}[${i}]`);
  }
}

function validateMatrix(
  data: number[][],
  options: {
    label: string;
    minRows?: number;
    minCols?: number;
  },
): { nRows: number; nCols: number } {
  const { label, minRows = 1, minCols = 1 } = options;

  if (!Array.isArray(data)) {
    throw new Error(`${label} must be a 2D array`);
  }

  const nRows = data.length;

  if (nRows < minRows) {
    throw new Error(`${label} must contain at least ${minRows} row(s)`);
  }

  const nCols = data[0]?.length ?? 0;

  if (nCols < minCols) {
    throw new Error(`${label} must contain at least ${minCols} column(s)`);
  }

  for (let rowIndex = 0; rowIndex < nRows; rowIndex++) {
    const row = data[rowIndex];

    if (!Array.isArray(row)) {
      throw new Error(`${label}[${rowIndex}] must be an array`);
    }

    if (row.length !== nCols) {
      throw new Error(
        `${label} must be rectangular; row 0 has ${nCols} columns but row ${rowIndex} has ${row.length}`,
      );
    }

    for (let colIndex = 0; colIndex < nCols; colIndex++) {
      assertFiniteNumber(row[colIndex], `${label}[${rowIndex}][${colIndex}]`);
    }
  }

  return { nRows, nCols };
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
}

function resolvedColumnNames(columns: string[], nCols: number): string[] {
  return Array.from({ length: nCols }, (_, index) => columns[index] ?? `column_${index + 1}`);
}

// ─── K-Means clustering ───────────────────────────────────────────────────────

export async function kMeansClustering(
  data: number[][],
  k: number,
  iters = 50,
): Promise<{ labels: number[]; centroids: number[][] }> {
  await ensureTfReady();

  const { nRows, nCols } = validateMatrix(data, {
    label: "data",
    minRows: 1,
    minCols: 1,
  });

  assertPositiveInteger(k, "k");
  assertPositiveInteger(iters, "iters");

  if (k > nRows) {
    throw new Error(`k cannot be greater than row count; received k=${k}, rows=${nRows}`);
  }

  const tensor = tf.tensor2d(data, [nRows, nCols], "float32");

  const initialIndices = Array.from({ length: k }, (_, index) => Math.floor((index * nRows) / k));

  let centroids = tf.tidy(() => tf.gather(tensor, initialIndices)) as tf.Tensor2D;
  let labels = new Int32Array(nRows).fill(-1);

  try {
    for (let iter = 0; iter < iters; iter++) {
      const newLabels = tf.tidy(() => {
        const distances = tensor.expandDims(1).sub(centroids.expandDims(0)).square().sum(2);

        return Array.from(distances.argMin(1).dataSync());
      });

      const sameLabels = newLabels.every((label, index) => label === labels[index]);
      labels = Int32Array.from(newLabels);

      if (sameLabels && iter > 0) break;

      const previousCentroids = centroids.arraySync() as number[][];
      const nextCentroids: number[][] = [];

      for (let clusterIndex = 0; clusterIndex < k; clusterIndex++) {
        const centroid = Array(nCols).fill(0);
        let count = 0;

        for (let rowIndex = 0; rowIndex < nRows; rowIndex++) {
          if (newLabels[rowIndex] !== clusterIndex) continue;

          count++;

          for (let colIndex = 0; colIndex < nCols; colIndex++) {
            centroid[colIndex] += data[rowIndex][colIndex];
          }
        }

        if (count === 0) {
          nextCentroids.push(previousCentroids[clusterIndex]);
        } else {
          nextCentroids.push(centroid.map((value) => value / count));
        }
      }

      const nextCentroidsTensor = tf.tensor2d(nextCentroids, [k, nCols], "float32");

      centroids.dispose();
      centroids = nextCentroidsTensor;
    }

    const centroidsArray = centroids.arraySync() as number[][];

    return {
      labels: Array.from(labels),
      centroids: centroidsArray,
    };
  } finally {
    tensor.dispose();
    centroids.dispose();
  }
}

// ─── Anomaly detection ────────────────────────────────────────────────────────

export async function detectAnomalies(
  values: number[],
  method: "iqr" | "zscore" = "iqr",
  threshold = 1.5,
): Promise<{ indices: number[]; scores: number[] }> {
  assertFiniteVector(values, "values");
  assertFiniteNumber(threshold, "threshold");

  if (threshold <= 0) {
    throw new Error("threshold must be greater than 0");
  }

  const n = values.length;

  if (n < 4) {
    return { indices: [], scores: [] };
  }

  const sorted = [...values].sort((a, b) => a - b);

  const q1 = sorted[Math.floor((n - 1) * 0.25)];
  const q3 = sorted[Math.floor((n - 1) * 0.75)];
  const iqr = q3 - q1;

  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);

  const indices: number[] = [];
  const scores: number[] = [];

  for (let index = 0; index < n; index++) {
    const value = values[index];

    if (method === "iqr") {
      if (Math.abs(iqr) < EPSILON) continue;

      const lower = q1 - threshold * iqr;
      const upper = q3 + threshold * iqr;

      if (value < lower || value > upper) {
        const score = Math.max(lower - value, value - upper) / iqr;
        indices.push(index);
        scores.push(Math.round(score * 1000) / 1000);
      }
    } else {
      if (std < EPSILON) continue;

      const score = Math.abs((value - mean) / std);

      if (score > threshold) {
        indices.push(index);
        scores.push(Math.round(score * 1000) / 1000);
      }
    }
  }

  return { indices, scores };
}

// ─── Correlation matrix ───────────────────────────────────────────────────────

export async function computeCorrelationMatrix(
  data: number[][],
  columns: string[],
): Promise<{ matrix: number[][]; columns: string[] }> {
  await ensureTfReady();

  if (data.length === 0) {
    return { matrix: [], columns: [] };
  }

  const { nRows, nCols } = validateMatrix(data, {
    label: "data",
    minRows: 1,
    minCols: 1,
  });

  const outputColumns = resolvedColumnNames(columns, nCols);

  if (nRows < 2) {
    return {
      matrix: Array.from({ length: nCols }, (_, i) =>
        Array.from({ length: nCols }, (_, j) => (i === j ? 1 : 0)),
      ),
      columns: outputColumns,
    };
  }

  const tensor = tf.tensor2d(data, [nRows, nCols], "float32");
  const mean = tensor.mean(0);
  const centered = tensor.sub(mean);
  const covariance = centered
    .transpose()
    .matMul(centered)
    .div(nRows - 1);

  try {
    const covarianceMatrix = covariance.arraySync() as number[][];
    const stds = covarianceMatrix.map((row, index) => Math.sqrt(Math.max(0, row[index] ?? 0)));

    const matrix = covarianceMatrix.map((row, i) =>
      row.map((cov, j) => {
        if (i === j) return 1;

        const denominator = stds[i] * stds[j];

        if (denominator < EPSILON) return 0;

        const correlation = cov / denominator;

        return Math.round(correlation * 1000) / 1000;
      }),
    );

    return {
      matrix,
      columns: outputColumns,
    };
  } finally {
    tensor.dispose();
    mean.dispose();
    centered.dispose();
    covariance.dispose();
  }
}

// ─── Time series forecast ─────────────────────────────────────────────────────

export async function forecastTimeSeries(
  values: number[],
  horizon = 5,
  alpha = 0.3,
): Promise<{ forecast: number[]; smoothed: number[] }> {
  assertFiniteVector(values, "values");
  assertPositiveInteger(horizon, "horizon");
  assertFiniteNumber(alpha, "alpha");

  if (alpha <= 0 || alpha > 1) {
    throw new Error("alpha must be in the range (0, 1]");
  }

  const n = values.length;

  if (n === 0) {
    return { forecast: [], smoothed: [] };
  }

  const smoothed = new Array<number>(n);
  smoothed[0] = values[0];

  for (let index = 1; index < n; index++) {
    smoothed[index] = alpha * values[index] + (1 - alpha) * smoothed[index - 1];
  }

  const last = smoothed[n - 1];
  const trend = n > 1 ? (smoothed[n - 1] - smoothed[0]) / (n - 1) : 0;

  const forecast = Array.from({ length: horizon }, (_, index) => {
    const value = last + trend * (index + 1);
    return Math.round(Math.max(0, value) * 1000) / 1000;
  });

  return {
    forecast,
    smoothed: smoothed.map((value) => Math.round(value * 1000) / 1000),
  };
}

// ─── PCA, 2 components ────────────────────────────────────────────────────────

export async function computePCA(
  data: number[][],
): Promise<{ components: number[][]; explained: number[] }> {
  await ensureTfReady();

  if (data.length === 0) {
    return { components: [], explained: [] };
  }

  const { nRows, nCols } = validateMatrix(data, {
    label: "data",
    minRows: 1,
    minCols: 1,
  });

  if (nRows < 3 || nCols < 2) {
    return {
      components: data.map((row) => [row[0] ?? 0, row[1] ?? 0]),
      explained: [1, 0],
    };
  }

  const tensor = tf.tensor2d(data, [nRows, nCols], "float32");
  const mean = tensor.mean(0);
  const centered = tensor.sub(mean);
  const covariance = centered
    .transpose()
    .matMul(centered)
    .div(nRows - 1);

  try {
    const covarianceMatrix = covariance.arraySync() as number[][];

    function powerIteration(matrix: number[][], iters = 50): number[] {
      const size = matrix.length;
      let vector = Array(size).fill(0);
      vector[0] = 1;

      for (let iter = 0; iter < iters; iter++) {
        const multiplied = matrix.map((row) =>
          row.reduce((sum, value, index) => sum + value * vector[index], 0),
        );

        const norm = Math.sqrt(multiplied.reduce((sum, value) => sum + value * value, 0));

        if (norm < EPSILON) {
          return Array(size).fill(0);
        }

        vector = multiplied.map((value) => value / norm);
      }

      return vector;
    }

    function eigenValue(matrix: number[][], vector: number[]): number {
      return vector.reduce((sum, value, i) => {
        const rowProjection = matrix[i].reduce(
          (innerSum, matrixValue, j) => innerSum + matrixValue * vector[j],
          0,
        );

        return sum + value * rowProjection;
      }, 0);
    }

    const pc1 = powerIteration(covarianceMatrix);
    const lambda1 = Math.max(0, eigenValue(covarianceMatrix, pc1));

    const deflated = covarianceMatrix.map((row, i) =>
      row.map((value, j) => value - lambda1 * pc1[i] * pc1[j]),
    );

    const pc2 = powerIteration(deflated);
    const lambda2 = Math.max(0, eigenValue(deflated, pc2));

    const centeredRows = centered.arraySync() as number[][];

    const components = centeredRows.map((row) => [
      row.reduce((sum, value, index) => sum + value * pc1[index], 0),
      row.reduce((sum, value, index) => sum + value * pc2[index], 0),
    ]);

    const totalVariance = covarianceMatrix.reduce(
      (sum, row, index) => sum + Math.max(0, row[index] ?? 0),
      0,
    );

    const explained =
      totalVariance > EPSILON
        ? [
            Math.round((lambda1 / totalVariance) * 1000) / 1000,
            Math.round((lambda2 / totalVariance) * 1000) / 1000,
          ]
        : [0, 0];

    return {
      components: components.map(([x, y]) => [
        Math.round(x * 1000) / 1000,
        Math.round(y * 1000) / 1000,
      ]),
      explained,
    };
  } finally {
    tensor.dispose();
    mean.dispose();
    centered.dispose();
    covariance.dispose();
  }
}

// ─── ONNX forecast (off-main-thread) ─────────────────────────────────────────
// Handles typed postMessage envelopes for forecastNextHours so the main thread
// doesn't block on ONNX session init or linear-regression computation.

import {
  type HourlyRow as ForecastHourlyRow,
  type ForecastPoint,
  forecastNextHours,
} from "@/platform/browser/forecast-onnx";

export interface MLForecastRequest {
  id: string;
  type: "FORECAST";
  payload: { hourly: ForecastHourlyRow[]; horizon?: number };
}

export interface MLForecastResponse {
  id: string;
  type: "FORECAST_RESULT";
  result?: ForecastPoint[];
  error?: string;
}

self.addEventListener("message", async (e: MessageEvent) => {
  if (e.data?.type !== "FORECAST") return;
  const req = e.data as MLForecastRequest;
  try {
    const result = await forecastNextHours(req.payload.hourly, req.payload.horizon ?? 4);
    const response: MLForecastResponse = {
      id: req.id,
      type: "FORECAST_RESULT",
      result,
    };
    self.postMessage(response);
  } catch (err) {
    const response: MLForecastResponse = {
      id: req.id,
      type: "FORECAST_RESULT",
      error: String(err),
    };
    self.postMessage(response);
  }
});

// ─── Comlink exposure ─────────────────────────────────────────────────────────

Comlink.expose({
  kMeansClustering,
  detectAnomalies,
  computeCorrelationMatrix,
  forecastTimeSeries,
  computePCA,
});
