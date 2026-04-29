/**
 * F27 — onnxruntime-web + WebGPU Forecasting
 * Replaces TF.js (F13). Uses ONNX runtime with WebGPU execution provider.
 * Model loaded from OPFS cache → fetched from /models/ on first use.
 * Falls back to simple-statistics linear regression when no model is available.
 *
 * Why linear regression fallback: 24 data points is too few for a neural net
 * to generalize. Linear regression is more stable and interpretable at this scale.
 */

"use client";

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

// ─── WebGPU Detection ─────────────────────────────────────────────────────────

export async function isWebGPUAvailable(): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  if (!("gpu" in navigator)) return false;
  try {
    const adapter = await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

// ─── ONNX Session (cached) ────────────────────────────────────────────────────

const MODEL_OPFS_NAME = "forecast-lstm-int8.onnx";
// HTTP fetch is intentionally disabled: no model file is bundled with the app.
// To enable ONNX inference, place forecast-lstm-int8.onnx in public/models/ and
// set this to true.  Without the file, the linear-regression fallback is used.
const MODEL_HTTP_FETCH_ENABLED = false;
const MODEL_PUBLIC_PATH = "/models/forecast-lstm-int8.onnx";

let _sessionPromise: Promise<unknown> | null = null;

async function getONNXSession(): Promise<unknown | null> {
  if (_sessionPromise) return _sessionPromise;
  _sessionPromise = (async () => {
    try {
      const ort = await import("onnxruntime-web");

      // Configure WASM paths
      ort.env.wasm.wasmPaths = "/_next/static/onnx/";

      // Try OPFS cache first
      let modelBuffer: ArrayBuffer | null = null;
      try {
        const opfsRoot = await navigator.storage.getDirectory();
        const fh = await opfsRoot.getFileHandle(MODEL_OPFS_NAME);
        modelBuffer = await (await fh.getFile()).arrayBuffer();
      } catch {
        // Not in OPFS — fetch from public directory only when enabled
        if (MODEL_HTTP_FETCH_ENABLED) {
          try {
            const res = await fetch(MODEL_PUBLIC_PATH, { cache: "force-cache" });
            if (res.ok) {
              modelBuffer = await res.arrayBuffer();
              // Cache in OPFS for future sessions
              try {
                const opfsRoot = await navigator.storage.getDirectory();
                const fh = await opfsRoot.getFileHandle(MODEL_OPFS_NAME, { create: true });
                const writable = await fh.createWritable();
                await writable.write(modelBuffer);
                await writable.close();
              } catch {
                // OPFS write failure — non-critical
              }
            }
          } catch {
            // No model available — will use linear regression fallback
          }
        }
      }

      if (!modelBuffer) return null;

      const webgpu = await isWebGPUAvailable();
      const session = await ort.InferenceSession.create(modelBuffer, {
        executionProviders: webgpu ? ["webgpu", "wasm"] : ["wasm"],
      });
      return session;
    } catch (err) {
      console.warn("[forecast-onnx] ONNX session init failed:", err);
      return null;
    }
  })();
  return _sessionPromise;
}

// ─── Linear Regression Fallback ───────────────────────────────────────────────

function linearForecast(hourly: HourlyRow[], horizon: number): ForecastPoint[] {
  const n = hourly.length;
  if (n < 3) return [];

  // Points: [index, value]
  const totalPts = hourly.map((r, i) => [i, r.total] as [number, number]);
  const ratePts = hourly.map((r, i) => [
    i,
    r.total > 0 ? r.success / r.total : 0,
  ] as [number, number]);

  const totalReg = linearRegression(totalPts);
  const rateReg = linearRegression(ratePts);
  const totalLine = linearRegressionLine(totalReg);
  const rateLine = linearRegressionLine(rateReg);

  const lastHour = hourly.at(-1)!.hour;
  return Array.from({ length: horizon }, (_, i) => ({
    hour: (lastHour + i + 1) % 24,
    predictedTotal: Math.max(0, Math.round(totalLine(n + i))),
    predictedSuccessRate: Math.max(0, Math.min(1, rateLine(n + i))),
    isForecast: true as const,
  }));
}

// ─── ONNX Inference (when model present) ─────────────────────────────────────

async function onnxForecast(
  session: unknown,
  hourly: HourlyRow[],
  horizon: number,
): Promise<ForecastPoint[]> {
  try {
    const ort = await import("onnxruntime-web");

    const maxTotal = Math.max(...hourly.map((r) => r.total), 1);
    const inputData = new Float32Array(
      hourly.flatMap((r, i) => [
        i / hourly.length,
        r.hour / 23,
        r.total / maxTotal,
        r.total > 0 ? r.success / r.total : 0,
      ]),
    );

    const tensor = new ort.Tensor("float32", inputData, [1, hourly.length, 4]);
    // biome-ignore lint/suspicious/noExplicitAny: session type varies by ort version
    const output = await (session as any).run({ input: tensor });
    const raw = output.output?.data as Float32Array | undefined;
    if (!raw) throw new Error("no output");

    const lastHour = hourly.at(-1)!.hour;
    return Array.from({ length: horizon }, (_, i) => ({
      hour: (lastHour + i + 1) % 24,
      predictedTotal: Math.max(0, Math.round((raw[i * 2] ?? 0) * maxTotal)),
      predictedSuccessRate: Math.max(0, Math.min(1, raw[i * 2 + 1] ?? 0)),
      isForecast: true as const,
    }));
  } catch (err) {
    console.warn("[forecast-onnx] inference failed, using linear regression:", err);
    return linearForecast(hourly, horizon);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function forecastNextHours(
  hourly: HourlyRow[],
  horizon = 4,
): Promise<ForecastPoint[]> {
  if (hourly.length < 3) return [];

  try {
    const session = await getONNXSession();
    if (session) {
      return onnxForecast(session, hourly, horizon);
    }
    // No ONNX model — use linear regression (fast, no model file needed)
    return linearForecast(hourly, horizon);
  } catch (err) {
    console.warn("[forecast-onnx] forecastNextHours failed:", err);
    return linearForecast(hourly, horizon);
  }
}
