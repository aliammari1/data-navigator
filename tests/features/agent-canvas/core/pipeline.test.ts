import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AgentThought,
  DashboardPlan,
  DataSchema,
  WidgetSpec,
  WidgetState,
} from "@/features/agent-canvas/core/types";

/**
 * Behavioral tests for the agentic pipeline (pipeline.ts).
 *
 * pipeline.ts is a LangGraph StateGraph orchestrator. `AgentState` holds only
 * serializable data, so the *whole* graph can be driven end-to-end in a unit
 * test by mocking ONLY the true boundaries:
 *   - `@/platform/duckdb/duckdb`            (runReadOnlyQuery — the DuckDB worker)
 *   - `@/features/agent-canvas/core/schema` (analyzeSchema — AI/DB-backed)
 *   - `@/features/agent-canvas/core/planner`(buildPlan — AI-backed)
 *   - `@/features/agent-canvas/core/sql`    (generateSQL / generateInsight — LLM)
 *
 * The real LangGraph runtime, MemorySaver checkpointer, chart builders, ag-ui
 * event factory, and event-bus are kept live, so these assertions exercise the
 * actual graph topology: schema → react_sql_loop → planner → human_interrupt
 * (INTERRUPT) → critique ⇄ revise loop → sql_fan_out → narrator → END, plus the
 * Command({ resume }) interrupt-resume primitive and every node's sink wiring.
 *
 * Everything is deterministic and fast: no network, no native DB, no real
 * timers, no model loading. The four mocked modules are the only boundaries.
 */

// ─── Boundary mocks ───────────────────────────────────────────────────────────

const runReadOnlyQuery = vi.fn<(sql: string) => Promise<Record<string, unknown>[]>>();

vi.mock("@/platform/duckdb/duckdb", () => ({
  runReadOnlyQuery: (sql: string) => runReadOnlyQuery(sql),
}));

const analyzeSchema =
  vi.fn<(tableName: string, emit: (t: string) => void) => Promise<DataSchema>>();

vi.mock("@/features/agent-canvas/core/schema", () => ({
  analyzeSchema: (tableName: string, emit: (t: string) => void) =>
    analyzeSchema(tableName, emit),
}));

const buildPlan =
  vi.fn<(schema: DataSchema, emit: (t: string) => void) => Promise<DashboardPlan>>();

vi.mock("@/features/agent-canvas/core/planner", () => ({
  buildPlan: (schema: DataSchema, emit: (t: string) => void) => buildPlan(schema, emit),
}));

const generateSQL =
  vi.fn<(spec: WidgetSpec, schema: DataSchema, emit: (t: string) => void) => Promise<string>>();
const generateInsight =
  vi.fn<
    (spec: WidgetSpec, data: Record<string, unknown>[], emit: (t: string) => void) => Promise<string>
  >();

vi.mock("@/features/agent-canvas/core/sql", () => ({
  generateSQL: (spec: WidgetSpec, schema: DataSchema, emit: (t: string) => void) =>
    generateSQL(spec, schema, emit),
  generateInsight: (spec: WidgetSpec, data: Record<string, unknown>[], emit: (t: string) => void) =>
    generateInsight(spec, data, emit),
}));

import { runPipeline } from "@/features/agent-canvas/core/pipeline";
import {
  clearEventLog,
  getEventLog,
  projectRunStats,
} from "@/features/agent-canvas/core/event-bus";

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeSchema(overrides: Partial<DataSchema> = {}): DataSchema {
  return {
    tableName: "tx_view",
    rowCount: 1000,
    columns: [
      {
        name: "channel",
        duckType: "VARCHAR",
        semantic: "categorical",
        cardinality: 5,
        nullRate: 0,
        sample: ["web", "mobile"],
      },
      {
        name: "amount",
        duckType: "DOUBLE",
        semantic: "numeric",
        cardinality: 900,
        nullRate: 0,
        sample: ["1.0", "2.0"],
      },
    ],
    category: "Telecom",
    summary: "summary",
    dimensions: ["channel"],
    metrics: ["amount"],
    timeDims: ["day"],
    ...overrides,
  };
}

function makeWidget(overrides: Partial<WidgetSpec> = {}): WidgetSpec {
  return {
    id: "w1",
    title: "Widget 1",
    chartType: "bar",
    sqlIntent: "intent",
    dimensions: ["channel"],
    metrics: ["amount"],
    position: { x: 0, y: 0, w: 6, h: 4 },
    ...overrides,
  };
}

/**
 * A "good" plan that passes the critique quality check on the first pass:
 * >=3 widgets, includes a kpi-grid, and includes a trend chart (bar/line/area).
 */
function makeGoodPlan(overrides: Partial<DashboardPlan> = {}): DashboardPlan {
  return {
    title: "Sales Dashboard",
    description: "An overview",
    widgets: [
      makeWidget({ id: "kpi", title: "KPIs", chartType: "kpi-grid" }),
      makeWidget({ id: "bar", title: "By Channel", chartType: "bar" }),
      makeWidget({ id: "pie", title: "Share", chartType: "pie" }),
    ],
    ...overrides,
  };
}

/** A "weak" plan that fails every critique rule (1 widget, no kpi, no trend). */
function makeWeakPlan(overrides: Partial<DashboardPlan> = {}): DashboardPlan {
  return {
    title: "Weak Dashboard",
    description: "Sparse",
    widgets: [makeWidget({ id: "pie", title: "Share", chartType: "pie" })],
    ...overrides,
  };
}

/** Collect every sink callback so post-run assertions can inspect them. */
function makeSink() {
  const widgets: WidgetState[] = [];
  const thoughts: AgentThought[] = [];
  const plans: DashboardPlan[] = [];
  const narratives: string[] = [];
  const interrupts: Array<{ reason: string; payload: unknown }> = [];
  const errors: string[] = [];
  let doneCount = 0;

  return {
    widgets,
    thoughts,
    plans,
    narratives,
    interrupts,
    errors,
    get doneCount() {
      return doneCount;
    },
    callbacks: {
      onWidget: (w: WidgetState) => widgets.push(w),
      onThought: (t: AgentThought) => thoughts.push(t),
      onPlan: (p: DashboardPlan) => plans.push(p),
      onNarrative: (n: string) => narratives.push(n),
      onInterrupt: (reason: string, payload: unknown) => interrupts.push({ reason, payload }),
      onDone: () => {
        doneCount++;
      },
      onError: (message: string) => errors.push(message),
    },
  };
}

/** Default happy-path mock wiring shared by most tests. */
function stageHappyPath(plan: DashboardPlan = makeGoodPlan()) {
  analyzeSchema.mockImplementation(async (_table, emit) => {
    emit("profiling…");
    return makeSchema();
  });
  buildPlan.mockImplementation(async (_schema, emit) => {
    emit("planning…");
    return plan;
  });
  runReadOnlyQuery.mockResolvedValue([{ channel: "web", amount: 10 }]);
  generateSQL.mockImplementation(async (spec, _schema, emit) => {
    emit("sql…");
    return `SELECT * FROM t -- ${spec.id}`;
  });
  generateInsight.mockResolvedValue("");
}

/**
 * runPipeline kicks off `drive()` fire-and-forget (`void drive(...)`), and each
 * node awaits a mocked async boundary, so the graph genuinely progresses across
 * event-loop turns. Microtask flushing is therefore NOT enough — we poll an
 * observable sink condition with `waitFor`, which is deterministic (it resolves
 * the instant the condition holds) and does not depend on wall-clock timing.
 *
 * Crucially, each test must let its run reach a terminal/observable state before
 * the next test starts: the graph + MemorySaver checkpointer are a module-level
 * singleton, so a still-running prior `drive()` would write checkpoints
 * concurrently with the next test. Waiting on the interrupt / done condition
 * keeps every run quiesced within its own test.
 */
const WAIT = { timeout: 5000, interval: 5 } as const;

function waitForInterrupt(sink: ReturnType<typeof makeSink>) {
  return vi.waitFor(() => expect(sink.interrupts.length).toBeGreaterThanOrEqual(1), WAIT);
}

function waitForDone(sink: ReturnType<typeof makeSink>) {
  return vi.waitFor(() => expect(sink.doneCount).toBeGreaterThanOrEqual(1), WAIT);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const baseOpts = () => ({
  tableName: "tx_view",
  model: "test-model",
});

beforeEach(() => {
  clearEventLog();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("runPipeline — run start + handle", () => {
  it("returns a handle with the requested threadId and resume/dispose fns", async () => {
    stageHappyPath();
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-fixed-1",
    });

    expect(handle.threadId).toBe("thread-fixed-1");
    expect(typeof handle.resume).toBe("function");
    expect(typeof handle.dispose).toBe("function");
    // Let the fire-and-forget run reach its pause so it does not bleed into the
    // next test against the shared module-level graph/checkpointer.
    await waitForInterrupt(sink);
    handle.dispose();
  });

  it("publishes a RUN_STARTED event carrying the model and tableName", async () => {
    stageHappyPath();
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-runstart",
    });
    await waitForInterrupt(sink);

    const log = getEventLog();
    const started = log.find((e) => e.type === "RUN_STARTED");
    expect(started).toBeDefined();
    // @ts-expect-error narrowed by the find above
    expect(started.model).toBe("test-model");
    // @ts-expect-error narrowed by the find above
    expect(started.input).toEqual({ tableName: "tx_view" });
    handle.dispose();
  });

  it("falls back to the generated ctx threadId when none is supplied", async () => {
    stageHappyPath();
    const sink = makeSink();

    const handle = await runPipeline({ ...baseOpts(), ...sink.callbacks });
    // makeCtx() => `thread-<ts>-<rand>`
    expect(handle.threadId).toMatch(/^thread-\d+-[a-z0-9]+$/);
    await waitForInterrupt(sink);
    handle.dispose();
  });
});

describe("runPipeline — schema → planner → interrupt (pause at human review)", () => {
  it("runs schema/planner and pauses at the plan-review interrupt", async () => {
    stageHappyPath();
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-interrupt",
    });
    await waitForInterrupt(sink);

    // analyzeSchema + buildPlan ran exactly once.
    expect(analyzeSchema).toHaveBeenCalledTimes(1);
    expect(analyzeSchema).toHaveBeenCalledWith("tx_view", expect.any(Function));
    expect(buildPlan).toHaveBeenCalledTimes(1);

    // The plan was pushed to the sink and an interrupt fired with the plan payload.
    expect(sink.plans.length).toBeGreaterThanOrEqual(1);
    expect(sink.interrupts).toHaveLength(1);
    expect(sink.interrupts[0].reason).toBe("plan-review");
    expect(sink.interrupts[0].payload).toEqual(makeGoodPlan());

    // Graph is paused — onDone has NOT fired and no widgets built yet.
    expect(sink.doneCount).toBe(0);
    expect(generateSQL).not.toHaveBeenCalled();
    handle.dispose();
  });

  it("emits schema + planner agent thoughts via the sink", async () => {
    stageHappyPath();
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-thoughts",
    });
    await waitForInterrupt(sink);

    const agents = sink.thoughts.map((t) => t.agent);
    expect(agents).toContain("SchemaAgent");
    expect(agents).toContain("PlannerAgent");
    // The SchemaAgent "ok" thought reports dims/metrics counts.
    const okThought = sink.thoughts.find(
      (t) => t.agent === "SchemaAgent" && t.kind === "ok",
    );
    expect(okThought?.text).toContain("1 dims");
    expect(okThought?.text).toContain("1 metrics");
    handle.dispose();
  });

  it("runs the react_sql_loop exploration queries against the DuckDB boundary", async () => {
    stageHappyPath();
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-react",
    });
    await waitForInterrupt(sink);

    // Schema has 1 dim + 1 metric → all three exploration queries are emitted.
    const exploreCalls = runReadOnlyQuery.mock.calls.map((c) => c[0]);
    expect(exploreCalls.some((s) => s.includes("COUNT(*)"))).toBe(true);
    expect(exploreCalls.some((s) => s.includes("MIN(") && s.includes("MAX("))).toBe(true);
    expect(exploreCalls.some((s) => s.includes("GROUP BY 1"))).toBe(true);
    // A ReActAgent "exec" thought is recorded per successful exploration.
    expect(sink.thoughts.some((t) => t.agent === "ReActAgent" && t.kind === "exec")).toBe(true);
    handle.dispose();
  });

  it("swallows failed exploration queries without aborting the run", async () => {
    analyzeSchema.mockImplementation(async (_t, emit) => {
      emit("p");
      return makeSchema();
    });
    buildPlan.mockResolvedValue(makeGoodPlan());
    // react_sql_loop queries reject; widget queries (later) would resolve, but we
    // only reach the interrupt here.
    runReadOnlyQuery.mockRejectedValue(new Error("explore boom"));
    generateSQL.mockResolvedValue("SELECT 1");
    generateInsight.mockResolvedValue("");
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-explore-fail",
    });
    await waitForInterrupt(sink);

    // Despite every exploration throwing, the graph still reached the interrupt.
    expect(sink.interrupts).toHaveLength(1);
    expect(sink.errors).toHaveLength(0);
    handle.dispose();
  });

  it("omits metric/dim exploration queries when the schema has none", async () => {
    analyzeSchema.mockResolvedValue(
      makeSchema({ dimensions: [], metrics: [], timeDims: [] }),
    );
    buildPlan.mockResolvedValue(makeGoodPlan());
    runReadOnlyQuery.mockResolvedValue([{ total: 5, dim_count: 1 }]);
    generateSQL.mockResolvedValue("SELECT 1");
    generateInsight.mockResolvedValue("");
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-no-dims",
    });
    await waitForInterrupt(sink);

    // Only the COUNT(*) exploration survives the `.filter(Boolean)`.
    const exploreCalls = runReadOnlyQuery.mock.calls.map((c) => c[0]);
    expect(exploreCalls).toHaveLength(1);
    expect(exploreCalls[0]).toContain("COUNT(*)");
    // dim_count falls back to the literal `1` when no dimension exists.
    expect(exploreCalls[0]).toContain("1 as dim_count");
    handle.dispose();
  });
});

describe("runPipeline — resume(approve): critique passes, widgets build, narrator", () => {
  it("drives to completion building all widgets and producing a narrative", async () => {
    stageHappyPath(makeGoodPlan());
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-approve",
    });
    await waitForInterrupt(sink);
    expect(sink.interrupts).toHaveLength(1);

    await handle.resume("approve");
    await waitForDone(sink);

    // Critique passes on a good plan (no revise loop), so generateSQL is called
    // once per widget in the ORIGINAL plan (3 widgets).
    expect(generateSQL).toHaveBeenCalledTimes(3);

    // onDone fired exactly once at the end of the run.
    expect(sink.doneCount).toBe(1);

    // A narrative summary was produced and pushed to the sink.
    expect(sink.narratives).toHaveLength(1);
    expect(sink.narratives[0]).toContain("Sales Dashboard");
    expect(sink.narratives[0]).toContain("Analysis complete");
    expect(sink.narratives[0]).toContain("Built 3/3 widgets");
    handle.dispose();
  });

  it("marks widgets done and emits KPI/table/chart outputs per chart type", async () => {
    stageHappyPath(makeGoodPlan());
    runReadOnlyQuery.mockResolvedValue([{ channel: "web", amount: 10 }]);
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-widget-out",
    });
    await waitForInterrupt(sink);
    await handle.resume("approve");
    await waitForDone(sink);

    // Each widget passes through querying → building → done sink updates.
    const statuses = sink.widgets.map((w) => w.status);
    expect(statuses).toContain("querying");
    expect(statuses).toContain("building");
    expect(statuses).toContain("done");

    // The kpi-grid widget produced KPI cards; the bar widget produced an option.
    const kpiDone = sink.widgets.find((w) => w.spec.id === "kpi" && w.status === "done");
    expect(kpiDone?.kpis).toBeDefined();
    const barDone = sink.widgets.find((w) => w.spec.id === "bar" && w.status === "done");
    expect(barDone?.echartsOption).toBeDefined();
    handle.dispose();
  });

  it("attaches an insight and re-emits the widget when generateInsight returns text", async () => {
    stageHappyPath(makeGoodPlan());
    generateInsight.mockResolvedValue("Web leads with $10.");
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-insight",
    });
    await waitForInterrupt(sink);
    await handle.resume("approve");
    await waitForDone(sink);

    // A done widget carries the insight string.
    const withInsight = sink.widgets.find((w) => w.insight === "Web leads with $10.");
    expect(withInsight).toBeDefined();
    expect(withInsight?.status).toBe("done");

    // Narrative includes the per-widget insight bullet.
    expect(sink.narratives[0]).toContain("Web leads with $10.");
    handle.dispose();
  });
});

describe("runPipeline — widget-level error paths", () => {
  it("marks a widget errored when SQL generation throws (no query run for it)", async () => {
    stageHappyPath(makeGoodPlan());
    generateSQL.mockRejectedValue(new Error("sqlgen failed"));
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-sqlgen-err",
    });
    await waitForInterrupt(sink);
    await handle.resume("approve");
    await waitForDone(sink);

    const errored = sink.widgets.filter((w) => w.status === "error");
    expect(errored.length).toBeGreaterThan(0);
    expect(errored[0].error).toContain("sqlgen failed");
    // No `sql` recorded because generation threw before producing one.
    expect(errored[0].sql).toBeUndefined();
    // Run still completes.
    expect(sink.doneCount).toBe(1);
    handle.dispose();
  });

  it("marks a widget errored (carrying the sql) when query execution throws", async () => {
    stageHappyPath(makeGoodPlan());
    generateSQL.mockResolvedValue("SELECT bad FROM t");
    // First 3 exploration calls succeed; widget executions reject.
    runReadOnlyQuery
      .mockResolvedValueOnce([{ total: 1, dim_count: 1 }])
      .mockResolvedValueOnce([{ min_v: 0, max_v: 1, avg_v: 0.5 }])
      .mockResolvedValueOnce([{ channel: "web", total: 1 }])
      .mockRejectedValue(new Error("exec boom"));
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-exec-err",
    });
    await waitForInterrupt(sink);
    await handle.resume("approve");
    await waitForDone(sink);

    const errored = sink.widgets.filter((w) => w.status === "error");
    expect(errored.length).toBeGreaterThan(0);
    // The errored widget retains the generated SQL and surfaces the exec error.
    expect(errored[0].sql).toBe("SELECT bad FROM t");
    expect(errored[0].error).toContain("exec boom");
    handle.dispose();
  });
});

describe("runPipeline — critique ⇄ revise loop", () => {
  it("revises a weak plan (adds kpi + bar) so it ultimately builds those widgets", async () => {
    const weak = makeWeakPlan();
    stageHappyPath(weak);
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-revise",
    });
    await waitForInterrupt(sink);
    // Resume with `revise` + an explicit plan: that is the ONLY interrupt outcome
    // that keeps `approved === false`, so the critique node actually evaluates the
    // plan and routes weak plans into the revise node (approve / revise-without-plan
    // both short-circuit critique via `state.approved`).
    await handle.resume("revise", weak);
    await waitForDone(sink);

    // After revise, the plan has the auto KPI + auto bar prepended to the
    // original single pie widget → 3 widgets, so generateSQL is called 3 times.
    expect(generateSQL).toHaveBeenCalledTimes(3);

    // A revise plan was pushed to the sink mentioning added widgets.
    const reviseThought = sink.thoughts.find((t) => t.agent === "ReviseAgent");
    expect(reviseThought?.text).toContain("+2 widgets");

    // The auto-added KPI + bar widgets show up among the built widgets.
    const builtIds = sink.widgets.map((w) => w.spec.id);
    expect(builtIds.some((id) => id.startsWith("kpi-auto-"))).toBe(true);
    expect(builtIds.some((id) => id.startsWith("bar-auto-"))).toBe(true);

    // The narrator still completes the run.
    expect(sink.doneCount).toBe(1);
    handle.dispose();
  });

  it("a CritiqueAgent warning is emitted for the weak plan before revision", async () => {
    const weak = makeWeakPlan();
    stageHappyPath(weak);
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-critique-warn",
    });
    await waitForInterrupt(sink);
    // resume("revise", plan) keeps approved=false so critique evaluates the plan.
    await handle.resume("revise", weak);
    await waitForDone(sink);

    const warn = sink.thoughts.find((t) => t.agent === "CritiqueAgent" && t.kind === "warn");
    expect(warn).toBeDefined();
    expect(warn?.text).toContain("Too few widgets");
    expect(warn?.text).toContain("Missing KPI overview widget");
    expect(warn?.text).toContain("Add at least one trend chart");
    handle.dispose();
  });

  it("a good plan passes critique with an 'ok' thought and no revision", async () => {
    const good = makeGoodPlan();
    stageHappyPath(good);
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-critique-ok",
    });
    await waitForInterrupt(sink);
    // resume("revise", goodPlan) → approved=false so critique runs; a good plan
    // has no issues, so critique emits "ok" and routes straight to sql_fan_out
    // (no revise node).
    await handle.resume("revise", good);
    await waitForDone(sink);

    expect(sink.thoughts.some((t) => t.agent === "CritiqueAgent" && t.kind === "ok")).toBe(true);
    expect(sink.thoughts.some((t) => t.agent === "ReviseAgent")).toBe(false);
    handle.dispose();
  });
});

describe("runPipeline — resume(revise): human-supplied plan replaces the draft", () => {
  it("uses the operator-provided plan instead of the planner draft", async () => {
    stageHappyPath(makeWeakPlan());
    const replacement = makeGoodPlan({ title: "Operator Plan" });
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-revise-resume",
    });
    await waitForInterrupt(sink);

    // Operator submits a revised plan via resume("revise", plan).
    await handle.resume("revise", replacement);
    await waitForDone(sink);

    // The replacement plan (3 good widgets) is what gets built — not the weak draft.
    expect(generateSQL).toHaveBeenCalledTimes(3);
    expect(sink.narratives[0]).toContain("Operator Plan");
    expect(sink.doneCount).toBe(1);
    handle.dispose();
  });
});

describe("runPipeline — narrator edge cases", () => {
  it("counts only done widgets and tolerates errored ones in the summary", async () => {
    // 3-widget good plan; the SECOND widget's exec fails so it is errored.
    stageHappyPath(makeGoodPlan());
    generateSQL.mockResolvedValue("SELECT 1");
    runReadOnlyQuery
      .mockResolvedValueOnce([{ total: 1, dim_count: 1 }]) // explore 1
      .mockResolvedValueOnce([{ min_v: 0, max_v: 1, avg_v: 0.5 }]) // explore 2
      .mockResolvedValueOnce([{ channel: "web", total: 1 }]) // explore 3
      .mockResolvedValueOnce([{ channel: "web", amount: 10 }]) // widget kpi
      .mockRejectedValueOnce(new Error("widget 2 boom")) // widget bar exec fails
      .mockResolvedValueOnce([{ channel: "web", amount: 10 }]); // widget pie
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-narrator-partial",
    });
    await waitForInterrupt(sink);
    await handle.resume("approve");
    await waitForDone(sink);

    // Narrator reports 2 of 3 widgets done.
    expect(sink.narratives[0]).toContain("Built 2/3 widgets");
    // Row count is locale-formatted (1,000).
    expect(sink.narratives[0]).toContain("1,000 rows");
    expect(sink.narratives[0]).toContain("**Data category:** Telecom");
    handle.dispose();
  });
});

describe("event-bus integration — events emitted by the pipeline", () => {
  it("records STEP_STARTED, TOOL_CALL_START, INTERRUPT and (post-approve) RUN_FINISHED", async () => {
    stageHappyPath(makeGoodPlan());
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-events",
    });
    await waitForInterrupt(sink);

    // Up to the interrupt: schema/react/planner steps started, tool calls fired,
    // and one INTERRUPT event.
    const preStats = projectRunStats(getEventLog());
    expect(preStats.stepCount).toBeGreaterThanOrEqual(3);
    expect(preStats.toolCallCount).toBeGreaterThanOrEqual(1);
    expect(preStats.interruptCount).toBe(1);

    await handle.resume("approve");
    await waitForDone(sink);

    const log = getEventLog();
    expect(log.some((e) => e.type === "RUN_FINISHED")).toBe(true);
    // A STATE_SNAPSHOT carrying the plan was emitted by the planner node.
    const snapshot = log.find((e) => e.type === "STATE_SNAPSHOT");
    expect(snapshot).toBeDefined();
    handle.dispose();
  });
});

describe("runPipeline — error surfacing", () => {
  it("invokes onError and does not fire onDone when schema analysis throws", async () => {
    analyzeSchema.mockRejectedValue(new Error("schema exploded"));
    buildPlan.mockResolvedValue(makeGoodPlan());
    runReadOnlyQuery.mockResolvedValue([]);
    generateSQL.mockResolvedValue("SELECT 1");
    generateInsight.mockResolvedValue("");
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-schema-throw",
    });
    await vi.waitFor(() => expect(sink.errors.length).toBeGreaterThan(0), WAIT);

    // The non-interrupt error is surfaced via onError, and the run never
    // reached the interrupt or completion.
    expect(sink.errors.length).toBeGreaterThan(0);
    expect(sink.errors[0]).toContain("schema exploded");
    expect(sink.interrupts).toHaveLength(0);
    expect(sink.doneCount).toBe(0);
    expect(buildPlan).not.toHaveBeenCalled();
    handle.dispose();
  });
});

describe("PipelineHandle.dispose — sink lifecycle", () => {
  it("unregisters the thread sink so node-level side effects no longer reach it", async () => {
    stageHappyPath(makeGoodPlan());
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-dispose",
    });
    await waitForInterrupt(sink);
    expect(sink.interrupts).toHaveLength(1);

    const widgetsBefore = sink.widgets.length;
    const plansBefore = sink.plans.length;
    handle.dispose();

    // After dispose the sink is removed from the SINKS registry. The graph nodes
    // resolve their sink through `sinkFor(state)` (a registry lookup), so once
    // unregistered NO node-level callbacks (onWidget / onPlan / onThought) reach
    // this sink during the resumed run. `resume` awaits drive() fully, so the run
    // is settled when this returns.
    await handle.resume("approve");

    // Node-level callbacks did not fire: widget/plan/thought counts are unchanged.
    expect(sink.widgets.length).toBe(widgetsBefore);
    expect(sink.plans.length).toBe(plansBefore);

    // BUT `drive()` captured the sink object by reference (it is passed as an
    // argument, not looked up from the registry), so its terminal `sink.onDone()`
    // STILL fires even though the sink was unregistered. dispose() only governs
    // the node-level registry lookups, not drive()'s own captured reference.
    expect(sink.doneCount).toBe(1);
  });
});

// ─── Additional coverage gap tests ────────────────────────────────────────────

describe("runPipeline — data-table widget chart type (lines 394-396)", () => {
  it("builds table headers and rows for a data-table widget", async () => {
    const tablePlan: DashboardPlan = {
      title: "Table Dashboard",
      description: "Shows a data table",
      widgets: [
        makeWidget({ id: "tbl", title: "Data Table", chartType: "data-table" }),
        makeWidget({ id: "kpi2", title: "KPIs", chartType: "kpi-grid" }),
        makeWidget({ id: "bar2", title: "Bar Chart", chartType: "bar" }),
      ],
    };
    stageHappyPath(tablePlan);
    runReadOnlyQuery.mockResolvedValue([{ channel: "web", amount: 10 }]);
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-data-table",
    });
    await waitForInterrupt(sink);
    await handle.resume("approve");
    await waitForDone(sink);

    // The data-table widget should have tableHeaders and tableRows set.
    const tableDone = sink.widgets.find(
      (w) => w.spec.id === "tbl" && w.status === "done",
    );
    expect(tableDone).toBeDefined();
    expect(tableDone?.tableHeaders).toBeDefined();
    expect(Array.isArray(tableDone?.tableHeaders)).toBe(true);
    expect(tableDone?.tableRows).toBeDefined();
    expect(Array.isArray(tableDone?.tableRows)).toBe(true);
    // No echartsOption on a data-table widget.
    expect(tableDone?.echartsOption).toBeUndefined();
    handle.dispose();
  });
});

describe("runPipeline — generateInsight emit callback (line 420)", () => {
  it("fires the insight emit callback and emits an insight thought for each widget", async () => {
    const plan = makeGoodPlan();
    stageHappyPath(plan);
    // Make generateInsight fire its emit callback before resolving.
    generateInsight.mockImplementation(async (_spec, _data, emit) => {
      emit("thinking about insight...");
      return "Great insight text";
    });
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-insight-emit",
    });
    await waitForInterrupt(sink);
    await handle.resume("approve");
    await waitForDone(sink);

    // The insight emit callback pushed a thought with kind "insight".
    const insightThoughts = sink.thoughts.filter((t) => t.kind === "insight");
    expect(insightThoughts.length).toBeGreaterThan(0);
    expect(insightThoughts[0].text).toBe("thinking about insight...");

    // The widget was re-emitted with the insight attached (line 424).
    const withInsight = sink.widgets.filter((w) => w.insight === "Great insight text");
    expect(withInsight.length).toBeGreaterThan(0);
    handle.dispose();
  });
});

describe("runPipeline — buildEChartsOption null return (line 398 ?? branch)", () => {
  it("falls back to undefined echartsOption when rawData is empty for a chart widget", async () => {
    // Plan with a bar chart widget; rawData will be empty for widget queries so
    // buildEChartsOption returns null (it checks !data.length), exercising the
    // `?? undefined` branch on line 398.
    const plan: DashboardPlan = {
      title: "Empty Chart Dashboard",
      description: "Empty data",
      widgets: [
        makeWidget({ id: "kpi3", title: "KPIs", chartType: "kpi-grid" }),
        makeWidget({ id: "bar3", title: "Empty Bar", chartType: "bar" }),
        makeWidget({ id: "pie3", title: "Empty Pie", chartType: "pie" }),
      ],
    };
    stageHappyPath(plan);
    // All queries return empty arrays — triggers buildEChartsOption null path.
    runReadOnlyQuery.mockResolvedValue([]);
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-empty-chart",
    });
    await waitForInterrupt(sink);
    await handle.resume("approve");
    await waitForDone(sink);

    // The bar widget should have undefined echartsOption (null ?? undefined).
    const barDone = sink.widgets.find(
      (w) => w.spec.id === "bar3" && w.status === "done",
    );
    expect(barDone).toBeDefined();
    expect(barDone?.echartsOption).toBeUndefined();
    expect(sink.doneCount).toBe(1);
    handle.dispose();
  });
});

describe("runPipeline — generateInsight rejection (line 421 catch)", () => {
  it("silently recovers when generateInsight rejects and leaves insight undefined", async () => {
    stageHappyPath(makeGoodPlan());
    // generateInsight rejects: the `.catch(() => "")` on line 421 swallows it.
    generateInsight.mockRejectedValue(new Error("insight boom"));
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-insight-reject",
    });
    await waitForInterrupt(sink);
    await handle.resume("approve");
    await waitForDone(sink);

    // Run still completes successfully; erroring insight produces no insight field.
    expect(sink.doneCount).toBe(1);
    const doneWidgets = sink.widgets.filter((w) => w.status === "done");
    // All widgets reach done status even though insight generation failed.
    expect(doneWidgets.length).toBeGreaterThan(0);
    // No widget has an insight string (catch returned empty string → falsy).
    expect(doneWidgets.every((w) => !w.insight)).toBe(true);
    handle.dispose();
  });
});

describe("runPipeline — reviseNode false branches (lines 305/317)", () => {
  it("skips adding auto-KPI when the plan already has a kpi-grid widget", async () => {
    // Weak plan but already includes a kpi-grid (satisfies !hasKPI=false), so
    // reviseNode line 305 takes its false branch.
    // Plan has kpi + pie (no bar, only 2 widgets) → critique will still flag issues
    // (too few widgets, no trend chart), but revise won't add another KPI.
    const planWithKpi: DashboardPlan = {
      title: "Partial Plan",
      description: "Has KPI but no bar",
      widgets: [
        makeWidget({ id: "existing-kpi", title: "KPIs", chartType: "kpi-grid" }),
        makeWidget({ id: "pie-only", title: "Pie", chartType: "pie" }),
      ],
    };
    stageHappyPath(planWithKpi);
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-revise-has-kpi",
    });
    await waitForInterrupt(sink);
    // resume with revise + the original plan keeps approved=false so critique
    // evaluates the plan (2 widgets, has kpi, no bar → misses trend).
    await handle.resume("revise", planWithKpi);
    await waitForDone(sink);

    // reviseNode ran. Since hasKPI=true, no auto-kpi was added. Since !hasBar=true
    // and schema has dims+metrics, a bar-auto IS added. So final plan = [bar-auto, existing-kpi, pie-only] (3 widgets).
    expect(sink.doneCount).toBe(1);
    const builtIds = sink.widgets.map((w) => w.spec.id);
    // bar-auto added (hasBar was false), no extra kpi added.
    expect(builtIds.some((id) => id.startsWith("bar-auto-"))).toBe(true);
    // Only one kpi widget (the original, not an auto-added extra).
    const kpiWidgets = sink.widgets.filter((w) => w.spec.chartType === "kpi-grid");
    expect(kpiWidgets.every((w) => w.spec.id === "existing-kpi")).toBe(true);
    handle.dispose();
  });

  it("skips adding auto-bar when the plan already has a bar widget", async () => {
    // Plan has bar + pie (no kpi, only 2 widgets) → !hasBar=false, so
    // reviseNode line 317 takes its false branch.
    const planWithBar: DashboardPlan = {
      title: "Bar Plan",
      description: "Has bar but no kpi",
      widgets: [
        makeWidget({ id: "existing-bar", title: "Bar", chartType: "bar" }),
        makeWidget({ id: "pie-2", title: "Pie", chartType: "pie" }),
      ],
    };
    stageHappyPath(planWithBar);
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-revise-has-bar",
    });
    await waitForInterrupt(sink);
    await handle.resume("revise", planWithBar);
    await waitForDone(sink);

    expect(sink.doneCount).toBe(1);
    const builtIds = sink.widgets.map((w) => w.spec.id);
    // kpi-auto added (hasKPI was false, schema has metrics), no extra bar added.
    expect(builtIds.some((id) => id.startsWith("kpi-auto-"))).toBe(true);
    // Only one bar widget (the original, not an auto-added extra).
    const barWidgets = sink.widgets.filter((w) => w.spec.chartType === "bar");
    expect(barWidgets.every((w) => w.spec.id === "existing-bar")).toBe(true);
    handle.dispose();
  });
});

describe("runPipeline — sinkFor returns undefined (no-sink branches)", () => {
  it("completes without error when the sink is disposed before resume finishes", async () => {
    // This exercises the no-sink branches (sinkFor returns undefined when
    // threadId not in SINKS) via the existing dispose() test pattern, but drives
    // through sql_fan_out + narrator nodes that run without a registered sink.
    stageHappyPath(makeGoodPlan());
    generateInsight.mockImplementation(async (_spec, _data, emit) => {
      emit("insight cb");
      return "some insight";
    });
    const sink = makeSink();

    const handle = await runPipeline({
      ...baseOpts(),
      ...sink.callbacks,
      threadId: "thread-no-sink-branches",
    });
    await waitForInterrupt(sink);

    // Dispose removes the sink from the registry before the resumed drive runs.
    handle.dispose();

    // resume still drives the graph to completion; nodes hit the !sink early-return
    // paths inside emitStepStart / emitStepEnd / emitThought and the `if (sink)`
    // guards in plannerNode, reactSqlLoopNode, etc.
    await handle.resume("approve");

    // drive() holds a captured reference so onDone fires regardless of dispose.
    expect(sink.doneCount).toBe(1);
    // Node-level widget/thought callbacks do NOT fire after dispose (no sink in
    // the registry).
    const widgetCountAfterDispose = sink.widgets.length;
    expect(widgetCountAfterDispose).toBe(0);
  });
});
