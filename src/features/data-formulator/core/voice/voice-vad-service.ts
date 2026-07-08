/**
 * Voice VAD Service
 *
 * Library-powered browser VAD wrapper around @ricky0123/vad-web.
 *
 * This replaces the custom low-level path:
 * - voice-capture.ts
 * - voice-session.ts
 * - voice-vad-worker.ts
 *
 * Responsibilities:
 * - Initialize MicVAD.
 * - Request microphone permission through the VAD library.
 * - Emit stable app-level voice events.
 * - Provide start / pause / stop / destroy lifecycle.
 * - Support hold-to-talk, push-to-talk, and auto-VAD behavior.
 *
 * This file has no React dependency.
 */

import {
  getVadModel,
  type VadEngine,
  VOICE_REGISTRY_DEFAULTS,
  type VoiceRuntime,
} from "./voice-model-registry";

export type VoiceVadMode = "hold-to-talk" | "push-to-talk" | "auto-vad";

export type VoiceVadServiceState =
  | "idle"
  | "initializing"
  | "ready"
  | "listening"
  | "paused"
  | "stopped"
  | "destroyed"
  | "error";

export type VoiceVadEvent =
  | {
      type: "INITIALIZING";
      timestampMs: number;
      detail: string;
    }
  | {
      type: "READY";
      timestampMs: number;
      sampleRate: number;
      engine: VadEngine;
      baseAssetPath: string;
    }
  | {
      type: "LISTENING";
      timestampMs: number;
      mode: VoiceVadMode;
    }
  | {
      type: "PAUSED";
      timestampMs: number;
    }
  | {
      type: "STOPPED";
      timestampMs: number;
    }
  | {
      type: "SPEECH_START";
      timestampMs: number;
    }
  | {
      type: "SPEECH_END";
      timestampMs: number;
      audio: Float32Array;
      sampleRate: number;
      durationMs: number;
      peak: number;
      rms: number;
    }
  | {
      type: "MISFIRE";
      timestampMs: number;
      detail: string;
    }
  | {
      type: "FRAME_PROCESSED";
      timestampMs: number;
      isSpeech?: boolean;
      speechProbability?: number;
      notSpeechProbability?: number;
    }
  | {
      type: "ERROR";
      timestampMs: number;
      error: string;
      cause?: unknown;
    }
  | {
      type: "DEBUG";
      timestampMs: number;
      label: string;
      data?: unknown;
    };

export interface VoiceVadDeviceInfo {
  deviceId: string;
  label: string;
  groupId: string;
}

export interface VoiceVadServiceSnapshot {
  state: VoiceVadServiceState;
  mode: VoiceVadMode;
  engine: VadEngine;
  runtime: VoiceRuntime;
  sampleRate: number;
  isReady: boolean;
  isListening: boolean;
  isDestroyed: boolean;
  startedAt: number | null;
  lastSpeechStartedAt: number | null;
  lastSpeechEndedAt: number | null;
  lastError: string | null;
}

export interface VoiceVadServiceOptions {
  mode?: VoiceVadMode;
  engine?: VadEngine;
  runtime?: VoiceRuntime;
  deviceId?: string;
  sampleRate?: number;

  /**
   * Public path where VAD assets are served.
   * Example: /vad/
   */
  baseAssetPath?: string;

  /**
   * Public path where ONNX Runtime WASM assets are served.
   * For @ricky0123/vad-web this is normally the same as baseAssetPath
   * when you copy ORT WASM files to public/vad.
   */
  onnxWASMBasePath?: string;

  /**
   * VAD sensitivity settings.
   * Higher positiveSpeechThreshold = stricter speech detection.
   */
  positiveSpeechThreshold?: number;
  negativeSpeechThreshold?: number;
  redemptionFrames?: number;
  preSpeechPadFrames?: number;
  minSpeechFrames?: number;

  /**
   * Important for hold-to-talk / push-to-talk:
   * pausing the VAD should submit the current speech segment when possible.
   */
  submitUserSpeechOnPause?: boolean;

  /**
   * Extra getUserMedia constraints.
   */
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;

  /**
   * Emit FRAME_PROCESSED events.
   * Useful for debug UI, but can be noisy.
   */
  emitFrameEvents?: boolean;

  onEvent?: (event: VoiceVadEvent) => void;
}

type MicVADInstance = {
  start?: () => void | Promise<void>;
  pause?: () => void | Promise<void>;
  destroy?: () => void | Promise<void>;
  listening?: boolean;
};

type MicVADModule = {
  MicVAD: {
    new: (options: Record<string, unknown>) => Promise<MicVADInstance>;
  };
};

const DEFAULT_SAMPLE_RATE = 16_000;

function nowMs(): number {
  if (typeof performance !== "undefined") {
    return performance.now();
  }

  return Date.now();
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
}

function toErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Microphone permission was blocked. Enable microphone access for this app.";
    }

    if (error.name === "NotFoundError") {
      return "No microphone was found.";
    }

    if (error.name === "NotReadableError") {
      return "Microphone is already being used by another app.";
    }

    if (error.name === "SecurityError") {
      return "Microphone is blocked by the current browser security context.";
    }

    return `${error.name}: ${error.message}`;
  }

  if (error instanceof Error) return error.message;

  return String(error);
}

function normalizeBasePath(path: string): string {
  if (!path) return "/";

  return path.endsWith("/") ? path : `${path}/`;
}

function normalizeAudio(audio: unknown): Float32Array {
  if (audio instanceof Float32Array) {
    return audio;
  }

  if (audio instanceof ArrayBuffer) {
    return new Float32Array(audio);
  }

  if (Array.isArray(audio)) {
    return Float32Array.from(audio.map((value) => Number(value) || 0));
  }

  if (
    typeof audio === "object" &&
    audio !== null &&
    "buffer" in audio &&
    (audio as { buffer?: unknown }).buffer instanceof ArrayBuffer
  ) {
    return new Float32Array((audio as { buffer: ArrayBuffer }).buffer);
  }

  throw new Error("Unsupported VAD audio segment format.");
}

function analyzeAudio(samples: Float32Array): {
  rms: number;
  peak: number;
  durationMs: number;
} {
  if (samples.length === 0) {
    return {
      rms: 0,
      peak: 0,
      durationMs: 0,
    };
  }

  let sumSquares = 0;
  let peak = 0;

  for (let i = 0; i < samples.length; i++) {
    const sample = Number.isFinite(samples[i]) ? samples[i] : 0;
    const abs = Math.abs(sample);

    peak = Math.max(peak, abs);
    sumSquares += sample * sample;
  }

  return {
    rms: Math.sqrt(sumSquares / samples.length),
    peak,
    durationMs: (samples.length / DEFAULT_SAMPLE_RATE) * 1000,
  };
}

function extractFrameProbabilities(data: unknown): {
  isSpeech?: boolean;
  speechProbability?: number;
  notSpeechProbability?: number;
} {
  if (!data || typeof data !== "object") {
    return {};
  }

  const record = data as Record<string, unknown>;

  const speechProbability =
    typeof record.isSpeech === "number"
      ? record.isSpeech
      : typeof record.speech === "number"
        ? record.speech
        : typeof record.pSpeech === "number"
          ? record.pSpeech
          : undefined;

  const notSpeechProbability =
    typeof record.notSpeech === "number"
      ? record.notSpeech
      : typeof record.nonSpeech === "number"
        ? record.nonSpeech
        : typeof record.pNonSpeech === "number"
          ? record.pNonSpeech
          : undefined;

  return {
    speechProbability,
    notSpeechProbability,
    isSpeech: typeof speechProbability === "number" ? speechProbability >= 0.5 : undefined,
  };
}

async function importVadModule(): Promise<MicVADModule> {
  return (await import("@ricky0123/vad-web")) as unknown as MicVADModule;
}

export class VoiceVadService {
  private readonly options: Required<
    Pick<
      VoiceVadServiceOptions,
      | "mode"
      | "engine"
      | "runtime"
      | "sampleRate"
      | "positiveSpeechThreshold"
      | "negativeSpeechThreshold"
      | "redemptionFrames"
      | "preSpeechPadFrames"
      | "minSpeechFrames"
      | "submitUserSpeechOnPause"
      | "echoCancellation"
      | "noiseSuppression"
      | "autoGainControl"
      | "emitFrameEvents"
    >
  > &
    Omit<
      VoiceVadServiceOptions,
      | "mode"
      | "engine"
      | "runtime"
      | "sampleRate"
      | "positiveSpeechThreshold"
      | "negativeSpeechThreshold"
      | "redemptionFrames"
      | "preSpeechPadFrames"
      | "minSpeechFrames"
      | "submitUserSpeechOnPause"
      | "echoCancellation"
      | "noiseSuppression"
      | "autoGainControl"
      | "emitFrameEvents"
    >;

  private vad: MicVADInstance | null = null;
  private state: VoiceVadServiceState = "idle";
  private startedAt: number | null = null;
  private lastSpeechStartedAt: number | null = null;
  private lastSpeechEndedAt: number | null = null;
  private lastError: string | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(options: VoiceVadServiceOptions = {}) {
    const vadModel = getVadModel(options.engine ?? VOICE_REGISTRY_DEFAULTS.vadEngine);

    this.options = {
      mode: options.mode ?? "hold-to-talk",
      engine: options.engine ?? VOICE_REGISTRY_DEFAULTS.vadEngine,
      runtime: options.runtime ?? VOICE_REGISTRY_DEFAULTS.runtime,
      deviceId: options.deviceId,
      sampleRate: options.sampleRate ?? vadModel.sampleRate ?? DEFAULT_SAMPLE_RATE,
      baseAssetPath: normalizeBasePath(options.baseAssetPath ?? vadModel.baseAssetPath ?? "/vad/"),
      onnxWASMBasePath: normalizeBasePath(
        options.onnxWASMBasePath ?? vadModel.onnxWasmBasePath ?? vadModel.baseAssetPath ?? "/vad/",
      ),
      positiveSpeechThreshold: options.positiveSpeechThreshold ?? 0.5,
      negativeSpeechThreshold: options.negativeSpeechThreshold ?? 0.35,
      redemptionFrames: options.redemptionFrames ?? 8,
      preSpeechPadFrames: options.preSpeechPadFrames ?? 10,
      minSpeechFrames: options.minSpeechFrames ?? 4,
      submitUserSpeechOnPause: options.submitUserSpeechOnPause ?? true,
      echoCancellation: options.echoCancellation ?? true,
      noiseSuppression: options.noiseSuppression ?? true,
      autoGainControl: options.autoGainControl ?? true,
      emitFrameEvents: options.emitFrameEvents ?? false,
      onEvent: options.onEvent,
    };
  }

  getSnapshot(): VoiceVadServiceSnapshot {
    return {
      state: this.state,
      mode: this.options.mode,
      engine: this.options.engine,
      runtime: this.options.runtime,
      sampleRate: this.options.sampleRate,
      isReady: this.state === "ready" || this.state === "paused",
      isListening: this.state === "listening",
      isDestroyed: this.state === "destroyed",
      startedAt: this.startedAt,
      lastSpeechStartedAt: this.lastSpeechStartedAt,
      lastSpeechEndedAt: this.lastSpeechEndedAt,
      lastError: this.lastError,
    };
  }

  async initialize(): Promise<void> {
    if (this.vad && this.state !== "destroyed") {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.initializeInternal();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  async start(): Promise<void> {
    await this.initialize();

    if (!this.vad) {
      throw new Error("VAD service is not initialized.");
    }

    if (this.state === "listening") {
      return;
    }

    try {
      await this.vad.start?.();

      this.startedAt = nowMs();
      this.transition("listening");

      this.emit({
        type: "LISTENING",
        timestampMs: nowMs(),
        mode: this.options.mode,
      });
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  async pause(): Promise<void> {
    if (!this.vad || this.state !== "listening") {
      return;
    }

    try {
      await this.vad.pause?.();
      this.transition("paused");

      this.emit({
        type: "PAUSED",
        timestampMs: nowMs(),
      });
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.vad) {
      this.transition("stopped");

      this.emit({
        type: "STOPPED",
        timestampMs: nowMs(),
      });

      return;
    }

    try {
      await this.vad.pause?.();

      this.startedAt = null;
      this.transition("stopped");

      this.emit({
        type: "STOPPED",
        timestampMs: nowMs(),
      });
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  async destroy(): Promise<void> {
    try {
      if (this.vad?.destroy) {
        await this.vad.destroy();
      } else {
        await this.vad?.pause?.();
      }
    } catch (error) {
      this.emit({
        type: "DEBUG",
        timestampMs: nowMs(),
        label: "VAD destroy warning",
        data: error,
      });
    } finally {
      this.vad = null;
      this.startedAt = null;
      this.transition("destroyed");
    }
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  private async initializeInternal(): Promise<void> {
    if (!isBrowser()) {
      throw new Error("Voice VAD is only available in the browser.");
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "navigator.mediaDevices.getUserMedia is unavailable. Check browser or Electron permissions.",
      );
    }

    this.transition("initializing");

    this.emit({
      type: "INITIALIZING",
      timestampMs: nowMs(),
      detail: "Loading browser VAD model and microphone pipeline.",
    });

    try {
      const module = await importVadModule();

      const vadOptions = this.createMicVadOptions();

      this.emit({
        type: "DEBUG",
        timestampMs: nowMs(),
        label: "Creating MicVAD",
        data: {
          baseAssetPath: this.options.baseAssetPath,
          onnxWASMBasePath: this.options.onnxWASMBasePath,
          mode: this.options.mode,
          deviceId: this.options.deviceId,
        },
      });

      this.vad = await module.MicVAD.new(vadOptions);

      this.lastError = null;
      this.transition("ready");

      this.emit({
        type: "READY",
        timestampMs: nowMs(),
        sampleRate: this.options.sampleRate,
        engine: this.options.engine,
        baseAssetPath: this.options.baseAssetPath ?? "/vad/",
      });
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  private createMicVadOptions(): Record<string, unknown> {
    return {
      model: "v5",
      baseAssetPath: this.options.baseAssetPath,
      onnxWASMBasePath: this.options.onnxWASMBasePath,

      positiveSpeechThreshold: this.options.positiveSpeechThreshold,
      negativeSpeechThreshold: this.options.negativeSpeechThreshold,
      redemptionFrames: this.options.redemptionFrames,
      preSpeechPadFrames: this.options.preSpeechPadFrames,
      minSpeechFrames: this.options.minSpeechFrames,
      submitUserSpeechOnPause: this.options.submitUserSpeechOnPause,

      getStream: async () => {
        const audioConstraints: MediaTrackConstraints = {
          echoCancellation: this.options.echoCancellation,
          noiseSuppression: this.options.noiseSuppression,
          autoGainControl: this.options.autoGainControl,
          channelCount: 1,
        };

        if (this.options.deviceId) {
          audioConstraints.deviceId = {
            exact: this.options.deviceId,
          };
        }

        return navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
        });
      },

      onSpeechStart: () => {
        this.lastSpeechStartedAt = nowMs();

        this.emit({
          type: "SPEECH_START",
          timestampMs: nowMs(),
        });
      },

      onSpeechEnd: (audio: unknown) => {
        const samples = normalizeAudio(audio);
        const stats = analyzeAudio(samples);

        this.lastSpeechEndedAt = nowMs();

        this.emit({
          type: "SPEECH_END",
          timestampMs: nowMs(),
          audio: samples,
          sampleRate: this.options.sampleRate,
          durationMs: stats.durationMs,
          peak: stats.peak,
          rms: stats.rms,
        });
      },

      onVADMisfire: () => {
        this.emit({
          type: "MISFIRE",
          timestampMs: nowMs(),
          detail: "Speech was detected but too short or unclear.",
        });
      },

      onFrameProcessed: (probabilities: unknown) => {
        if (!this.options.emitFrameEvents) {
          return;
        }

        const frame = extractFrameProbabilities(probabilities);

        this.emit({
          type: "FRAME_PROCESSED",
          timestampMs: nowMs(),
          ...frame,
        });
      },
    };
  }

  private transition(nextState: VoiceVadServiceState): void {
    this.state = nextState;
  }

  private fail(error: unknown): void {
    const message = toErrorMessage(error);

    this.lastError = message;
    this.transition("error");

    this.emit({
      type: "ERROR",
      timestampMs: nowMs(),
      error: message,
      cause: error,
    });
  }

  private emit(event: VoiceVadEvent): void {
    this.options.onEvent?.(event);
  }
}

export function createVoiceVadService(options: VoiceVadServiceOptions = {}): VoiceVadService {
  return new VoiceVadService(options);
}

export async function listVoiceInputDevices(): Promise<VoiceVadDeviceInfo[]> {
  if (!isBrowser()) {
    return [];
  }

  if (!navigator.mediaDevices?.enumerateDevices) {
    return [];
  }

  const devices = await navigator.mediaDevices.enumerateDevices();

  return devices
    .filter((device) => device.kind === "audioinput")
    .map((device, index) => ({
      deviceId: device.deviceId,
      groupId: device.groupId,
      label: device.label || `Microphone ${index + 1}`,
    }));
}

export async function requestVoiceMicrophonePermission(): Promise<boolean> {
  if (!isBrowser()) {
    return false;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return false;
  }

  let stream: MediaStream | null = null;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });

    return true;
  } catch {
    return false;
  } finally {
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
  }
}

export function isVoiceVadSupported(): boolean {
  return Boolean(isBrowser() && typeof AudioContext !== "undefined");
}
