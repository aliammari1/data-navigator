"use client";

/**
 * Moudir AI — Swarm Orchestrator (3-tier pipeline).
 *
 * One question flows through a router (zero LLM) into one of three tiers:
 *   - navigate : resolve a destination, NO model call.
 *   - lookup   : ONE grammar-constrained call answers a direct data question.
 *   - analysis : PLAN+SPEC (1 call) → deterministic DuckDB/anomaly COMPUTE (no LLM,
 *                IO lane) → NARRATE+VERIFY (1 call). Verification is deterministic
 *                (validateArtifact); a single batched judge runs only over any
 *                high-risk insight artifacts.
 *
 * The engine, provider registry, InferenceScheduler, and native GBNF grammar are
 * unchanged. Strict AI-only: if no offline model is ready the run fails visibly —
 * there is no heuristic fallback.
 */

import { useSettingsStore } from "@/core/stores/settings-store";
import { useModelRequiredDialogStore } from "@/platform/ai/models/model-required-dialog-store";
import { useSwarmStore } from "../../store/swarm-store";
import { runAnalysisPlan } from "./agents/analyze";
import { runAnswer } from "./agents/answer";
import { runBatchedCritic } from "./agents/critic";
import { runLookup } from "./agents/lookup";
import { isHighRisk, validateArtifact } from "./agents/validate";
import { compute } from "./compute";
import { lookupCachedAnswer, storeCachedAnswer } from "./response-cache";
import { routeQuestion, warmRouter } from "./router";
import { InferenceScheduler } from "./scheduler";
import type { AgentTask, Artifact, SwarmContext, SwarmResult } from "./types";

/** The scheduler backing the in-flight run, exposed for cancellation. */
let activeScheduler: InferenceScheduler | null = null;

/** Abort the in-flight swarm run (its queued + streaming LLM calls). */
export function cancelActiveSwarm(): void {
  activeScheduler?.cancel();
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Reject if `promise` doesn't settle within `ms`, with a clear message. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Run ONE batched judge over the high-risk (insight) artifacts only, dropping any
 * the model rejects. Low-risk artifacts (tables/charts/kpis from executed SQL) are
 * trusted on the deterministic validators alone. Never throws — on judge failure we
 * keep everything (matches the prior critic-unavailable behavior).
 */
async function judgeHighRisk(
  scheduler: InferenceScheduler,
  ctx: SwarmContext,
  artifacts: Artifact[],
): Promise<Artifact[]> {
  const highRisk = artifacts.filter(isHighRisk);
  if (highRisk.length === 0) return artifacts;
  try {
    const items = highRisk.map((a) => ({
      task: {
        id: a.id,
        role: "anomaly",
        title: a.title,
        instruction: ctx.userPrompt ?? "",
        dependsOn: [],
      } as AgentTask,
      artifacts: [a],
    }));
    const verdicts = await runBatchedCritic({ scheduler, ctx, items });
    const rejected = new Set(verdicts.filter((v) => !v.accepted).map((v) => v.taskId));
    return artifacts.filter((a) => !(isHighRisk(a) && rejected.has(a.id)));
  } catch {
    return artifacts;
  }
}

/**
 * Run the full pipeline for one user prompt against the active dataset. Returns the
 * result; also pushes every transition into `useSwarmStore`. Throws (and marks the
 * store failed) when no offline model is ready or no stage produces anything usable.
 */
export async function runSwarm(ctx: SwarmContext, prompt: string): Promise<SwarmResult> {
  const store = useSwarmStore.getState();
  const scheduler = new InferenceScheduler({ ioConcurrency: 4 });
  activeScheduler = scheduler;
  store.begin(prompt, Date.now());

  // Carry the user's verbatim question so the manager-facing calls can mirror its
  // language (English / French / Arabic) — AI-driven, no rule-based detection.
  const runCtx: SwarmContext = { ...ctx, userPrompt: prompt };

  try {
    // ── D1: semantic response cache — instant, zero LLM calls on a hit ────────
    const cachedAnswer = await lookupCachedAnswer(prompt, runCtx);
    if (cachedAnswer) {
      store.complete(cachedAnswer, Date.now());
      return cachedAnswer;
    }

    if (!(await scheduler.isReady())) {
      useModelRequiredDialogStore.getState().show("Asking Moudir needs a downloaded AI model.");
      throw new Error(
        "No offline model is ready. Open Model Readiness and warm up an edge model, then try again.",
      );
    }

    // ── Warm up ──────────────────────────────────────────────────────────────
    store.setPhase("planning");
    store.setWarming({
      message: "Warming up the offline model — the first run is slow…",
      progress: 0,
    });
    try {
      await withTimeout(
        scheduler.ensureReady(ctx.model, (progress, message) =>
          store.setWarming({ message: message || "Warming up the offline model…", progress }),
        ),
        120_000,
        "The offline model took too long to load. It may not be installed yet — open Model Readiness to set one up.",
      );
    } finally {
      store.setWarming(null);
    }

    // ── Tier 0: route (zero LLM calls) ────────────────────────────────────────
    await warmRouter().catch(() => {});
    let route: Awaited<ReturnType<typeof routeQuestion>>;
    try {
      route = await routeQuestion(prompt);
    } catch {
      route = { tier: "analysis" };
    }

    if (route.tier === "navigate") {
      store.setNavigation({ path: route.route.path, label: route.route.label });
      const navResult: SwarmResult = {
        goal: prompt,
        headline: `Opening ${route.route.label}`,
        summary: `Taking you to ${route.route.label}.`,
        evidence: [],
        followUps: [],
        confidence: "high",
        artifacts: [],
        modelUsed: ctx.model,
      };
      store.complete(navResult, Date.now());
      return navResult;
    }

    // ── Tier 1: single-call lookup ────────────────────────────────────────────
    if (route.tier === "lookup") {
      store.setPhase("working");
      const result = await runLookup(scheduler, runCtx);
      for (const artifact of result.artifacts) store.addArtifact(artifact);
      void storeCachedAnswer(prompt, runCtx, result);
      store.complete(result, Date.now());
      return result;
    }

    // ── Tier 2: PLAN+SPEC → COMPUTE → NARRATE+VERIFY ─────────────────────────
    store.setPhase("planning");
    const plan = await runAnalysisPlan(scheduler, runCtx);
    store.setPlan({ goal: plan.goal, tasks: [], modelUsed: ctx.model });

    store.setPhase("working");
    const produced = await compute(scheduler, runCtx, plan);
    const clean = produced.filter((artifact) => !validateArtifact(artifact, runCtx).hardFail);
    if (clean.length === 0) {
      throw new Error(
        "No trustworthy data was produced for this question. Check Model Readiness or rephrase the request.",
      );
    }

    // The batched AI critic is opt-in (settings-store.enableAiCritic, default
    // off): the deterministic validators above already drop the dangerous cases,
    // and skipping it removes a serialized model call from every analysis run.
    // When enabled it re-judges only the high-risk insight artifacts.
    store.setPhase("verifying");
    const verified = useSettingsStore.getState().enableAiCritic
      ? await judgeHighRisk(scheduler, runCtx, clean)
      : clean;
    for (const artifact of verified) store.addArtifact(artifact);

    store.setPhase("synthesizing");
    const result = await runAnswer(scheduler, runCtx, plan.goal, verified, (token) =>
      store.appendAnswerToken(token),
    );
    void storeCachedAnswer(prompt, runCtx, result);
    store.complete(result, Date.now());
    return result;
  } catch (err) {
    store.fail(errMessage(err), Date.now());
    throw err;
  } finally {
    if (activeScheduler === scheduler) activeScheduler = null;
  }
}
