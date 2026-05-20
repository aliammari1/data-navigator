/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import {
  type AutomaticSpeechRecognitionPipeline,
  env,
  pipeline,
} from "@huggingface/transformers";

/* ------------------------------------------------------------------ */
/*  Model loading                                                       */
/* ------------------------------------------------------------------ */

const MODEL_NAME = "Xenova/whisper-tiny";

let pipe: AutomaticSpeechRecognitionPipeline | null = null;

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

async function loadPipeline(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (pipe) return pipe;

  env.allowLocalModels = false;
  env.useBrowserCache = true;

  // Try WebGPU first, fallback to WASM
  const device = "webgpu" in navigator ? "webgpu" : "cpu";

  postStatus(
    "loading-model",
    `Preparing ${MODEL_NAME} with ${device === "webgpu" ? "WebGPU" : "WASM/CPU"}`,
  );

  try {
    pipe = await pipeline("automatic-speech-recognition", MODEL_NAME, {
      device,
      dtype: "fp32",
      progress_callback: (progress) => {
        postStatus(
          progress.status === "progress_total"
            ? "downloading-model"
            : "loading-model",
          progress.status,
          progress as ProgressPayload,
        );
      },
    });
  } catch (e) {
    postStatus("fallback-cpu", "WebGPU failed. Retrying with WASM/CPU.");
    pipe = await pipeline("automatic-speech-recognition", MODEL_NAME, {
      device: "cpu",
      dtype: "fp32",
      progress_callback: (progress) => {
        postStatus(
          progress.status === "progress_total"
            ? "downloading-model"
            : "loading-model",
          progress.status,
          progress as ProgressPayload,
        );
      },
    });
  }

  postStatus("ready", "Offline voice model ready.");
  self.postMessage({ type: "MODEL_LOADED", model: MODEL_NAME });
  return pipe;
}

/* ------------------------------------------------------------------ */
/*  Transcription                                                       */
/* ------------------------------------------------------------------ */

async function transcribe(audio: Float32Array): Promise<string> {
  const p = await loadPipeline();

  if (!audio || audio.length === 0) {
    throw new Error("Empty audio buffer");
  }

  postStatus("transcribing", `Transcribing ${Math.round(audio.length / 16000)}s of audio.`);

  const result = (await p(audio, {
    sampling_rate: 16000,
    return_timestamps: false,
  })) as { text: string };

  const text = result.text?.trim() ?? "";
  return text;
}

/* ------------------------------------------------------------------ */
/*  Message handler                                                     */
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
        self.postMessage({ type: "ERROR", error: "No audio data provided" });
        return;
      }
      try {
        postStatus("processing", "Preparing captured audio.");
        const text = await transcribe(audio);
        self.postMessage({ type: "TRANSCRIPTION", text });
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
