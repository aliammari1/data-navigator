/**
 * Voice Session
 *
 * State machine for an offline browser voice assistant pipeline.
 *
 * Inspired by the AI Engineering from Scratch speech/audio pipeline:
 *
 * mic → real-time audio chunks → VAD / turn-taking → STT → router/tool-call
 * → response / TTS → barge-in handling
 *
 * This file does not depend on React.
 * Use it from voice-button.tsx to keep the button as UI only.
 */

export type VoiceSessionState =
  | "idle"
  | "listening"
  | "speech-started"
  | "end-of-turn"
  | "transcribing"
  | "routing"
  | "responding"
  | "speaking"
  | "barge-in"
  | "error";

export type VoiceIntent =
  | "ask"
  | "kpi"
  | "dashboard"
  | "investigate"
  | "signal"
  | "brief"
  | "scenario"
  | "setup";

export interface VoiceToolCall {
  toolName: string;
  args: Record<string, unknown>;
}

export interface VoiceRouteResult {
  transcript: string;
  normalized: string;
  intent: VoiceIntent;
  confidence: number;
  language: string;
  matchedTerms?: string[];
  toolCall?: VoiceToolCall;
}

export interface VoiceAudioFrame {
  samples: Float32Array;
  sampleRate: number;
  timestampMs: number;
  durationMs: number;
  rms: number;
  rmsDbfs: number;
  peak: number;
}

export interface VoiceSessionLatency {
  sessionStartedAt: number | null;
  speechStartedAt: number | null;
  speechEndedAt: number | null;
  transcriptionStartedAt: number | null;
  transcriptionEndedAt: number | null;
  routingStartedAt: number | null;
  routingEndedAt: number | null;
  responseStartedAt: number | null;
  speakingStartedAt: number | null;
  speakingEndedAt: number | null;
}

export interface VoiceSessionSnapshot {
  state: VoiceSessionState;
  previousState: VoiceSessionState | null;
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  canBargeIn: boolean;
  currentTranscript: string;
  finalTranscript: string;
  routeResult: VoiceRouteResult | null;
  pendingToolCall: VoiceToolCall | null;
  bufferedSamples: number;
  bufferedDurationMs: number;
  speechDurationMs: number;
  silenceDurationMs: number;
  turnCount: number;
  lastError: string | null;
  latency: VoiceSessionLatency;
}

export type VoiceSessionOutputEvent =
  | {
      type: "STATE_CHANGED";
      state: VoiceSessionState;
      previousState: VoiceSessionState | null;
      snapshot: VoiceSessionSnapshot;
    }
  | {
      type: "AUDIO_FRAME";
      frame: VoiceAudioFrame;
      snapshot: VoiceSessionSnapshot;
    }
  | {
      type: "SPEECH_START";
      timestampMs: number;
      snapshot: VoiceSessionSnapshot;
    }
  | {
      type: "SPEECH_END";
      timestampMs: number;
      snapshot: VoiceSessionSnapshot;
    }
  | {
      type: "END_OF_TURN";
      audio: Float32Array;
      sampleRate: number;
      durationMs: number;
      snapshot: VoiceSessionSnapshot;
    }
  | {
      type: "TRANSCRIPT_PARTIAL";
      text: string;
      snapshot: VoiceSessionSnapshot;
    }
  | {
      type: "TRANSCRIPT_FINAL";
      text: string;
      snapshot: VoiceSessionSnapshot;
    }
  | {
      type: "ROUTE_RESULT";
      result: VoiceRouteResult;
      snapshot: VoiceSessionSnapshot;
    }
  | {
      type: "TOOL_CALL";
      toolCall: VoiceToolCall;
      routeResult: VoiceRouteResult;
      snapshot: VoiceSessionSnapshot;
    }
  | {
      type: "BARGE_IN";
      timestampMs: number;
      snapshot: VoiceSessionSnapshot;
    }
  | {
      type: "ERROR";
      error: string;
      snapshot: VoiceSessionSnapshot;
    };

export interface VoiceSessionOptions {
  /**
   * Target frame size from the curriculum.
   * 20ms is the intended real-time audio unit.
   */
  frameMs: number;

  /**
   * Energy threshold for speech detection.
   * Used by local fallback VAD.
   */
  vadThresholdDbfs: number;

  /**
   * Minimum speech before accepting a speech start.
   */
  minSpeechMs: number;

  /**
   * Silence hangover before deciding the user finished speaking.
   */
  silenceHangoverMs: number;

  /**
   * Maximum continuous utterance duration before forced end-of-turn.
   */
  maxUtteranceMs: number;

  /**
   * Keep this much audio before speech start.
   */
  preSpeechPaddingMs: number;

  /**
   * Keep this much audio after speech end.
   */
  postSpeechPaddingMs: number;

  /**
   * If true, new speech during speaking emits BARGE_IN.
   */
  bargeInEnabled: boolean;

  /**
   * Ignore barge-in if speech is too weak.
   */
  bargeInThresholdDbfs: number;

  /**
   * Callback for all session output events.
   */
  onEvent?: (event: VoiceSessionOutputEvent) => void;
}

export const DEFAULT_VOICE_SESSION_OPTIONS: VoiceSessionOptions = {
  frameMs: 20,
  vadThresholdDbfs: -40,
  minSpeechMs: 250,
  silenceHangoverMs: 500,
  maxUtteranceMs: 12_000,
  preSpeechPaddingMs: 160,
  postSpeechPaddingMs: 160,
  bargeInEnabled: true,
  bargeInThresholdDbfs: -36,
};

interface InternalVADState {
  speechMs: number;
  silenceMs: number;
  hasSpeechStarted: boolean;
  speechStartFrameIndex: number | null;
  lastSpeechFrameIndex: number | null;
}

function nowMs(): number {
  if (typeof performance !== "undefined") {
    return performance.now();
  }

  return Date.now();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rmsDbfsFromRms(rms: number): number {
  return 20 * Math.log10(Math.max(rms, 1e-10));
}

function analyzeFrame(samples: Float32Array): {
  rms: number;
  rmsDbfs: number;
  peak: number;
} {
  if (samples.length === 0) {
    return {
      rms: 0,
      rmsDbfs: -200,
      peak: 0,
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

  const rms = Math.sqrt(sumSquares / samples.length);

  return {
    rms,
    rmsDbfs: rmsDbfsFromRms(rms),
    peak,
  };
}

function concatFloat32Arrays(chunks: Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Float32Array(totalLength);

  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function createEmptyLatency(): VoiceSessionLatency {
  return {
    sessionStartedAt: null,
    speechStartedAt: null,
    speechEndedAt: null,
    transcriptionStartedAt: null,
    transcriptionEndedAt: null,
    routingStartedAt: null,
    routingEndedAt: null,
    responseStartedAt: null,
    speakingStartedAt: null,
    speakingEndedAt: null,
  };
}

export class VoiceSession {
  private readonly options: VoiceSessionOptions;

  private state: VoiceSessionState = "idle";
  private previousState: VoiceSessionState | null = null;

  private sampleRate = 16_000;
  private frames: VoiceAudioFrame[] = [];
  private rawChunks: Float32Array[] = [];
  private turnChunks: Float32Array[] = [];

  private currentTranscript = "";
  private finalTranscript = "";
  private routeResult: VoiceRouteResult | null = null;
  private pendingToolCall: VoiceToolCall | null = null;

  private turnCount = 0;
  private lastError: string | null = null;
  private latency: VoiceSessionLatency = createEmptyLatency();

  private vadState: InternalVADState = {
    speechMs: 0,
    silenceMs: 0,
    hasSpeechStarted: false,
    speechStartFrameIndex: null,
    lastSpeechFrameIndex: null,
  };

  constructor(options: Partial<VoiceSessionOptions> = {}) {
    this.options = {
      ...DEFAULT_VOICE_SESSION_OPTIONS,
      ...options,
    };
  }

  getSnapshot(): VoiceSessionSnapshot {
    const bufferedSamples = this.turnChunks.reduce(
      (sum, chunk) => sum + chunk.length,
      0,
    );

    return {
      state: this.state,
      previousState: this.previousState,
      isListening:
        this.state === "listening" || this.state === "speech-started",
      isSpeaking: this.state === "speaking",
      isProcessing:
        this.state === "end-of-turn" ||
        this.state === "transcribing" ||
        this.state === "routing" ||
        this.state === "responding",
      canBargeIn:
        this.options.bargeInEnabled &&
        (this.state === "speaking" || this.state === "responding"),
      currentTranscript: this.currentTranscript,
      finalTranscript: this.finalTranscript,
      routeResult: this.routeResult,
      pendingToolCall: this.pendingToolCall,
      bufferedSamples,
      bufferedDurationMs: (bufferedSamples / this.sampleRate) * 1000,
      speechDurationMs: this.vadState.speechMs,
      silenceDurationMs: this.vadState.silenceMs,
      turnCount: this.turnCount,
      lastError: this.lastError,
      latency: { ...this.latency },
    };
  }

  startListening(sampleRate = 16_000): void {
    this.sampleRate = sampleRate;
    this.frames = [];
    this.rawChunks = [];
    this.turnChunks = [];
    this.currentTranscript = "";
    this.finalTranscript = "";
    this.routeResult = null;
    this.pendingToolCall = null;
    this.lastError = null;
    this.latency = createEmptyLatency();
    this.latency.sessionStartedAt = nowMs();
    this.resetVad();

    this.transition("listening");
  }

  stop(): void {
    this.resetVad();
    this.frames = [];
    this.rawChunks = [];
    this.turnChunks = [];
    this.currentTranscript = "";
    this.transition("idle");
  }

  reset(): void {
    this.state = "idle";
    this.previousState = null;
    this.sampleRate = 16_000;
    this.frames = [];
    this.rawChunks = [];
    this.turnChunks = [];
    this.currentTranscript = "";
    this.finalTranscript = "";
    this.routeResult = null;
    this.pendingToolCall = null;
    this.turnCount = 0;
    this.lastError = null;
    this.latency = createEmptyLatency();
    this.resetVad();
  }

  /**
   * Push a raw PCM chunk into the session.
   *
   * The caller can send any chunk size.
   * This session slices it into 20ms frames internally.
   */
  pushAudioChunk(chunk: Float32Array, sampleRate = this.sampleRate): void {
    if (this.state === "idle" || this.state === "error") {
      return;
    }

    if (chunk.length === 0) {
      return;
    }

    this.sampleRate = sampleRate;
    this.rawChunks.push(chunk);

    const frameSize = Math.max(
      1,
      Math.round((sampleRate * this.options.frameMs) / 1000),
    );

    for (let offset = 0; offset < chunk.length; offset += frameSize) {
      const frameSamples = chunk.slice(
        offset,
        Math.min(chunk.length, offset + frameSize),
      );

      this.pushAudioFrame(frameSamples, sampleRate);
    }
  }

  /**
   * Push an already framed PCM block, usually 20ms.
   */
  pushAudioFrame(samples: Float32Array, sampleRate = this.sampleRate): void {
    if (samples.length === 0) {
      return;
    }

    this.sampleRate = sampleRate;

    const stats = analyzeFrame(samples);
    const frame: VoiceAudioFrame = {
      samples,
      sampleRate,
      timestampMs: nowMs(),
      durationMs: (samples.length / sampleRate) * 1000,
      rms: stats.rms,
      rmsDbfs: stats.rmsDbfs,
      peak: stats.peak,
    };

    this.frames.push(frame);

    this.emit({
      type: "AUDIO_FRAME",
      frame,
      snapshot: this.getSnapshot(),
    });

    this.handleVadFrame(frame);
  }

  /**
   * Use this when an external model-based VAD worker emits speech.
   */
  markSpeechStart(): void {
    if (this.state === "speaking" || this.state === "responding") {
      this.handleBargeIn();
      return;
    }

    if (!this.vadState.hasSpeechStarted) {
      this.vadState.hasSpeechStarted = true;
      this.vadState.speechStartFrameIndex = Math.max(0, this.frames.length - 1);
      this.latency.speechStartedAt = nowMs();
      this.transition("speech-started");

      this.emit({
        type: "SPEECH_START",
        timestampMs: nowMs(),
        snapshot: this.getSnapshot(),
      });
    }
  }

  /**
   * Use this when an external VAD / turn detector says user is done.
   */
  markEndOfTurn(): void {
    if (
      this.state !== "speech-started" &&
      this.state !== "listening" &&
      this.state !== "barge-in"
    ) {
      return;
    }

    this.latency.speechEndedAt = nowMs();
    this.transition("end-of-turn");

    const audio = this.buildTurnAudio();

    this.emit({
      type: "END_OF_TURN",
      audio,
      sampleRate: this.sampleRate,
      durationMs: (audio.length / this.sampleRate) * 1000,
      snapshot: this.getSnapshot(),
    });
  }

  markTranscribing(): void {
    this.latency.transcriptionStartedAt = nowMs();
    this.transition("transcribing");
  }

  setPartialTranscript(text: string): void {
    this.currentTranscript = normalizeText(text);

    this.emit({
      type: "TRANSCRIPT_PARTIAL",
      text: this.currentTranscript,
      snapshot: this.getSnapshot(),
    });
  }

  setFinalTranscript(text: string): void {
    this.finalTranscript = normalizeText(text);
    this.currentTranscript = this.finalTranscript;
    this.latency.transcriptionEndedAt = nowMs();

    this.emit({
      type: "TRANSCRIPT_FINAL",
      text: this.finalTranscript,
      snapshot: this.getSnapshot(),
    });
  }

  markRouting(): void {
    this.latency.routingStartedAt = nowMs();
    this.transition("routing");
  }

  setRouteResult(result: VoiceRouteResult): void {
    this.routeResult = result;
    this.pendingToolCall = result.toolCall ?? null;
    this.latency.routingEndedAt = nowMs();

    this.emit({
      type: "ROUTE_RESULT",
      result,
      snapshot: this.getSnapshot(),
    });

    if (result.toolCall) {
      this.emit({
        type: "TOOL_CALL",
        toolCall: result.toolCall,
        routeResult: result,
        snapshot: this.getSnapshot(),
      });
    }
  }

  markResponding(): void {
    this.latency.responseStartedAt = nowMs();
    this.transition("responding");
  }

  markSpeaking(): void {
    this.latency.speakingStartedAt = nowMs();
    this.transition("speaking");
  }

  markSpeakingDone(): void {
    this.latency.speakingEndedAt = nowMs();
    this.turnCount += 1;
    this.resetForNextTurn();
    this.transition("idle");
  }

  fail(error: unknown): void {
    this.lastError = error instanceof Error ? error.message : String(error);
    this.transition("error");

    this.emit({
      type: "ERROR",
      error: this.lastError,
      snapshot: this.getSnapshot(),
    });
  }

  private handleVadFrame(frame: VoiceAudioFrame): void {
    const isSpeech = frame.rmsDbfs >= this.options.vadThresholdDbfs;
    const isBargeInSpeech =
      frame.rmsDbfs >= this.options.bargeInThresholdDbfs && frame.peak > 0.01;

    if (
      this.options.bargeInEnabled &&
      (this.state === "speaking" || this.state === "responding") &&
      isBargeInSpeech
    ) {
      this.handleBargeIn();
      return;
    }

    if (this.state !== "listening" && this.state !== "speech-started") {
      return;
    }

    if (isSpeech) {
      this.vadState.speechMs += frame.durationMs;
      this.vadState.silenceMs = 0;
      this.vadState.lastSpeechFrameIndex = this.frames.length - 1;

      if (
        !this.vadState.hasSpeechStarted &&
        this.vadState.speechMs >= this.options.minSpeechMs
      ) {
        this.vadState.hasSpeechStarted = true;
        this.vadState.speechStartFrameIndex = Math.max(
          0,
          this.frames.length -
            Math.ceil(this.options.minSpeechMs / this.options.frameMs),
        );

        this.latency.speechStartedAt = nowMs();
        this.transition("speech-started");

        this.emit({
          type: "SPEECH_START",
          timestampMs: nowMs(),
          snapshot: this.getSnapshot(),
        });
      }

      if (this.vadState.hasSpeechStarted) {
        this.turnChunks.push(frame.samples);
      }

      if (this.vadState.speechMs >= this.options.maxUtteranceMs) {
        this.markEndOfTurn();
      }

      return;
    }

    if (!isSpeech && this.vadState.hasSpeechStarted) {
      this.vadState.silenceMs += frame.durationMs;

      /**
       * Keep post-speech frames so final phonemes are not clipped.
       */
      if (this.vadState.silenceMs <= this.options.postSpeechPaddingMs) {
        this.turnChunks.push(frame.samples);
      }

      if (this.vadState.silenceMs >= this.options.silenceHangoverMs) {
        this.emit({
          type: "SPEECH_END",
          timestampMs: nowMs(),
          snapshot: this.getSnapshot(),
        });

        this.markEndOfTurn();
      }
    }
  }

  private handleBargeIn(): void {
    this.transition("barge-in");
    this.resetVad();
    this.turnChunks = [];
    this.currentTranscript = "";
    this.finalTranscript = "";
    this.routeResult = null;
    this.pendingToolCall = null;
    this.latency.speechStartedAt = nowMs();

    this.emit({
      type: "BARGE_IN",
      timestampMs: nowMs(),
      snapshot: this.getSnapshot(),
    });

    this.transition("listening");
  }

  private buildTurnAudio(): Float32Array {
    const speechStartIndex = this.vadState.speechStartFrameIndex;
    const lastSpeechIndex = this.vadState.lastSpeechFrameIndex;

    if (speechStartIndex === null || lastSpeechIndex === null) {
      return concatFloat32Arrays(this.turnChunks);
    }

    const preFrames = Math.ceil(
      this.options.preSpeechPaddingMs / this.options.frameMs,
    );

    const postFrames = Math.ceil(
      this.options.postSpeechPaddingMs / this.options.frameMs,
    );

    const startIndex = clamp(
      speechStartIndex - preFrames,
      0,
      this.frames.length,
    );
    const endIndex = clamp(
      lastSpeechIndex + 1 + postFrames,
      startIndex,
      this.frames.length,
    );

    const selectedFrames = this.frames
      .slice(startIndex, endIndex)
      .map((frame) => frame.samples);

    return concatFloat32Arrays(selectedFrames);
  }

  private resetForNextTurn(): void {
    this.frames = [];
    this.rawChunks = [];
    this.turnChunks = [];
    this.currentTranscript = "";
    this.finalTranscript = "";
    this.routeResult = null;
    this.pendingToolCall = null;
    this.lastError = null;
    this.latency = createEmptyLatency();
    this.resetVad();
  }

  private resetVad(): void {
    this.vadState = {
      speechMs: 0,
      silenceMs: 0,
      hasSpeechStarted: false,
      speechStartFrameIndex: null,
      lastSpeechFrameIndex: null,
    };
  }

  private transition(nextState: VoiceSessionState): void {
    if (this.state === nextState) {
      return;
    }

    const previousState = this.state;

    this.previousState = previousState;
    this.state = nextState;

    this.emit({
      type: "STATE_CHANGED",
      state: nextState,
      previousState,
      snapshot: this.getSnapshot(),
    });
  }

  private emit(event: VoiceSessionOutputEvent): void {
    this.options.onEvent?.(event);
  }
}

export function createVoiceSession(
  options: Partial<VoiceSessionOptions> = {},
): VoiceSession {
  return new VoiceSession(options);
}
