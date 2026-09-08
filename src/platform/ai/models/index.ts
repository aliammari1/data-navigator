/**
 * Offline model registry + preflight.
 *
 * Public surface — import from "@/platform/ai/models":
 *   import { MODEL_MANIFEST, DEFAULT_GGUF_MODEL } from "@/platform/ai/models";
 *   import { useModelStatus, ensureModelsReady } from "@/platform/ai/models";
 */

export {
  DEFAULT_GGUF_MODEL,
  EMBED_MODEL_ID,
  manifestByKey,
  MODEL_MANIFEST,
  type ModelLane,
  type ModelManifestEntry,
  type ModelPresenceKind,
  primaryForLane,
} from "./model-manifest";
export {
  type DownloadState,
  ensureModelsReady,
  isPrimaryLlmReady,
  type ModelReadiness,
  type ModelPresenceState,
  type ModelStatusRecord,
  type UseModelStatus,
  useModelStatus,
} from "./use-model-status";
