(() => {
  // src/features/data-formulator/core/voice/voice-vad-worker.ts
  var workerSelf = self;
  var DEFAULT_OPTIONS = {
    frameMs: 20,
    speechThresholdDbfs: -40,
    bargeInThresholdDbfs: -36,
    minSpeechMs: 250,
    silenceHangoverMs: 500,
    maxSpeechMs: 12e3,
    speechPaddingMs: 160,
    adaptiveBatchThreshold: true,
  };
  var options = { ...DEFAULT_OPTIONS };
  var state = createInitialState();
  function createInitialState() {
    return {
      inSpeech: false,
      pendingSpeechMs: 0,
      speechMs: 0,
      silenceMs: 0,
      utteranceMs: 0,
      emittedStart: false,
    };
  }
  function postMessage(message) {
    workerSelf.postMessage(message);
  }
  function postError(error) {
    postMessage({
      type: "VAD_ERROR",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  function configure(next = {}) {
    options = normalizeOptions({
      ...options,
      ...next,
    });
  }
  function normalizeOptions(value) {
    return {
      frameMs: clampNumber(value.frameMs, 5, 100, DEFAULT_OPTIONS.frameMs),
      speechThresholdDbfs: clampNumber(
        value.speechThresholdDbfs,
        -90,
        -5,
        DEFAULT_OPTIONS.speechThresholdDbfs,
      ),
      bargeInThresholdDbfs: clampNumber(
        value.bargeInThresholdDbfs,
        -90,
        -5,
        DEFAULT_OPTIONS.bargeInThresholdDbfs,
      ),
      minSpeechMs: clampNumber(value.minSpeechMs, 40, 2e3, DEFAULT_OPTIONS.minSpeechMs),
      silenceHangoverMs: clampNumber(
        value.silenceHangoverMs,
        80,
        5e3,
        DEFAULT_OPTIONS.silenceHangoverMs,
      ),
      maxSpeechMs: clampNumber(value.maxSpeechMs, 1e3, 12e4, DEFAULT_OPTIONS.maxSpeechMs),
      speechPaddingMs: clampNumber(value.speechPaddingMs, 0, 2e3, DEFAULT_OPTIONS.speechPaddingMs),
      adaptiveBatchThreshold:
        typeof value.adaptiveBatchThreshold === "boolean"
          ? value.adaptiveBatchThreshold
          : DEFAULT_OPTIONS.adaptiveBatchThreshold,
    };
  }
  function clampNumber(value, min, max, fallback) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, value));
  }
  function nowMs() {
    if (typeof performance !== "undefined") {
      return performance.now();
    }
    return Date.now();
  }
  function decodePcmPayload(payload) {
    if (!payload) {
      throw new Error("No PCM payload was provided.");
    }
    if (payload instanceof Float32Array) {
      return payload;
    }
    if (payload instanceof ArrayBuffer) {
      return decodeAudioBuffer(payload);
    }
    if (Array.isArray(payload)) {
      return Float32Array.from(payload);
    }
    throw new Error("Unsupported PCM payload.");
  }
  function decodeAudioBuffer(buffer) {
    if (buffer.byteLength === 0) {
      throw new Error("audioBuffer is empty.");
    }
    if (buffer.byteLength % 4 === 0) {
      const samples = new Float32Array(buffer);
      let validCount = 0;
      const probeCount = Math.min(samples.length, 512);
      for (let i = 0; i < probeCount; i++) {
        const value = samples[i];
        if (Number.isFinite(value) && Math.abs(value) <= 1.5) {
          validCount++;
        }
      }
      if (probeCount === 0 || validCount / probeCount > 0.9) {
        return samples;
      }
    }
    if (buffer.byteLength % 2 !== 0) {
      throw new Error("Unsupported PCM buffer format.");
    }
    const int16 = new Int16Array(buffer);
    const f32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      f32[i] = Math.max(-1, Math.min(1, int16[i] / 32768));
    }
    return f32;
  }
  function rmsDbfsFromRms(rms) {
    return 20 * Math.log10(Math.max(rms, 1e-10));
  }
  function analyzeSamples(samples) {
    if (samples.length === 0) {
      return { rms: 0, rmsDbfs: -200, peak: 0 };
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
  function frameRms(samples, startSample, endSample) {
    const length = Math.max(0, endSample - startSample);
    if (length === 0) return 0;
    let sumSquares = 0;
    for (let i = startSample; i < endSample; i++) {
      const sample = Number.isFinite(samples[i]) ? samples[i] : 0;
      sumSquares += sample * sample;
    }
    return Math.sqrt(sumSquares / length);
  }
  function computeAdaptiveThreshold(frameEnergies, baseThreshold) {
    if (frameEnergies.length === 0) return baseThreshold;
    const sorted = [...frameEnergies].sort((a, b) => a - b);
    const p20Index = Math.floor(sorted.length * 0.2);
    const noiseFloor = sorted[Math.min(sorted.length - 1, p20Index)] ?? 0;
    return Math.max(baseThreshold, noiseFloor * 3);
  }
  function processFrame(request) {
    if (!Number.isFinite(request.sampleRate) || request.sampleRate <= 0) {
      throw new Error("sampleRate must be a positive number.");
    }
    const frame = decodePcmPayload(request.frame);
    if (frame.length === 0) {
      throw new Error("Frame is empty.");
    }
    const stats = analyzeSamples(frame);
    const frameDurationMs = (frame.length / request.sampleRate) * 1e3;
    const timestampMs = request.timestampMs ?? nowMs();
    const assistantSpeaking = Boolean(request.assistantSpeaking);
    const speechThreshold = assistantSpeaking
      ? options.bargeInThresholdDbfs
      : options.speechThresholdDbfs;
    const isSpeech = stats.rmsDbfs >= speechThreshold && stats.peak > 5e-3;
    if (assistantSpeaking && isSpeech) {
      postMessage({
        type: "VAD_EVENT",
        event: "BARGE_IN",
        isSpeech: true,
        rms: stats.rms,
        rmsDbfs: stats.rmsDbfs,
        peak: stats.peak,
        speechMs: state.speechMs,
        silenceMs: state.silenceMs,
        utteranceMs: state.utteranceMs,
        frameDurationMs,
        timestampMs,
      });
      state = createInitialState();
      state.inSpeech = true;
      state.emittedStart = true;
      state.pendingSpeechMs = options.minSpeechMs;
      state.speechMs = frameDurationMs;
      state.utteranceMs = frameDurationMs;
      return;
    }
    if (isSpeech) {
      state.pendingSpeechMs += frameDurationMs;
      state.silenceMs = 0;
      if (!state.emittedStart && state.pendingSpeechMs >= options.minSpeechMs) {
        state.inSpeech = true;
        state.emittedStart = true;
        state.speechMs = state.pendingSpeechMs;
        state.utteranceMs = state.speechMs;
        postMessage({
          type: "VAD_EVENT",
          event: "START",
          isSpeech: true,
          rms: stats.rms,
          rmsDbfs: stats.rmsDbfs,
          peak: stats.peak,
          speechMs: state.speechMs,
          silenceMs: state.silenceMs,
          utteranceMs: state.utteranceMs,
          frameDurationMs,
          timestampMs,
        });
        return;
      }
      if (state.emittedStart) {
        state.inSpeech = true;
        state.speechMs += frameDurationMs;
        state.utteranceMs += frameDurationMs;
        if (state.utteranceMs >= options.maxSpeechMs) {
          postMessage({
            type: "VAD_EVENT",
            event: "FORCED_END",
            isSpeech: true,
            rms: stats.rms,
            rmsDbfs: stats.rmsDbfs,
            peak: stats.peak,
            speechMs: state.speechMs,
            silenceMs: state.silenceMs,
            utteranceMs: state.utteranceMs,
            frameDurationMs,
            timestampMs,
          });
          state = createInitialState();
          return;
        }
        postMessage({
          type: "VAD_EVENT",
          event: "SPEECH",
          isSpeech: true,
          rms: stats.rms,
          rmsDbfs: stats.rmsDbfs,
          peak: stats.peak,
          speechMs: state.speechMs,
          silenceMs: state.silenceMs,
          utteranceMs: state.utteranceMs,
          frameDurationMs,
          timestampMs,
        });
        return;
      }
      postFrameOnly({
        isSpeech: true,
        stats,
        frameDurationMs,
        timestampMs,
      });
      return;
    }
    if (state.emittedStart) {
      state.silenceMs += frameDurationMs;
      state.utteranceMs += frameDurationMs;
      if (state.silenceMs >= options.silenceHangoverMs) {
        postMessage({
          type: "VAD_EVENT",
          event: "END",
          isSpeech: false,
          rms: stats.rms,
          rmsDbfs: stats.rmsDbfs,
          peak: stats.peak,
          speechMs: state.speechMs,
          silenceMs: state.silenceMs,
          utteranceMs: state.utteranceMs,
          frameDurationMs,
          timestampMs,
        });
        state = createInitialState();
        return;
      }
      postMessage({
        type: "VAD_EVENT",
        event: "SILENCE",
        isSpeech: false,
        rms: stats.rms,
        rmsDbfs: stats.rmsDbfs,
        peak: stats.peak,
        speechMs: state.speechMs,
        silenceMs: state.silenceMs,
        utteranceMs: state.utteranceMs,
        frameDurationMs,
        timestampMs,
      });
      return;
    }
    state.pendingSpeechMs = 0;
    postFrameOnly({
      isSpeech: false,
      stats,
      frameDurationMs,
      timestampMs,
    });
  }
  function postFrameOnly({ isSpeech, stats, frameDurationMs, timestampMs }) {
    postMessage({
      type: "VAD_FRAME",
      isSpeech,
      rms: stats.rms,
      rmsDbfs: stats.rmsDbfs,
      peak: stats.peak,
      speechMs: state.speechMs,
      silenceMs: state.silenceMs,
      utteranceMs: state.utteranceMs,
      frameDurationMs,
      timestampMs,
    });
  }
  function pushSegment(segments, segment) {
    if (segment.end <= segment.start) return;
    const previous = segments[segments.length - 1];
    if (previous && previous.isSpeech === segment.isSpeech) {
      previous.end = segment.end;
      return;
    }
    segments.push(segment);
  }
  function energyBasedBatchVAD(samples, sampleRate, batchOptions) {
    const totalDurationMs = (samples.length / sampleRate) * 1e3;
    const { rms, peak } = analyzeSamples(samples);
    if (samples.length === 0) {
      return {
        segments: [],
        speechStartSample: null,
        speechEndSample: null,
        speechRatio: 0,
        rms,
        peak,
        speechRms: 0,
        speechDurationMs: 0,
        totalDurationMs,
      };
    }
    const frameSize = Math.max(1, Math.floor((sampleRate * batchOptions.frameMs) / 1e3));
    const minSpeechFrames = Math.max(1, Math.ceil(batchOptions.minSpeechMs / batchOptions.frameMs));
    const minSilenceFrames = Math.max(
      1,
      Math.ceil(batchOptions.silenceHangoverMs / batchOptions.frameMs),
    );
    const paddingSamples = Math.max(
      0,
      Math.floor((sampleRate * batchOptions.speechPaddingMs) / 1e3),
    );
    const frameEnergies = [];
    for (let start = 0; start < samples.length; start += frameSize) {
      const end = Math.min(start + frameSize, samples.length);
      frameEnergies.push(frameRms(samples, start, end));
    }
    const baseThreshold = 10 ** (batchOptions.speechThresholdDbfs / 20);
    const threshold = batchOptions.adaptiveBatchThreshold
      ? computeAdaptiveThreshold(frameEnergies, baseThreshold)
      : baseThreshold;
    const segments = [];
    let inSpeech = false;
    let candidateSpeechStartFrame = 0;
    let speechStartFrame = 0;
    let speechFrameCount = 0;
    let silenceFrameCount = 0;
    let lastSpeechFrame = 0;
    for (let frameIndex = 0; frameIndex < frameEnergies.length; frameIndex++) {
      const energy = frameEnergies[frameIndex];
      const isSpeechFrame = energy >= threshold;
      if (isSpeechFrame) {
        if (!inSpeech && speechFrameCount === 0) {
          candidateSpeechStartFrame = frameIndex;
        }
        speechFrameCount++;
        silenceFrameCount = 0;
        lastSpeechFrame = frameIndex;
        if (!inSpeech && speechFrameCount >= minSpeechFrames) {
          inSpeech = true;
          speechStartFrame = candidateSpeechStartFrame;
          const silenceStartTime2 = segments.length > 0 ? segments[segments.length - 1].end : 0;
          const speechStartTime = Math.max(
            0,
            (speechStartFrame * frameSize - paddingSamples) / sampleRate,
          );
          if (speechStartTime > silenceStartTime2) {
            pushSegment(segments, {
              start: silenceStartTime2,
              end: speechStartTime,
              isSpeech: false,
            });
          }
        }
        continue;
      }
      if (inSpeech) {
        silenceFrameCount++;
        if (silenceFrameCount >= minSilenceFrames) {
          const speechEndFrame = Math.max(speechStartFrame, lastSpeechFrame + 1);
          const speechStartTime = Math.max(
            0,
            (speechStartFrame * frameSize - paddingSamples) / sampleRate,
          );
          const speechEndTime = Math.min(
            samples.length / sampleRate,
            (speechEndFrame * frameSize + paddingSamples) / sampleRate,
          );
          pushSegment(segments, {
            start: speechStartTime,
            end: speechEndTime,
            isSpeech: true,
          });
          inSpeech = false;
          speechFrameCount = 0;
          silenceFrameCount = 0;
          const silenceStartTime2 = speechEndTime;
          const silenceEndTime2 = Math.min(
            samples.length / sampleRate,
            ((frameIndex + 1) * frameSize) / sampleRate,
          );
          if (silenceEndTime2 > silenceStartTime2) {
            pushSegment(segments, {
              start: silenceStartTime2,
              end: silenceEndTime2,
              isSpeech: false,
            });
          }
        }
        continue;
      }
      speechFrameCount = 0;
      const silenceStartTime =
        segments.length > 0
          ? segments[segments.length - 1].end
          : (frameIndex * frameSize) / sampleRate;
      const silenceEndTime = Math.min(
        samples.length / sampleRate,
        ((frameIndex + 1) * frameSize) / sampleRate,
      );
      pushSegment(segments, {
        start: silenceStartTime,
        end: silenceEndTime,
        isSpeech: false,
      });
    }
    if (inSpeech) {
      const speechEndFrame = Math.max(speechStartFrame, lastSpeechFrame + 1);
      pushSegment(segments, {
        start: Math.max(0, (speechStartFrame * frameSize - paddingSamples) / sampleRate),
        end: Math.min(
          samples.length / sampleRate,
          (speechEndFrame * frameSize + paddingSamples) / sampleRate,
        ),
        isSpeech: true,
      });
    }
    const speechSegments = segments.filter((segment) => segment.isSpeech);
    const speechStartSample = speechSegments.length
      ? Math.max(0, Math.floor(speechSegments[0].start * sampleRate))
      : null;
    const speechEndSample = speechSegments.length
      ? Math.min(
          samples.length,
          Math.ceil(speechSegments[speechSegments.length - 1].end * sampleRate),
        )
      : null;
    const speechSamples =
      speechStartSample !== null && speechEndSample !== null
        ? Math.max(0, speechEndSample - speechStartSample)
        : 0;
    const speechSlice =
      speechStartSample !== null && speechEndSample !== null
        ? samples.subarray(speechStartSample, speechEndSample)
        : new Float32Array();
    const speechStats = analyzeSamples(speechSlice);
    return {
      segments,
      speechStartSample,
      speechEndSample,
      speechRatio: speechSamples / Math.max(1, samples.length),
      rms,
      peak,
      speechRms: speechStats.rms,
      speechDurationMs: (speechSamples / sampleRate) * 1e3,
      totalDurationMs,
    };
  }
  function processAudio(request) {
    if (!(request.audioBuffer instanceof ArrayBuffer)) {
      throw new Error("audioBuffer must be an ArrayBuffer.");
    }
    if (!Number.isFinite(request.sampleRate) || request.sampleRate <= 0) {
      throw new Error("sampleRate must be a positive number.");
    }
    const batchOptions = normalizeOptions({
      ...options,
      ...(request.options ?? {}),
    });
    const samples = decodeAudioBuffer(request.audioBuffer);
    const analysis = energyBasedBatchVAD(samples, request.sampleRate, batchOptions);
    postMessage({
      type: "VAD_RESULT",
      segments: analysis.segments,
      speechStartSample: analysis.speechStartSample,
      speechEndSample: analysis.speechEndSample,
      speechRatio: analysis.speechRatio,
      rms: analysis.rms,
      peak: analysis.peak,
      speechRms: analysis.speechRms,
      speechDurationMs: analysis.speechDurationMs,
      totalDurationMs: analysis.totalDurationMs,
    });
  }
  workerSelf.onmessage = (event) => {
    try {
      const request = event.data;
      if (!request || typeof request.type !== "string") {
        throw new Error("Invalid VAD request.");
      }
      switch (request.type) {
        case "RESET": {
          configure(request.options);
          state = createInitialState();
          postMessage({
            type: "RESET_DONE",
            options,
          });
          return;
        }
        case "CONFIGURE": {
          configure(request.options);
          postMessage({
            type: "CONFIGURED",
            options,
          });
          return;
        }
        case "PROCESS_FRAME": {
          processFrame(request);
          return;
        }
        case "PROCESS_AUDIO": {
          processAudio(request);
          return;
        }
        default: {
          throw new Error(`Unknown VAD request type: ${request.type}`);
        }
      }
    } catch (error) {
      postError(error);
    }
  };
  postMessage({
    type: "READY",
    options,
  });
})();
