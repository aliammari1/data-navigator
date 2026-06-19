"use client";

/**
 * Moudir AI — Critic agent.
 *
 * Adversarially verifies the artifacts produced for a single task. This is a
 * strict AI-only judgement: the model decides whether the artifacts actually
 * support the task instruction, use real columns, and contain data. There is no
 * rule-based scoring fallback — the only non-model branch is the trivial
 * "nothing was produced" case, which is a structural fact, not a heuristic.
 */

import { z } from "zod";
import type { InferenceScheduler } from "../scheduler";
import { contextBlock, type CriticAgent } from "./base";
import type { AgentTask, Artifact, CriticVerdict, SwarmContext } from "../types";

/** Grammar-constrained verdict shape the model must return. */
const verdictSchema = z.object({
  accepted: z.boolean(),
  reason: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
});

/** Compact, model-readable description of one artifact for review. */
export function describeArtifact(artifact: Artifact): string {
  switch (artifact.kind) {
    case "chart": {
      const fields = artifact.spec.encodings.map((e) => `${e.channel}=${e.field}`).join(", ");
      return [
        `[chart] "${artifact.title}"`,
        `type=${artifact.spec.type}`,
        `encodings={${fields}}`,
        `rows=${artifact.rows.length}`,
        artifact.sql ? `sql=${artifact.sql}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
    }
    case "table":
      return [
        `[table] "${artifact.title}"`,
        `rows=${artifact.rows.length}`,
        artifact.sql ? `sql=${artifact.sql}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
    case "kpi":
      return [
        `[kpi] "${artifact.title}"`,
        `${artifact.label}=${artifact.value}`,
        artifact.delta !== undefined ? `delta=${artifact.delta}` : "",
        artifact.sql ? `sql=${artifact.sql}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
    case "insight":
      return [
        `[insight] "${artifact.title}"`,
        `severity=${artifact.severity}`,
        `body=${artifact.body}`,
      ].join(" · ");
  }
}

export const runCritic: CriticAgent = async ({ scheduler, ctx, task, artifacts }) => {
  // Structural fact, not a heuristic: with nothing produced there is nothing to
  // verify, so reject immediately without spending an inference turn.
  if (artifacts.length === 0) {
    const verdict: CriticVerdict = {
      taskId: task.id,
      accepted: false,
      reason: "No artifacts produced.",
      confidence: "high",
    };
    return verdict;
  }

  const validColumns = new Set(ctx.columns.map((c) => c.name));
  const artifactReport = artifacts.map((a, i) => `${i + 1}. ${describeArtifact(a)}`).join("\n");

  const system = [
    "You are a skeptical data-analysis reviewer verifying one worker's output.",
    "Reject (accepted=false) if any artifact is empty, makes a claim the data",
    "does not support, references columns that do not exist in the schema, or is",
    "irrelevant to the task instruction. Default to caution when evidence is",
    "thin, but do NOT reject solely because an artifact is terse. Judge only",
    "against the provided schema and artifacts — never invent data or columns.",
  ].join(" ");

  const prompt = [
    contextBlock(ctx),
    "",
    `Valid column names (the ONLY columns that may appear): ${[...validColumns].join(", ")}`,
    "",
    `Task title: ${task.title}`,
    `Task instruction: ${task.instruction}`,
    "",
    "Artifacts produced for this task:",
    artifactReport,
    "",
    "Decide whether these artifacts faithfully and relevantly satisfy the task",
    "instruction using only real columns and data-supported claims. Return your",
    "verdict.",
  ].join("\n");

  const result = await scheduler.generateStructured(
    {
      model: ctx.model,
      system,
      prompt,
      maxTokens: 256,
      temperature: 0,
    },
    verdictSchema,
  );

  if (!result || typeof result.accepted !== "boolean") {
    throw new Error(`Critic produced no usable verdict for task "${task.id}" (${task.title}).`);
  }

  const verdict: CriticVerdict = {
    taskId: task.id,
    accepted: result.accepted,
    reason: result.reason.trim(),
    confidence: result.confidence,
  };
  return verdict;
};

// ─── Batched critic (one grammar-constrained call instead of N per-task) ────────

/** One verdict per task id, returned in a single grammar-constrained call. */
export const batchedVerdictSchema = z.object({
  verdicts: z.array(
    z.object({
      taskId: z.string(),
      accepted: z.boolean(),
      reason: z.string(),
      confidence: z.enum(["low", "medium", "high"]),
    }),
  ),
});

/**
 * Verify MANY tasks in ONE call (replaces the per-task critic loop). Only pass the
 * high-risk, deterministically-clean items here — low-risk artifacts are accepted by
 * the deterministic validators without an LLM call. A dropped/extra taskId is the
 * caller's responsibility to reconcile.
 */
export async function runBatchedCritic({
  scheduler,
  ctx,
  items,
}: {
  scheduler: InferenceScheduler;
  ctx: SwarmContext;
  items: { task: AgentTask; artifacts: Artifact[] }[];
}): Promise<CriticVerdict[]> {
  if (items.length === 0) return [];

  const validColumns = new Set(ctx.columns.map((c) => c.name));
  const report = items
    .map(({ task, artifacts }) =>
      [
        `TASK ${task.id} — ${task.title}: ${task.instruction}`,
        ...artifacts.map((a, i) => `  ${i + 1}. ${describeArtifact(a)}`),
      ].join("\n"),
    )
    .join("\n\n");

  const system = [
    "You are a skeptical data-analysis reviewer verifying several workers' outputs at once.",
    "For EACH task return one verdict object with its exact taskId.",
    "Reject (accepted=false) only if an artifact makes a claim the data does not support",
    "or is irrelevant to its task instruction. Do NOT reject merely because an artifact is terse.",
    "Judge only against the provided schema and artifacts — never invent data or columns.",
  ].join(" ");

  const prompt = [
    contextBlock(ctx),
    "",
    `Valid column names: ${[...validColumns].join(", ")}`,
    "",
    "Tasks and their artifacts:",
    report,
    "",
    "Return exactly one verdict per taskId above.",
  ].join("\n");

  const result = await scheduler.generateStructured(
    {
      model: ctx.model,
      system,
      prompt,
      systemPrefix: contextBlock(ctx),
      maxTokens: 512,
      temperature: 0,
    },
    batchedVerdictSchema,
  );

  return result.verdicts.map((v) => ({
    taskId: v.taskId,
    accepted: v.accepted,
    reason: v.reason.trim(),
    confidence: v.confidence,
  }));
}
