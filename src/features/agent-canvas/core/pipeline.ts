"use client";
/**
 * LangGraph StateGraph — full agentic pipeline.
 *
 * Graph topology:
 *   START → schema_node → react_sql_loop → planner_node
 *         → [INTERRUPT: human review]
 *         → critique_node ←┐ (up to 3 cycles)
 *         → revise_node ───┘
 *         → sql_fan_out (sequential — single LLM worker)
 *         → narrator_node → END
 *
 * Architecture note: `AgentState` holds ONLY serializable data — no callback
 * closures. UI callbacks live in a thread-scoped sink registry (`SINKS`), so the
 * `MemorySaver` checkpointer can actually round-trip state for pause / replay /
 * crash-recovery. The graph emits AG-UI events via publishEvent() and pushes
 * data to the registered sink; the React layer reads both. Resume is driven by
 * `Command({ resume })`, the correct LangGraph interrupt-resume primitive.
 */

import {
  Annotation,
  Command,
  END,
  interrupt,
  isGraphInterrupt,
  MemorySaver,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import type { AGUIThreadContext } from "./ag-ui-types";
import { makeCtx, makeEvent } from "./ag-ui-types";
import { buildEChartsOption, buildKPICards, buildTableData } from "./charts";
import { publishEvent } from "./event-bus";
import { buildPlan } from "./planner";
import { analyzeSchema } from "./schema";
import { generateInsight, generateSQL } from "./sql";
import type {
  AgentThought,
  DashboardPlan,
  DataSchema,
  ThoughtKind,
  WidgetSpec,
  WidgetState,
} from "./types";

// ─── Thread-scoped UI sinks (kept OUT of graph state) ─────────────────────────

interface PipelineSink {
  ctx: AGUIThreadContext;
  onWidget: (w: WidgetState) => void;
  onThought: (t: AgentThought) => void;
  onPlan: (p: DashboardPlan) => void;
  onNarrative: (n: string) => void;
  onInterrupt: (reason: string, payload: unknown) => void;
  onDone: () => void;
  onError?: (message: string) => void;
}

const SINKS = new Map<string, PipelineSink>();

function sinkFor(state: State): PipelineSink | undefined {
  return state.threadId ? SINKS.get(state.threadId) : undefined;
}

// ─── Graph state schema (DATA ONLY — fully serializable) ──────────────────────

const AgentState = Annotation.Root({
  threadId: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  tableName: Annotation<string>,
  schema: Annotation<DataSchema | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  plan: Annotation<DashboardPlan | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  widgets: Annotation<WidgetState[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  narrative: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  critiqueCount: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  approved: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
  thoughts: Annotation<AgentThought[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  error: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
});

type State = typeof AgentState.State;

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Upstream nodes (schema_analysis / planner) always populate these channels
// before the nodes below run, so these guards are defensive narrowing rather
// than expected runtime paths. They replace non-null assertions while keeping
// the same crash-on-misuse behavior an `x!` deref would have produced.
function requireSchema(state: State): DataSchema {
  if (!state.schema) throw new Error("pipeline: schema not analyzed yet");
  return state.schema;
}

function requirePlan(state: State): DashboardPlan {
  if (!state.plan) throw new Error("pipeline: plan not built yet");
  return state.plan;
}

let _seq = 0;
function mkThought(
  agent: string,
  kind: ThoughtKind,
  text: string,
): AgentThought {
  return { id: `t${++_seq}`, agent, kind, text, ts: Date.now() };
}

function emitThought(
  state: State,
  agent: string,
  kind: ThoughtKind,
  text: string,
): AgentThought {
  const t = mkThought(agent, kind, text);
  const sink = sinkFor(state);
  sink?.onThought(t);
  if (sink) {
    publishEvent(
      makeEvent(sink.ctx, {
        type: "TEXT_MESSAGE_CONTENT",
        delta: `[${agent}] ${text}`,
      }),
    );
  }
  return t;
}

function emitStepStart(state: State, nodeName: string) {
  const sink = sinkFor(state);
  if (!sink) return;
  publishEvent(
    makeEvent(sink.ctx, { type: "STEP_STARTED", nodeName, phase: nodeName }),
  );
}

function emitStepEnd(state: State, nodeName: string, duration: number) {
  const sink = sinkFor(state);
  if (!sink) return;
  publishEvent(
    makeEvent(sink.ctx, { type: "STEP_FINISHED", nodeName, duration }),
  );
}

// ─── Nodes ────────────────────────────────────────────────────────────────────

async function schemaNode(state: State): Promise<Partial<State>> {
  const t0 = Date.now();
  emitStepStart(state, "schema");
  const thoughts: AgentThought[] = [];

  const schema = await analyzeSchema(state.tableName, (text) => {
    thoughts.push(emitThought(state, "SchemaAgent", "think", text));
  });

  thoughts.push(
    emitThought(
      state,
      "SchemaAgent",
      "ok",
      `Schema ready: ${schema.category} | ${schema.dimensions.length} dims | ${schema.metrics.length} metrics`,
    ),
  );
  emitStepEnd(state, "schema", Date.now() - t0);
  return { schema, thoughts };
}

async function reactSqlLoopNode(state: State): Promise<Partial<State>> {
  const t0 = Date.now();
  emitStepStart(state, "react_sql_loop");
  const thoughts: AgentThought[] = [];
  const schema = requireSchema(state);
  const sink = sinkFor(state);

  // ReAct: a few read-only exploration queries to ground later steps.
  const explorations = [
    `SELECT COUNT(*) as total, ${schema.dimensions[0] ? `COUNT(DISTINCT "${schema.dimensions[0]}")` : "1"} as dim_count FROM "${state.tableName}"`,
    schema.metrics[0]
      ? `SELECT MIN("${schema.metrics[0]}") as min_v, MAX("${schema.metrics[0]}") as max_v, AVG("${schema.metrics[0]}") as avg_v FROM "${state.tableName}"`
      : null,
    schema.dimensions[0] && schema.metrics[0]
      ? `SELECT "${schema.dimensions[0]}", SUM("${schema.metrics[0]}") as total FROM "${state.tableName}" GROUP BY 1 ORDER BY 2 DESC LIMIT 10`
      : null,
  ].filter(Boolean) as string[];

  for (const sql of explorations) {
    try {
      if (sink) {
        publishEvent(
          makeEvent(sink.ctx, {
            type: "TOOL_CALL_START",
            toolCallId: `explore-${Date.now()}`,
            toolName: "query_data",
            parentNode: "react_sql_loop",
          }),
        );
      }
      const rows = await runReadOnlyQuery(sql);
      thoughts.push(
        emitThought(
          state,
          "ReActAgent",
          "exec",
          `query_data → ${rows.length} rows`,
        ),
      );
    } catch {
      /* skip failed explorations */
    }
  }

  emitStepEnd(state, "react_sql_loop", Date.now() - t0);
  return { thoughts };
}

async function plannerNode(state: State): Promise<Partial<State>> {
  const t0 = Date.now();
  emitStepStart(state, "planner");
  const thoughts: AgentThought[] = [];
  const sink = sinkFor(state);

  const plan = await buildPlan(requireSchema(state), (text) => {
    thoughts.push(emitThought(state, "PlannerAgent", "plan", text));
  });

  sink?.onPlan(plan);
  if (sink) {
    publishEvent(
      makeEvent(sink.ctx, { type: "STATE_SNAPSHOT", snapshot: { plan } }),
    );
  }

  thoughts.push(
    emitThought(
      state,
      "PlannerAgent",
      "ok",
      `Plan: "${plan.title}" — ${plan.widgets.length} widgets`,
    ),
  );
  emitStepEnd(state, "planner", Date.now() - t0);
  return { plan, thoughts };
}

async function humanInterruptNode(state: State): Promise<Partial<State>> {
  const plan = requirePlan(state);
  const sink = sinkFor(state);
  sink?.onInterrupt("plan-review", plan);
  if (sink) {
    publishEvent(
      makeEvent(sink.ctx, {
        type: "INTERRUPT",
        reason: "plan-review",
        payload: plan,
      }),
    );
  }

  // LangGraph interrupt() — graph pauses here until resumed with a Command.
  const decision = interrupt({ reason: "plan-review", plan }) as {
    action: "approve" | "revise";
    plan?: DashboardPlan;
  };

  if (decision.action === "revise" && decision.plan) {
    return { plan: decision.plan, approved: false };
  }
  return { approved: true };
}

async function critiqueNode(state: State): Promise<Partial<State>> {
  const t0 = Date.now();
  emitStepStart(state, "critique");
  const thoughts: AgentThought[] = [];

  const count = state.critiqueCount ?? 0;
  if (count >= 3 || state.approved) {
    emitStepEnd(state, "critique", Date.now() - t0);
    return { approved: true, critiqueCount: count, thoughts };
  }

  const plan = requirePlan(state);
  const issues: string[] = [];

  if (plan.widgets.length < 3)
    issues.push("Too few widgets — add more coverage");
  if (!plan.widgets.some((w) => w.chartType === "kpi-grid"))
    issues.push("Missing KPI overview widget");
  if (!plan.widgets.some((w) => ["bar", "line", "area"].includes(w.chartType)))
    issues.push("Add at least one trend chart");

  if (issues.length === 0) {
    thoughts.push(
      emitThought(state, "CritiqueAgent", "ok", "Plan passes quality check"),
    );
    emitStepEnd(state, "critique", Date.now() - t0);
    return { approved: true, critiqueCount: count + 1, thoughts };
  }

  thoughts.push(
    emitThought(
      state,
      "CritiqueAgent",
      "warn",
      `Issues: ${issues.join("; ")}`,
    ),
  );
  emitStepEnd(state, "critique", Date.now() - t0);
  return { approved: false, critiqueCount: count + 1, thoughts };
}

async function reviseNode(state: State): Promise<Partial<State>> {
  const t0 = Date.now();
  emitStepStart(state, "revise");
  const thoughts: AgentThought[] = [];
  const plan = requirePlan(state);
  const schema = requireSchema(state);
  const sink = sinkFor(state);

  const hasKPI = plan.widgets.some((w) => w.chartType === "kpi-grid");
  const hasBar = plan.widgets.some((w) => w.chartType === "bar");

  const additions: WidgetSpec[] = [];

  if (!hasKPI && schema.metrics.length > 0) {
    additions.push({
      id: `kpi-auto-${Date.now()}`,
      title: "Key Metrics",
      chartType: "kpi-grid",
      sqlIntent: "Summary KPIs",
      dimensions: [],
      metrics: schema.metrics.slice(0, 4),
      position: { x: 0, y: 0, w: 12, h: 3 },
    });
  }

  if (!hasBar && schema.dimensions.length > 0 && schema.metrics.length > 0) {
    additions.push({
      id: `bar-auto-${Date.now()}`,
      title: `${schema.metrics[0]} by ${schema.dimensions[0]}`,
      chartType: "bar",
      sqlIntent: `Group ${schema.metrics[0]} by ${schema.dimensions[0]}`,
      dimensions: [schema.dimensions[0]],
      metrics: [schema.metrics[0]],
      position: { x: 0, y: 3, w: 6, h: 4 },
    });
  }

  const revised: DashboardPlan = {
    ...plan,
    widgets: [...additions, ...plan.widgets],
  };

  thoughts.push(
    emitThought(
      state,
      "ReviseAgent",
      "ok",
      `Revised plan: +${additions.length} widgets`,
    ),
  );
  sink?.onPlan(revised);
  emitStepEnd(state, "revise", Date.now() - t0);
  return { plan: revised, thoughts };
}

async function buildWidget(
  state: State,
  spec: WidgetSpec,
): Promise<{ widget: WidgetState; thoughts: AgentThought[] }> {
  const schema = requireSchema(state);
  const thoughts: AgentThought[] = [];
  const sink = sinkFor(state);

  sink?.onWidget({ spec, status: "querying" });

  // SQL generation (grammar-aware via the provider registry; EXPLAIN-validated).
  let sql = "";
  try {
    sql = await generateSQL(spec, schema, (text) => {
      thoughts.push(emitThought(state, `Widget[${spec.id}]`, "sql", text));
    });
  } catch (err) {
    const w: WidgetState = { spec, status: "error", error: String(err) };
    sink?.onWidget(w);
    return { widget: w, thoughts };
  }

  // Execute (read-only; DuckDB worker).
  let rawData: Record<string, unknown>[] = [];
  try {
    rawData = await runReadOnlyQuery(sql);
    if (sink) {
      publishEvent(
        makeEvent(sink.ctx, {
          type: "TOOL_CALL_END",
          toolCallId: `sql-${spec.id}`,
          result: { rows: rawData.length },
        }),
      );
    }
  } catch (err) {
    const w: WidgetState = { spec, status: "error", sql, error: String(err) };
    sink?.onWidget(w);
    return { widget: w, thoughts };
  }

  sink?.onWidget({ spec, status: "building", sql, rawData });

  let echartsOption: Record<string, unknown> | undefined;
  let kpis: WidgetState["kpis"];
  let tableHeaders: string[] | undefined;
  let tableRows: string[][] | undefined;

  try {
    if (spec.chartType === "kpi-grid") {
      kpis = buildKPICards(rawData[0] ?? {});
    } else if (spec.chartType === "data-table") {
      const td = buildTableData(rawData);
      tableHeaders = td.headers;
      tableRows = td.rows;
    } else {
      echartsOption =
        buildEChartsOption(spec.chartType, rawData, spec) ?? undefined;
    }
  } catch {
    /* partial build ok */
  }

  // Emit the finished widget ONCE so the canvas renders it immediately.
  const base: WidgetState = {
    spec,
    status: "done",
    sql,
    rawData,
    echartsOption,
    kpis,
    tableHeaders,
    tableRows,
  };
  sink?.onWidget(base);

  // Insight is a clearly-separated AWAITED enrich step (no fire-and-forget
  // `.then()` double-render). It serializes on the single LLM worker anyway.
  const insight = await generateInsight(spec, rawData, (text) => {
    thoughts.push(emitThought(state, `Widget[${spec.id}]`, "insight", text));
  }).catch(() => "");

  const w: WidgetState = insight ? { ...base, insight } : base;
  if (insight) sink?.onWidget(w);

  return { widget: w, thoughts };
}

async function sqlFanOutNode(state: State): Promise<Partial<State>> {
  const t0 = Date.now();
  emitStepStart(state, "sql_fan_out");

  const widgets: WidgetState[] = [];
  const allThoughts: AgentThought[] = [];

  // Build widgets SEQUENTIALLY. Both SQL-gen and insight-gen are LLM-bound and
  // there is exactly ONE global LLM worker, so they serialize on it regardless;
  // an unbounded `Promise.all` only thrashes the worker and the main thread
  // (6-9 simultaneous chart mounts). CONC=1 here is both correct and faster.
  const specs = state.plan?.widgets ?? [];
  for (const spec of specs) {
    const { widget, thoughts } = await buildWidget(state, spec);
    widgets.push(widget);
    allThoughts.push(...thoughts);
  }

  emitStepEnd(state, "sql_fan_out", Date.now() - t0);
  return { widgets, thoughts: allThoughts };
}

async function narratorNode(state: State): Promise<Partial<State>> {
  const t0 = Date.now();
  emitStepStart(state, "narrator");
  const thoughts: AgentThought[] = [];
  const sink = sinkFor(state);

  const done = state.widgets.filter((w) => w.status === "done").length;
  const total = state.widgets.length;
  const plan = state.plan;
  const schema = state.schema;

  const summary = [
    `## ${plan?.title ?? "Dashboard"}`,
    "",
    plan?.description ?? "",
    "",
    `**Analysis complete.** Built ${done}/${total} widgets for ${schema?.rowCount?.toLocaleString() ?? "?"} rows.`,
    "",
    `**Data category:** ${schema?.category ?? "Unknown"}`,
    `**Key dimensions:** ${schema?.dimensions?.slice(0, 3).join(", ") ?? "N/A"}`,
    `**Key metrics:** ${schema?.metrics?.slice(0, 3).join(", ") ?? "N/A"}`,
    "",
    "### Widget Summary",
    ...state.widgets
      .filter((w) => w.status === "done" && w.insight)
      .slice(0, 5)
      .map((w) => `- **${w.spec.title}**: ${w.insight}`),
  ].join("\n");

  sink?.onNarrative(summary);
  thoughts.push(
    emitThought(state, "NarratorAgent", "ok", "Executive narrative ready"),
  );

  if (sink) {
    publishEvent(
      makeEvent(sink.ctx, {
        type: "RUN_FINISHED",
        totalTokens: 0,
        totalDuration: Date.now() - t0,
      }),
    );
  }

  emitStepEnd(state, "narrator", Date.now() - t0);
  return { narrative: summary, thoughts };
}

// ─── Graph assembly ───────────────────────────────────────────────────────────

const checkpointer = new MemorySaver();

function buildGraph() {
  const g = new StateGraph(AgentState)
    .addNode("schema_analysis", schemaNode)
    .addNode("react_sql_loop", reactSqlLoopNode)
    .addNode("planner", plannerNode)
    .addNode("human_interrupt", humanInterruptNode)
    .addNode("critique", critiqueNode)
    .addNode("revise", reviseNode)
    .addNode("sql_fan_out", sqlFanOutNode)
    .addNode("narrator", narratorNode);

  g.addEdge(START, "schema_analysis");
  g.addEdge("schema_analysis", "react_sql_loop");
  g.addEdge("react_sql_loop", "planner");
  g.addEdge("planner", "human_interrupt");
  g.addEdge("human_interrupt", "critique");

  g.addConditionalEdges(
    "critique",
    (state: State) => {
      if (state.approved || (state.critiqueCount ?? 0) >= 3)
        return "sql_fan_out";
      return "revise";
    },
    { sql_fan_out: "sql_fan_out", revise: "revise" },
  );

  g.addEdge("revise", "critique");
  g.addEdge("sql_fan_out", "narrator");
  g.addEdge("narrator", END);

  // No `interruptBefore`: the `human_interrupt` node runs (firing the UI prompt
  // + INTERRUPT event), THEN its dynamic `interrupt()` pauses the graph. This is
  // the correct modern pattern — `interruptBefore` would have skipped the node
  // body, so the review prompt never fired before the pause.
  return g.compile({ checkpointer });
}

let _graph: ReturnType<typeof buildGraph> | null = null;

function getGraph() {
  if (!_graph) _graph = buildGraph();
  return _graph;
}

// ─── Public runner ────────────────────────────────────────────────────────────

export interface PipelineOptions {
  tableName: string;
  model: string;
  onWidget: (w: WidgetState) => void;
  onThought: (t: AgentThought) => void;
  onPlan: (p: DashboardPlan) => void;
  onNarrative: (n: string) => void;
  onInterrupt: (reason: string, payload: unknown) => void;
  onDone: () => void;
  onError?: (message: string) => void;
  threadId?: string;
}

export interface PipelineHandle {
  threadId: string;
  resume: (
    decision: "approve" | "revise",
    plan?: DashboardPlan,
  ) => Promise<void>;
  dispose: () => void;
}

// The exact input the compiled graph accepts: its inferred `UpdateType`
// (a partial of the channel keys) OR a resume `CommandInstance`. Deriving it
// from the graph's own `stream` signature keeps it in lock-step with the
// annotation, so a plain `Partial<State>` (e.g. `{ threadId, tableName }`) and
// `new Command({ resume })` both type-check without widening the call site.
type GraphInput = Parameters<ReturnType<typeof buildGraph>["stream"]>[0];

/**
 * Drive the graph to completion (or to the first interrupt), translating
 * checkpoints into UI calls via the thread-scoped sink. Returns once the run
 * pauses at the human-review interrupt or finishes.
 */
async function drive(
  graph: ReturnType<typeof buildGraph>,
  input: GraphInput,
  config: { configurable: { thread_id: string } },
  sink: PipelineSink,
): Promise<"interrupted" | "done"> {
  try {
    // streamMode "updates" surfaces each node's delta; we only need to pump the
    // graph — the per-node sink calls already pushed the data to the UI.
    const stream = await graph.stream(input, {
      ...config,
      streamMode: "updates",
    });
    // Pump the graph to completion (or first interrupt). The per-node sink calls
    // already pushed data to the UI; we only need to drain the stream here.
    for await (const _ of stream) {
      // intentionally empty — side effects happen in nodes
    }
  } catch (err) {
    if (!isGraphInterrupt(err)) {
      sink.onError?.(String(err));
      throw err;
    }
  }

  // If the graph is paused at an interrupt, getState().next is non-empty.
  const snapshot = await graph.getState(config);
  if (snapshot.next && snapshot.next.length > 0) return "interrupted";

  sink.onDone();
  return "done";
}

export async function runPipeline(
  opts: PipelineOptions,
): Promise<PipelineHandle> {
  const ctx = makeCtx(opts.model);
  const threadId = opts.threadId ?? ctx.threadId;
  const graph = getGraph();

  const sink: PipelineSink = {
    ctx,
    onWidget: opts.onWidget,
    onThought: opts.onThought,
    onPlan: opts.onPlan,
    onNarrative: opts.onNarrative,
    onInterrupt: opts.onInterrupt,
    onDone: opts.onDone,
    onError: opts.onError,
  };
  SINKS.set(threadId, sink);

  publishEvent(
    makeEvent(ctx, {
      type: "RUN_STARTED",
      model: opts.model,
      input: { tableName: opts.tableName },
    }),
  );

  const config = { configurable: { thread_id: threadId } };

  // Run until the first interrupt (plan-review). Errors surface via onError.
  void drive(graph, { threadId, tableName: opts.tableName }, config, sink).catch(
    () => {},
  );

  return {
    threadId,
    resume: async (decision, plan) => {
      // Correct LangGraph resume: feed a Command back into the interrupted node.
      await drive(
        graph,
        new Command({ resume: { action: decision, plan } }),
        config,
        sink,
      );
    },
    dispose: () => {
      SINKS.delete(threadId);
    },
  };
}
