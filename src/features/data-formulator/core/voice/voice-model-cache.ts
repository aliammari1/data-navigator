/**
 * Voice Model Cache
 *
 * Best-effort cache/readiness tracking for browser voice assets and models.
 *
 * Responsibilities:
 * - Check required local assets such as VAD ONNX/worklet files.
 * - Track model readiness metadata in localStorage.
 * - Inspect Cache Storage when available for Hugging Face / browser-cached models.
 * - Compute an offline readiness score for the voice stack.
 *
 * This file has no React dependency.
 */

import {
  ALL_VOICE_MODELS,
  createModelCacheKey,
  getSttModel,
  getTtsModel,
  getVadModel,
  getVoiceReadinessScore,
  type SttEngine,
  type TtsEngine,
  type VadEngine,
  VOICE_OFFLINE_READINESS_ITEMS,
  VOICE_REGISTRY_DEFAULTS,
  type VoiceModelDefinition,
  type VoiceModelKind,
} from "./voice-model-registry";

export type VoiceCacheState = "unknown" | "checking" | "available" | "missing" | "error";

export type VoiceCacheSource =
  | "local-asset"
  | "cache-storage"
  | "local-storage"
  | "browser-cache"
  | "manual"
  | "remote"
  | "unknown";

export interface VoiceCachedAssetRecord {
  key: string;
  label: string;
  kind: VoiceModelKind;
  path: string;
  required: boolean;
  state: VoiceCacheState;
  ready: boolean;
  source: VoiceCacheSource;
  checkedAt: number;
  error?: string;
}

export interface VoiceCachedModelRecord {
  key: string;
  modelId: string;
  label: string;
  kind: VoiceModelKind;
  engine: string;
  source: VoiceCacheSource;
  state: VoiceCacheState;
  ready: boolean;
  checkedAt: number;
  sizeHintMb?: number;
  cacheName?: string;
  matchedRequestUrl?: string;
  error?: string;
}

export interface VoiceOfflineReadinessReport {
  score: number;
  ready: boolean;
  checkedAt: number;
  assets: VoiceCachedAssetRecord[];
  models: VoiceCachedModelRecord[];
  missingRequiredAssets: VoiceCachedAssetRecord[];
  missingRecommendedModels: VoiceCachedModelRecord[];
  summary: {
    requiredAssetsReady: number;
    requiredAssetsTotal: number;
    modelsReady: number;
    modelsTotal: number;
  };
}

export interface VoiceModelCacheSnapshot {
  version: number;
  updatedAt: number;
  selected: {
    vadEngine: VadEngine;
    sttEngine: SttEngine;
    ttsEngine: TtsEngine;
  };
  assets: Record<string, VoiceCachedAssetRecord>;
  models: Record<string, VoiceCachedModelRecord>;
}

export interface RefreshVoiceModelCacheOptions {
  vadEngine?: VadEngine;
  sttEngine?: SttEngine;
  ttsEngine?: TtsEngine;

  /**
   * If true, checks every registered model.
   * If false, checks only selected VAD/STT/TTS models.
   */
  includeAllModels?: boolean;

  /**
   * If true, checks remote/cache state for Hugging Face models by scanning
   * Cache Storage. This is best-effort and may be expensive with large caches.
   */
  inspectCacheStorage?: boolean;
}

const VOICE_MODEL_CACHE_VERSION = 1;
const VOICE_MODEL_CACHE_STORAGE_KEY = "moudir_voice_model_cache_v1";
const CACHE_INSPECTION_LIMIT = 2000;

function now(): number {
  return Date.now();
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function createEmptySnapshot(): VoiceModelCacheSnapshot {
  return {
    version: VOICE_MODEL_CACHE_VERSION,
    updatedAt: now(),
    selected: {
      vadEngine: VOICE_REGISTRY_DEFAULTS.vadEngine,
      sttEngine: VOICE_REGISTRY_DEFAULTS.sttEngine,
      ttsEngine: VOICE_REGISTRY_DEFAULTS.ttsEngine,
    },
    assets: {},
    models: {},
  };
}

export function loadVoiceModelCacheSnapshot(): VoiceModelCacheSnapshot {
  if (!isBrowser()) {
    return createEmptySnapshot();
  }

  const snapshot = safeJsonParse<VoiceModelCacheSnapshot>(
    window.localStorage.getItem(VOICE_MODEL_CACHE_STORAGE_KEY),
    createEmptySnapshot(),
  );

  if (snapshot.version !== VOICE_MODEL_CACHE_VERSION) {
    return createEmptySnapshot();
  }

  return {
    ...createEmptySnapshot(),
    ...snapshot,
    selected: {
      ...createEmptySnapshot().selected,
      ...(snapshot.selected ?? {}),
    },
    assets: snapshot.assets ?? {},
    models: snapshot.models ?? {},
  };
}

export function saveVoiceModelCacheSnapshot(
  snapshot: VoiceModelCacheSnapshot,
): VoiceModelCacheSnapshot {
  const next: VoiceModelCacheSnapshot = {
    ...snapshot,
    version: VOICE_MODEL_CACHE_VERSION,
    updatedAt: now(),
  };

  if (isBrowser()) {
    window.localStorage.setItem(VOICE_MODEL_CACHE_STORAGE_KEY, JSON.stringify(next));

    globalThis.window.dispatchEvent(
      new CustomEvent("moudir_voice_model_cache_changed", {
        detail: next,
      }),
    );
  }

  return next;
}

export function clearVoiceModelCacheSnapshot(): VoiceModelCacheSnapshot {
  const next = createEmptySnapshot();

  if (isBrowser()) {
    window.localStorage.removeItem(VOICE_MODEL_CACHE_STORAGE_KEY);

    globalThis.window.dispatchEvent(
      new CustomEvent("moudir_voice_model_cache_changed", {
        detail: next,
      }),
    );
  }

  return next;
}

export function markVoiceModelReady(
  model: VoiceModelDefinition,
  patch: Partial<VoiceCachedModelRecord> = {},
): VoiceCachedModelRecord {
  const snapshot = loadVoiceModelCacheSnapshot();
  const key = createModelCacheKey(model);

  const record: VoiceCachedModelRecord = {
    key,
    modelId: model.modelId ?? model.id,
    label: model.label,
    kind: model.kind,
    engine: String(model.engine),
    source: patch.source ?? "manual",
    state: patch.state ?? "available",
    ready: patch.ready ?? true,
    checkedAt: now(),
    sizeHintMb: model.sizeHintMb,
    cacheName: patch.cacheName,
    matchedRequestUrl: patch.matchedRequestUrl,
    error: patch.error,
  };

  snapshot.models[key] = record;
  saveVoiceModelCacheSnapshot(snapshot);

  return record;
}

export function markVoiceModelMissing(
  model: VoiceModelDefinition,
  error?: string,
): VoiceCachedModelRecord {
  const snapshot = loadVoiceModelCacheSnapshot();
  const key = createModelCacheKey(model);

  const record: VoiceCachedModelRecord = {
    key,
    modelId: model.modelId ?? model.id,
    label: model.label,
    kind: model.kind,
    engine: String(model.engine),
    source: "unknown",
    state: error ? "error" : "missing",
    ready: false,
    checkedAt: now(),
    sizeHintMb: model.sizeHintMb,
    error,
  };

  snapshot.models[key] = record;
  saveVoiceModelCacheSnapshot(snapshot);

  return record;
}

export function getCachedModelRecord(model: VoiceModelDefinition): VoiceCachedModelRecord | null {
  const snapshot = loadVoiceModelCacheSnapshot();
  return snapshot.models[createModelCacheKey(model)] ?? null;
}

/* ------------------------------------------------------------------ */
/*  Asset checks                                                       */
/* ------------------------------------------------------------------ */

async function checkAssetReachable(path: string): Promise<{ ready: boolean; error?: string }> {
  if (!isBrowser()) {
    return {
      ready: false,
      error: "Asset checks are only available in the browser.",
    };
  }

  try {
    /**
     * HEAD is ideal, but some dev servers or static hosts do not serve HEAD
     * correctly. Fallback to GET with no-store.
     */
    const headResponse = await fetch(path, {
      method: "HEAD",
      cache: "no-store",
    });

    if (headResponse.ok) {
      return { ready: true };
    }

    const getResponse = await fetch(path, {
      method: "GET",
      cache: "no-store",
    });

    if (getResponse.ok) {
      return { ready: true };
    }

    return {
      ready: false,
      error: `HTTP ${getResponse.status} for ${path}`,
    };
  } catch (error) {
    return {
      ready: false,
      error: toErrorMessage(error),
    };
  }
}

export async function checkVoiceAsset(item: {
  key: string;
  label: string;
  kind: VoiceModelKind;
  path: string;
  required: boolean;
}): Promise<VoiceCachedAssetRecord> {
  const checkedAt = now();
  const result = await checkAssetReachable(item.path);

  return {
    key: item.key,
    label: item.label,
    kind: item.kind,
    path: item.path,
    required: item.required,
    state: result.ready ? "available" : result.error ? "error" : "missing",
    ready: result.ready,
    source: "local-asset",
    checkedAt,
    error: result.error,
  };
}

export async function checkVoiceAssets(): Promise<VoiceCachedAssetRecord[]> {
  return Promise.all(VOICE_OFFLINE_READINESS_ITEMS.map(checkVoiceAsset));
}

/* ------------------------------------------------------------------ */
/*  Cache Storage inspection                                           */
/* ------------------------------------------------------------------ */

function createModelSearchNeedles(model: VoiceModelDefinition): string[] {
  const values = [
    model.modelId,
    model.modelId?.toLowerCase(),
    model.modelId?.replace("/", "%2F"),
    model.modelId?.toLowerCase().replace("/", "%2f"),
    model.engine,
    model.id,
  ].filter(Boolean) as string[];

  return Array.from(new Set(values.map((value) => value.toLowerCase())));
}

async function inspectCacheStorageForModel(
  model: VoiceModelDefinition,
): Promise<
  Pick<VoiceCachedModelRecord, "ready" | "source" | "cacheName" | "matchedRequestUrl" | "error">
> {
  if (!isBrowser()) {
    return {
      ready: false,
      source: "unknown",
      error: "Cache Storage inspection is only available in the browser.",
    };
  }

  if (!("caches" in window)) {
    return {
      ready: false,
      source: "unknown",
      error: "Cache Storage API is unavailable.",
    };
  }

  const needles = createModelSearchNeedles(model);

  if (needles.length === 0) {
    return {
      ready: false,
      source: "unknown",
      error: "Model does not have searchable cache metadata.",
    };
  }

  try {
    const cacheNames = await window.caches.keys();
    let inspected = 0;

    for (const cacheName of cacheNames) {
      const cache = await window.caches.open(cacheName);
      const requests = await cache.keys();

      for (const request of requests) {
        inspected += 1;

        if (inspected > CACHE_INSPECTION_LIMIT) {
          return {
            ready: false,
            source: "cache-storage",
            error: `Cache inspection stopped after ${CACHE_INSPECTION_LIMIT} requests.`,
          };
        }

        const url = request.url.toLowerCase();

        if (needles.some((needle) => url.includes(needle))) {
          return {
            ready: true,
            source: "cache-storage",
            cacheName,
            matchedRequestUrl: request.url,
          };
        }
      }
    }

    return {
      ready: false,
      source: "cache-storage",
    };
  } catch (error) {
    return {
      ready: false,
      source: "cache-storage",
      error: toErrorMessage(error),
    };
  }
}

export async function checkVoiceModelCache(
  model: VoiceModelDefinition,
  options: { inspectCacheStorage?: boolean } = {},
): Promise<VoiceCachedModelRecord> {
  const checkedAt = now();

  /**
   * Models without modelId and without local assets are logically ready only
   * if they are "off" or a no-op model.
   */
  if (model.engine === "off") {
    return {
      key: createModelCacheKey(model),
      modelId: model.modelId ?? model.id,
      label: model.label,
      kind: model.kind,
      engine: String(model.engine),
      source: "manual",
      state: "available",
      ready: true,
      checkedAt,
      sizeHintMb: model.sizeHintMb,
    };
  }

  if (model.source === "local-assets" && model.assets.length > 0) {
    const assetResults = await Promise.all(
      model.assets
        .filter((asset) => asset.required)
        .map((asset) =>
          checkAssetReachable(asset.publicPath).then((result) => ({
            asset,
            result,
          })),
        ),
    );

    const missing = assetResults.filter((item) => !item.result.ready);

    return {
      key: createModelCacheKey(model),
      modelId: model.modelId ?? model.id,
      label: model.label,
      kind: model.kind,
      engine: String(model.engine),
      source: "local-asset",
      state: missing.length === 0 ? "available" : "missing",
      ready: missing.length === 0,
      checkedAt,
      sizeHintMb: model.sizeHintMb,
      error:
        missing.length > 0
          ? missing
              .map((item) => `${item.asset.filename}: ${item.result.error ?? "not found"}`)
              .join("; ")
          : undefined,
    };
  }

  const existing = getCachedModelRecord(model);

  if (existing?.ready) {
    return {
      ...existing,
      source: existing.source ?? "local-storage",
      checkedAt,
    };
  }

  if (options.inspectCacheStorage) {
    const cacheResult = await inspectCacheStorageForModel(model);

    return {
      key: createModelCacheKey(model),
      modelId: model.modelId ?? model.id,
      label: model.label,
      kind: model.kind,
      engine: String(model.engine),
      source: cacheResult.source,
      state: cacheResult.ready ? "available" : cacheResult.error ? "error" : "missing",
      ready: cacheResult.ready,
      checkedAt,
      sizeHintMb: model.sizeHintMb,
      cacheName: cacheResult.cacheName,
      matchedRequestUrl: cacheResult.matchedRequestUrl,
      error: cacheResult.error,
    };
  }

  return {
    key: createModelCacheKey(model),
    modelId: model.modelId ?? model.id,
    label: model.label,
    kind: model.kind,
    engine: String(model.engine),
    source: "unknown",
    state: "unknown",
    ready: false,
    checkedAt,
    sizeHintMb: model.sizeHintMb,
  };
}

/* ------------------------------------------------------------------ */
/*  Refresh / report                                                   */
/* ------------------------------------------------------------------ */

function getSelectedModels(options: RefreshVoiceModelCacheOptions): VoiceModelDefinition[] {
  const vadEngine = options.vadEngine ?? VOICE_REGISTRY_DEFAULTS.vadEngine;
  const sttEngine = options.sttEngine ?? VOICE_REGISTRY_DEFAULTS.sttEngine;
  const ttsEngine = options.ttsEngine ?? VOICE_REGISTRY_DEFAULTS.ttsEngine;

  if (options.includeAllModels) {
    return [...ALL_VOICE_MODELS];
  }

  return [getVadModel(vadEngine), getSttModel(sttEngine), getTtsModel(ttsEngine)];
}

export async function refreshVoiceModelCache(
  options: RefreshVoiceModelCacheOptions = {},
): Promise<VoiceOfflineReadinessReport> {
  const selected = {
    vadEngine: options.vadEngine ?? VOICE_REGISTRY_DEFAULTS.vadEngine,
    sttEngine: options.sttEngine ?? VOICE_REGISTRY_DEFAULTS.sttEngine,
    ttsEngine: options.ttsEngine ?? VOICE_REGISTRY_DEFAULTS.ttsEngine,
  };

  const [assets, models] = await Promise.all([
    checkVoiceAssets(),
    Promise.all(
      getSelectedModels(options).map((model) =>
        checkVoiceModelCache(model, {
          inspectCacheStorage: options.inspectCacheStorage,
        }),
      ),
    ),
  ]);

  const snapshot: VoiceModelCacheSnapshot = {
    version: VOICE_MODEL_CACHE_VERSION,
    updatedAt: now(),
    selected,
    assets: Object.fromEntries(assets.map((asset) => [asset.key, asset])),
    models: Object.fromEntries(models.map((model) => [model.key, model])),
  };

  saveVoiceModelCacheSnapshot(snapshot);

  return createVoiceOfflineReadinessReport(snapshot);
}

export function createVoiceOfflineReadinessReport(
  snapshot = loadVoiceModelCacheSnapshot(),
): VoiceOfflineReadinessReport {
  const assets = Object.values(snapshot.assets);
  const models = Object.values(snapshot.models);

  const requiredAssets = assets.filter((asset) => asset.required);
  const missingRequiredAssets = requiredAssets.filter((asset) => !asset.ready);

  const missingRecommendedModels = models.filter((model) => !model.ready);

  const scoreItems = [
    ...assets.map((asset) => ({
      ready: asset.ready,
      required: asset.required,
    })),
    ...models.map((model) => ({
      ready: model.ready,
      required: model.kind !== "tts" || model.engine !== "off",
    })),
  ];

  const score = getVoiceReadinessScore(scoreItems);

  return {
    score,
    ready: missingRequiredAssets.length === 0,
    checkedAt: snapshot.updatedAt,
    assets,
    models,
    missingRequiredAssets,
    missingRecommendedModels,
    summary: {
      requiredAssetsReady: requiredAssets.filter((asset) => asset.ready).length,
      requiredAssetsTotal: requiredAssets.length,
      modelsReady: models.filter((model) => model.ready).length,
      modelsTotal: models.length,
    },
  };
}

export function getVoiceOfflineReadinessReport(): VoiceOfflineReadinessReport {
  return createVoiceOfflineReadinessReport(loadVoiceModelCacheSnapshot());
}

export function isVoiceStackReady(): boolean {
  return getVoiceOfflineReadinessReport().ready;
}

export function getMissingRequiredVoiceAssets(): VoiceCachedAssetRecord[] {
  return getVoiceOfflineReadinessReport().missingRequiredAssets;
}

/* ------------------------------------------------------------------ */
/*  Download helpers                                                   */
/* ------------------------------------------------------------------ */

export interface VoiceModelDownloadProgress {
  modelKey: string;
  label: string;
  loaded?: number;
  total?: number;
  progress?: number;
  status: "starting" | "downloading" | "cached" | "error";
  error?: string;
}

/**
 * Best-effort model warmup hook.
 *
 * Browser ML libraries usually own their own model download/cache logic.
 * This function records intent and lets the actual STT/TTS worker mark the model
 * ready after it successfully loads.
 */
export function markVoiceModelDownloadStarted(model: VoiceModelDefinition): VoiceCachedModelRecord {
  const snapshot = loadVoiceModelCacheSnapshot();
  const key = createModelCacheKey(model);

  const record: VoiceCachedModelRecord = {
    key,
    modelId: model.modelId ?? model.id,
    label: model.label,
    kind: model.kind,
    engine: String(model.engine),
    source: "remote",
    state: "checking",
    ready: false,
    checkedAt: now(),
    sizeHintMb: model.sizeHintMb,
  };

  snapshot.models[key] = record;
  saveVoiceModelCacheSnapshot(snapshot);

  return record;
}

/**
 * Call this from STT/TTS workers or the UI when a model successfully loads.
 */
export function markVoiceModelLoaded(
  model: VoiceModelDefinition,
  patch: Partial<VoiceCachedModelRecord> = {},
): VoiceCachedModelRecord {
  return markVoiceModelReady(model, {
    source: patch.source ?? "browser-cache",
    cacheName: patch.cacheName,
    matchedRequestUrl: patch.matchedRequestUrl,
  });
}

/**
 * Call this from STT/TTS workers or the UI when a model fails to load.
 */
export function markVoiceModelLoadFailed(
  model: VoiceModelDefinition,
  error: unknown,
): VoiceCachedModelRecord {
  return markVoiceModelMissing(model, toErrorMessage(error));
}

/* ------------------------------------------------------------------ */
/*  Convenience selectors                                              */
/* ------------------------------------------------------------------ */

export function getSelectedVoiceModelRecords(): {
  vad: VoiceCachedModelRecord | null;
  stt: VoiceCachedModelRecord | null;
  tts: VoiceCachedModelRecord | null;
} {
  const snapshot = loadVoiceModelCacheSnapshot();

  const vad = getVadModel(snapshot.selected.vadEngine);
  const stt = getSttModel(snapshot.selected.sttEngine);
  const tts = getTtsModel(snapshot.selected.ttsEngine);

  return {
    vad: snapshot.models[createModelCacheKey(vad)] ?? null,
    stt: snapshot.models[createModelCacheKey(stt)] ?? null,
    tts: snapshot.models[createModelCacheKey(tts)] ?? null,
  };
}

export function getVoiceModelCacheBadge(): {
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
  score: number;
} {
  const report = getVoiceOfflineReadinessReport();

  if (report.score >= 90 && report.ready) {
    return {
      label: "Voice offline ready",
      tone: "success",
      score: report.score,
    };
  }

  if (report.ready) {
    return {
      label: "Voice mostly ready",
      tone: "warning",
      score: report.score,
    };
  }

  if (report.missingRequiredAssets.length > 0) {
    return {
      label: "Voice assets missing",
      tone: "danger",
      score: report.score,
    };
  }

  return {
    label: "Voice readiness unknown",
    tone: "neutral",
    score: report.score,
  };
}
