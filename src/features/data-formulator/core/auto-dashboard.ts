"use client";

/**
 * Auto-Dashboard Engine
 * Single natural language prompt → multi-widget bento grid dashboard.
 * Uses the multi-agent orchestration graph to plan, analyze, and generate
 * a complete dashboard with cross-filtering links.
 *
 * 2026 Pattern: Generative dashboards — AI designs the layout, picks charts,
 * writes queries, and generates insights in one shot.
 */

import { AgentGraph, type AgentTrace } from "./agent-graph";
import type { ChartSpec, ColumnInfo, QueryResult } from "./types";
import { buildSQL } from "./sql";
import { runQuery } from "@/platform/duckdb/duckdb";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DashboardWidget {
  id: string;
  type: "chart" | "kpi" | "table" | "text" | "filter";
  title: string;
  position: { x: number; y: number; w: number; h: number };
  chartSpec?: ChartSpec;
  queryResult?: QueryResult;
  kpiValue?: { value: number; label: string; delta?: number; deltaLabel?: string };
  textContent?: string;
  filterConfig?: { field: string; type: "dropdown" | "range" | "date" | "search" };
  // Cross-filtering: when this widget is filtered, these fields emit filter events
  filterSourceFields?: string[];
  // This widget listens to these fields for incoming filter events
  filterTargetFields?: string[];
}

export interface DashboardSpec {
  id: string;
  title: string;
  description: string;
  widgets: DashboardWidget[];
  layout: "bento" | "grid" | "free";
  globalFilters: Array<{ field: string; op: string; value: string }>;
  generatedAt: number;
  modelUsed: string;
  traceId?: string;
}

export interface DashboardGenerationRequest {
  prompt: string;
  tableName: string;
  columns: ColumnInfo[];
  schema: string;
  rowSample: Record<string, unknown>[];
  model: string;
  host?: string;
  threadId: string;
}

// ─── Dashboard Generator ──────────────────────────────────────────────────────

export async function generateDashboard(
  request: DashboardGenerationRequest,
  onTraceUpdate?: (trace: AgentTrace) => void,
): Promise<DashboardSpec> {
  const { prompt, tableName, columns, schema, rowSample, model, host, threadId } = request;

  // Step 1: Run the auto-dashboard agent graph. This feature is intentionally
  // AI-gated: if Ollama or the selected model is unavailable, the caller should
  // show a setup/error state instead of silently producing synthetic output.
  const graph = AgentGraph.createAutoDashboardGraph();
  const { AgentOrchestrator } = await import("./agent-graph");
  const orchestrator = new AgentOrchestrator({
    graph,
    model,
    host,
    onTraceUpdate,
  });

  const trace = await orchestrator.execute({
    messages: [{ role: "user", content: prompt }],
    context: {
      tableName,
      columns: columns.map((c) => ({ name: c.name, type: c.type, sample: [] })),
      schema,
      rowSample,
      userGoal: prompt,
      previousOutputs: {},
      threadId,
    },
  });

  const failedNode = trace.nodes.find((node) => node.status === "failed");
  if (trace.status !== "completed" || failedNode) {
    throw new Error(
      failedNode?.error
        ? `Ollama dashboard planning failed in ${failedNode.role}: ${failedNode.error}`
        : "Ollama dashboard planning did not complete.",
    );
  }

  // Step 2: Parse agent outputs into dashboard widgets
  const widgets: DashboardWidget[] = [];
  let widgetId = 0;

  // Extract chart specs from chartArchitect output
  const chartNode = trace.nodes.find((n) => n.role === "chartArchitect");
  const chartStructured = chartNode?.output?.structured as
    | { charts?: Array<Record<string, unknown>>; dashboardLayout?: { suggestedGrid?: string; priorityOrder?: string[] } }
    | undefined;
  const knownFields = new Set(columns.map((column) => column.name));

  if (chartStructured?.charts) {
    for (const chart of chartStructured.charts) {
      const chartSpec: ChartSpec = {
        id: `widget_${widgetId++}`,
        type: (chart.type as ChartSpec["type"]) ?? "bar",
        encodings: [],
        filters: [],
        limit: 100,
        title: String(chart.title ?? "Chart"),
      };

      // Convert encodings object to array
      const encMap = chart.encodings as Record<string, string> | undefined;
      if (encMap) {
        for (const [channel, field] of Object.entries(encMap)) {
          if (
            ["x", "y", "color", "size", "facet", "tooltip"].includes(channel) &&
            knownFields.has(String(field))
          ) {
            chartSpec.encodings.push({
              id: `enc_${Math.random().toString(36).slice(2, 7)}`,
              channel: channel as ChartSpec["encodings"][0]["channel"],
              field: String(field),
            });
          }
        }
      }

      if (chartSpec.encodings.length === 0) {
        continue;
      }

      // Execute the query for this chart
      let queryResult: QueryResult;
      try {
        const sql = buildSQL(chartSpec, tableName, columns);
        const data = await runQuery(sql);
        queryResult = { sql, data, duration: 0, rowCount: data.length };
      } catch {
        continue;
      }

      widgets.push({
        id: chartSpec.id,
        type: "chart",
        title: chartSpec.title,
        position: { x: 0, y: 0, w: 2, h: 2 },
        chartSpec,
        queryResult,
        filterSourceFields: chartSpec.encodings.map((e) => e.field),
      });
    }
  }

  // Render AI insight output as narrative cards. Do not synthesize KPI numbers
  // from prose; KPI values must come from validated SQL-backed outputs.
  const insightNode = trace.nodes.find((n) => n.role === "insightEngineer");
  const insightStructured = insightNode?.output?.structured as
    | { insights?: Array<{ title?: string; description?: string; severity?: string }>; narrative?: string }
    | undefined;

  if (insightStructured?.insights) {
    for (let i = 0; i < Math.min(insightStructured.insights.length, 4); i++) {
      const insight = insightStructured.insights[i];
      widgets.push({
        id: `widget_${widgetId++}`,
        type: "text",
        title: String(insight.title ?? "Insight"),
        position: { x: 0, y: 0, w: 2, h: 1 },
        textContent: String(insight.description ?? ""),
      });
    }
  }

  // Add narrative text widget
  if (insightStructured?.narrative) {
    widgets.push({
      id: `widget_${widgetId++}`,
      type: "text",
      title: "Executive Summary",
      position: { x: 0, y: 0, w: 2, h: 1 },
      textContent: String(insightStructured.narrative),
    });
  }

  if (widgets.length === 0) {
    throw new Error(
      "Ollama completed the dashboard run but returned no dashboard widgets.",
    );
  }

  if (widgets.every((widget) => widget.type !== "chart")) {
    throw new Error(
      "Ollama returned dashboard notes but no usable chart widget. Try a more specific dashboard goal.",
    );
  }

  const finalWidgets = computeBentoLayout(widgets);

  return {
    id: `dash_${Date.now()}`,
    title: `Dashboard: ${prompt.slice(0, 50)}`,
    description: prompt,
    widgets: finalWidgets,
    layout: "bento",
    globalFilters: [],
    generatedAt: Date.now(),
    modelUsed: model,
    traceId: trace.traceId,
  };
}

// ─── Bento Grid Layout Algorithm ──────────────────────────────────────────────

function computeBentoLayout(widgets: DashboardWidget[]): DashboardWidget[] {
  const gridCols = 4;
  const grid: boolean[][] = []; // grid[row][col] = occupied

  function isFree(row: number, col: number, w: number, h: number): boolean {
    for (let r = row; r < row + h; r++) {
      for (let c = col; c < col + w; c++) {
        if (grid[r]?.[c]) return false;
      }
    }
    return true;
  }

  function occupy(row: number, col: number, w: number, h: number) {
    for (let r = row; r < row + h; r++) {
      if (!grid[r]) grid[r] = [];
      for (let c = col; c < col + w; c++) {
        grid[r][c] = true;
      }
    }
  }

  function findSpot(w: number, h: number): { x: number; y: number } | null {
    for (let row = 0; row < 20; row++) {
      for (let col = 0; col <= gridCols - w; col++) {
        if (isFree(row, col, w, h)) {
          return { x: col, y: row };
        }
      }
    }
    return null;
  }

  // Sort widgets by importance: KPIs first, then charts, then text
  const sorted = [...widgets].sort((a, b) => {
    const priority = { kpi: 0, chart: 1, text: 2, table: 3, filter: 4 };
    return (priority[a.type] ?? 5) - (priority[b.type] ?? 5);
  });

  const placed: DashboardWidget[] = [];

  for (const widget of sorted) {
    // Determine default size based on type
    let w = widget.position.w;
    let h = widget.position.h;

    if (widget.type === "kpi") {
      w = 1;
      h = 1;
    } else if (widget.type === "chart") {
      w = 2;
      h = 2;
    } else if (widget.type === "text") {
      w = gridCols;
      h = 1;
    } else if (widget.type === "table") {
      w = gridCols;
      h = 2;
    } else if (widget.type === "filter") {
      w = 1;
      h = 1;
    }

    // First chart gets hero size (2x2 already), but if it's the first chart we can make it bigger
    const isFirstChart = placed.filter((p) => p.type === "chart").length === 0 && widget.type === "chart";
    if (isFirstChart) {
      w = 2;
      h = 2;
    }

    const spot = findSpot(w, h);
    if (spot) {
      occupy(spot.y, spot.x, w, h);
      placed.push({ ...widget, position: { x: spot.x, y: spot.y, w, h } });
    } else {
      // Fallback: place at next available single cell and expand grid
      const fallback = findSpot(1, 1);
      if (fallback) {
        occupy(fallback.y, fallback.x, 1, 1);
        placed.push({ ...widget, position: { x: fallback.x, y: fallback.y, w: 1, h: 1 } });
      }
    }
  }

  return placed;
}

// ─── Cross-Filtering Engine ───────────────────────────────────────────────────

export interface FilterEvent {
  sourceWidgetId: string;
  field: string;
  value: unknown;
  op: "equals" | "range" | "contains" | "in";
}

export class CrossFilterEngine {
  private listeners = new Map<string, Set<(event: FilterEvent) => void>>();

  subscribe(field: string, handler: (event: FilterEvent) => void): () => void {
    if (!this.listeners.has(field)) {
      this.listeners.set(field, new Set());
    }
    this.listeners.get(field)!.add(handler);
    return () => this.listeners.get(field)?.delete(handler);
  }

  emit(event: FilterEvent): void {
    const handlers = this.listeners.get(event.field);
    if (handlers) {
      handlers.forEach((h) => {
        try {
          h(event);
        } catch {
          // ignore handler errors
        }
      });
    }
  }
}

// ─── React Hook ───────────────────────────────────────────────────────────────

import { useCallback, useState } from "react";

export function useAutoDashboard() {
  const [dashboard, setDashboard] = useState<DashboardSpec | null>(null);
  const [generating, setGenerating] = useState(false);
  const [trace, setTrace] = useState<AgentTrace | null>(null);

  const generate = useCallback(
    async (request: DashboardGenerationRequest) => {
      setGenerating(true);
      setTrace(null);
      try {
        const spec = await generateDashboard(request, (t) => setTrace({ ...t }));
        setDashboard(spec);
        return spec;
      } finally {
        setGenerating(false);
      }
    },
    [],
  );

  return { dashboard, generating, trace, generate };
}
