/**
 * Offline model registry (renderer-side source of truth).
 *
 * Mirrors the build-time `scripts/prepare-models.mjs` MODEL_MANIFEST but in a
 * shape the renderer/preflight + Setup UI can consume. It answers three things:
 *
 *   1. WHICH models the offline AI lanes need (the GGUF instruct model for the
 *      Electron node-llama-cpp lane, and the all-MiniLM-L6-v2 ONNX weights for
 *      the transformers.js embeddings worker).
 *   2. WHERE each lives (userData for GGUF, `/models/transformers/` public path
 *      or OPFS for MiniLM) and how to probe its presence.
 *   3. The download size / human metadata the Setup affordance shows.
 *
 * Presence checks themselves live in `use-model-status.ts` (they need
 * `window.electronLlama` / `fetch` / OPFS and so are async + side-effecting).
 * This module is pure data so it can be imported anywhere (incl. tests).
 */

/** Which inference lane a model feeds. */
export type ModelLane = "llm" | "embed";

/** How a model's presence is probed at runtime. */
export type ModelPresenceKind =
  /** GGUF in userData; probed via `window.electronLlama.listModels()`. */
  | "electron-gguf"
  /** transformers.js asset under `/models/transformers/...`; probed via HEAD + OPFS. */
  | "transformers-asset";

export interface ModelManifestEntry {
  /** Stable id (matches prepare-models.mjs `key` where they overlap). */
  key: string;
  lane: ModelLane;
  presence: ModelPresenceKind;
  label: string;
  family: string;
  /** Human size, e.g. "1.5B" / "0.5B" / "23 MB". */
  sizeLabel: string;
  /** Approx download size in MB (for progress + "this will use N MB" copy). */
  downloadMb: number;
  /** Whether the app can function (degraded) without it. */
  optional: boolean;
  /**
   * For `electron-gguf`: the GGUF filename as it appears in
   * `<userData>/models/llm/<file>` and `electronLlama.listModels()` ids.
   */
  ggufFile?: string;
  /**
   * For `transformers-asset`: the path under `localModelPath`
   * (`/models/transformers/`) used to HEAD-probe the primary weight file.
   * e.g. "Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx".
   */
  assetPath?: string;
  /**
   * For `electron-gguf`: direct Hugging Face download URL, used by the in-app
   * model-download IPC (electron/model-download-service.ts) to stream to
   * userData while online. Keep in sync with prepare-models.mjs.
   */
  downloadUrl?: string;
  /**
   * Expected sha256 / byte size for the in-app download integrity check.
   * "" / 0 = unknown (TODO before a verified release) — download proceeds with a
   * warning rather than a hard gate.
   */
  sha256?: string;
  bytes?: number;
}

/** transformers.js localModelPath — matches `transformers-env.ts` LOCAL_MODEL_PATH. */
export const LOCAL_TRANSFORMERS_PATH = "/models/transformers/";

/**
 * The default GGUF instruct model used by the Electron generative lane
 * (electron/llama-service.ts DEFAULT_LLM_MODEL). Kept here too so the Setup UI
 * and preflight agree on the "primary" model id without importing main-process
 * code. Mirrors electron/model-download-service.ts's MODEL_DOWNLOADS — the
 * canonical catalog — keep the two in lockstep when it changes.
 */
export const DEFAULT_GGUF_MODEL = "gemma-4-e4b-it-q4_k_m.gguf";

/** The MiniLM embeddings model id used by the inference worker. */
export const EMBED_MODEL_ID = "Xenova/all-MiniLM-L6-v2";

export const MODEL_MANIFEST: ModelManifestEntry[] = [
  // ── Instruct GGUF (Electron node-llama-cpp) — mirrors
  // electron/model-download-service.ts's MODEL_DOWNLOADS ────────────────────
  {
    key: "gemma-4-e4b-it-q4_k_m",
    lane: "llm",
    presence: "electron-gguf",
    label: "Gemma 4 E4B Instruct (GGUF q4)",
    family: "Gemma 4",
    sizeLabel: "E4B",
    downloadMb: 5340, // matches model-download-service.ts's bytes: 5_340_000_000
    optional: false,
    ggufFile: "gemma-4-e4b-it-q4_k_m.gguf",
  },
  {
    key: "granite-4.1-3b-instruct-q4_k_m",
    lane: "llm",
    presence: "electron-gguf",
    label: "Granite 4.1 3B Instruct (GGUF q4, Apache 2.0)",
    family: "Granite 4.1",
    sizeLabel: "3B",
    downloadMb: 2100, // matches model-download-service.ts's bytes: 2_100_000_000
    optional: true,
    ggufFile: "granite-4.1-3b-instruct-q4_k_m.gguf",
  },

  // ── all-MiniLM-L6-v2 int8 ONNX (transformers.js embeddings worker) ─────────
  // The primary probe target is the int8 ONNX weight; the JSON sidecars are
  // fetched alongside it by prepare-models.mjs and are implied present when the
  // weight is. The embeddings worker also tolerates the IndexedDB/OPFS browser
  // cache populated by a first online run.
  {
    key: "minilm-onnx-quantized",
    lane: "embed",
    presence: "transformers-asset",
    label: "all-MiniLM-L6-v2 (ONNX int8)",
    family: "MiniLM",
    sizeLabel: "23 MB",
    downloadMb: 23,
    optional: false,
    assetPath: "Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx",
    sha256: "", // TODO
    bytes: 0, // TODO (≈23_000_000)
  },
];

/** The single non-optional model per lane (the "primary" each lane needs). */
export function primaryForLane(lane: ModelLane): ModelManifestEntry {
  const primary = MODEL_MANIFEST.find((m) => m.lane === lane && !m.optional);
  if (!primary) throw new Error(`No primary model registered for lane "${lane}".`);
  return primary;
}

export function manifestByKey(key: string): ModelManifestEntry | undefined {
  return MODEL_MANIFEST.find((m) => m.key === key);
}

/** Public URL the renderer can HEAD-probe for a transformers asset. */
export function transformersAssetUrl(entry: ModelManifestEntry): string {
  if (!entry.assetPath) throw new Error(`${entry.key} has no assetPath`);
  return `${LOCAL_TRANSFORMERS_PATH}${entry.assetPath}`;
}
