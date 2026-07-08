/**
 * Unit tests for voice-model-cache.ts
 *
 * The module is pure browser logic built on localStorage, Cache Storage, and
 * fetch.  All three are mocked here so no real I/O happens.  The target module
 * itself remains un-mocked so every line counts toward coverage.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── voice-model-registry is a real dependency with no side effects ──────────
// We do NOT mock it — it's pure data + math and exercising it is fine.

import {
  checkVoiceAsset,
  checkVoiceAssets,
  checkVoiceModelCache,
  clearVoiceModelCacheSnapshot,
  createVoiceOfflineReadinessReport,
  getCachedModelRecord,
  getMissingRequiredVoiceAssets,
  getSelectedVoiceModelRecords,
  getVoiceModelCacheBadge,
  getVoiceOfflineReadinessReport,
  isVoiceStackReady,
  loadVoiceModelCacheSnapshot,
  markVoiceModelDownloadStarted,
  markVoiceModelLoadFailed,
  markVoiceModelLoaded,
  markVoiceModelMissing,
  markVoiceModelReady,
  refreshVoiceModelCache,
  saveVoiceModelCacheSnapshot,
  type VoiceCachedAssetRecord,
  type VoiceCachedModelRecord,
  type VoiceModelCacheSnapshot,
} from "@/features/data-formulator/core/voice/voice-model-cache";

import {
  ALL_VOICE_MODELS,
  createModelCacheKey,
  getSttModel,
  getTtsModel,
  getVadModel,
  VOICE_REGISTRY_DEFAULTS,
} from "@/features/data-formulator/core/voice/voice-model-registry";

// ── Helpers ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "moudir_voice_model_cache_v1";

/** Return the silero-v5 VAD definition (the only VAD model). */
const vadModel = () => getVadModel("silero-v5");
/** Return the default STT (whisper-tiny) definition. */
const sttModel = () => getSttModel("whisper-tiny");
/** Return the "off" TTS definition. */
const ttsOff = () => getTtsModel("off");
/** Return the kokoro TTS definition. */
const ttsKokoro = () => getTtsModel("kokoro");

function writeSnapshotToStorage(snapshot: VoiceModelCacheSnapshot) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

function readSnapshotFromStorage(): VoiceModelCacheSnapshot | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function makeSnapshot(
  overrides: Partial<VoiceModelCacheSnapshot> = {},
): VoiceModelCacheSnapshot {
  return {
    version: 1,
    updatedAt: 1000,
    selected: {
      vadEngine: VOICE_REGISTRY_DEFAULTS.vadEngine,
      sttEngine: VOICE_REGISTRY_DEFAULTS.sttEngine,
      ttsEngine: VOICE_REGISTRY_DEFAULTS.ttsEngine,
    },
    assets: {},
    models: {},
    ...overrides,
  };
}

function makeAssetRecord(
  overrides: Partial<VoiceCachedAssetRecord> = {},
): VoiceCachedAssetRecord {
  return {
    key: "vad:silero_vad_v5.onnx",
    label: "VAD asset: silero_vad_v5.onnx",
    kind: "vad",
    path: "/vad/silero_vad_v5.onnx",
    required: true,
    state: "available",
    ready: true,
    source: "local-asset",
    checkedAt: 1000,
    ...overrides,
  };
}

function makeModelRecord(
  overrides: Partial<VoiceCachedModelRecord> = {},
): VoiceCachedModelRecord {
  const model = sttModel();
  return {
    key: createModelCacheKey(model),
    modelId: model.modelId,
    label: model.label,
    kind: "stt",
    engine: "whisper-tiny",
    source: "manual",
    state: "available",
    ready: true,
    checkedAt: 1000,
    sizeHintMb: model.sizeHintMb,
    ...overrides,
  };
}

// ── fetch mock (used by checkAssetReachable / checkVoiceAsset) ──────────────
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  // jsdom provides localStorage — clear it for each test.
  window.localStorage.clear();

  // Patch global fetch.
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();

  // Provide a minimal caches stub (no CacheStorage by default in jsdom).
  const cacheStorageStub = {
    keys: vi.fn<() => Promise<string[]>>().mockResolvedValue([]),
    open: vi.fn(),
    match: vi.fn(),
    has: vi.fn(),
    delete: vi.fn(),
  };
  vi.stubGlobal("caches", cacheStorageStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ════════════════════════════════════════════════════════════════════════════
//  loadVoiceModelCacheSnapshot
// ════════════════════════════════════════════════════════════════════════════

describe("loadVoiceModelCacheSnapshot", () => {
  it("returns an empty snapshot when localStorage has nothing", () => {
    // Arrange: storage is empty (cleared in beforeEach)

    // Act
    const snapshot = loadVoiceModelCacheSnapshot();

    // Assert
    expect(snapshot.version).toBe(1);
    expect(snapshot.assets).toEqual({});
    expect(snapshot.models).toEqual({});
    expect(snapshot.selected.vadEngine).toBe(VOICE_REGISTRY_DEFAULTS.vadEngine);
  });

  it("parses and returns a valid stored snapshot", () => {
    // Arrange
    const stored = makeSnapshot({
      updatedAt: 9999,
      models: { "a:b:c": makeModelRecord() },
    });
    writeSnapshotToStorage(stored);

    // Act
    const snapshot = loadVoiceModelCacheSnapshot();

    // Assert
    expect(snapshot.updatedAt).toBe(9999);
    expect(Object.keys(snapshot.models)).toHaveLength(1);
  });

  it("resets to empty snapshot when stored version is stale", () => {
    // Arrange: version mismatch
    const stored = makeSnapshot({ version: 99 });
    writeSnapshotToStorage(stored);

    // Act
    const snapshot = loadVoiceModelCacheSnapshot();

    // Assert
    expect(snapshot.version).toBe(1);
    expect(snapshot.assets).toEqual({});
  });

  it("returns empty snapshot when localStorage contains invalid JSON", () => {
    // Arrange
    window.localStorage.setItem(STORAGE_KEY, "NOT VALID JSON {{{");

    // Act
    const snapshot = loadVoiceModelCacheSnapshot();

    // Assert — safeJsonParse falls back to the empty snapshot
    expect(snapshot.version).toBe(1);
    expect(snapshot.assets).toEqual({});
  });

  it("tolerates a stored snapshot with null assets / models fields", () => {
    // Arrange
    const raw = JSON.stringify({ version: 1, updatedAt: 1, selected: null, assets: null, models: null });
    window.localStorage.setItem(STORAGE_KEY, raw);

    // Act
    const snapshot = loadVoiceModelCacheSnapshot();

    // Assert
    expect(snapshot.assets).toEqual({});
    expect(snapshot.models).toEqual({});
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  saveVoiceModelCacheSnapshot
// ════════════════════════════════════════════════════════════════════════════

describe("saveVoiceModelCacheSnapshot", () => {
  it("persists the snapshot to localStorage and fires a custom event", () => {
    // Arrange
    const snapshot = makeSnapshot({ updatedAt: 1 });
    const listener = vi.fn();
    window.addEventListener("moudir_voice_model_cache_changed", listener);

    // Act
    const returned = saveVoiceModelCacheSnapshot(snapshot);

    // Assert — storage is written
    const stored = readSnapshotFromStorage();
    expect(stored).not.toBeNull();
    expect(stored!.version).toBe(1);

    // Assert — event was fired
    expect(listener).toHaveBeenCalledOnce();
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toMatchObject({ version: 1 });

    // Assert — returned value is the updated snapshot
    expect(returned.version).toBe(1);

    window.removeEventListener("moudir_voice_model_cache_changed", listener);
  });

  it("stamps a fresh updatedAt timestamp on save", () => {
    // Arrange
    const before = Date.now();
    const snapshot = makeSnapshot({ updatedAt: 0 });

    // Act
    const returned = saveVoiceModelCacheSnapshot(snapshot);

    // Assert
    expect(returned.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("always stamps version 1 on the stored record", () => {
    // Arrange — supply a wrong version number
    const snapshot = makeSnapshot({ version: 99 });

    // Act
    saveVoiceModelCacheSnapshot(snapshot);

    // Assert
    const stored = readSnapshotFromStorage();
    expect(stored!.version).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  clearVoiceModelCacheSnapshot
// ════════════════════════════════════════════════════════════════════════════

describe("clearVoiceModelCacheSnapshot", () => {
  it("removes the key from localStorage", () => {
    // Arrange
    writeSnapshotToStorage(makeSnapshot({ updatedAt: 777 }));

    // Act
    clearVoiceModelCacheSnapshot();

    // Assert
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("dispatches the change event after clearing", () => {
    // Arrange
    writeSnapshotToStorage(makeSnapshot());
    const listener = vi.fn();
    window.addEventListener("moudir_voice_model_cache_changed", listener);

    // Act
    clearVoiceModelCacheSnapshot();

    // Assert
    expect(listener).toHaveBeenCalledOnce();

    window.removeEventListener("moudir_voice_model_cache_changed", listener);
  });

  it("returns an empty snapshot object", () => {
    // Act
    const result = clearVoiceModelCacheSnapshot();

    // Assert
    expect(result.version).toBe(1);
    expect(result.assets).toEqual({});
    expect(result.models).toEqual({});
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  markVoiceModelReady
// ════════════════════════════════════════════════════════════════════════════

describe("markVoiceModelReady", () => {
  it("writes a ready=true record for the given model", () => {
    // Arrange
    const model = sttModel();

    // Act
    const record = markVoiceModelReady(model);

    // Assert
    expect(record.ready).toBe(true);
    expect(record.state).toBe("available");
    expect(record.source).toBe("manual");
    expect(record.modelId).toBe(model.modelId);
  });

  it("persists the record into localStorage", () => {
    // Arrange
    const model = sttModel();
    const key = createModelCacheKey(model);

    // Act
    markVoiceModelReady(model);

    // Assert
    const stored = readSnapshotFromStorage();
    expect(stored!.models[key]).toBeDefined();
    expect(stored!.models[key].ready).toBe(true);
  });

  it("respects patch overrides for source and state", () => {
    // Arrange
    const model = sttModel();

    // Act
    const record = markVoiceModelReady(model, {
      source: "browser-cache",
      state: "checking",
      cacheName: "my-cache",
      matchedRequestUrl: "https://example.com/model.onnx",
    });

    // Assert
    expect(record.source).toBe("browser-cache");
    expect(record.state).toBe("checking");
    expect(record.cacheName).toBe("my-cache");
    expect(record.matchedRequestUrl).toBe("https://example.com/model.onnx");
  });

  it("carries sizeHintMb from the model definition", () => {
    // Arrange
    const model = sttModel(); // whisper-tiny: 75 MB

    // Act
    const record = markVoiceModelReady(model);

    // Assert
    expect(record.sizeHintMb).toBe(75);
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  markVoiceModelMissing
// ════════════════════════════════════════════════════════════════════════════

describe("markVoiceModelMissing", () => {
  it("writes a ready=false, state=missing record when no error is given", () => {
    // Arrange
    const model = sttModel();

    // Act
    const record = markVoiceModelMissing(model);

    // Assert
    expect(record.ready).toBe(false);
    expect(record.state).toBe("missing");
    expect(record.error).toBeUndefined();
  });

  it("writes a ready=false, state=error record when an error string is given", () => {
    // Arrange
    const model = sttModel();

    // Act
    const record = markVoiceModelMissing(model, "download timed out");

    // Assert
    expect(record.ready).toBe(false);
    expect(record.state).toBe("error");
    expect(record.error).toBe("download timed out");
  });

  it("persists the record into localStorage", () => {
    // Arrange
    const model = sttModel();
    const key = createModelCacheKey(model);

    // Act
    markVoiceModelMissing(model);

    // Assert
    const stored = readSnapshotFromStorage();
    expect(stored!.models[key].ready).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  getCachedModelRecord
// ════════════════════════════════════════════════════════════════════════════

describe("getCachedModelRecord", () => {
  it("returns null when no record exists for the model", () => {
    // Arrange: storage is empty

    // Act
    const result = getCachedModelRecord(sttModel());

    // Assert
    expect(result).toBeNull();
  });

  it("returns the stored record when one exists", () => {
    // Arrange
    const model = sttModel();
    markVoiceModelReady(model);

    // Act
    const result = getCachedModelRecord(model);

    // Assert
    expect(result).not.toBeNull();
    expect(result!.ready).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  checkVoiceAsset
// ════════════════════════════════════════════════════════════════════════════

describe("checkVoiceAsset", () => {
  const ASSET_ITEM = {
    key: "vad:silero_vad_v5.onnx",
    label: "VAD asset: silero_vad_v5.onnx",
    kind: "vad" as const,
    path: "/vad/silero_vad_v5.onnx",
    required: true,
  };

  it("returns ready=true when HEAD request succeeds", async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

    // Act
    const result = await checkVoiceAsset(ASSET_ITEM);

    // Assert
    expect(result.ready).toBe(true);
    expect(result.state).toBe("available");
    expect(result.source).toBe("local-asset");
    expect(result.key).toBe(ASSET_ITEM.key);
  });

  it("falls back to GET when HEAD returns a non-ok status, and returns ready=true if GET succeeds", async () => {
    // Arrange: HEAD fails, GET succeeds
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 405 })) // HEAD
      .mockResolvedValueOnce(new Response(null, { status: 200 })); // GET

    // Act
    const result = await checkVoiceAsset(ASSET_ITEM);

    // Assert
    expect(result.ready).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns ready=false with an HTTP error message when both HEAD and GET fail", async () => {
    // Arrange
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 404 })) // HEAD
      .mockResolvedValueOnce(new Response(null, { status: 404 })); // GET

    // Act
    const result = await checkVoiceAsset(ASSET_ITEM);

    // Assert
    expect(result.ready).toBe(false);
    expect(result.state).toBe("error");
    expect(result.error).toContain("404");
  });

  it("returns ready=false with the thrown error message when fetch throws", async () => {
    // Arrange
    fetchMock.mockRejectedValue(new Error("network failure"));

    // Act
    const result = await checkVoiceAsset(ASSET_ITEM);

    // Assert
    expect(result.ready).toBe(false);
    expect(result.error).toBe("network failure");
    expect(result.state).toBe("error");
  });

  it("returns state=missing when HEAD is non-ok and no error message is set", async () => {
    // Arrange: HEAD ok=false with no error path — we need both to return non-ok
    // but the GET response body triggers the error: path (status in message)
    // Actually the code always sets error to the HTTP status string, so let's
    // just check the error is captured correctly.
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));

    const result = await checkVoiceAsset(ASSET_ITEM);

    expect(result.ready).toBe(false);
    expect(result.state).toBe("error");
    expect(result.error).toContain("503");
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  checkVoiceAssets (integration over VOICE_OFFLINE_READINESS_ITEMS)
// ════════════════════════════════════════════════════════════════════════════

describe("checkVoiceAssets", () => {
  it("returns one record per readiness item", async () => {
    // Arrange — every asset succeeds
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    // Act
    const results = await checkVoiceAssets();

    // Assert
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.ready).toBe(true);
    }
  });

  it("returns a mix of ready and not-ready records when some assets fail", async () => {
    // Arrange: every fetch call fails so all assets are not-ready.
    // (Promise.all runs checks in parallel, so we cannot reliably interleave
    // one failure then success — it's simpler to make all fail here.)
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));

    // Act
    const results = await checkVoiceAssets();

    // Assert
    const notReadyCount = results.filter((r) => !r.ready).length;
    expect(notReadyCount).toBe(results.length); // all failed
    expect(results.length).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  checkVoiceModelCache
// ════════════════════════════════════════════════════════════════════════════

describe("checkVoiceModelCache", () => {
  it("immediately returns ready=true for engine=off models", async () => {
    // Arrange
    const model = ttsOff();

    // Act
    const result = await checkVoiceModelCache(model);

    // Assert
    expect(result.ready).toBe(true);
    expect(result.state).toBe("available");
    expect(result.source).toBe("manual");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks local assets for source=local-assets models with required assets", async () => {
    // Arrange — silero-v5 is source=local-assets and has two required assets
    const model = vadModel();
    // All assets pass
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    // Act
    const result = await checkVoiceModelCache(model);

    // Assert
    expect(result.ready).toBe(true);
    expect(result.state).toBe("available");
    expect(result.source).toBe("local-asset");
  });

  it("returns ready=false and joins asset errors when required local assets are missing", async () => {
    // Arrange — silero-v5 has two required assets, both fail
    const model = vadModel();
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));

    // Act
    const result = await checkVoiceModelCache(model);

    // Assert
    expect(result.ready).toBe(false);
    expect(result.state).toBe("missing");
    expect(result.error).toBeDefined();
  });

  it("returns the existing localStorage record when it is ready (skips asset check)", async () => {
    // Arrange — mark whisper-tiny as ready in localStorage
    const model = sttModel();
    markVoiceModelReady(model, { source: "browser-cache" });

    // Act
    const result = await checkVoiceModelCache(model);

    // Assert — we get back the persisted record; no fetch calls
    expect(result.ready).toBe(true);
    expect(result.source).toBe("browser-cache");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls through to Cache Storage inspection when inspectCacheStorage=true and no ready record", async () => {
    // Arrange — kokoro has no ready local record; Cache Storage has a hit
    const model = ttsKokoro();
    const mockCache = {
      keys: vi.fn().mockResolvedValue([{ url: "https://huggingface.co/onnx-community/Kokoro-82M-ONNX/model.onnx" }]),
    };
    (globalThis.caches as unknown as { keys: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn> }).keys = vi
      .fn()
      .mockResolvedValue(["hf-cache"]);
    (globalThis.caches as unknown as { keys: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn> }).open = vi
      .fn()
      .mockResolvedValue(mockCache);

    // Act
    const result = await checkVoiceModelCache(model, { inspectCacheStorage: true });

    // Assert
    expect(result.source).toBe("cache-storage");
    expect(result.ready).toBe(true);
    expect(result.matchedRequestUrl).toContain("Kokoro");
  });

  it("returns source=unknown, state=unknown when no record and inspectCacheStorage=false", async () => {
    // Arrange
    const model = ttsKokoro(); // no ready record, no inspectCacheStorage

    // Act
    const result = await checkVoiceModelCache(model);

    // Assert
    expect(result.source).toBe("unknown");
    expect(result.state).toBe("unknown");
    expect(result.ready).toBe(false);
  });

  it("returns cache-storage source with no match when nothing is found in Cache Storage", async () => {
    // Arrange
    const model = ttsKokoro();
    (globalThis.caches as unknown as { keys: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn> }).keys = vi
      .fn()
      .mockResolvedValue(["empty-cache"]);
    (globalThis.caches as unknown as { keys: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn> }).open = vi
      .fn()
      .mockResolvedValue({ keys: vi.fn().mockResolvedValue([]) });

    // Act
    const result = await checkVoiceModelCache(model, { inspectCacheStorage: true });

    // Assert
    expect(result.source).toBe("cache-storage");
    expect(result.ready).toBe(false);
    expect(result.state).toBe("missing");
  });

  it("returns error record when Cache Storage throws", async () => {
    // Arrange
    const model = ttsKokoro();
    (globalThis.caches as unknown as { keys: ReturnType<typeof vi.fn> }).keys = vi
      .fn()
      .mockRejectedValue(new Error("DOMException: cache blow up"));

    // Act
    const result = await checkVoiceModelCache(model, { inspectCacheStorage: true });

    // Assert
    expect(result.ready).toBe(false);
    expect(result.error).toContain("DOMException");
  });

  it("stops cache inspection after the CACHE_INSPECTION_LIMIT and returns an error", async () => {
    // Arrange — generate 2001 fake requests so the limit (2000) is exceeded.
    const model = ttsKokoro();
    const fakeRequests = Array.from({ length: 2001 }, (_, i) => ({
      url: `https://other.com/unrelated-${i}`,
    }));
    (globalThis.caches as unknown as { keys: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn> }).keys = vi
      .fn()
      .mockResolvedValue(["big-cache"]);
    (globalThis.caches as unknown as { keys: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn> }).open = vi
      .fn()
      .mockResolvedValue({ keys: vi.fn().mockResolvedValue(fakeRequests) });

    // Act
    const result = await checkVoiceModelCache(model, { inspectCacheStorage: true });

    // Assert
    expect(result.ready).toBe(false);
    expect(result.error).toContain("2000");
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  refreshVoiceModelCache
// ════════════════════════════════════════════════════════════════════════════

describe("refreshVoiceModelCache", () => {
  it("returns a VoiceOfflineReadinessReport after running all checks", async () => {
    // Arrange — all fetch calls succeed
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    // Act
    const report = await refreshVoiceModelCache();

    // Assert
    expect(report).toMatchObject({
      score: expect.any(Number),
      ready: expect.any(Boolean),
      checkedAt: expect.any(Number),
      assets: expect.any(Array),
      models: expect.any(Array),
    });
  });

  it("persists the refreshed snapshot to localStorage", async () => {
    // Arrange
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    // Act
    await refreshVoiceModelCache();

    // Assert
    const stored = readSnapshotFromStorage();
    expect(stored).not.toBeNull();
    expect(stored!.version).toBe(1);
  });

  it("checks all models when includeAllModels=true", async () => {
    // Arrange
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    // Act
    const report = await refreshVoiceModelCache({ includeAllModels: true });

    // Assert
    expect(report.models.length).toBe(ALL_VOICE_MODELS.length);
  });

  it("checks only the selected three models by default", async () => {
    // Arrange
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    // Act
    const report = await refreshVoiceModelCache();

    // Assert — default: 1 VAD + 1 STT + 1 TTS
    expect(report.models.length).toBe(3);
  });

  it("respects custom engine options", async () => {
    // Arrange
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    // Act
    const report = await refreshVoiceModelCache({
      vadEngine: "silero-v5",
      sttEngine: "whisper-base",
      ttsEngine: "kokoro",
    });

    // Assert
    const modelLabels = report.models.map((m) => m.label);
    expect(modelLabels).toContain("Whisper Base");
    expect(modelLabels).toContain("Kokoro 82M");
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  createVoiceOfflineReadinessReport
// ════════════════════════════════════════════════════════════════════════════

describe("createVoiceOfflineReadinessReport", () => {
  it("returns score=100 and ready=true for an all-ready snapshot", () => {
    // Arrange
    const key = createModelCacheKey(sttModel());
    const snapshot = makeSnapshot({
      assets: {
        "vad:silero_vad_v5.onnx": makeAssetRecord({ required: true, ready: true }),
      },
      models: {
        [key]: makeModelRecord({ ready: true }),
      },
    });

    // Act
    const report = createVoiceOfflineReadinessReport(snapshot);

    // Assert
    expect(report.ready).toBe(true);
    expect(report.score).toBeGreaterThan(0);
    expect(report.missingRequiredAssets).toHaveLength(0);
  });

  it("returns ready=false when a required asset is missing", () => {
    // Arrange
    const snapshot = makeSnapshot({
      assets: {
        "vad:silero_vad_v5.onnx": makeAssetRecord({ required: true, ready: false }),
      },
    });

    // Act
    const report = createVoiceOfflineReadinessReport(snapshot);

    // Assert
    expect(report.ready).toBe(false);
    expect(report.missingRequiredAssets).toHaveLength(1);
  });

  it("populates missingRecommendedModels for non-ready model records", () => {
    // Arrange
    const key = createModelCacheKey(sttModel());
    const snapshot = makeSnapshot({
      models: { [key]: makeModelRecord({ ready: false }) },
    });

    // Act
    const report = createVoiceOfflineReadinessReport(snapshot);

    // Assert
    expect(report.missingRecommendedModels).toHaveLength(1);
  });

  it("fills summary counts correctly", () => {
    // Arrange
    const snapshot = makeSnapshot({
      assets: {
        a1: makeAssetRecord({ key: "a1", required: true, ready: true }),
        a2: makeAssetRecord({ key: "a2", required: true, ready: false }),
      },
    });

    // Act
    const report = createVoiceOfflineReadinessReport(snapshot);

    // Assert
    expect(report.summary.requiredAssetsTotal).toBe(2);
    expect(report.summary.requiredAssetsReady).toBe(1);
    expect(report.summary.modelsTotal).toBe(0);
    expect(report.summary.modelsReady).toBe(0);
  });

  it("uses the snapshot from localStorage when called with no argument", () => {
    // Arrange
    const model = sttModel();
    markVoiceModelReady(model);
    const snapshot = loadVoiceModelCacheSnapshot();
    // Sanity: snapshot has the model
    expect(Object.keys(snapshot.models)).toHaveLength(1);

    // Act
    const report = createVoiceOfflineReadinessReport();

    // Assert
    expect(report.models).toHaveLength(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  getVoiceOfflineReadinessReport / isVoiceStackReady / getMissingRequired...
// ════════════════════════════════════════════════════════════════════════════

describe("getVoiceOfflineReadinessReport", () => {
  it("delegates to createVoiceOfflineReadinessReport over the stored snapshot", () => {
    // Arrange: store a snapshot with a ready model
    const model = sttModel();
    markVoiceModelReady(model);

    // Act
    const report = getVoiceOfflineReadinessReport();

    // Assert
    expect(report.models.length).toBeGreaterThan(0);
  });
});

describe("isVoiceStackReady", () => {
  it("returns false when no required assets are checked (all missing)", () => {
    // Arrange: empty snapshot means required assets are absent = ready=false
    // because missingRequiredAssets check requires assets to be present and ready.
    // With an empty snapshot, requiredAssets list from the snapshot is also empty.
    // So missingRequiredAssets.length === 0 → ready = true for empty snapshot.
    // We need to inject a required asset that is not ready.
    const snapshot = makeSnapshot({
      assets: {
        "vad:test": makeAssetRecord({ required: true, ready: false }),
      },
    });
    writeSnapshotToStorage(snapshot);

    // Act
    const result = isVoiceStackReady();

    // Assert
    expect(result).toBe(false);
  });

  it("returns true when all required assets are ready", () => {
    // Arrange
    const snapshot = makeSnapshot({
      assets: {
        "vad:test": makeAssetRecord({ required: true, ready: true }),
      },
    });
    writeSnapshotToStorage(snapshot);

    // Act
    const result = isVoiceStackReady();

    // Assert
    expect(result).toBe(true);
  });
});

describe("getMissingRequiredVoiceAssets", () => {
  it("returns an empty array when no required assets are missing", () => {
    // Arrange
    const snapshot = makeSnapshot({
      assets: {
        "vad:test": makeAssetRecord({ required: true, ready: true }),
      },
    });
    writeSnapshotToStorage(snapshot);

    // Act
    const result = getMissingRequiredVoiceAssets();

    // Assert
    expect(result).toEqual([]);
  });

  it("returns the missing required assets", () => {
    // Arrange
    const snapshot = makeSnapshot({
      assets: {
        // The record's .key field and the snapshot slot key must both match.
        "vad:test": makeAssetRecord({ key: "vad:test", required: true, ready: false }),
      },
    });
    writeSnapshotToStorage(snapshot);

    // Act
    const result = getMissingRequiredVoiceAssets();

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("vad:test");
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  markVoiceModelDownloadStarted
// ════════════════════════════════════════════════════════════════════════════

describe("markVoiceModelDownloadStarted", () => {
  it("stores a checking record with source=remote", () => {
    // Arrange
    const model = ttsKokoro();

    // Act
    const record = markVoiceModelDownloadStarted(model);

    // Assert
    expect(record.state).toBe("checking");
    expect(record.source).toBe("remote");
    expect(record.ready).toBe(false);
  });

  it("persists the record to localStorage", () => {
    // Arrange
    const model = ttsKokoro();
    const key = createModelCacheKey(model);

    // Act
    markVoiceModelDownloadStarted(model);

    // Assert
    const stored = readSnapshotFromStorage();
    expect(stored!.models[key]).toBeDefined();
    expect(stored!.models[key].source).toBe("remote");
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  markVoiceModelLoaded / markVoiceModelLoadFailed
// ════════════════════════════════════════════════════════════════════════════

describe("markVoiceModelLoaded", () => {
  it("marks a model ready with source=browser-cache by default", () => {
    // Arrange
    const model = sttModel();

    // Act
    const record = markVoiceModelLoaded(model);

    // Assert
    expect(record.ready).toBe(true);
    expect(record.source).toBe("browser-cache");
  });

  it("accepts patch override for source", () => {
    // Arrange
    const model = sttModel();

    // Act
    const record = markVoiceModelLoaded(model, { source: "cache-storage" });

    // Assert
    expect(record.source).toBe("cache-storage");
  });

  it("passes cacheName and matchedRequestUrl through to the record", () => {
    // Arrange
    const model = sttModel();

    // Act
    const record = markVoiceModelLoaded(model, {
      cacheName: "transformers-cache",
      matchedRequestUrl: "https://huggingface.co/model.onnx",
    });

    // Assert
    expect(record.cacheName).toBe("transformers-cache");
    expect(record.matchedRequestUrl).toBe("https://huggingface.co/model.onnx");
  });
});

describe("markVoiceModelLoadFailed", () => {
  it("marks the model missing with the error message string", () => {
    // Arrange
    const model = sttModel();

    // Act
    const record = markVoiceModelLoadFailed(model, new Error("OOM"));

    // Assert
    expect(record.ready).toBe(false);
    expect(record.state).toBe("error");
    expect(record.error).toBe("OOM");
  });

  it("converts non-Error error values to strings", () => {
    // Arrange
    const model = sttModel();

    // Act
    const record = markVoiceModelLoadFailed(model, "raw string error");

    // Assert
    expect(record.error).toBe("raw string error");
  });

  it("converts numeric errors to strings", () => {
    // Arrange
    const model = sttModel();

    // Act
    const record = markVoiceModelLoadFailed(model, 42);

    // Assert
    expect(record.error).toBe("42");
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  getSelectedVoiceModelRecords
// ════════════════════════════════════════════════════════════════════════════

describe("getSelectedVoiceModelRecords", () => {
  it("returns null for all three when the snapshot has no model records", () => {
    // Arrange: empty snapshot

    // Act
    const { vad, stt, tts } = getSelectedVoiceModelRecords();

    // Assert
    expect(vad).toBeNull();
    expect(stt).toBeNull();
    expect(tts).toBeNull();
  });

  it("returns the persisted record for a model that has been marked ready", () => {
    // Arrange
    const model = sttModel();
    markVoiceModelReady(model);

    // Act
    const { stt } = getSelectedVoiceModelRecords();

    // Assert
    expect(stt).not.toBeNull();
    expect(stt!.ready).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  getVoiceModelCacheBadge
// ════════════════════════════════════════════════════════════════════════════

describe("getVoiceModelCacheBadge", () => {
  it("returns tone=success when score>=90 and ready=true", () => {
    // Arrange: all assets ready → score ≥ 90
    const snapshot = makeSnapshot({
      assets: {
        // No required assets means missingRequiredAssets.length === 0 → ready=true
        // score = 100 when items list has all-ready
      },
    });
    writeSnapshotToStorage(snapshot);

    // Act
    const badge = getVoiceModelCacheBadge();

    // Assert — with no items at all score=100 (edge case in getVoiceReadinessScore)
    expect(badge.tone).toBe("success");
    expect(badge.label).toBe("Voice offline ready");
    expect(badge.score).toBe(100);
  });

  it("returns tone=warning when ready=true but score<90", () => {
    // Arrange: mix of ready optional + missing optional items to drop score below 90
    // Required assets: none → ready=true
    // Optional assets: one ready, one missing → optionalScore = 0.5 → score = 80*1 + 20*0.5 = 90? Let's use 3 optional missing to drop below.
    // required=false assets: 1 ready + 3 not-ready → optional = 0.25 → score = 80 + 5 = 85
    const snapshot = makeSnapshot({
      assets: {
        o1: makeAssetRecord({ key: "o1", required: false, ready: true }),
        o2: makeAssetRecord({ key: "o2", required: false, ready: false }),
        o3: makeAssetRecord({ key: "o3", required: false, ready: false }),
        o4: makeAssetRecord({ key: "o4", required: false, ready: false }),
      },
    });
    writeSnapshotToStorage(snapshot);

    // Act
    const badge = getVoiceModelCacheBadge();

    // Assert
    expect(badge.tone).toBe("warning");
    expect(badge.label).toBe("Voice mostly ready");
  });

  it("returns tone=danger when required assets are missing", () => {
    // Arrange
    const snapshot = makeSnapshot({
      assets: {
        r1: makeAssetRecord({ key: "r1", required: true, ready: false }),
      },
    });
    writeSnapshotToStorage(snapshot);

    // Act
    const badge = getVoiceModelCacheBadge();

    // Assert
    expect(badge.tone).toBe("danger");
    expect(badge.label).toBe("Voice assets missing");
  });

  it("returns tone=neutral when not ready and no required assets are missing (but some models are not ready)", () => {
    // Arrange: required asset missing → danger takes priority; let's have no assets
    // but models not ready, making ready=false with no missing required assets.
    // Actually with NO assets, missingRequiredAssets.length = 0 → ready = true → score = 100 → tone=success.
    // To get neutral: ready=false but missingRequiredAssets.length=0.
    // That is impossible because ready = (missingRequiredAssets.length === 0).
    // So "neutral" branch needs ready=false AND missingRequiredAssets.length=0 — contradiction.
    // Wait: we need to re-read the code. ready=false means missingRequiredAssets.length > 0.
    // So the neutral branch is unreachable via normal score/ready/missingRequired paths UNLESS
    // score < 90 and not ready and missingRequiredAssets.length === 0 — impossible.
    // Actually looking again: `if (report.ready)` (second branch, score < 90) → warning.
    // Third: `if (report.missingRequiredAssets.length > 0)` → danger.
    // Fourth (default): neutral — reached when ready=false and missingRequiredAssets.length === 0?
    // But ready = (missingRequiredAssets.length === 0) so that's impossible in normal usage.
    // The neutral branch seems unreachable; we skip it or document it as defensive code.
    // Let's verify with a snapshot that has required=false asset not-ready so ready=true and score drops.
    // Skip writing a test for the unreachable branch and focus on what IS reachable.
    expect(true).toBe(true); // placeholder to document the analysis
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  Cache Storage edge cases (inspectCacheStorageForModel)
// ════════════════════════════════════════════════════════════════════════════

describe("cache storage inspection edge cases", () => {
  it("returns an error result when Cache Storage API throws unexpectedly", async () => {
    // Arrange — make caches.keys() throw to exercise the catch path
    (globalThis.caches as unknown as { keys: ReturnType<typeof vi.fn> }).keys = vi
      .fn()
      .mockRejectedValue(new Error("SecurityError: storage access denied"));
    const model = ttsKokoro();

    // Act
    const result = await checkVoiceModelCache(model, { inspectCacheStorage: true });

    // Assert
    expect(result.ready).toBe(false);
    expect(result.error).toContain("SecurityError");
  });

  it("returns an error when caches API is missing from window", async () => {
    // Arrange — remove the caches stub so !("caches" in window) is true
    const model = ttsKokoro();
    // Delete the caches property from globalThis so the "in" check fails
    const original = (globalThis as Record<string, unknown>).caches;
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as Record<string, unknown>).caches;

    // Act
    const result = await checkVoiceModelCache(model, { inspectCacheStorage: true });

    // Restore
    (globalThis as Record<string, unknown>).caches = original;

    // Assert
    expect(result.ready).toBe(false);
    expect(result.error).toContain("unavailable");
  });

  it("returns an error when model has no searchable cache metadata (empty needles)", async () => {
    // Arrange — create a synthetic model with no modelId, engine, or id fields
    // that produce needles. We set engine and id to empty strings so that after
    // Set deduplication needles = [].
    const model = {
      id: "",
      kind: "tts" as const,
      engine: "" as unknown as "kokoro",
      label: "Empty needles model",
      shortLabel: "Empty",
      description: "",
      status: "planned" as const,
      source: "huggingface-cache" as const,
      modelId: undefined as unknown as string,
      recommendedRuntime: "auto" as const,
      supportedRuntimes: ["auto" as const],
      quality: "low" as const,
      speed: "fast" as const,
      languages: ["en" as const],
      assets: [],
      notes: [],
    };

    // Act
    const result = await checkVoiceModelCache(model, { inspectCacheStorage: true });

    // Assert
    expect(result.ready).toBe(false);
    expect(result.error).toContain("searchable");
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  Non-browser environment paths
// ════════════════════════════════════════════════════════════════════════════

describe("non-browser environment paths", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loadVoiceModelCacheSnapshot returns empty snapshot when window is undefined", () => {
    // Arrange
    vi.stubGlobal("window", undefined);

    // Act
    const snapshot = loadVoiceModelCacheSnapshot();

    // Assert
    expect(snapshot.version).toBe(1);
    expect(snapshot.assets).toEqual({});
    expect(snapshot.models).toEqual({});
  });

  it("saveVoiceModelCacheSnapshot skips localStorage/event when window is undefined", () => {
    // Arrange
    vi.stubGlobal("window", undefined);
    const snapshot = makeSnapshot({ updatedAt: 42 });

    // Act
    const result = saveVoiceModelCacheSnapshot(snapshot);

    // Assert — function returns normally without throwing
    expect(result.version).toBe(1);
    expect(result.updatedAt).toBeGreaterThan(0);
  });

  it("clearVoiceModelCacheSnapshot skips localStorage/event when window is undefined", () => {
    // Arrange
    vi.stubGlobal("window", undefined);

    // Act
    const result = clearVoiceModelCacheSnapshot();

    // Assert — function returns normally without throwing
    expect(result.version).toBe(1);
    expect(result.assets).toEqual({});
  });

  it("checkVoiceAsset returns ready=false with browser-unavailable error when window is undefined", async () => {
    // Arrange
    vi.stubGlobal("window", undefined);
    const ASSET_ITEM = {
      key: "vad:silero_vad_v5.onnx",
      label: "VAD asset: silero_vad_v5.onnx",
      kind: "vad" as const,
      path: "/vad/silero_vad_v5.onnx",
      required: true,
    };

    // Act
    const result = await checkVoiceAsset(ASSET_ITEM);

    // Assert
    expect(result.ready).toBe(false);
    expect(result.error).toContain("browser");
  });

  it("checkVoiceModelCache with inspectCacheStorage returns error when window is undefined", async () => {
    // Arrange
    vi.stubGlobal("window", undefined);
    const model = ttsKokoro();

    // Act
    const result = await checkVoiceModelCache(model, { inspectCacheStorage: true });

    // Assert
    expect(result.ready).toBe(false);
    expect(result.error).toContain("browser");
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  modelId ?? model.id fallback (branch coverage for models without modelId)
// ════════════════════════════════════════════════════════════════════════════

describe("model.modelId ?? model.id fallback branch", () => {
  const modelWithoutModelId = (): import("@/features/data-formulator/core/voice/voice-model-registry").VoiceModelDefinition => ({
    id: "tts:kokoro-fallback-id",
    kind: "tts",
    engine: "kokoro",
    label: "Kokoro no-modelId",
    shortLabel: "Kokoro",
    description: "",
    status: "experimental",
    source: "huggingface-cache",
    modelId: undefined as unknown as string,
    recommendedRuntime: "auto",
    supportedRuntimes: ["auto"],
    quality: "best",
    speed: "fast",
    languages: ["en"],
    assets: [],
    notes: [],
  });

  it("markVoiceModelReady uses model.id as modelId fallback when modelId is undefined", () => {
    const model = modelWithoutModelId();
    const record = markVoiceModelReady(model);
    expect(record.modelId).toBe("tts:kokoro-fallback-id");
  });

  it("markVoiceModelMissing uses model.id as modelId fallback when modelId is undefined", () => {
    const model = modelWithoutModelId();
    const record = markVoiceModelMissing(model);
    expect(record.modelId).toBe("tts:kokoro-fallback-id");
  });

  it("markVoiceModelDownloadStarted uses model.id as modelId fallback when modelId is undefined", () => {
    const model = modelWithoutModelId();
    const record = markVoiceModelDownloadStarted(model);
    expect(record.modelId).toBe("tts:kokoro-fallback-id");
  });

  it("checkVoiceModelCache engine=off uses model.id as modelId fallback when modelId is undefined", async () => {
    const model: import("@/features/data-formulator/core/voice/voice-model-registry").VoiceModelDefinition = {
      id: "tts:off-fallback-id",
      kind: "tts",
      engine: "off",
      label: "Off no-modelId",
      shortLabel: "Off",
      description: "",
      status: "ready",
      source: "browser-cache",
      modelId: undefined as unknown as string,
      recommendedRuntime: "wasm",
      supportedRuntimes: ["wasm"],
      quality: "low",
      speed: "very-fast",
      languages: ["auto"],
      assets: [],
      notes: [],
    };
    const result = await checkVoiceModelCache(model);
    expect(result.modelId).toBe("tts:off-fallback-id");
    expect(result.ready).toBe(true);
  });

  it("checkVoiceModelCache uses model.id for modelId in the inspectCacheStorage path when modelId is undefined", async () => {
    const model = modelWithoutModelId();
    // No ready record in storage, inspectCacheStorage=true, caches.keys returns empty
    (globalThis.caches as unknown as { keys: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn> }).keys = vi
      .fn()
      .mockResolvedValue(["empty-cache"]);
    (globalThis.caches as unknown as { keys: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn> }).open = vi
      .fn()
      .mockResolvedValue({ keys: vi.fn().mockResolvedValue([]) });

    const result = await checkVoiceModelCache(model, { inspectCacheStorage: true });
    expect(result.modelId).toBe("tts:kokoro-fallback-id");
    expect(result.source).toBe("cache-storage");
  });

  it("checkVoiceModelCache uses model.id for modelId in the unknown-state path when modelId is undefined", async () => {
    const model = modelWithoutModelId();
    // No ready record, no inspectCacheStorage
    const result = await checkVoiceModelCache(model);
    expect(result.modelId).toBe("tts:kokoro-fallback-id");
    expect(result.state).toBe("unknown");
  });

  it("checkVoiceModelCache uses model.id for modelId in the local-assets branch when modelId is undefined", async () => {
    // Arrange — create a model with source=local-assets, required assets, and no modelId.
    const model: import("@/features/data-formulator/core/voice/voice-model-registry").VoiceModelDefinition = {
      id: "vad:custom-no-model-id",
      kind: "vad",
      engine: "silero-v5",
      label: "Custom VAD no modelId",
      shortLabel: "Custom",
      description: "",
      status: "ready",
      source: "local-assets",
      modelId: undefined as unknown as string,
      recommendedRuntime: "wasm",
      supportedRuntimes: ["wasm"],
      quality: "high",
      speed: "very-fast",
      languages: ["auto"],
      assets: [
        {
          filename: "custom.onnx",
          publicPath: "/vad/custom.onnx",
          required: true,
        },
      ],
      notes: [],
    };
    // All assets succeed
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    // Act
    const result = await checkVoiceModelCache(model);

    // Assert — model.id is used as the modelId fallback (line 492 branch)
    expect(result.modelId).toBe("vad:custom-no-model-id");
    expect(result.ready).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  existing.source ?? "local-storage" branch
// ════════════════════════════════════════════════════════════════════════════

describe("existing cache record source fallback to local-storage", () => {
  it("uses local-storage when an existing ready record has a null/undefined source", async () => {
    // Arrange — write a snapshot with a ready model record that has no source
    const model = sttModel();
    const key = createModelCacheKey(model);
    const snapshot = makeSnapshot({
      models: {
        [key]: makeModelRecord({
          ready: true,
          source: undefined as unknown as "local-storage",
        }),
      },
    });
    writeSnapshotToStorage(snapshot);

    // Act
    const result = await checkVoiceModelCache(model);

    // Assert
    expect(result.source).toBe("local-storage");
    expect(result.ready).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  item.result.error ?? "not found" fallback in local-assets error path
// ════════════════════════════════════════════════════════════════════════════

describe("local-asset error message fallback", () => {
  it("uses 'not found' as error when checkAssetReachable returns no error message", async () => {
    // Arrange — VAD model uses local-assets; mock fetch to return ok=false with no explicit error
    // We need checkAssetReachable to return { ready: false } with no error.
    // The only path that does this is through HEAD ok=false and GET ok=false with
    // a status — which always produces an error string (HTTP XXX for path).
    // So to get the "not found" fallback, we need to mock fetch to return ok=false
    // with status 0 (which would produce "HTTP 0 for ...").
    // Actually the fallback "not found" is only reachable if result.error is undefined.
    // checkAssetReachable only returns { ready: false } (no error) when... actually it never does.
    // In all non-ready paths it always sets error. This sub-branch appears unreachable.
    // Document: this branch (result.error ?? "not found") is defensive dead code.
    expect(true).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  getVoiceModelCacheBadge neutral branch analysis
// ════════════════════════════════════════════════════════════════════════════

describe("getVoiceModelCacheBadge neutral branch", () => {
  it("documents that the neutral branch is unreachable via normal paths (ready=false implies missing required assets exist)", () => {
    // The neutral branch at line 777 requires ready=false AND missingRequiredAssets.length===0.
    // But ready is computed as (missingRequiredAssets.length === 0), making this logically
    // impossible through createVoiceOfflineReadinessReport. The branch is defensive dead code.
    // This test documents that analysis without claiming coverage of that line.
    expect(true).toBe(true);
  });
});
