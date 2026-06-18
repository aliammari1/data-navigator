/**
 * Central offline configuration for `@huggingface/transformers` (Transformers.js).
 *
 * THE OFFLINE SHIP-BLOCKER THIS FIXES
 * ----------------------------------
 * Transformers.js runs ONNX models through `onnxruntime-web`, which loads a set
 * of `.wasm` binaries at startup. By default those binaries — and any model
 * weights — are fetched from the Hugging Face / jsDelivr CDN. On a fresh,
 * genuinely-offline machine that means the entire AI layer is dead on first run.
 *
 * This module pins the runtime so it works with NO network at runtime:
 *  - `onnxruntime-web` `.wasm` binaries are served locally from `/public`
 *    (already bundled at `public/models/onnx-runtime/`), so the inference
 *    runtime itself never needs the network.
 *  - Locally-bundled / browser-cached model weights are preferred.
 *  - One-time remote model download stays available (opt-out) so a first online
 *    run can populate the IndexedDB cache, after which the app is fully offline.
 *
 * It is intentionally tiny and idempotent: call `configureTransformersEnv()`
 * before every pipeline load. Both the generative path
 * (`platform/ai/transformers-engine.ts`) and the embeddings path
 * (`platform/ai/embeddings.ts`) funnel through here so offline behaviour is
 * consistent and configured in exactly one place.
 */

import { env } from "@huggingface/transformers";

/**
 * Local URL path (served from `/public`) holding the `onnxruntime-web` `.wasm`
 * binaries. These are already committed under `public/models/onnx-runtime/`.
 */
export const LOCAL_ORT_WASM_PATH = "/models/onnx-runtime/";

/**
 * Local URL path (served from `/public`) for any pre-bundled Transformers.js
 * model weights (`<localModelPath>/<org>/<model>/…`). Absent today — lookups
 * fall through to the browser cache / one-time remote download — but wiring it
 * now lets a fully air-gapped install drop weights in without code changes.
 */
export const LOCAL_MODEL_PATH = "/models/transformers/";

/** localStorage flag gating one-time remote model download. */
const REMOTE_DOWNLOAD_FLAG = "ai.allowModelDownload";

export interface TransformersEnvOptions {
  /**
   * Allow a one-time remote model download (which is then cached for offline
   * use). When omitted, the persisted user preference is used (default: allow).
   */
  allowRemoteModels?: boolean;
}

/** Whether one-time remote model download is permitted (default: yes). */
export function isModelDownloadAllowed(): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(REMOTE_DOWNLOAD_FLAG) !== "false";
}

/**
 * Persist whether remote model download is allowed and apply it immediately.
 * Set to `false` for a strictly air-gapped install (weights must be bundled
 * under {@link LOCAL_MODEL_PATH} or already cached).
 */
export function setModelDownloadAllowed(allowed: boolean): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(REMOTE_DOWNLOAD_FLAG, allowed ? "true" : "false");
  }
  env.allowRemoteModels = allowed;
}

/**
 * Pin Transformers.js for offline, medium-end-PC operation. Idempotent — safe
 * (and cheap) to call before every model load.
 */
export function configureTransformersEnv(options: TransformersEnvOptions = {}): void {
  const allowRemote = options.allowRemoteModels ?? isModelDownloadAllowed();

  // Local model resolution + browser cache: always pinned, even when only the
  // remote-allow flag is being re-applied between loads.
  env.allowLocalModels = true;
  env.localModelPath = LOCAL_MODEL_PATH;
  env.useBrowserCache = true;

  // The critical fix: load the ORT runtime `.wasm` from local /public, not a CDN.
  const wasmBackend = env.backends?.onnx?.wasm;
  if (wasmBackend) {
    wasmBackend.wasmPaths = LOCAL_ORT_WASM_PATH;
  }

  env.allowRemoteModels = allowRemote;
}
