"use client";
/**
 * LangGraph StateGraph v3 — full agentic pipeline.
 *
 * Graph topology:
 *   START → schema_node → react_sql_loop → planner_node
 *         → [INTERRUPT: human review]
 *         → critique_node ←┐ (up to 3 cycles)
 *         → revise_node ───┘
 *         → sql_fan_out (parallel via Send)
 *         → narrator_node → END
 *
 * Emits AG-UI events via publishEvent().
 */

import {
  StateGraph,
  Annotation,
  MemorySaver,
  END,
  START,
  interrupt,
} from "@langchain/langgraph";
import { analyzeSchema } from "./schema";
import { buildPlan } from "./planner";
import { generateSQL, generateInsight } from "./sql";
import { buildEChartsOption, buildKPICards, buildTableData } from "./charts";
import { runQuery } from "@/platform/duckdb/duckdb";
import { publishEvent, buildTraceTree } from "./event-bus";
import { makeCtx, makeEvent } from "./ag-ui-types";
import type { AGUIThreadContext } from "./ag-ui-types";
import type {
  DataSchema,
  DashboardPlan,
  WidgetSpec,
  WidgetState,
  AgentThought,
  ThoughtKind,
} from "./types";

// ─── Graph state schema ───────────────────────────────────────────────────────

const AgentState = Annotation.Root({
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
  ctx: Annotation<AGUIThreadContext | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  onWidget: Annotation<((w: WidgetState) => void) | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  onThought: Annotation<((t: AgentThought) => void) | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  onPlan: Annotation<((p: DashboardPlan) => void) | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  onNarrative: Annotation<((n: string) => void) | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  onInterrupt: Annotation<((reason: string, payload: unknown) => void) | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  onDone: Annotation<(() => void) | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
});

type State = typeof AgentState.State;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  state.onThought?.(t);
  if (state.ctx) {
    publishEvent(
      makeEvent(state.ctx, {
        type: "TEXT_MESSAGE_CONTENT",
        delta: `[${agent}] ${text}`,
      }),
    );
  }
  return t;
}

function emitStepStart(state: State, nodeName: string) {
  if (!state.ctx) return;
  publishEvent(
    makeEvent(state.ctx, { type: "STEP_STARTED", nodeName, phase: nodeName }),
  );
}

function emitStepEnd(state: State, nodeName: string, duration: number) {
  if (!state.ctx) return;
  publishEvent(
    makeEvent(state.ctx, { type: "STEP_FINISHED", nodeName, duration }),
  );
}

// ─── Nodes ────────────────────────────────────────────────────────────────────

async function schemaNode(state: State): Promise<Partial<State>> {
  const t0 = Date.now();
  emitStepStart(state, "schema");
  const thoughts: AgentThought[] = [];

  const schema = await analyzeSchema(state.tableName, (text) => {
    const t = emitThought(state, "SchemaAgent", "think", text);
    thoughts.push(t);
  });

  const t = emitThought(
    state,
    "SchemaAgent",
    "ok",
    `Schema ready: ${schema.category} | ${schema.dimensions.length} dims | ${schema.metrics.length} metrics`,
  );
  thoughts.push(t);
  emitStepEnd(state, "schema", Date.now() - t0);
  return { schema, thoughts };
}

async function reactSqlLoopNode(state: State): Promise<Partial<State>> {
  const t0 = Date.now();
  emitStepStart(state, "react_sql_loop");
  const thoughts: AgentThought[] = [];
  const schema = state.schema!;

  // ReAct: up to 6 exploration queries
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
      if (state.ctx) {
        publishEvent(
          makeEvent(state.ctx, {
            type: "TOOL_CALL_START",
            toolCallId: `explore-${Date.now()}`,
            toolName: "query_data",
            parentNode: "react_sql_loop",
          }),
        );
      }
      const rows = await runQuery(sql);
      const t = emitThought(
        state,
        "ReActAgent",
        "exec",
        `query_data → ${rows.length} rows`,
      );
      thoughts.push(t);
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

  const plan = await buildPlan(state.schema!, (text) => {
    const t = emitThought(state, "PlannerAgent", "plan", text);
    thoughts.push(t);
  });

  state.onPlan?.(plan);
  if (state.ctx) {
    publishEvent(
      makeEvent(state.ctx, {
        type: "STATE_SNAPSHOT",
        snapshot: { plan },
      }),
    );
  }

  const t = emitThought(
    state,
    "PlannerAgent",
    "ok",
    `Plan: "${plan.title}" — ${plan.widgets.length} widgets`,
  );
  thoughts.push(t);
  emitStepEnd(state, "planner", Date.now() - t0);
  return { plan, thoughts };
}

async function humanInterruptNode(state: State): Promise<Partial<State>> {
  // Pause graph for human review
  const plan = state.plan!;
  state.onInterrupt?.("plan-review", plan);
  if (state.ctx) {
    publishEvent(
      makeEvent(state.ctx, {
        type: "INTERRUPT",
        reason: "plan-review",
        payload: plan,
      }),
    );
  }

  // LangGraph interrupt() — graph pauses here until resumed
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
    // Max critiques reached → approve
    emitStepEnd(state, "critique", Date.now() - t0);
    return { approved: true, critiqueCount: count, thoughts };
  }

  // Simple rule-based critique
  const plan = state.plan!;
  const issues: string[] = [];

  if (plan.widgets.length < 3)
    issues.push("Too few widgets — add more coverage");
  if (!plan.widgets.some((w) => w.chartType === "kpi-grid"))
    issues.push("Missing KPI overview widget");
  if (!plan.widgets.some((w) => ["bar", "line", "area"].includes(w.chartType)))
    issues.push("Add at least one trend chart");

  if (issues.length === 0) {
    const t = emitThought(
      state,
      "CritiqueAgent",
      "ok",
      "Plan passes quality check",
    );
    thoughts.push(t);
    emitStepEnd(state, "critique", Date.now() - t0);
    return { approved: true, critiqueCount: count + 1, thoughts };
  }

  const t = emitThought(
    state,
    "CritiqueAgent",
    "warn",
    `Issues: ${issues.join("; ")}`,
  );
  thoughts.push(t);
  emitStepEnd(state, "critique", Date.now() - t0);
  return { approved: false, critiqueCount: count + 1, thoughts };
}

async function reviseNode(state: State): Promise<Partial<State>> {
  const t0 = Date.now();
  emitStepStart(state, "revise");
  const thoughts: AgentThought[] = [];
  const plan = state.plan!;
  const schema = state.schema!;

  // Auto-revise: ensure KPI grid + at least one bar chart
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

  const t = emitThought(
    state,
    "ReviseAgent",
    "ok",
    `Revised plan: +${additions.length} widgets`,
  );
  thoughts.push(t);
  state.onPlan?.(revised);
  emitStepEnd(state, "revise", Date.now() - t0);
  return { plan: revised, thoughts };
}

async function buildWidgetNode(
  state: State,
  spec: WidgetSpec,
): Promise<Partial<State>> {
  const schema = state.schema!;
  const thoughts: AgentThought[] = [];

  // Mark querying
  state.onWidget?.({ spec, status: "querying" });

  // SQL generation
  let sql = "";
  try {
    sql = await generateSQL(spec, schema, (text) => {
      const t = emitThought(state, `Widget[${spec.id}]`, "sql", text);
      thoughts.push(t);
    });
  } catch (err) {
    const w: WidgetState = { spec, status: "error", error: String(err) };
    state.onWidget?.(w);
    return { widgets: [...state.widgets, w], thoughts };
  }

  // Execute
  let rawData: Record<string, unknown>[] = [];
  try {
    rawData = await runQuery(sql);
    if (state.ctx) {
      publishEvent(
        makeEvent(state.ctx, {
          type: "TOOL_CALL_END",
          toolCallId: `sql-${spec.id}`,
          result: { rows: rawData.length },
        }),
      );
    }
  } catch (err) {
    const w: WidgetState = { spec, status: "error", sql, error: String(err) };
    state.onWidget?.(w);
    return { widgets: [...state.widgets, w], thoughts };
  }

  // Build chart
  state.onWidget?.({ spec, status: "building", sql, rawData });

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

  // Insight
  let insight = "";
  generateInsight(spec, rawData, (text) => {
    const t = emitThought(state, `Widget[${spec.id}]`, "insight", text);
    thoughts.push(t);
  })
    .then((ins) => {
      if (ins) {
        insight = ins;
        state.onWidget?.({
          spec,
          status: "done",
          sql,
          rawData,
          echartsOption,
          kpis,
          tableHeaders,
          tableRows,
          insight,
        });
      }
    })
    .catch(() => {});

  const w: WidgetState = {
    spec,
    status: "done",
    sql,
    rawData,
    echartsOption,
    kpis,
    tableHeaders,
    tableRows,
    insight,
  };
  state.onWidget?.(w);
  return { widgets: [...state.widgets, w], thoughts };
}

async function sqlFanOutNode(state: State): Promise<Partial<State>> {
  const t0 = Date.now();
  emitStepStart(state, "sql_fan_out");

  const widgets: WidgetState[] = [];
  const allThoughts: AgentThought[] = [];

  // Build all widgets in parallel (concurrency 3)
  const specs = state.plan?.widgets ?? [];
  const queue = [...specs];
  const CONC = 3;

  const tasks: Promise<void>[] = [];

  async function processOne(spec: WidgetSpec) {
    const result = await buildWidgetNode(state, spec);
    if (result.widgets) widgets.push(...result.widgets);
    if (result.thoughts) allThoughts.push(...result.thoughts);
  }

  while (queue.length) {
    const batch = queue.splice(0, CONC);
    await Promise.all(batch.map(processOne));
  }

  void tasks;
  emitStepEnd(state, "sql_fan_out", Date.now() - t0);
  return { widgets, thoughts: allThoughts };
}

async function narratorNode(state: State): Promise<Partial<State>> {
  const t0 = Date.now();
  emitStepStart(state, "narrator");
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

  state.onNarrative?.(summary);
  const t = emitThought(
    state,
    "NarratorAgent",
    "ok",
    "Executive narrative ready",
  );
  thoughts.push(t);

  if (state.ctx) {
    publishEvent(
      makeEvent(state.ctx, {
        type: "RUN_FINISHED",
        totalTokens: 0,
        totalDuration: Date.now() - t0,
      }),
    );
  }

  state.onDone?.();
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

  return g.compile({ checkpointer, interruptBefore: ["human_interrupt"] });
}

let _graph: ReturnType<typeof buildGraph> | null = null;

function getGraph() {
  if (!_graph) _graph = buildGraph();
  return _graph;
}

// ─── Public runner ────────────────────────────────────────────────────────────

export interface PipelineV3Options {
  tableName: string;
  model: string;
  onWidget: (w: WidgetState) => void;
  onThought: (t: AgentThought) => void;
  onPlan: (p: DashboardPlan) => void;
  onNarrative: (n: string) => void;
  onInterrupt: (reason: string, payload: unknown) => void;
  onDone: () => void;
  threadId?: string;
}

export interface PipelineV3Handle {
  threadId: string;
  resume: (
    decision: "approve" | "revise",
    plan?: DashboardPlan,
  ) => Promise<void>;
}

export async function runPipelineV3(
  opts: PipelineV3Options,
): Promise<PipelineV3Handle> {
  const ctx = makeCtx(opts.model);
  const threadId = opts.threadId ?? ctx.threadId;
  const graph = getGraph();

  publishEvent(
    makeEvent(ctx, {
      type: "RUN_STARTED",
      model: opts.model,
      input: { tableName: opts.tableName },
    }),
  );

  const config = { configurable: { thread_id: threadId } };

  const input: Partial<typeof AgentState.State> = {
    tableName: opts.tableName,
    ctx,
    onWidget: opts.onWidget,
    onThought: opts.onThought,
    onPlan: opts.onPlan,
    onNarrative: opts.onNarrative,
    onInterrupt: opts.onInterrupt,
    onDone: opts.onDone,
  };

  // Run until first interrupt (plan-review)
  void graph.invoke(input, config).catch(console.error);

  return {
    threadId,
    resume: async (decision, plan) => {
      await graph.invoke(
        {
          ...input,
          approved: decision === "approve",
          plan: plan ?? undefined,
        },
        config,
      );
    },
  };
}
