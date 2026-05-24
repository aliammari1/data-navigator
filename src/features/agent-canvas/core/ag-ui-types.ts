/**
 * AG-UI Protocol Types — 16 standard event types over SSE.
 * Implemented inline (mirrors @ag-ui/core spec 2025).
 */

// ─── Core event types ─────────────────────────────────────────────────────────

export type AGUIEventType =
  | "TEXT_MESSAGE_START"
  | "TEXT_MESSAGE_CONTENT"
  | "TEXT_MESSAGE_END"
  | "TOOL_CALL_START"
  | "TOOL_CALL_ARGS_DELTA"
  | "TOOL_CALL_END"
  | "STATE_SNAPSHOT"
  | "STATE_DELTA"
  | "MESSAGES_SNAPSHOT"
  | "STEP_STARTED"
  | "STEP_FINISHED"
  | "RUN_STARTED"
  | "RUN_FINISHED"
  | "RUN_ERROR"
  | "INTERRUPT"
  | "CUSTOM";

export interface AGUIBaseEvent {
  type: AGUIEventType;
  messageId: string;
  timestamp: number;
  threadId: string;
  runId: string;
}

export interface TextMessageStartEvent extends AGUIBaseEvent {
  type: "TEXT_MESSAGE_START";
  role: "assistant" | "tool";
  agent?: string;
}

export interface TextMessageContentEvent extends AGUIBaseEvent {
  type: "TEXT_MESSAGE_CONTENT";
  delta: string;
}

export interface TextMessageEndEvent extends AGUIBaseEvent {
  type: "TEXT_MESSAGE_END";
}

export interface ToolCallStartEvent extends AGUIBaseEvent {
  type: "TOOL_CALL_START";
  toolCallId: string;
  toolName: string;
  parentNode: string;
}

export interface ToolCallArgsDeltaEvent extends AGUIBaseEvent {
  type: "TOOL_CALL_ARGS_DELTA";
  toolCallId: string;
  delta: string;
}

export interface ToolCallEndEvent extends AGUIBaseEvent {
  type: "TOOL_CALL_END";
  toolCallId: string;
  result?: unknown;
}

export interface StateSnapshotEvent extends AGUIBaseEvent {
  type: "STATE_SNAPSHOT";
  snapshot: Record<string, unknown>;
}

export interface StateDeltaEvent extends AGUIBaseEvent {
  type: "STATE_DELTA";
  /** JSON Patch RFC 6902 operations */
  delta: Array<{
    op: "add" | "replace" | "remove";
    path: string;
    value?: unknown;
  }>;
}

export interface StepStartedEvent extends AGUIBaseEvent {
  type: "STEP_STARTED";
  nodeName: string;
  phase: string;
}

export interface StepFinishedEvent extends AGUIBaseEvent {
  type: "STEP_FINISHED";
  nodeName: string;
  duration: number;
}

export interface RunStartedEvent extends AGUIBaseEvent {
  type: "RUN_STARTED";
  model: string;
  input: unknown;
}

export interface RunFinishedEvent extends AGUIBaseEvent {
  type: "RUN_FINISHED";
  totalTokens: number;
  totalDuration: number;
}

export interface RunErrorEvent extends AGUIBaseEvent {
  type: "RUN_ERROR";
  message: string;
  code?: string;
}

export interface InterruptEvent extends AGUIBaseEvent {
  type: "INTERRUPT";
  reason: string;
  payload: unknown;
}

export interface CustomEvent extends AGUIBaseEvent {
  type: "CUSTOM";
  name: string;
  value: unknown;
}

export type AGUIEvent =
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ToolCallStartEvent
  | ToolCallArgsDeltaEvent
  | ToolCallEndEvent
  | StateSnapshotEvent
  | StateDeltaEvent
  | StepStartedEvent
  | StepFinishedEvent
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | InterruptEvent
  | CustomEvent;

// ─── Thread context ───────────────────────────────────────────────────────────

export interface AGUIThreadContext {
  threadId: string;
  runId: string;
  model: string;
}

export function makeCtx(model: string): AGUIThreadContext {
  return {
    threadId: `thread-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    runId: `run-${Date.now()}`,
    model,
  };
}

let _seq = 0;
export function makeEvent<
  T extends Omit<AGUIEvent, "messageId" | "timestamp" | "threadId" | "runId">,
>(
  ctx: AGUIThreadContext,
  event: T,
): T & {
  messageId: string;
  timestamp: number;
  threadId: string;
  runId: string;
} {
  return {
    ...event,
    messageId: `msg-${++_seq}`,
    timestamp: Date.now(),
    threadId: ctx.threadId,
    runId: ctx.runId,
  };
}
