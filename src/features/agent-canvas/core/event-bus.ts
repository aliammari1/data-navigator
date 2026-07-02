/**
 * AG-UI Event Bus — append-only event log with two projections:
 * 1. Run stats (for the stats panel)
 * 2. Trace tree (for the agent graph / LangSmith-style trace view)
 *
 * AGUIEvent is @ag-ui/core's own full event union (z.infer of EventSchemas),
 * imported directly — nothing here is hand-declared.
 */

import { EventType, type AGUIEvent } from "@ag-ui/core";

export { EventType };
export type { AGUIEvent };

// ─── Subscriber type ──────────────────────────────────────────────────────

type Subscriber = (event: AGUIEvent) => void;

// ─── In-memory append-only log ────────────────────────────────────────────

let _log: AGUIEvent[] = [];
const _subscribers = new Set<Subscriber>();

export function publishEvent(event: AGUIEvent): void {
  _log = [..._log, event];
  for (const sub of _subscribers) {
    try {
      sub(event);
    } catch {
      /* isolate subscriber errors */
    }
  }
}

export function subscribeEvents(fn: Subscriber): () => void {
  _subscribers.add(fn);
  return () => _subscribers.delete(fn);
}

export function getEventLog(): readonly AGUIEvent[] {
  return _log;
}

export function clearEventLog(): void {
  _log = [];
}

// ─── Projections ──────────────────────────────────────────────────────────

export interface RunStats {
  startTime: number;
  toolCallCount: number;
  stepCount: number;
  interruptCount: number;
}

export function projectRunStats(log: readonly AGUIEvent[]): RunStats {
  let startTime = 0;
  let toolCallCount = 0;
  let stepCount = 0;
  let interruptCount = 0;

  for (const ev of log) {
    if (ev.type === EventType.RUN_STARTED) startTime = ev.timestamp ?? 0;
    if (ev.type === EventType.TOOL_CALL_START) toolCallCount++;
    if (ev.type === EventType.STEP_STARTED) stepCount++;
    // Protocol-native interrupt signal: RUN_FINISHED carries an outcome
    // discriminated union — { type: "success" } | { type: "interrupt",
    // interrupts: Interrupt[] }. No CUSTOM mapping needed.
    if (ev.type === EventType.RUN_FINISHED && ev.outcome?.type === "interrupt") {
      interruptCount += ev.outcome.interrupts.length;
    }
  }

  return { startTime, toolCallCount, stepCount, interruptCount };
}

// ─── Trace tree ─────────────────────────────────────────────────────────

export interface TraceNode {
  id: string;
  name: string;
  type: "node" | "tool" | "llm";
  startTime: number;
  endTime?: number;
  duration?: number;
  children: TraceNode[];
  status: "running" | "done" | "error";
  output?: string;
}

export function buildTraceTree(log: readonly AGUIEvent[]): TraceNode[] {
  const roots: TraceNode[] = [];
  const nodeMap = new Map<string, TraceNode>();

  for (const ev of log) {
    if (ev.type === EventType.STEP_STARTED) {
      const node: TraceNode = {
        id: `${ev.stepName}-${ev.timestamp}`,
        name: ev.stepName,
        type: "node",
        startTime: ev.timestamp ?? 0,
        children: [],
        status: "running",
      };
      nodeMap.set(ev.stepName, node);
      roots.push(node);
    }

    if (ev.type === EventType.STEP_FINISHED) {
      const node = nodeMap.get(ev.stepName);
      if (node) {
        node.endTime = ev.timestamp;
        node.duration = (ev.timestamp ?? 0) - node.startTime;
        node.status = "done";
      }
    }

    if (ev.type === EventType.TOOL_CALL_START) {
      const child: TraceNode = {
        id: ev.toolCallId,
        name: ev.toolCallName,
        type: "tool",
        startTime: ev.timestamp ?? 0,
        children: [],
        status: "running",
      };
      nodeMap.set(ev.toolCallId, child);
      // AG-UI links tool calls to a chat message (parentMessageId). This
      // app's tool calls are graph-step-driven, not message-driven, so
      // attach to whichever step is currently open instead.
      const openStep = [...nodeMap.values()]
        .reverse()
        .find((n) => n.type === "node" && n.status === "running");
      if (openStep) openStep.children.push(child);
      else roots.push(child);
    }

    // TOOL_CALL_RESULT (not TOOL_CALL_END) carries the output per the
    // protocol — END only signals args are complete.
    if (ev.type === EventType.TOOL_CALL_RESULT) {
      const node = nodeMap.get(ev.toolCallId);
      if (node) {
        node.endTime = ev.timestamp;
        node.duration = (ev.timestamp ?? 0) - node.startTime;
        node.status = "done";
        node.output = ev.content.slice(0, 200);
      }
    }

    if (ev.type === EventType.RUN_ERROR) {
      for (const [, node] of nodeMap) {
        if (node.status === "running") {
          node.status = "error";
          node.output = ev.message;
        }
      }
    }
  }

  return roots;
}
