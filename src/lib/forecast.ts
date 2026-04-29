/**
 * F13 — TensorFlow.js Hourly Forecasting
 * Trains a tiny neural net on 24 hourly rows → predicts next 4 hours.
 * Runs entirely in-browser, no API key, no data leaves the device.
 */

"use client";

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

/**
 * Normalize array to [0,1] range. Returns scale factor for de-normalization.
 */
function normalize(arr: number[]): { norm: number[]; scale: number } {
  const max = Math.max(...arr, 1);
  return { norm: arr.map((v) => v / max), scale: max };
}

export async function forecastNextHours(
  hourly: HourlyRow[],
  horizon = 4,
): Promise<ForecastPoint[]> {
  if (hourly.length < 6) return [];

  try {
    const tf = await import("@tensorflow/tfjs");

    const totals = hourly.map((r) => r.total);
    const rates = hourly.map((r) => (r.total > 0 ? r.success / r.total : 0));
    const hours = hourly.map((r) => r.hour / 23); // normalized hour

    const { norm: normTotals, scale: totalScale } = normalize(totals);

    // Input: [normalized_step, normalized_hour_of_day]
    const xsData = hourly.map((_, i) => [i / hourly.length, hours[i]]);
    const xs = tf.tensor2d(xsData);
    const ysTotal = tf.tensor1d(normTotals);
    const ysRate = tf.tensor1d(rates);

    // Tiny 2-layer net — trains in <1s on 24 rows
    const model = tf.sequential({
      layers: [
        tf.layers.dense({
          units: 16,
          activation: "relu",
          inputShape: [2],
        }),
        tf.layers.dense({ units: 8, activation: "relu" }),
        tf.layers.dense({ units: 1, activation: "linear" }),
      ],
    });
    const modelRate = tf.sequential({
      layers: [
        tf.layers.dense({ units: 8, activation: "sigmoid", inputShape: [2] }),
        tf.layers.dense({ units: 1, activation: "sigmoid" }),
      ],
    });

    model.compile({ optimizer: "adam", loss: "meanSquaredError" });
    modelRate.compile({ optimizer: "adam", loss: "meanSquaredError" });

    await model.fit(xs, ysTotal, { epochs: 80, verbose: 0 });
    await modelRate.fit(xs, ysRate, { epochs: 60, verbose: 0 });

    const lastHour = hourly.at(-1)!.hour;
    const predictions: ForecastPoint[] = [];

    for (let i = 1; i <= horizon; i++) {
      const h = (lastHour + i) % 24;
      const step = (hourly.length + i - 1) / (hourly.length + horizon);
      const input = tf.tensor2d([[step, h / 23]]);

      const rawTotal = (model.predict(input) as import("@tensorflow/tfjs").Tensor).dataSync()[0];
      const rawRate = (modelRate.predict(input) as import("@tensorflow/tfjs").Tensor).dataSync()[0];

      predictions.push({
        hour: h,
        predictedTotal: Math.max(0, Math.round(rawTotal * totalScale)),
        predictedSuccessRate: Math.max(0, Math.min(1, rawRate)),
        isForecast: true,
      });

      input.dispose();
    }

    xs.dispose();
    ysTotal.dispose();
    ysRate.dispose();
    model.dispose();
    modelRate.dispose();

    return predictions;
  } catch (err) {
    console.warn("[forecast] TF.js unavailable:", err);
    return [];
  }
}
