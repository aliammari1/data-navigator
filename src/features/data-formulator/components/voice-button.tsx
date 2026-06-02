"use client";

/**
 * Voice Button
 *
 * Library-powered voice-agent orchestrator.
 *
 * Main path:
 * @ricky0123/vad-web via voice-vad-service
 *   → voice-stt-worker.ts
 *   → voice-command-router.ts
 *   → voice-tts-worker.ts
 *   → AG-UI-style event/debug timeline
 *
 * This file intentionally does NOT import the old custom stack:
 * - voice-capture.ts
 * - voice-session.ts
 * - voice-vad-worker.ts
 */

import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mic,
  MicOff,
  RefreshCcw,
  Settings2,
  Sparkles,
  VolumeX,
  X,
} from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createRouteCompletedEventGroup,
  createVoiceRunId,
  voiceAguiEvents,
} from "@/features/data-formulator/core/voice/voice-agui-events";
import type {
  VoiceCommand,
  VoiceRouteResponse,
} from "@/features/data-formulator/core/voice/voice-command-router";
import {
  appendVoiceAguiEvent,
  appendVoiceAguiEvents,
  logVoiceDebug,
  updateVoiceAudioDebugState,
  updateVoiceWorkerStatus,
} from "@/features/data-formulator/core/voice/voice-debug-store";
import {
  getTtsModel,
  mapLanguageHintToDisplayLabel,
} from "@/features/data-formulator/core/voice/voice-model-registry";
import {
  createVoiceWorkerSettingsPayload,
  getTranscriptBehavior,
  getVoiceOutputMode,
  getVoiceSettingsSummary,
  loadVoiceSettings,
  shouldReviewTranscript,
  shouldSpeakAssistantResponse,
  shouldStopOnPointerUp,
  shouldToggleOnPointerDown,
  subscribeVoiceSettings,
  type VoiceSettings,
} from "@/features/data-formulator/core/voice/voice-settings";
import {
  createVoiceVadService,
  isVoiceVadSupported,
  type VoiceVadEvent,
  type VoiceVadService,
} from "@/features/data-formulator/core/voice/voice-vad-service";
import { cn } from "@/shared/utils";
import { VoiceDebugPanel } from "./voice-debug-panel";
import {
  VoiceOutputPlayer,
  type VoiceOutputPlayerMetadata,
} from "./voice-output-player";
import { VoiceSettingsPanel } from "./voice-settings-panel";
import { VoiceToolPreview } from "./voice-tool-preview";
import { VoiceTranscriptReview } from "./voice-transcript-review";

interface VoiceButtonProps {
  onResult: (text: string) => void;
  disabled?: boolean;
  language?: string;
  languageLabel?: string;
  className?: string;
}

type VoicePhase =
  | "idle"
  | "preparing"
  | "listening"
  | "speech"
  | "transcribing"
  | "review"
  | "routing"
  | "routed"
  | "submitting"
  | "tts-loading"
  | "tts-ready"
  | "speaking"
  | "completed"
  | "error";

interface VoiceStatus {
  label: string;
  detail: string;
  progress?: number;
}

type VoiceUtilityPanel = "status" | "settings" | "debug";

interface SttWorkerStatusMessage {
  type: "STATUS";
  status: string;
  detail?: string;
  progress?: {
    progress?: number;
    file?: string;
    loaded?: number;
    total?: number;
  };
  model?: string;
}

interface SttWorkerLoadedMessage {
  type: "MODEL_LOADED";
  model: string;
  engine: string;
  runtime: string;
}

interface SttWorkerTranscriptionMessage {
  type: "TRANSCRIPTION";
  text: string;
  engine: string;
  model: string;
  runtime: string;
  sampleRate: number;
  audioDurationMs: number;
  latencyMs: number;
  language?: string;
}

interface SttWorkerErrorMessage {
  type: "ERROR";
  error: string;
}

type SttWorkerMessage =
  | SttWorkerStatusMessage
  | SttWorkerLoadedMessage
  | SttWorkerTranscriptionMessage
  | SttWorkerErrorMessage;

interface TtsWorkerStatusMessage {
  type: "STATUS";
  status: string;
  detail?: string;
  progress?: number;
  jobId?: string;
}

interface TtsWorkerLoadedMessage {
  type: "MODEL_LOADED";
  engine: string;
  model: string;
  runtime: string;
}

interface TtsWorkerAudioMessage {
  type: "SPEECH_AUDIO";
  jobId: string;
  engine: string;
  model: string;
  runtime: string;
  voice: string;
  text: string;
  sampleRate: number;
  durationMs: number;
  latencyMs: number;
  wav?: Uint8Array;
  audio?: Float32Array;
}

interface TtsWorkerStoppedMessage {
  type: "STOPPED";
  jobId?: string;
}

interface TtsWorkerSkippedMessage {
  type: "SPEECH_SKIPPED";
  reason: string;
  jobId?: string;
}

interface TtsWorkerErrorMessage {
  type: "ERROR";
  error: string;
  jobId?: string;
}

type TtsWorkerMessage =
  | TtsWorkerStatusMessage
  | TtsWorkerLoadedMessage
  | TtsWorkerAudioMessage
  | TtsWorkerStoppedMessage
  | TtsWorkerSkippedMessage
  | TtsWorkerErrorMessage;

const JOURNEY_STEPS: Array<{
  id: VoicePhase;
  label: string;
}> = [
  { id: "idle", label: "Ready" },
  { id: "listening", label: "Listen" },
  { id: "transcribing", label: "STT" },
  { id: "review", label: "Review" },
  { id: "routing", label: "Route" },
  { id: "routed", label: "Tool" },
  { id: "speaking", label: "Speak" },
];

function normalizeTranscript(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function getPhaseStep(phase: VoicePhase): VoicePhase {
  if (phase === "preparing") return "idle";
  if (phase === "speech") return "listening";
  if (phase === "submitting") return "routed";
  if (phase === "tts-loading" || phase === "tts-ready") return "speaking";
  if (phase === "completed") return "speaking";
  if (phase === "error") return "idle";
  return phase;
}

function getPhaseIndex(phase: VoicePhase): number {
  const step = getPhaseStep(phase);
  return Math.max(
    0,
    JOURNEY_STEPS.findIndex((item) => item.id === step),
  );
}

function formatMs(ms?: number): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function uint8ArrayToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  const view = new Uint8Array(arrayBuffer);

  view.set(bytes);

  return arrayBuffer;
}

function createConfirmationText(command: VoiceCommand): string {
  return `Voice command routed to ${command.toolCall.displayName}. The request is ready in the workspace.`;
}

function getButtonTitle(settings: VoiceSettings, phase: VoicePhase): string {
  if (phase === "preparing") return "Preparing voice";
  if (phase === "listening" || phase === "speech") {
    if (settings.mode === "hold-to-talk") return "Recording. Release to stop.";
    if (settings.mode === "push-to-talk")
      return "Recording. Tap again to stop.";
    return "Listening. Auto stops after speech.";
  }
  if (phase === "review") return "Review transcript";
  if (phase === "routing") return "Routing command";
  if (phase === "routed") return "Tool selected";
  if (phase === "speaking") return "Speaking response";
  if (phase === "error") return "Voice error";
  if (settings.mode === "push-to-talk") return "Tap to speak";
  if (settings.mode === "auto-vad") return "Tap to start voice detection";
  return "Hold to speak";
}

function getEffectiveLanguageLabel(
  settings: VoiceSettings,
  explicitLabel?: string,
): string {
  if (settings.languageHint !== "auto") {
    return mapLanguageHintToDisplayLabel(settings.languageHint);
  }

  return explicitLabel ?? "Auto";
}

function getStatusTone(phase: VoicePhase): "emerald" | "amber" | "rose" {
  if (phase === "error") return "rose";
  if (
    phase === "preparing" ||
    phase === "transcribing" ||
    phase === "routing" ||
    phase === "tts-loading"
  ) {
    return "amber";
  }

  return "emerald";
}

export function VoiceButton({
  onResult,
  disabled,
  language,
  languageLabel,
  className,
}: VoiceButtonProps) {
  const [settings, setSettings] = useState<VoiceSettings>(() =>
    loadVoiceSettings(),
  );
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [status, setStatus] = useState<VoiceStatus>({
    label: "Voice ready",
    detail: "Hold the microphone and speak.",
  });
  const [error, setError] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [pendingTranscript, setPendingTranscript] = useState("");
  const [editableTranscript, setEditableTranscript] = useState("");
  const [routeResult, setRouteResult] = useState<VoiceCommand | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [speechDurationMs, setSpeechDurationMs] = useState(0);
  const [ttsUrl, setTtsUrl] = useState<string | null>(null);
  const [ttsJobId, setTtsJobId] = useState<string | null>(null);
  const [ttsDurationMs, setTtsDurationMs] = useState<number | null>(null);
  const [ttsMetadata, setTtsMetadata] =
    useState<VoiceOutputPlayerMetadata | null>(null);
  const [showPopover, setShowPopover] = useState(false);
  const [activePanel, setActivePanel] = useState<VoiceUtilityPanel>("status");

  const settingsRef = useRef(settings);
  const phaseRef = useRef<VoicePhase>(phase);
  const onResultRef = useRef(onResult);

  const vadServiceRef = useRef<VoiceVadService | null>(null);
  const sttWorkerRef = useRef<Worker | null>(null);
  const routerWorkerRef = useRef<Worker | null>(null);
  const ttsWorkerRef = useRef<Worker | null>(null);

  const activePointerIdRef = useRef<number | null>(null);
  const runIdRef = useRef<string | null>(null);
  const maxRecordingTimerRef = useRef<number | null>(null);
  const completedTimerRef = useRef<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const speechStartAtRef = useRef<number | null>(null);
  const currentAudioRef = useRef<{
    audio: Float32Array;
    sampleRate: number;
    durationMs: number;
  } | null>(null);

  const workerPayload = useMemo(
    () => createVoiceWorkerSettingsPayload(settings),
    [settings],
  );

  const languageBadge = getEffectiveLanguageLabel(settings, languageLabel);
  const outputMode = getVoiceOutputMode(settings);
  const activeStepIndex = getPhaseIndex(phase);
  const statusTone = getStatusTone(phase);
  const isBusy =
    phase === "preparing" ||
    phase === "transcribing" ||
    phase === "routing" ||
    phase === "submitting" ||
    phase === "tts-loading";
  const isRecording = phase === "listening" || phase === "speech";
  const isReviewing = phase === "review";
  const isRouted = phase === "routed";
  const isSpeaking = phase === "speaking";
  const shouldShowPopover =
    showPopover ||
    phase !== "idle" ||
    Boolean(routeResult) ||
    Boolean(pendingTranscript) ||
    Boolean(ttsUrl) ||
    Boolean(error);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const clearMaxRecordingTimer = useCallback(() => {
    if (maxRecordingTimerRef.current !== null) {
      window.clearTimeout(maxRecordingTimerRef.current);
      maxRecordingTimerRef.current = null;
    }
  }, []);

  const clearCompletedTimer = useCallback(() => {
    if (completedTimerRef.current !== null) {
      window.clearTimeout(completedTimerRef.current);
      completedTimerRef.current = null;
    }
  }, []);

  const emitAgui = useCallback(
    (event: Parameters<typeof appendVoiceAguiEvent>[0]) => {
      appendVoiceAguiEvent(event);
    },
    [],
  );

  const failVoice = useCallback(
    (message: string, recoverable = true) => {
      clearMaxRecordingTimer();
      setPhase("error");
      setError(message);
      setStatus({
        label: "Voice failed",
        detail: message,
      });
      setShowPopover(true);

      const runId = runIdRef.current;
      if (runId) {
        emitAgui(
          voiceAguiEvents.error({
            runId,
            error: message,
            recoverable,
          }),
        );
      }

      logVoiceDebug({
        kind: "error",
        severity: "error",
        label: "Voice error",
        message,
        runId: runId ?? undefined,
      });
    },
    [clearMaxRecordingTimer, emitAgui],
  );

  const cleanupAudioUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    setTtsUrl(null);
    setTtsJobId(null);
    setTtsDurationMs(null);
    setTtsMetadata(null);
  }, []);

  const stopTtsPlayback = useCallback(
    (
      reason: "user-stop" | "barge-in" | "completed" | "error" = "user-stop",
    ) => {
      const jobId = ttsJobId;

      if (jobId) {
        ttsWorkerRef.current?.postMessage({
          type: "STOP",
          jobId,
        });
      }

      const runId = runIdRef.current;
      if (runId && jobId) {
        emitAgui(
          voiceAguiEvents.playbackStopped({
            runId,
            jobId,
            reason,
          }),
        );
      }

      cleanupAudioUrl();

      if (reason !== "barge-in") {
        setPhase("idle");
        setStatus({
          label: "Voice ready",
          detail: "Start another voice command.",
        });
      }
    },
    [cleanupAudioUrl, emitAgui, ttsJobId],
  );

  const completeRun = useCallback(
    (command?: VoiceCommand) => {
      const runId = runIdRef.current;

      if (runId) {
        emitAgui(
          voiceAguiEvents.completed({
            runId,
            transcript: command?.normalized ?? editableTranscript,
            intent: command?.intent,
            toolName: command?.toolCall.toolName,
            latency: {},
          }),
        );
      }

      setPhase("completed");
      setStatus({
        label: "Voice command completed",
        detail: command
          ? `${command.toolCall.displayName} is ready in the workspace.`
          : "Voice command completed.",
      });

      clearCompletedTimer();
      completedTimerRef.current = window.setTimeout(() => {
        setPhase("idle");
        setStatus({
          label: "Voice ready",
          detail: "Start another voice command.",
        });
      }, 1800);
    },
    [clearCompletedTimer, editableTranscript, emitAgui],
  );

  const submitCommandToWorkspace = useCallback(
    (command: VoiceCommand) => {
      setPhase("submitting");
      setStatus({
        label: "Submitting command",
        detail: `${command.toolCall.displayName} selected.`,
      });

      onResultRef.current(command.normalized || command.transcript);

      if (shouldSpeakAssistantResponse(settingsRef.current)) {
        const text = createConfirmationText(command);
        const runId = runIdRef.current;

        if (runId) {
          emitAgui(
            voiceAguiEvents.ttsStarted({
              runId,
              ttsEngine: settingsRef.current.ttsEngine,
              voice: settingsRef.current.ttsVoice,
              speakMode: settingsRef.current.speakMode,
              text,
            }),
          );
        }

        setPhase("tts-loading");
        setStatus({
          label: "Generating voice output",
          detail: `${getTtsModel(settingsRef.current.ttsEngine).label} is preparing speech.`,
        });

        ttsWorkerRef.current?.postMessage({
          type: "SPEAK",
          text,
          engine: settingsRef.current.ttsEngine,
          runtime: settingsRef.current.ttsRuntime,
          voice: settingsRef.current.ttsVoice,
          speed: settingsRef.current.ttsSpeed,
          speakMode: settingsRef.current.speakMode,
          outputFormat: "wav",
          chunkSentences: true,
          localModelPath: settingsRef.current.localTtsModelPath ?? undefined,
        });

        return;
      }

      completeRun(command);
    },
    [completeRun, emitAgui],
  );

  const routeTranscript = useCallback(
    (text: string) => {
      const transcript = normalizeTranscript(text);

      if (!transcript) {
        failVoice("Transcript is empty.");
        return;
      }

      const runId = runIdRef.current ?? createVoiceRunId();
      runIdRef.current = runId;

      setPhase("routing");
      setStatus({
        label: "Routing command",
        detail: "Selecting the best local tool for this transcript.",
      });
      setError(null);

      emitAgui(
        voiceAguiEvents.transcriptAccepted({
          runId,
          transcript,
        }),
      );
      emitAgui(
        voiceAguiEvents.routeStarted({
          runId,
          transcript,
        }),
      );

      routerWorkerRef.current?.postMessage({
        type: "ROUTE_COMMAND",
        transcript,
        language:
          settingsRef.current.languageHint !== "auto"
            ? settingsRef.current.languageHint
            : language,
        context: {
          source: "voice-button",
          allowMutations: true,
        },
      });
    },
    [emitAgui, failVoice, language],
  );

  const handleFinalTranscript = useCallback(
    (message: SttWorkerTranscriptionMessage) => {
      const transcript = normalizeTranscript(message.text);

      if (!transcript) {
        failVoice(
          "No speech was detected. Try speaking closer to the microphone.",
        );
        return;
      }

      const runId = runIdRef.current ?? createVoiceRunId();
      runIdRef.current = runId;

      setPendingTranscript(transcript);
      setEditableTranscript(transcript);

      emitAgui(
        voiceAguiEvents.transcriptionCompleted({
          runId,
          transcript,
          language: message.language,
          latencyMs: message.latencyMs,
          audioDurationMs: message.audioDurationMs,
          review: shouldReviewTranscript(settingsRef.current),
        }),
      );

      if (shouldReviewTranscript(settingsRef.current)) {
        setPhase("review");
        setStatus({
          label: "Review transcript",
          detail: "Edit the transcript if needed, then route it.",
        });

        emitAgui(
          voiceAguiEvents.reviewStarted({
            runId,
            transcript,
          }),
        );

        return;
      }

      routeTranscript(transcript);
    },
    [emitAgui, failVoice, routeTranscript],
  );

  const handleVadEvent = useCallback(
    (event: VoiceVadEvent) => {
      const runId = runIdRef.current;

      if (event.type === "READY") {
        updateVoiceWorkerStatus("vad", {
          status: "ready",
          detail: "VAD model ready.",
          model: event.engine,
        });
        return;
      }

      if (event.type === "LISTENING") {
        setPhase("listening");
        setStatus({
          label: "Listening",
          detail:
            settingsRef.current.mode === "hold-to-talk"
              ? "Speak now. Release when finished."
              : settingsRef.current.mode === "push-to-talk"
                ? "Speak now. Tap again to finish."
                : "Speak naturally. I will stop after speech.",
        });

        updateVoiceAudioDebugState({
          isListening: true,
          vadActive: true,
          sampleRate: vadServiceRef.current?.getSnapshot().sampleRate,
        });

        if (runId) {
          emitAgui(
            voiceAguiEvents.inputStarted({
              runId,
            }),
          );
        }

        return;
      }

      if (event.type === "SPEECH_START") {
        speechStartAtRef.current = Date.now();
        setPhase("speech");
        setStatus({
          label: "Speech detected",
          detail: "Capturing your command.",
        });
        setAudioLevel(0.7);
        setSpeechDurationMs(0);

        updateVoiceAudioDebugState({
          isListening: true,
          vadActive: true,
          lastSpeechStartedAt: Date.now(),
        });

        if (runId) {
          emitAgui(voiceAguiEvents.speechStarted(runId));
        }

        return;
      }

      if (event.type === "SPEECH_END") {
        clearMaxRecordingTimer();

        currentAudioRef.current = {
          audio: event.audio,
          sampleRate: event.sampleRate,
          durationMs: event.durationMs,
        };

        setPhase("transcribing");
        setAudioLevel(0);
        setSpeechDurationMs(event.durationMs);
        setStatus({
          label: "Transcribing locally",
          detail: `${settingsRef.current.sttEngine} · ${settingsRef.current.sttRuntime}`,
        });

        updateVoiceAudioDebugState({
          isListening: false,
          vadActive: false,
          lastSpeechEndedAt: Date.now(),
          lastAudioDurationMs: event.durationMs,
          lastPeak: event.peak,
          lastRms: event.rms,
        });

        if (runId) {
          emitAgui(
            voiceAguiEvents.speechEnded({
              runId,
              durationMs: event.durationMs,
              peak: event.peak,
              rms: event.rms,
              sampleRate: event.sampleRate,
            }),
          );

          emitAgui(
            voiceAguiEvents.transcriptionStarted({
              runId,
              sttEngine: settingsRef.current.sttEngine,
              runtime: settingsRef.current.sttRuntime,
              language: settingsRef.current.languageHint,
              audioDurationMs: event.durationMs,
            }),
          );
        }

        sttWorkerRef.current?.postMessage({
          type: "TRANSCRIBE",
          audio: event.audio,
          sampleRate: event.sampleRate,
          engine: settingsRef.current.sttEngine,
          runtime: settingsRef.current.sttRuntime,
          language:
            settingsRef.current.languageHint !== "auto"
              ? settingsRef.current.languageHint
              : language,
          allowRemoteModels: settingsRef.current.allowRemoteSttModels,
          localModelPath: settingsRef.current.localSttModelPath ?? undefined,
        });

        return;
      }

      if (event.type === "MISFIRE") {
        setStatus({
          label: "Speech too short",
          detail: event.detail,
        });
        return;
      }

      if (event.type === "FRAME_PROCESSED") {
        if (typeof event.speechProbability === "number") {
          setAudioLevel(Math.min(1, Math.max(0, event.speechProbability)));
        }

        if (speechStartAtRef.current) {
          setSpeechDurationMs(Date.now() - speechStartAtRef.current);
        }

        return;
      }

      if (event.type === "ERROR") {
        failVoice(event.error);
      }
    },
    [clearMaxRecordingTimer, emitAgui, failVoice, language],
  );

  const initializeWorkers = useCallback(() => {
    if (!sttWorkerRef.current) {
      const sttWorker = new Worker(
        new URL("../core/voice/voice-stt-worker.ts", import.meta.url),
        { type: "module" },
      );

      sttWorker.onmessage = (event: MessageEvent<SttWorkerMessage>) => {
        const message = event.data;

        if (message.type === "STATUS") {
          updateVoiceWorkerStatus("stt", {
            status:
              message.status === "ready"
                ? "ready"
                : message.status === "idle"
                  ? "idle"
                  : message.status === "failed"
                    ? "error"
                    : "loading",
            detail: message.detail ?? message.status,
            model: message.model,
            progress:
              typeof message.progress?.progress === "number"
                ? Math.round(message.progress.progress)
                : undefined,
          });

          if (message.status === "downloading-model") {
            setStatus({
              label: "Downloading STT model",
              detail: message.detail ?? "Preparing local speech model.",
              progress:
                typeof message.progress?.progress === "number"
                  ? Math.round(message.progress.progress)
                  : undefined,
            });
          }

          return;
        }

        if (message.type === "MODEL_LOADED") {
          setModelReady(true);
          updateVoiceWorkerStatus("stt", {
            status: "ready",
            detail: `${message.model} ready.`,
            model: message.model,
          });
          return;
        }

        if (message.type === "TRANSCRIPTION") {
          updateVoiceWorkerStatus("stt", {
            status: "ready",
            detail: `Transcribed in ${message.latencyMs}ms.`,
            model: message.model,
          });

          handleFinalTranscript(message);
          return;
        }

        if (message.type === "ERROR") {
          updateVoiceWorkerStatus("stt", {
            status: "error",
            error: message.error,
          });
          failVoice(message.error);
        }
      };

      sttWorker.onerror = (event) => {
        failVoice(event.message || "STT worker crashed.");
      };

      sttWorkerRef.current = sttWorker;
    }

    if (!routerWorkerRef.current) {
      const routerWorker = new Worker(
        new URL("../core/voice/voice-command-router.ts", import.meta.url),
        { type: "module" },
      );

      routerWorker.onmessage = (event: MessageEvent<VoiceRouteResponse>) => {
        const message = event.data;

        if (message.type === "ROUTER_READY") {
          updateVoiceWorkerStatus("router", {
            status: "ready",
            detail: "Voice router ready.",
          });
          return;
        }

        if (message.type === "CAPABILITIES") {
          updateVoiceWorkerStatus("router", {
            status: "ready",
            detail: `${message.intents.length} intents available.`,
          });
          return;
        }

        if (message.type === "COMMAND_ROUTED") {
          const command = message.command;
          const runId = runIdRef.current ?? createVoiceRunId();
          runIdRef.current = runId;

          setRouteResult(command);
          setPhase("routed");
          setStatus({
            label: "Tool selected",
            detail: `${command.toolCall.displayName} · ${Math.round(
              command.confidence * 100,
            )}% confidence`,
          });

          appendVoiceAguiEvents(
            createRouteCompletedEventGroup({
              runId,
              command,
              includeUserMessage: true,
            }),
          );

          updateVoiceWorkerStatus("router", {
            status: "ready",
            detail: `${command.intent} → ${command.toolCall.toolName}`,
          });

          if (
            command.toolCall.requiresConfirmation &&
            settingsRef.current.requireToolConfirmation
          ) {
            return;
          }

          submitCommandToWorkspace(command);
          return;
        }

        if (message.type === "ROUTE_ERROR") {
          updateVoiceWorkerStatus("router", {
            status: "error",
            error: message.error,
          });
          failVoice(message.error);
        }
      };

      routerWorker.onerror = (event) => {
        failVoice(event.message || "Router worker crashed.");
      };

      routerWorkerRef.current = routerWorker;
    }

    if (!ttsWorkerRef.current) {
      const ttsWorker = new Worker(
        new URL("../core/voice/voice-tts-worker.ts", import.meta.url),
        { type: "module" },
      );

      ttsWorker.onmessage = (event: MessageEvent<TtsWorkerMessage>) => {
        const message = event.data;

        if (message.type === "STATUS") {
          updateVoiceWorkerStatus("tts", {
            status:
              message.status === "ready"
                ? "ready"
                : message.status === "idle"
                  ? "idle"
                  : message.status === "failed"
                    ? "error"
                    : "loading",
            detail: message.detail ?? message.status,
            progress: message.progress,
          });

          if (phaseRef.current === "tts-loading") {
            setStatus({
              label: "Generating voice output",
              detail: message.detail ?? "Synthesizing speech.",
              progress: message.progress,
            });
          }

          return;
        }

        if (message.type === "MODEL_LOADED") {
          updateVoiceWorkerStatus("tts", {
            status: "ready",
            detail: `${message.model} ready.`,
            model: message.model,
          });
          return;
        }

        if (message.type === "SPEECH_SKIPPED") {
          completeRun(routeResult ?? undefined);
          return;
        }

        if (message.type === "STOPPED") {
          updateVoiceWorkerStatus("tts", {
            status: "stopped",
            detail: "TTS stopped.",
          });
          return;
        }

        if (message.type === "SPEECH_AUDIO") {
          const runId = runIdRef.current;

          cleanupAudioUrl();

          setTtsJobId(message.jobId);
          setTtsDurationMs(message.durationMs);
          setTtsMetadata({
            jobId: message.jobId,
            engine: message.engine,
            model: message.model,
            runtime: message.runtime,
            voice: message.voice,
            sampleRate: message.sampleRate,
            durationMs: message.durationMs,
            latencyMs: message.latencyMs,
            text: message.text,
            createdAt: Date.now(),
          });

          if (runId) {
            emitAgui(
              voiceAguiEvents.ttsAudioReady({
                runId,
                jobId: message.jobId,
                durationMs: message.durationMs,
                latencyMs: message.latencyMs,
                sampleRate: message.sampleRate,
              }),
            );
          }

          if (!message.wav) {
            setPhase("tts-ready");
            setStatus({
              label: "Speech audio generated",
              detail: "Audio is ready, but no WAV payload was returned.",
            });
            return;
          }
          const wavBuffer = uint8ArrayToArrayBuffer(message.wav);

          const blob = new Blob([wavBuffer], {
            type: "audio/wav",
          });

          const url = URL.createObjectURL(blob);
          objectUrlRef.current = url;
          setTtsUrl(url);
          setActivePanel("status");

          setPhase("tts-ready");
          setStatus({
            label: "Voice output ready",
            detail: `${formatMs(message.durationMs)} generated in ${formatMs(
              message.latencyMs,
            )}.`,
          });

          return;
        }

        if (message.type === "ERROR") {
          updateVoiceWorkerStatus("tts", {
            status: "error",
            error: message.error,
          });
          failVoice(message.error);
        }
      };

      ttsWorker.onerror = (event) => {
        failVoice(event.message || "TTS worker crashed.");
      };

      ttsWorkerRef.current = ttsWorker;
    }
  }, [
    cleanupAudioUrl,
    completeRun,
    emitAgui,
    failVoice,
    handleFinalTranscript,
    routeResult,
    submitCommandToWorkspace,
  ]);

  useEffect(() => {
    initializeWorkers();

    const currentSettings = loadVoiceSettings();
    setSettings(currentSettings);
    settingsRef.current = currentSettings;

    if (currentSettings.preloadSttModel) {
      sttWorkerRef.current?.postMessage({
        type: "LOAD_MODEL",
        engine: currentSettings.sttEngine,
        runtime: currentSettings.sttRuntime,
        allowRemoteModels: currentSettings.allowRemoteSttModels,
        localModelPath: currentSettings.localSttModelPath ?? undefined,
      });
    }

    if (
      currentSettings.preloadTtsModel &&
      currentSettings.ttsEngine !== "off"
    ) {
      ttsWorkerRef.current?.postMessage({
        type: "LOAD_MODEL",
        engine: currentSettings.ttsEngine,
        runtime: currentSettings.ttsRuntime,
        localModelPath: currentSettings.localTtsModelPath ?? undefined,
      });
    }

    const unsubscribe = subscribeVoiceSettings((event) => {
      const next = event.settings;
      setSettings(next);
      settingsRef.current = next;

      if (next.preloadSttModel) {
        sttWorkerRef.current?.postMessage({
          type: "LOAD_MODEL",
          engine: next.sttEngine,
          runtime: next.sttRuntime,
          allowRemoteModels: next.allowRemoteSttModels,
          localModelPath: next.localSttModelPath ?? undefined,
        });
      }

      if (next.preloadTtsModel && next.ttsEngine !== "off") {
        ttsWorkerRef.current?.postMessage({
          type: "LOAD_MODEL",
          engine: next.ttsEngine,
          runtime: next.ttsRuntime,
          localModelPath: next.localTtsModelPath ?? undefined,
        });
      }
    });

    return () => {
      unsubscribe();
      clearMaxRecordingTimer();
      clearCompletedTimer();
      cleanupAudioUrl();

      vadServiceRef.current?.destroy().catch(() => {});
      vadServiceRef.current = null;

      sttWorkerRef.current?.terminate();
      routerWorkerRef.current?.terminate();
      ttsWorkerRef.current?.terminate();

      sttWorkerRef.current = null;
      routerWorkerRef.current = null;
      ttsWorkerRef.current = null;
    };
  }, [
    cleanupAudioUrl,
    clearCompletedTimer,
    clearMaxRecordingTimer,
    initializeWorkers,
  ]);

  const startVoice = useCallback(async () => {
    if (disabled) return;

    if (settingsRef.current.bargeInEnabled && phaseRef.current === "speaking") {
      stopTtsPlayback("barge-in");
      setPhase("idle");
      setStatus({
        label: "Voice ready",
        detail: "Speech playback stopped. Tap again to record.",
      });
      return;
    }

    if (isBusy || isReviewing || isRouted || isSpeaking) return;

    if (!isVoiceVadSupported()) {
      failVoice("Voice VAD is not supported in this browser.");
      return;
    }

    clearMaxRecordingTimer();
    clearCompletedTimer();
    cleanupAudioUrl();

    const runId = createVoiceRunId();
    runIdRef.current = runId;
    speechStartAtRef.current = null;
    currentAudioRef.current = null;

    setShowPopover(true);
    setActivePanel("status");
    setError(null);
    setRouteResult(null);
    setPendingTranscript("");
    setEditableTranscript("");
    setAudioLevel(0);
    setSpeechDurationMs(0);
    setPhase("preparing");
    setStatus({
      label: "Preparing microphone",
      detail: getVoiceSettingsSummary(settingsRef.current),
    });

    emitAgui(
      voiceAguiEvents.runStarted({
        runId,
        source: "voice-button",
        mode: settingsRef.current.mode,
        models: {
          sttEngine: settingsRef.current.sttEngine,
          sttRuntime: settingsRef.current.sttRuntime,
          ttsEngine: settingsRef.current.ttsEngine,
          ttsRuntime: settingsRef.current.ttsRuntime,
          language: settingsRef.current.languageHint,
        },
      }),
    );

    try {
      await vadServiceRef.current?.destroy().catch(() => {});
      vadServiceRef.current = null;

      const payload = createVoiceWorkerSettingsPayload(settingsRef.current);

      vadServiceRef.current = createVoiceVadService({
        mode: settingsRef.current.mode,
        deviceId: settingsRef.current.inputDeviceId ?? undefined,
        emitFrameEvents: settingsRef.current.emitVadFrameEvents,
        positiveSpeechThreshold: payload.vad.positiveSpeechThreshold,
        negativeSpeechThreshold: payload.vad.negativeSpeechThreshold,
        redemptionFrames: payload.vad.redemptionFrames,
        preSpeechPadFrames: payload.vad.preSpeechPadFrames,
        minSpeechFrames: payload.vad.minSpeechFrames,
        submitUserSpeechOnPause: true,
        onEvent: handleVadEvent,
      });

      await vadServiceRef.current.start();

      maxRecordingTimerRef.current = window.setTimeout(() => {
        vadServiceRef.current?.pause().catch(() => {});
      }, settingsRef.current.maxRecordingMs);
    } catch (error) {
      failVoice(error instanceof Error ? error.message : String(error));
    }
  }, [
    cleanupAudioUrl,
    clearCompletedTimer,
    clearMaxRecordingTimer,
    disabled,
    emitAgui,
    failVoice,
    handleVadEvent,
    isBusy,
    isReviewing,
    isRouted,
    isSpeaking,
    stopTtsPlayback,
  ]);

  const stopVoice = useCallback(async () => {
    clearMaxRecordingTimer();

    try {
      await vadServiceRef.current?.pause();
    } catch (error) {
      failVoice(error instanceof Error ? error.message : String(error));
    }
  }, [clearMaxRecordingTimer, failVoice]);

  const cancelCurrentRun = useCallback(() => {
    const runId = runIdRef.current;

    clearMaxRecordingTimer();
    cleanupAudioUrl();
    vadServiceRef.current?.pause().catch(() => {});
    ttsWorkerRef.current?.postMessage({
      type: "STOP",
      jobId: ttsJobId ?? undefined,
    });

    if (runId) {
      emitAgui(
        voiceAguiEvents.cancelled({
          runId,
          reason: "User cancelled voice run.",
        }),
      );
    }

    setActivePanel("status");
    setPhase("idle");
    setStatus({
      label: "Voice ready",
      detail: "Voice run cancelled.",
    });
    setError(null);
    setPendingTranscript("");
    setEditableTranscript("");
    setRouteResult(null);
    setAudioLevel(0);
    setSpeechDurationMs(0);
  }, [cleanupAudioUrl, clearMaxRecordingTimer, emitAgui, ttsJobId]);

  const resetActivePointer = useCallback(
    (event?: ReactPointerEvent<HTMLButtonElement>) => {
      const pointerId = activePointerIdRef.current;

      if (
        event &&
        pointerId !== null &&
        event.currentTarget.hasPointerCapture(pointerId)
      ) {
        event.currentTarget.releasePointerCapture(pointerId);
      }

      activePointerIdRef.current = null;
    },
    [],
  );

  const handlePointerDown = useCallback(
    async (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      if (disabled) return;
      if (activePointerIdRef.current !== null) return;

      event.preventDefault();

      if (phaseRef.current === "speaking") {
        if (settingsRef.current.bargeInEnabled) {
          stopTtsPlayback("barge-in");
          setPhase("idle");
          setStatus({
            label: "Voice ready",
            detail: "Speech playback stopped. Tap again to record.",
          });
        }
        return;
      }

      if (phaseRef.current === "routed") {
        cancelCurrentRun();
        return;
      }

      if (shouldToggleOnPointerDown(settingsRef.current) && isRecording) {
        await stopVoice();
        return;
      }

      activePointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);

      try {
        await startVoice();
      } catch {
        resetActivePointer(event);
      }
    },
    [
      cancelCurrentRun,
      disabled,
      isRecording,
      resetActivePointer,
      startVoice,
      stopTtsPlayback,
      stopVoice,
    ],
  );

  const handlePointerUp = useCallback(
    async (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (activePointerIdRef.current !== event.pointerId) return;

      event.preventDefault();
      resetActivePointer(event);

      if (shouldStopOnPointerUp(settingsRef.current)) {
        await stopVoice();
      }
    },
    [resetActivePointer, stopVoice],
  );

  const handlePointerCancel = useCallback(
    async (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (activePointerIdRef.current !== event.pointerId) return;

      resetActivePointer(event);

      if (shouldStopOnPointerUp(settingsRef.current)) {
        await stopVoice();
      }
    },
    [resetActivePointer, stopVoice],
  );

  const acceptTranscriptValue = useCallback(
    (value: string) => {
      const original = pendingTranscript;
      const edited = normalizeTranscript(value);
      const runId = runIdRef.current;

      if (!edited) {
        failVoice("Transcript is empty.");
        return;
      }

      setEditableTranscript(edited);

      if (runId && original !== edited) {
        emitAgui(
          voiceAguiEvents.transcriptEdited({
            runId,
            originalTranscript: original,
            editedTranscript: edited,
          }),
        );
      }

      routeTranscript(edited);
    },
    [emitAgui, failVoice, pendingTranscript, routeTranscript],
  );

  const retryTranscript = useCallback(() => {
    setPendingTranscript("");
    setEditableTranscript("");
    setRouteResult(null);
    setPhase("idle");
    setStatus({
      label: "Voice ready",
      detail: "Start another voice command.",
    });
  }, []);

  const handleOutputPlay = useCallback(
    (metadata: VoiceOutputPlayerMetadata) => {
      const runId = runIdRef.current;
      const jobId = metadata.jobId ?? ttsJobId;

      setPhase("speaking");
      setStatus({
        label: "Speaking",
        detail: "Playing local TTS output.",
      });

      updateVoiceAudioDebugState({
        isSpeaking: true,
      });

      if (runId && jobId) {
        emitAgui(
          voiceAguiEvents.playbackStarted({
            runId,
            jobId,
            durationMs: metadata.durationMs ?? ttsDurationMs ?? undefined,
          }),
        );
      }
    },
    [emitAgui, ttsDurationMs, ttsJobId],
  );

  const handleOutputPause = useCallback(
    (metadata: VoiceOutputPlayerMetadata & { positionMs: number }) => {
      const runId = runIdRef.current;
      const jobId = metadata.jobId ?? ttsJobId;

      updateVoiceAudioDebugState({
        isSpeaking: false,
      });

      if (runId && jobId) {
        emitAgui(
          voiceAguiEvents.playbackPaused({
            runId,
            jobId,
            positionMs: metadata.positionMs,
          }),
        );
      }

      setPhase("tts-ready");
      setStatus({
        label: "Voice output paused",
        detail: "Press play to resume.",
      });
    },
    [emitAgui, ttsJobId],
  );

  const handleOutputEnded = useCallback(
    (metadata: VoiceOutputPlayerMetadata) => {
      const runId = runIdRef.current;
      const jobId = metadata.jobId ?? ttsJobId;

      updateVoiceAudioDebugState({
        isSpeaking: false,
      });

      if (runId && jobId) {
        emitAgui(
          voiceAguiEvents.playbackCompleted({
            runId,
            jobId,
            durationMs: metadata.durationMs ?? ttsDurationMs ?? undefined,
          }),
        );
      }

      completeRun(routeResult ?? undefined);
    },
    [completeRun, emitAgui, routeResult, ttsDurationMs, ttsJobId],
  );

  const handleOutputError = useCallback(
    (message: string) => {
      updateVoiceAudioDebugState({
        isSpeaking: false,
      });
      failVoice(message);
    },
    [failVoice],
  );

  const icon = (() => {
    if (phase === "error") return <AlertTriangle className="h-4 w-4" />;
    if (isBusy) return <Loader2 className="h-4 w-4 animate-spin" />;
    if (isRecording) return <MicOff className="h-4 w-4 animate-pulse" />;
    if (phase === "completed") return <CheckCircle2 className="h-4 w-4" />;
    return <Mic className="h-4 w-4" />;
  })();

  return (
    <div
      className="relative flex shrink-0 items-center justify-center"
      onMouseEnter={() => setShowPopover(true)}
      onMouseLeave={() => {
        if (
          activePanel === "status" &&
          phase === "idle" &&
          !routeResult &&
          !pendingTranscript &&
          !ttsUrl &&
          !error
        ) {
          setShowPopover(false);
        }
      }}
    >
      {shouldShowPopover && (
        <div
          className={cn(
            "absolute bottom-full left-0 z-50 mb-3 w-[560px] max-w-[calc(100vw-2rem)] rounded-2xl border p-3 text-left shadow-2xl backdrop-blur-xl",
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
                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border",
                statusTone === "rose"
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                  : statusTone === "amber"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
              )}
            >
              {icon}
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-foreground">
                {status.label}
              </div>
              <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                {error ?? status.detail}
              </div>

              <div className="mt-1 flex flex-wrap gap-1">
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
                  {settings.mode}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
                  {languageBadge}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
                  {settings.sttEngine}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
                  {outputMode}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setActivePanel("status")}
                className={cn(
                  "rounded-lg border px-2 py-1 text-[10px] transition-colors",
                  activePanel === "status"
                    ? "border-emerald-500/25 bg-emerald-500/15 text-emerald-300"
                    : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground",
                )}
              >
                Status
              </button>
              <button
                type="button"
                onClick={() => setActivePanel("settings")}
                className={cn(
                  "rounded-lg border p-1.5 transition-colors",
                  activePanel === "settings"
                    ? "border-emerald-500/25 bg-emerald-500/15 text-emerald-300"
                    : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground",
                )}
                aria-label="Voice settings"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setActivePanel("debug")}
                className={cn(
                  "rounded-lg border p-1.5 transition-colors",
                  activePanel === "debug"
                    ? "border-emerald-500/25 bg-emerald-500/15 text-emerald-300"
                    : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground",
                )}
                aria-label="Voice debug"
              >
                <Sparkles className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowPopover(false)}
                className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                aria-label="Hide voice panel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {activePanel === "settings" && (
            <VoiceSettingsPanel
              className="mt-3 border-white/10 bg-black/20 shadow-none"
              compact
            />
          )}

          {activePanel === "debug" && (
            <VoiceDebugPanel
              className="mt-3 border-white/10 bg-black/20 shadow-none"
              compact
            />
          )}

          {activePanel === "status" && (
            <>
              {settings.showJourney && (
                <div className="mt-3 grid grid-cols-7 gap-1">
                  {JOURNEY_STEPS.map((step, index) => {
                    const active = index === activeStepIndex;
                    const done = index < activeStepIndex;

                    return (
                      <div key={step.id} className="min-w-0">
                        <div
                          className={cn(
                            "h-1 rounded-full transition-colors",
                            active || done ? "bg-emerald-400" : "bg-white/10",
                          )}
                        />
                        <div
                          className={cn(
                            "mt-1 truncate text-center text-[9px]",
                            active
                              ? "font-medium text-emerald-300"
                              : done
                                ? "text-emerald-300/70"
                                : "text-muted-foreground/60",
                          )}
                        >
                          {step.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {typeof status.progress === "number" && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all"
                    style={{
                      width: `${Math.min(100, Math.max(2, status.progress))}%`,
                    }}
                  />
                </div>
              )}

              {isRecording && (
                <div className="mt-3 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] p-2">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-300">
                      Live microphone
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatMs(speechDurationMs)}
                    </span>
                  </div>

                  <div className="flex h-9 items-end gap-1">
                    {Array.from({ length: 24 }).map((_, index) => {
                      const height =
                        18 + audioLevel * 72 * (index % 3 === 0 ? 1 : 0.62);

                      return (
                        <span
                          key={index}
                          className="w-1 flex-1 rounded-full bg-emerald-300/70 transition-all"
                          style={{ height: `${height}%` }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {isReviewing && (
                <VoiceTranscriptReview
                  className="mt-3 border-white/10 bg-black/25 shadow-none"
                  transcript={editableTranscript || pendingTranscript}
                  metadata={{
                    language: settings.languageHint,
                    sttEngine: settings.sttEngine,
                    runtime: settings.sttRuntime,
                    audioDurationMs: currentAudioRef.current?.durationMs,
                    sampleRate: currentAudioRef.current?.sampleRate,
                  }}
                  description={`Behavior: ${getTranscriptBehavior(settings)}.`}
                  acceptLabel="Route transcript"
                  retryLabel="Retry recording"
                  onChange={setEditableTranscript}
                  onAccept={acceptTranscriptValue}
                  onRetry={retryTranscript}
                  onCancel={cancelCurrentRun}
                  onClear={() => setEditableTranscript("")}
                />
              )}

              {routeResult && (
                <VoiceToolPreview
                  className="mt-3 border-emerald-500/15 bg-emerald-500/[0.05] shadow-none"
                  command={routeResult}
                  disabled={phase !== "routed"}
                  compact
                  requireConfirmation={
                    settings.requireToolConfirmation &&
                    routeResult.toolCall.requiresConfirmation
                  }
                  runLabel="Run command"
                  confirmLabel="Confirm and run"
                  cancelLabel="Cancel voice command"
                  onRun={({ command }) => {
                    if (command) submitCommandToWorkspace(command);
                  }}
                  onConfirm={({ command }) => {
                    if (command) submitCommandToWorkspace(command);
                  }}
                  onCancel={cancelCurrentRun}
                  onEditTranscript={(transcript) => {
                    setPendingTranscript(transcript);
                    setEditableTranscript(transcript);
                    setRouteResult(null);
                    setPhase("review");
                    setStatus({
                      label: "Review transcript",
                      detail:
                        "Edit the routed transcript, then route it again.",
                    });
                  }}
                />
              )}

              {(ttsUrl || phase === "tts-ready" || phase === "speaking") && (
                <VoiceOutputPlayer
                  className="mt-3 border-white/10 bg-white/[0.04] shadow-none"
                  src={ttsUrl}
                  metadata={
                    ttsMetadata ?? {
                      jobId: ttsJobId ?? undefined,
                      engine: settings.ttsEngine,
                      runtime: settings.ttsRuntime,
                      voice: settings.ttsVoice,
                      durationMs: ttsDurationMs ?? undefined,
                    }
                  }
                  autoPlay={settings.autoPlayTts && phase === "tts-ready"}
                  compact
                  showWaveform
                  onPlay={handleOutputPlay}
                  onPause={handleOutputPause}
                  onResume={handleOutputPlay}
                  onReplay={handleOutputPlay}
                  onStop={() => stopTtsPlayback("user-stop")}
                  onEnded={handleOutputEnded}
                  onError={handleOutputError}
                  onClose={() => stopTtsPlayback("user-stop")}
                />
              )}

              {settings.ttsEngine === "off" && (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
                  <div className="flex items-start gap-2">
                    <VolumeX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div>
                      <div className="text-[11px] font-medium text-foreground">
                        Voice output is disabled
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        Enable Kokoro or Piper in voice settings to hear
                        responses.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        disabled={disabled}
        aria-disabled={isBusy || isReviewing}
        aria-pressed={isRecording}
        aria-label={getButtonTitle(settings, phase)}
        title={getButtonTitle(settings, phase)}
        className={cn(
          "relative flex touch-none select-none items-center justify-center rounded-xl border transition-all",
          isRecording
            ? "scale-105 border-emerald-400/60 bg-emerald-500/25 text-emerald-200 shadow-lg shadow-emerald-500/20"
            : phase === "error"
              ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
              : isBusy
                ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
                : phase === "routed" || phase === "completed"
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground",
          className,
        )}
      >
        {icon}

        {modelReady && phase === "idle" && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-background" />
        )}

        {isRecording && (
          <>
            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-background" />
            <span className="absolute -right-1 -top-1 h-3 w-3 animate-ping rounded-full bg-emerald-400/70" />
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

        {!isRecording && phase === "idle" && (
          <span className="pointer-events-none absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-background bg-background">
            <Settings2 className="h-2.5 w-2.5 text-muted-foreground" />
          </span>
        )}

        {phase === "error" && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setPhase("idle");
              setError(null);
              setStatus({
                label: "Voice ready",
                detail: "Try again.",
              });
            }}
            className="absolute -right-2 -top-2 rounded-full border border-background bg-rose-500 p-0.5 text-white"
            aria-label="Reset voice error"
          >
            <RefreshCcw className="h-2.5 w-2.5" />
          </button>
        )}
      </button>
    </div>
  );
}
