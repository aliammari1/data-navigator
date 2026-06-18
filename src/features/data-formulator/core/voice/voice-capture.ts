"use client";

/**
 * Voice Capture — Raw PCM via Web Audio API
 * Bypasses MediaRecorder/WebM issues. Captures Float32Array directly.
 *
 * Notes:
 * - This still uses ScriptProcessorNode for compatibility with your current app.
 * - The next upgrade should move the PCM processor to AudioWorkletNode.
 * - The returned sampleRate is the real AudioContext sample rate, not assumed.
 * - The live callback emits 20 ms frames for VoiceSession turn-taking.
 */

export type VoiceCaptureMode = "push-to-talk" | "hold-to-talk" | "continuous";

export interface VoiceCaptureState {
  mode: VoiceCaptureMode;
  isCapturing: boolean;
  audioLevel: number;
  durationMs: number;
  error: string | null;
}

export interface CapturedAudio {
  samples: Float32Array;
  sampleRate: number;
  durationMs: number;
  rms: number;
  peak: number;
}

const TARGET_SAMPLE_RATE = 16000;
const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096;
const FRAME_DURATION_MS = 20;

/** Gate noisy capture diagnostics out of production builds. */
const VOICE_DEBUG = process.env.NODE_ENV !== "production";

function debugLog(...args: unknown[]): void {
  if (VOICE_DEBUG) {
    console.log(...args);
  }
}

function debugWarn(...args: unknown[]): void {
  if (VOICE_DEBUG) {
    console.warn(...args);
  }
}

let audioContext: AudioContext | null = null;
let micStream: MediaStream | null = null;
let scriptNode: ScriptProcessorNode | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let analyserNode: AnalyserNode | null = null;
let silentGainNode: GainNode | null = null;

let captureStartTime = 0;
let captureSampleRate = TARGET_SAMPLE_RATE;
let currentCaptureMode: VoiceCaptureMode = "push-to-talk";
let audioChunks: Float32Array[] = [];
let frameCarry = new Float32Array(0);
let levelInterval: ReturnType<typeof setInterval> | null = null;

function formatMicrophoneError(error: unknown): string {
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

    if (error.name === "OverconstrainedError") {
      return "The requested microphone settings are not supported by this device.";
    }

    return `${error.name}: ${error.message}`;
  }

  if (error instanceof Error) return error.message;

  return "Microphone access failed.";
}

function getCaptureDurationMs(): number {
  return captureStartTime > 0
    ? Math.round(performance.now() - captureStartTime)
    : 0;
}

function emitState(
  mode: VoiceCaptureMode,
  onStateChange: (state: VoiceCaptureState) => void,
  patch: Partial<VoiceCaptureState>,
): void {
  onStateChange({
    mode,
    isCapturing: false,
    audioLevel: 0,
    durationMs: getCaptureDurationMs(),
    error: null,
    ...patch,
  });
}

function safeDisconnect(node: AudioNode | null): void {
  if (!node) return;

  try {
    node.disconnect();
  } catch {
    // Ignore disconnect errors. Nodes may already be disconnected.
  }
}

function cleanupAudioGraph(): void {
  if (levelInterval) {
    clearInterval(levelInterval);
    levelInterval = null;
  }

  if (scriptNode) {
    scriptNode.onaudioprocess = null;
    safeDisconnect(scriptNode);
    scriptNode = null;
  }

  safeDisconnect(sourceNode);
  sourceNode = null;

  safeDisconnect(analyserNode);
  analyserNode = null;

  safeDisconnect(silentGainNode);
  silentGainNode = null;

  if (micStream) {
    for (const track of micStream.getTracks()) {
      track.stop();
    }

    micStream = null;
  }

  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
}

function analyzePcm(samples: Float32Array): { rms: number; peak: number } {
  if (samples.length === 0) {
    return { rms: 0, peak: 0 };
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
  };
}

function computeAudioLevelFromAnalyser(analyser: AnalyserNode): number {
  const dataArray = new Uint8Array(analyser.fftSize);

  analyser.getByteTimeDomainData(dataArray);

  let sumSquares = 0;

  for (let i = 0; i < dataArray.length; i++) {
    const centered = (dataArray[i] - 128) / 128;
    sumSquares += centered * centered;
  }

  const rms = Math.sqrt(sumSquares / dataArray.length);

  /**
   * Multiply a little so quiet microphones still show visible feedback.
   * Clamp to 1 for UI safety.
   */
  return Math.min(1, rms * 4);
}

function concatFloat32(a: Float32Array, b: Float32Array): Float32Array {
  if (a.length === 0) return b;
  if (b.length === 0) return a;

  const result = new Float32Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);

  return result;
}

/**
 * Emits 20 ms frames for the real-time voice session.
 *
 * ScriptProcessorNode gives larger chunks, usually 4096 samples.
 * The voice assistant pipeline wants smaller turn-taking frames,
 * so this function slices the stream into stable 20 ms frames.
 */
function emitRealtimeFrames(
  chunk: Float32Array,
  sampleRate: number,
  onAudioChunk: (chunk: Float32Array, sampleRate: number) => void,
): void {
  const frameSize = Math.max(
    1,
    Math.round((sampleRate * FRAME_DURATION_MS) / 1000),
  );

  const buffer = concatFloat32(frameCarry, chunk);
  let offset = 0;

  while (offset + frameSize <= buffer.length) {
    const frame = buffer.slice(offset, offset + frameSize);
    onAudioChunk(frame, sampleRate);
    offset += frameSize;
  }

  frameCarry =
    offset < buffer.length ? buffer.slice(offset) : new Float32Array(0);
}

export async function startVoiceCapture(
  mode: VoiceCaptureMode,
  onStateChange: (state: VoiceCaptureState) => void,
  onAudioChunk: (chunk: Float32Array, sampleRate: number) => void,
): Promise<void> {
  try {
    cleanupAudioGraph();

    audioChunks = [];
    frameCarry = new Float32Array(0);
    captureStartTime = 0;
    captureSampleRate = TARGET_SAMPLE_RATE;
    currentCaptureMode = mode;

    if (typeof navigator === "undefined") {
      throw new Error("Voice capture is only available in the browser.");
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "navigator.mediaDevices.getUserMedia is unavailable. Check Electron media permissions.",
      );
    }

    debugLog("[voice-capture] requesting microphone...");

    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });

    const tracks = micStream.getAudioTracks();

    debugLog("[voice-capture] microphone stream granted", {
      trackCount: tracks.length,
      tracks: tracks.map((track) => ({
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        settings: track.getSettings(),
      })),
    });

    if (tracks.length === 0) {
      throw new Error(
        "Microphone permission was granted, but no audio track was returned.",
      );
    }

    audioContext = new AudioContext({
      sampleRate: TARGET_SAMPLE_RATE,
    });

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    captureSampleRate = audioContext.sampleRate;

    sourceNode = audioContext.createMediaStreamSource(micStream);
    scriptNode = audioContext.createScriptProcessor(
      SCRIPT_PROCESSOR_BUFFER_SIZE,
      1,
      1,
    );

    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNode.smoothingTimeConstant = 0.2;

    silentGainNode = audioContext.createGain();
    silentGainNode.gain.value = 0;

    captureStartTime = performance.now();

    scriptNode.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);

      const clone = new Float32Array(input.length);
      clone.set(input);

      /**
       * Full capture buffer for stopVoiceCapture().
       */
      audioChunks.push(clone);

      /**
       * Real-time 20 ms frames for VoiceSession turn-taking.
       */
      emitRealtimeFrames(clone, captureSampleRate, onAudioChunk);
    };

    /**
     * Important:
     * ScriptProcessorNode only processes while connected to an output.
     * We route it through a zero-gain node, so there is no audible mic feedback.
     */
    sourceNode.connect(scriptNode);
    scriptNode.connect(silentGainNode);
    silentGainNode.connect(audioContext.destination);

    sourceNode.connect(analyserNode);

    levelInterval = setInterval(() => {
      if (!analyserNode) return;

      emitState(mode, onStateChange, {
        isCapturing: true,
        audioLevel: computeAudioLevelFromAnalyser(analyserNode),
        durationMs: getCaptureDurationMs(),
        error: null,
      });
    }, 100);

    emitState(mode, onStateChange, {
      isCapturing: true,
      audioLevel: 0,
      durationMs: 0,
      error: null,
    });
  } catch (error) {
    debugWarn("[voice-capture] failed to start microphone", error);

    cleanupAudioGraph();

    audioChunks = [];
    frameCarry = new Float32Array(0);
    captureStartTime = 0;

    emitState(mode, onStateChange, {
      isCapturing: false,
      audioLevel: 0,
      durationMs: 0,
      error: formatMicrophoneError(error),
    });
  }
}

export function stopVoiceCapture(
  onStateChange?: (state: VoiceCaptureState) => void,
): CapturedAudio | null {
  const durationMs = getCaptureDurationMs();
  const sampleRate = captureSampleRate || TARGET_SAMPLE_RATE;
  const mode = currentCaptureMode;

  /**
   * Copy chunks before cleanup/reset.
   */
  const chunks = audioChunks;
  audioChunks = [];
  frameCarry = new Float32Array(0);

  cleanupAudioGraph();

  if (chunks.length === 0) {
    debugWarn("[voice-capture] stopped with no captured chunks");

    if (onStateChange) {
      onStateChange({
        mode,
        isCapturing: false,
        audioLevel: 0,
        durationMs,
        error: "No audio was captured.",
      });
    }

    captureStartTime = 0;

    return null;
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);

  if (totalLength === 0) {
    debugWarn("[voice-capture] stopped with empty captured chunks");

    if (onStateChange) {
      onStateChange({
        mode,
        isCapturing: false,
        audioLevel: 0,
        durationMs,
        error: "Captured audio was empty.",
      });
    }

    captureStartTime = 0;

    return null;
  }

  const result = new Float32Array(totalLength);

  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  /**
   * Important:
   * Analyze after chunks are copied into result.
   */
  const { rms, peak } = analyzePcm(result);

  debugLog("[voice-capture] captured PCM", {
    chunks: chunks.length,
    samples: result.length,
    sampleRate,
    seconds: result.length / sampleRate,
    durationMs,
    rms,
    peak,
  });

  if (onStateChange) {
    onStateChange({
      mode,
      isCapturing: false,
      audioLevel: 0,
      durationMs,
      error: null,
    });
  }

  captureStartTime = 0;

  return {
    samples: result,
    sampleRate,
    durationMs,
    rms,
    peak,
  };
}
