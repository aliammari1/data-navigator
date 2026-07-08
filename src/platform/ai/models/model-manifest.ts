/**
 * Offline model registry (renderer-side source of truth).
 *
 * Mirrors the build-time `scripts/prepare-models.mjs` MODEL_MANIFEST but in a
 * shape the renderer/preflight + Setup UI can consume. It answers three things:
 *
 *   1. WHICH models the offline AI lanes need — both the generative instruct
 *      model and the embedding model are GGUF weights loaded by the Electron
 *      node-llama-cpp lane (electron/llama-service.ts / electron/embed-service.ts).
 *   2. WHERE each lives (`<userData>/models/llm`) and how to probe its presence.
 *   3. The download size / human metadata the Setup affordance shows.
 *
 * Presence checks themselves live in `use-model-status.ts` (they need
 * `window.electronLlama` / `window.electronModels` and so are async +
 * side-effecting). This module is pure data so it can be imported anywhere
 * (incl. tests).
 */

/** Which inference lane a model feeds. */
export type ModelLane = "llm" | "embed";

/** How a model's presence is probed at runtime. */
export type ModelPresenceKind =
  /** GGUF in userData; probed via `window.electronLlama.listModels()`. */
  "electron-gguf";

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

/**
 * The default GGUF instruct model used by the Electron generative lane
 * (electron/llama-service.ts DEFAULT_LLM_MODEL). Kept here too so the Setup UI
 * and preflight agree on the "primary" model id without importing main-process
 * code. Mirrors electron/model-download-service.ts's MODEL_DOWNLOADS — the
 * canonical catalog — keep the two in lockstep when it changes.
 */
export const DEFAULT_GGUF_MODEL = "gemma-4-e4b-it-q4_k_m.gguf";

/**
 * The GGUF embedding model used by the Electron node-llama-cpp embedding lane
 * (electron/embed-service.ts DEFAULT_EMBED_MODEL). Mirrors
 * electron/model-download-service.ts's MODEL_DOWNLOADS entry for
 * "qwen3-embedding-0.6b-q8_0" — keep the two in lockstep when it changes.
 */
export const EMBED_MODEL_ID = "qwen3-embedding-0.6b-q8_0.gguf";

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

  // ── Qwen3 Embedding 0.6B GGUF (Electron node-llama-cpp embedding lane) ─────
  // Mirrors electron/model-download-service.ts's MODEL_DOWNLOADS entry for
  // "qwen3-embedding-0.6b-q8_0" — rides the same download/progress/sha256/IPC
  // infrastructure as the instruct GGUFs above.
  {
    key: "qwen3-embedding-0.6b-q8_0",
    lane: "embed",
    presence: "electron-gguf",
    label: "Qwen3 Embedding 0.6B (GGUF Q8_0)",
    family: "Qwen3 Embedding",
    sizeLabel: "0.6B",
    downloadMb: 400, // matches model-download-service.ts's bytes: 400_000_000
    optional: false,
    ggufFile: "qwen3-embedding-0.6b-q8_0.gguf",
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
