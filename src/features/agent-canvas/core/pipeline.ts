"use client";
/**
 * AgentPipeline — orchestrates the full multi-agent dashboard build.
 * Phase order: Schema → Plan → (parallel) per-widget SQL+Chart+Insight
 */

import { analyzeSchema } from "./schema";
import { buildPlan } from "./planner";
import { generateSQL, generateInsight } from "./sql";
import { buildEChartsOption, buildKPICards, buildTableData } from "./charts";
import { runQuery } from "@/platform/duckdb/duckdb";
import type {
  AgentThought,
  DataSchema,
  DashboardPlan,
  PipelineCallback,
  PipelineEvent,
  ThoughtKind,
  WidgetSpec,
  WidgetState,
} from "./types";

// ─── Thought Helpers ──────────────────────────────────────────────────────────

let _thoughtSeq = 0;

function thought(agent: string, kind: ThoughtKind, text: string): AgentThought {
  return { id: `t${++_thoughtSeq}`, agent, kind, text, ts: Date.now() };
}

function emit(cb: PipelineCallback, event: PipelineEvent) {
  cb(event);
}

function think(
  cb: PipelineCallback,
  agent: string,
  kind: ThoughtKind,
  text: string,
) {
  emit(cb, { kind: "thought", thought: thought(agent, kind, text) });
}

// ─── Widget Builder ───────────────────────────────────────────────────────────

async function buildWidget(
  spec: WidgetSpec,
  schema: DataSchema,
  cb: PipelineCallback,
): Promise<WidgetState> {
  const agentId = `Widget[${spec.id}]`;

  // Mark querying
  emit(cb, {
    kind: "widget-update",
    widget: { spec, status: "querying" },
  });

  // 1. SQL generation
  let sql = "";
  try {
    sql = await generateSQL(spec, schema, (text) =>
      think(cb, agentId, "sql", text),
    );
    think(cb, agentId, "sql", `SQL:\n${sql}`);
  } catch (err) {
    const msg = `SQL gen failed: ${String(err)}`;
    think(cb, agentId, "err", msg);
    emit(cb, {
      kind: "widget-update",
      widget: { spec, status: "error", error: msg },
    });
    return { spec, status: "error", error: msg };
  }

  // 2. Execute SQL
  let rawData: Record<string, unknown>[] = [];
  try {
    rawData = await runQuery(sql);
    think(cb, agentId, "exec", `Query returned ${rawData.length} rows`);
  } catch (err) {
    const msg = `Query failed: ${String(err)}`;
    think(cb, agentId, "warn", `${msg} — widget shows error`);
    emit(cb, {
      kind: "widget-update",
      widget: { spec, status: "error", sql, error: msg },
    });
    return { spec, status: "error", sql, error: msg };
  }

  // Mark building
  emit(cb, {
    kind: "widget-update",
    widget: { spec, status: "building", sql, rawData },
  });

  // 3. Build chart/table/kpi
  let echartsOption: Record<string, unknown> | undefined;
  let kpis: WidgetState["kpis"];
  let tableHeaders: string[] | undefined;
  let tableRows: string[][] | undefined;

  try {
    if (spec.chartType === "kpi-grid") {
      kpis = buildKPICards(rawData[0] ?? {});
      think(cb, agentId, "chart", `Built ${kpis.length} KPI cards`);
    } else if (spec.chartType === "data-table") {
      const td = buildTableData(rawData);
      tableHeaders = td.headers;
      tableRows = td.rows;
      think(
        cb,
        agentId,
        "chart",
        `Table: ${tableHeaders.length} cols × ${tableRows.length} rows`,
      );
    } else {
      echartsOption =
        buildEChartsOption(spec.chartType, rawData, spec) ?? undefined;
      think(cb, agentId, "chart", `ECharts option built (${spec.chartType})`);
    }
  } catch (err) {
    think(cb, agentId, "warn", `Chart build warn: ${String(err)}`);
  }

  // 4. Insight (fire-and-forget, doesn't block widget render)
  let insight = "";
  generateInsight(spec, rawData, (text) => think(cb, agentId, "insight", text))
    .then((ins) => {
      if (ins) {
        insight = ins;
        emit(cb, {
          kind: "widget-update",
          widget: {
            spec,
            status: "done",
            sql,
            rawData,
            echartsOption,
            kpis,
            tableHeaders,
            tableRows,
            insight,
          },
        });
      }
    })
    .catch(() => {});

  const state: WidgetState = {
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

  emit(cb, { kind: "widget-update", widget: state });
  return state;
}

// ─── Main Pipeline ────────────────────────────────────────────────────────────

export interface PipelineOptions {
  /** Max widgets to build in parallel (default 3) */
  concurrency?: number;
}

export async function runPipeline(
  tableName: string,
  cb: PipelineCallback,
  opts: PipelineOptions = {},
): Promise<void> {
  const concurrency = opts.concurrency ?? 3;

  try {
    // ── Phase 1: Schema Analysis ──────────────────────────────────────────────
    think(cb, "SchemaAgent", "think", `Profiling table "${tableName}"…`);
    const schema: DataSchema = await analyzeSchema(tableName, (text) =>
      think(cb, "SchemaAgent", "think", text),
    );
    think(
      cb,
      "SchemaAgent",
      "ok",
      `Schema ready: category=${schema.category}, ${schema.dimensions.length} dims, ${schema.metrics.length} metrics`,
    );

    // ── Phase 2: Dashboard Planning ───────────────────────────────────────────
    think(cb, "PlannerAgent", "plan", "Building dashboard plan…");
    const plan: DashboardPlan = await buildPlan(schema, (text) =>
      think(cb, "PlannerAgent", "plan", text),
    );
    think(
      cb,
      "PlannerAgent",
      "ok",
      `Plan: "${plan.title}" — ${plan.widgets.length} widgets`,
    );
    emit(cb, { kind: "plan", plan });

    // Seed all widgets as pending
    for (const spec of plan.widgets) {
      emit(cb, { kind: "widget-update", widget: { spec, status: "pending" } });
    }

    // ── Phase 3: Widget Build Loop (bounded concurrency) ───────────────────────
    think(
      cb,
      "BuildOrchestrator",
      "think",
      `Building ${plan.widgets.length} widgets (concurrency=${concurrency})…`,
    );

    const queue = [...plan.widgets];
    const active: Promise<void>[] = [];

    async function processNext(): Promise<void> {
      const spec = queue.shift();
      if (!spec) return;
      think(
        cb,
        "BuildOrchestrator",
        "think",
        `Starting widget "${spec.title}" (${spec.chartType})`,
      );
      await buildWidget(spec, schema, cb);
    }

    // Fill up to concurrency
    while (queue.length > 0 && active.length < concurrency) {
      const p = processNext().then(async () => {
        // When one finishes, start the next
        while (queue.length > 0) {
          await processNext();
        }
      });
      active.push(p);
    }

    await Promise.all(active);

    think(
      cb,
      "BuildOrchestrator",
      "ok",
      `All ${plan.widgets.length} widgets built`,
    );
    emit(cb, { kind: "done" });
  } catch (err) {
    const msg = String(err);
    emit(cb, { kind: "error", message: msg });
  }
}
