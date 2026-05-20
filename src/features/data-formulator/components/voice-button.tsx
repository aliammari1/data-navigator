"use client";

/**
 * Offline Voice Button
 * Uses browser microphone + Web Workers for offline STT.
 * No Web Speech API — fully offline after model download.
 */

import { AlertTriangle, CheckCircle2, Loader2, Mic, MicOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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

type VoicePhase = "idle" | "capturing" | "processing" | "error";

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
  const [status, setStatus] = useState<VoiceStatus>({
    label: "Preparing offline voice",
    detail: "Loading speech worker...",
  });
  const sttWorkerRef = useRef<Worker | null>(null);
  const routerWorkerRef = useRef<Worker | null>(null);
  const phaseRef = useRef<VoicePhase>("idle");

  // Keep phaseRef in sync
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Initialize workers from public/workers/ built artifacts
  useEffect(() => {
    const sttWorker = new Worker("/workers/voice-stt.worker.js", {
      type: "module",
    });
    sttWorkerRef.current = sttWorker;

    const routerWorker = new Worker("/workers/voice-router.worker.js", {
      type: "module",
    });
    routerWorkerRef.current = routerWorker;

    sttWorker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "TRANSCRIPTION") {
        setStatus({
          label: "Normalizing command",
          detail: "Converting transcript into a manager action...",
        });
        setPhase("processing");
        // Route the command
        routerWorker.postMessage({
          type: "ROUTE_COMMAND",
          transcript: msg.text,
          language,
        });
      } else if (msg.type === "ERROR") {
        setPhase("error");
        setError(msg.error);
      } else if (msg.type === "MODEL_LOADED") {
        setModelReady(true);
        setShowReadyNotice(true);
        setStatus({
          label: "Offline voice ready",
          detail: `${msg.model ?? "Speech model"} is cached and ready.`,
          progress: 100,
        });
        window.setTimeout(() => setShowReadyNotice(false), 2600);
      } else if (msg.type === "STATUS") {
        const progress = msg.progress as VoiceWorkerProgress | undefined;
        const loaded = formatBytes(progress?.loaded);
        const total = formatBytes(progress?.total);
        const progressText =
          loaded && total ? `${loaded} / ${total}` : msg.detail ?? msg.status;
        setStatus({
          label:
            msg.status === "ready"
              ? "Offline voice ready"
              : msg.status === "downloading-model"
                ? "Downloading voice model"
                : msg.status === "transcribing"
                  ? "Transcribing speech"
                  : msg.status === "fallback-cpu"
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

    routerWorker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "COMMAND_ROUTED") {
        setPhase("idle");
        setShowReadyNotice(false);
        onResult(msg.command.transcript);
      } else if (msg.type === "ROUTE_ERROR") {
        setPhase("error");
        setError(msg.error);
      }
    };

    setStatus({
      label: "Preparing offline voice",
      detail: "Checking browser cache for Whisper...",
    });
    sttWorker.postMessage({ type: "LOAD_MODEL" });

    return () => {
      sttWorker.terminate();
      routerWorker.terminate();
    };
  }, []);

  const handleStop = useCallback(() => {
    const audio = stopVoiceCapture();
    setPhase("processing");

    if (!audio || audio.length === 0) {
      setPhase("error");
      setError("No audio captured");
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
  }, []);

  const handleStart = useCallback(async () => {
    if (!modelReady) {
      setShowReadyNotice(true);
      return;
    }

    setPhase("capturing");
    setError(null);
    setStatus({
      label: "Listening",
      detail: "Release to transcribe.",
    });

    await startVoiceCapture(
      "push-to-talk",
      (state: VoiceCaptureState) => {
        setAudioLevel(state.audioLevel);
        setDurationMs(state.durationMs);
        if (state.error) {
          setPhase("error");
          setError(state.error);
        }
      },
      // Chunks are accumulated internally by voice-capture; we rely on stopVoiceCapture() to return the full buffer
      () => {},
    );

    // Auto-stop after 10 seconds max
    setTimeout(() => {
      if (phaseRef.current === "capturing") {
        handleStop();
      }
    }, 10000);
  }, [handleStop]);

  const isCapturing = phase === "capturing";
  const isProcessing = phase === "processing";
  const isPreparing = !modelReady;
  const showStatus =
    isPreparing || showReadyNotice || isCapturing || isProcessing || phase === "error";
  const statusTone =
    phase === "error"
      ? "rose"
      : isCapturing
        ? "emerald"
        : isProcessing || isPreparing
          ? "amber"
          : "emerald";

  return (
    <div className="relative flex shrink-0 items-center justify-center">
      {showStatus && (
        <div
          className={cn(
            "absolute bottom-full left-0 z-50 mb-3 w-[280px] rounded-xl border p-3 text-left shadow-2xl backdrop-blur-xl",
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
                <Mic className="h-3.5 w-3.5" />
              ) : isProcessing || isPreparing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-foreground">
                {phase === "error" ? "Voice unavailable" : status.label}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {phase === "error" ? error : status.detail}
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
                const height = 20 + audioLevel * 70 * (index % 3 === 0 ? 1 : 0.65);
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
        </div>
      )}

      <button
        type="button"
        onMouseDown={handleStart}
        onMouseUp={isCapturing ? handleStop : undefined}
        onMouseLeave={isCapturing ? handleStop : undefined}
        onTouchStart={handleStart}
        onTouchEnd={isCapturing ? handleStop : undefined}
        disabled={disabled || isProcessing}
        title={
          isPreparing
            ? "Preparing offline voice model"
            : isCapturing
              ? "Release to stop"
              : isProcessing
                ? "Processing..."
                : "Hold to speak"
        }
        className={cn(
          "relative flex items-center justify-center rounded-xl border transition-all",
          isCapturing
            ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-300"
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
          <MicOff className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}

        {modelReady && phase === "idle" && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-background" />
        )}

        {isCapturing && (
          <div className="pointer-events-none absolute inset-0 animate-pulse rounded-xl ring-2 ring-emerald-400/40" />
        )}

        {isCapturing && (
          <div
            className="pointer-events-none absolute -inset-1 rounded-xl border-2 border-emerald-400/30 transition-all"
            style={{
              transform: `scale(${1 + audioLevel * 0.5})`,
              opacity: 0.3 + audioLevel * 0.7,
            }}
          />
        )}
      </button>
    </div>
  );
}
