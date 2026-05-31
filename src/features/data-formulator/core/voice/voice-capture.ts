"use client";

/**
 * Voice Capture — Raw PCM via Web Audio API
 * Bypasses MediaRecorder/WebM issues. Captures Float32Array directly.
 */

export type VoiceCaptureMode = "push-to-talk" | "hold-to-talk" | "continuous";

export interface VoiceCaptureState {
  mode: VoiceCaptureMode;
  isCapturing: boolean;
  audioLevel: number;
  durationMs: number;
  error: string | null;
}

let audioContext: AudioContext | null = null;
let micStream: MediaStream | null = null;
let scriptNode: ScriptProcessorNode | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let analyserNode: AnalyserNode | null = null;
let captureStartTime = 0;
let audioChunks: Float32Array[] = [];
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

function emitState(
  mode: VoiceCaptureMode,
  onStateChange: (state: VoiceCaptureState) => void,
  patch: Partial<VoiceCaptureState>,
): void {
  onStateChange({
    mode,
    isCapturing: false,
    audioLevel: 0,
    durationMs:
      captureStartTime > 0
        ? Math.round(performance.now() - captureStartTime)
        : 0,
    error: null,
    ...patch,
  });
}

function cleanupAudioGraph(): void {
  if (levelInterval) {
    clearInterval(levelInterval);
    levelInterval = null;
  }

  if (scriptNode) {
    scriptNode.disconnect();
    scriptNode.onaudioprocess = null;
    scriptNode = null;
  }

  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }

  if (analyserNode) {
    analyserNode.disconnect();
    analyserNode = null;
  }

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

export async function startVoiceCapture(
  mode: VoiceCaptureMode,
  onStateChange: (state: VoiceCaptureState) => void,
  onAudioChunk: (chunk: Float32Array) => void,
): Promise<void> {
  try {
    cleanupAudioGraph();

    if (typeof navigator === "undefined") {
      throw new Error("Voice capture is only available in the browser.");
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "navigator.mediaDevices.getUserMedia is unavailable. Check Electron media permissions.",
      );
    }

    console.log("[voice-capture] requesting microphone...");

    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });

    const tracks = micStream.getAudioTracks();

    console.log("[voice-capture] microphone stream granted", {
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
      sampleRate: 16000,
    });

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    sourceNode = audioContext.createMediaStreamSource(micStream);
    scriptNode = audioContext.createScriptProcessor(4096, 1, 1);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;

    audioChunks = [];
    captureStartTime = performance.now();

    scriptNode.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);

      const clone = new Float32Array(input.length);
      clone.set(input);

      audioChunks.push(clone);
      onAudioChunk(clone);
    };

    /**
     * Important:
     * ScriptProcessorNode only runs while connected to an output.
     * We keep it connected, but its output is silence because we never write to it.
     */
    sourceNode.connect(scriptNode);
    scriptNode.connect(audioContext.destination);

    sourceNode.connect(analyserNode);

    const dataArray = new Uint8Array(analyserNode.frequencyBinCount);

    levelInterval = setInterval(() => {
      if (!analyserNode) return;

      analyserNode.getByteFrequencyData(dataArray);

      const average =
        dataArray.reduce((total, value) => total + value, 0) / dataArray.length;

      emitState(mode, onStateChange, {
        isCapturing: true,
        audioLevel: average / 255,
        durationMs: Math.round(performance.now() - captureStartTime),
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
    console.error("[voice-capture] failed to start microphone", error);

    cleanupAudioGraph();

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
): Float32Array | null {
  const durationMs =
    captureStartTime > 0 ? Math.round(performance.now() - captureStartTime) : 0;

  cleanupAudioGraph();

  if (audioChunks.length === 0) {
    console.warn("[voice-capture] stopped with no captured chunks");

    if (onStateChange) {
      onStateChange({
        mode: "push-to-talk",
        isCapturing: false,
        audioLevel: 0,
        durationMs,
        error: "No audio was captured.",
      });
    }

    return null;
  }

  const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);

  const result = new Float32Array(totalLength);

  let offset = 0;

  for (const chunk of audioChunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  console.log("[voice-capture] captured PCM", {
    chunks: audioChunks.length,
    samples: result.length,
    seconds: result.length / 16000,
    durationMs,
  });

  audioChunks = [];

  if (onStateChange) {
    onStateChange({
      mode: "push-to-talk",
      isCapturing: false,
      audioLevel: 0,
      durationMs,
      error: null,
    });
  }

  return result;
}
