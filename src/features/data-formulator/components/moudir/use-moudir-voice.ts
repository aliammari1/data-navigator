"use client";

/**
 * Moudir voice hook.
 *
 * Owns an offline voice pipeline for the Moudir composer:
 * - VAD service (hold-to-talk) for microphone capture.
 * - STT worker for on-device transcription.
 * - TTS worker for on-device speech playback.
 *
 * It is intentionally minimal: it captures speech, transcribes it, and hands
 * the text back through a registered callback so the composer can drop it into
 * its own text box. It does NOT route through the rule-based command router and
 * does NOT reuse the neon VoiceButton component.
 *
 * All models are bundled and run offline. Everything is created lazily and
 * torn down on unmount.
 *
 * Failures never happen silently: every recoverable error is surfaced through
 * `error` (a short, user-facing message) so the composer can tell the user WHY
 * voice did not start (no mic permission, worker failed, model needed, etc.).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { markVoiceModelLoaded, markVoiceModelLoadFailed } from "../../core/voice/voice-model-cache";
import {
  getSttModel,
  getTtsModel,
  normalizeSttEngine,
  normalizeTtsEngine,
} from "../../core/voice/voice-model-registry";
import { loadVoiceSettings } from "../../core/voice/voice-settings";
import {
  createVoiceVadService,
  isVoiceVadSupported,
  type VoiceVadService,
} from "../../core/voice/voice-vad-service";
import {
  hasElectronVoice,
  pickNativeTtsEngine,
  sherpaSpeak,
  sherpaTranscribe,
} from "@/platform/electron/electron-fs";

export interface UseMoudirVoice {
  supported: boolean;
  listening: boolean;
  transcribing: boolean;
  speaking: boolean;
  /** Short, user-facing reason the last voice action failed, or null. */
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  speak: (text: string) => void;
  stopSpeak: () => void;
  /** Clear the current error and retry microphone capture from scratch. */
  retry: () => Promise<void>;
  onTranscript: (cb: (text: string) => void) => void;
}

/** Map worker / DOM errors to a short message the user can act on. */
function describeStartError(error: unknown): string {
  if (error instanceof DOMException || error instanceof Error) {
    const name = (error as DOMException).name;

    if (name === "NotAllowedError" || name === "SecurityError") {
      return "Autorisez le micro pour parler.";
    }

    if (name === "NotFoundError") {
      return "Aucun micro détecté.";
    }

    if (name === "NotReadableError") {
      return "Le micro est utilisé par une autre application.";
    }

    if (error.message) {
      return error.message;
    }
  }

  return "Le micro n'a pas pu démarrer.";
}

export function useMoudirVoice(): UseMoudirVoice {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vadRef = useRef<VoiceVadService | null>(null);
  const sttRef = useRef<Worker | null>(null);
  const ttsRef = useRef<Worker | null>(null);

  // Registered consumer callback for finished transcripts.
  const transcriptCbRef = useRef<((text: string) => void) | null>(null);

  // Tracks the current TTS object URL so we can revoke it after playback.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  // Avoids state updates after unmount.
  const mountedRef = useRef(true);

  const setErrorSafe = useCallback((message: string | null) => {
    if (mountedRef.current) {
      setError(message);
    }
  }, []);

  const onTranscript = useCallback((cb: (text: string) => void) => {
    transcriptCbRef.current = cb;
  }, []);

  /** Lazily create (or reuse) the STT worker. Returns null on failure. */
  const ensureSttWorker = useCallback((): Worker | null => {
    if (sttRef.current) {
      return sttRef.current;
    }

    try {
      const worker = new Worker(new URL("../../core/voice/voice-stt-worker.ts", import.meta.url), {
        type: "module",
      });

      worker.onmessage = (ev: MessageEvent) => {
        const message = ev.data as {
          type?: string;
          text?: string;
          error?: string;
          engine?: string;
        };

        if (message?.type === "TRANSCRIPTION") {
          if (mountedRef.current) {
            setTranscribing(false);
          }

          const text = typeof message.text === "string" ? message.text : "";

          if (text.trim()) {
            transcriptCbRef.current?.(text);
          }
        } else if (message?.type === "MODEL_LOADED") {
          // Track offline readiness so the cache reflects what actually loaded.
          try {
            markVoiceModelLoaded(getSttModel(normalizeSttEngine(message.engine)));
          } catch {
            // Best-effort cache tracking only.
          }
        } else if (message?.type === "ERROR") {
          if (mountedRef.current) {
            setTranscribing(false);
          }
          try {
            markVoiceModelLoadFailed(
              getSttModel(normalizeSttEngine(message.engine)),
              message.error ?? "STT failed",
            );
          } catch {
            // Best-effort cache tracking only.
          }
          setErrorSafe(message.error || "La transcription a échoué.");
        }
      };

      worker.onerror = (ev) => {
        if (mountedRef.current) {
          setTranscribing(false);
        }
        setErrorSafe(ev.message || "Le moteur de transcription a planté.");
      };

      sttRef.current = worker;
      return worker;
    } catch (err) {
      setErrorSafe(describeStartError(err));
      return null;
    }
  }, [setErrorSafe]);

  /** Lazily create (or reuse) the TTS worker. Returns null on failure. */
  const ensureTtsWorker = useCallback((): Worker | null => {
    if (ttsRef.current) {
      return ttsRef.current;
    }

    try {
      const worker = new Worker(new URL("../../core/voice/voice-tts-worker.ts", import.meta.url), {
        type: "module",
      });

      worker.onmessage = (ev: MessageEvent) => {
        const message = ev.data as {
          type?: string;
          wav?: Uint8Array;
          error?: string;
          engine?: string;
        };

        if (message?.type === "SPEECH_AUDIO" && message.wav) {
          // facts: importer=use-moudir-voice.ts onmessage handler; api=Blob/BlobPart, Uint8Array; data=TTS worker SPEECH_AUDIO wav bytes; user-instruction="fix pnpm run build errors"
          try {
            // Copy into a fresh Uint8Array so its backing store is a concrete
            // ArrayBuffer (not ArrayBufferLike/SharedArrayBuffer), which the DOM
            // lib requires for a valid BlobPart. Behavior is identical.
            const wavBytes = new Uint8Array(message.wav.byteLength);
            wavBytes.set(message.wav);
            const blob = new Blob([wavBytes], { type: "audio/wav" });

            // Revoke any previous URL before creating a new one.
            if (audioUrlRef.current) {
              URL.revokeObjectURL(audioUrlRef.current);
              audioUrlRef.current = null;
            }

            const url = URL.createObjectURL(blob);
            audioUrlRef.current = url;

            const audio = new Audio(url);
            audioRef.current = audio;

            audio.onended = () => {
              if (mountedRef.current) {
                setSpeaking(false);
              }

              if (audioUrlRef.current) {
                URL.revokeObjectURL(audioUrlRef.current);
                audioUrlRef.current = null;
              }
            };

            audio.onerror = () => {
              if (mountedRef.current) {
                setSpeaking(false);
              }
            };

            if (mountedRef.current) {
              setSpeaking(true);
            }

            void audio.play().catch(() => {
              if (mountedRef.current) {
                setSpeaking(false);
              }
            });
          } catch {
            if (mountedRef.current) {
              setSpeaking(false);
            }
          }
        } else if (message?.type === "MODEL_LOADED") {
          try {
            markVoiceModelLoaded(getTtsModel(normalizeTtsEngine(message.engine)));
          } catch {
            // Best-effort cache tracking only.
          }
        } else if (message?.type === "SPEECH_SKIPPED" || message?.type === "STOPPED") {
          if (mountedRef.current) {
            setSpeaking(false);
          }
        } else if (message?.type === "ERROR") {
          if (mountedRef.current) {
            setSpeaking(false);
          }
          try {
            markVoiceModelLoadFailed(
              getTtsModel(normalizeTtsEngine(message.engine)),
              message.error ?? "TTS failed",
            );
          } catch {
            // Best-effort cache tracking only.
          }
          setErrorSafe(message.error || "La synthèse vocale a échoué.");
        }
      };

      worker.onerror = (ev) => {
        if (mountedRef.current) {
          setSpeaking(false);
        }
        setErrorSafe(ev.message || "Le moteur de synthèse vocale a planté.");
      };

      ttsRef.current = worker;
      return worker;
    } catch (err) {
      setErrorSafe(describeStartError(err));
      return null;
    }
  }, [setErrorSafe]);

  const start = useCallback(async () => {
    setErrorSafe(null);

    if (!isVoiceVadSupported()) {
      if (mountedRef.current) {
        setSupported(false);
      }
      setErrorSafe("La voix n'est pas disponible dans cet environnement.");
      return;
    }

    // In Electron, capture is transcribed by the native sherpa-onnx STT lane
    // (no transformers.js worker needed). Elsewhere, ensure the STT worker
    // exists before we start capturing.
    if (!hasElectronVoice()) {
      const stt = ensureSttWorker();

      if (!stt) {
        // ensureSttWorker already set a specific error message.
        return;
      }
    }

    if (vadRef.current) {
      try {
        await vadRef.current.start();

        if (mountedRef.current) {
          setListening(true);
        }
      } catch (err) {
        if (mountedRef.current) {
          setListening(false);
        }
        setErrorSafe(describeStartError(err));
      }
      return;
    }

    // Pull the configured language/engine/runtime so STT does not hardcode "en"
    // for French/Arabic content. languageHint "auto" lets Whisper auto-detect.
    const settings = loadVoiceSettings();

    try {
      const vad = createVoiceVadService({
        mode: "hold-to-talk",
        submitUserSpeechOnPause: true,
        onEvent: (event) => {
          if (event.type === "SPEECH_END") {
            if (mountedRef.current) {
              setTranscribing(true);
            }

            if (hasElectronVoice()) {
              // Native sherpa-onnx STT (fully offline, bundled) — preferred lane.
              void sherpaTranscribe(event.audio, {
                sampleRate: event.sampleRate,
                language: settings.languageHint,
              })
                .then((text) => {
                  if (mountedRef.current) setTranscribing(false);
                  if (text.trim()) transcriptCbRef.current?.(text);
                })
                .catch((err) => {
                  if (mountedRef.current) setTranscribing(false);
                  setErrorSafe(
                    err instanceof Error ? err.message : "La transcription a échoué.",
                  );
                });
            } else {
              const worker = sttRef.current;

              if (worker) {
                worker.postMessage({
                  type: "TRANSCRIBE",
                  audio: event.audio,
                  sampleRate: event.sampleRate,
                  engine: settings.sttEngine,
                  runtime: settings.sttRuntime,
                  language: settings.languageHint,
                  allowRemoteModels: settings.allowRemoteSttModels,
                  localModelPath: settings.localSttModelPath ?? undefined,
                });
              } else if (mountedRef.current) {
                setTranscribing(false);
              }
            }

            // Auto-stop listening after a captured utterance. Pause the VAD
            // directly here to avoid a forward reference to `stop`.
            const active = vadRef.current;

            if (active) {
              void active.pause().catch(() => {
                // Ignore — best-effort pause after a captured utterance.
              });
            }

            if (mountedRef.current) {
              setListening(false);
            }
          } else if (event.type === "ERROR") {
            if (mountedRef.current) {
              setListening(false);
            }
            // Bubble the VAD's own error (already mic-aware) to the UI.
            setErrorSafe(event.error || "Le micro n'a pas pu démarrer.");
          }
        },
      });

      vadRef.current = vad;

      await vad.start();

      if (mountedRef.current) {
        setListening(true);
      }
    } catch (err) {
      // Tear down the half-built VAD so retry() starts fresh.
      try {
        void vadRef.current?.destroy();
      } catch {
        // Ignore — best-effort teardown.
      }
      vadRef.current = null;

      if (mountedRef.current) {
        setListening(false);
      }
      setErrorSafe(describeStartError(err));
    }
  }, [ensureSttWorker, setErrorSafe]);

  const stop = useCallback(async () => {
    const vad = vadRef.current;

    if (!vad) {
      if (mountedRef.current) {
        setListening(false);
      }
      return;
    }

    try {
      await vad.pause();
    } catch {
      try {
        await vad.stop();
      } catch {
        // Ignore — best-effort teardown of capture.
      }
    } finally {
      if (mountedRef.current) {
        setListening(false);
      }
    }
  }, []);

  /** Clear the error and rebuild the capture pipeline from scratch. */
  const retry = useCallback(async () => {
    setErrorSafe(null);

    // Drop any half-built VAD so getUserMedia is requested again cleanly.
    try {
      await vadRef.current?.destroy();
    } catch {
      // Ignore — best-effort teardown.
    }
    vadRef.current = null;

    if (mountedRef.current) {
      setListening(false);
    }

    await start();
  }, [setErrorSafe, start]);

  const speak = useCallback(
    (text: string) => {
      if (!text?.trim()) {
        return;
      }

      const settings = loadVoiceSettings();

      if (hasElectronVoice()) {
        // Native sherpa-onnx TTS (fully offline, bundled) — preferred lane.
        // Kokoro (English) vs Supertonic (French/Arabic) is picked by language hint;
        // the Kokoro-only ttsVoice setting only applies when Kokoro is selected.
        const nativeEngine = pickNativeTtsEngine(settings.languageHint);
        void sherpaSpeak(text, {
          engine: nativeEngine,
          voice: nativeEngine === "sherpa-kokoro" ? settings.ttsVoice : undefined,
          speed: settings.ttsSpeed,
          lang: settings.languageHint,
        })
          .then(({ wav }) => {
            if (audioUrlRef.current) {
              URL.revokeObjectURL(audioUrlRef.current);
              audioUrlRef.current = null;
            }
            const wavBytes = new Uint8Array(wav);
            const blob = new Blob([wavBytes], { type: "audio/wav" });
            const url = URL.createObjectURL(blob);
            audioUrlRef.current = url;
            const audio = new Audio(url);
            audioRef.current = audio;
            audio.onended = () => {
              if (mountedRef.current) setSpeaking(false);
              if (audioUrlRef.current) {
                URL.revokeObjectURL(audioUrlRef.current);
                audioUrlRef.current = null;
              }
            };
            audio.onerror = () => {
              if (mountedRef.current) setSpeaking(false);
            };
            if (mountedRef.current) setSpeaking(true);
            void audio.play().catch(() => {
              if (mountedRef.current) setSpeaking(false);
            });
          })
          .catch((err) => {
            if (mountedRef.current) setSpeaking(false);
            setErrorSafe(err instanceof Error ? err.message : "La synthèse vocale a échoué.");
          });
        return;
      }

      const worker = ensureTtsWorker();

      if (!worker) {
        // ensureTtsWorker already set a specific error message.
        return;
      }

      worker.postMessage({
        type: "SPEAK",
        text,
        engine: settings.ttsEngine,
        runtime: settings.ttsRuntime,
        voice: settings.ttsVoice,
        speed: settings.ttsSpeed,
        speakMode: "full",
        outputFormat: "wav",
        chunkSentences: true,
      });
    },
    [ensureTtsWorker, setErrorSafe],
  );

  const stopSpeak = useCallback(() => {
    const worker = ttsRef.current;

    if (worker) {
      worker.postMessage({ type: "STOP" });
    }

    const audio = audioRef.current;

    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        // Ignore — element may already be torn down.
      }
    }

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    if (mountedRef.current) {
      setSpeaking(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      // Tear down the VAD service.
      try {
        void vadRef.current?.destroy();
      } catch {
        // Ignore — best-effort cleanup.
      }
      vadRef.current = null;

      // Terminate workers.
      try {
        sttRef.current?.terminate();
      } catch {
        // Ignore.
      }
      sttRef.current = null;

      try {
        ttsRef.current?.postMessage({ type: "STOP" });
      } catch {
        // Ignore.
      }
      try {
        ttsRef.current?.terminate();
      } catch {
        // Ignore.
      }
      ttsRef.current = null;

      // Stop playback and revoke any outstanding object URL.
      try {
        audioRef.current?.pause();
      } catch {
        // Ignore.
      }
      audioRef.current = null;

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, []);

  return {
    supported,
    listening,
    transcribing,
    speaking,
    error,
    start,
    stop,
    speak,
    stopSpeak,
    retry,
    onTranscript,
  };
}
