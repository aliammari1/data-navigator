"use client";

/**
 * Offline-model preflight + download state (renderer side).
 *
 * Answers, for the Setup UI and any AI feature: "are the model weights present,
 * and if not, can I download them while online?" Both the chat GGUF and the
 * embedding GGUF are `electron-gguf` entries and share one probing/download
 * path: presence via `window.electronModels.listPresence()` /
 * `window.electronLlama.listModels()` (which stat `<userData>/models/<lane>`),
 * download via `window.electronModels.download(...)` with progress events.
 *
 * Exports:
 *   - useModelStatus()      — reactive presence + download progress for the UI.
 *   - ensureModelsReady()   — imperative guard AI features call before generating.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { isElectron } from "@/platform/electron/electron-fs";
import {
  MODEL_MANIFEST,
  type ModelCapabilities,
  type ModelLane,
  type ModelManifestEntry,
  primaryForLane,
} from "./model-manifest";

// ─── Presence probing ──────────────────────────────────────────────────────────

type ModelPresenceState = "present" | "missing" | "unknown";

export interface ModelStatusRecord {
  key: string;
  lane: ModelLane;
  label: string;
  family: string;
  sizeLabel: string;
  downloadMb: number;
  optional: boolean;
  capabilities: ModelCapabilities;
  capabilityNote?: string;
  state: ModelPresenceState;
  sizeBytes?: number;
  source: "userData" | "none";
  downloadable: boolean;
}

function bridgeLlama() {
  if (typeof window === "undefined") return null;
  return window.electronLlama ?? null;
}

function bridgeModels() {
  if (typeof window === "undefined") return null;
  return window.electronModels ?? null;
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
  const { state, source, sizeBytes } = await probeGguf(entry);
  return {
    key: entry.key,
    lane: entry.lane,
    label: entry.label,
    family: entry.family,
    sizeLabel: entry.sizeLabel,
    downloadMb: entry.downloadMb,
    optional: entry.optional,
    capabilities: entry.capabilities,
    capabilityNote: entry.capabilityNote,
    state,
    source,
    sizeBytes,
    // The in-app downloader only works inside Electron with the models bridge.
    downloadable: isElectron() && !!bridgeModels(),
  };
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
