/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import {
  type AutomaticSpeechRecognitionPipeline,
  env,
  pipeline,
} from "@huggingface/transformers";

/* ------------------------------------------------------------------ */
/*  Model loading                                                      */
/* ------------------------------------------------------------------ */

const MODEL_NAME = "Xenova/whisper-tiny";

let pipe: AutomaticSpeechRecognitionPipeline | null = null;

type TransformersDevice = "webgpu" | "wasm";

type ProgressPayload = {
  status: string;
  name?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
  model?: string;
};

function postStatus(
  status: string,
  detail?: string,
  progress?: ProgressPayload,
) {
  self.postMessage({
    type: "STATUS",
    status,
    detail,
    model: MODEL_NAME,
    progress,
  });
}

async function getPreferredDevice(): Promise<TransformersDevice> {
  const nav = navigator as Navigator & {
    gpu?: {
      requestAdapter(): Promise<unknown>;
    };
  };

  if (!nav.gpu) {
    return "wasm";
  }

  try {
    const adapter = await nav.gpu.requestAdapter();
    return adapter ? "webgpu" : "wasm";
  } catch {
    return "wasm";
  }
}

function getDtypeForDevice(device: TransformersDevice): "fp32" | "q8" {
  return device === "webgpu" ? "fp32" : "q8";
}

function isDownloadProgress(progress: ProgressPayload): boolean {
  return (
    progress.status === "progress" ||
    progress.status === "progress_total" ||
    typeof progress.progress === "number"
  );
}

function handleProgress(progress: unknown) {
  const payload = progress as ProgressPayload;

  postStatus(
    isDownloadProgress(payload) ? "downloading-model" : "loading-model",
    payload.status,
    payload,
  );
}

async function createPipeline(
  device: TransformersDevice,
): Promise<AutomaticSpeechRecognitionPipeline> {
  return pipeline("automatic-speech-recognition", MODEL_NAME, {
    device,
    dtype: getDtypeForDevice(device),
    progress_callback: handleProgress,
  });
}

async function loadPipeline(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (pipe) return pipe;

  env.allowLocalModels = false;
  env.useBrowserCache = true;

  const preferredDevice = await getPreferredDevice();

  postStatus(
    "loading-model",
    `Preparing ${MODEL_NAME} with ${
      preferredDevice === "webgpu" ? "WebGPU" : "WASM"
    }.`,
  );

  try {
    pipe = await createPipeline(preferredDevice);
  } catch (firstError) {
    if (preferredDevice === "wasm") {
      throw firstError;
    }

    console.warn(
      "[voice-stt-worker] WebGPU failed. Retrying with WASM.",
      firstError,
    );

    postStatus("fallback-wasm", "WebGPU failed. Retrying with WASM.");

    pipe = await createPipeline("wasm");
  }

  postStatus("ready", "Offline voice model ready.");
  self.postMessage({ type: "MODEL_LOADED", model: MODEL_NAME });

  return pipe;
}

/* ------------------------------------------------------------------ */
/*  Transcription                                                      */
/* ------------------------------------------------------------------ */

async function transcribe(audio: Float32Array): Promise<string> {
  const p = await loadPipeline();

  if (!audio || audio.length === 0) {
    throw new Error("Empty audio buffer");
  }

  postStatus(
    "transcribing",
    `Transcribing ${Math.round(audio.length / 16000)}s of audio.`,
  );

  const result = (await p(audio, {
    sampling_rate: 16000,
    return_timestamps: false,
  })) as { text?: string };

  return result.text?.trim() ?? "";
}

/* ------------------------------------------------------------------ */
/*  Message handler                                                    */
/* ------------------------------------------------------------------ */

self.addEventListener("message", async (event) => {
  const { type, audio } = event.data as {
    type: string;
    audio?: Float32Array;
  };

  switch (type) {
    case "LOAD_MODEL": {
      try {
        await loadPipeline();
      } catch (err) {
        self.postMessage({
          type: "ERROR",
          error: err instanceof Error ? err.message : "Model load failed",
        });
      }

      break;
    }

    case "TRANSCRIBE": {
      if (!audio) {
        self.postMessage({
          type: "ERROR",
          error: "No audio data provided",
        });
        return;
      }

      try {
        postStatus("processing", "Preparing captured audio.");

        const text = await transcribe(audio);

        self.postMessage({
          type: "TRANSCRIPTION",
          text,
        });
      } catch (err) {
        self.postMessage({
          type: "ERROR",
          error: err instanceof Error ? err.message : "Transcription failed",
        });
      }

      break;
    }

    default:
      break;
  }
});
