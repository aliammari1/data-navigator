/**
 * Pyodide-backed ML algorithms — scikit-learn running in WebAssembly via the
 * Python sandbox.  Every exported function returns null when Pyodide or
 * scikit-learn is unavailable so the caller can fall back to its own pure-JS
 * implementation.
 *
 * No "use client" — this module may be imported anywhere, but it ultimately
 * calls into the sandbox worker which requires a browser context at runtime.
 */

import {
  ensureSandboxReady,
  installPackages,
  loadDataFrame,
  runPython,
} from "@/platform/python-sandbox/core";

// ─── Session & package bootstrap ─────────────────────────────────────────────

const ML_SESSION = "pyodide-ml";

let sklearnReady = false;
let initPromise: Promise<boolean> | null = null;

/**
 * Idempotent: installs scikit-learn + deps once per app session.
 * Returns true when sklearn is available, false on any failure.
 */
async function ensureSklearn(
  onProgress?: (s: string) => void,
): Promise<boolean> {
  if (sklearnReady) return true;
  if (initPromise) return initPromise;

  initPromise = (async (): Promise<boolean> => {
    try {
      await ensureSandboxReady(onProgress);
      onProgress?.("Installing scikit-learn…");
      await installPackages(
        ML_SESSION,
        ["scikit-learn", "pandas", "numpy"],
        onProgress,
      );
      // Smoke-test: import the core module
      const { stderr } = await runPython("import sklearn", {
        sessionId: ML_SESSION,
        onProgress,
      });
      if (stderr?.trim()) {
        // import produced warnings rather than hard errors — still usable
        onProgress?.(`sklearn loaded with warnings: ${stderr.trim()}`);
      }
      sklearnReady = true;
      onProgress?.("scikit-learn ready");
      return true;
    } catch {
      initPromise = null; // allow retry on next call
      return false;
    }
  })();

  return initPromise;
}

// ─── IsolationForest anomaly detection ───────────────────────────────────────

export interface PyAnomalyResult {
  index: number;
  /** Anomaly score 0-1 — higher means more anomalous. */
  score: number;
  isAnomaly: boolean;
  /** First feature value of the row (convenience). */
  value: number;
}

/**
 * Detect anomalies using sklearn's IsolationForest.
 *
 * @param data         Row-major numeric matrix [n_samples][n_features].
 * @param contamination Expected fraction of outliers, 0.0-0.5 (default 0.1).
 * @param onProgress   Optional status callback.
 * @returns            Per-row results, or null if sklearn is unavailable.
 */
export async function detectAnomaliesSklearn(
  data: number[][],
  contamination = 0.1,
  onProgress?: (s: string) => void,
): Promise<PyAnomalyResult[] | null> {
  try {
    const ready = await ensureSklearn(onProgress);
    if (!ready) return null;
    if (data.length === 0) return [];

    const rows = data.map((row, i) => ({ _idx: i, ...rowToRecord(row) }));
    await loadDataFrame(ML_SESSION, "df_X", rows, onProgress);

    const clampedContamination = Math.min(0.5, Math.max(0.001, contamination));

    const code = `
from sklearn.ensemble import IsolationForest
import numpy as np

X = df_X.drop(columns=["_idx"]).values.astype(float)

clf = IsolationForest(contamination=${clampedContamination}, random_state=42)
clf.fit(X)

# score_samples returns negative scores; flip so higher = more anomalous
raw_scores = -clf.score_samples(X)
# Normalise to [0, 1]
s_min, s_max = raw_scores.min(), raw_scores.max()
s_range = s_max - s_min if s_max != s_min else 1.0
norm_scores = (raw_scores - s_min) / s_range

labels = clf.predict(X)  # -1 = anomaly, 1 = normal

[
  {
    "index": int(i),
    "score": float(norm_scores[i]),
    "isAnomaly": bool(labels[i] == -1),
    "value": float(X[i][0]),
  }
  for i in range(len(X))
]
`.trim();

    const result = await runPython(code, {
      sessionId: ML_SESSION,
      onProgress,
    });

    return result.value as PyAnomalyResult[];
  } catch {
    return null;
  }
}

// ─── K-Means clustering ───────────────────────────────────────────────────────

export interface PyClusterResult {
  labels: number[];
  centroids: number[][];
  /** Within-cluster sum of squares. */
  inertia: number;
  /** Silhouette score (present only when n_clusters > 1 and n_samples > k). */
  silhouette?: number;
}

/**
 * Cluster data using sklearn's KMeans with k-means++ initialisation.
 *
 * @param data Row-major numeric matrix [n_samples][n_features].
 * @param k    Number of clusters.
 * @returns    Cluster assignment labels, centroids, and quality metrics,
 *             or null if sklearn is unavailable.
 */
export async function kMeansSklearn(
  data: number[][],
  k: number,
  onProgress?: (s: string) => void,
): Promise<PyClusterResult | null> {
  try {
    const ready = await ensureSklearn(onProgress);
    if (!ready) return null;
    if (data.length === 0 || k < 1) return null;

    const clampedK = Math.min(k, data.length);

    const rows = data.map((row, i) => ({ _idx: i, ...rowToRecord(row) }));
    await loadDataFrame(ML_SESSION, "df_X", rows, onProgress);

    const code = `
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
import numpy as np

X = df_X.drop(columns=["_idx"]).values.astype(float)
k = ${clampedK}

km = KMeans(n_clusters=k, init="k-means++", n_init=10, random_state=42)
km.fit(X)

labels = km.labels_.tolist()
centroids = km.cluster_centers_.tolist()
inertia = float(km.inertia_)

sil = None
if k > 1 and len(X) > k:
    try:
        sil = float(silhouette_score(X, labels))
    except Exception:
        sil = None

result = {"labels": labels, "centroids": centroids, "inertia": inertia}
if sil is not None:
    result["silhouette"] = sil
result
`.trim();

    const result = await runPython(code, {
      sessionId: ML_SESSION,
      onProgress,
    });

    return result.value as PyClusterResult;
  } catch {
    return null;
  }
}

// ─── PCA dimensionality reduction ─────────────────────────────────────────────

export interface PyPCAResult {
  /** Row-major 2-D projection: [n_samples][nComponents]. */
  components: number[][];
  /** Explained variance ratio for each principal component. */
  explained: number[];
}

/**
 * Reduce dimensionality using sklearn's PCA.
 *
 * @param data       Row-major numeric matrix [n_samples][n_features].
 * @param nComponents Number of output dimensions (default 2).
 * @returns          Projected coordinates and explained variance ratios,
 *                   or null if sklearn is unavailable.
 */
export async function computePCASklearn(
  data: number[][],
  nComponents = 2,
  onProgress?: (s: string) => void,
): Promise<PyPCAResult | null> {
  try {
    const ready = await ensureSklearn(onProgress);
    if (!ready) return null;
    if (data.length === 0) return null;

    const nFeatures = data[0]?.length ?? 0;
    const safeComponents = Math.min(nComponents, nFeatures, data.length);
    if (safeComponents < 1) return null;

    const rows = data.map((row, i) => ({ _idx: i, ...rowToRecord(row) }));
    await loadDataFrame(ML_SESSION, "df_X", rows, onProgress);

    const code = `
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
import numpy as np

X = df_X.drop(columns=["_idx"]).values.astype(float)
n_components = ${safeComponents}

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

pca = PCA(n_components=n_components, random_state=42)
projected = pca.fit_transform(X_scaled)

{
  "components": projected.tolist(),
  "explained": pca.explained_variance_ratio_.tolist(),
}
`.trim();

    const result = await runPython(code, {
      sessionId: ML_SESSION,
      onProgress,
    });

    return result.value as PyPCAResult;
  } catch {
    return null;
  }
}

// ─── Linear trend with sklearn LinearRegression ───────────────────────────────

export interface PyTrendResult {
  slope: number;
  intercept: number;
  /** R² coefficient of determination (0-1). */
  r2: number;
  /** Forecast values for `horizon` steps beyond the last observed index. */
  forecast: number[];
}

/**
 * Fit a linear trend with sklearn and project it forward.
 *
 * @param values  Time-series values (equally spaced).
 * @param horizon Steps to forecast beyond the last observed point (default 6).
 * @returns       Slope, intercept, R², and forecast array,
 *                or null if sklearn is unavailable.
 */
export async function linearTrendSklearn(
  values: number[],
  horizon = 6,
): Promise<PyTrendResult | null> {
  try {
    const ready = await ensureSklearn();
    if (!ready) return null;
    if (values.length < 2) return null;

    const rows = values.map((v, i) => ({ t: i, y: v }));
    await loadDataFrame(ML_SESSION, "df_trend", rows);

    const code = `
from sklearn.linear_model import LinearRegression
from sklearn.metrics import r2_score
import numpy as np

t = df_trend[["t"]].values.astype(float)
y = df_trend["y"].values.astype(float)

model = LinearRegression()
model.fit(t, y)

slope = float(model.coef_[0])
intercept = float(model.intercept_)
y_pred = model.predict(t)
r2 = float(r2_score(y, y_pred))

horizon = ${horizon}
last_t = int(t[-1][0])
future_t = np.arange(last_t + 1, last_t + 1 + horizon, dtype=float).reshape(-1, 1)
forecast = model.predict(future_t).tolist()

{"slope": slope, "intercept": intercept, "r2": r2, "forecast": forecast}
`.trim();

    const result = await runPython(code, {
      sessionId: ML_SESSION,
    });

    return result.value as PyTrendResult;
  } catch {
    return null;
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Convert a numeric array row into a Record with sequential feature keys
 * (f0, f1, …) so it can be loaded via loadDataFrame.
 */
function rowToRecord(row: number[]): Record<string, number> {
  const record: Record<string, number> = {};
  for (let j = 0; j < row.length; j++) {
    record[`f${j}`] = row[j] ?? 0;
  }
  return record;
}
