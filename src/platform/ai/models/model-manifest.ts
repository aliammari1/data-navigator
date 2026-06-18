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

const HF = "https://huggingface.co";

/**
 * The default GGUF instruct model used by the Electron generative lane
 * (electron/llama-service.ts DEFAULT_LLM_MODEL). Kept here too so the Setup UI
 * and preflight agree on the "primary" model id without importing main-process
 * code.
 */
export const DEFAULT_GGUF_MODEL = "qwen2.5-1.5b-instruct-q4_k_m.gguf";

/** The MiniLM embeddings model id used by the inference worker. */
export const EMBED_MODEL_ID = "Xenova/all-MiniLM-L6-v2";

export const MODEL_MANIFEST: ModelManifestEntry[] = [
  // ── Instruct GGUF (Electron node-llama-cpp) ────────────────────────────────
  {
    key: "qwen2.5-1.5b-instruct-q4_k_m",
    lane: "llm",
    presence: "electron-gguf",
    label: "Qwen2.5 1.5B Instruct (GGUF q4)",
    family: "Qwen2.5",
    sizeLabel: "1.5B",
    downloadMb: 1020,
    optional: false,
    ggufFile: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
    downloadUrl: `${HF}/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf?download=true`,
    sha256: "", // TODO: fill before verified release
    bytes: 0, // TODO: fill exact content-length (≈1_070_000_000)
  },
  {
    key: "qwen2.5-0.5b-instruct-q4_k_m",
    lane: "llm",
    presence: "electron-gguf",
    label: "Qwen2.5 0.5B Instruct (GGUF q4) — low-RAM fallback",
    family: "Qwen2.5",
    sizeLabel: "0.5B",
    downloadMb: 400,
    optional: true,
    ggufFile: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
    downloadUrl: `${HF}/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf?download=true`,
    sha256: "", // TODO
    bytes: 0, // TODO (≈398_000_000)
  },
  {
    // OPTIONAL upgrade for stronger machines (≈8GB+ free RAM). Qwen2.5-7B
    // understands Tunisian Derja and Arabic noticeably better than the 1.5B
    // default — see docs/TUNISIAN-MODEL.md. Drop the GGUF into
    // <userData>/models/llm/ and select it; nothing else needs to change.
    key: "qwen2.5-7b-instruct-q4_k_m",
    lane: "llm",
    presence: "electron-gguf",
    label: "Qwen2.5 7B Instruct (GGUF q4) — stronger Derja/Arabic, high-RAM",
    family: "Qwen2.5",
    sizeLabel: "7B",
    downloadMb: 4680,
    optional: true,
    ggufFile: "qwen2.5-7b-instruct-q4_k_m.gguf",
    downloadUrl: `${HF}/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf?download=true`,
    sha256: "", // TODO: fill before verified release
    bytes: 0, // TODO: fill exact content-length (≈4_680_000_000)
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
