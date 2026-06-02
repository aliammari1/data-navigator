/**
 * Voice AG-UI Events
 *
 * Provider-neutral event model for rendering a rich voice-agent journey.
 *
 * This file does not require @ag-ui/client directly. It keeps the app decoupled
 * while using an AG-UI-style lifecycle:
 *
 * user message → assistant run → tool call → tool result → assistant response
 *
 * Use this to power:
 * - voice journey timeline
 * - transcript review
 * - tool preview
 * - debug panel
 * - TTS playback status
 */

import type { VoiceCommand, VoiceToolCall } from "./voice-command-router";
import type {
  SttEngine,
  TtsEngine,
  VoiceLanguageHint,
  VoiceRuntime,
} from "./voice-model-registry";

/* ------------------------------------------------------------------ */
/*  Base types                                                         */
/* ------------------------------------------------------------------ */

export type VoiceAguiRole = "user" | "assistant" | "tool" | "system";

export type VoiceAguiRunStatus =
  | "idle"
  | "started"
  | "listening"
  | "transcribing"
  | "reviewing"
  | "routing"
  | "tool-calling"
  | "responding"
  | "speaking"
  | "completed"
  | "cancelled"
  | "error";

export type VoiceAguiEventType =
  | "VOICE_RUN_STARTED"
  | "VOICE_RUN_STATUS"
  | "VOICE_RUN_COMPLETED"
  | "VOICE_RUN_CANCELLED"
  | "VOICE_RUN_ERROR"
  | "VOICE_INPUT_STARTED"
  | "VOICE_SPEECH_STARTED"
  | "VOICE_SPEECH_ENDED"
  | "VOICE_TRANSCRIPTION_STARTED"
  | "VOICE_TRANSCRIPTION_DELTA"
  | "VOICE_TRANSCRIPTION_COMPLETED"
  | "VOICE_TRANSCRIPTION_REVIEW_STARTED"
  | "VOICE_TRANSCRIPTION_EDITED"
  | "VOICE_TRANSCRIPTION_ACCEPTED"
  | "VOICE_ROUTE_STARTED"
  | "VOICE_ROUTE_COMPLETED"
  | "USER_MESSAGE_START"
  | "USER_MESSAGE_CONTENT"
  | "USER_MESSAGE_END"
  | "ASSISTANT_MESSAGE_START"
  | "ASSISTANT_MESSAGE_CONTENT"
  | "ASSISTANT_MESSAGE_END"
  | "TOOL_CALL_START"
  | "TOOL_CALL_ARGS"
  | "TOOL_CALL_END"
  | "TOOL_RESULT"
  | "TTS_STARTED"
  | "TTS_AUDIO_READY"
  | "TTS_PLAYBACK_STARTED"
  | "TTS_PLAYBACK_PAUSED"
  | "TTS_PLAYBACK_RESUMED"
  | "TTS_PLAYBACK_STOPPED"
  | "TTS_PLAYBACK_COMPLETED"
  | "BARGE_IN_DETECTED"
  | "MODEL_STATUS"
  | "DEBUG_EVENT";

export interface VoiceAguiBaseEvent {
  id: string;
  type: VoiceAguiEventType;
  runId: string;
  timestamp: number;
  status?: VoiceAguiRunStatus;
}

export interface VoiceAguiModelInfo {
  vadEngine?: string;
  sttEngine?: SttEngine;
  sttRuntime?: VoiceRuntime;
  ttsEngine?: TtsEngine;
  ttsRuntime?: VoiceRuntime;
  language?: VoiceLanguageHint;
}

export interface VoiceAguiLatencyInfo {
  startedAt?: number;
  speechStartedAt?: number;
  speechEndedAt?: number;
  transcriptionStartedAt?: number;
  transcriptionEndedAt?: number;
  routingStartedAt?: number;
  routingEndedAt?: number;
  toolStartedAt?: number;
  toolEndedAt?: number;
  assistantStartedAt?: number;
  assistantEndedAt?: number;
  ttsStartedAt?: number;
  ttsAudioReadyAt?: number;
  playbackStartedAt?: number;
  playbackEndedAt?: number;
}

/* ------------------------------------------------------------------ */
/*  Events                                                             */
/* ------------------------------------------------------------------ */

export interface VoiceRunStartedEvent extends VoiceAguiBaseEvent {
  type: "VOICE_RUN_STARTED";
  status: "started";
  source: "voice-button" | "command-bar" | "simulation";
  mode: "hold-to-talk" | "push-to-talk" | "auto-vad";
  models: VoiceAguiModelInfo;
}

export interface VoiceRunStatusEvent extends VoiceAguiBaseEvent {
  type: "VOICE_RUN_STATUS";
  status: VoiceAguiRunStatus;
  label: string;
  detail?: string;
  progress?: number;
}

export interface VoiceRunCompletedEvent extends VoiceAguiBaseEvent {
  type: "VOICE_RUN_COMPLETED";
  status: "completed";
  transcript?: string;
  intent?: string;
  toolName?: string;
  latency: VoiceAguiLatencyInfo;
}

export interface VoiceRunCancelledEvent extends VoiceAguiBaseEvent {
  type: "VOICE_RUN_CANCELLED";
  status: "cancelled";
  reason: string;
}

export interface VoiceRunErrorEvent extends VoiceAguiBaseEvent {
  type: "VOICE_RUN_ERROR";
  status: "error";
  error: string;
  recoverable: boolean;
}

export interface VoiceInputStartedEvent extends VoiceAguiBaseEvent {
  type: "VOICE_INPUT_STARTED";
  status: "listening";
  sampleRate?: number;
  deviceLabel?: string;
}

export interface VoiceSpeechStartedEvent extends VoiceAguiBaseEvent {
  type: "VOICE_SPEECH_STARTED";
  status: "listening";
}

export interface VoiceSpeechEndedEvent extends VoiceAguiBaseEvent {
  type: "VOICE_SPEECH_ENDED";
  status: "transcribing";
  durationMs: number;
  peak?: number;
  rms?: number;
  sampleRate?: number;
}

export interface VoiceTranscriptionStartedEvent extends VoiceAguiBaseEvent {
  type: "VOICE_TRANSCRIPTION_STARTED";
  status: "transcribing";
  sttEngine: SttEngine;
  runtime: VoiceRuntime;
  language: VoiceLanguageHint;
  audioDurationMs?: number;
}

export interface VoiceTranscriptionDeltaEvent extends VoiceAguiBaseEvent {
  type: "VOICE_TRANSCRIPTION_DELTA";
  status: "transcribing";
  delta: string;
  text: string;
}

export interface VoiceTranscriptionCompletedEvent extends VoiceAguiBaseEvent {
  type: "VOICE_TRANSCRIPTION_COMPLETED";
  status: "reviewing" | "routing";
  transcript: string;
  language?: string;
  latencyMs?: number;
  audioDurationMs?: number;
}

export interface VoiceTranscriptionReviewStartedEvent
  extends VoiceAguiBaseEvent {
  type: "VOICE_TRANSCRIPTION_REVIEW_STARTED";
  status: "reviewing";
  transcript: string;
}

export interface VoiceTranscriptionEditedEvent extends VoiceAguiBaseEvent {
  type: "VOICE_TRANSCRIPTION_EDITED";
  status: "reviewing";
  originalTranscript: string;
  editedTranscript: string;
}

export interface VoiceTranscriptionAcceptedEvent extends VoiceAguiBaseEvent {
  type: "VOICE_TRANSCRIPTION_ACCEPTED";
  status: "routing";
  transcript: string;
}

export interface VoiceRouteStartedEvent extends VoiceAguiBaseEvent {
  type: "VOICE_ROUTE_STARTED";
  status: "routing";
  transcript: string;
}

export interface VoiceRouteCompletedEvent extends VoiceAguiBaseEvent {
  type: "VOICE_ROUTE_COMPLETED";
  status: "tool-calling";
  command: VoiceCommand;
}

export interface UserMessageStartEvent extends VoiceAguiBaseEvent {
  type: "USER_MESSAGE_START";
  status: "routing" | "tool-calling";
  messageId: string;
  role: "user";
}

export interface UserMessageContentEvent extends VoiceAguiBaseEvent {
  type: "USER_MESSAGE_CONTENT";
  status: "routing" | "tool-calling";
  messageId: string;
  role: "user";
  content: string;
}

export interface UserMessageEndEvent extends VoiceAguiBaseEvent {
  type: "USER_MESSAGE_END";
  status: "routing" | "tool-calling";
  messageId: string;
  role: "user";
}

export interface AssistantMessageStartEvent extends VoiceAguiBaseEvent {
  type: "ASSISTANT_MESSAGE_START";
  status: "responding";
  messageId: string;
  role: "assistant";
}

export interface AssistantMessageContentEvent extends VoiceAguiBaseEvent {
  type: "ASSISTANT_MESSAGE_CONTENT";
  status: "responding";
  messageId: string;
  role: "assistant";
  delta: string;
  content: string;
}

export interface AssistantMessageEndEvent extends VoiceAguiBaseEvent {
  type: "ASSISTANT_MESSAGE_END";
  status: "responding" | "speaking" | "completed";
  messageId: string;
  role: "assistant";
  content: string;
}

export interface ToolCallStartEvent extends VoiceAguiBaseEvent {
  type: "TOOL_CALL_START";
  status: "tool-calling";
  toolCallId: string;
  toolName: string;
  displayName: string;
  requiresConfirmation: boolean;
}

export interface ToolCallArgsEvent extends VoiceAguiBaseEvent {
  type: "TOOL_CALL_ARGS";
  status: "tool-calling";
  toolCallId: string;
  toolName: string;
  argsText: string;
  args: Record<string, unknown>;
}

export interface ToolCallEndEvent extends VoiceAguiBaseEvent {
  type: "TOOL_CALL_END";
  status: "tool-calling" | "responding";
  toolCallId: string;
  toolName: string;
  confirmed: boolean;
}

export interface ToolResultEvent extends VoiceAguiBaseEvent {
  type: "TOOL_RESULT";
  status: "responding";
  toolCallId: string;
  toolName: string;
  result: unknown;
  error?: string;
}

export interface TtsStartedEvent extends VoiceAguiBaseEvent {
  type: "TTS_STARTED";
  status: "speaking";
  ttsEngine: TtsEngine;
  voice: string;
  speakMode: "off" | "summary" | "full";
  text: string;
}

export interface TtsAudioReadyEvent extends VoiceAguiBaseEvent {
  type: "TTS_AUDIO_READY";
  status: "speaking";
  jobId: string;
  durationMs: number;
  latencyMs: number;
  sampleRate: number;
}

export interface TtsPlaybackStartedEvent extends VoiceAguiBaseEvent {
  type: "TTS_PLAYBACK_STARTED";
  status: "speaking";
  jobId: string;
  durationMs?: number;
}

export interface TtsPlaybackPausedEvent extends VoiceAguiBaseEvent {
  type: "TTS_PLAYBACK_PAUSED";
  status: "speaking";
  jobId: string;
  positionMs?: number;
}

export interface TtsPlaybackResumedEvent extends VoiceAguiBaseEvent {
  type: "TTS_PLAYBACK_RESUMED";
  status: "speaking";
  jobId: string;
  positionMs?: number;
}

export interface TtsPlaybackStoppedEvent extends VoiceAguiBaseEvent {
  type: "TTS_PLAYBACK_STOPPED";
  status: "cancelled" | "completed" | "speaking";
  jobId: string;
  reason: "user-stop" | "barge-in" | "completed" | "error";
}

export interface TtsPlaybackCompletedEvent extends VoiceAguiBaseEvent {
  type: "TTS_PLAYBACK_COMPLETED";
  status: "completed";
  jobId: string;
  durationMs?: number;
}

export interface BargeInDetectedEvent extends VoiceAguiBaseEvent {
  type: "BARGE_IN_DETECTED";
  status: "listening";
  previousJobId?: string;
  detail: string;
}

export interface ModelStatusEvent extends VoiceAguiBaseEvent {
  type: "MODEL_STATUS";
  status: VoiceAguiRunStatus;
  modelKind: "vad" | "stt" | "tts";
  label: string;
  detail?: string;
  progress?: number;
}

export interface DebugEvent extends VoiceAguiBaseEvent {
  type: "DEBUG_EVENT";
  status?: VoiceAguiRunStatus;
  label: string;
  data?: unknown;
}

export type VoiceAguiEvent =
  | VoiceRunStartedEvent
  | VoiceRunStatusEvent
  | VoiceRunCompletedEvent
  | VoiceRunCancelledEvent
  | VoiceRunErrorEvent
  | VoiceInputStartedEvent
  | VoiceSpeechStartedEvent
  | VoiceSpeechEndedEvent
  | VoiceTranscriptionStartedEvent
  | VoiceTranscriptionDeltaEvent
  | VoiceTranscriptionCompletedEvent
  | VoiceTranscriptionReviewStartedEvent
  | VoiceTranscriptionEditedEvent
  | VoiceTranscriptionAcceptedEvent
  | VoiceRouteStartedEvent
  | VoiceRouteCompletedEvent
  | UserMessageStartEvent
  | UserMessageContentEvent
  | UserMessageEndEvent
  | AssistantMessageStartEvent
  | AssistantMessageContentEvent
  | AssistantMessageEndEvent
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent
  | ToolResultEvent
  | TtsStartedEvent
  | TtsAudioReadyEvent
  | TtsPlaybackStartedEvent
  | TtsPlaybackPausedEvent
  | TtsPlaybackResumedEvent
  | TtsPlaybackStoppedEvent
  | TtsPlaybackCompletedEvent
  | BargeInDetectedEvent
  | ModelStatusEvent
  | DebugEvent;

/* ------------------------------------------------------------------ */
/*  Timeline projection                                                */
/* ------------------------------------------------------------------ */

export interface VoiceTimelineItem {
  id: string;
  eventId: string;
  label: string;
  detail?: string;
  status: "pending" | "active" | "done" | "error" | "cancelled";
  timestamp: number;
  icon:
    | "mic"
    | "audio"
    | "text"
    | "route"
    | "tool"
    | "assistant"
    | "speaker"
    | "model"
    | "debug"
    | "error";
}

export interface VoiceAguiRunSnapshot {
  runId: string;
  status: VoiceAguiRunStatus;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  transcript?: string;
  editedTranscript?: string;
  assistantText?: string;
  command?: VoiceCommand;
  toolCall?: VoiceToolCall;
  toolResult?: unknown;
  error?: string;
  ttsJobId?: string;
  timeline: VoiceTimelineItem[];
  events: VoiceAguiEvent[];
  latency: VoiceAguiLatencyInfo;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export function createVoiceRunId(prefix = "voice_run"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function createVoiceEventId(prefix = "voice_event"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function createVoiceMessageId(prefix = "voice_msg"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function now(): number {
  return Date.now();
}

function createBaseEvent(
  runId: string,
  type: VoiceAguiEventType,
  status?: VoiceAguiRunStatus,
): VoiceAguiBaseEvent {
  return {
    id: createVoiceEventId(),
    runId,
    type,
    timestamp: now(),
    status,
  };
}

export function stringifyToolArgs(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

/* ------------------------------------------------------------------ */
/*  Event factory                                                      */
/* ------------------------------------------------------------------ */

export const voiceAguiEvents = {
  runStarted(input: {
    runId: string;
    source: VoiceRunStartedEvent["source"];
    mode: VoiceRunStartedEvent["mode"];
    models: VoiceAguiModelInfo;
  }): VoiceRunStartedEvent {
    return {
      ...createBaseEvent(input.runId, "VOICE_RUN_STARTED", "started"),
      type: "VOICE_RUN_STARTED",
      status: "started",
      source: input.source,
      mode: input.mode,
      models: input.models,
    };
  },

  status(input: {
    runId: string;
    status: VoiceAguiRunStatus;
    label: string;
    detail?: string;
    progress?: number;
  }): VoiceRunStatusEvent {
    return {
      ...createBaseEvent(input.runId, "VOICE_RUN_STATUS", input.status),
      type: "VOICE_RUN_STATUS",
      status: input.status,
      label: input.label,
      detail: input.detail,
      progress: input.progress,
    };
  },

  completed(input: {
    runId: string;
    transcript?: string;
    intent?: string;
    toolName?: string;
    latency: VoiceAguiLatencyInfo;
  }): VoiceRunCompletedEvent {
    return {
      ...createBaseEvent(input.runId, "VOICE_RUN_COMPLETED", "completed"),
      type: "VOICE_RUN_COMPLETED",
      status: "completed",
      transcript: input.transcript,
      intent: input.intent,
      toolName: input.toolName,
      latency: input.latency,
    };
  },

  cancelled(input: { runId: string; reason: string }): VoiceRunCancelledEvent {
    return {
      ...createBaseEvent(input.runId, "VOICE_RUN_CANCELLED", "cancelled"),
      type: "VOICE_RUN_CANCELLED",
      status: "cancelled",
      reason: input.reason,
    };
  },

  error(input: {
    runId: string;
    error: string;
    recoverable?: boolean;
  }): VoiceRunErrorEvent {
    return {
      ...createBaseEvent(input.runId, "VOICE_RUN_ERROR", "error"),
      type: "VOICE_RUN_ERROR",
      status: "error",
      error: input.error,
      recoverable: input.recoverable ?? true,
    };
  },

  inputStarted(input: {
    runId: string;
    sampleRate?: number;
    deviceLabel?: string;
  }): VoiceInputStartedEvent {
    return {
      ...createBaseEvent(input.runId, "VOICE_INPUT_STARTED", "listening"),
      type: "VOICE_INPUT_STARTED",
      status: "listening",
      sampleRate: input.sampleRate,
      deviceLabel: input.deviceLabel,
    };
  },

  speechStarted(runId: string): VoiceSpeechStartedEvent {
    return {
      ...createBaseEvent(runId, "VOICE_SPEECH_STARTED", "listening"),
      type: "VOICE_SPEECH_STARTED",
      status: "listening",
    };
  },

  speechEnded(input: {
    runId: string;
    durationMs: number;
    peak?: number;
    rms?: number;
    sampleRate?: number;
  }): VoiceSpeechEndedEvent {
    return {
      ...createBaseEvent(input.runId, "VOICE_SPEECH_ENDED", "transcribing"),
      type: "VOICE_SPEECH_ENDED",
      status: "transcribing",
      durationMs: input.durationMs,
      peak: input.peak,
      rms: input.rms,
      sampleRate: input.sampleRate,
    };
  },

  transcriptionStarted(input: {
    runId: string;
    sttEngine: SttEngine;
    runtime: VoiceRuntime;
    language: VoiceLanguageHint;
    audioDurationMs?: number;
  }): VoiceTranscriptionStartedEvent {
    return {
      ...createBaseEvent(
        input.runId,
        "VOICE_TRANSCRIPTION_STARTED",
        "transcribing",
      ),
      type: "VOICE_TRANSCRIPTION_STARTED",
      status: "transcribing",
      sttEngine: input.sttEngine,
      runtime: input.runtime,
      language: input.language,
      audioDurationMs: input.audioDurationMs,
    };
  },

  transcriptionDelta(input: {
    runId: string;
    delta: string;
    text: string;
  }): VoiceTranscriptionDeltaEvent {
    return {
      ...createBaseEvent(
        input.runId,
        "VOICE_TRANSCRIPTION_DELTA",
        "transcribing",
      ),
      type: "VOICE_TRANSCRIPTION_DELTA",
      status: "transcribing",
      delta: input.delta,
      text: input.text,
    };
  },

  transcriptionCompleted(input: {
    runId: string;
    transcript: string;
    language?: string;
    latencyMs?: number;
    audioDurationMs?: number;
    review: boolean;
  }): VoiceTranscriptionCompletedEvent {
    return {
      ...createBaseEvent(
        input.runId,
        "VOICE_TRANSCRIPTION_COMPLETED",
        input.review ? "reviewing" : "routing",
      ),
      type: "VOICE_TRANSCRIPTION_COMPLETED",
      status: input.review ? "reviewing" : "routing",
      transcript: input.transcript,
      language: input.language,
      latencyMs: input.latencyMs,
      audioDurationMs: input.audioDurationMs,
    };
  },

  reviewStarted(input: {
    runId: string;
    transcript: string;
  }): VoiceTranscriptionReviewStartedEvent {
    return {
      ...createBaseEvent(
        input.runId,
        "VOICE_TRANSCRIPTION_REVIEW_STARTED",
        "reviewing",
      ),
      type: "VOICE_TRANSCRIPTION_REVIEW_STARTED",
      status: "reviewing",
      transcript: input.transcript,
    };
  },

  transcriptEdited(input: {
    runId: string;
    originalTranscript: string;
    editedTranscript: string;
  }): VoiceTranscriptionEditedEvent {
    return {
      ...createBaseEvent(
        input.runId,
        "VOICE_TRANSCRIPTION_EDITED",
        "reviewing",
      ),
      type: "VOICE_TRANSCRIPTION_EDITED",
      status: "reviewing",
      originalTranscript: input.originalTranscript,
      editedTranscript: input.editedTranscript,
    };
  },

  transcriptAccepted(input: {
    runId: string;
    transcript: string;
  }): VoiceTranscriptionAcceptedEvent {
    return {
      ...createBaseEvent(
        input.runId,
        "VOICE_TRANSCRIPTION_ACCEPTED",
        "routing",
      ),
      type: "VOICE_TRANSCRIPTION_ACCEPTED",
      status: "routing",
      transcript: input.transcript,
    };
  },

  routeStarted(input: {
    runId: string;
    transcript: string;
  }): VoiceRouteStartedEvent {
    return {
      ...createBaseEvent(input.runId, "VOICE_ROUTE_STARTED", "routing"),
      type: "VOICE_ROUTE_STARTED",
      status: "routing",
      transcript: input.transcript,
    };
  },

  routeCompleted(input: {
    runId: string;
    command: VoiceCommand;
  }): VoiceRouteCompletedEvent {
    return {
      ...createBaseEvent(input.runId, "VOICE_ROUTE_COMPLETED", "tool-calling"),
      type: "VOICE_ROUTE_COMPLETED",
      status: "tool-calling",
      command: input.command,
    };
  },

  userMessageStart(input: {
    runId: string;
    messageId: string;
  }): UserMessageStartEvent {
    return {
      ...createBaseEvent(input.runId, "USER_MESSAGE_START", "routing"),
      type: "USER_MESSAGE_START",
      status: "routing",
      messageId: input.messageId,
      role: "user",
    };
  },

  userMessageContent(input: {
    runId: string;
    messageId: string;
    content: string;
  }): UserMessageContentEvent {
    return {
      ...createBaseEvent(input.runId, "USER_MESSAGE_CONTENT", "routing"),
      type: "USER_MESSAGE_CONTENT",
      status: "routing",
      messageId: input.messageId,
      role: "user",
      content: input.content,
    };
  },

  userMessageEnd(input: {
    runId: string;
    messageId: string;
  }): UserMessageEndEvent {
    return {
      ...createBaseEvent(input.runId, "USER_MESSAGE_END", "routing"),
      type: "USER_MESSAGE_END",
      status: "routing",
      messageId: input.messageId,
      role: "user",
    };
  },

  assistantMessageStart(input: {
    runId: string;
    messageId: string;
  }): AssistantMessageStartEvent {
    return {
      ...createBaseEvent(input.runId, "ASSISTANT_MESSAGE_START", "responding"),
      type: "ASSISTANT_MESSAGE_START",
      status: "responding",
      messageId: input.messageId,
      role: "assistant",
    };
  },

  assistantMessageContent(input: {
    runId: string;
    messageId: string;
    delta: string;
    content: string;
  }): AssistantMessageContentEvent {
    return {
      ...createBaseEvent(
        input.runId,
        "ASSISTANT_MESSAGE_CONTENT",
        "responding",
      ),
      type: "ASSISTANT_MESSAGE_CONTENT",
      status: "responding",
      messageId: input.messageId,
      role: "assistant",
      delta: input.delta,
      content: input.content,
    };
  },

  assistantMessageEnd(input: {
    runId: string;
    messageId: string;
    content: string;
    status?: "responding" | "speaking" | "completed";
  }): AssistantMessageEndEvent {
    return {
      ...createBaseEvent(
        input.runId,
        "ASSISTANT_MESSAGE_END",
        input.status ?? "responding",
      ),
      type: "ASSISTANT_MESSAGE_END",
      status: input.status ?? "responding",
      messageId: input.messageId,
      role: "assistant",
      content: input.content,
    };
  },

  toolCallStart(input: {
    runId: string;
    toolCall: VoiceToolCall;
  }): ToolCallStartEvent {
    return {
      ...createBaseEvent(input.runId, "TOOL_CALL_START", "tool-calling"),
      type: "TOOL_CALL_START",
      status: "tool-calling",
      toolCallId: input.toolCall.id,
      toolName: input.toolCall.toolName,
      displayName: input.toolCall.displayName,
      requiresConfirmation: input.toolCall.requiresConfirmation,
    };
  },

  toolCallArgs(input: {
    runId: string;
    toolCall: VoiceToolCall;
  }): ToolCallArgsEvent {
    return {
      ...createBaseEvent(input.runId, "TOOL_CALL_ARGS", "tool-calling"),
      type: "TOOL_CALL_ARGS",
      status: "tool-calling",
      toolCallId: input.toolCall.id,
      toolName: input.toolCall.toolName,
      argsText: stringifyToolArgs(input.toolCall.args),
      args: input.toolCall.args,
    };
  },

  toolCallEnd(input: {
    runId: string;
    toolCall: VoiceToolCall;
    confirmed: boolean;
  }): ToolCallEndEvent {
    return {
      ...createBaseEvent(input.runId, "TOOL_CALL_END", "tool-calling"),
      type: "TOOL_CALL_END",
      status: "tool-calling",
      toolCallId: input.toolCall.id,
      toolName: input.toolCall.toolName,
      confirmed: input.confirmed,
    };
  },

  toolResult(input: {
    runId: string;
    toolCall: VoiceToolCall;
    result: unknown;
    error?: string;
  }): ToolResultEvent {
    return {
      ...createBaseEvent(input.runId, "TOOL_RESULT", "responding"),
      type: "TOOL_RESULT",
      status: "responding",
      toolCallId: input.toolCall.id,
      toolName: input.toolCall.toolName,
      result: input.result,
      error: input.error,
    };
  },

  ttsStarted(input: {
    runId: string;
    ttsEngine: TtsEngine;
    voice: string;
    speakMode: "off" | "summary" | "full";
    text: string;
  }): TtsStartedEvent {
    return {
      ...createBaseEvent(input.runId, "TTS_STARTED", "speaking"),
      type: "TTS_STARTED",
      status: "speaking",
      ttsEngine: input.ttsEngine,
      voice: input.voice,
      speakMode: input.speakMode,
      text: input.text,
    };
  },

  ttsAudioReady(input: {
    runId: string;
    jobId: string;
    durationMs: number;
    latencyMs: number;
    sampleRate: number;
  }): TtsAudioReadyEvent {
    return {
      ...createBaseEvent(input.runId, "TTS_AUDIO_READY", "speaking"),
      type: "TTS_AUDIO_READY",
      status: "speaking",
      jobId: input.jobId,
      durationMs: input.durationMs,
      latencyMs: input.latencyMs,
      sampleRate: input.sampleRate,
    };
  },

  playbackStarted(input: {
    runId: string;
    jobId: string;
    durationMs?: number;
  }): TtsPlaybackStartedEvent {
    return {
      ...createBaseEvent(input.runId, "TTS_PLAYBACK_STARTED", "speaking"),
      type: "TTS_PLAYBACK_STARTED",
      status: "speaking",
      jobId: input.jobId,
      durationMs: input.durationMs,
    };
  },

  playbackPaused(input: {
    runId: string;
    jobId: string;
    positionMs?: number;
  }): TtsPlaybackPausedEvent {
    return {
      ...createBaseEvent(input.runId, "TTS_PLAYBACK_PAUSED", "speaking"),
      type: "TTS_PLAYBACK_PAUSED",
      status: "speaking",
      jobId: input.jobId,
      positionMs: input.positionMs,
    };
  },

  playbackResumed(input: {
    runId: string;
    jobId: string;
    positionMs?: number;
  }): TtsPlaybackResumedEvent {
    return {
      ...createBaseEvent(input.runId, "TTS_PLAYBACK_RESUMED", "speaking"),
      type: "TTS_PLAYBACK_RESUMED",
      status: "speaking",
      jobId: input.jobId,
      positionMs: input.positionMs,
    };
  },

  playbackStopped(input: {
    runId: string;
    jobId: string;
    reason: TtsPlaybackStoppedEvent["reason"];
  }): TtsPlaybackStoppedEvent {
    return {
      ...createBaseEvent(
        input.runId,
        "TTS_PLAYBACK_STOPPED",
        input.reason === "completed" ? "completed" : "cancelled",
      ),
      type: "TTS_PLAYBACK_STOPPED",
      status: input.reason === "completed" ? "completed" : "cancelled",
      jobId: input.jobId,
      reason: input.reason,
    };
  },

  playbackCompleted(input: {
    runId: string;
    jobId: string;
    durationMs?: number;
  }): TtsPlaybackCompletedEvent {
    return {
      ...createBaseEvent(input.runId, "TTS_PLAYBACK_COMPLETED", "completed"),
      type: "TTS_PLAYBACK_COMPLETED",
      status: "completed",
      jobId: input.jobId,
      durationMs: input.durationMs,
    };
  },

  bargeIn(input: {
    runId: string;
    previousJobId?: string;
    detail?: string;
  }): BargeInDetectedEvent {
    return {
      ...createBaseEvent(input.runId, "BARGE_IN_DETECTED", "listening"),
      type: "BARGE_IN_DETECTED",
      status: "listening",
      previousJobId: input.previousJobId,
      detail:
        input.detail ?? "User started speaking while voice output was playing.",
    };
  },

  modelStatus(input: {
    runId: string;
    status: VoiceAguiRunStatus;
    modelKind: "vad" | "stt" | "tts";
    label: string;
    detail?: string;
    progress?: number;
  }): ModelStatusEvent {
    return {
      ...createBaseEvent(input.runId, "MODEL_STATUS", input.status),
      type: "MODEL_STATUS",
      status: input.status,
      modelKind: input.modelKind,
      label: input.label,
      detail: input.detail,
      progress: input.progress,
    };
  },

  debug(input: {
    runId: string;
    label: string;
    data?: unknown;
    status?: VoiceAguiRunStatus;
  }): DebugEvent {
    return {
      ...createBaseEvent(input.runId, "DEBUG_EVENT", input.status),
      type: "DEBUG_EVENT",
      status: input.status,
      label: input.label,
      data: input.data,
    };
  },
};

/* ------------------------------------------------------------------ */
/*  Derived event groups                                               */
/* ------------------------------------------------------------------ */

export function createUserMessageEvents(input: {
  runId: string;
  content: string;
  messageId?: string;
}): VoiceAguiEvent[] {
  const messageId = input.messageId ?? createVoiceMessageId("user_msg");

  return [
    voiceAguiEvents.userMessageStart({
      runId: input.runId,
      messageId,
    }),
    voiceAguiEvents.userMessageContent({
      runId: input.runId,
      messageId,
      content: input.content,
    }),
    voiceAguiEvents.userMessageEnd({
      runId: input.runId,
      messageId,
    }),
  ];
}

export function createToolCallEvents(input: {
  runId: string;
  toolCall: VoiceToolCall;
  confirmed?: boolean;
}): VoiceAguiEvent[] {
  return [
    voiceAguiEvents.toolCallStart({
      runId: input.runId,
      toolCall: input.toolCall,
    }),
    voiceAguiEvents.toolCallArgs({
      runId: input.runId,
      toolCall: input.toolCall,
    }),
    voiceAguiEvents.toolCallEnd({
      runId: input.runId,
      toolCall: input.toolCall,
      confirmed: input.confirmed ?? !input.toolCall.requiresConfirmation,
    }),
  ];
}

export function createRouteCompletedEventGroup(input: {
  runId: string;
  command: VoiceCommand;
  includeUserMessage?: boolean;
}): VoiceAguiEvent[] {
  const events: VoiceAguiEvent[] = [
    voiceAguiEvents.routeCompleted({
      runId: input.runId,
      command: input.command,
    }),
  ];

  if (input.includeUserMessage ?? true) {
    events.push(
      ...createUserMessageEvents({
        runId: input.runId,
        content: input.command.normalized,
      }),
    );
  }

  events.push(
    ...createToolCallEvents({
      runId: input.runId,
      toolCall: input.command.toolCall,
    }),
  );

  return events;
}

/* ------------------------------------------------------------------ */
/*  Reducer                                                            */
/* ------------------------------------------------------------------ */

export function createInitialVoiceRunSnapshot(
  runId = createVoiceRunId(),
): VoiceAguiRunSnapshot {
  const timestamp = now();

  return {
    runId,
    status: "idle",
    startedAt: timestamp,
    updatedAt: timestamp,
    timeline: [],
    events: [],
    latency: {
      startedAt: timestamp,
    },
  };
}

export function reduceVoiceAguiEvent(
  snapshot: VoiceAguiRunSnapshot,
  event: VoiceAguiEvent,
): VoiceAguiRunSnapshot {
  const next: VoiceAguiRunSnapshot = {
    ...snapshot,
    status: event.status ?? snapshot.status,
    updatedAt: event.timestamp,
    events: [...snapshot.events, event],
    timeline: appendTimelineItem(snapshot.timeline, event),
    latency: updateLatency(snapshot.latency, event),
  };

  switch (event.type) {
    case "VOICE_RUN_COMPLETED": {
      next.status = "completed";
      next.completedAt = event.timestamp;
      next.transcript = event.transcript ?? next.transcript;
      return next;
    }

    case "VOICE_RUN_CANCELLED": {
      next.status = "cancelled";
      next.completedAt = event.timestamp;
      return next;
    }

    case "VOICE_RUN_ERROR": {
      next.status = "error";
      next.error = event.error;
      next.completedAt = event.timestamp;
      return next;
    }

    case "VOICE_TRANSCRIPTION_COMPLETED": {
      next.transcript = event.transcript;
      return next;
    }

    case "VOICE_TRANSCRIPTION_EDITED": {
      next.transcript = event.originalTranscript;
      next.editedTranscript = event.editedTranscript;
      return next;
    }

    case "VOICE_TRANSCRIPTION_ACCEPTED": {
      next.editedTranscript = event.transcript;
      return next;
    }

    case "VOICE_ROUTE_COMPLETED": {
      next.command = event.command;
      next.toolCall = event.command.toolCall;
      return next;
    }

    case "ASSISTANT_MESSAGE_CONTENT": {
      next.assistantText = event.content;
      return next;
    }

    case "ASSISTANT_MESSAGE_END": {
      next.assistantText = event.content;
      return next;
    }

    case "TOOL_RESULT": {
      next.toolResult = event.result;
      if (event.error) next.error = event.error;
      return next;
    }

    case "TTS_AUDIO_READY":
    case "TTS_PLAYBACK_STARTED":
    case "TTS_PLAYBACK_PAUSED":
    case "TTS_PLAYBACK_RESUMED":
    case "TTS_PLAYBACK_STOPPED":
    case "TTS_PLAYBACK_COMPLETED": {
      next.ttsJobId = event.jobId;
      return next;
    }

    default:
      return next;
  }
}

export function reduceVoiceAguiEvents(
  snapshot: VoiceAguiRunSnapshot,
  events: VoiceAguiEvent[],
): VoiceAguiRunSnapshot {
  return events.reduce(reduceVoiceAguiEvent, snapshot);
}

/* ------------------------------------------------------------------ */
/*  Timeline helpers                                                   */
/* ------------------------------------------------------------------ */

function appendTimelineItem(
  timeline: VoiceTimelineItem[],
  event: VoiceAguiEvent,
): VoiceTimelineItem[] {
  const item = timelineItemFromEvent(event);

  if (!item) return timeline;

  return [...timeline, item];
}

function timelineItemFromEvent(
  event: VoiceAguiEvent,
): VoiceTimelineItem | null {
  switch (event.type) {
    case "VOICE_RUN_STARTED":
      return {
        id: `timeline_${event.id}`,
        eventId: event.id,
        label: "Voice run started",
        detail: `${event.mode} · ${event.models.language ?? "auto"}`,
        status: "done",
        timestamp: event.timestamp,
        icon: "mic",
      };

    case "VOICE_INPUT_STARTED":
      return {
        id: `timeline_${event.id}`,
        eventId: event.id,
        label: "Microphone listening",
        detail: event.deviceLabel,
        status: "active",
        timestamp: event.timestamp,
        icon: "mic",
      };

    case "VOICE_SPEECH_STARTED":
      return {
        id: `timeline_${event.id}`,
        eventId: event.id,
        label: "Speech detected",
        status: "active",
        timestamp: event.timestamp,
        icon: "audio",
      };

    case "VOICE_SPEECH_ENDED":
      return {
        id: `timeline_${event.id}`,
        eventId: event.id,
        label: "Speech captured",
        detail: `${(event.durationMs / 1000).toFixed(1)}s`,
        status: "done",
        timestamp: event.timestamp,
        icon: "audio",
      };

    case "VOICE_TRANSCRIPTION_STARTED":
      return {
        id: `timeline_${event.id}`,
        eventId: event.id,
        label: "Transcribing locally",
        detail: `${event.sttEngine} · ${event.runtime}`,
        status: "active",
        timestamp: event.timestamp,
        icon: "text",
      };

    case "VOICE_TRANSCRIPTION_COMPLETED":
      return {
        id: `timeline_${event.id}`,
        eventId: event.id,
        label: "Transcript ready",
        detail: event.transcript,
        status: "done",
        timestamp: event.timestamp,
        icon: "text",
      };

    case "VOICE_TRANSCRIPTION_REVIEW_STARTED":
      return {
        id: `timeline_${event.id}`,
        eventId: event.id,
        label: "Review transcript",
        detail: event.transcript,
        status: "active",
        timestamp: event.timestamp,
        icon: "text",
      };

    case "VOICE_TRANSCRIPTION_ACCEPTED":
      return {
        id: `timeline_${event.id}`,
        eventId: event.id,
        label: "Transcript accepted",
        detail: event.transcript,
        status: "done",
        timestamp: event.timestamp,
        icon: "text",
      };

    case "VOICE_ROUTE_STARTED":
      return {
        id: `timeline_${event.id}`,
        eventId: event.id,
        label: "Routing command",
        detail: event.transcript,
        status: "active",
        timestamp: event.timestamp,
        icon: "route",
      };

    case "VOICE_ROUTE_COMPLETED":
      return {
        id: `timeline_${event.id}`,
        eventId: event.id,
        label: "Command routed",
        detail: `${event.command.intent} · ${event.command.toolCall.toolName}`,
        status: "done",
        timestamp: event.timestamp,
        icon: "route",
      };

    case "TOOL_CALL_START":
      return {
        id: `timeline_${event.id}`,
        eventId: event.id,
        label: "Tool selected",
        detail: event.toolName,
        status: event.requiresConfirmation ? "active" : "done",
        timestamp: event.timestamp,
        icon: "tool",
      };

    case "TOOL_CALL_END":
      return {
        id: `timeline_${event.id}`,
        eventId: event.id,
        label: event.confirmed ? "Tool confirmed" : "Tool prepared",
        detail: event.toolName,
        status: "done",
        timestamp: event.timestamp,
        icon: "tool",
      };

    case "TOOL_RESULT":
      return {
        id: `timeline_${event.id}`,
        eventId: event.id,
        label: event.error ? "Tool failed" : "Tool result ready",
        detail: event.toolName,
        status: event.error ? "error" : "done",
        timestamp: event.timestamp,
        icon: "tool",
      };

    case "ASSISTANT_MESSAGE_START":
      return {
        id: `timeline_${event.id}`,
        eventId: event.id,
        label: "Assistant responding",
        status: "active",
        timestamp: event.timestamp,
        icon: "assistant",
      };

    case "ASSISTANT_MESSAGE_END":
      return {
        id: `timeline_${event.id}`,
        eventId: event.id,
        label: "Assistant response ready",
        detail: event.content,
        status: "done",
        timestamp: event.timestamp,
        icon: "assistant",
      };

    case "TTS_STARTED":
      return {
        id: `timeline_${event.id}`,
        eventId: event.id,
        label: "Voice output started",
        detail: `${event.ttsEngine} · ${event.voice}`,
        status: "active",
        timestamp: event.timestamp,
        icon: "speaker",
      };

    case "TTS_AUDIO_READY":
      return {
        id: `timeline_${event.id}`,
        eventId: event.id,
        label: "Speech audio ready",
        detail: `${(event.durationMs / 1000).toFixed(1)}s`,
        status: "done",
        timestamp: event.timestamp,
        icon: "speaker",
      };

    case "TTS_PLAYBACK_STARTED":
      return {
        id: `timeline_${event.id}`,
        eventId: event.id,
        label: "Speaking",
        status: "active",
        timestamp: event.timestamp,
        icon: "speaker",
      };

    case "TTS_PLAYBACK_COMPLETED":
      return {
        id: `timeline_${event.id}`,
        eventId: event.id,
        label: "Voice playback completed",
        status: "done",
        timestamp: event.timestamp,
        icon: "speaker",
      };

    case "BARGE_IN_DETECTED":
      return {
        id: `timeline_${event.id}`,
        eventId: event.id,
        label: "Barge-in detected",
        detail: event.detail,
        status: "active",
        timestamp: event.timestamp,
        icon: "mic",
      };

    case "MODEL_STATUS":
      return {
        id: `timeline_${event.id}`,
        eventId: event.id,
        label: event.label,
        detail: event.detail,
        status:
          event.status === "error"
            ? "error"
            : event.status === "completed"
              ? "done"
              : "active",
        timestamp: event.timestamp,
        icon: "model",
      };

    case "VOICE_RUN_COMPLETED":
      return {
        id: `timeline_${event.id}`,
        eventId: event.id,
        label: "Voice run completed",
        detail: event.toolName,
        status: "done",
        timestamp: event.timestamp,
        icon: "assistant",
      };

    case "VOICE_RUN_CANCELLED":
      return {
        id: `timeline_${event.id}`,
        eventId: event.id,
        label: "Voice run cancelled",
        detail: event.reason,
        status: "cancelled",
        timestamp: event.timestamp,
        icon: "error",
      };

    case "VOICE_RUN_ERROR":
      return {
        id: `timeline_${event.id}`,
        eventId: event.id,
        label: "Voice error",
        detail: event.error,
        status: "error",
        timestamp: event.timestamp,
        icon: "error",
      };

    case "DEBUG_EVENT":
      return {
        id: `timeline_${event.id}`,
        eventId: event.id,
        label: event.label,
        status: "done",
        timestamp: event.timestamp,
        icon: "debug",
      };

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Latency helpers                                                    */
/* ------------------------------------------------------------------ */

function updateLatency(
  latency: VoiceAguiLatencyInfo,
  event: VoiceAguiEvent,
): VoiceAguiLatencyInfo {
  switch (event.type) {
    case "VOICE_RUN_STARTED":
      return {
        ...latency,
        startedAt: event.timestamp,
      };

    case "VOICE_SPEECH_STARTED":
      return {
        ...latency,
        speechStartedAt: event.timestamp,
      };

    case "VOICE_SPEECH_ENDED":
      return {
        ...latency,
        speechEndedAt: event.timestamp,
      };

    case "VOICE_TRANSCRIPTION_STARTED":
      return {
        ...latency,
        transcriptionStartedAt: event.timestamp,
      };

    case "VOICE_TRANSCRIPTION_COMPLETED":
      return {
        ...latency,
        transcriptionEndedAt: event.timestamp,
      };

    case "VOICE_ROUTE_STARTED":
      return {
        ...latency,
        routingStartedAt: event.timestamp,
      };

    case "VOICE_ROUTE_COMPLETED":
      return {
        ...latency,
        routingEndedAt: event.timestamp,
      };

    case "TOOL_CALL_START":
      return {
        ...latency,
        toolStartedAt: event.timestamp,
      };

    case "TOOL_CALL_END":
    case "TOOL_RESULT":
      return {
        ...latency,
        toolEndedAt: event.timestamp,
      };

    case "ASSISTANT_MESSAGE_START":
      return {
        ...latency,
        assistantStartedAt: event.timestamp,
      };

    case "ASSISTANT_MESSAGE_END":
      return {
        ...latency,
        assistantEndedAt: event.timestamp,
      };

    case "TTS_STARTED":
      return {
        ...latency,
        ttsStartedAt: event.timestamp,
      };

    case "TTS_AUDIO_READY":
      return {
        ...latency,
        ttsAudioReadyAt: event.timestamp,
      };

    case "TTS_PLAYBACK_STARTED":
      return {
        ...latency,
        playbackStartedAt: event.timestamp,
      };

    case "TTS_PLAYBACK_COMPLETED":
    case "TTS_PLAYBACK_STOPPED":
      return {
        ...latency,
        playbackEndedAt: event.timestamp,
      };

    default:
      return latency;
  }
}

export function calculateLatencyDurations(latency: VoiceAguiLatencyInfo): {
  speechMs?: number;
  transcriptionMs?: number;
  routingMs?: number;
  toolMs?: number;
  assistantMs?: number;
  ttsMs?: number;
  playbackMs?: number;
  totalMs?: number;
} {
  return {
    speechMs:
      latency.speechStartedAt && latency.speechEndedAt
        ? latency.speechEndedAt - latency.speechStartedAt
        : undefined,
    transcriptionMs:
      latency.transcriptionStartedAt && latency.transcriptionEndedAt
        ? latency.transcriptionEndedAt - latency.transcriptionStartedAt
        : undefined,
    routingMs:
      latency.routingStartedAt && latency.routingEndedAt
        ? latency.routingEndedAt - latency.routingStartedAt
        : undefined,
    toolMs:
      latency.toolStartedAt && latency.toolEndedAt
        ? latency.toolEndedAt - latency.toolStartedAt
        : undefined,
    assistantMs:
      latency.assistantStartedAt && latency.assistantEndedAt
        ? latency.assistantEndedAt - latency.assistantStartedAt
        : undefined,
    ttsMs:
      latency.ttsStartedAt && latency.ttsAudioReadyAt
        ? latency.ttsAudioReadyAt - latency.ttsStartedAt
        : undefined,
    playbackMs:
      latency.playbackStartedAt && latency.playbackEndedAt
        ? latency.playbackEndedAt - latency.playbackStartedAt
        : undefined,
    totalMs:
      latency.startedAt && latency.playbackEndedAt
        ? latency.playbackEndedAt - latency.startedAt
        : latency.startedAt && latency.assistantEndedAt
          ? latency.assistantEndedAt - latency.startedAt
          : undefined,
  };
}
