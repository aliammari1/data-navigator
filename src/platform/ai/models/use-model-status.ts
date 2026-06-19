"use client";

/**
 * Offline-model preflight + download state (renderer side).
 *
 * Answers, for the Setup UI and any AI feature: "are the model weights present,
 * and if not, can I download them while online?" It unifies the two acquisition
 * lanes behind one status surface:
 *
 *   - GGUF instruct (Electron node-llama-cpp): presence via
 *     `window.electronLlama.listModels()` (which stats `<userData>/models/llm`),
 *     download via `window.electronModels.download(...)` with progress events.
 *   - all-MiniLM ONNX (transformers.js embeddings worker): presence via a HEAD
 *     probe of the public `/models/transformers/...` asset plus an OPFS / Cache
 *     Storage check (populated by a first online run). There is no main-process
 *     downloader for this lane — the transformers.js worker fetches + caches it
 *     itself on first use; we surface that as "browser-cache" readiness.
 *
 * Exports:
 *   - useModelStatus()      — reactive presence + download progress for the UI.
 *   - ensureModelsReady()   — imperative guard AI features call before generating.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { isElectron } from "@/platform/electron/electron-fs";
import {
  type ModelLane,
  type ModelManifestEntry,
  MODEL_MANIFEST,
  primaryForLane,
  transformersAssetUrl,
} from "./model-manifest";

// ─── Presence probing ──────────────────────────────────────────────────────────

export type ModelPresenceState = "present" | "missing" | "unknown";

export interface ModelStatusRecord {
  key: string;
  lane: ModelLane;
  label: string;
  family: string;
  sizeLabel: string;
  downloadMb: number;
  optional: boolean;
  state: ModelPresenceState;
  /** Bytes on disk (GGUF) when known. */
  sizeBytes?: number;
  /** Where the presence signal came from (for UI copy / debugging). */
  source: "userData" | "public-asset" | "browser-cache" | "none";
  /** True only for the GGUF lane in Electron — drives the Download button. */
  downloadable: boolean;
}

function bridgeLlama() {
  if (typeof window === "undefined") return null;
  return (window as Window & { electronLlama?: Window["electronLlama"] }).electronLlama ?? null;
}

function bridgeModels() {
  if (typeof window === "undefined") return null;
  return (window as Window & { electronModels?: Window["electronModels"] }).electronModels ?? null;
}

/** Probe a transformers.js asset: present if the public file 200s OR it's cached. */
async function probeTransformersAsset(entry: ModelManifestEntry): Promise<{
  state: ModelPresenceState;
  source: ModelStatusRecord["source"];
}> {
  if (typeof window === "undefined") return { state: "unknown", source: "none" };

  // 1. Pre-bundled under /public (strict air-gap install). HEAD avoids the body.
  try {
    const url = transformersAssetUrl(entry);
    const res = await fetch(url, { method: "HEAD" });
    if (res.ok) return { state: "present", source: "public-asset" };
  } catch {
    // ignore — fall through to cache probes
  }

  // 2. Browser cache populated by a first online transformers.js run (Cache
  // Storage keyed on the HF URL) — the worker is then offline-capable.
  try {
    if ("caches" in window) {
      const names = await caches.keys();
      for (const name of names) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        if (
          keys.some(
            (req) => req.url.includes("all-MiniLM-L6-v2") && req.url.includes("model_quantized"),
          )
        ) {
          return { state: "present", source: "browser-cache" };
        }
      }
    }
  } catch {
    // ignore
  }

  // 3. OPFS (some transformers.js builds persist weights to the Origin Private
  // File System). Best-effort directory walk for the model dir.
  try {
    const root = await navigator.storage?.getDirectory?.();
    if (root) {
      // transformers.js OPFS layout mirrors the model id path.
      const models = await root.getDirectoryHandle("models").catch(() => null);
      if (models) {
        const xenova = await models.getDirectoryHandle("Xenova").catch(() => null);
        const dir = await xenova?.getDirectoryHandle("all-MiniLM-L6-v2").catch(() => null);
        if (dir) return { state: "present", source: "browser-cache" };
      }
    }
  } catch {
    // ignore
  }

  return { state: "missing", source: "none" };
}

/** Probe the GGUF lane via the Electron bridges. */
async function probeGguf(entry: ModelManifestEntry): Promise<{
  state: ModelPresenceState;
  source: ModelStatusRecord["source"];
  sizeBytes?: number;
}> {
  const models = bridgeModels();
  if (models) {
    try {
      const presence = await models.listPresence();
      const match = presence.find((p) => p.key === entry.key || p.file === entry.ggufFile);
      if (match) {
        return {
          state: match.present ? "present" : "missing",
          source: "userData",
          sizeBytes: match.sizeBytes,
        };
      }
    } catch {
      // fall through to llama bridge
    }
  }

  const llama = bridgeLlama();
  if (llama) {
    try {
      const list = await llama.listModels();
      const match = list.find((m) => m.id === entry.ggufFile);
      if (match) {
        return { state: match.present ? "present" : "missing", source: "userData" };
      }
    } catch {
      // ignore
    }
  }

  return { state: "unknown", source: "none" };
}

async function probeEntry(entry: ModelManifestEntry): Promise<ModelStatusRecord> {
  const base: Omit<ModelStatusRecord, "state" | "source" | "sizeBytes" | "downloadable"> = {
    key: entry.key,
    lane: entry.lane,
    label: entry.label,
    family: entry.family,
    sizeLabel: entry.sizeLabel,
    downloadMb: entry.downloadMb,
    optional: entry.optional,
  };

  if (entry.presence === "electron-gguf") {
    const { state, source, sizeBytes } = await probeGguf(entry);
    return {
      ...base,
      state,
      source,
      sizeBytes,
      // Only the Electron GGUF lane has an in-app downloader.
      downloadable: isElectron() && !!bridgeModels(),
    };
  }

  const { state, source } = await probeTransformersAsset(entry);
  return { ...base, state, source, downloadable: false };
}

// ─── Imperative guard (call before generation) ──────────────────────────────────

export interface ModelReadiness {
  ready: boolean;
  /** Non-optional models that are missing — block the feature. */
  missing: ModelStatusRecord[];
  records: ModelStatusRecord[];
}

/**
 * Preflight guard AI features call before generating. Resolves with whether the
 * required (non-optional) models for the requested lanes are present.
 *
 * @param lanes which inference lanes the feature needs (default: both).
 */
export async function ensureModelsReady(
  lanes: ModelLane[] = ["llm", "embed"],
): Promise<ModelReadiness> {
  const wanted = MODEL_MANIFEST.filter((m) => lanes.includes(m.lane));
  const records = await Promise.all(wanted.map(probeEntry));
  const missing = records.filter((r) => !r.optional && r.state !== "present");
  return { ready: missing.length === 0, missing, records };
}

/**
 * Lighter guard used by the llamacpp lane: is the primary GGUF present? Returns
 * false (not throwing) so callers can transparently fall back to the browser
 * lane — matching `llamacppProvider.isAvailable()`.
 */
export async function isPrimaryLlmReady(): Promise<boolean> {
  if (!isElectron()) return false;
  const entry = primaryForLane("llm");
  const { state } = await probeGguf(entry);
  return state === "present";
}

// ─── React hook ─────────────────────────────────────────────────────────────────

export interface DownloadState {
  /** 0–100, or -1 when total is unknown. */
  percent: number;
  receivedBytes: number;
  totalBytes: number;
  active: boolean;
  error: string | null;
}

export interface UseModelStatus {
  records: ModelStatusRecord[];
  loading: boolean;
  ready: boolean;
  /** Per-model-key download progress. */
  downloads: Record<string, DownloadState>;
  refresh: () => Promise<void>;
  /** Start an in-app download of a GGUF model (Electron only). */
  download: (key: string) => Promise<void>;
  /** Cancel an in-flight download for the given key. */
  cancel: (key: string) => Promise<void>;
}

const EMPTY_DOWNLOAD: DownloadState = {
  percent: 0,
  receivedBytes: 0,
  totalBytes: 0,
  active: false,
  error: null,
};

/**
 * Reactive model presence + download progress for the Setup affordance.
 *
 * @param lanes which lanes to track (default: both).
 */
export function useModelStatus(lanes: ModelLane[] = ["llm", "embed"]): UseModelStatus {
  const [records, setRecords] = useState<ModelStatusRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});

  // Track requestId + unsubscribe per active download so cancel() can reach it.
  const activeRef = useRef<Map<string, { requestId: string; unsubscribe: () => void }>>(new Map());

  // biome-ignore lint/correctness/useExhaustiveDependencies: `lanes` is a stable literal list per call site; keyed off its joined value to avoid rebuilds on new array references.
  const refresh = useCallback(async () => {
    const wanted = MODEL_MANIFEST.filter((m) => lanes.includes(m.lane));
    const next = await Promise.all(wanted.map(probeEntry));
    setRecords(next);
    setLoading(false);
  }, [lanes.join(",")]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `lanes` is a stable literal per call site; keyed off its joined value to avoid rebuilds on new array references.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const wanted = MODEL_MANIFEST.filter((m) => lanes.includes(m.lane));
      const next = await Promise.all(wanted.map(probeEntry));
      if (!alive) return;
      setRecords(next);
      setLoading(false);
    })();
    const captured = activeRef.current;
    return () => {
      alive = false;
      // Tear down any progress listeners on unmount.
      for (const { unsubscribe } of captured.values()) unsubscribe();
      captured.clear();
    };
  }, [lanes.join(",")]);

  const setDownload = useCallback((key: string, patch: Partial<DownloadState>) => {
    setDownloads((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? EMPTY_DOWNLOAD), ...patch },
    }));
  }, []);

  const download = useCallback(
    async (key: string) => {
      const models = bridgeModels();
      if (!models) {
        setDownload(key, { error: "Model download requires the desktop app." });
        return;
      }

      const requestId = `model-dl-${key}-${Date.now()}`;
      setDownload(key, { active: true, error: null, percent: 0, receivedBytes: 0 });

      const unsubscribe = models.onProgress(requestId, (progress) => {
        setDownload(key, {
          percent: progress.percent,
          receivedBytes: progress.receivedBytes,
          totalBytes: progress.totalBytes,
          active: !progress.done,
        });
      });
      activeRef.current.set(key, { requestId, unsubscribe });

      try {
        await models.download({ key, requestId });
        setDownload(key, { active: false, percent: 100 });
        await refresh();
      } catch (err) {
        setDownload(key, {
          active: false,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        unsubscribe();
        activeRef.current.delete(key);
      }
    },
    [refresh, setDownload],
  );

  const cancel = useCallback(
    async (key: string) => {
      const models = bridgeModels();
      const active = activeRef.current.get(key);
      if (!models || !active) return;
      await models.abort(active.requestId).catch(() => undefined);
      active.unsubscribe();
      activeRef.current.delete(key);
      setDownload(key, { active: false });
    },
    [setDownload],
  );

  const ready = records.filter((r) => !r.optional).every((r) => r.state === "present");

  return { records, loading, ready, downloads, refresh, download, cancel };
}
