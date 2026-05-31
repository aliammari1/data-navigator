"use client";

/**
 * Offline Voice Button
 * Uses browser microphone + Web Workers for offline STT.
 * No Web Speech API — fully offline after model download.
 *
 * Flow:
 * 1. Hold button to record.
 * 2. Whisper transcribes audio.
 * 3. User reviews transcript.
 * 4. User clicks "Use transcript".
 * 5. Transcript is routed.
 */

import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mic,
  MicOff,
} from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { VoiceCaptureState } from "@/features/data-formulator/core/voice/voice-capture";
import {
  startVoiceCapture,
  stopVoiceCapture,
} from "@/features/data-formulator/core/voice/voice-capture";
import { cn } from "@/shared/utils";

interface VoiceButtonProps {
  onResult: (text: string) => void;
  disabled?: boolean;
  language?: string;
  languageLabel?: string;
  className?: string;
}

type VoicePhase =
  | "idle"
  | "capturing"
  | "processing"
  | "preview"
  | "routing"
  | "error";

type VoiceWorkerProgress = {
  status?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
};

type VoiceStatus = {
  label: string;
  detail: string;
  progress?: number;
  file?: string;
};

function formatBytes(value?: number) {
  if (!value || !Number.isFinite(value)) return null;
  if (value > 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value > 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${value} B`;
}

export function VoiceButton({
  onResult,
  disabled,
  language = "auto",
  className,
}: VoiceButtonProps) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [audioLevel, setAudioLevel] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [showReadyNotice, setShowReadyNotice] = useState(false);
  const [pendingTranscript, setPendingTranscript] = useState<string | null>(
    null,
  );
  const [status, setStatus] = useState<VoiceStatus>({
    label: "Preparing offline voice",
    detail: "Loading speech worker...",
  });

  const sttWorkerRef = useRef<Worker | null>(null);
  const routerWorkerRef = useRef<Worker | null>(null);
  const phaseRef = useRef<VoicePhase>("idle");
  const activePointerIdRef = useRef<number | null>(null);
  const autoStopTimerRef = useRef<number | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const clearAutoStopTimer = useCallback(() => {
    if (autoStopTimerRef.current !== null) {
      window.clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
  }, []);

  const routeTranscript = useCallback(
    (transcript: string) => {
      const cleanTranscript = transcript.trim();

      if (!cleanTranscript) {
        setPhase("error");
        phaseRef.current = "error";
        setError("Transcript was empty.");
        setStatus({
          label: "Voice unavailable",
          detail: "Transcript was empty.",
        });
        return;
      }

      const routerWorker = routerWorkerRef.current;

      if (!routerWorker) {
        setPhase("error");
        phaseRef.current = "error";
        setError("Voice router is not ready.");
        setStatus({
          label: "Voice unavailable",
          detail: "Voice router is not ready.",
        });
        return;
      }

      setPhase("routing");
      phaseRef.current = "routing";
      setStatus({
        label: "Routing transcript",
        detail: "Converting transcript into a manager action...",
      });

      routerWorker.postMessage({
        type: "ROUTE_COMMAND",
        transcript: cleanTranscript,
        language,
      });
    },
    [language],
  );

  const clearPreview = useCallback(() => {
    setPendingTranscript(null);
    setAudioLevel(0);
    setDurationMs(0);
    setPhase("idle");
    phaseRef.current = "idle";
    setStatus({
      label: "Offline voice ready",
      detail: "Hold to speak.",
      progress: 100,
    });
  }, []);

  useEffect(() => {
    const sttWorker = new Worker("/workers/voice-stt.worker.js", {
      type: "module",
    });
    sttWorkerRef.current = sttWorker;

    const routerWorker = new Worker("/workers/voice-router.worker.js", {
      type: "module",
    });
    routerWorkerRef.current = routerWorker;

    sttWorker.onerror = (event) => {
      setPhase("error");
      phaseRef.current = "error";
      setError(event.message || "Speech worker crashed.");
      setStatus({
        label: "Voice unavailable",
        detail: event.message || "Speech worker crashed.",
      });
    };

    routerWorker.onerror = (event) => {
      setPhase("error");
      phaseRef.current = "error";
      setError(event.message || "Voice router crashed.");
      setStatus({
        label: "Voice unavailable",
        detail: event.message || "Voice router crashed.",
      });
    };

    sttWorker.onmessage = (event) => {
      const msg = event.data;

      if (msg.type === "TRANSCRIPTION") {
        const transcript = String(msg.text ?? "").trim();

        if (!transcript) {
          setPhase("error");
          phaseRef.current = "error";
          setError("No speech was detected.");
          setStatus({
            label: "Voice unavailable",
            detail: "No speech was detected. Try speaking closer to the mic.",
          });
          return;
        }

        setPendingTranscript(transcript);
        setPhase("preview");
        phaseRef.current = "preview";
        setStatus({
          label: "Review transcript",
          detail: "Check the text before routing it.",
        });

        return;
      }

      if (msg.type === "ERROR") {
        setPhase("error");
        phaseRef.current = "error";
        setError(msg.error);
        setStatus({
          label: "Voice unavailable",
          detail: msg.error ?? "Voice failed.",
        });
        return;
      }

      if (msg.type === "MODEL_LOADED") {
        setModelReady(true);
        setShowReadyNotice(true);
        setPhase("idle");
        phaseRef.current = "idle";
        setError(null);
        setStatus({
          label: "Offline voice ready",
          detail: `${msg.model ?? "Speech model"} is cached and ready.`,
          progress: 100,
        });
        window.setTimeout(() => setShowReadyNotice(false), 2600);
        return;
      }

      if (msg.type === "STATUS") {
        const progress = msg.progress as VoiceWorkerProgress | undefined;
        const loaded = formatBytes(progress?.loaded);
        const total = formatBytes(progress?.total);
        const progressText =
          loaded && total ? `${loaded} / ${total}` : (msg.detail ?? msg.status);

        setStatus({
          label:
            msg.status === "ready"
              ? "Offline voice ready"
              : msg.status === "downloading-model"
                ? "Downloading voice model"
                : msg.status === "transcribing"
                  ? "Transcribing speech"
                  : msg.status === "fallback-wasm"
                    ? "Using WASM fallback"
                    : "Preparing offline voice",
          detail: progressText,
          progress:
            typeof progress?.progress === "number"
              ? Math.round(progress.progress)
              : undefined,
          file: progress?.file,
        });
      }
    };

    routerWorker.onmessage = (event) => {
      const msg = event.data;

      if (msg.type === "COMMAND_ROUTED") {
        setPhase("idle");
        phaseRef.current = "idle";
        setShowReadyNotice(false);
        setPendingTranscript(null);
        setAudioLevel(0);
        setDurationMs(0);
        onResult(msg.command.transcript);
        return;
      }

      if (msg.type === "ROUTE_ERROR") {
        setPhase("error");
        phaseRef.current = "error";
        setError(msg.error);
        setStatus({
          label: "Voice command failed",
          detail: msg.error ?? "Could not route voice command.",
        });
      }
    };

    setStatus({
      label: "Preparing offline voice",
      detail: "Checking browser cache for Whisper...",
    });

    sttWorker.postMessage({ type: "LOAD_MODEL" });

    return () => {
      clearAutoStopTimer();
      sttWorker.terminate();
      routerWorker.terminate();
      sttWorkerRef.current = null;
      routerWorkerRef.current = null;
    };
  }, [clearAutoStopTimer, language, onResult]);

  const handleStop = useCallback(() => {
    if (phaseRef.current !== "capturing") return;

    clearAutoStopTimer();

    const audio = stopVoiceCapture();

    setAudioLevel(0);
    setPhase("processing");
    phaseRef.current = "processing";

    if (!audio || audio.length === 0) {
      setPhase("error");
      phaseRef.current = "error";
      setError("No audio captured");
      setStatus({
        label: "Voice unavailable",
        detail: "No audio captured. Hold the button a little longer.",
      });
      return;
    }

    setStatus({
      label: "Transcribing speech",
      detail: "Running local Whisper in the browser...",
    });

    sttWorkerRef.current?.postMessage({
      type: "TRANSCRIBE",
      audio,
    });
  }, [clearAutoStopTimer]);

  const handleStart = useCallback(async () => {
    if (disabled) return;
    if (phaseRef.current === "processing") return;
    if (phaseRef.current === "routing") return;
    if (phaseRef.current === "preview") return;

    if (!modelReady) {
      setShowReadyNotice(true);
      setStatus((current) => ({
        ...current,
        label: "Voice is still preparing",
        detail:
          current.detail || "Wait until the offline model finishes loading.",
      }));
      return;
    }

    try {
      clearAutoStopTimer();

      setPendingTranscript(null);
      setPhase("capturing");
      phaseRef.current = "capturing";
      setError(null);
      setAudioLevel(0);
      setDurationMs(0);

      setStatus({
        label: "Recording...",
        detail: "Speak now. Release to transcribe.",
      });

      await startVoiceCapture(
        "push-to-talk",
        (state: VoiceCaptureState) => {
          setAudioLevel(state.audioLevel);
          setDurationMs(state.durationMs);

          if (state.error) {
            setPhase("error");
            phaseRef.current = "error";
            setError(state.error);
            setStatus({
              label: "Voice unavailable",
              detail: state.error,
            });
          }
        },
        () => {},
      );

      autoStopTimerRef.current = window.setTimeout(() => {
        if (phaseRef.current === "capturing") {
          handleStop();
        }
      }, 10000);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not start recording.";

      setPhase("error");
      phaseRef.current = "error";
      setError(message);
      setStatus({
        label: "Voice unavailable",
        detail: message,
      });
    }
  }, [clearAutoStopTimer, disabled, handleStop, modelReady]);

  const handlePointerDown = useCallback(
    async (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      if (activePointerIdRef.current !== null) return;

      event.preventDefault();

      activePointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);

      await handleStart();
    },
    [handleStart],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (activePointerIdRef.current !== event.pointerId) return;

      event.preventDefault();

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      activePointerIdRef.current = null;
      handleStop();
    },
    [handleStop],
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (activePointerIdRef.current !== event.pointerId) return;

      activePointerIdRef.current = null;
      handleStop();
    },
    [handleStop],
  );

  const isCapturing = phase === "capturing";
  const isProcessing = phase === "processing" || phase === "routing";
  const isPreparing = !modelReady;
  const isPreviewing = phase === "preview";

  const showStatus =
    isPreparing ||
    showReadyNotice ||
    isCapturing ||
    isProcessing ||
    isPreviewing ||
    phase === "error";

  const statusTone =
    phase === "error"
      ? "rose"
      : isCapturing || isPreviewing
        ? "emerald"
        : isProcessing || isPreparing
          ? "amber"
          : "emerald";

  return (
    <div className="relative flex shrink-0 items-center justify-center">
      {showStatus && (
        <div
          className={cn(
            "absolute bottom-full left-0 z-50 mb-3 w-[320px] rounded-xl border p-3 text-left shadow-2xl backdrop-blur-xl",
            statusTone === "rose"
              ? "border-rose-500/25 bg-rose-950/95"
              : statusTone === "amber"
                ? "border-amber-500/25 bg-stone-950/95"
                : "border-emerald-500/25 bg-stone-950/95",
          )}
        >
          <div className="flex items-start gap-2">
            <div
              className={cn(
                "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
                statusTone === "rose"
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                  : statusTone === "amber"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
              )}
            >
              {phase === "error" ? (
                <AlertTriangle className="h-3.5 w-3.5" />
              ) : isCapturing ? (
                <Mic className="h-3.5 w-3.5 animate-pulse" />
              ) : isProcessing || isPreparing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-foreground">
                {status.label}
              </div>

              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {phase === "error" ? (error ?? status.detail) : status.detail}
              </div>

              {status.file && (
                <div className="mt-1 truncate text-[10px] text-muted-foreground/70">
                  {status.file}
                </div>
              )}
            </div>

            {isCapturing && (
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                {(durationMs / 1000).toFixed(1)}s
              </div>
            )}
          </div>

          {(isPreparing || isProcessing) && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className={cn(
                  "h-full rounded-full bg-amber-400 transition-all",
                  status.progress == null && "w-1/3 animate-pulse",
                )}
                style={{
                  width:
                    status.progress == null
                      ? undefined
                      : `${Math.min(100, Math.max(3, status.progress))}%`,
                }}
              />
            </div>
          )}

          {isCapturing && (
            <div className="mt-3 flex h-8 items-end gap-1">
              {Array.from({ length: 18 }).map((_, index) => {
                const height =
                  20 + audioLevel * 70 * (index % 3 === 0 ? 1 : 0.65);

                return (
                  <span
                    key={index}
                    className="w-1 rounded-full bg-emerald-300/70 transition-all"
                    style={{ height: `${height}%` }}
                  />
                );
              })}
            </div>
          )}

          {isPreviewing && pendingTranscript && (
            <div className="mt-3 rounded-lg border border-white/10 bg-black/25 p-2">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Transcribed text
              </div>

              <div className="max-h-24 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                {pendingTranscript}
              </div>

              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={clearPreview}
                  className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                >
                  Retry
                </button>

                <button
                  type="button"
                  onClick={() => routeTranscript(pendingTranscript)}
                  className="rounded-md border border-emerald-500/25 bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/25"
                >
                  Use transcript
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        disabled={disabled || isProcessing || isPreviewing}
        aria-pressed={isCapturing}
        aria-label={
          isCapturing
            ? "Recording. Release to stop."
            : isPreviewing
              ? "Review transcript before routing."
              : isPreparing
                ? "Preparing offline voice model."
                : "Hold to speak."
        }
        title={
          isPreparing
            ? "Preparing offline voice model"
            : isCapturing
              ? "Recording — release to stop"
              : isPreviewing
                ? "Review transcript before routing"
                : isProcessing
                  ? "Processing..."
                  : "Hold to speak"
        }
        className={cn(
          "relative flex touch-none select-none items-center justify-center rounded-xl border transition-all",
          isCapturing
            ? "scale-105 border-emerald-400/60 bg-emerald-500/25 text-emerald-200 shadow-lg shadow-emerald-500/20"
            : isPreviewing
              ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
              : isProcessing || isPreparing
                ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
                : phase === "error"
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground",
          className,
        )}
      >
        {isProcessing || isPreparing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isCapturing ? (
          <MicOff className="h-4 w-4 animate-pulse" />
        ) : (
          <Mic className="h-4 w-4" />
        )}

        {modelReady && phase === "idle" && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-background" />
        )}

        {isCapturing && (
          <>
            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-background" />
            <span className="absolute -right-1 -top-1 h-3 w-3 animate-ping rounded-full bg-emerald-400/70" />

            <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-full border border-emerald-500/30 bg-emerald-950/95 px-2 py-1 text-[10px] font-medium text-emerald-200 shadow-lg">
              Recording {(durationMs / 1000).toFixed(1)}s
            </span>

            <div className="pointer-events-none absolute inset-0 animate-pulse rounded-xl ring-2 ring-emerald-400/50" />

            <div
              className="pointer-events-none absolute -inset-1 rounded-xl border-2 border-emerald-400/30 transition-all"
              style={{
                transform: `scale(${1 + audioLevel * 0.5})`,
                opacity: 0.35 + audioLevel * 0.65,
              }}
            />
          </>
        )}
      </button>
    </div>
  );
}
