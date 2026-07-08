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
 * Streaming: nodes call config.writer?.(...) — LangGraph's own primitive for
 * emitting data mid-node — and the caller consumes graph.stream(input,
 * { streamMode: ["updates", "custom"] }). "updates" chunks arrive
 * automatically whenever a node returns, carrying its state delta, so
 * onPlan/onNarrative etc. are driven directly from that — nodes never call a
 * UI callback themselves. "custom" chunks (config.writer output) cover the
 * things node-return granularity can't: step-started, per-widget progress,
 * tool calls, thoughts. Both docs:
 * https://docs.langchain.com/oss/javascript/langgraph/streaming
 *
 * Interrupt handling is native too: after interrupt() pauses the graph, the
 * pending value is read straight off getState().tasks[].interrupts[].value
 * — no custom interrupt event needs to be written from inside the node.
 *
 * Event shapes (STEP_STARTED, TOOL_CALL_START, etc.) are @ag-ui/core's real
 * types, imported directly — the union lives in event-bus.ts.
 *
 * Why not the official @ag-ui/langgraph adapter: it connects to a real
 * LangGraph Agent Server (Docker + Postgres + Redis + a LangSmith API key,
 * even for local dev per LangChain's own deployment docs). This graph runs
 * in-process inside Electron main with no such deployment.
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
  type LangGraphRunnableConfig,
} from "@langchain/langgraph";
import { EventType } from "@ag-ui/core";
import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import { buildEChartsOption, buildKPICards, buildTableData } from "./charts";
import { publishEvent, type AGUIEvent } from "./event-bus";
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

// ─── App-domain helpers (not AG-UI / LangGraph glue) ───────────────────────

function requireSchema(state: State): DataSchema {
  if (!state.schema) throw new Error("pipeline: schema not analyzed yet");
  return state.schema;
}

function requirePlan(state: State): DashboardPlan {
  if (!state.plan) throw new Error("pipeline: plan not built yet");
  return state.plan;
}

let _seq = 0;
function mkThought(agent: string, kind: ThoughtKind, text: string): AgentThought {
  return { id: `t${++_seq}`, agent, kind, text, ts: Date.now() };
}

// ─── Nodes ────────────────────────────────────────────────────────────────────
// Every node writes progress via config.writer — LangGraph's own mid-node
// streaming primitive — using plain object literals typed against
// @ag-ui/core's real event shapes. Nothing here is a wrapper function.

async function schemaNode(
  state: State,
  config: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  // stepName MUST equal the graph node name ("schema_analysis", not "schema"):
  // STEP_FINISHED is derived in drive() from the "updates" chunk, which is
  // keyed by node name — a mismatch leaves the trace node "running" forever.
  config.writer?.({
    type: EventType.STEP_STARTED,
    stepName: "schema_analysis",
    timestamp: Date.now(),
  });
  const thoughts: AgentThought[] = [];

  const schema = await analyzeSchema(state.tableName, (text) => {
    const t = mkThought("SchemaAgent", "think", text);
    thoughts.push(t);
    config.writer?.({ type: EventType.CUSTOM, name: "thought", value: t, timestamp: Date.now() });
  });

  const done = mkThought(
    "SchemaAgent",
    "ok",
    `Schema ready: ${schema.category} | ${schema.dimensions.length} dims | ${schema.metrics.length} metrics`,
  );
  thoughts.push(done);
  config.writer?.({ type: EventType.CUSTOM, name: "thought", value: done, timestamp: Date.now() });

  return { schema, thoughts };
}

async function reactSqlLoopNode(
  state: State,
  config: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  config.writer?.({
    type: EventType.STEP_STARTED,
    stepName: "react_sql_loop",
    timestamp: Date.now(),
  });
  const thoughts: AgentThought[] = [];
  const schema = requireSchema(state);

  // ReAct: a few read-only exploration queries to ground later steps. These
  // are internal grounding, not agent-visible tool calls, so they surface as
  // thoughts only — real tool calls belong to sql_fan_out (see buildWidget).
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
      const rows = await runReadOnlyQuery(sql);
      const t = mkThought("ReActAgent", "exec", `query_data → ${rows.length} rows`);
      thoughts.push(t);
      config.writer?.({ type: EventType.CUSTOM, name: "thought", value: t, timestamp: Date.now() });
    } catch {
      /* skip failed explorations */
    }
  }

  return { thoughts };
}

async function plannerNode(
  state: State,
  config: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  config.writer?.({ type: EventType.STEP_STARTED, stepName: "planner", timestamp: Date.now() });
  const thoughts: AgentThought[] = [];

  const plan = await buildPlan(requireSchema(state), (text) => {
    const t = mkThought("PlannerAgent", "plan", text);
    thoughts.push(t);
    config.writer?.({ type: EventType.CUSTOM, name: "thought", value: t, timestamp: Date.now() });
  });

  const done = mkThought(
    "PlannerAgent",
    "ok",
    `Plan: "${plan.title}" — ${plan.widgets.length} widgets`,
  );
  thoughts.push(done);
  config.writer?.({ type: EventType.CUSTOM, name: "thought", value: done, timestamp: Date.now() });

  return { plan, thoughts };
}

// Pure LangGraph node — no AG-UI code at all. interrupt() pauses the graph;
// the caller (drive(), below) reads the pending value natively off
// getState() once the stream stops, rather than the node announcing it.
async function humanInterruptNode(state: State): Promise<Partial<State>> {
  const plan = requirePlan(state);
  const decision = interrupt({ reason: "plan-review", plan }) as {
    action: "approve" | "revise";
    plan?: DashboardPlan;
  };

  if (decision.action === "revise" && decision.plan) {
    return { plan: decision.plan, approved: false };
  }
  return { approved: true };
}

async function critiqueNode(
  state: State,
  config: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  config.writer?.({ type: EventType.STEP_STARTED, stepName: "critique", timestamp: Date.now() });
  const thoughts: AgentThought[] = [];

  const count = state.critiqueCount ?? 0;
  if (count >= 3 || state.approved) {
    return { approved: true, critiqueCount: count, thoughts };
  }

  const plan = requirePlan(state);
  const issues: string[] = [];

  if (plan.widgets.length < 3) issues.push("Too few widgets — add more coverage");
  if (!plan.widgets.some((w) => w.chartType === "kpi-grid"))
    issues.push("Missing KPI overview widget");
  if (!plan.widgets.some((w) => ["bar", "line", "area"].includes(w.chartType)))
    issues.push("Add at least one trend chart");

  if (issues.length === 0) {
    const t = mkThought("CritiqueAgent", "ok", "Plan passes quality check");
    thoughts.push(t);
    config.writer?.({ type: EventType.CUSTOM, name: "thought", value: t, timestamp: Date.now() });
    return { approved: true, critiqueCount: count + 1, thoughts };
  }

  const t = mkThought("CritiqueAgent", "warn", `Issues: ${issues.join("; ")}`);
  thoughts.push(t);
  config.writer?.({ type: EventType.CUSTOM, name: "thought", value: t, timestamp: Date.now() });
  return { approved: false, critiqueCount: count + 1, thoughts };
}

async function reviseNode(
  state: State,
  config: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  config.writer?.({ type: EventType.STEP_STARTED, stepName: "revise", timestamp: Date.now() });
  const thoughts: AgentThought[] = [];
  const plan = requirePlan(state);
  const schema = requireSchema(state);

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

  const t = mkThought("ReviseAgent", "ok", `Revised plan: +${additions.length} widgets`);
  thoughts.push(t);
  config.writer?.({ type: EventType.CUSTOM, name: "thought", value: t, timestamp: Date.now() });

  return { plan: revised, thoughts };
}

async function buildWidget(
  state: State,
  config: LangGraphRunnableConfig,
  spec: WidgetSpec,
): Promise<{ widget: WidgetState; thoughts: AgentThought[] }> {
  const schema = requireSchema(state);
  const thoughts: AgentThought[] = [];

  config.writer?.({
    type: EventType.CUSTOM,
    name: "widget",
    value: { spec, status: "querying" },
    timestamp: Date.now(),
  });

  let sql = "";
  try {
    sql = await generateSQL(spec, schema, (text) => {
      const t = mkThought(`Widget[${spec.id}]`, "sql", text);
      thoughts.push(t);
      config.writer?.({ type: EventType.CUSTOM, name: "thought", value: t, timestamp: Date.now() });
    });
  } catch (err) {
    const w: WidgetState = { spec, status: "error", error: String(err) };
    config.writer?.({ type: EventType.CUSTOM, name: "widget", value: w, timestamp: Date.now() });
    return { widget: w, thoughts };
  }

  // This app's one real, externally-visible tool call — full
  // TOOL_CALL_START → TOOL_CALL_END → TOOL_CALL_RESULT triad per the
  // real @ag-ui/core protocol (END signals args complete; RESULT carries
  // the output).
  const toolCallId = `sql-${spec.id}`;
  config.writer?.({
    type: EventType.TOOL_CALL_START,
    toolCallId,
    toolCallName: "execute_query",
    timestamp: Date.now(),
  });

  let rawData: Record<string, unknown>[] = [];
  try {
    rawData = await runReadOnlyQuery(sql);
    config.writer?.({ type: EventType.TOOL_CALL_END, toolCallId, timestamp: Date.now() });
    config.writer?.({
      type: EventType.TOOL_CALL_RESULT,
      messageId: crypto.randomUUID(),
      toolCallId,
      content: JSON.stringify({ rows: rawData.length }),
      role: "tool",
      timestamp: Date.now(),
    });
  } catch (err) {
    const w: WidgetState = { spec, status: "error", sql, error: String(err) };
    config.writer?.({ type: EventType.CUSTOM, name: "widget", value: w, timestamp: Date.now() });
    return { widget: w, thoughts };
  }

  config.writer?.({
    type: EventType.CUSTOM,
    name: "widget",
    value: { spec, status: "building", sql, rawData },
    timestamp: Date.now(),
  });

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
      echartsOption = buildEChartsOption(spec.chartType, rawData, spec) ?? undefined;
    }
  } catch {
    /* partial build ok */
  }

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
  config.writer?.({ type: EventType.CUSTOM, name: "widget", value: base, timestamp: Date.now() });

  const insight = await generateInsight(spec, rawData, (text) => {
    const t = mkThought(`Widget[${spec.id}]`, "insight", text);
    thoughts.push(t);
    config.writer?.({ type: EventType.CUSTOM, name: "thought", value: t, timestamp: Date.now() });
  }).catch(() => "");

  const w: WidgetState = insight ? { ...base, insight } : base;
  if (insight) config.writer?.({ type: EventType.CUSTOM, name: "widget", value: w, timestamp: Date.now() });

  return { widget: w, thoughts };
}

async function sqlFanOutNode(
  state: State,
  config: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  config.writer?.({ type: EventType.STEP_STARTED, stepName: "sql_fan_out", timestamp: Date.now() });

  const widgets: WidgetState[] = [];
  const allThoughts: AgentThought[] = [];

  // Build widgets SEQUENTIALLY. Both SQL-gen and insight-gen are LLM-bound and
  // there is exactly ONE global LLM worker, so they serialize on it regardless.
  const specs = state.plan?.widgets ?? [];
  for (const spec of specs) {
    const { widget, thoughts } = await buildWidget(state, config, spec);
    widgets.push(widget);
    allThoughts.push(...thoughts);
  }

  return { widgets, thoughts: allThoughts };
}

async function narratorNode(
  state: State,
  config: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  config.writer?.({ type: EventType.STEP_STARTED, stepName: "narrator", timestamp: Date.now() });
  const thoughts: AgentThought[] = [];

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

  const t = mkThought("NarratorAgent", "ok", "Executive narrative ready");
  thoughts.push(t);
  config.writer?.({ type: EventType.CUSTOM, name: "thought", value: t, timestamp: Date.now() });

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
      if (state.approved || (state.critiqueCount ?? 0) >= 3) return "sql_fan_out";
      return "revise";
    },
    { sql_fan_out: "sql_fan_out", revise: "revise" },
  );

  g.addEdge("revise", "critique");
  g.addEdge("sql_fan_out", "narrator");
  g.addEdge("narrator", END);

  // No `interruptBefore`: the `human_interrupt` node runs, THEN its dynamic
  // `interrupt()` pauses the graph. `interruptBefore` would have skipped the
  // node body entirely.
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
  resume: (decision: "approve" | "revise", plan?: DashboardPlan) => Promise<void>;
  dispose: () => void;
}

type GraphInput = Parameters<ReturnType<typeof buildGraph>["stream"]>[0];

/**
 * Drive the graph to completion (or to the first interrupt). Consumes
 * graph.stream() with streamMode ["updates", "custom"] — LangGraph's own
 * combined streaming mode — and dispatches to the caller's callbacks
 * directly from the chunks it yields. No sink registry: this function has
 * the callbacks in closure already, since it's the one place watching the
 * stream.
 */
async function drive(
  graph: ReturnType<typeof buildGraph>,
  input: GraphInput,
  config: { configurable: { thread_id: string } },
  opts: PipelineOptions,
  ids: { threadId: string; runId: string },
): Promise<"interrupted" | "done"> {
  try {
    const stream = await graph.stream(input, {
      ...config,
      streamMode: ["updates", "custom"],
    });

    for await (const [mode, payload] of stream) {
      if (mode === "custom") {
        const event = payload as AGUIEvent;
        if (event.type === EventType.CUSTOM && event.name === "widget") {
          // Dispatch-only: WidgetState embeds rawData (potentially hundreds
          // of rows per widget). No projection reads widget events, so
          // publishing them would only bloat the append-only log and the
          // store's eventTicker.
          opts.onWidget(event.value as WidgetState);
          continue;
        }
        publishEvent(event);
        if (event.type === EventType.CUSTOM && event.name === "thought") {
          opts.onThought(event.value as AgentThought);
        }
        continue;
      }

      // mode === "updates": payload is { [nodeName]: Partial<State> }
      for (const [nodeName, update] of Object.entries(payload as Record<string, Partial<State>>)) {
        publishEvent({ type: EventType.STEP_FINISHED, stepName: nodeName, timestamp: Date.now() });

        if (update.plan) {
          opts.onPlan(update.plan);
          publishEvent({
            type: EventType.STATE_SNAPSHOT,
            snapshot: { plan: update.plan },
            timestamp: Date.now(),
          });
        }
        if (update.narrative) opts.onNarrative(update.narrative);
      }
    }
  } catch (err) {
    if (!isGraphInterrupt(err)) {
      // Without this, buildTraceTree's RUN_ERROR branch is dead code and a
      // failed run leaves its trace nodes "running" forever.
      publishEvent({ type: EventType.RUN_ERROR, message: String(err), timestamp: Date.now() });
      opts.onError?.(String(err));
      throw err;
    }
  }

  // Interrupt payload read natively off the state snapshot. Path verified
  // against @langchain/langgraph's own docs: the value passed to interrupt()
  // "will be available in task.interrupts[].value".
  const snapshot = await graph.getState(config);
  if (snapshot.next && snapshot.next.length > 0) {
    const pending = snapshot.tasks?.[0]?.interrupts?.[0]?.value as
      | { reason: string; plan: DashboardPlan }
      | undefined;
    if (pending) {
      opts.onInterrupt(pending.reason, pending.plan);
      // Protocol-native interrupt signal (@ag-ui/core ≥0.0.5x):
      // RUN_FINISHED with outcome { type: "interrupt", interrupts: [...] }.
      publishEvent({
        type: EventType.RUN_FINISHED,
        threadId: ids.threadId,
        runId: ids.runId,
        outcome: {
          type: "interrupt",
          interrupts: [{ id: crypto.randomUUID(), reason: pending.reason }],
        },
        timestamp: Date.now(),
      });
    }
    return "interrupted";
  }

  opts.onDone();
  return "done";
}

export async function runPipeline(opts: PipelineOptions): Promise<PipelineHandle> {
  const threadId = opts.threadId ?? crypto.randomUUID();
  const runId = crypto.randomUUID();
  const graph = getGraph();

  publishEvent({ type: EventType.RUN_STARTED, threadId, runId, timestamp: Date.now() });

  const config = { configurable: { thread_id: threadId } };

  void drive(graph, { threadId, tableName: opts.tableName }, config, opts, { threadId, runId })
    .then((result) => {
      if (result === "done") {
        publishEvent({
          type: EventType.RUN_FINISHED,
          threadId,
          runId,
          outcome: { type: "success" },
          timestamp: Date.now(),
        });
      }
    })
    .catch(() => {});

  return {
    threadId,
    resume: async (decision, plan) => {
      const result = await drive(
        graph,
        new Command({ resume: { action: decision, plan } }),
        config,
        opts,
        { threadId, runId },
      );
      if (result === "done") {
        publishEvent({
          type: EventType.RUN_FINISHED,
          threadId,
          runId,
          outcome: { type: "success" },
          timestamp: Date.now(),
        });
      }
    },
    dispose: () => {
      // No sink registry to clean up anymore — nothing to do.
    },
  };
}
