# Moudir Orchestration Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ~2+2N-serialized-call Moudir swarm with a 3-tier, ≤3-call pipeline (route → lookup → analysis) plus deterministic verification and a warm prefix cache, keeping node-llama-cpp + native GBNF + the provider registry + InferenceScheduler unchanged.

**Architecture:** A new `routeQuestion()` (MiniLM embeddings via `semantic-node-router`) classifies each question: navigation = 0 LLM calls, simple-lookup = 1 call, full-analysis = a PLAN+SPEC call → deterministic DuckDB/anomaly compute (IO lane) → a NARRATE+VERIFY call. The per-task LLM critic is replaced by deterministic validators + at most one batched judge. A run-scoped warm chat session preloads the shared dataset-grounding prefix once.

**Tech Stack:** TypeScript, Electron main + Next.js renderer, node-llama-cpp 3.18.1 (native GBNF grammar), Zod 4, DuckDB (read-only), MiniLM embeddings worker, `semantic-node-router` (MIT), Vitest 4 (tests), Biome (lint/format).

**Design doc:** `docs/planning/v2/moudir-orchestration-redesign.md`. **Research:** `docs/planning/v2/fast-offline-inference-brainstorm.md`.

> **Verification policy (project rule):** do NOT run `tsc`/`typecheck` (too slow; the dev server compiles live). Verify with `pnpm vitest run <file>` and `pnpm biome check <path>`. LLM/IPC/Electron tasks that can't be unit-tested deterministically use a manual smoke step (run the app, ask a question, read `scheduler.stats.llmCalls`).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/features/data-formulator/core/swarm/agents/validate.ts` | Pure deterministic artifact validators (zero LLM) | **Create** |
| `src/features/data-formulator/core/swarm/agents/validate.test.ts` | Unit tests for validators | **Create** |
| `src/features/data-formulator/core/swarm/agents/critic.ts` | Add `runBatchedCritic` + `batchedVerdictSchema`; export `describeArtifact` | **Modify** |
| `src/features/data-formulator/core/swarm/orchestrator.ts` | Rewrite `verify()` (validators + 1 judge); add `routeQuestion` branch; Phase C analysis pipeline | **Modify** |
| `src/features/data-formulator/core/swarm/router.ts` | `routeQuestion()` — MiniLM intent tiers | **Create** |
| `src/features/data-formulator/core/swarm/router.test.ts` | Router scoring/threshold tests (injected vectors) | **Create** |
| `src/features/data-formulator/core/swarm/agents/lookup.ts` | Tier-1 single-call lookup agent | **Create** |
| `src/features/data-formulator/core/swarm/agents/analyze.ts` | Phase C: PLAN+SPEC call → schema + agent | **Create** |
| `src/features/data-formulator/core/swarm/agents/analyze.test.ts` | Plan+spec schema parsing tests | **Create** |
| `src/features/data-formulator/core/swarm/compute.ts` | Phase C: deterministic SQL + anomaly compute (IO lane) | **Create** |
| `src/features/data-formulator/core/swarm/compute.test.ts` | Anomaly-math tests | **Create** |
| `src/features/data-formulator/core/swarm/agents/answer.ts` | Phase C: NARRATE+VERIFY single streaming structured call | **Create** |
| `electron/llama-service.ts` | Run-scoped warm session + `preloadPrefix` (A4) | **Modify** |
| `electron/main.ts`, `electron/preload.ts` | IPC for `llama:beginRun`/`endRun`/`preloadPrefix` (A4) | **Modify** |
| `src/platform/ai/provider/adapters/llamacpp.ts` | Thread optional `systemPrefix`/run session (A4) | **Modify** |
| Delete after Phase C: `agents/{query,chart,narrative,anomaly,synthesizer}.ts` (fold into analyze/compute/answer; keep `base.ts` helpers) | Cleanup | **Delete (C5)** |

---

# PHASE A — Deterministic verification + warm prefix cache

*Goal: stays on the current swarm shape; cuts ~2+2N → ~2+N and improves reliability.*

### Task A1: Deterministic artifact validators

**Files:**
- Create: `src/features/data-formulator/core/swarm/agents/validate.ts`
- Test: `src/features/data-formulator/core/swarm/agents/validate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/data-formulator/core/swarm/agents/validate.test.ts
import { describe, expect, it } from "vitest";
import type { Artifact, SwarmContext } from "../types";
import { validateArtifact } from "./validate";

const ctx = {
  datasetId: "d1",
  datasetName: "tx",
  tableName: "tx_view",
  columns: [
    { name: "channel", type: "string" },
    { name: "amount", type: "number" },
  ],
  rowSample: [],
  rowCount: 100,
  model: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
} as unknown as SwarmContext;

function chart(rows: Record<string, unknown>[], field: string): Artifact {
  return {
    kind: "chart",
    id: "a1",
    taskId: "t1",
    title: "c",
    spec: { id: "s1", type: "bar", title: "c", limit: 50, filters: [], encodings: [{ id: "e1", channel: "x", field }] },
    rows,
  } as Artifact;
}

describe("validateArtifact", () => {
  it("hard-fails a chart that encodes a non-existent column", () => {
    const r = validateArtifact(chart([{ channel: "A" }], "nope"), ctx);
    expect(r.hardFail).toBe(true);
    expect(r.reasons[0]).toMatch(/non-existent column/);
  });

  it("hard-fails an empty table", () => {
    const r = validateArtifact({ kind: "table", id: "a", taskId: "t", title: "t", rows: [] } as Artifact, ctx);
    expect(r.hardFail).toBe(true);
  });

  it("passes a chart over a real column with rows", () => {
    const r = validateArtifact(chart([{ channel: "A" }], "channel"), ctx);
    expect(r.hardFail).toBe(false);
    expect(r.reasons).toHaveLength(0);
  });

  it("hard-fails a KPI with a non-finite delta", () => {
    const r = validateArtifact({ kind: "kpi", id: "a", taskId: "t", title: "k", label: "L", value: "5", delta: Number.NaN } as Artifact, ctx);
    expect(r.hardFail).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/features/data-formulator/core/swarm/agents/validate.test.ts`
Expected: FAIL — `Failed to resolve import "./validate"` / `validateArtifact is not a function`.

- [ ] **Step 3: Write the implementation**

```ts
// src/features/data-formulator/core/swarm/agents/validate.ts
import type { Artifact, SwarmContext } from "../types";

export interface ValidationResult {
  /** True when a mechanically-certain failure makes the artifact untrustworthy. */
  hardFail: boolean;
  reasons: string[];
}

/**
 * Deterministic, zero-LLM artifact validation. Catches the dangerous, mechanically
 * checkable failure modes (fabricated columns, empty results, non-finite numbers)
 * a small model must NEVER be allowed to overrule. Pure and synchronous, so it runs
 * in the parallel IO lane and overlaps everything. This REPLACES most of what the
 * per-task LLM critic was nominally doing.
 */
export function validateArtifact(artifact: Artifact, ctx: SwarmContext): ValidationResult {
  const reasons: string[] = [];
  const validColumns = new Set(ctx.columns.map((c) => c.name));

  switch (artifact.kind) {
    case "table":
      if (artifact.rows.length === 0) reasons.push("Table returned no rows.");
      break;
    case "chart":
      if (artifact.rows.length === 0) reasons.push("Chart returned no rows.");
      for (const enc of artifact.spec.encodings) {
        if (!validColumns.has(enc.field)) {
          reasons.push(`Chart encodes a non-existent column: "${enc.field}".`);
        }
      }
      break;
    case "kpi":
      if (artifact.value.trim() === "") reasons.push("KPI has an empty value.");
      if (artifact.delta !== undefined && !Number.isFinite(artifact.delta)) {
        reasons.push("KPI delta is not a finite number.");
      }
      break;
    case "insight":
      if (!artifact.body.trim()) reasons.push("Insight has an empty body.");
      break;
  }

  return { hardFail: reasons.length > 0, reasons };
}

/**
 * Risk tier per artifact kind. Tables/KPIs/charts come from an already-executed,
 * read-only, schema-validated SQL query, so they are LOW risk (validators suffice).
 * Insights (anomaly prose) are interpretive → HIGH risk → eligible for the judge.
 */
export function isHighRisk(artifact: Artifact): boolean {
  return artifact.kind === "insight";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/features/data-formulator/core/swarm/agents/validate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint + commit**

```bash
pnpm biome check --write src/features/data-formulator/core/swarm/agents/validate.ts src/features/data-formulator/core/swarm/agents/validate.test.ts
git add src/features/data-formulator/core/swarm/agents/validate.ts src/features/data-formulator/core/swarm/agents/validate.test.ts
git commit -m "feat(swarm): deterministic artifact validators (validators-not-critics)"
```

---

### Task A2: Batched critic (one call instead of N)

**Files:**
- Modify: `src/features/data-formulator/core/swarm/agents/critic.ts`

- [ ] **Step 1: Export `describeArtifact` and add the batched schema + runner**

Change the `describeArtifact` declaration to `export function describeArtifact(...)`, then append below `runCritic`:

```ts
// src/features/data-formulator/core/swarm/agents/critic.ts  (append)
import type { InferenceScheduler } from "../scheduler";
import type { AgentTask } from "../types";

/** One verdict per task, returned in a single grammar-constrained call. */
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
 * Verify MANY tasks in ONE grammar-constrained call (replaces the per-task loop).
 * Only pass the high-risk, deterministically-clean items here — low-risk artifacts
 * are accepted by validators without an LLM call.
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
    { model: ctx.model, system, prompt, maxTokens: 512, temperature: 0 },
    batchedVerdictSchema,
  );

  return result.verdicts.map((v) => ({
    taskId: v.taskId,
    accepted: v.accepted,
    reason: v.reason.trim(),
    confidence: v.confidence,
  }));
}
```

Add `SwarmContext` to the existing type import: `import type { Artifact, CriticVerdict, SwarmContext } from "../types";`.

- [ ] **Step 2: Lint**

Run: `pnpm biome check --write src/features/data-formulator/core/swarm/agents/critic.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/data-formulator/core/swarm/agents/critic.ts
git commit -m "feat(swarm): batched critic — one grammar-constrained verdict array call"
```

---

### Task A3: Rewrite `verify()` to validators + one judge

**Files:**
- Modify: `src/features/data-formulator/core/swarm/orchestrator.ts:142-175`

- [ ] **Step 1: Replace the `verify()` function**

```ts
// orchestrator.ts — replace the whole verify() function with:
import { isHighRisk, validateArtifact } from "./agents/validate";
import { runBatchedCritic } from "./agents/critic";

/**
 * Verify each task's artifacts WITHOUT a per-task LLM call:
 *  1. Deterministic validators (IO lane) hard-reject fabricated columns / empty
 *     results / non-finite numbers — a 1.5B model never overrules these.
 *  2. ONE batched judge call over the surviving HIGH-RISK artifacts (insights).
 *     Low-risk artifacts (table/kpi/chart from executed SQL) auto-accept.
 */
async function verify(
  scheduler: InferenceScheduler,
  ctx: SwarmContext,
  tasks: AgentTask[],
  outputs: Map<string, WorkerOutput>,
): Promise<Map<string, CriticVerdict>> {
  const store = useSwarmStore.getState();
  const verdicts = new Map<string, CriticVerdict>();
  const toJudge: { task: AgentTask; artifacts: Artifact[] }[] = [];

  // ── Layer 1: deterministic, parallel ──────────────────────────────────────
  await Promise.all(
    tasks.map((task) =>
      scheduler.io(async () => {
        const artifacts = outputs.get(task.id)?.artifacts ?? [];
        if (artifacts.length === 0) return;

        const failures = artifacts.flatMap((a) => validateArtifact(a, ctx).reasons);
        if (failures.length > 0) {
          const verdict: CriticVerdict = {
            taskId: task.id,
            accepted: false,
            reason: failures.join(" "),
            confidence: "high",
          };
          verdicts.set(task.id, verdict);
          store.setVerdict(task.id, verdict);
          return;
        }
        if (artifacts.some(isHighRisk)) {
          toJudge.push({ task, artifacts });
        } else {
          const verdict: CriticVerdict = {
            taskId: task.id,
            accepted: true,
            reason: "Passed deterministic validation.",
            confidence: "high",
          };
          verdicts.set(task.id, verdict);
          store.setVerdict(task.id, verdict);
        }
      }),
    ),
  );

  // ── Layer 2: one batched judge for the high-risk survivors ────────────────
  if (toJudge.length > 0) {
    try {
      const judged = await runBatchedCritic({ scheduler, ctx, items: toJudge });
      const byId = new Map(judged.map((v) => [v.taskId, v]));
      for (const { task } of toJudge) {
        const verdict =
          byId.get(task.id) ??
          // The model dropped a taskId: keep it (matches prior critic-unavailable behavior).
          { taskId: task.id, accepted: true, reason: "Not judged; kept.", confidence: "low" as const };
        verdicts.set(task.id, verdict);
        store.setVerdict(task.id, verdict);
      }
    } catch (err) {
      for (const { task } of toJudge) {
        const verdict: CriticVerdict = {
          taskId: task.id,
          accepted: true,
          reason: `Judge unavailable: ${errMessage(err)}`,
          confidence: "low",
        };
        verdicts.set(task.id, verdict);
        store.setVerdict(task.id, verdict);
      }
    }
  }

  return verdicts;
}
```

Remove the now-unused `import { runCritic } from "./agents/critic";` and ensure `Artifact` is imported from `./types`.

- [ ] **Step 2: Smoke test (manual — needs the model)**

Run the app (`pnpm dev`), open Moudir, ask "why did success rate drop yesterday?". In DevTools, after the run, confirm `verify()` made at most ONE `generateStructured` call (add a temporary `console.log(scheduler.stats.llmCalls)` at the end of `runSwarm`, or watch the agent lanes). Expected: critic calls drop from N to ≤1.

- [ ] **Step 3: Run the existing suite + lint, then commit**

```bash
pnpm vitest run src/features/data-formulator
pnpm biome check --write src/features/data-formulator/core/swarm/orchestrator.ts
git add src/features/data-formulator/core/swarm/orchestrator.ts
git commit -m "refactor(swarm): replace per-task critic with validators + one batched judge"
```

---

### Task A4: Warm prefix cache (HIGHER RISK — keep concurrency=1; ship without it if unstable on Windows)

> The shared dataset-grounding prefix (`contextBlock(ctx)`) is identical across every call in a run but is re-prefilled each time. Hold a run-scoped warm `LlamaChatSession`, `preloadPrompt()` the prefix once, and reuse it. **Risk:** reverses the per-call sequence isolation that fixed a Windows `STATUS_STACK_BUFFER_OVERRUN`; validate on real hardware, and if unstable, drop this task — Tasks A1–A3 stand alone.

**Files:**
- Modify: `electron/llama-service.ts`, `electron/main.ts`, `electron/preload.ts`, `src/platform/ai/provider/adapters/llamacpp.ts`

- [ ] **Step 1: Add a run-scoped warm session in `llama-service.ts`**

```ts
// electron/llama-service.ts (append; keep the serialized enqueue() wrapping all calls)
import { LlamaChatSession } from "node-llama-cpp"; // already dynamically imported elsewhere

let runSession: { id: string; session: import("node-llama-cpp").LlamaChatSession } | null = null;

/** Begin a run: create one warm session and preload the shared prefix once. */
export async function beginRun(id: string, systemPrefix: string): Promise<void> {
  await ensureModel();
  await endRun(); // dispose any prior
  const ctx = await getSharedContext();
  const session = new LlamaChatSession({ contextSequence: ctx.getSequence(), systemPrompt: systemPrefix });
  await session.preloadPrompt(""); // warm the system prefix KV before the first real prompt
  runSession = { id, session };
}

/** Dispose the run session (call on completion/abort). */
export async function endRun(): Promise<void> {
  runSession = null; // the sequence is owned by the shared context; GC + clearHistory next begin
}
```

Wrap `generate`/`generateStructured` so that **when a `runSession` exists they reuse `runSession.session`** (calling `session.prompt(...)` / with `grammar`) instead of creating a fresh session, and call `session.setChatHistory([])` between calls to reset per-prompt state while preserving the preloaded system prefix. Keep everything inside the existing `enqueue()` (concurrency 1) so the single warm sequence is never accessed concurrently.

- [ ] **Step 2: Expose IPC**

In `electron/main.ts` (next to the other `llama:*` handlers):
```ts
ipcMain.handle("llama:beginRun", (event, input) =>
  withTrustedSender(event, () => llamaService.beginRun(input.id, input.systemPrefix)));
ipcMain.handle("llama:endRun", (event) =>
  withTrustedSender(event, () => llamaService.endRun()));
```
In `electron/preload.ts`, add to the `electronLlama` bridge object:
```ts
beginRun: (input: { id: string; systemPrefix: string }) => ipcRenderer.invoke("llama:beginRun", input),
endRun: () => ipcRenderer.invoke("llama:endRun"),
```

- [ ] **Step 3: Drive it from the orchestrator**

In `orchestrator.ts` `runSwarm`, after `ensureReady` and after building `runCtx`, compute the shared prefix once and begin the run; end it in `finally`:
```ts
const sharedPrefix = contextBlock(runCtx); // import contextBlock from "./agents/base"
await window.electronLlama?.beginRun?.({ id: `run-${store.startedAt ?? Date.now()}`, systemPrefix: sharedPrefix });
// ... existing run ...
} finally {
  await window.electronLlama?.endRun?.().catch(() => {});
  if (activeScheduler === scheduler) activeScheduler = null;
}
```
Then make each agent's prompt put the **variable tail only** (drop the per-call `contextBlock(ctx)` prepend from planner/lookup/analyze/answer prompts, since the prefix is now preloaded) — guarded so the web/transformers lane still prepends it (the warm session is llamacpp-only).

- [ ] **Step 4: Smoke test (manual, real Windows box)**

Run two questions in a row on the same dataset. Confirm (a) no crash, (b) the **second** question's time-to-first-token is visibly faster (prefix cached). If you see any native crash, revert this task and ship A1–A3.

- [ ] **Step 5: Lint + commit**

```bash
pnpm biome check --write electron/llama-service.ts electron/main.ts electron/preload.ts src/features/data-formulator/core/swarm/orchestrator.ts
git add electron/ src/features/data-formulator/core/swarm/orchestrator.ts
git commit -m "perf(llama): run-scoped warm session + preloaded shared prefix (prefix-KV reuse)"
```

---

# PHASE B — Embeddings router + single-call lookup

*Goal: navigation = 0 calls, simple-lookup = 1 call.*

### Task B1: Install `semantic-node-router` and build `routeQuestion()`

**Files:**
- Create: `src/features/data-formulator/core/swarm/router.ts`
- Test: `src/features/data-formulator/core/swarm/router.test.ts`

- [ ] **Step 1: Install and confirm the package API**

```bash
pnpm add semantic-node-router
```
Then open `node_modules/semantic-node-router/dist/*.d.ts` and confirm the exact exports/signatures (Route shape, `setEmbeddings`/encoder hook, `route()` return). The code below assumes: a `Route` = `{ name, utterances, scoreThreshold }`, a router that accepts precomputed embeddings via `setEmbeddings`, and `route(query) -> { route: string | null, score: number }`. **Align method names with the installed `.d.ts`** — keep all package calls inside this one file so any drift is localized.

- [ ] **Step 2: Write the failing test (router logic over injected vectors — no model)**

```ts
// src/features/data-formulator/core/swarm/router.test.ts
import { describe, expect, it, vi } from "vitest";

// Mock the embeddings module so the test is deterministic and offline.
vi.mock("@/platform/ai/embeddings", () => ({
  embedRaw: vi.fn(async (texts: string[]) =>
    texts.map((t) =>
      // toy 2-D embedding: navigation words point to [1,0], data words to [0,1]
      /open|go|show|navigate|monitor|report/i.test(t)
        ? new Float32Array([1, 0])
        : new Float32Array([0, 1]),
    ),
  ),
}));

import { classifyTier } from "./router";

describe("classifyTier", () => {
  it("routes a navigation phrase to the navigate tier", async () => {
    const r = await classifyTier("open the channel monitor");
    expect(r.tier).toBe("navigate");
  });

  it("routes an analytical phrase to lookup/analysis (not navigate)", async () => {
    const r = await classifyTier("total revenue by channel last week");
    expect(r.tier).not.toBe("navigate");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run src/features/data-formulator/core/swarm/router.test.ts`
Expected: FAIL — `classifyTier` not exported.

- [ ] **Step 4: Implement the router**

```ts
// src/features/data-formulator/core/swarm/router.ts
import { embedRaw } from "@/platform/ai/embeddings";
import { APP_ROUTES, resolveRoute, type AppRoute } from "../navigator/routes";

export type Tier =
  | { tier: "navigate"; route: AppRoute }
  | { tier: "lookup" }
  | { tier: "analysis" };

const NAV_THRESHOLD = 0.5;

// Per-tier exemplar utterances (EN/FR/Derja). Navigation exemplars also come from APP_ROUTES.
const LOOKUP_UTTERANCES = [
  "top 5 channels by volume", "revenue yesterday", "show me sales by region",
  "combien de transactions hier", "أكثر القنوات معاملات",
];
const ANALYSIS_UTTERANCES = [
  "why did the success rate drop", "compare this month to last and explain",
  "what is driving the increase in errors", "pourquoi le taux a baissé",
];

let cache: { navVecs: number[][]; lookupVecs: number[][]; analysisVecs: number[][] } | null = null;

function cosine(a: Float32Array | number[], b: Float32Array | number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

/** Precompute exemplar vectors ONCE at warmup (call from runSwarm's ensureReady path). */
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

function maxSim(q: Float32Array, vecs: number[][]): number {
  let best = 0;
  for (const v of vecs) best = Math.max(best, cosine(q, v));
  return best;
}

/** Tier classification only (navigate vs lookup vs analysis); no route resolution. */
export async function classifyTier(prompt: string): Promise<{ tier: "navigate" | "lookup" | "analysis"; navIdx: number; score: number }> {
  await warmRouter();
  const [q] = await embedRaw([prompt]);
  const navScores = cache!.navVecs.map((v) => cosine(q, v));
  const navBest = Math.max(0, ...navScores);
  const lookupBest = maxSim(q, cache!.lookupVecs);
  const analysisBest = maxSim(q, cache!.analysisVecs);

  if (navBest >= NAV_THRESHOLD && navBest >= lookupBest && navBest >= analysisBest) {
    return { tier: "navigate", navIdx: navScores.indexOf(navBest), score: navBest };
  }
  // Escalate to full analysis on ambiguity; lookup only when it clearly leads.
  return lookupBest > analysisBest
    ? { tier: "lookup", navIdx: -1, score: lookupBest }
    : { tier: "analysis", navIdx: -1, score: analysisBest };
}

/** Full router: resolves the navigation route when the tier is navigate. */
export async function routeQuestion(prompt: string): Promise<Tier> {
  const r = await classifyTier(prompt);
  if (r.tier === "navigate") {
    const route = APP_ROUTES[r.navIdx] ?? resolveRoute(prompt);
    if (route) return { tier: "navigate", route };
    return { tier: "analysis" };
  }
  return r.tier === "lookup" ? { tier: "lookup" } : { tier: "analysis" };
}
```

> Note: this uses our own `embedRaw` + cosine directly (the reliable, testable core). If you adopt `semantic-node-router`'s `Route`/`route()` ergonomics, wrap it here behind the same `routeQuestion()`/`classifyTier()` signatures and inject the MiniLM vectors via its `setEmbeddings`/custom-encoder hook — **do NOT use its bundled TransformersEncoder** (it loads a second MiniLM).

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run src/features/data-formulator/core/swarm/router.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Lint + commit**

```bash
pnpm biome check --write src/features/data-formulator/core/swarm/router.ts src/features/data-formulator/core/swarm/router.test.ts
git add package.json pnpm-lock.yaml src/features/data-formulator/core/swarm/router.ts src/features/data-formulator/core/swarm/router.test.ts
git commit -m "feat(swarm): MiniLM intent router (navigate/lookup/analysis tiers)"
```

---

### Task B2: Single-call lookup agent

**Files:**
- Create: `src/features/data-formulator/core/swarm/agents/lookup.ts`

- [ ] **Step 1: Implement (reuses base helpers + read-only SQL guard)**

```ts
// src/features/data-formulator/core/swarm/agents/lookup.ts
import { z } from "zod";
import type { InferenceScheduler } from "../scheduler";
import type { Artifact, SwarmContext, SwarmResult } from "../types";
import { assertReadOnlySql, contextBlock, runTableArtifact } from "./base";

const lookupSchema = z.object({
  sql: z.string().describe("A single read-only DuckDB SELECT/WITH, no semicolons."),
  headline: z.string(),
  summary: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
});

const SYSTEM = [
  "You are Moudir answering a direct data lookup in ONE step.",
  "Write ONE read-only DuckDB SELECT (optionally a leading WITH) over the single view in context.",
  "Use ONLY real columns; never invent. Always LIMIT <= 200. No semicolons, no DDL/DML.",
  "Then write a one-line headline and a tight summary of the answer.",
  "Reply in the user's language (English/French/Tunisian Derja).",
].join(" ");

/** Tier 1: answer a simple lookup with a SINGLE grammar-constrained call + one SQL run. */
export async function runLookup(scheduler: InferenceScheduler, ctx: SwarmContext): Promise<SwarmResult> {
  const prompt = [
    contextBlock(ctx),
    ctx.userPrompt ? `Question: ${ctx.userPrompt}` : "",
    "Return the SQL, a headline, a summary, and your confidence.",
  ].filter(Boolean).join("\n\n");

  const parsed = await scheduler.generateStructured(
    { model: ctx.model, system: SYSTEM, prompt, maxTokens: 1024, temperature: 0 },
    lookupSchema,
  );

  const sql = assertReadOnlySql(parsed.sql);
  const artifact: Artifact = await runTableArtifact(scheduler, "lookup", parsed.headline, sql);

  return {
    goal: ctx.userPrompt ?? parsed.headline,
    headline: parsed.headline.trim(),
    summary: parsed.summary.trim(),
    evidence: [],
    followUps: [],
    confidence: artifact.rows.length === 0 ? "low" : parsed.confidence,
    artifacts: [artifact],
    modelUsed: ctx.model,
  };
}
```

- [ ] **Step 2: Lint + commit**

```bash
pnpm biome check --write src/features/data-formulator/core/swarm/agents/lookup.ts
git add src/features/data-formulator/core/swarm/agents/lookup.ts
git commit -m "feat(swarm): single-call lookup tier agent"
```

---

### Task B3: Wire the router into `runSwarm`

**Files:**
- Modify: `src/features/data-formulator/core/swarm/orchestrator.ts`

- [ ] **Step 1: Branch on the tier right after warm-up**

In `runSwarm`, after the warm-up `try/finally` and before `planSwarm`, insert:
```ts
import { routeQuestion, warmRouter } from "./router";
import { runLookup } from "./agents/lookup";
// ...
await warmRouter().catch(() => {}); // precompute exemplar vectors (no-op if cached)
const route = await routeQuestion(prompt);

if (route.tier === "navigate") {
  store.setNavigation({ path: route.route.path, label: route.route.label });
  const navResult: SwarmResult = {
    goal: prompt, headline: `Opening ${route.route.label}`,
    summary: `Taking you to ${route.route.label}.`,
    evidence: [], followUps: [], confidence: "high", artifacts: [], modelUsed: ctx.model,
  };
  store.complete(navResult, Date.now());
  return navResult;
}

if (route.tier === "lookup") {
  store.setPhase("working");
  const result = await runLookup(scheduler, runCtx);
  store.complete(result, Date.now());
  return result;
}
// tier === "analysis" → fall through to the existing planner/work/verify/synth pipeline (Phase C replaces it).
```

- [ ] **Step 2: Smoke test (manual)**

Run the app. (a) "open the channel monitor" → routes with **0 LLM calls** (`scheduler.stats.llmCalls === 0`). (b) "top 5 channels by volume" → **1 LLM call**. (c) "why did success drop and what's driving it" → full pipeline.

- [ ] **Step 3: Lint + commit**

```bash
pnpm biome check --write src/features/data-formulator/core/swarm/orchestrator.ts
git add src/features/data-formulator/core/swarm/orchestrator.ts
git commit -m "feat(swarm): route navigation (0 calls) and lookups (1 call) before the swarm"
```

---

# PHASE C — Collapse analysis to a 2-call pipeline

*Goal: PLAN+SPEC → deterministic COMPUTE → NARRATE+VERIFY. Analysis = 2 calls.*

### Task C1: PLAN+SPEC schema + agent

**Files:**
- Create: `src/features/data-formulator/core/swarm/agents/analyze.ts`
- Test: `src/features/data-formulator/core/swarm/agents/analyze.test.ts`

- [ ] **Step 1: Write the failing test (schema is flat + GBNF-safe; parses a model-shaped object)**

```ts
// analyze.test.ts
import { describe, expect, it } from "vitest";
import { analysisPlanSchema } from "./analyze";

describe("analysisPlanSchema", () => {
  it("parses a flat plan with sql + chart + anomaly specs", () => {
    const parsed = analysisPlanSchema.parse({
      goal: "Explain the drop in success rate",
      reasoning: "look at success by day then flag the dip",
      sqlSpecs: [{ id: "q1", purpose: "success by day", sql: 'SELECT day, AVG(rate) r FROM "v" GROUP BY day LIMIT 30' }],
      chartSpecs: [{ usesSqlId: "q1", type: "line", x: "day", y: "r" }],
      anomalyChecks: [{ usesSqlId: "q1", kind: "dip" }],
    });
    expect(parsed.sqlSpecs).toHaveLength(1);
    expect(parsed.chartSpecs[0].type).toBe("line");
  });
});
```

- [ ] **Step 2: Run → fail.** `pnpm vitest run src/features/data-formulator/core/swarm/agents/analyze.test.ts` → FAIL (`analysisPlanSchema` undefined).

- [ ] **Step 3: Implement the schema + agent**

```ts
// src/features/data-formulator/core/swarm/agents/analyze.ts
import { z } from "zod";
import type { InferenceScheduler } from "../scheduler";
import type { SwarmContext } from "../types";
import { chartTypeEnum, contextBlock } from "./base";

/** ONE flat, GBNF-safe schema: plan + all specs in a single call. */
export const analysisPlanSchema = z.object({
  goal: z.string(),
  reasoning: z.string(), // structure-before-values: keep this field FIRST in the prompt instruction
  sqlSpecs: z.array(z.object({
    id: z.string(),
    purpose: z.string(),
    sql: z.string(),
  })).max(4),
  chartSpecs: z.array(z.object({
    usesSqlId: z.string(),
    type: chartTypeEnum,
    x: z.string(),
    y: z.string(),
    series: z.string().optional(),
  })).max(3),
  anomalyChecks: z.array(z.object({
    usesSqlId: z.string(),
    kind: z.enum(["dip", "spike", "outlier", "trend"]),
  })).max(3),
});

export type AnalysisPlan = z.infer<typeof analysisPlanSchema>;

const SYSTEM = [
  "You are Moudir's analyst-planner. In ONE response design the whole analysis.",
  "Output: a goal, a short reasoning string, then sqlSpecs (each a single read-only DuckDB SELECT over the view, LIMIT <=200, real columns only, no semicolons),",
  "chartSpecs (each references a sqlSpec id and uses real columns for x/y/series),",
  "and anomalyChecks (each references a sqlSpec id and a kind).",
  "Keep it minimal: at most 4 sql specs, 3 charts, 3 anomaly checks. Use ONLY real columns.",
].join(" ");

export async function runAnalysisPlan(scheduler: InferenceScheduler, ctx: SwarmContext): Promise<AnalysisPlan> {
  const prompt = [
    contextBlock(ctx),
    ctx.userPrompt ? `Question: ${ctx.userPrompt}` : "",
    "Produce the analysis plan now (reasoning first, then the specs).",
  ].filter(Boolean).join("\n\n");

  return scheduler.generateStructured(
    { model: ctx.model, system: SYSTEM, prompt, maxTokens: 1024, temperature: 0 },
    analysisPlanSchema,
  );
}
```

- [ ] **Step 4: Run → pass.** `pnpm vitest run src/features/data-formulator/core/swarm/agents/analyze.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
pnpm biome check --write src/features/data-formulator/core/swarm/agents/analyze.ts src/features/data-formulator/core/swarm/agents/analyze.test.ts
git add src/features/data-formulator/core/swarm/agents/analyze.ts src/features/data-formulator/core/swarm/agents/analyze.test.ts
git commit -m "feat(swarm): single PLAN+SPEC analysis call (collapses planner + workers)"
```

---

### Task C2: Deterministic COMPUTE stage (0 LLM)

**Files:**
- Create: `src/features/data-formulator/core/swarm/compute.ts`
- Test: `src/features/data-formulator/core/swarm/compute.test.ts`

- [ ] **Step 1: Write the failing test for the anomaly math (pure)**

```ts
// compute.test.ts
import { describe, expect, it } from "vitest";
import { detectAnomaly } from "./compute";

describe("detectAnomaly", () => {
  it("flags a dip as the min point below mean - stddev", () => {
    const rows = [{ d: 1, v: 10 }, { d: 2, v: 11 }, { d: 3, v: 2 }, { d: 4, v: 10 }];
    const s = detectAnomaly(rows, "dip");
    expect(s).not.toBeNull();
    expect(s!.severity).toBe("high");
    expect(s!.body).toMatch(/2/);
  });

  it("returns null when there is no numeric column", () => {
    expect(detectAnomaly([{ a: "x" }], "spike")).toBeNull();
  });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement compute + anomaly math**

```ts
// src/features/data-formulator/core/swarm/compute.ts
import type { InferenceScheduler } from "./scheduler";
import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import { genId } from "../helpers";
import { sanitizeJsonValue } from "../json";
import { assertReadOnlySql } from "./agents/base";
import { buildSQL } from "../sql";
import type { AnalysisPlan } from "./agents/analyze";
import type { Artifact, SwarmContext } from "./types";

type Row = Record<string, unknown>;

function firstNumericKey(rows: Row[]): string | null {
  if (!rows.length) return null;
  for (const k of Object.keys(rows[0])) {
    if (rows.every((r) => r[k] == null || Number.isFinite(Number(r[k])))) {
      if (rows.some((r) => Number.isFinite(Number(r[k])))) return k;
    }
  }
  return null;
}

/** Pure anomaly detector over realized rows. Returns an insight artifact body or null. */
export function detectAnomaly(rows: Row[], kind: AnalysisPlan["anomalyChecks"][number]["kind"]): { title: string; body: string; severity: "low" | "medium" | "high" } | null {
  const key = firstNumericKey(rows);
  if (!key) return null;
  const vals = rows.map((r) => Number(r[key])).filter(Number.isFinite);
  if (vals.length < 3) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  const min = Math.min(...vals), max = Math.max(...vals);
  if (kind === "dip" && min < mean - sd) return { title: "Dip detected", body: `${key} dips to ${min} (mean ${mean.toFixed(1)}).`, severity: "high" };
  if (kind === "spike" && max > mean + sd) return { title: "Spike detected", body: `${key} spikes to ${max} (mean ${mean.toFixed(1)}).`, severity: "high" };
  if (kind === "outlier" && (max > mean + 2 * sd || min < mean - 2 * sd)) return { title: "Outlier", body: `${key} has an outlier (range ${min}–${max}, mean ${mean.toFixed(1)}).`, severity: "medium" };
  if (kind === "trend") { const up = vals[vals.length - 1] > vals[0]; return { title: "Trend", body: `${key} trends ${up ? "up" : "down"} (${vals[0]} → ${vals[vals.length - 1]}).`, severity: "low" }; }
  return null;
}

/** Run all SQL + anomaly checks deterministically in the parallel IO lane. */
export async function compute(scheduler: InferenceScheduler, ctx: SwarmContext, plan: AnalysisPlan): Promise<Artifact[]> {
  const rowsById = new Map<string, Row[]>();

  // SQL specs (read-only, overlapping).
  const tables = await scheduler.ioMap(plan.sqlSpecs, async (spec) => {
    const sql = assertReadOnlySql(spec.sql);
    const rows = (await runReadOnlyQuery(sql)) as Row[];
    rowsById.set(spec.id, rows);
    const artifact: Artifact = { kind: "table", id: genId(), taskId: spec.id, title: spec.purpose, rows: sanitizeJsonValue(rows) as Row[], sql };
    return rows.length ? artifact : null;
  });

  // Charts (reuse rows already fetched via buildSQL semantics — re-run through buildSQL for the renderable shape).
  const charts = await scheduler.ioMap(plan.chartSpecs, async (c) => {
    const baseRows = rowsById.get(c.usesSqlId);
    if (!baseRows || baseRows.length === 0) return null;
    const spec = {
      id: genId(), type: c.type, title: `${c.y} by ${c.x}`, limit: 200, filters: [],
      encodings: [
        { id: genId(), channel: "x" as const, field: c.x },
        { id: genId(), channel: "y" as const, field: c.y },
        ...(c.series ? [{ id: genId(), channel: "color" as const, field: c.series }] : []),
      ],
    };
    const sql = buildSQL(spec, ctx.tableName);
    const rows = (await runReadOnlyQuery(sql)) as Row[];
    if (!rows.length) return null;
    const artifact: Artifact = { kind: "chart", id: genId(), taskId: c.usesSqlId, title: spec.title, spec, rows: sanitizeJsonValue(rows) as Row[], sql };
    return artifact;
  });

  // Anomalies (pure math over realized rows; no LLM).
  const anomalies: Artifact[] = [];
  for (const check of plan.anomalyChecks) {
    const rows = rowsById.get(check.usesSqlId);
    if (!rows) continue;
    const found = detectAnomaly(rows, check.kind);
    if (found) anomalies.push({ kind: "insight", id: genId(), taskId: check.usesSqlId, title: found.title, body: found.body, severity: found.severity });
  }

  return [...tables, ...charts, ...anomalies].filter((a): a is Artifact => a !== null);
}
```

- [ ] **Step 4: Run → pass.** `pnpm vitest run src/features/data-formulator/core/swarm/compute.test.ts`

- [ ] **Step 5: Commit**

```bash
pnpm biome check --write src/features/data-formulator/core/swarm/compute.ts src/features/data-formulator/core/swarm/compute.test.ts
git add src/features/data-formulator/core/swarm/compute.ts src/features/data-formulator/core/swarm/compute.test.ts
git commit -m "feat(swarm): deterministic compute stage (SQL + anomaly math, zero LLM)"
```

---

### Task C3: NARRATE+VERIFY single call

**Files:**
- Create: `src/features/data-formulator/core/swarm/agents/answer.ts`

- [ ] **Step 1: Implement (streamed structured answer that self-checks against real rows)**

```ts
// src/features/data-formulator/core/swarm/agents/answer.ts
import { z } from "zod";
import type { InferenceScheduler } from "../scheduler";
import type { Artifact, SwarmContext, SwarmResult } from "../types";
import { artifactEvidence, contextBlock } from "./base";

const answerSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  evidence: z.array(z.string()),
  followUps: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
  usedRealData: z.boolean(),
});

const SYSTEM = [
  "You are Moudir writing the final manager answer from REAL queried data.",
  "Cite the actual numbers from the Findings — never invent or round away.",
  "Set usedRealData=false and confidence=low if the Findings say nothing was retrieved.",
  "Reply in the user's language (English/French/Tunisian Derja).",
].join(" ");

export async function runAnswer(
  scheduler: InferenceScheduler,
  ctx: SwarmContext,
  goal: string,
  artifacts: Artifact[],
  onToken?: (t: string) => void,
): Promise<SwarmResult> {
  const prompt = [
    contextBlock(ctx),
    ctx.userPrompt ? `User's question (match its language): ${ctx.userPrompt}` : "",
    `Goal: ${goal}`,
    artifactEvidence(artifacts), // REAL data block
    "Write the final structured answer; ground every claim in the Findings.",
  ].filter(Boolean).join("\n\n");

  const out = await scheduler.generateStructured(
    { model: ctx.model, system: SYSTEM, prompt, maxTokens: 700, temperature: 0.2, onToken },
    answerSchema,
  );

  const hasData = artifacts.some((a) => (a.kind === "table" || a.kind === "chart") && a.rows.length > 0);
  return {
    goal,
    headline: out.headline.trim(),
    summary: out.summary.trim(),
    evidence: out.evidence.map((e) => e.trim()).filter(Boolean),
    followUps: out.followUps.map((f) => f.trim()).filter(Boolean),
    // Confidence is mechanical: cap at low if the model claims real data but none exists.
    confidence: out.usedRealData && !hasData ? "low" : out.confidence,
    artifacts,
    modelUsed: ctx.model,
  };
}
```

- [ ] **Step 2: Commit**

```bash
pnpm biome check --write src/features/data-formulator/core/swarm/agents/answer.ts
git add src/features/data-formulator/core/swarm/agents/answer.ts
git commit -m "feat(swarm): single NARRATE+VERIFY answer call (folds synthesizer + critic)"
```

---

### Task C4: Replace the analysis branch in `runSwarm`

**Files:**
- Modify: `src/features/data-formulator/core/swarm/orchestrator.ts`

- [ ] **Step 1: Swap the planner→DAG→verify→synth block for the 2-call pipeline**

Replace everything from `const plan = await planSwarm(...)` through the synthesizer call with:
```ts
import { runAnalysisPlan } from "./agents/analyze";
import { compute } from "./compute";
import { runAnswer } from "./agents/answer";
import { validateArtifact } from "./agents/validate";
// ...
// ── Analysis tier: PLAN+SPEC → COMPUTE → NARRATE+VERIFY ──────────────────────
store.setPhase("planning");
const plan = await runAnalysisPlan(scheduler, runCtx);
store.setPhase("working");

const artifacts = await compute(scheduler, runCtx, plan);
// Deterministic gate: drop any artifact that hard-fails validation.
const clean = artifacts.filter((a) => !validateArtifact(a, runCtx).hardFail);
if (clean.length === 0) {
  throw new Error("No trustworthy data was produced for this question.");
}

store.setPhase("synthesizing");
const result = await runAnswer(scheduler, runCtx, plan.goal, clean, (t) => {
  /* streamed into the store by the screen */
});
store.complete(result, Date.now());
return result;
```

> The store's `planning → working → synthesizing` phases still fire, so the Moudir screen's choreography keeps working on the new 2-stage flow (no DAG lanes). Adjust the screen's per-task lane rendering in a follow-up if it assumes `plan.tasks` (see Task C5).

- [ ] **Step 2: Smoke test (manual)**

Run "why did success rate drop yesterday and what's driving it?". Confirm `scheduler.stats.llmCalls === 2` (plan + answer), real charts/tables render, and the answer cites real numbers.

- [ ] **Step 3: Lint + commit**

```bash
pnpm biome check --write src/features/data-formulator/core/swarm/orchestrator.ts
git add src/features/data-formulator/core/swarm/orchestrator.ts
git commit -m "refactor(swarm): analysis tier = 2 calls (plan+spec -> compute -> narrate+verify)"
```

---

### Task C5: Delete obsolete agents + reconcile the screen

**Files:**
- Delete: `agents/{query,chart,narrative,anomaly,synthesizer}.ts`, the `executeDag`/`WORKERS` machinery and the old `verify`/`planSwarm` imports in `orchestrator.ts`.
- Modify: `src/features/data-formulator/screens/MoudirSwarmScreen.tsx` (+ swarm canvas) to render the 3 phases instead of per-task DAG lanes.

- [ ] **Step 1: Find every consumer**

Run: `pnpm exec rg -n "planSwarm|executeDag|runCritic|runQueryAgent|runChartAgent|runNarrativeAgent|runAnomalyAgent|synthesize\\b" src` (or use the editor's references). Expected: matches only in `orchestrator.ts` + the screen/canvas.

- [ ] **Step 2: Delete the dead agent files and machinery**

```bash
git rm src/features/data-formulator/core/swarm/agents/query.ts \
       src/features/data-formulator/core/swarm/agents/chart.ts \
       src/features/data-formulator/core/swarm/agents/narrative.ts \
       src/features/data-formulator/core/swarm/agents/anomaly.ts \
       src/features/data-formulator/core/swarm/agents/synthesizer.ts \
       src/features/data-formulator/core/swarm/agents/critic.ts
```
Keep `base.ts` (shared helpers: `contextBlock`, `assertReadOnlySql`, `runTableArtifact`, `runChartArtifact`, `artifactEvidence`, `chartTypeEnum`) and `validate.ts`, `analyze.ts`, `lookup.ts`, `answer.ts`. Move `WorkerOutput`/`WORKERS`/`executeDag` out of `orchestrator.ts`. If anything outside the swarm imported a deleted agent, repoint it (the smoke step above lists them).

- [ ] **Step 3: Reconcile the screen**

In `MoudirSwarmScreen.tsx` (and the swarm canvas), replace per-task DAG lane rendering with the 3-phase indicator driven by `useSwarmStore().phase` (`planning → working → synthesizing → done`). Keep the result rendering (`result.headline/summary/evidence/artifacts`) unchanged. This honors the no-loading-theater preference.

- [ ] **Step 4: Run knip + the suite + lint**

```bash
pnpm vitest run src/features/data-formulator
pnpm biome check --write src/features/data-formulator
pnpm exec knip --include files || true   # surfaces any now-unused exports to clean up
```
Expected: tests pass; no references to deleted files.

- [ ] **Step 5: Commit**

```bash
git add -A src/features/data-formulator
git commit -m "refactor(swarm): remove per-task agents; render 3-phase pipeline"
```

---

# PHASE D — Optional caches (do after A–C are verified)

### Task D1: Semantic response cache (in-house)

**Files:**
- Create: `src/features/data-formulator/core/swarm/response-cache.ts` + test.

- [ ] **Step 1: Implement** an in-memory + userData-persisted LRU keyed by `{ embedding, question, datasetFingerprint, result }`. On `runSwarm` entry: `embedRaw([prompt])`, cosine-match the persisted vectors; on a hit `>= 0.92` AND matching `datasetFingerprint` (dataset id + column-name hash) AND an exact-normalized-question fast-path, return the stored `SwarmResult` with **0 LLM calls**. Invalidate on new dataset import. Conservative threshold to avoid wrong-answer collisions (telecom numbers).

- [ ] **Step 2: Test** the keying + threshold logic with injected vectors (mock `embedRaw`), mirroring `router.test.ts`. Verify a 0.95 match hits and a 0.80 match misses, and a different `datasetFingerprint` never hits.

- [ ] **Step 3: Wire** as a decorator at the top of `runSwarm` (before `ensureReady`); store the validated `SwarmResult` on miss. Commit.

### Task D2: SQL memoization

**Files:**
- Modify: `compute.ts`.

- [ ] **Step 1:** wrap `runReadOnlyQuery` calls in a `Map<string, Row[]>` keyed by `hash(canonicalSql) + datasetVersion`, scoped to the run (and optionally persisted per dataset version). Test the canonical-key function. Commit.

---

## Self-Review (completed)

- **Spec coverage:** ✅ router (B1), lookup 1-call (B2), PLAN+SPEC (C1), deterministic compute (C2), NARRATE+VERIFY (C3), validators + batched judge (A1–A3), warm prefix cache (A4), semantic + SQL cache (D1–D2), screen reconcile (C5). All design sections map to a task.
- **Type consistency:** `CriticVerdict`/`Artifact`/`SwarmResult`/`SwarmContext`/`ChartSpec` reused verbatim from `types.ts`; `runBatchedCritic`/`validateArtifact`/`isHighRisk`/`routeQuestion`/`classifyTier`/`warmRouter`/`runLookup`/`runAnalysisPlan`/`analysisPlanSchema`/`compute`/`detectAnomaly`/`runAnswer` names are used consistently across tasks.
- **Placeholder scan:** no TBD/“handle errors”/“similar to”. The one third-party unknown (`semantic-node-router`'s exact API) is handled by an explicit "confirm from installed `.d.ts`" step in B1, with our own cosine core as the verified, testable fallback so the task never depends on an unconfirmed method.
- **Known follow-ups:** the swarm screen (`MoudirSwarmScreen.tsx`) and canvas need the 3-phase reconcile in C5 — flagged, not silently dropped.
