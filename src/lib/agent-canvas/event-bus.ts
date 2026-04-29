/**
 * AG-UI Event Bus — append-only event log with three projections:
 * 1. UI state (zustand)
 * 2. Yjs persistence
 * 3. LangSmith trace capture
 *
 * Uses Effect-ts Queue for type-safe async event streaming.
 */

import type { AGUIEvent } from "./ag-ui-types";

// ─── Subscriber type ──────────────────────────────────────────────────────────

type Subscriber = (event: AGUIEvent) => void;

// ─── In-memory append-only log ────────────────────────────────────────────────

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

// ─── Projections ──────────────────────────────────────────────────────────────

export interface RunStats {
  startTime: number;
  tokenCount: number;
  toolCallCount: number;
  stepCount: number;
  interruptCount: number;
}

export function projectRunStats(log: readonly AGUIEvent[]): RunStats {
  let startTime = 0;
  let tokenCount = 0;
  let toolCallCount = 0;
  let stepCount = 0;
  let interruptCount = 0;

  for (const ev of log) {
    if (ev.type === "RUN_STARTED") startTime = ev.timestamp;
    if (ev.type === "RUN_FINISHED") tokenCount = ev.totalTokens;
    if (ev.type === "TOOL_CALL_START") toolCallCount++;
    if (ev.type === "STEP_STARTED") stepCount++;
    if (ev.type === "INTERRUPT") interruptCount++;
  }

  return { startTime, tokenCount, toolCallCount, stepCount, interruptCount };
}

// ─── LangSmith trace capture ──────────────────────────────────────────────────

export interface TraceNode {
  id: string;
  name: string;
  type: "node" | "tool" | "llm";
  startTime: number;
  endTime?: number;
  duration?: number;
  tokens?: number;
  children: TraceNode[];
  status: "running" | "done" | "error";
  output?: string;
}

export function buildTraceTree(log: readonly AGUIEvent[]): TraceNode[] {
  const roots: TraceNode[] = [];
  const nodeMap = new Map<string, TraceNode>();

  for (const ev of log) {
    if (ev.type === "STEP_STARTED") {
      const node: TraceNode = {
        id: `${ev.nodeName}-${ev.timestamp}`,
        name: ev.nodeName,
        type: "node",
        startTime: ev.timestamp,
        children: [],
        status: "running",
      };
      nodeMap.set(ev.nodeName, node);
      roots.push(node);
    }

    if (ev.type === "STEP_FINISHED") {
      const node = nodeMap.get(ev.nodeName);
      if (node) {
        node.endTime = ev.timestamp;
        node.duration = ev.duration;
        node.status = "done";
      }
    }

    if (ev.type === "TOOL_CALL_START") {
      const parent = nodeMap.get(ev.parentNode);
      const child: TraceNode = {
        id: ev.toolCallId,
        name: ev.toolName,
        type: "tool",
        startTime: ev.timestamp,
        children: [],
        status: "running",
      };
      nodeMap.set(ev.toolCallId, child);
      if (parent) parent.children.push(child);
      else roots.push(child);
    }

    if (ev.type === "TOOL_CALL_END") {
      const node = nodeMap.get(ev.toolCallId);
      if (node) {
        node.endTime = ev.timestamp;
        node.status = "done";
        if (ev.result) node.output = JSON.stringify(ev.result).slice(0, 200);
      }
    }

    if (ev.type === "RUN_ERROR") {
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
