"use client";
/**
 * PlannerAgent — generates a DashboardPlan from a DataSchema.
 * Uses LLM when available; falls back to deterministic heuristics.
 */

import { chat, isLoaded, parseJSON } from "./llm";
import type { ChartType, DashboardPlan, DataSchema, WidgetSpec } from "./types";

// ─── Layout Helper ────────────────────────────────────────────────────────────

function gridPos(
  index: number,
  total: number,
  chartType: ChartType,
): { x: number; y: number; w: number; h: number } {
  const isWide = [
    "stacked-bar",
    "stacked-horizontal-bar",
    "multi-line",
    "heatmap",
    "data-table",
    "kpi-grid",
  ].includes(chartType);
  const isTall = ["treemap", "scatter", "heatmap"].includes(chartType);

  const w = isWide ? 12 : 6;
  const h = isTall ? 5 : chartType === "kpi-grid" ? 3 : 4;

  // Place in a simple flow (full-width first, then pairs)
  if (isWide) {
    const fullWidthBefore = Array.from({ length: index }, (_, i) => i).filter(
      (i) => i < index,
    ).length;
    return { x: 0, y: fullWidthBefore * h, w, h };
  }

  const col = index % 2;
  const row = Math.floor(index / 2);
  return { x: col * 6, y: row * h, w, h };
}

// ─── Fallback Rule-Based Planner ──────────────────────────────────────────────

function heuristicPlan(schema: DataSchema): DashboardPlan {
  const { tableName, dimensions, metrics, timeDims, category, rowCount } =
    schema;
  const specs: WidgetSpec[] = [];
  let idx = 0;

  // 1. KPI grid (always)
  if (metrics.length > 0) {
    specs.push({
      id: "kpi-grid",
      title: "Key Metrics Overview",
      chartType: "kpi-grid",
      sqlIntent: `Compute summary statistics: COUNT(*), SUM and AVG of each numeric column (${metrics.slice(0, 4).join(", ")})`,
      dimensions: [],
      metrics: metrics.slice(0, 5),
      position: gridPos(idx++, 10, "kpi-grid"),
    });
  }

  // 2. Time series (if temporal column exists)
  if (timeDims.length > 0 && metrics.length > 0) {
    const timeCol = timeDims[0];
    const metric = metrics[0];
    specs.push({
      id: "time-trend",
      title: `${metric} Over Time`,
      chartType: "area",
      sqlIntent: `Group by ${timeCol} (truncate to day or month), sum ${metric}, order by time ascending`,
      dimensions: [timeCol],
      metrics: [metric],
      position: gridPos(idx++, 10, "area"),
      reasoning: "Shows temporal trend",
    });
  }

  // 3. Distribution of top dimension
  if (dimensions.length > 0 && metrics.length > 0) {
    const dim = dimensions[0];
    const metric = metrics[0];
    specs.push({
      id: "bar-top-dim",
      title: `${metric} by ${dim}`,
      chartType:
        dimensions[0].toLowerCase().includes("region") || rowCount < 20
          ? "horizontal-bar"
          : "bar",
      sqlIntent: `Group by ${dim}, sum ${metric}, order desc, limit 15`,
      dimensions: [dim],
      metrics: [metric],
      position: gridPos(idx++, 10, "bar"),
      reasoning: "Top N breakdown",
    });
  }

  // 4. Second dimension breakdown (pie/donut)
  if (dimensions.length > 1 && metrics.length > 0) {
    const dim = dimensions[1];
    const metric = metrics[0];
    specs.push({
      id: "pie-second-dim",
      title: `Distribution by ${dim}`,
      chartType: "donut",
      sqlIntent: `Group by ${dim}, sum ${metric}, order desc, limit 10`,
      dimensions: [dim],
      metrics: [metric],
      position: gridPos(idx++, 10, "donut"),
    });
  }

  // 5. Category-specific extras
  if (category === "telecom") {
    specs.push({
      id: "status-breakdown",
      title: "Transaction Status Breakdown",
      chartType: "donut",
      sqlIntent:
        "Group by TRANSACTION_STATUS or status column, count records, show top 8 statuses",
      dimensions: dimensions
        .filter((d) => d.toLowerCase().includes("status"))
        .slice(0, 1),
      metrics: [],
      position: gridPos(idx++, 10, "donut"),
    });
  }

  if (category === "ecommerce") {
    specs.push({
      id: "funnel",
      title: "Conversion Funnel",
      chartType: "funnel",
      sqlIntent:
        "Show ordered stages/steps by count descending (e.g. visit > add-to-cart > checkout > purchase)",
      dimensions: dimensions.slice(0, 1),
      metrics: metrics.slice(0, 1),
      position: gridPos(idx++, 10, "funnel"),
    });
  }

  // 6. Scatter (if 2+ numeric cols)
  if (metrics.length >= 2) {
    specs.push({
      id: "scatter-correlation",
      title: `${metrics[0]} vs ${metrics[1]}`,
      chartType: "scatter",
      sqlIntent: `Select ${metrics[0]} and ${metrics[1]}${dimensions[0] ? `, ${dimensions[0]} as label` : ""}, limit 500`,
      dimensions: dimensions.slice(0, 1),
      metrics: metrics.slice(0, 2),
      position: gridPos(idx++, 10, "scatter"),
    });
  }

  // 7. Stacked bar (2 dimensions + 1 metric)
  if (dimensions.length >= 2 && metrics.length > 0) {
    specs.push({
      id: "stacked-bar",
      title: `${metrics[0]} by ${dimensions[0]} × ${dimensions[1]}`,
      chartType: "stacked-bar",
      sqlIntent: `Group by ${dimensions[0]} and ${dimensions[1]}, sum ${metrics[0]}, limit 12 for outer dim`,
      dimensions: dimensions.slice(0, 2),
      metrics: [metrics[0]],
      position: gridPos(idx++, 10, "stacked-bar"),
    });
  }

  // 8. Data table
  specs.push({
    id: "data-table",
    title: "Sample Data",
    chartType: "data-table",
    sqlIntent: `Select all columns, limit 30 rows, order by first metric desc if available`,
    dimensions: [],
    metrics: [],
    position: gridPos(idx++, 10, "data-table"),
  });

  return {
    title: `${schema.category.charAt(0).toUpperCase() + schema.category.slice(1)} Dashboard`,
    description: schema.summary,
    widgets: specs,
  };
}

// ─── LLM-Based Planner ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert data visualization engineer.
Given a dataset schema, create a diverse, insightful dashboard plan as JSON.
You MUST respond with VALID JSON only — no markdown, no explanation, no code fences.`;

function buildUserPrompt(schema: DataSchema): string {
  const colSummary = schema.columns
    .map(
      (c) =>
        `${c.name}:${c.semantic}(cardinality=${c.cardinality},nullRate=${(c.nullRate * 100).toFixed(0)}%)`,
    )
    .join(", ");

  return `
Dataset summary: "${schema.summary}"
Category: ${schema.category}
Rows: ${schema.rowCount.toLocaleString()}
Columns: ${colSummary}
Good GROUP-BY dimensions: ${schema.dimensions.join(", ") || "none"}
Good aggregation metrics: ${schema.metrics.join(", ") || "none"}
Temporal columns: ${schema.timeDims.join(", ") || "none"}

Create a dashboard with 6-9 widgets. Think about:
1. What KPIs summarise this data best?
2. What trends exist over time (if temporal columns exist)?
3. What categorical breakdowns are most insightful?
4. What correlations or comparisons should be shown?
5. What unusual patterns or concentrations exist?

Allowed chartType values: "bar","horizontal-bar","stacked-bar","line","area","multi-line","pie","donut","scatter","bubble","heatmap","treemap","radar","gauge","funnel","kpi-grid","data-table"

Position rules: 12-column grid, rowHeight=60px.
- kpi-grid: w=12, h=3
- full-width charts: w=12, h=4
- half-width charts: w=6, h=4
- Avoid overlap.

JSON schema:
{
  "title": "string",
  "description": "string",
  "widgets": [
    {
      "id": "unique-id",
      "title": "Widget title",
      "chartType": "bar",
      "sqlIntent": "Natural language: what SQL should compute. Be specific about GROUP BY, aggregation, ordering, LIMIT.",
      "dimensions": ["col_name"],
      "metrics": ["col_name"],
      "position": {"x":0,"y":0,"w":6,"h":4},
      "reasoning": "Why this chart"
    }
  ]
}
`;
}

// ─── Exported function ────────────────────────────────────────────────────────

export async function buildPlan(
  schema: DataSchema,
  emit: (text: string) => void,
): Promise<DashboardPlan> {
  if (!isLoaded()) {
    emit("LLM not loaded — using rule-based planner");
    const plan = heuristicPlan(schema);
    emit(`Rule-based plan ready: ${plan.widgets.length} widgets`);
    return plan;
  }

  emit("Sending schema to LLM planner…");

  try {
    const raw = await chat(SYSTEM_PROMPT, buildUserPrompt(schema), {
      maxTokens: 1800,
      temperature: 0.15,
    });

    emit("Parsing LLM response…");
    const parsed = parseJSON<DashboardPlan>(raw);

    // Validation + normalization
    if (!Array.isArray(parsed.widgets) || parsed.widgets.length === 0) {
      throw new Error("LLM returned plan with no widgets");
    }

    // Ensure each widget has all required fields
    const widgets: WidgetSpec[] = parsed.widgets.map((w, i) => ({
      id: String(w.id ?? `w${i}`),
      title: String(w.title ?? `Chart ${i + 1}`),
      chartType: (w.chartType as ChartType) ?? "bar",
      sqlIntent: String(w.sqlIntent ?? `Show data from ${schema.tableName}`),
      dimensions: Array.isArray(w.dimensions) ? w.dimensions.map(String) : [],
      metrics: Array.isArray(w.metrics) ? w.metrics.map(String) : [],
      position:
        w.position ?? gridPos(i, parsed.widgets.length, w.chartType ?? "bar"),
      reasoning: w.reasoning,
    }));

    emit(`LLM plan ready: ${widgets.length} widgets — "${parsed.title}"`);
    return {
      title: parsed.title ?? "Dashboard",
      description: parsed.description ?? schema.summary,
      widgets,
    };
  } catch (err) {
    emit(`LLM planner failed: ${String(err)} — falling back to heuristics`);
    const plan = heuristicPlan(schema);
    emit(`Fallback plan: ${plan.widgets.length} widgets`);
    return plan;
  }
}
