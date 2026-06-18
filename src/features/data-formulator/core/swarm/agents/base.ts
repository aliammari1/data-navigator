"use client";

/**
 * Moudir AI — shared agent contract.
 *
 * Every swarm agent is an AI-only function over the serialized inference
 * scheduler. There are NO rule-based fallbacks: agents either return a
 * model-produced result or throw, and the orchestrator surfaces the failure.
 *
 * This module is the single source of truth for agent signatures, the shared
 * Zod enums, the dataset grounding helpers, and the chart-artifact runner that
 * turns a ChartSpec into a queried, renderable artifact. The leaf agents and the
 * orchestrator both depend on it, so their shapes can never drift.
 */

import { z } from "zod";
import type { ChartType } from "@/features/agent-canvas/core/types";
import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import { genId } from "../../helpers";
import { sanitizeJsonValue } from "../../json";
import { buildSQL } from "../../sql";
import type { ChartSpec, ColumnInfo, QueryResult } from "../../types";
import type { InferenceScheduler } from "../scheduler";
import type {
  AgentTask,
  Artifact,
  CriticVerdict,
  SwarmContext,
  SwarmPlan,
  SwarmResult,
} from "../types";

// ─── Chart vocabulary (the renderer's supported marks) ─────────────────────────

export const ALLOWED_CHART_TYPES = [
  "bar",
  "horizontal-bar",
  "stacked-bar",
  "line",
  "area",
  "multi-line",
  "pie",
  "donut",
  "scatter",
  "bubble",
  "heatmap",
  "treemap",
  "radar",
  "gauge",
  "funnel",
] as const satisfies readonly ChartType[];

export const chartTypeEnum = z.enum(
  ALLOWED_CHART_TYPES as unknown as [string, ...string[]],
);

export const channelEnum = z.enum(["x", "y", "color", "size"]);
export const aggregateEnum = z.enum([
  "none",
  "sum",
  "avg",
  "count",
  "min",
  "max",
  "median",
]);

export function coerceChartType(value: string): ChartType {
  return (ALLOWED_CHART_TYPES as readonly string[]).includes(value)
    ? (value as ChartType)
    : "bar";
}

// ─── Dataset grounding ─────────────────────────────────────────────────────────

export function schemaSummary(columns: ColumnInfo[]): string {
  return columns
    .map((c) => `- ${c.name} (${c.type}${c.derived ? ", derived" : ""})`)
    .join("\n");
}

/**
 * The shared grounding block every agent prepends to its user prompt. Keeps the
 * model anchored to the real table, columns, and a tiny row sample — never the
 * full dataset.
 */
export function contextBlock(ctx: SwarmContext): string {
  const sample = ctx.rowSample.slice(0, 5);
  return [
    `Dataset: ${ctx.datasetName}`,
    `DuckDB view (query this exact name): "${ctx.tableName}"`,
    `Row count: ${ctx.rowCount.toLocaleString()}`,
    "Columns:",
    schemaSummary(ctx.columns),
    sample.length ? `Sample rows (JSON):\n${safeStringify(sample)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(sanitizeJsonValue(value));
  } catch {
    return "[]";
  }
}

// ─── Chart artifact runner (shared by the chart agent & dashboards) ────────────

/** Turn a ChartSpec into a queried, renderable chart Artifact (read-only SQL). */
export async function runChartArtifact(
  scheduler: InferenceScheduler,
  ctx: SwarmContext,
  taskId: string,
  spec: ChartSpec,
): Promise<Artifact> {
  const sql = buildSQL(spec, ctx.tableName);
  const rows = (await scheduler.io(() => runReadOnlyQuery(sql))) as Record<
    string,
    unknown
  >[];
  if (!rows.length) {
    throw new Error(`Chart "${spec.title}" returned no rows.`);
  }
  return {
    kind: "chart",
    id: genId(),
    taskId,
    title: spec.title,
    spec,
    rows: sanitizeJsonValue(rows) as Record<string, unknown>[],
    sql,
  };
}

/** Run an arbitrary read-only SELECT and wrap it as a table Artifact. */
export async function runTableArtifact(
  scheduler: InferenceScheduler,
  taskId: string,
  title: string,
  sql: string,
): Promise<Artifact> {
  const rows = (await scheduler.io(() => runReadOnlyQuery(sql))) as Record<
    string,
    unknown
  >[];
  return {
    kind: "table",
    id: genId(),
    taskId,
    title,
    rows: sanitizeJsonValue(rows) as Record<string, unknown>[],
    sql,
  };
}

/**
 * Compact, model-readable evidence built from REAL artifact data (not just
 * titles). Downstream agents (narrative, synthesizer) ground their claims in
 * this, so the answer reflects actual queried numbers instead of the schema.
 */
export function artifactEvidence(artifacts: Artifact[]): string {
  if (!artifacts.length) {
    return "Findings: (none — no data was successfully retrieved, so do not invent numbers)";
  }
  const blocks = artifacts.map((a, i) => {
    if (a.kind === "table") {
      return `${i + 1}. TABLE "${a.title}" — ${a.rows.length} rows:\n${safeStringify(a.rows.slice(0, 8))}`;
    }
    if (a.kind === "chart") {
      return `${i + 1}. CHART "${a.title}" (${a.spec.type}) — data:\n${safeStringify(a.rows.slice(0, 8))}`;
    }
    if (a.kind === "kpi") {
      return `${i + 1}. KPI "${a.title}": ${a.label} = ${a.value}${
        a.delta != null ? ` (delta ${a.delta})` : ""
      }`;
    }
    return `${i + 1}. NOTE "${a.title}": ${a.body}`;
  });
  return [
    "Findings (REAL data — ground every claim strictly in these, cite the numbers):",
    ...blocks,
  ].join("\n\n");
}

/** Wrap an artifact's chart rows into the QueryResult shape FormulatorChart wants. */
export function chartArtifactToQueryResult(
  artifact: Extract<Artifact, { kind: "chart" }>,
): QueryResult {
  return {
    sql: artifact.sql ?? "",
    data: artifact.rows,
    duration: 0,
    rowCount: artifact.rows.length,
  };
}

// ─── Guardrails for AI-written SQL (read-only enforcement) ─────────────────────

const FORBIDDEN_SQL =
  /\b(insert|update|delete|drop|alter|create|attach|copy|pragma|truncate|replace|grant|revoke|vacuum|export|install|load)\b/i;

/**
 * Assert an AI-written statement is a single read-only SELECT/WITH. DuckDB is
 * opened read-only too, but this fails fast with a clear message and keeps the
 * model honest. NOT a heuristic answer path — purely a safety assertion.
 */
/**
 * Strip the wrapping the 1.5B model frequently adds around SQL — markdown code
 * fences, leading `--`/block comments, and trailing semicolons — so a valid
 * SELECT is not rejected merely because the model prefixed it with a comment or
 * fenced it. This only narrows toward the real statement; it never widens what
 * is permitted.
 */
export function sanitizeSql(sql: string): string {
  let s = sql.trim();
  const fence = s.match(/^```(?:sql)?\s*([\s\S]*?)\s*```$/i);
  if (fence?.[1]) s = fence[1].trim();
  s = s.replace(/^(\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)+/i, "").trim();
  s = s.replace(/;+\s*$/, "").trim();
  return s;
}

export function assertReadOnlySql(sql: string): string {
  const trimmed = sanitizeSql(sql);
  if (!/^\s*(select|with)\b/i.test(trimmed)) {
    throw new Error("AI SQL rejected: only SELECT/WITH queries are allowed.");
  }
  if (FORBIDDEN_SQL.test(trimmed)) {
    throw new Error("AI SQL rejected: contains a non-read-only keyword.");
  }
  if (trimmed.includes(";")) {
    throw new Error("AI SQL rejected: multiple statements are not allowed.");
  }
  return trimmed;
}

// ─── Agent signatures (the contract leaf agents implement) ─────────────────────

/** Outputs every worker agent returns. */
export interface WorkerOutput {
  artifacts: Artifact[];
  /** Optional prose the synthesizer folds into the final answer. */
  narrative?: string;
}

/** Inputs every worker agent receives. */
export interface WorkerInput {
  scheduler: InferenceScheduler;
  ctx: SwarmContext;
  task: AgentTask;
  /** Accepted artifacts produced by this task's dependencies. */
  inputs: Artifact[];
  /** Stream a token to this agent's live lane in the UI. */
  onToken?: (token: string) => void;
}

export type WorkerAgent = (input: WorkerInput) => Promise<WorkerOutput>;

export type PlannerAgent = (input: {
  scheduler: InferenceScheduler;
  ctx: SwarmContext;
  prompt: string;
  onToken?: (token: string) => void;
}) => Promise<SwarmPlan>;

export type CriticAgent = (input: {
  scheduler: InferenceScheduler;
  ctx: SwarmContext;
  task: AgentTask;
  artifacts: Artifact[];
  onToken?: (token: string) => void;
}) => Promise<CriticVerdict>;

export type SynthesizerAgent = (input: {
  scheduler: InferenceScheduler;
  ctx: SwarmContext;
  goal: string;
  artifacts: Artifact[];
  narratives: string[];
  onToken?: (token: string) => void;
}) => Promise<SwarmResult>;
