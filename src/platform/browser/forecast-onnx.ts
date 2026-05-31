/**
 * Forecasting — TensorFlow.js + simple-statistics
 *
 * Replaces onnxruntime-web.
 *
 * Runtime path:
 * 1. Try TensorFlow.js model from IndexedDB cache.
 * 2. If enabled, fetch model from /models/forecast-tfjs/model.json.
 * 3. Save fetched model into IndexedDB.
 * 4. Fall back to simple-statistics linear regression when no model exists.
 *
 * Expected TFJS model:
 * - Input shape:  [1, sequenceLength, 4]
 * - Output shape: [1, horizon, 2] or [horizon * 2]
 * - Output values:
 *   - even index: normalized total
 *   - odd index: success rate
 */

"use client";

import type * as Tf from "@tensorflow/tfjs";
import { linearRegression, linearRegressionLine } from "simple-statistics";

export interface HourlyRow {
  hour: number;
  total: number;
  success: number;
  declined: number;
  amount: number;
}

export interface ForecastPoint {
  hour: number;
  predictedTotal: number;
  predictedSuccessRate: number;
  isForecast: true;
}

type TfModule = typeof Tf;
type TfModel = Tf.LayersModel;

const MODEL_INDEXEDDB_PATH = "indexeddb://forecast-tfjs";
const MODEL_PUBLIC_PATH = "/models/forecast-tfjs/model.json";

/**
 * Disabled by default so the app does not spam 404 requests
 * when you have not shipped a model yet.
 *
 * Enable only after adding:
 * public/models/forecast-tfjs/model.json
 * public/models/forecast-tfjs/*.bin
 */
const MODEL_HTTP_FETCH_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_FORECAST_TFJS === "true";

let tfPromise: Promise<TfModule> | null = null;
let modelPromise: Promise<TfModel | null> | null = null;

async function loadTf(): Promise<TfModule> {
  if (!tfPromise) {
    tfPromise = import("@tensorflow/tfjs").then(async (tf) => {
      /**
       * TensorFlow.js can pick a backend automatically, but for browser apps
       * we try WebGL first because it is the normal accelerated browser path.
       */
      try {
        await tf.setBackend("webgl");
      } catch {
        try {
          await tf.setBackend("cpu");
        } catch {
          // tf.ready() below will surface any real init issue.
        }
      }

      await tf.ready();
      return tf;
    });
  }

  return tfPromise;
}

async function tryLoadModelFromIndexedDB(
  tf: TfModule,
): Promise<TfModel | null> {
  try {
    return await tf.loadLayersModel(MODEL_INDEXEDDB_PATH);
  } catch {
    return null;
  }
}

async function tryLoadModelFromPublic(tf: TfModule): Promise<TfModel | null> {
  if (!MODEL_HTTP_FETCH_ENABLED) return null;

  try {
    const model = await tf.loadLayersModel(MODEL_PUBLIC_PATH);

    try {
      await model.save(MODEL_INDEXEDDB_PATH);
    } catch {
      // IndexedDB cache failure is not fatal.
    }

    return model;
  } catch (error) {
    console.warn("[forecast-tfjs] Public model load failed:", error);
    return null;
  }
}

async function getTfModel(): Promise<TfModel | null> {
  if (typeof window === "undefined") return null;

  if (!modelPromise) {
    modelPromise = (async () => {
      try {
        const tf = await loadTf();

        return (
          (await tryLoadModelFromIndexedDB(tf)) ??
          (await tryLoadModelFromPublic(tf))
        );
      } catch (error) {
        console.warn("[forecast-tfjs] Model init failed:", error);
        return null;
      }
    })();
  }

  return modelPromise;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function linearForecast(hourly: HourlyRow[], horizon: number): ForecastPoint[] {
  const rows = hourly.slice(-24);
  const n = rows.length;

  if (n < 3) return [];

  const totalPoints = rows.map((row, index) => {
    return [index, row.total] as [number, number];
  });

  const successRatePoints = rows.map((row, index) => {
    const successRate = row.total > 0 ? row.success / row.total : 0;
    return [index, successRate] as [number, number];
  });

  const totalRegression = linearRegression(totalPoints);
  const successRateRegression = linearRegression(successRatePoints);

  const totalLine = linearRegressionLine(totalRegression);
  const successRateLine = linearRegressionLine(successRateRegression);

  const lastHour = rows.at(-1)?.hour ?? 0;

  return Array.from({ length: horizon }, (_, index) => {
    const predictedIndex = n + index;

    return {
      hour: (lastHour + index + 1) % 24,
      predictedTotal: Math.max(0, Math.round(totalLine(predictedIndex))),
      predictedSuccessRate: clamp(successRateLine(predictedIndex), 0, 1),
      isForecast: true,
    };
  });
}

async function tfjsForecast(
  model: TfModel,
  hourly: HourlyRow[],
  horizon: number,
): Promise<ForecastPoint[]> {
  const tf = await loadTf();
  const rows = hourly.slice(-24);

  if (rows.length < 3) return [];

  const maxTotal = Math.max(...rows.map((row) => row.total), 1);
  const lastHour = rows.at(-1)?.hour ?? 0;

  let outputTensor: Tf.Tensor | null = null;

  try {
    const inputData = new Float32Array(
      rows.flatMap((row, index) => {
        const successRate = row.total > 0 ? row.success / row.total : 0;

        return [
          index / rows.length,
          row.hour / 23,
          row.total / maxTotal,
          successRate,
        ];
      }),
    );

    const inputTensor = tf.tensor(inputData, [1, rows.length, 4], "float32");

    outputTensor = tf.tidy(() => {
      const prediction = model.predict(inputTensor);

      if (Array.isArray(prediction)) {
        return prediction[0].clone();
      }

      return prediction.clone();
    });

    inputTensor.dispose();

    const raw = await outputTensor.data();

    if (raw.length < horizon * 2) {
      throw new Error(
        `TFJS output too short. Expected at least ${
          horizon * 2
        } values, got ${raw.length}.`,
      );
    }

    return Array.from({ length: horizon }, (_, index) => {
      const normalizedTotal = Number(raw[index * 2] ?? 0);
      const successRate = Number(raw[index * 2 + 1] ?? 0);

      return {
        hour: (lastHour + index + 1) % 24,
        predictedTotal: Math.max(0, Math.round(normalizedTotal * maxTotal)),
        predictedSuccessRate: clamp(successRate, 0, 1),
        isForecast: true,
      };
    });
  } catch (error) {
    console.warn(
      "[forecast-tfjs] Inference failed. Falling back to linear regression:",
      error,
    );

    return linearForecast(hourly, horizon);
  } finally {
    outputTensor?.dispose();
  }
}

export async function forecastNextHours(
  hourly: HourlyRow[],
  horizon = 4,
): Promise<ForecastPoint[]> {
  if (hourly.length < 3) return [];

  try {
    const model = await getTfModel();

    if (!model) {
      return linearForecast(hourly, horizon);
    }

    return await tfjsForecast(model, hourly, horizon);
  } catch (error) {
    console.warn("[forecast-tfjs] forecastNextHours failed:", error);
    return linearForecast(hourly, horizon);
  }
}
