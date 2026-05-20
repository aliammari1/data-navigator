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
let captureStartTime = 0;
let audioChunks: Float32Array[] = [];
let levelInterval: ReturnType<typeof setInterval> | null = null;

export async function startVoiceCapture(
  mode: VoiceCaptureMode,
  onStateChange: (state: VoiceCaptureState) => void,
  onAudioChunk: (chunk: Float32Array) => void,
): Promise<void> {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000, // Request 16kHz directly
        channelCount: 1,   // Mono
      },
    });

    audioContext = new AudioContext({ sampleRate: 16000 });
    sourceNode = audioContext.createMediaStreamSource(micStream);
    scriptNode = audioContext.createScriptProcessor(4096, 1, 1);

    audioChunks = [];
    captureStartTime = performance.now();

    scriptNode.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      // Clone the data (buffer is reused by the browser)
      const clone = new Float32Array(input.length);
      clone.set(input);
      audioChunks.push(clone);
      onAudioChunk(clone);
    };

    sourceNode.connect(scriptNode);
    scriptNode.connect(audioContext.destination);

    // Report audio level periodically
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    sourceNode.connect(analyser);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    levelInterval = setInterval(() => {
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      onStateChange({
        mode,
        isCapturing: true,
        audioLevel: avg / 255,
        durationMs: Math.round(performance.now() - captureStartTime),
        error: null,
      });
    }, 100);
  } catch (err) {
    onStateChange({
      mode,
      isCapturing: false,
      audioLevel: 0,
      durationMs: 0,
      error: err instanceof Error ? err.message : "Microphone access denied",
    });
  }
}

export function stopVoiceCapture(onStateChange?: (state: VoiceCaptureState) => void): Float32Array | null {
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

  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }

  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }

  // Concatenate all chunks into a single Float32Array
  if (audioChunks.length === 0) return null;
  const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of audioChunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  audioChunks = [];

  if (onStateChange) {
    onStateChange({
      mode: "push-to-talk",
      isCapturing: false,
      audioLevel: 0,
      durationMs: Math.round(performance.now() - captureStartTime),
      error: null,
    });
  }

  return result;
}
