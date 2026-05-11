/**
 * Browser-side ML engine powered by @tensorflow/tfjs.
 * Provides anomaly detection (autoencoder), time-series forecasting,
 * and enhanced clustering — all running locally in WASM/WebGL.
 */

import type { ColMeta } from "@/core/stores/data-store";
import { getTF } from "@/platform/ai/tf-runtime";

// ─── Data normalisation ───────────────────────────────────────────────────────

function normalise(values: number[]): {
  norm: number[];
  min: number;
  max: number;
} {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return { norm: values.map((v) => (v - min) / range), min, max };
}

function denormalise(value: number, min: number, max: number): number {
  return value * (max - min) + min;
}

// ─── Autoencoder anomaly detection ────────────────────────────────────────────

export interface AnomalyResult {
  index: number;
  reconstructionError: number;
  isAnomaly: boolean;
  value: number;
}

/**
 * Train a simple autoencoder on numeric data and flag rows with high
 * reconstruction error as anomalies.
 * @param data 2D array [rows][features] of numeric values
 * @param threshold Percentile threshold for anomaly (default: 95)
 */
export async function detectAnomaliesAutoencoder(
  data: number[][],
  threshold = 95,
): Promise<AnomalyResult[]> {
  if (data.length < 20 || data[0].length < 1) return [];

  const tfjs = await getTF();
  const featureCount = data[0].length;

  // Normalise each feature
  const stats = Array.from({ length: featureCount }, (_, j) => {
    const col = data.map((r) => r[j]);
    return normalise(col);
  });
  const normalised = data.map((row) =>
    row.map((v, j) => (v - stats[j].min) / (stats[j].max - stats[j].min || 1)),
  );

  // Build autoencoder: input → compress → decompress → input
  const encodingDim = Math.max(1, Math.floor(featureCount / 2));

  const model = tfjs.sequential();
  model.add(
    tfjs.layers.dense({
      inputShape: [featureCount],
      units: encodingDim,
      activation: "relu",
    }),
  );
  model.add(
    tfjs.layers.dense({
      units: featureCount,
      activation: "sigmoid",
    }),
  );

  model.compile({ optimizer: "adam", loss: "meanSquaredError" });

  const xs = tfjs.tensor2d(normalised);

  // Train (quick — 50 epochs for browser perf)
  await model.fit(xs, xs, {
    epochs: 50,
    batchSize: Math.min(32, data.length),
    shuffle: true,
    verbose: 0,
  });

  // Compute reconstruction errors
  const predictions = model.predict(xs) as import("@tensorflow/tfjs").Tensor;
  const errors = tfjs.sub(xs, predictions).square().mean(1);
  const errorValues = Array.from(await errors.data());

  // Determine threshold from percentile
  const sorted = [...errorValues].sort((a, b) => a - b);
  const threshIdx = Math.floor(sorted.length * (threshold / 100));
  const errorThreshold = sorted[threshIdx] ?? sorted[sorted.length - 1];

  // Cleanup tensors
  xs.dispose();
  predictions.dispose();
  errors.dispose();
  model.dispose();

  return data.map((row, i) => ({
    index: i,
    reconstructionError: errorValues[i],
    isAnomaly: errorValues[i] > errorThreshold,
    value: row[0],
  }));
}

// ─── Time-series forecasting (simple dense network) ───────────────────────────

export interface TimeSeriesForecast {
  predicted: number[];
  confidence: number;
  modelMetrics: {
    trainLoss: number;
    windowSize: number;
    epochs: number;
  };
}

/**
 * Train a small dense network on sliding windows of time-series data
 * and predict future values.
 * @param values Historical numeric time series
 * @param steps Number of future periods to predict
 */
export async function forecastTimeSeries(
  values: number[],
  steps = 6,
): Promise<TimeSeriesForecast> {
  if (values.length < 10) {
    return {
      predicted: [],
      confidence: 0,
      modelMetrics: { trainLoss: 0, windowSize: 0, epochs: 0 },
    };
  }

  const tfjs = await getTF();
  const { norm, min, max } = normalise(values);

  // Create sliding windows
  const windowSize = Math.min(6, Math.floor(values.length / 3));
  const xs: number[][] = [];
  const ys: number[] = [];

  for (let i = 0; i <= norm.length - windowSize - 1; i++) {
    xs.push(norm.slice(i, i + windowSize));
    ys.push(norm[i + windowSize]);
  }

  if (xs.length < 5) {
    return {
      predicted: [],
      confidence: 0,
      modelMetrics: { trainLoss: 0, windowSize, epochs: 0 },
    };
  }

  const model = tfjs.sequential();
  model.add(
    tfjs.layers.dense({
      inputShape: [windowSize],
      units: 16,
      activation: "relu",
    }),
  );
  model.add(tfjs.layers.dense({ units: 8, activation: "relu" }));
  model.add(tfjs.layers.dense({ units: 1 }));

  model.compile({ optimizer: "adam", loss: "meanSquaredError" });

  const xsTensor = tfjs.tensor2d(xs);
  const ysTensor = tfjs.tensor2d(ys, [ys.length, 1]);

  const epochs = 80;
  const history = await model.fit(xsTensor, ysTensor, {
    epochs,
    batchSize: Math.min(16, xs.length),
    shuffle: true,
    verbose: 0,
  });

  const trainLoss = (history.history.loss as number[])[epochs - 1] ?? 0;

  // Predict future values autoregressively
  const predicted: number[] = [];
  let currentWindow = norm.slice(-windowSize);

  for (let i = 0; i < steps; i++) {
    const input = tfjs.tensor2d([currentWindow]);
    const pred = model.predict(input) as import("@tensorflow/tfjs").Tensor;
    const val = (await pred.data())[0];
    predicted.push(denormalise(val, min, max));
    currentWindow = [...currentWindow.slice(1), val];
    input.dispose();
    pred.dispose();
  }

  // Cleanup
  xsTensor.dispose();
  ysTensor.dispose();
  model.dispose();

  return {
    predicted,
    confidence: Math.max(0, Math.min(1, 1 - trainLoss)),
    modelMetrics: { trainLoss, windowSize, epochs },
  };
}

// ─── Enhanced clustering with TF tensors ──────────────────────────────────────

export interface TFCluster {
  centroid: number[];
  indices: number[];
  size: number;
}

/**
 * K-means clustering using TensorFlow.js tensor operations for speed.
 * Faster than pure JS for large datasets due to vectorised ops.
 */
export async function tensorKMeans(
  data: number[][],
  k: number,
  maxIter = 50,
): Promise<TFCluster[]> {
  if (data.length < k) return [];

  const tfjs = await getTF();
  const n = data.length;
  const dims = data[0].length;

  // Normalise features
  const colStats = Array.from({ length: dims }, (_, j) => {
    const col = data.map((r) => r[j]);
    return normalise(col);
  });
  const normalised = data.map((row) =>
    row.map(
      (v, j) =>
        (v - colStats[j].min) / (colStats[j].max - colStats[j].min || 1),
    ),
  );

  const points = tfjs.tensor2d(normalised);

  // Random initialisation
  const shuffled = tfjs.util.createShuffledIndices(n);
  let centroids = tfjs.tensor2d(
    Array.from({ length: k }, (_, i) => normalised[shuffled[i]]),
  );

  let assignments = new Int32Array(n);

  for (let iter = 0; iter < maxIter; iter++) {
    // Calculate distances: (n, 1, dims) - (1, k, dims)
    const expanded = points.expandDims(1); // (n, 1, dims)
    const centExp = centroids.expandDims(0); // (1, k, dims)
    const diffs = tfjs.sub(expanded, centExp);
    const dists = diffs.square().sum(2); // (n, k)
    const newAssign = dists.argMin(1);
    const newAssignArr = new Int32Array(await newAssign.data());

    // Check convergence
    let changed = false;
    for (let i = 0; i < n; i++) {
      if (newAssignArr[i] !== assignments[i]) {
        changed = true;
        break;
      }
    }

    expanded.dispose();
    centExp.dispose();
    diffs.dispose();
    dists.dispose();
    newAssign.dispose();

    assignments = newAssignArr;
    if (!changed) break;

    // Recompute centroids
    const newCentroids: number[][] = [];
    for (let j = 0; j < k; j++) {
      const indices = [];
      for (let i = 0; i < n; i++) {
        if (assignments[i] === j) indices.push(i);
      }
      if (indices.length === 0) {
        newCentroids.push(Array(dims).fill(0));
        continue;
      }
      const gathered = tfjs.gather(points, indices);
      const centroid = gathered.mean(0);
      newCentroids.push(Array.from(await centroid.data()));
      gathered.dispose();
      centroid.dispose();
    }

    centroids.dispose();
    centroids = tfjs.tensor2d(newCentroids);
  }

  // Build result
  const centroidValues = await centroids.data();
  const result: TFCluster[] = [];

  for (let j = 0; j < k; j++) {
    const indices: number[] = [];
    for (let i = 0; i < n; i++) {
      if (assignments[i] === j) indices.push(i);
    }
    // Denormalise centroid
    const rawCentroid = Array.from({ length: dims }, (_, d) => {
      const normVal = centroidValues[j * dims + d];
      return denormalise(normVal, colStats[d].min, colStats[d].max);
    });
    result.push({
      centroid: rawCentroid,
      indices,
      size: indices.length,
    });
  }

  // Cleanup
  points.dispose();
  centroids.dispose();

  return result.filter((c) => c.size > 0).sort((a, b) => b.size - a.size);
}

// ─── Feature importance (permutation-based) ───────────────────────────────────

export interface FeatureImportance {
  column: string;
  importance: number;
}

/**
 * Estimate feature importance by measuring how much shuffling
 * each feature degrades prediction accuracy (permutation importance).
 */
export async function computeFeatureImportance(
  data: number[][],
  targetIdx: number,
  columns: ColMeta[],
): Promise<FeatureImportance[]> {
  if (data.length < 20 || data[0].length < 2) return [];

  const tfjs = await getTF();
  const featureCount = data[0].length;
  const featureIdxs = Array.from({ length: featureCount }, (_, i) => i).filter(
    (i) => i !== targetIdx,
  );

  // Prepare X, y
  const X = data.map((row) => featureIdxs.map((i) => row[i]));
  const y = data.map((row) => row[targetIdx]);

  const { norm: yNorm, min: yMin, max: yMax } = normalise(y);
  const xStats = featureIdxs.map((_, i) => normalise(X.map((r) => r[i])));
  const xNorm = X.map((row) =>
    row.map(
      (v, i) => (v - xStats[i].min) / (xStats[i].max - xStats[i].min || 1),
    ),
  );

  // Quick model
  const model = tfjs.sequential();
  model.add(
    tfjs.layers.dense({
      inputShape: [featureIdxs.length],
      units: 8,
      activation: "relu",
    }),
  );
  model.add(tfjs.layers.dense({ units: 1 }));
  model.compile({ optimizer: "adam", loss: "meanSquaredError" });

  const xsTensor = tfjs.tensor2d(xNorm);
  const ysTensor = tfjs.tensor2d(yNorm, [yNorm.length, 1]);

  await model.fit(xsTensor, ysTensor, {
    epochs: 30,
    batchSize: 32,
    verbose: 0,
  });

  // Baseline loss
  const basePred = model.predict(xsTensor) as import("@tensorflow/tfjs").Tensor;
  const baseLoss = tfjs.losses
    .meanSquaredError(ysTensor, basePred)
    .dataSync()[0];

  const importances: FeatureImportance[] = [];

  // Shuffle each feature and measure loss increase
  for (let fi = 0; fi < featureIdxs.length; fi++) {
    const shuffled = xNorm.map((row) => [...row]);
    const colValues = shuffled.map((r) => r[fi]);
    // Fisher-Yates shuffle
    for (let i = colValues.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [colValues[i], colValues[j]] = [colValues[j], colValues[i]];
    }
    for (let i = 0; i < shuffled.length; i++) shuffled[i][fi] = colValues[i];

    const shuffledTensor = tfjs.tensor2d(shuffled);
    const shuffledPred = model.predict(
      shuffledTensor,
    ) as import("@tensorflow/tfjs").Tensor;
    const shuffledLoss = tfjs.losses
      .meanSquaredError(ysTensor, shuffledPred)
      .dataSync()[0];

    importances.push({
      column: columns[featureIdxs[fi]]?.name ?? `feature_${fi}`,
      importance: Math.max(0, shuffledLoss - baseLoss),
    });

    shuffledTensor.dispose();
    shuffledPred.dispose();
  }

  // Cleanup
  basePred.dispose();
  xsTensor.dispose();
  ysTensor.dispose();
  model.dispose();

  // Normalise importances to 0-1
  const maxImp = Math.max(...importances.map((i) => i.importance), 1e-8);
  return importances
    .map((i) => ({ ...i, importance: i.importance / maxImp }))
    .sort((a, b) => b.importance - a.importance);
}
