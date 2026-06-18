"use client";

/**
 * Moudir AI — question router (Tier 0, zero LLM calls).
 *
 * Runs BEFORE any model call. Classifies the user's question with the existing
 * MiniLM embeddings (no second model, no new dependency) into one of three tiers:
 *   - navigate : pure "take me somewhere" → resolve a route, ZERO LLM calls.
 *   - lookup   : a direct data question → ONE structured call (see agents/lookup).
 *   - analysis : a causal / multi-step question → the 2-call analysis pipeline.
 *
 * Exemplar vectors are precomputed once at warmup (warmRouter) so per-question
 * classification is a sub-millisecond cosine lookup. On any embedding failure the
 * caller falls back to the analysis tier — the router never blocks a question.
 */

import { embedRaw } from "@/platform/ai/embeddings";
import { type AppRoute, APP_ROUTES, resolveRoute } from "../navigator/routes";

export type Tier =
  | { tier: "navigate"; route: AppRoute }
  | { tier: "lookup" }
  | { tier: "analysis" };

/** Minimum cosine score for a navigation match; below this we never auto-navigate. */
const NAV_THRESHOLD = 0.5;

/** Exemplar utterances per data tier (EN / FR / Tunisian Derja). */
const LOOKUP_UTTERANCES = [
  "top 5 channels by volume",
  "what was revenue yesterday",
  "show me sales by region",
  "count transactions today",
  "combien de transactions hier",
  "أكثر القنوات معاملات",
];
const ANALYSIS_UTTERANCES = [
  "why did the success rate drop",
  "compare this month to last and explain",
  "what is driving the increase in errors",
  "pourquoi le taux de réussite a baissé",
  "علاش تنقص النجاح",
];

let cache: { navVecs: number[][]; lookupVecs: number[][]; analysisVecs: number[][] } | null = null;

function cosine(a: Float32Array | number[], b: Float32Array | number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function maxSim(q: Float32Array | number[], vecs: number[][]): number {
  let best = 0;
  for (const v of vecs) best = Math.max(best, cosine(q, v));
  return best;
}

/**
 * Precompute exemplar vectors ONCE (idempotent). Call during model warmup so the
 * first real question's routing is already a cheap cosine lookup.
 */
export async function warmRouter(): Promise<void> {
  if (cache) return;
  const navText = APP_ROUTES.map((r) => `${r.label} ${r.hint}`);
  const [navVecs, lookupVecs, analysisVecs] = await Promise.all([
    embedRaw(navText).then((v) => v.map((x) => Array.from(x))),
    embedRaw(LOOKUP_UTTERANCES).then((v) => v.map((x) => Array.from(x))),
    embedRaw(ANALYSIS_UTTERANCES).then((v) => v.map((x) => Array.from(x))),
  ]);
  cache = { navVecs, lookupVecs, analysisVecs };
}

/** Tier classification only (no route resolution). Escalates to analysis on doubt. */
export async function classifyTier(
  prompt: string,
): Promise<{ tier: "navigate" | "lookup" | "analysis"; navIdx: number; score: number }> {
  await warmRouter();
  if (!cache) return { tier: "analysis", navIdx: -1, score: 0 };

  const [q] = await embedRaw([prompt]);
  const navScores = cache.navVecs.map((v) => cosine(q, v));
  const navBest = navScores.length ? Math.max(...navScores) : 0;
  const lookupBest = maxSim(q, cache.lookupVecs);
  const analysisBest = maxSim(q, cache.analysisVecs);

  if (navBest >= NAV_THRESHOLD && navBest >= lookupBest && navBest >= analysisBest) {
    return { tier: "navigate", navIdx: navScores.indexOf(navBest), score: navBest };
  }
  // Prefer the clearer data tier; ties / low confidence fall to full analysis.
  return lookupBest > analysisBest
    ? { tier: "lookup", navIdx: -1, score: lookupBest }
    : { tier: "analysis", navIdx: -1, score: analysisBest };
}

/** Full router: resolves the destination route when the tier is navigate. */
export async function routeQuestion(prompt: string): Promise<Tier> {
  const r = await classifyTier(prompt);
  if (r.tier === "navigate") {
    const route = APP_ROUTES[r.navIdx] ?? resolveRoute(prompt);
    return route ? { tier: "navigate", route } : { tier: "analysis" };
  }
  return r.tier === "lookup" ? { tier: "lookup" } : { tier: "analysis" };
}
