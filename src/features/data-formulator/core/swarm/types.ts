/**
 * Moudir AI — Swarm runtime types.
 *
 * The data workbench is driven by an orchestrator-worker agent swarm, NOT by
 * rule-based keyword routing. A Planner agent decomposes the user's request into
 * specialized worker tasks; workers run through a single serialized inference
 * lane (see `scheduler.ts`) while their non-LLM work (DuckDB SQL, embeddings)
 * overlaps in a parallel IO lane. A Critic verifies outputs and a Synthesizer
 * composes the final answer.
 *
 * Everything here is AI-only and fails visibly: there are no heuristic fallbacks.
 */

import type { ChartSpec, ColumnInfo } from "../types";

/** The specialized roles in the swarm. */
export type AgentRole =
  | "planner" // decomposes the request into worker tasks
  | "query" // writes + runs DuckDB SQL, returns rows
  | "chart" // designs a ChartSpec for a question
  | "narrative" // writes the manager-facing narrative answer
  | "anomaly" // surfaces signals / outliers / risks
  | "critic" // adversarially verifies worker outputs
  | "synthesizer"; // composes the final cinematic result

/** High-level phase of a single swarm run — drives the cinematic UI. */
export type SwarmPhase =
  | "idle"
  | "planning" // planner is decomposing the request
  | "dispatching" // plan is ready, workers are being queued
  | "working" // workers are executing (thinking/streaming)
  | "verifying" // critic is checking outputs
  | "synthesizing" // synthesizer is composing the final answer
  | "done"
  | "failed";

/** Status of one agent task within a run. */
export type AgentStatus =
  | "queued" // waiting for dependencies / engine
  | "thinking" // dispatched, awaiting first token
  | "streaming" // emitting tokens
  | "running" // doing non-LLM work (SQL/embeddings)
  | "done"
  | "failed"
  | "skipped"; // dependency failed or critic dropped it

/**
 * A unit of work the planner emits. `dependsOn` lets the orchestrator run a DAG:
 * independent tasks overlap their IO, dependents wait for their inputs.
 */
export interface AgentTask {
  id: string;
  role: AgentRole;
  /** Short human label shown on the agent's lane in the UI. */
  title: string;
  /** The focused instruction the worker agent receives. */
  instruction: string;
  /** Task ids whose outputs this task needs before it can run. */
  dependsOn: string[];
}

/** The planner's structured output: the swarm's flight plan for one request. */
export interface SwarmPlan {
  /** One-line restatement of what the user is really asking for. */
  goal: string;
  /** The decomposed worker tasks (a DAG via `dependsOn`). */
  tasks: AgentTask[];
  /**
   * Set when the request is a pure NAVIGATION command ("open the monitor"): the
   * destination path. When present the orchestrator routes the user instead of
   * running the data swarm.
   */
  navigateTo?: string;
  /** The model used to plan (for provenance). */
  modelUsed: string;
}

/** A renderable artifact a worker produced. */
export type Artifact =
  | {
      kind: "chart";
      id: string;
      taskId: string;
      title: string;
      spec: ChartSpec;
      rows: Record<string, unknown>[];
      sql?: string;
    }
  | {
      kind: "table";
      id: string;
      taskId: string;
      title: string;
      rows: Record<string, unknown>[];
      sql?: string;
    }
  | {
      kind: "kpi";
      id: string;
      taskId: string;
      title: string;
      label: string;
      value: string;
      delta?: number;
      sql?: string;
    }
  | {
      kind: "insight";
      id: string;
      taskId: string;
      title: string;
      body: string;
      severity: "low" | "medium" | "high";
    };

/** Verdict the critic returns for a task's output. */
export interface CriticVerdict {
  taskId: string;
  /** Whether the output is trustworthy enough to keep. */
  accepted: boolean;
  /** Short reason, shown in the trace. */
  reason: string;
  confidence: "low" | "medium" | "high";
}

/** Live state of a single agent task during a run (UI-facing). */
export interface AgentRunState {
  task: AgentTask;
  status: AgentStatus;
  /** Streaming buffer shown live in the agent's lane. */
  partial: string;
  /** Produced artifacts, once the task completes. */
  artifacts: Artifact[];
  verdict?: CriticVerdict;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

/** The shared context every worker agent receives about the active dataset. */
export interface SwarmContext {
  datasetId: string;
  datasetName: string;
  /** DuckDB view/table to query. */
  tableName: string;
  columns: ColumnInfo[];
  /** A small sample of rows for grounding (never the full table). */
  rowSample: Record<string, unknown>[];
  rowCount: number;
  /** Resolved offline model id for this run. */
  model: string;
  /**
   * The user's original question, verbatim. Lets the manager-facing agents
   * mirror the user's language (English / French / Tunisian Derja) without any
   * rule-based detection — the model replies in whatever language was asked.
   */
  userPrompt?: string;
}

/** The final composed result of a swarm run. */
export interface SwarmResult {
  goal: string;
  headline: string;
  summary: string;
  evidence: string[];
  followUps: string[];
  confidence: "low" | "medium" | "high";
  artifacts: Artifact[];
  modelUsed: string;
}
