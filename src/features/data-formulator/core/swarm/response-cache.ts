"use client";

/**
 * Moudir AI — semantic response cache (D1).
 *
 * An offline, in-memory LRU that returns a finished SwarmResult for a repeat or
 * near-duplicate question without any LLM call. Keyed by the question's MiniLM
 * embedding plus a dataset fingerprint (id + row count + column names), so a
 * different dataset — or a data change that moves the row count — never serves a
 * stale answer. A conservative cosine threshold and an exact-normalized fast path
 * guard against wrong-answer collisions (telecom numbers must not be confused).
 *
 * Everything is best-effort and guarded: if embeddings are unavailable, lookups
 * miss and stores no-op — the cache can never break or block a run.
 */

import { embedRaw } from "@/platform/ai/embeddings";
import type { SwarmContext, SwarmResult } from "./types";

interface CacheEntry {
  vec: number[];
  question: string;
  fingerprint: string;
  result: SwarmResult;
}

const MAX_ENTRIES = 50;
/** Conservative — only a very close match returns a cached answer. */
const SIMILARITY_THRESHOLD = 0.92;

const entries: CacheEntry[] = [];

/** Dataset identity that must match for a cache hit (id + size + columns). */
function fingerprint(ctx: SwarmContext): string {
  const cols = ctx.columns
    .map((c) => c.name)
    .sort()
    .join(",");
  return `${ctx.datasetId}::${ctx.rowCount}::${cols}`;
}

function normalize(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ");
}

function cosine(a: number[] | Float32Array, b: number[] | Float32Array): number {
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

/** Return a cached result for a repeat/near-duplicate question, or null. Never throws. */
export async function lookupCachedAnswer(
  prompt: string,
  ctx: SwarmContext,
): Promise<SwarmResult | null> {
  try {
    const fp = fingerprint(ctx);
    const norm = normalize(prompt);

    // Exact-normalized fast path (no embedding needed).
    const exact = entries.find((e) => e.fingerprint === fp && normalize(e.question) === norm);
    if (exact) return exact.result;

    const candidates = entries.filter((e) => e.fingerprint === fp);
    if (candidates.length === 0) return null;

    const [q] = await embedRaw([prompt]);
    let best: CacheEntry | null = null;
    let bestSim = 0;
    for (const entry of candidates) {
      const sim = cosine(q, entry.vec);
      if (sim > bestSim) {
        bestSim = sim;
        best = entry;
      }
    }
    return best && bestSim >= SIMILARITY_THRESHOLD ? best.result : null;
  } catch {
    return null;
  }
}

/** Store a completed result for future hits. Best-effort; never throws. */
export async function storeCachedAnswer(
  prompt: string,
  ctx: SwarmContext,
  result: SwarmResult,
): Promise<void> {
  try {
    const [q] = await embedRaw([prompt]);
    entries.push({ vec: Array.from(q), question: prompt, fingerprint: fingerprint(ctx), result });
    while (entries.length > MAX_ENTRIES) entries.shift();
  } catch {
    // ignore — caching is best-effort
  }
}

/**
 * Drop cached answers. Call after a new dataset import so stale numbers are never
 * served. With no argument, clears everything; with a datasetId, clears that set.
 */
export function invalidateCachedAnswers(datasetId?: string): void {
  if (!datasetId) {
    entries.length = 0;
    return;
  }
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].fingerprint.startsWith(`${datasetId}::`)) entries.splice(i, 1);
  }
}
