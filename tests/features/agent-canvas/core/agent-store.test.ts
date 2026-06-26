import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AGUIEvent } from "@/features/agent-canvas/core/ag-ui-types";
import {
  type AgentStoreState,
  defaultSQLForTable,
  type FlowNode,
  type HumanInterrupt,
  type SQLHistoryEntry,
  type SQLTab,
  useAgentStore,
} from "@/features/agent-canvas/core/agent-store";
import type { TraceNode } from "@/features/agent-canvas/core/event-bus";
import type {
  AgentThought,
  DashboardPlan,
  WidgetState,
} from "@/features/agent-canvas/core/types";

// ─── Pristine snapshot ──────────────────────────────────────────────────────
// The store is a module-level singleton. Split its initial state into data
// fields and action closures once at module load (before any test mutates it).
// Before each test we REPLACE the whole state (`setState(next, true)`) with a
// deep-cloned copy of the pristine data plus the original actions. Replace mode
// (not merge) is required so optional fields a test set — e.g. `startTime`,
// `narrative` — are actually removed, not left dangling.

const { data: PRISTINE_DATA, actions: ACTIONS } = splitState(useAgentStore.getState());

function splitState(state: AgentStoreState): {
  data: Record<string, unknown>;
  actions: Record<string, unknown>;
} {
  const data: Record<string, unknown> = {};
  const actions: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (typeof value === "function") actions[key] = value;
    else data[key] = value;
  }
  return { data, actions };
}

function resetStore() {
  useAgentStore.setState(
    { ...structuredClone(PRISTINE_DATA), ...ACTIONS } as AgentStoreState,
    true,
  );
}

const store = () => useAgentStore.getState();

beforeEach(() => {
  resetStore();
});

// ─── Fixture builders ───────────────────────────────────────────────────────

function makeThought(overrides: Partial<AgentThought> = {}): AgentThought {
  return {
    id: overrides.id ?? "th-1",
    agent: overrides.agent ?? "planner",
    kind: overrides.kind ?? "think",
    text: overrides.text ?? "thinking",
    ts: overrides.ts ?? 1000,
  };
}

function makeWidget(id: string, status: WidgetState["status"] = "pending"): WidgetState {
  return {
    spec: {
      id,
      title: `Widget ${id}`,
      chartType: "bar",
      sqlIntent: "count by channel",
      dimensions: ["channel"],
      metrics: ["amount"],
      position: { x: 0, y: 0, w: 4, h: 3 },
    },
    status,
  };
}

function makePlan(overrides: Partial<DashboardPlan> = {}): DashboardPlan {
  return {
    title: overrides.title ?? "Sales Dashboard",
    description: overrides.description ?? "overview",
    widgets: overrides.widgets ?? [],
  };
}

function makeFlowNode(id: string, overrides: Partial<FlowNode> = {}): FlowNode {
  return {
    id,
    label: overrides.label ?? `Node ${id}`,
    status: overrides.status ?? "idle",
    type: overrides.type ?? "schema",
  };
}

function makeSQLTab(id: string, overrides: Partial<SQLTab> = {}): SQLTab {
  return {
    id,
    label: overrides.label ?? `Query ${id}`,
    sql: overrides.sql ?? "SELECT 1;",
    results: overrides.results ?? [],
    running: overrides.running ?? false,
    error: overrides.error,
  };
}

function makeHistoryEntry(id: string, overrides: Partial<SQLHistoryEntry> = {}): SQLHistoryEntry {
  return {
    id,
    sql: overrides.sql ?? "SELECT 1;",
    timestamp: overrides.timestamp ?? 1000,
    rowCount: overrides.rowCount ?? 1,
    duration: overrides.duration ?? 5,
  };
}

function makeEvent(messageId: string): AGUIEvent {
  return {
    type: "STEP_STARTED",
    messageId,
    timestamp: 1000,
    threadId: "thread-1",
    runId: "run-1",
    nodeName: "schema",
    phase: "schema",
  };
}

function makeTraceNode(id: string): TraceNode {
  return {
    id,
    name: `node-${id}`,
    type: "node",
    startTime: 1000,
    children: [],
    status: "running",
  };
}

// ─── defaultSQLForTable (pure) ──────────────────────────────────────────────

describe("defaultSQLForTable", () => {
  it("returns SHOW TABLES when no table name is provided", () => {
    expect(defaultSQLForTable()).toBe("SHOW TABLES;");
  });

  it("returns SHOW TABLES when the table name is an empty string (falsy)", () => {
    expect(defaultSQLForTable("")).toBe("SHOW TABLES;");
  });

  it("returns SHOW TABLES when the table name is undefined explicitly", () => {
    expect(defaultSQLForTable(undefined)).toBe("SHOW TABLES;");
  });

  it("builds a quoted LIMIT 100 SELECT for a plain table name", () => {
    expect(defaultSQLForTable("transactions")).toBe('SELECT * FROM "transactions" LIMIT 100;');
  });

  it("escapes embedded double quotes by doubling them (SQL-injection-safe identifier)", () => {
    expect(defaultSQLForTable('weird"name')).toBe('SELECT * FROM "weird""name" LIMIT 100;');
  });

  it("escapes every double quote, not just the first", () => {
    expect(defaultSQLForTable('a"b"c')).toBe('SELECT * FROM "a""b""c" LIMIT 100;');
  });

  it("preserves spaces and special characters inside the identifier", () => {
    expect(defaultSQLForTable("my table-2026")).toBe('SELECT * FROM "my table-2026" LIMIT 100;');
  });
});

// ─── Initial state ──────────────────────────────────────────────────────────

describe("initial state", () => {
  it("starts idle with no running flag", () => {
    const s = store();
    expect(s.phase).toBe("idle");
    expect(s.running).toBe(false);
    expect(s.step).toBe("setup");
  });

  it("defaults to the SmolLM2 360M model", () => {
    expect(store().model).toBe("HuggingFaceTB/SmolLM2-360M-Instruct");
  });

  it("seeds exactly one SQL tab whose sql is the no-table default", () => {
    const s = store();
    expect(s.sqlTabs).toHaveLength(1);
    expect(s.sqlTabs[0]?.id).toBe("tab-1");
    expect(s.sqlTabs[0]?.sql).toBe("SHOW TABLES;");
    expect(s.activeSqlTab).toBe("tab-1");
  });

  it("shows all three panels by default", () => {
    expect(store().panelConfig).toEqual({ showSql: true, showGraph: true, showNarrative: true });
  });

  it("starts with empty collections and zeroed counters", () => {
    const s = store();
    expect(s.thoughts).toEqual([]);
    expect(s.widgets).toEqual([]);
    expect(s.flowNodes).toEqual([]);
    expect(s.sqlHistory).toEqual([]);
    expect(s.traceRoots).toEqual([]);
    expect(s.eventTicker).toEqual([]);
    expect(s.tokenCount).toBe(0);
    expect(s.toolCallCnt).toBe(0);
  });

  it("starts with an inactive interrupt", () => {
    expect(store().interrupt).toEqual({ active: false, reason: "", payload: null });
  });

  it("has no startTime until running begins", () => {
    expect(store().startTime).toBeUndefined();
  });
});

// ─── Simple setters ─────────────────────────────────────────────────────────

describe("setPhase / setStep / setModel", () => {
  it("setPhase replaces the phase", () => {
    store().setPhase("build");
    expect(store().phase).toBe("build");
  });

  it("setStep replaces the step", () => {
    store().setStep("done");
    expect(store().step).toBe("done");
  });

  it("setModel replaces the model", () => {
    store().setModel("Qwen/Qwen2.5-0.5B-Instruct");
    expect(store().model).toBe("Qwen/Qwen2.5-0.5B-Instruct");
  });
});

describe("setThreadId / setNarrative", () => {
  it("setThreadId stores the id", () => {
    store().setThreadId("thread-xyz");
    expect(store().threadId).toBe("thread-xyz");
  });

  it("setNarrative stores the narrative", () => {
    store().setNarrative("All systems nominal.");
    expect(store().narrative).toBe("All systems nominal.");
  });

  it("setNarrative accepts an empty string", () => {
    store().setNarrative("");
    expect(store().narrative).toBe("");
  });
});

describe("setPlan", () => {
  it("stores the dashboard plan", () => {
    const plan = makePlan({ title: "Q3 KPIs" });
    store().setPlan(plan);
    expect(store().plan).toEqual(plan);
  });
});

// ─── setError ───────────────────────────────────────────────────────────────

describe("setError", () => {
  it("stores the error message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    store().setError("boom");
    expect(store().error).toBe("boom");
    spy.mockRestore();
  });

  it("logs the error to console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    store().setError("kaboom");
    expect(spy).toHaveBeenCalledWith("Error:", "kaboom");
    spy.mockRestore();
  });
});

// ─── setRunning (startTime branch) ──────────────────────────────────────────

describe("setRunning", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets running true and stamps startTime on the first start", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-25T00:00:00.000Z"));
    const expected = Date.now();

    store().setRunning(true);

    expect(store().running).toBe(true);
    expect(store().startTime).toBe(expected);
  });

  it("does not overwrite an existing startTime on a second start", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-25T00:00:00.000Z"));
    store().setRunning(true);
    const first = store().startTime;

    vi.setSystemTime(new Date("2026-06-25T01:00:00.000Z"));
    store().setRunning(true);

    expect(store().startTime).toBe(first);
  });

  it("does not set startTime when starting with running=false", () => {
    store().setRunning(false);
    expect(store().running).toBe(false);
    expect(store().startTime).toBeUndefined();
  });

  it("keeps startTime set after toggling running back off", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-25T00:00:00.000Z"));
    store().setRunning(true);
    const stamped = store().startTime;

    store().setRunning(false);

    expect(store().running).toBe(false);
    expect(store().startTime).toBe(stamped);
  });
});

// ─── setTableName (conditional sql rewrite) ─────────────────────────────────

describe("setTableName", () => {
  it("stores table and file names", () => {
    store().setTableName("tx_table", "transactions.csv");
    expect(store().tableName).toBe("tx_table");
    expect(store().fileName).toBe("transactions.csv");
  });

  it("rewrites the single default tab's sql to the table default", () => {
    store().setTableName("tx_table", "transactions.csv");
    expect(store().sqlTabs[0]?.sql).toBe('SELECT * FROM "tx_table" LIMIT 100;');
  });

  it("does NOT rewrite the tab when the user has edited the default sql", () => {
    store().updateSQLTab("tab-1", { sql: "SELECT custom FROM x;" });
    store().setTableName("tx_table", "transactions.csv");
    expect(store().sqlTabs[0]?.sql).toBe("SELECT custom FROM x;");
  });

  it("does NOT rewrite when there is more than one tab", () => {
    store().addSQLTab(makeSQLTab("tab-2"));
    store().setTableName("tx_table", "transactions.csv");
    // First tab still holds the original untouched default.
    expect(store().sqlTabs[0]?.sql).toBe("SHOW TABLES;");
  });
});

// ─── upsertWidget ───────────────────────────────────────────────────────────

describe("upsertWidget", () => {
  it("inserts a new widget when its spec id is unseen", () => {
    store().upsertWidget(makeWidget("w1"));
    expect(store().widgets).toHaveLength(1);
    expect(store().widgets[0]?.spec.id).toBe("w1");
  });

  it("appends multiple distinct widgets in order", () => {
    store().upsertWidget(makeWidget("w1"));
    store().upsertWidget(makeWidget("w2"));
    expect(store().widgets.map((w) => w.spec.id)).toEqual(["w1", "w2"]);
  });

  it("replaces an existing widget in place when the spec id matches", () => {
    store().upsertWidget(makeWidget("w1", "pending"));
    store().upsertWidget(makeWidget("w1", "done"));
    expect(store().widgets).toHaveLength(1);
    expect(store().widgets[0]?.status).toBe("done");
  });

  it("preserves position when replacing an existing widget", () => {
    store().upsertWidget(makeWidget("a"));
    store().upsertWidget(makeWidget("b"));
    store().upsertWidget(makeWidget("a", "error"));
    // 'a' updated in its original slot (index 0); 'b' still after it.
    expect(store().widgets.map((w) => w.spec.id)).toEqual(["a", "b"]);
    expect(store().widgets[0]?.status).toBe("error");
  });
});

// ─── addThought (ring buffer at 200) ────────────────────────────────────────

describe("addThought", () => {
  it("appends a thought", () => {
    store().addThought(makeThought({ id: "t1" }));
    expect(store().thoughts.map((t) => t.id)).toEqual(["t1"]);
  });

  it("keeps thoughts in insertion order", () => {
    store().addThought(makeThought({ id: "t1" }));
    store().addThought(makeThought({ id: "t2" }));
    expect(store().thoughts.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("does not trim while at or below 200 thoughts", () => {
    for (let i = 0; i < 200; i++) store().addThought(makeThought({ id: `t${i}` }));
    expect(store().thoughts).toHaveLength(200);
    expect(store().thoughts[0]?.id).toBe("t0");
  });

  it("drops the oldest thought once the buffer exceeds 200 (FIFO)", () => {
    for (let i = 0; i < 201; i++) store().addThought(makeThought({ id: `t${i}` }));
    expect(store().thoughts).toHaveLength(200);
    // t0 was shifted off; the window is t1..t200.
    expect(store().thoughts[0]?.id).toBe("t1");
    expect(store().thoughts[199]?.id).toBe("t200");
  });
});

// ─── flow nodes ─────────────────────────────────────────────────────────────

describe("setFlowNodes / updateFlowNode", () => {
  it("setFlowNodes replaces the whole node list", () => {
    store().setFlowNodes([makeFlowNode("a"), makeFlowNode("b")]);
    expect(store().flowNodes.map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("updateFlowNode patches a matching node's fields", () => {
    store().setFlowNodes([makeFlowNode("a"), makeFlowNode("b")]);
    store().updateFlowNode("b", { status: "running" });
    const b = store().flowNodes.find((n) => n.id === "b");
    expect(b?.status).toBe("running");
  });

  it("updateFlowNode leaves sibling nodes untouched", () => {
    store().setFlowNodes([makeFlowNode("a", { status: "idle" }), makeFlowNode("b")]);
    store().updateFlowNode("b", { status: "done" });
    expect(store().flowNodes.find((n) => n.id === "a")?.status).toBe("idle");
  });

  it("updateFlowNode is a no-op when the id is unknown", () => {
    store().setFlowNodes([makeFlowNode("a")]);
    store().updateFlowNode("ghost", { status: "error" });
    expect(store().flowNodes.map((n) => n.id)).toEqual(["a"]);
    expect(store().flowNodes[0]?.status).toBe("idle");
  });
});

// ─── interrupt (HITL) ───────────────────────────────────────────────────────

describe("setInterrupt / clearInterrupt", () => {
  it("setInterrupt stores the active interrupt with payload", () => {
    const interrupt: HumanInterrupt = {
      active: true,
      reason: "approve plan?",
      payload: { foo: 1 },
    };
    store().setInterrupt(interrupt);
    expect(store().interrupt).toEqual(interrupt);
  });

  it("setInterrupt preserves the resolve callback reference", () => {
    const resolve = vi.fn();
    store().setInterrupt({ active: true, reason: "r", payload: null, resolve });
    store().interrupt.resolve?.("approve");
    expect(resolve).toHaveBeenCalledWith("approve");
  });

  it("clearInterrupt resets to the inactive default", () => {
    store().setInterrupt({ active: true, reason: "r", payload: { x: 1 } });
    store().clearInterrupt();
    expect(store().interrupt).toEqual({ active: false, reason: "", payload: null });
  });
});

// ─── SQL tabs ───────────────────────────────────────────────────────────────

describe("addSQLTab / updateSQLTab / setActiveSQLTab", () => {
  it("addSQLTab appends a tab", () => {
    store().addSQLTab(makeSQLTab("tab-2"));
    expect(store().sqlTabs.map((t) => t.id)).toEqual(["tab-1", "tab-2"]);
  });

  it("updateSQLTab patches a matching tab", () => {
    store().updateSQLTab("tab-1", { sql: "SELECT 42;", running: true });
    const tab = store().sqlTabs.find((t) => t.id === "tab-1");
    expect(tab?.sql).toBe("SELECT 42;");
    expect(tab?.running).toBe(true);
  });

  it("updateSQLTab can attach results and an error", () => {
    store().updateSQLTab("tab-1", { results: [{ a: 1 }], error: "syntax" });
    const tab = store().sqlTabs.find((t) => t.id === "tab-1");
    expect(tab?.results).toEqual([{ a: 1 }]);
    expect(tab?.error).toBe("syntax");
  });

  it("updateSQLTab is a no-op for an unknown id", () => {
    store().updateSQLTab("nope", { sql: "X" });
    expect(store().sqlTabs[0]?.sql).toBe("SHOW TABLES;");
  });

  it("setActiveSQLTab changes the active tab id", () => {
    store().addSQLTab(makeSQLTab("tab-2"));
    store().setActiveSQLTab("tab-2");
    expect(store().activeSqlTab).toBe("tab-2");
  });
});

// ─── SQL history (capped ring buffer at 20) ─────────────────────────────────

describe("pushSQLHistory", () => {
  it("prepends the newest entry (LIFO order)", () => {
    store().pushSQLHistory(makeHistoryEntry("h1"));
    store().pushSQLHistory(makeHistoryEntry("h2"));
    expect(store().sqlHistory.map((h) => h.id)).toEqual(["h2", "h1"]);
  });

  it("keeps exactly 20 entries when filled to the cap", () => {
    for (let i = 0; i < 20; i++) store().pushSQLHistory(makeHistoryEntry(`h${i}`));
    expect(store().sqlHistory).toHaveLength(20);
    expect(store().sqlHistory[0]?.id).toBe("h19");
  });

  it("drops the oldest entry once history exceeds 20", () => {
    for (let i = 0; i < 21; i++) store().pushSQLHistory(makeHistoryEntry(`h${i}`));
    expect(store().sqlHistory).toHaveLength(20);
    // Newest at the head; h0 (oldest) was popped from the tail.
    expect(store().sqlHistory[0]?.id).toBe("h20");
    expect(store().sqlHistory.some((h) => h.id === "h0")).toBe(false);
    expect(store().sqlHistory[19]?.id).toBe("h1");
  });
});

// ─── trace roots ────────────────────────────────────────────────────────────

describe("setTraceRoots", () => {
  it("replaces the trace roots", () => {
    store().setTraceRoots([makeTraceNode("r1"), makeTraceNode("r2")]);
    expect(store().traceRoots.map((n) => n.id)).toEqual(["r1", "r2"]);
  });

  it("can clear the trace roots with an empty array", () => {
    store().setTraceRoots([makeTraceNode("r1")]);
    store().setTraceRoots([]);
    expect(store().traceRoots).toEqual([]);
  });
});

// ─── event ticker (capped ring buffer at 200) ───────────────────────────────

describe("pushEvent", () => {
  it("appends events in arrival order", () => {
    store().pushEvent(makeEvent("e1"));
    store().pushEvent(makeEvent("e2"));
    expect(store().eventTicker.map((e) => e.messageId)).toEqual(["e1", "e2"]);
  });

  it("does not trim while at or below 200 events", () => {
    for (let i = 0; i < 200; i++) store().pushEvent(makeEvent(`e${i}`));
    expect(store().eventTicker).toHaveLength(200);
    expect(store().eventTicker[0]?.messageId).toBe("e0");
  });

  it("drops the oldest event once the ticker exceeds 200 (FIFO)", () => {
    for (let i = 0; i < 201; i++) store().pushEvent(makeEvent(`e${i}`));
    expect(store().eventTicker).toHaveLength(200);
    expect(store().eventTicker[0]?.messageId).toBe("e1");
    expect(store().eventTicker[199]?.messageId).toBe("e200");
  });
});

// ─── counters ───────────────────────────────────────────────────────────────

describe("incTokens / incTools", () => {
  it("incTokens accumulates by the given amount", () => {
    store().incTokens(5);
    store().incTokens(3);
    expect(store().tokenCount).toBe(8);
  });

  it("incTokens handles zero", () => {
    store().incTokens(0);
    expect(store().tokenCount).toBe(0);
  });

  it("incTokens handles a negative correction", () => {
    store().incTokens(10);
    store().incTokens(-4);
    expect(store().tokenCount).toBe(6);
  });

  it("incTools increments the tool-call counter by one each call", () => {
    store().incTools();
    store().incTools();
    store().incTools();
    expect(store().toolCallCnt).toBe(3);
  });
});

// ─── reset ──────────────────────────────────────────────────────────────────

describe("reset", () => {
  it("restores fields that ARE present in INITIAL to their defaults", () => {
    const s = store();
    s.setPhase("done");
    s.setStep("done");
    s.setRunning(true);
    s.incTokens(99);
    s.incTools();

    s.reset();

    const after = store();
    expect(after.phase).toBe("idle");
    expect(after.step).toBe("setup");
    expect(after.running).toBe(false);
    expect(after.tokenCount).toBe(0);
    expect(after.toolCallCnt).toBe(0);
  });

  // BUG (recorded): reset() does `Object.assign(s, INITIAL)`, but INITIAL omits
  // every OPTIONAL field (narrative, error, tableName, fileName, threadId, plan,
  // startTime). Object.assign only copies keys present on the source, so those
  // fields are NOT cleared by reset(). These tests pin the CURRENT (buggy)
  // behaviour: optional fields leak across a reset.
  it("does NOT clear optional fields absent from INITIAL (narrative leaks)", () => {
    const s = store();
    s.setNarrative("note");

    s.reset();

    expect(store().narrative).toBe("note");
  });

  it("does NOT clear a stale startTime on reset (leaks)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-25T00:00:00.000Z"));
    const s = store();
    s.setRunning(true);
    const stamped = store().startTime;

    s.reset();

    expect(store().startTime).toBe(stamped);
    vi.useRealTimers();
  });

  it("does NOT clear tableName / fileName / threadId / plan / error on reset (leak)", () => {
    const s = store();
    s.setTableName("tx", "tx.csv");
    s.setThreadId("thread-1");
    s.setPlan(makePlan({ title: "P" }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    s.setError("bad");
    errSpy.mockRestore();

    s.reset();

    const after = store();
    expect(after.tableName).toBe("tx");
    expect(after.fileName).toBe("tx.csv");
    expect(after.threadId).toBe("thread-1");
    expect(after.plan?.title).toBe("P");
    expect(after.error).toBe("bad");
  });

  it("clears accumulated collections (widgets, thoughts, flow nodes, events)", () => {
    const s = store();
    s.upsertWidget(makeWidget("w1"));
    s.addThought(makeThought());
    s.setFlowNodes([makeFlowNode("a")]);
    s.pushEvent(makeEvent("e1"));
    s.setTraceRoots([makeTraceNode("r1")]);

    s.reset();

    const after = store();
    expect(after.widgets).toEqual([]);
    expect(after.thoughts).toEqual([]);
    expect(after.flowNodes).toEqual([]);
    expect(after.eventTicker).toEqual([]);
    expect(after.traceRoots).toEqual([]);
  });

  it("resets the SQL tabs back to the single default tab and empty history", () => {
    const s = store();
    s.addSQLTab(makeSQLTab("tab-2"));
    s.pushSQLHistory(makeHistoryEntry("h1"));

    s.reset();

    const after = store();
    expect(after.sqlTabs).toHaveLength(1);
    expect(after.sqlTabs[0]?.id).toBe("tab-1");
    expect(after.sqlTabs[0]?.sql).toBe("SHOW TABLES;");
    expect(after.sqlHistory).toEqual([]);
  });

  it("clears the interrupt back to inactive after a reset", () => {
    const s = store();
    s.setInterrupt({ active: true, reason: "r", payload: { x: 1 } });

    s.reset();

    expect(store().interrupt).toEqual({ active: false, reason: "", payload: null });
  });

  it("keeps the SQL default tab editable after reset (no frozen/shared reference)", () => {
    const s = store();
    s.reset();
    // updateSQLTab mutates the tab via immer; this must not throw on a reused
    // module-level DEFAULT_SQL_TAB reference and must actually apply.
    s.updateSQLTab("tab-1", { sql: "SELECT post_reset;" });
    expect(store().sqlTabs[0]?.sql).toBe("SELECT post_reset;");
  });
});

// ─── immutability / no shared default-tab reference ─────────────────────────

describe("default SQL tab isolation", () => {
  it("editing the seeded tab does not contaminate a fresh reset's default sql", () => {
    store().updateSQLTab("tab-1", { sql: "SELECT mutated;" });
    expect(store().sqlTabs[0]?.sql).toBe("SELECT mutated;");

    store().reset();

    // After reset the default tab must read the pristine default, not the edit.
    expect(store().sqlTabs[0]?.sql).toBe("SHOW TABLES;");
  });

  it("editing the default tab AFTER a reset does not corrupt later resets", () => {
    // reset() re-points sqlTabs[0] at the module-level DEFAULT_SQL_TAB constant.
    // Immer's copy-on-write must keep that constant pristine when we edit, so a
    // second reset still yields the original default.
    store().reset();
    store().updateSQLTab("tab-1", { sql: "SELECT after_reset;" });
    expect(store().sqlTabs[0]?.sql).toBe("SELECT after_reset;");

    store().reset();

    expect(store().sqlTabs[0]?.sql).toBe("SHOW TABLES;");
  });
});
