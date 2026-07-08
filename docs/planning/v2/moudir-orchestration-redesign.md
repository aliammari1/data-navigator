# Design — Moudir Orchestration Redesign (fast offline LLM architecture)

**Date:** 2026-06-15 · **Status:** proposed design (awaiting approval) · **Engine:** node-llama-cpp stays (native GBNF grammar). **Scope:** rewrite only the orchestration layer (`src/features/data-formulator/core/swarm/`).

> Researched across 6 topics (TS agent frameworks · single-call pipelines · routing/cascades · caching · verification · reference architectures), each fact-checked against primary sources (overall confidence **high**). They all converge on one architecture.

---

## The decision: don't adopt a framework — fix the call graph

**No off-the-shelf TS agent framework wins here.** Every candidate either loses your single best feature (native grammar-constrained JSON), forces an HTTP sidecar, or is wrong-platform/heavyweight:
- **Vercel AI SDK** (Apache-2.0): great ergonomics, but its only in-process node-llama-cpp providers are **macOS-only** (`ai-sdk-llama-cpp`) or **stale/no structured output** (`nnance/llamacpp-ai-provider`). Keeping native GBNF means writing your *own* `LanguageModelV2` provider — ~same effort as your current thin adapter, plus a dependency. **No call-count win.**
- **Mastra** (Apache-2.0): local only via Ollama server; needs Node 22.13+, Postgres/LibSQL/vector stores — heavyweight for an offline Electron app.
- **LangGraph.js** (MIT): closest conceptual match (graph DAG), preserves GBNF via `ChatLlamaCpp.withStructuredOutput`, but pulls the LangChain tree and has documented node-llama-cpp v3 fragility. Only worth it if you need durable/resumable graph state (you don't).
- **LlamaIndex.TS**: routes "local" through an Ollama server — breaks your single-engine + scheduler model.
- **BAML / Instructor-JS / TypeChat / Outlines**: all **parse-or-retry after generation** (Instructor literally *re-asks* on failure = more calls on your slowest model) and most need an OpenAI-compatible endpoint. They *subtract* from your in-process GBNF guarantee.

**Verdict:** your `AIProvider` registry + `InferenceScheduler` + native `createGrammarForJsonSchema` are already best-in-class for this target. **Keep them. Rewrite the orchestration.** The ~12-call cost lives in `orchestrator.ts`, not the engine.

---

## Why it's slow (and unreliable) today
`runSwarm` = planner (1) → DAG of N workers (~1 each) → **critic, 1 call PER task** → synthesizer (1) = **~2 + 2N serialized calls** (N≈5 → ~12). Two compounding problems:
1. **Latency:** the LLM lane is correctly serialized (concurrency 1), so total latency = the *sum* of ~12 prefill+decode cycles on a 1.5B CPU model.
2. **Reliability:** compounding error — even at an optimistic 90 %/step, 12 steps ≈ 28 % end-to-end success; a 1.5B model is well under 90 %/step. The per-task critic is the worst offender: it spends N extra calls re-checking things that are *deterministic facts* (does the column exist? did rows come back?).

NL → SQL → chart → narrative is a **shared-context WRITE pipeline** (chart/narrative/anomaly must agree on the *same* figures). Per the 2025–26 multi-agent debate (Anthropic vs Cognition), that belongs on the **single-threaded** side, not a parallel-agent mesh. Anthropic's own guidance: "optimizing single LLM calls … is usually enough"; NVIDIA's SLM-agents paper: "verify by code, not by model."

---

## Target architecture — a 3-tier, ≤3-call pipeline

A new `routeQuestion()` runs **before** any LLM call; most questions never touch the full pipeline.

### Tier 0 — ROUTE (0 LLM calls)
Embed the question once with the **existing MiniLM** worker; cosine-match against per-intent exemplar vectors precomputed at warmup. Classify → `navigate | lookup | analysis`.
- **navigate** ("open the monitor", "go to forecasts") → `resolveRoute()` + return. **Zero LLM calls** (generalizes the planner's existing `navigateTo` short-circuit).
- Build navigation exemplars from the existing `APP_ROUTES` (label/hint/keywords); add ~5–10 French/English/Derja utterances per intent. Escalate on low cosine score (never answer wrong silently).
- **Dependency choice:** `semantic-node-router` (MIT, TS, zero-dep core, accepts a custom encoder so it reuses your MiniLM — do **not** use its bundled TransformersEncoder, that loads a 2nd model), **or** port its ~100-line cosine router (you already own `embedRaw()` + `cosineSimilarity()`). Recommend the port — fewer deps, matches your reuse-first preference.

### Tier 1 — LOOKUP (1 LLM call)
"top 5 channels", "revenue yesterday", "show X by Y" → skip planner/workers/critic/synth. **One** grammar-constrained call → `{ sql, headline, summary, confidence }`. Run the SQL read-only, render. **~12 → 1.**

### Tier 2 — ANALYSIS (2 calls, 3 worst case)
For "why did X drop", causal/multi-step questions:
1. **CALL #1 — PLAN+SPEC** (1 grammar-constrained call): one flat schema returns `{ goal, intent, reasoning (string FIRST), sqlSpecs:[{id,purpose,sql}], chartSpecs:[{usesSqlId,type,x,y,series}], anomalyChecks:[{usesSqlId,kind}] }`. Collapses planner + all worker "design" calls into one.
2. **COMPUTE** (0 LLM, IO lane concurrency 4): run every `sqlSpec` through read-only DuckDB and run `anomalyChecks` as plain TypeScript math over the realized rows — all overlapping. **The numbers are now facts, not model output.**
3. **CALL #2 — NARRATE+VERIFY** (1 streaming call): fed the goal + realized rows + computed anomalies → `{ headline, summary, evidence[], followUps[], confidence, usedRealData }`. Streamed for perceived latency. Folds synthesizer + critic into one self-checking pass.

### Verification — validators, then at most one judge (kills the N-critic multiplier)
- **Layer 1 (deterministic, 0 LLM, IO lane):** `validateArtifact(artifact, ctx)` — column ∈ `Set(ctx.columns)`, `rows.length > 0`, finite/non-negative numbers, chart encodings map to real fields, SQL read-only (already enforced). Hard fails are auto-rejected — **a 1.5B model is never allowed to overrule "this column doesn't exist."** `query.ts` already executes SQL with self-repair, so validity is proven upstream.
- **Layer 2 (one batched judge, only if needed):** for high-risk artifacts (narrative/anomaly/non-obvious charts) that pass Layer 1, ONE `generateStructured` call returns `z.array({taskId, accepted, reason, confidence})`. Runs whose tasks are all query/chart → **zero judge calls**.

**Result:** navigation = 0 calls, lookup = 1, analysis = 2 (3–4 worst case with an escalation re-narrate), vs ~12 today — and the dangerous failure modes (fabricated columns, empty/non-finite numbers) are caught *harder and faster* than the LLM critic caught them.

---

## Engine lever (do this regardless of tiers): warm prefix cache
Today the llamacpp adapter does a fresh **stateless** IPC `generate` per call, so the long, identical dataset-grounding prefix (schema + sample rows + role system text) is **re-prefilled on every one of the 2+2N calls**. Fix:
- Hold **one warm context/sequence per run**; `session.preloadPrompt(sharedPrefix)` once; each call appends only the **variable tail** (keep all variable content at the END or the cache misses). llama.cpp prefix-caches the identical prefix → roughly **~19× prompt-processing reduction** on the repeated prefix (vendor figure — measure on the real 4-core box).
- Scope the session to one `runId`, dispose on completion/abort (tie to `scheduler.cancel()`), and **keep `mlock`** on the 8 GB box. Validate single-sequence reuse on Windows (the per-call *context* churn that caused `STATUS_STACK_BUFFER_OVERRUN` was contexts, not sequences — but verify).

## Caching (later, optional, by ROI)
1. **Prefix-KV** (above) — biggest free win, no dependency.
2. **Semantic response cache** — embed the question (MiniLM), cosine-match a persisted `{embedding, question, datasetFingerprint, result}` store; hit above a **conservative ~0.92 threshold** + exact-normalized fast path → return stored `SwarmResult`, **0 LLM calls**. Key on question + datasetId + schema fingerprint; invalidate on new import. In-house (no GPTCache/hnswlib — Python/native-addon packaging cost).
3. **SQL memoization** — hash canonical SQL + dataset version in `scheduler.io()`.

---

## What changes in the code (no new runtime dependency)
- **NEW** `swarm/router.ts` — `routeQuestion()` (MiniLM tiers); precompute exemplar vectors at warmup.
- **NEW** `swarm/agents/validate.ts` — pure deterministic `validateArtifact()`.
- **REWRITE** `orchestrator.ts` — `route → (navigate | lookup-1-call | analysis: plan+spec → compute → narrate+verify)`; delete `executeDag` worker fan-out and the per-task `verify()`/`runCritic` loop; map `useSwarmStore` phases onto the new stages (the cinematic UI keeps working on fewer phases — fits "no loading-theater").
- **NEW** 2 flat Zod schemas (`AnalysisPlan`, `AnswerVerdict`) within the inlined GBNF subset (enums, ≤1 nesting level, no `$ref` — the bridge already inlines `$defs`, which the data shows is critical: small-model non-compliance jumps ~2–3 % → ~68 % when `$defs` are present).
- **EXTEND** llamacpp adapter + `electron/llama-service.ts` IPC with an optional `sessionId` for warm-prefix reuse + `preloadPrompt`.
- **UNCHANGED:** provider registry, `InferenceScheduler` (still concurrency 1 LLM / 4 IO), `zod-json-schema` bridge, transformers/webllm fallbacks, native GBNF path.
- The `query/chart/narrative/anomaly/critic/synthesizer` agent files become thin schema/prompt holders or are deleted.

---

## Phasing
- **Phase A (biggest ROI, low risk):** kill the per-task critic → deterministic validators + 1 batched judge; warm prefix cache. *(Stays on current swarm shape; ~12 → ~2+N.)*
- **Phase B:** Tier 0 router (navigation 0-call) + Tier 1 lookup (1-call). *(~2+N → 0–1 for the common cases.)*
- **Phase C:** collapse analysis to the 2-call PLAN+SPEC / NARRATE+VERIFY pipeline.
- **Phase D (optional):** semantic response cache + SQL memo.

## Risks (and mitigations)
- **Self-verify is weaker than an independent critic** → keep verify fields *mechanical* (usedRealData cross-checked in code), do the real check in code, allow ONE escalation re-narrate on low confidence.
- **Bigger single schema = longer decode** → cap spec lists (~3–4), keep schemas flat, tight maxTokens.
- **Router misclassification** (esp. Derja/Arabic — MiniLM is English-first) → conservative escalate-on-doubt threshold, add multilingual exemplars, lock with a labeled test set; planner fallback for low-confidence routes.
- **Prefix cache needs a byte-identical, frozen prefix** per run; **semantic cache** false-positives are the correctness risk → conservative threshold + dataset fingerprint + exact fast path.
- **Single warm sequence** reverses the current per-call isolation → scope to runId, dispose on cancel, validate on real Windows hardware.

---

## Sources (selected)
- cognition.ai/blog/dont-build-multi-agents · anthropic.com/engineering/building-effective-agents · arXiv 2506.02153 (NVIDIA SLM agents) · 12-factor agents (humanlayer)
- node-llama-cpp.withcat.ai/guide/grammar · /guide/chat-session · /api/classes/LlamaContextSequence · llama.cpp discussions #20574 (prompt cache)
- github.com/iohan/semantic-node-router (MIT) · github.com/aurelio-labs/semantic-router · lm-sys/RouteLLM
- SQL-of-Thought / ExeSQL / ReVeal verification papers (arXiv 2509.00581, 2506.11442) · vercel/ai#9002 (structured-output fallback)
