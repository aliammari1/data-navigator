import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildTraceTree,
  clearEventLog,
  getEventLog,
  projectRunStats,
  publishEvent,
  subscribeEvents,
} from "@/features/agent-canvas/core/event-bus";
import type { AGUIEvent } from "@/features/agent-canvas/core/ag-ui-types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal base event with required fields. */
function baseEvent(type: AGUIEvent["type"], overrides: Record<string, unknown> = {}): AGUIEvent {
  return {
    type,
    messageId: "msg-1",
    timestamp: 1000,
    threadId: "thread-1",
    runId: "run-1",
    ...overrides,
  } as AGUIEvent;
}

function makeRunStarted(timestamp = 1000): AGUIEvent {
  return baseEvent("RUN_STARTED", { timestamp, model: "gpt-4", input: null });
}

function makeRunFinished(totalTokens = 500, totalDuration = 2000): AGUIEvent {
  return baseEvent("RUN_FINISHED", { totalTokens, totalDuration });
}

function makeToolCallStart(
  toolCallId = "tc-1",
  toolName = "search",
  parentNode = "node-a",
): AGUIEvent {
  return baseEvent("TOOL_CALL_START", { toolCallId, toolName, parentNode });
}

function makeToolCallEnd(toolCallId = "tc-1", result?: unknown): AGUIEvent {
  return baseEvent("TOOL_CALL_END", { toolCallId, result });
}

function makeStepStarted(nodeName = "node-a", timestamp = 2000): AGUIEvent {
  return baseEvent("STEP_STARTED", { nodeName, timestamp, phase: "execute" });
}

function makeStepFinished(nodeName = "node-a", timestamp = 3000, duration = 1000): AGUIEvent {
  return baseEvent("STEP_FINISHED", { nodeName, timestamp, duration });
}

function makeInterrupt(): AGUIEvent {
  return baseEvent("INTERRUPT", { reason: "user-pause", payload: {} });
}

function makeRunError(message = "something broke"): AGUIEvent {
  return baseEvent("RUN_ERROR", { message, code: "ERR_500" });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset the shared module-level state between tests.
  clearEventLog();
});

// ─── publishEvent & getEventLog ───────────────────────────────────────────────

describe("publishEvent — appends to the log", () => {
  it("adds a single event to the log", () => {
    // Arrange
    const ev = makeRunStarted();

    // Act
    publishEvent(ev);

    // Assert
    const log = getEventLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toBe(ev);
  });

  it("appends multiple events preserving insertion order", () => {
    // Arrange
    const ev1 = makeRunStarted(100);
    const ev2 = makeToolCallStart();
    const ev3 = makeRunFinished();

    // Act
    publishEvent(ev1);
    publishEvent(ev2);
    publishEvent(ev3);

    // Assert
    const log = getEventLog();
    expect(log).toHaveLength(3);
    expect(log[0]).toBe(ev1);
    expect(log[1]).toBe(ev2);
    expect(log[2]).toBe(ev3);
  });

  it("each publish creates an immutable snapshot (appends; does not mutate)", () => {
    // Arrange
    const ev1 = makeRunStarted();
    publishEvent(ev1);
    const snapshotAfterFirst = getEventLog();

    // Act — add another event
    const ev2 = makeRunFinished();
    publishEvent(ev2);

    // Assert — the reference captured before the second publish is unchanged
    expect(snapshotAfterFirst).toHaveLength(1);
    expect(getEventLog()).toHaveLength(2);
  });
});

// ─── clearEventLog ────────────────────────────────────────────────────────────

describe("clearEventLog", () => {
  it("resets the log to empty", () => {
    // Arrange
    publishEvent(makeRunStarted());
    expect(getEventLog()).toHaveLength(1);

    // Act
    clearEventLog();

    // Assert
    expect(getEventLog()).toHaveLength(0);
  });

  it("can be called on an already-empty log without error", () => {
    // Act + Assert — no throw
    expect(() => clearEventLog()).not.toThrow();
    expect(getEventLog()).toHaveLength(0);
  });
});

// ─── getEventLog ──────────────────────────────────────────────────────────────

describe("getEventLog", () => {
  it("returns an empty array on a fresh log", () => {
    expect(getEventLog()).toHaveLength(0);
  });

  it("returns a readonly snapshot (TypeScript type; does not throw in JS at runtime)", () => {
    // Verify the reference is the stable log, not a copy each call
    publishEvent(makeRunStarted());
    const log = getEventLog();
    expect(Array.isArray(log)).toBe(true);
    expect(log).toHaveLength(1);
  });
});

// ─── subscribeEvents ──────────────────────────────────────────────────────────

describe("subscribeEvents — subscriber lifecycle", () => {
  it("notifies a subscriber when an event is published", () => {
    // Arrange
    const cb = vi.fn();
    subscribeEvents(cb);

    // Act
    const ev = makeRunStarted();
    publishEvent(ev);

    // Assert
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(ev);
  });

  it("notifies multiple subscribers in registration order", () => {
    // Arrange
    const order: number[] = [];
    subscribeEvents(() => order.push(1));
    subscribeEvents(() => order.push(2));
    subscribeEvents(() => order.push(3));

    // Act
    publishEvent(makeRunStarted());

    // Assert
    expect(order).toEqual([1, 2, 3]);
  });

  it("passes each event to all subscribers", () => {
    // Arrange
    const cb = vi.fn();
    subscribeEvents(cb);

    // Act
    publishEvent(makeRunStarted());
    publishEvent(makeRunFinished());

    // Assert
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returns an unsubscribe function that removes the subscriber", () => {
    // Arrange
    const cb = vi.fn();
    const unsubscribe = subscribeEvents(cb);

    // Act
    publishEvent(makeRunStarted());
    unsubscribe();
    publishEvent(makeRunFinished());

    // Assert — cb was called only for the first event
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("calling the unsubscribe function twice does not throw", () => {
    // Arrange
    const cb = vi.fn();
    const unsubscribe = subscribeEvents(cb);

    // Act + Assert
    expect(() => {
      unsubscribe();
      unsubscribe();
    }).not.toThrow();
  });

  it("isolates a throwing subscriber — other subscribers still receive the event", () => {
    // Arrange
    const badCb = () => {
      throw new Error("subscriber crash");
    };
    const goodCb = vi.fn();
    subscribeEvents(badCb);
    subscribeEvents(goodCb);

    // Act — should not propagate the throw
    expect(() => publishEvent(makeRunStarted())).not.toThrow();

    // Assert — the good subscriber was still called despite the bad one throwing
    expect(goodCb).toHaveBeenCalledTimes(1);
  });

  it("does not call an unsubscribed callback when no other subscriber exists", () => {
    // Arrange
    const cb = vi.fn();
    const unsubscribe = subscribeEvents(cb);
    unsubscribe();

    // Act
    publishEvent(makeRunStarted());

    // Assert
    expect(cb).not.toHaveBeenCalled();
  });
});

// ─── projectRunStats ──────────────────────────────────────────────────────────

describe("projectRunStats — empty log", () => {
  it("returns all-zero stats for an empty log", () => {
    // Act
    const stats = projectRunStats([]);

    // Assert
    expect(stats).toEqual({
      startTime: 0,
      tokenCount: 0,
      toolCallCount: 0,
      stepCount: 0,
      interruptCount: 0,
    });
  });
});

describe("projectRunStats — startTime from RUN_STARTED", () => {
  it("captures the timestamp of the RUN_STARTED event as startTime", () => {
    // Arrange
    const log: AGUIEvent[] = [makeRunStarted(9999)];

    // Act
    const stats = projectRunStats(log);

    // Assert
    expect(stats.startTime).toBe(9999);
  });

  it("uses the LAST RUN_STARTED timestamp when multiple are present", () => {
    // Arrange — two RUN_STARTED events; the last one wins
    const log: AGUIEvent[] = [makeRunStarted(1000), makeRunStarted(5000)];

    // Act
    const stats = projectRunStats(log);

    // Assert
    expect(stats.startTime).toBe(5000);
  });
});

describe("projectRunStats — tokenCount from RUN_FINISHED", () => {
  it("captures totalTokens from RUN_FINISHED", () => {
    // Arrange
    const log: AGUIEvent[] = [makeRunFinished(1234)];

    // Act
    const stats = projectRunStats(log);

    // Assert
    expect(stats.tokenCount).toBe(1234);
  });

  it("uses the last RUN_FINISHED totalTokens when multiple are present", () => {
    // Arrange
    const log: AGUIEvent[] = [makeRunFinished(100), makeRunFinished(999)];

    // Act
    const stats = projectRunStats(log);

    // Assert
    expect(stats.tokenCount).toBe(999);
  });
});

describe("projectRunStats — toolCallCount from TOOL_CALL_START", () => {
  it("counts each TOOL_CALL_START event", () => {
    // Arrange
    const log: AGUIEvent[] = [
      makeToolCallStart("tc-1", "search", "node-a"),
      makeToolCallStart("tc-2", "fetch", "node-a"),
      makeToolCallStart("tc-3", "write", "node-b"),
    ];

    // Act
    const stats = projectRunStats(log);

    // Assert
    expect(stats.toolCallCount).toBe(3);
  });

  it("returns 0 when no TOOL_CALL_START events are present", () => {
    const log: AGUIEvent[] = [makeRunStarted(), makeRunFinished()];
    expect(projectRunStats(log).toolCallCount).toBe(0);
  });
});

describe("projectRunStats — stepCount from STEP_STARTED", () => {
  it("counts each STEP_STARTED event", () => {
    // Arrange
    const log: AGUIEvent[] = [
      makeStepStarted("node-a"),
      makeStepStarted("node-b"),
    ];

    // Act
    const stats = projectRunStats(log);

    // Assert
    expect(stats.stepCount).toBe(2);
  });

  it("returns 0 when no STEP_STARTED events are present", () => {
    expect(projectRunStats([makeRunStarted()]).stepCount).toBe(0);
  });
});

describe("projectRunStats — interruptCount from INTERRUPT", () => {
  it("counts each INTERRUPT event", () => {
    // Arrange
    const log: AGUIEvent[] = [makeInterrupt(), makeInterrupt(), makeInterrupt()];

    // Act
    const stats = projectRunStats(log);

    // Assert
    expect(stats.interruptCount).toBe(3);
  });

  it("returns 0 when no INTERRUPT events are present", () => {
    expect(projectRunStats([makeRunStarted()]).interruptCount).toBe(0);
  });
});

describe("projectRunStats — mixed event log", () => {
  it("accumulates all counters correctly across a realistic run", () => {
    // Arrange
    const log: AGUIEvent[] = [
      makeRunStarted(1000),
      makeStepStarted("node-a", 1100),
      makeToolCallStart("tc-1", "search", "node-a"),
      makeToolCallStart("tc-2", "fetch", "node-a"),
      makeStepFinished("node-a", 1500, 400),
      makeStepStarted("node-b", 1600),
      makeInterrupt(),
      makeStepFinished("node-b", 2000, 400),
      makeRunFinished(750, 1200),
    ];

    // Act
    const stats = projectRunStats(log);

    // Assert
    expect(stats.startTime).toBe(1000);
    expect(stats.tokenCount).toBe(750);
    expect(stats.toolCallCount).toBe(2);
    expect(stats.stepCount).toBe(2);
    expect(stats.interruptCount).toBe(1);
  });

  it("ignores non-counting event types (TEXT_MESSAGE_CONTENT, STATE_SNAPSHOT, etc.)", () => {
    // Arrange — events that should NOT affect any counter
    const log: AGUIEvent[] = [
      baseEvent("TEXT_MESSAGE_START", { role: "assistant" }),
      baseEvent("TEXT_MESSAGE_CONTENT", { delta: "hello" }),
      baseEvent("TEXT_MESSAGE_END"),
      baseEvent("STATE_SNAPSHOT", { snapshot: {} }),
      baseEvent("STATE_DELTA", { delta: [] }),
      baseEvent("CUSTOM", { name: "my-event", value: 42 }),
    ];

    // Act
    const stats = projectRunStats(log);

    // Assert — all counters stay at zero
    expect(stats).toEqual({
      startTime: 0,
      tokenCount: 0,
      toolCallCount: 0,
      stepCount: 0,
      interruptCount: 0,
    });
  });
});

// ─── buildTraceTree ───────────────────────────────────────────────────────────

describe("buildTraceTree — empty log", () => {
  it("returns an empty roots array for an empty log", () => {
    expect(buildTraceTree([])).toEqual([]);
  });
});

describe("buildTraceTree — STEP_STARTED creates root node", () => {
  it("creates a running node in the roots for STEP_STARTED", () => {
    // Arrange
    const log: AGUIEvent[] = [makeStepStarted("node-a", 2000)];

    // Act
    const roots = buildTraceTree(log);

    // Assert
    expect(roots).toHaveLength(1);
    expect(roots[0]).toMatchObject({
      id: "node-a-2000",
      name: "node-a",
      type: "node",
      startTime: 2000,
      status: "running",
      children: [],
    });
  });

  it("creates multiple root nodes for multiple STEP_STARTED events", () => {
    // Arrange
    const log: AGUIEvent[] = [makeStepStarted("node-a", 1000), makeStepStarted("node-b", 2000)];

    // Act
    const roots = buildTraceTree(log);

    // Assert
    expect(roots).toHaveLength(2);
    expect(roots[0]?.name).toBe("node-a");
    expect(roots[1]?.name).toBe("node-b");
  });
});

describe("buildTraceTree — STEP_FINISHED updates an existing node", () => {
  it("marks a started node as done with endTime and duration", () => {
    // Arrange
    const log: AGUIEvent[] = [
      makeStepStarted("node-a", 1000),
      makeStepFinished("node-a", 2000, 1000),
    ];

    // Act
    const roots = buildTraceTree(log);

    // Assert
    expect(roots[0]).toMatchObject({
      name: "node-a",
      status: "done",
      endTime: 2000,
      duration: 1000,
    });
  });

  it("ignores STEP_FINISHED for an unknown nodeName (no crash)", () => {
    // Arrange — finish with no corresponding start
    const log: AGUIEvent[] = [makeStepFinished("ghost-node", 9999, 500)];

    // Act + Assert — no throw, empty roots
    expect(() => buildTraceTree(log)).not.toThrow();
    expect(buildTraceTree(log)).toHaveLength(0);
  });
});

describe("buildTraceTree — TOOL_CALL_START", () => {
  it("attaches a tool-type child to its parent node", () => {
    // Arrange
    const log: AGUIEvent[] = [
      makeStepStarted("node-a", 1000),
      makeToolCallStart("tc-1", "search", "node-a"),
    ];

    // Act
    const roots = buildTraceTree(log);

    // Assert — the tool call is a child of node-a, not a new root
    expect(roots).toHaveLength(1);
    const nodeA = roots[0];
    expect(nodeA?.children).toHaveLength(1);
    expect(nodeA?.children[0]).toMatchObject({
      id: "tc-1",
      name: "search",
      type: "tool",
      status: "running",
    });
  });

  it("adds a tool call as a root when its parentNode is unknown", () => {
    // Arrange — no STEP_STARTED for "node-a"
    const log: AGUIEvent[] = [makeToolCallStart("tc-1", "search", "node-a")];

    // Act
    const roots = buildTraceTree(log);

    // Assert — orphaned tool call becomes its own root
    expect(roots).toHaveLength(1);
    expect(roots[0]).toMatchObject({
      id: "tc-1",
      name: "search",
      type: "tool",
    });
  });

  it("attaches multiple tool calls to the same parent", () => {
    // Arrange
    const log: AGUIEvent[] = [
      makeStepStarted("node-a", 1000),
      makeToolCallStart("tc-1", "search", "node-a"),
      makeToolCallStart("tc-2", "fetch", "node-a"),
    ];

    // Act
    const roots = buildTraceTree(log);

    // Assert
    expect(roots[0]?.children).toHaveLength(2);
    expect(roots[0]?.children[0]?.name).toBe("search");
    expect(roots[0]?.children[1]?.name).toBe("fetch");
  });

  it("stores tool call startTime from the event timestamp", () => {
    // Arrange
    const ev = baseEvent("TOOL_CALL_START", {
      toolCallId: "tc-1",
      toolName: "search",
      parentNode: "node-a",
      timestamp: 5555,
    }) as AGUIEvent;
    const log: AGUIEvent[] = [makeStepStarted("node-a", 1000), ev];

    // Act
    const roots = buildTraceTree(log);

    // Assert
    expect(roots[0]?.children[0]?.startTime).toBe(5555);
  });
});

describe("buildTraceTree — TOOL_CALL_END", () => {
  it("marks the tool node as done with endTime", () => {
    // Arrange
    const log: AGUIEvent[] = [
      makeStepStarted("node-a", 1000),
      makeToolCallStart("tc-1", "search", "node-a"),
      makeToolCallEnd("tc-1"),
    ];

    // Act
    const roots = buildTraceTree(log);
    const toolNode = roots[0]?.children[0];

    // Assert
    expect(toolNode?.status).toBe("done");
    expect(toolNode?.endTime).toBe(1000); // default timestamp from baseEvent
  });

  it("stores JSON-serialized output when result is present", () => {
    // Arrange
    const result = { rows: [{ a: 1 }, { b: 2 }] };
    const log: AGUIEvent[] = [
      makeStepStarted("node-a", 1000),
      makeToolCallStart("tc-1", "search", "node-a"),
      makeToolCallEnd("tc-1", result),
    ];

    // Act
    const roots = buildTraceTree(log);
    const toolNode = roots[0]?.children[0];

    // Assert
    expect(toolNode?.output).toBe(JSON.stringify(result).slice(0, 200));
  });

  it("does not set output when result is undefined", () => {
    // Arrange
    const log: AGUIEvent[] = [
      makeStepStarted("node-a", 1000),
      makeToolCallStart("tc-1", "search", "node-a"),
      makeToolCallEnd("tc-1", undefined),
    ];

    // Act
    const roots = buildTraceTree(log);
    const toolNode = roots[0]?.children[0];

    // Assert — no output field set when result is falsy
    expect(toolNode?.output).toBeUndefined();
  });

  it("truncates large result output to 200 characters", () => {
    // Arrange — a result that stringifies to more than 200 chars
    const result = { data: "x".repeat(300) };
    const log: AGUIEvent[] = [
      makeStepStarted("node-a", 1000),
      makeToolCallStart("tc-1", "search", "node-a"),
      makeToolCallEnd("tc-1", result),
    ];

    // Act
    const roots = buildTraceTree(log);
    const toolNode = roots[0]?.children[0];

    // Assert — output capped at 200 chars
    expect(toolNode?.output).toHaveLength(200);
    expect(toolNode?.output).toBe(JSON.stringify(result).slice(0, 200));
  });

  it("ignores TOOL_CALL_END for an unknown toolCallId (no crash)", () => {
    // Arrange — end without start
    const log: AGUIEvent[] = [makeToolCallEnd("ghost-tc-99")];

    // Act + Assert — no throw
    expect(() => buildTraceTree(log)).not.toThrow();
    expect(buildTraceTree(log)).toHaveLength(0);
  });
});

describe("buildTraceTree — RUN_ERROR marks all running nodes as error", () => {
  it("sets status=error and output=message for all running nodes", () => {
    // Arrange — two nodes: one running, one already done
    const log: AGUIEvent[] = [
      makeStepStarted("node-a", 1000),
      makeStepStarted("node-b", 1100),
      makeStepFinished("node-a", 1500, 500), // node-a transitions to done
      makeRunError("fatal timeout"),
    ];

    // Act
    const roots = buildTraceTree(log);

    // Assert — only node-b (still running) becomes error; node-a stays done
    const nodeA = roots.find((n) => n.name === "node-a");
    const nodeB = roots.find((n) => n.name === "node-b");
    expect(nodeA?.status).toBe("done");
    expect(nodeB?.status).toBe("error");
    expect(nodeB?.output).toBe("fatal timeout");
  });

  it("propagates the error message to running tool call nodes too", () => {
    // Arrange
    const log: AGUIEvent[] = [
      makeStepStarted("node-a", 1000),
      makeToolCallStart("tc-1", "search", "node-a"),
      makeRunError("network failure"),
    ];

    // Act
    const roots = buildTraceTree(log);

    // Assert — both node-a and tc-1 are running → both become error
    const nodeA = roots[0];
    const toolNode = nodeA?.children[0];
    expect(nodeA?.status).toBe("error");
    expect(nodeA?.output).toBe("network failure");
    expect(toolNode?.status).toBe("error");
    expect(toolNode?.output).toBe("network failure");
  });

  it("does nothing when there are no running nodes at the time of RUN_ERROR", () => {
    // Arrange — all nodes completed before the error
    const log: AGUIEvent[] = [
      makeStepStarted("node-a", 1000),
      makeStepFinished("node-a", 1500, 500),
      makeRunError("spurious error"),
    ];

    // Act
    const roots = buildTraceTree(log);

    // Assert — node-a stays done
    expect(roots[0]?.status).toBe("done");
  });
});

describe("buildTraceTree — complex multi-node scenario", () => {
  it("builds a realistic multi-step trace with tools, completions, and error handling", () => {
    // Arrange
    const log: AGUIEvent[] = [
      makeRunStarted(1000),
      makeStepStarted("planner", 1050),
      makeToolCallStart("tc-plan", "outline", "planner"),
      makeToolCallEnd("tc-plan", { plan: "step A then B" }),
      makeStepFinished("planner", 1500, 450),
      makeStepStarted("executor", 1510),
      makeToolCallStart("tc-exec", "run", "executor"),
      // executor is still running when we check
    ];

    // Act
    const roots = buildTraceTree(log);

    // Assert
    expect(roots).toHaveLength(2);

    const planner = roots.find((n) => n.name === "planner");
    expect(planner?.status).toBe("done");
    expect(planner?.children).toHaveLength(1);
    expect(planner?.children[0]?.status).toBe("done");
    expect(planner?.children[0]?.output).toContain("step A then B");

    const executor = roots.find((n) => n.name === "executor");
    expect(executor?.status).toBe("running");
    expect(executor?.children).toHaveLength(1);
    expect(executor?.children[0]?.status).toBe("running");
  });
});

describe("publishEvent + subscribeEvents integration", () => {
  it("subscriber receives events and log is updated atomically", () => {
    // Arrange
    const received: AGUIEvent[] = [];
    let logSizeAtCallTime = 0;
    subscribeEvents((ev) => {
      received.push(ev);
      logSizeAtCallTime = getEventLog().length;
    });

    // Act
    const ev = makeRunStarted();
    publishEvent(ev);

    // Assert — subscriber called synchronously, log already updated
    expect(received).toHaveLength(1);
    expect(received[0]).toBe(ev);
    expect(logSizeAtCallTime).toBe(1);
  });
});
