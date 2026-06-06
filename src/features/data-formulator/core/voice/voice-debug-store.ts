/**
 * Voice Debug Store
 *
 * Lightweight client-side diagnostics store for the voice-agent pipeline.
 *
 * Used by:
 * - voice-button.tsx
 * - voice-vad-service.ts
 * - voice-stt-worker.ts message handlers
 * - voice-tts-worker.ts message handlers
 * - voice-debug-panel.tsx
 * - voice-agui-events.ts projections
 *
 * This file has no React dependency.
 */

import {
  calculateLatencyDurations,
  createInitialVoiceRunSnapshot,
  reduceVoiceAguiEvent,
  reduceVoiceAguiEvents,
  type VoiceAguiEvent,
  type VoiceAguiRunSnapshot,
  type VoiceAguiRunStatus,
  type VoiceTimelineItem,
} from "./voice-agui-events";
import type { VoiceCommand, VoiceToolCall } from "./voice-command-router";
import type { SttEngine, TtsEngine, VoiceLanguageHint, VoiceRuntime } from "./voice-model-registry";
import { loadVoiceSettings, subscribeVoiceSettings, type VoiceDebugLevel } from "./voice-settings";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type VoiceDebugEventKind =
  | "vad"
  | "stt"
  | "router"
  | "tool"
  | "tts"
  | "playback"
  | "model"
  | "settings"
  | "agui"
  | "ui"
  | "error"
  | "system"
  | "debug";

export type VoiceDebugSeverity = "debug" | "info" | "warn" | "error";

export interface VoiceDebugLogEntry {
  id: string;
  timestamp: number;
  runId?: string;
  kind: VoiceDebugEventKind;
  severity: VoiceDebugSeverity;
  label: string;
  message?: string;
  data?: unknown;
}

export interface VoiceDebugMetric {
  key: string;
  label: string;
  value: number;
  unit: "ms" | "count" | "percent" | "bytes" | "score";
  updatedAt: number;
}

export interface VoiceWorkerStatus {
  name: "vad" | "stt" | "router" | "tts";
  status: "idle" | "initializing" | "loading" | "ready" | "running" | "stopped" | "error";
  detail?: string;
  model?: string;
  progress?: number;
  updatedAt: number;
  error?: string;
}

export interface VoiceDebugModelStatus {
  kind: "vad" | "stt" | "tts";
  label: string;
  engine?: string;
  runtime?: VoiceRuntime;
  modelId: string;
  cached?: boolean;
  ready?: boolean;
  loading?: boolean;
  progress?: number;
  error?: string;
  updatedAt: number;
}

export interface VoiceDebugAudioState {
  inputDeviceId?: string | null;
  inputDeviceLabel?: string | null;
  sampleRate?: number;
  isListening: boolean;
  isSpeaking: boolean;
  vadActive: boolean;
  audioLevel: number;
  speechDurationMs: number;
  silenceDurationMs: number;
  lastSpeechStartedAt?: number;
  lastSpeechEndedAt?: number;
  lastAudioDurationMs?: number;
  lastRms?: number;
  lastPeak?: number;
}

export interface VoiceDebugCurrentRun {
  runId: string;
  status: VoiceAguiRunStatus;
  transcript?: string;
  editedTranscript?: string;
  assistantText?: string;
  command?: VoiceCommand;
  toolCall?: VoiceToolCall;
  ttsJobId?: string;
  error?: string;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface VoiceDebugSnapshot {
  version: number;
  enabled: boolean;
  debugLevel: VoiceDebugLevel;
  updatedAt: number;

  currentRun: VoiceDebugCurrentRun | null;
  runs: Record<string, VoiceAguiRunSnapshot>;
  runOrder: string[];

  logs: VoiceDebugLogEntry[];
  metrics: Record<string, VoiceDebugMetric>;
  workers: Record<VoiceWorkerStatus["name"], VoiceWorkerStatus>;
  models: Record<string, VoiceDebugModelStatus>;
  audio: VoiceDebugAudioState;

  lastTranscript?: string;
  lastCommand?: VoiceCommand;
  lastToolCall?: VoiceToolCall;
  lastError?: string;
}

export interface VoiceDebugStoreOptions {
  persist?: boolean;
  maxLogs?: number;
  maxRuns?: number;
  storageKey?: string;
}

export type VoiceDebugSubscriber = (snapshot: VoiceDebugSnapshot) => void;

export interface VoiceDebugExport {
  exportedAt: number;
  snapshot: VoiceDebugSnapshot;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const VOICE_DEBUG_STORE_VERSION = 1;
export const VOICE_DEBUG_STORAGE_KEY = "moudir_voice_debug_store_v1";
export const VOICE_DEBUG_EVENT_NAME = "moudir_voice_debug_store_changed";

const DEFAULT_MAX_LOGS = 500;
const DEFAULT_MAX_RUNS = 30;

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

function now(): number {
  return Date.now();
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function normalizeUnknownForStorage(value: unknown): unknown {
  if (value == null) return value;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (value instanceof Float32Array) {
    return {
      type: "Float32Array",
      length: value.length,
      preview: Array.from(value.slice(0, 8)),
    };
  }

  if (value instanceof Uint8Array) {
    return {
      type: "Uint8Array",
      length: value.length,
      preview: Array.from(value.slice(0, 8)),
    };
  }

  if (value instanceof ArrayBuffer) {
    return {
      type: "ArrayBuffer",
      byteLength: value.byteLength,
    };
  }

  try {
    JSON.stringify(value);
    return value;
  } catch {
    return String(value);
  }
}

function createDefaultWorkerStatus(name: VoiceWorkerStatus["name"]): VoiceWorkerStatus {
  return {
    name,
    status: "idle",
    updatedAt: now(),
  };
}

function createInitialAudioState(): VoiceDebugAudioState {
  return {
    inputDeviceId: null,
    inputDeviceLabel: null,
    isListening: false,
    isSpeaking: false,
    vadActive: false,
    audioLevel: 0,
    speechDurationMs: 0,
    silenceDurationMs: 0,
  };
}

function createInitialSnapshot(): VoiceDebugSnapshot {
  const settings = loadVoiceSettings();

  return {
    version: VOICE_DEBUG_STORE_VERSION,
    enabled: settings.debugEnabled,
    debugLevel: settings.debugLevel,
    updatedAt: now(),
    currentRun: null,
    runs: {},
    runOrder: [],
    logs: [],
    metrics: {},
    workers: {
      vad: createDefaultWorkerStatus("vad"),
      stt: createDefaultWorkerStatus("stt"),
      router: createDefaultWorkerStatus("router"),
      tts: createDefaultWorkerStatus("tts"),
    },
    models: {},
    audio: createInitialAudioState(),
  };
}

function getSeverityRank(severity: VoiceDebugSeverity): number {
  switch (severity) {
    case "debug":
      return 0;
    case "info":
      return 1;
    case "warn":
      return 2;
    case "error":
      return 3;
    default:
      return 1;
  }
}

function shouldKeepLog(level: VoiceDebugLevel, severity: VoiceDebugSeverity): boolean {
  if (level === "off") return false;
  if (level === "errors") return severity === "error";
  if (level === "normal") return getSeverityRank(severity) >= 1;
  return true;
}

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */

class VoiceDebugStore {
  private snapshot: VoiceDebugSnapshot;
  private subscribers = new Set<VoiceDebugSubscriber>();
  private persist: boolean;
  private maxLogs: number;
  private maxRuns: number;
  private storageKey: string;
  private unsubscribeSettings: (() => void) | null = null;

  constructor(options: VoiceDebugStoreOptions = {}) {
    this.persist = options.persist ?? true;
    this.maxLogs = options.maxLogs ?? DEFAULT_MAX_LOGS;
    this.maxRuns = options.maxRuns ?? DEFAULT_MAX_RUNS;
    this.storageKey = options.storageKey ?? VOICE_DEBUG_STORAGE_KEY;
    this.snapshot = this.loadSnapshot();

    if (isBrowser()) {
      this.unsubscribeSettings = subscribeVoiceSettings((event) => {
        this.updateSettingsState({
          enabled: event.settings.debugEnabled,
          debugLevel: event.settings.debugLevel,
        });
      });
    }
  }

  getSnapshot(): VoiceDebugSnapshot {
    return this.snapshot;
  }

  subscribe(subscriber: VoiceDebugSubscriber): () => void {
    this.subscribers.add(subscriber);
    subscriber(this.snapshot);

    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  reset(): VoiceDebugSnapshot {
    this.snapshot = createInitialSnapshot();
    this.commit();

    return this.snapshot;
  }

  clearLogs(): void {
    this.patch({
      logs: [],
      updatedAt: now(),
    });
  }

  clearRuns(): void {
    this.patch({
      currentRun: null,
      runs: {},
      runOrder: [],
      updatedAt: now(),
    });
  }

  clearAll(): void {
    this.reset();
  }

  setEnabled(enabled: boolean): void {
    this.patch({
      enabled,
      updatedAt: now(),
    });

    this.log({
      kind: "settings",
      severity: "info",
      label: enabled ? "Voice debug enabled" : "Voice debug disabled",
    });
  }

  setDebugLevel(debugLevel: VoiceDebugLevel): void {
    this.patch({
      debugLevel,
      updatedAt: now(),
    });

    this.log({
      kind: "settings",
      severity: "info",
      label: "Voice debug level changed",
      data: { debugLevel },
    });
  }

  log(input: {
    kind: VoiceDebugEventKind;
    severity?: VoiceDebugSeverity;
    label: string;
    message?: string;
    data?: unknown;
    runId?: string;
  }): VoiceDebugLogEntry {
    const severity = input.severity ?? "info";

    const entry: VoiceDebugLogEntry = {
      id: createId("voice_log"),
      timestamp: now(),
      runId: input.runId ?? this.snapshot.currentRun?.runId,
      kind: input.kind,
      severity,
      label: input.label,
      message: input.message,
      data: normalizeUnknownForStorage(input.data),
    };

    if (!this.snapshot.enabled && severity !== "error") {
      return entry;
    }

    if (!shouldKeepLog(this.snapshot.debugLevel, severity)) {
      return entry;
    }

    const logs = [...this.snapshot.logs, entry].slice(-this.maxLogs);

    this.patch({
      logs,
      lastError: severity === "error" ? (input.message ?? input.label) : this.snapshot.lastError,
      updatedAt: now(),
    });

    return entry;
  }

  debug(label: string, data?: unknown, runId?: string): VoiceDebugLogEntry {
    return this.log({
      kind: "debug",
      severity: "debug",
      label,
      data,
      runId,
    });
  }

  info(
    kind: VoiceDebugEventKind,
    label: string,
    data?: unknown,
    runId?: string,
  ): VoiceDebugLogEntry {
    return this.log({
      kind,
      severity: "info",
      label,
      data,
      runId,
    });
  }

  warn(
    kind: VoiceDebugEventKind,
    label: string,
    data?: unknown,
    runId?: string,
  ): VoiceDebugLogEntry {
    return this.log({
      kind,
      severity: "warn",
      label,
      data,
      runId,
    });
  }

  error(
    kind: VoiceDebugEventKind,
    label: string,
    error?: unknown,
    runId?: string,
  ): VoiceDebugLogEntry {
    return this.log({
      kind,
      severity: "error",
      label,
      message: toErrorMessage(error ?? label),
      data: normalizeUnknownForStorage(error),
      runId,
    });
  }

  startRun(runId: string): VoiceAguiRunSnapshot {
    const run = createInitialVoiceRunSnapshot(runId);

    const runOrder = [...this.snapshot.runOrder, runId].slice(-this.maxRuns);
    const runs = { ...this.snapshot.runs, [runId]: run };

    for (const key of Object.keys(runs)) {
      if (!runOrder.includes(key)) {
        delete runs[key];
      }
    }

    this.patch({
      currentRun: {
        runId,
        status: run.status,
        startedAt: run.startedAt,
        updatedAt: run.updatedAt,
      },
      runs,
      runOrder,
      updatedAt: now(),
    });

    this.info("agui", "Voice run started", { runId }, runId);

    return run;
  }

  endRun(
    runId: string,
    status: "completed" | "cancelled" | "error" = "completed",
    error?: string,
  ): void {
    const run = this.snapshot.runs[runId];

    const currentRun =
      this.snapshot.currentRun?.runId === runId
        ? {
            ...this.snapshot.currentRun,
            status,
            error,
            completedAt: now(),
            updatedAt: now(),
          }
        : this.snapshot.currentRun;

    this.patch({
      currentRun,
      runs: run
        ? {
            ...this.snapshot.runs,
            [runId]: {
              ...run,
              status,
              error,
              completedAt: now(),
              updatedAt: now(),
            },
          }
        : this.snapshot.runs,
      updatedAt: now(),
    });

    this.info(
      "agui",
      `Voice run ${status}`,
      {
        runId,
        error,
      },
      runId,
    );
  }

  appendAguiEvent(event: VoiceAguiEvent): VoiceAguiRunSnapshot {
    const existing = this.snapshot.runs[event.runId] ?? createInitialVoiceRunSnapshot(event.runId);

    const nextRun = reduceVoiceAguiEvent(existing, event);
    const durations = calculateLatencyDurations(nextRun.latency);

    const currentRun: VoiceDebugCurrentRun = {
      runId: nextRun.runId,
      status: nextRun.status,
      transcript: nextRun.transcript,
      editedTranscript: nextRun.editedTranscript,
      assistantText: nextRun.assistantText,
      command: nextRun.command,
      toolCall: nextRun.toolCall,
      ttsJobId: nextRun.ttsJobId,
      error: nextRun.error,
      startedAt: nextRun.startedAt,
      updatedAt: nextRun.updatedAt,
      completedAt: nextRun.completedAt,
    };

    const runs = {
      ...this.snapshot.runs,
      [event.runId]: nextRun,
    };

    const runOrder = this.snapshot.runOrder.includes(event.runId)
      ? this.snapshot.runOrder
      : [...this.snapshot.runOrder, event.runId].slice(-this.maxRuns);

    this.patch({
      currentRun,
      runs,
      runOrder,
      lastTranscript:
        nextRun.editedTranscript ?? nextRun.transcript ?? this.snapshot.lastTranscript,
      lastCommand: nextRun.command ?? this.snapshot.lastCommand,
      lastToolCall: nextRun.toolCall ?? this.snapshot.lastToolCall,
      lastError: nextRun.error ?? this.snapshot.lastError,
      metrics: {
        ...this.snapshot.metrics,
        ...metricsFromLatencyDurations(durations),
      },
      updatedAt: now(),
    });

    this.log({
      kind: "agui",
      severity: event.type.includes("ERROR") ? "error" : "debug",
      label: event.type,
      data: event,
      runId: event.runId,
    });

    return nextRun;
  }

  appendAguiEvents(events: VoiceAguiEvent[]): VoiceAguiRunSnapshot | null {
    if (events.length === 0) return null;

    const runId = events[0].runId;
    const existing = this.snapshot.runs[runId] ?? createInitialVoiceRunSnapshot(runId);

    const nextRun = reduceVoiceAguiEvents(existing, events);
    const durations = calculateLatencyDurations(nextRun.latency);

    this.patch({
      currentRun: {
        runId: nextRun.runId,
        status: nextRun.status,
        transcript: nextRun.transcript,
        editedTranscript: nextRun.editedTranscript,
        assistantText: nextRun.assistantText,
        command: nextRun.command,
        toolCall: nextRun.toolCall,
        ttsJobId: nextRun.ttsJobId,
        error: nextRun.error,
        startedAt: nextRun.startedAt,
        updatedAt: nextRun.updatedAt,
        completedAt: nextRun.completedAt,
      },
      runs: {
        ...this.snapshot.runs,
        [runId]: nextRun,
      },
      runOrder: this.snapshot.runOrder.includes(runId)
        ? this.snapshot.runOrder
        : [...this.snapshot.runOrder, runId].slice(-this.maxRuns),
      lastTranscript:
        nextRun.editedTranscript ?? nextRun.transcript ?? this.snapshot.lastTranscript,
      lastCommand: nextRun.command ?? this.snapshot.lastCommand,
      lastToolCall: nextRun.toolCall ?? this.snapshot.lastToolCall,
      lastError: nextRun.error ?? this.snapshot.lastError,
      metrics: {
        ...this.snapshot.metrics,
        ...metricsFromLatencyDurations(durations),
      },
      updatedAt: now(),
    });

    this.log({
      kind: "agui",
      severity: "debug",
      label: "AG-UI event batch appended",
      data: {
        runId,
        count: events.length,
      },
      runId,
    });

    return nextRun;
  }

  updateWorkerStatus(
    name: VoiceWorkerStatus["name"],
    patch: Partial<Omit<VoiceWorkerStatus, "name" | "updatedAt">>,
  ): void {
    const current = this.snapshot.workers[name] ?? createDefaultWorkerStatus(name);

    const next: VoiceWorkerStatus = {
      ...current,
      ...patch,
      name,
      updatedAt: now(),
    };

    this.patch({
      workers: {
        ...this.snapshot.workers,
        [name]: next,
      },
      updatedAt: now(),
    });

    if (patch.status === "error") {
      this.error(name, `${name} worker error`, patch.error);
    } else {
      this.log({
        kind: name,
        severity: patch.status === "ready" ? "info" : "debug",
        label: `${name} worker ${patch.status ?? "updated"}`,
        data: next,
      });
    }
  }

  updateModelStatus(key: string, patch: Omit<VoiceDebugModelStatus, "updatedAt">): void {
    const next: VoiceDebugModelStatus = {
      ...patch,
      updatedAt: now(),
    };

    this.patch({
      models: {
        ...this.snapshot.models,
        [key]: next,
      },
      updatedAt: now(),
    });

    this.log({
      kind: "model",
      severity: next.error ? "error" : "debug",
      label: `${next.kind} model ${next.ready ? "ready" : next.loading ? "loading" : "updated"}`,
      data: next,
    });
  }

  updateAudioState(patch: Partial<VoiceDebugAudioState>): void {
    this.patch({
      audio: {
        ...this.snapshot.audio,
        ...patch,
      },
      updatedAt: now(),
    });
  }

  updateMetric(metric: Omit<VoiceDebugMetric, "updatedAt">): void {
    const next: VoiceDebugMetric = {
      ...metric,
      updatedAt: now(),
    };

    this.patch({
      metrics: {
        ...this.snapshot.metrics,
        [metric.key]: next,
      },
      updatedAt: now(),
    });
  }

  recordLatency(key: string, label: string, startedAt: number, endedAt = now()): void {
    this.updateMetric({
      key,
      label,
      value: Math.max(0, Math.round(endedAt - startedAt)),
      unit: "ms",
    });
  }

  getTimeline(runId?: string): VoiceTimelineItem[] {
    const id = runId ?? this.snapshot.currentRun?.runId;

    if (!id) return [];

    return this.snapshot.runs[id]?.timeline ?? [];
  }

  export(): VoiceDebugExport {
    return {
      exportedAt: now(),
      snapshot: this.snapshot,
    };
  }

  exportJson(): string {
    return JSON.stringify(this.export(), null, 2);
  }

  importJson(json: string): VoiceDebugSnapshot {
    const parsed = safeJsonParse<VoiceDebugExport | VoiceDebugSnapshot | null>(json, null);

    if (!parsed) {
      throw new Error("Invalid voice debug JSON.");
    }

    const snapshot = "snapshot" in parsed ? parsed.snapshot : (parsed as VoiceDebugSnapshot);

    this.snapshot = normalizeSnapshot(snapshot);
    this.commit();

    return this.snapshot;
  }

  destroy(): void {
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;
    this.subscribers.clear();
  }

  private updateSettingsState(input: { enabled: boolean; debugLevel: VoiceDebugLevel }): void {
    this.patch({
      enabled: input.enabled,
      debugLevel: input.debugLevel,
      updatedAt: now(),
    });
  }

  private patch(patch: Partial<VoiceDebugSnapshot>): void {
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      version: VOICE_DEBUG_STORE_VERSION,
      updatedAt: patch.updatedAt ?? now(),
    };

    this.commit();
  }

  private commit(): void {
    if (this.persist && isBrowser()) {
      try {
        window.localStorage.setItem(this.storageKey, JSON.stringify(this.snapshot));
      } catch {
        /**
         * localStorage may fail if the debug log is too large.
         * Drop logs and try once more.
         */
        const compact = {
          ...this.snapshot,
          logs: this.snapshot.logs.slice(-100),
        };

        try {
          window.localStorage.setItem(this.storageKey, JSON.stringify(compact));
          this.snapshot = compact;
        } catch {
          // Ignore storage failure. Subscribers still get in-memory state.
        }
      }
    }

    for (const subscriber of this.subscribers) {
      subscriber(this.snapshot);
    }

    if (isBrowser()) {
      globalThis.window.dispatchEvent(
        new CustomEvent<VoiceDebugSnapshot>(VOICE_DEBUG_EVENT_NAME, {
          detail: this.snapshot,
        }),
      );
    }
  }

  private loadSnapshot(): VoiceDebugSnapshot {
    if (!this.persist || !isBrowser()) {
      return createInitialSnapshot();
    }

    const parsed = safeJsonParse<VoiceDebugSnapshot | null>(
      window.localStorage.getItem(this.storageKey),
      null,
    );

    if (!parsed) {
      return createInitialSnapshot();
    }

    return normalizeSnapshot(parsed);
  }
}

/* ------------------------------------------------------------------ */
/*  Normalization                                                      */
/* ------------------------------------------------------------------ */

function normalizeSnapshot(snapshot: Partial<VoiceDebugSnapshot>): VoiceDebugSnapshot {
  const initial = createInitialSnapshot();

  return {
    ...initial,
    ...snapshot,
    version: VOICE_DEBUG_STORE_VERSION,
    enabled: typeof snapshot.enabled === "boolean" ? snapshot.enabled : initial.enabled,
    debugLevel: snapshot.debugLevel ?? initial.debugLevel,
    updatedAt: typeof snapshot.updatedAt === "number" ? snapshot.updatedAt : now(),
    currentRun: snapshot.currentRun ?? null,
    runs: snapshot.runs ?? {},
    runOrder: snapshot.runOrder ?? [],
    logs: Array.isArray(snapshot.logs) ? snapshot.logs : [],
    metrics: snapshot.metrics ?? {},
    workers: {
      ...initial.workers,
      ...(snapshot.workers ?? {}),
    },
    models: snapshot.models ?? {},
    audio: {
      ...initial.audio,
      ...(snapshot.audio ?? {}),
    },
  };
}

function metricsFromLatencyDurations(
  durations: ReturnType<typeof calculateLatencyDurations>,
): Record<string, VoiceDebugMetric> {
  const result: Record<string, VoiceDebugMetric> = {};
  const timestamp = now();

  const add = (key: string, label: string, value: number | undefined): void => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;

    result[key] = {
      key,
      label,
      value: Math.round(value),
      unit: "ms",
      updatedAt: timestamp,
    };
  };

  add("latency.speech", "Speech duration", durations.speechMs);
  add("latency.transcription", "STT latency", durations.transcriptionMs);
  add("latency.routing", "Router latency", durations.routingMs);
  add("latency.tool", "Tool latency", durations.toolMs);
  add("latency.assistant", "Assistant latency", durations.assistantMs);
  add("latency.tts", "TTS latency", durations.ttsMs);
  add("latency.playback", "Playback duration", durations.playbackMs);
  add("latency.total", "Total voice run", durations.totalMs);

  return result;
}

/* ------------------------------------------------------------------ */
/*  Singleton API                                                      */
/* ------------------------------------------------------------------ */

let singleton: VoiceDebugStore | null = null;

export function getVoiceDebugStore(): VoiceDebugStore {
  if (!singleton) {
    singleton = new VoiceDebugStore();
  }

  return singleton;
}

export function createVoiceDebugStore(options: VoiceDebugStoreOptions = {}): VoiceDebugStore {
  return new VoiceDebugStore(options);
}

export function getVoiceDebugSnapshot(): VoiceDebugSnapshot {
  return getVoiceDebugStore().getSnapshot();
}

export function subscribeVoiceDebugStore(subscriber: VoiceDebugSubscriber): () => void {
  return getVoiceDebugStore().subscribe(subscriber);
}

export function resetVoiceDebugStore(): VoiceDebugSnapshot {
  return getVoiceDebugStore().reset();
}

export function clearVoiceDebugLogs(): void {
  getVoiceDebugStore().clearLogs();
}

export function clearVoiceDebugRuns(): void {
  getVoiceDebugStore().clearRuns();
}

export function logVoiceDebug(input: {
  kind: VoiceDebugEventKind;
  severity?: VoiceDebugSeverity;
  label: string;
  message?: string;
  data?: unknown;
  runId?: string;
}): VoiceDebugLogEntry {
  return getVoiceDebugStore().log(input);
}

export function appendVoiceAguiEvent(event: VoiceAguiEvent): VoiceAguiRunSnapshot {
  return getVoiceDebugStore().appendAguiEvent(event);
}

export function appendVoiceAguiEvents(events: VoiceAguiEvent[]): VoiceAguiRunSnapshot | null {
  return getVoiceDebugStore().appendAguiEvents(events);
}

export function updateVoiceWorkerStatus(
  name: VoiceWorkerStatus["name"],
  patch: Partial<Omit<VoiceWorkerStatus, "name" | "updatedAt">>,
): void {
  getVoiceDebugStore().updateWorkerStatus(name, patch);
}

export function updateVoiceModelDebugStatus(
  key: string,
  patch: Omit<VoiceDebugModelStatus, "updatedAt">,
): void {
  getVoiceDebugStore().updateModelStatus(key, patch);
}

export function updateVoiceAudioDebugState(patch: Partial<VoiceDebugAudioState>): void {
  getVoiceDebugStore().updateAudioState(patch);
}

export function recordVoiceLatency(
  key: string,
  label: string,
  startedAt: number,
  endedAt = Date.now(),
): void {
  getVoiceDebugStore().recordLatency(key, label, startedAt, endedAt);
}

export function exportVoiceDebugJson(): string {
  return getVoiceDebugStore().exportJson();
}

export function importVoiceDebugJson(json: string): VoiceDebugSnapshot {
  return getVoiceDebugStore().importJson(json);
}
