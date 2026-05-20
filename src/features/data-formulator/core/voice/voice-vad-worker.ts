/// <reference lib="webworker" />

/**
 * VAD Worker
 * Voice Activity Detection using Silero-style ONNX models.
 * Marks speech segments to avoid sending silence to ASR.
 */

export interface VADSegment {
  start: number;
  end: number;
  isSpeech: boolean;
}

export interface VADProcessRequest {
  type: "PROCESS_AUDIO";
  audioBuffer: ArrayBuffer;
  sampleRate: number;
}

export type VADProcessResponse =
  | { type: "VAD_SEGMENTS"; segments: VADSegment[] }
  | { type: "VAD_ERROR"; error: string };

// Simple energy-based VAD as fallback until a real Silero model is loaded
// This keeps the pipeline functional offline without heavy model downloads.
function energyBasedVAD(
  samples: Float32Array,
  sampleRate: number,
  frameMs = 30,
  threshold = 0.01,
  minSpeechMs = 200,
): VADSegment[] {
  const frameSize = Math.floor((sampleRate * frameMs) / 1000);
  const minSpeechFrames = Math.floor(minSpeechMs / frameMs);
  const segments: VADSegment[] = [];

  let inSpeech = false;
  let speechStart = 0;
  let speechFrameCount = 0;

  for (let i = 0; i < samples.length; i += frameSize) {
    const frame = samples.subarray(i, Math.min(i + frameSize, samples.length));
    let sum = 0;
    for (let j = 0; j < frame.length; j++) {
      sum += frame[j] * frame[j];
    }
    const energy = Math.sqrt(sum / frame.length);
    const time = i / sampleRate;

    if (energy > threshold) {
      if (!inSpeech) {
        inSpeech = true;
        speechStart = time;
        speechFrameCount = 0;
      }
      speechFrameCount++;
    } else {
      if (inSpeech) {
        if (speechFrameCount >= minSpeechFrames) {
          segments.push({
            start: speechStart,
            end: time,
            isSpeech: true,
          });
        }
        inSpeech = false;
        speechFrameCount = 0;
      }
      // Mark silence gaps explicitly for downstream processing
      if (segments.length > 0 && segments[segments.length - 1].isSpeech) {
        segments.push({ start: time, end: time + frameMs / 1000, isSpeech: false });
      }
    }
  }

  // Close final segment
  if (inSpeech && speechFrameCount >= minSpeechFrames) {
    segments.push({
      start: speechStart,
      end: samples.length / sampleRate,
      isSpeech: true,
    });
  }

  return segments;
}

function decodeAudioBuffer(buffer: ArrayBuffer): Float32Array {
  // Assume raw PCM f32 for now; in production, decode from webm/ogg via AudioDecoder
  const view = new DataView(buffer);
  if (view.byteLength % 4 !== 0) {
    // Try to interpret as Int16 and convert to Float32
    const int16 = new Int16Array(buffer);
    const f32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      f32[i] = int16[i] / 32768;
    }
    return f32;
  }
  return new Float32Array(buffer);
}

self.onmessage = (e: MessageEvent<VADProcessRequest>) => {
  const { type, audioBuffer, sampleRate } = e.data;

  if (type !== "PROCESS_AUDIO") {
    self.postMessage({ type: "VAD_ERROR", error: "Unknown request type" } as VADProcessResponse);
    return;
  }

  try {
    const samples = decodeAudioBuffer(audioBuffer);
    const segments = energyBasedVAD(samples, sampleRate);
    self.postMessage({ type: "VAD_SEGMENTS", segments } as VADProcessResponse);
  } catch (err) {
    self.postMessage({
      type: "VAD_ERROR",
      error: err instanceof Error ? err.message : String(err),
    } as VADProcessResponse);
  }
};
