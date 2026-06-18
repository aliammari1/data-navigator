# Gap Audit — data-navigator

**Date:** 2026-06-15
**Method:** Multi-agent read-only audit. Six domain specialists (Electron, LLM architecture, DuckDB/query, security, Next.js/offline-first, system architecture) each swept their area for *missing* or *partial* logic, after an initial generic four-way pass. No code was modified.
**Scope reminder:** Offline-first Electron + Next.js 16 desktop app — a telecom report engine over `DailyTransactions` CSV, with local GGUF LLMs, DuckDB analytics, LAN collaboration, and document export. No internet at runtime; target is a medium-end PC.

> **Confidence note.** Findings are evidence-based with `file:line` citations but come from a read-only scan, not runtime reproduction. Items marked **[confirmed]** were independently re-verified during this audit. Treat the rest as strong leads to verify before acting.

---

## Executive summary

The **foundation is strong** and unusually mature for the feature count: a real AI provider registry, versioned Dexie migrations with `persist`/`migrate`/`partialize` discipline, an Arrow/pushdown data path, offline-correct WASM pinning (`allowRemoteModels:false`), and an architecture-guard script. There are **no crude `throw "not implemented"` stubs** — the codebase has been through a de-slop pass, and most former mock data is gone (documented in-code).

The debt is therefore subtler: **half-wired infrastructure** and **silent degradation**. Capabilities are built but not connected (offline RAG), abstractions exist but are bypassed (AI provider migration ~65% done), and failure paths return empty/fallback values instead of surfacing errors. Five themes, each independently corroborated by more than one specialist:

| Theme | One-line | Worst concrete instance |
|---|---|---|
| **A. Offline-AI core is least finished** | The flagship feature is the most broken on the constrained target | No tokenizer → silent context left-truncation drops the SQL guardrails |
| **B. "Generic data engine" is telecom-hardcoded** | Non-standard CSVs silently return empty panels | `period-queries.ts` references `ORIGINAL_AMOUNT`/`BRAND_D` literally |
| **C. Every interaction re-scans** | No session-level query cache; materialization can't run read-only | Each tab switch = full scan on 1M rows |
| **D. Collaboration has no authenticated principal** | Audit/approval integrity unenforced | Audit trail is a mutable CRDT any peer can wipe |
| **E. Electron hardening + offline leaks** | Correctness/packaging gaps | No single-instance lock → DuckDB corruption |

---

## Ranked master list (top items by leverage)

| # | Sev | Theme | Finding | Evidence |
|---|-----|-------|---------|----------|
| 1 | CRITICAL | E | **No single-instance lock** — two processes open the same DuckDB file → corruption/deadlock **[confirmed]** | `electron/main.ts` (no `requestSingleInstanceLock`) |
| 2 | HIGH | A | **No real tokenizer**; fixed 4096 context, no budget guard → prompt silently left-truncates, dropping system/SQL-guardrail rules first | `electron/llama-service.ts:436`, `:170` |
| 3 | HIGH | A | **Offline RAG/embeddings stack built but has zero consumers** — grounding is a whole-schema dump **[confirmed]** | `src/platform/ai/embeddings.ts` (only self-references) |
| 4 | HIGH | A/E | **Model download has no integrity gate** (`sha256:""`, `bytes:0`) and **no resume** → broken GGUF accepted, crashes loader **[confirmed]** | `src/platform/ai/models/model-manifest.ts:97-149`; `electron/model-download-service.ts:53-67,154-217` |
| 5 | HIGH | B | **Telecom columns hardcoded**, `ColumnMapping` ignored → empty panels, no error, on other CSVs | `period-queries.ts:143-151,188,405`; `report-engine.ts:27-69` |
| 6 | CRITICAL | D | **Audit trail is a mutable CRDT** — any peer can rewrite/wipe it | `platform/collab/collab-hub-doc.ts:395-410`; `collab-hub-crdt.ts:88-93` |
| 7 | CRITICAL | D | **Approval `by` is client-asserted**; role claimed in URL; no authenticated identity → forged sign-offs | `collab-hub-crdt.ts:367-374`; `lan-collab.ts:201-203` |
| 8 | HIGH | C | **No session query cache**; read-only DuckDB forces inline-CTE recompute → repeated full scans | `telecom/lib/queries.ts:1186-1206`; `period-queries.ts:85` |
| 9 | HIGH | E | **`voice-service.ts` uses `process.cwd()`** for model paths → voice fully broken in packaged MSI | `electron/voice-service.ts:79-93` |
| 10 | HIGH | E | **Pyodide fetched from CDN** at runtime; no bundle/offline guard **[confirmed]** | `src/workers/python-sandbox.worker.ts:48` |
| 11 | HIGH | E | **Architecture: AI-provider migration ~65% done** — 14 features bypass the registry and import `@mlc-ai/web-llm` directly, reintroducing the WebGPU dead-end | `report-studio/lib/insights.ts`, `geo-analysis/lib/ai-insights.ts`, +12 |
| 12 | HIGH | E | **Inverted platform boundary** — `platform/ai/provider/adapters/transformers.ts` imports the LLM engine *from a feature* | `transformers.ts:8` → `@/features/agent-canvas/core/llm` |
| 13 | HIGH | A | **Providers return `""` on failure** indistinguishably from success | `llm-engine.ts:113,119,138`; adapters `webllm/openai/ollama` |
| 14 | HIGH | E | **`file-store.ts` ships hardcoded mock files/folders as live initial state** | `src/core/stores/file-store.ts:22-70` |
| 15 | MED-HIGH | E | **DuckDB `close()` nulls refs without closing native handles** → WAL/file-lock leak on Windows | `electron/duckdb-service.ts:1614-1629` |
| 16 | HIGH | E | **`sandbox:false`** with no Node dependency justifying it; **no `will-navigate`/`setWindowOpenHandler`** guard | `electron/main.ts:715`; navigation handlers absent |
| 17 | HIGH | C | **DOCX vs PPTX produce different recommendations** for the same report; shared `insights.ts` exists but unused | `docx-generator.ts:399-407` vs `pptx-generator.ts:551-565` |
| 18 | HIGH | E | **No logging/error-boundary spine** — 0 `ErrorBoundary` components, scattered `console.*`, no durable local error log | repo-wide |

---

## Theme A — Offline-AI core (least finished part of the flagship)

1. **No tokenizer / unguarded context window.** `countTokens()` is `Math.ceil(len/4)` (`llama-service.ts:436`); context is hardcoded `4096` (`:170`). Nothing measures real prompt length, so wide-table prompts (schema + 5 JSON sample rows + findings + draft) silently exceed the window and `node-llama-cpp` left-truncates — dropping the system rules ("only SELECT", "use real columns") while keeping the tail. `finishReason` ("stop" vs "length") is also derived from the fake count, so truncation is undetectable.
2. **Embeddings/RAG unwired.** A full MiniLM-int8 worker stack (`embedTexts`, `semanticColumnMatch`, `semanticColumnRelations`, cosine sim) exists in `embeddings.ts` with **no callers anywhere** in `src/` **[confirmed]**. Grounding is the whole schema dumped into every agent prompt (`swarm/agents/base.ts:87`) — wasteful and brittle for a 1.5B model on a wide telecom schema.
3. **Model integrity + resume.** All `sha256`/`bytes` are `""`/`0` (`model-manifest.ts:97-149`); the download integrity branch is dead (`model-download-service.ts:189,221`), and there's no `Range:` resume — a 1GB interrupted download restarts from 0 and orphans the `.download` file **[confirmed]**.
4. **Silent `""` returns.** `generateText()` returns `""` for no-window / failed-init / empty-reply (`llm-engine.ts:113,119,138`); web-LLM/openai/ollama adapters pass it through as `finishReason:"stop"`. Downstream `JSON.parse("")` fails as "no JSON" rather than "model failed to load".
5. **Embeddings fallback is silent.** `semanticColumnMatch` catches *any* error and returns fabricated `0.8/0.1` substring scores with no signal (`embeddings.ts:73-82`); `isEmbeddingsReady()` is never consulted.
6. **Structured-output floor lane is weakest.** Only llamacpp (GBNF) and ollama/openai (native schema) get constrained decoding. transformers.js / web-LLM fall to "respond with ONLY JSON" + a one-pass repair (`structured.ts:113`) that doesn't handle truncated JSON (the llamacpp lane has `repairTruncatedJson`, not shared) → whole-generation retries 3× on CPU.
7. **No warmup/preload.** `preloadEmbeddings`/`preloadBrowserGenerator` exist but are never called; GGUF loads lazily on first `generate`. First question per session pays full cold-load (reads as a hang).
8. **Abort doesn't stop decoding.** `llm.worker.ts:159` suppresses chunk posts but the pipeline keeps decoding to completion; scheduler retries with no backoff/partial reuse → inference lane pinned for minutes.
9. **Chat-template assumption.** Every lane builds `[{system},{user}]` and assumes the runtime applies a chat template; if the tokenizer lacks `chat_template`, messages concatenate and the system boundary is lost (`llm.worker.ts:147`).
10. **No grounding/eval gate.** The only output guardrail is `assertReadOnlySql`; the critic is itself an unverified LLM whose failure is swallowed into `accepted:true` (`orchestrator.ts:161-169`) — rejected output still ships.

## Theme B — "Generic data engine" is telecom-hardcoded

1. **Hardcoded columns ignore `ColumnMapping`.** `fetchPeriodKPI`/`fetchSubStatusBreakdown`/`fetchDayBuckets`/`fetchBrandBreakdown` reference `ORIGINAL_AMOUNT`, `CUSTOMER_MSISDN`, `ACCOUNT_ID`, `BRAND_D`, `BRAND_NAME` as literals (`period-queries.ts:143-151,188,298,405`). Non-matching CSVs throw → caught → silent empty.
2. **Engine is a telecom reference dataset.** `report-engine.ts:27-69` hardcodes 51 columns + 200+ brand/account conditions. `hasTelecomRequiredColumns` only checks 8 of them, so partially-matching datasets pass the gate then hit missing columns in fallback paths.
3. **No runtime column-existence check.** `detectAvailableColumns` exists (`queries.ts:864`) but no query calls it before referencing derived names like `GENERATION_ACCOUNT_NAME` (`queries.ts:390,497`).
4. **Telecom vocabulary leaked into platform.** `platform/ai/report-ai.ts:25-199` hardcodes `canal`, `MSISDN`, `CHANNEL`, status buckets — domain logic in the "generic" layer.

## Theme C — Performance: repeated full scans

1. **Materialization permanently no-ops.** `ensureTelecomEnrichedView` always returns false (correct — renderer DuckDB is read-only) but there's **no result memoization**, so every KPI/hourly/canal/period query re-evaluates a 30-branch status CASE, an 80+-OR canal CASE, and 6 `TRY_STRPTIME` date attempts per row, on every tab switch (`queries.ts:1186-1206`). An in-process `Map` keyed on `(table+queryType+filterHash)` would eliminate it.
2. **N-scan report sections.** `getStatusSummary` fires 5 full scans; `getChannelStats` loops one scan per channel (16 for voice-fixed-ttcash) — the single-pass `COUNT(*) FILTER` pattern exists in `fetchSpecChannelStats` but isn't used here (`report-engine.ts:563,616`).
3. **No cache on `fetchFilteredCount`**; sort/page changes re-run the count scan; `SELECT *` projects all 50 columns for a 50-row page (`queries.ts:793,855`).
4. **Date-format bugs.** `fetchCustomerProfile` orders by `CAST(date AS VARCHAR)` (lexicographic, wrong for DD/MM/YYYY) (`queries.ts:701`); deep-analytics `CAST(date AS TIMESTAMP)` silently nulls all DD/MM/YYYY rows → blank time charts (`deep-analytics/lib/sql.ts:68,125`).
5. **Quoting bugs.** `sqlLiteral`/`qc` use `.replace` not `.replaceAll` (first-quote-only escape) in `status-definitions.ts:277`, `sql.ts:37,47`; `minAmount`/`maxAmount` interpolated without numeric coercion (`queries.ts:777`) — injection risk if `FilterState` is string-typed at runtime.

## Theme D — Collaboration: no authenticated principal

> Threat model is a trusted offline LAN, but these break against a single curious/mistaken/compromised participant — exactly the population an audit trail exists to constrain.

1. **Audit trail is mutable (CRITICAL).** It's a plain `Y.Array`; `clearAudit()` deletes the range and is wired to a "Clear All" button; a 500-cap lets an attacker flush history by appending noise. No signing/hash-chain/server-authoritative copy (`collab-hub-doc.ts:395-410`; `collab-hub-crdt.ts:88`; `AuditTrail.tsx:199`).
2. **Forged approvals (CRITICAL).** `setApprovalStatus({by})` takes a client-set `currentUserName()`; no binding to an authenticated identity, no reviewer check, no segregation of duties; approval history is itself CRDT-mutable (`collab-hub-crdt.ts:367-374`; `collab-hub-doc.ts:341-379`).
3. **Client-asserted role (CRITICAL).** The join URL carries `role=`; the server enforces read-only on the *claimed* role, so a peer can request `role=host`. `canMutateLAN()` is defined but never called on any write path (`lan-collab.ts:201-203,293-295`).
4. **Self-elevatable access gate.** `isAdmin = Boolean(user)` where "user" is just `localStorage`; the gate is presentational and renders children when connection state is `null` (`lan-access-gate.tsx:55-61`; `dashboard-client-shell.tsx:76`).
5. **Weak static credential, openly served.** A 6-digit non-rotating pairing code (default `123456`), no rate-limit/expiry/revocation; trusted peers keyed on client-chosen `peerId`; `GET /` returns the code in plaintext and `/lan/status`+`/lan/audit` are `CORS:*` with no credential — any origin/peer can read the code and roster (`lan-server.mjs:30,170,281-322,404-405`).
6. **Identity spoofing.** `peerId`/`peerName` are client-chosen and written to presence/audit/approval with no validation — impersonate anyone (`lan-collab.ts:161-162,396-406`).
7. **Plaintext `ws://`/`http://`** carries CRDT updates, approvals, and the pairing code (URL param) — accept-for-wired-LAN, breaks on shared Wi-Fi (`lan-server.mjs:301-302`).

## Theme E — Electron hardening + offline-first leaks + architecture

**Electron**
1. **No single-instance lock (CRITICAL) [confirmed].** Two processes → two DuckDB writers on one file → corruption/deadlock; also GPU contention for the GGUF context on an 8GB PC (`electron/main.ts`).
2. **Voice broken in packaged app.** `process.cwd()` resolves to the launch dir, not the asar root → every `voice:*` IPC fails; use `app.getAppPath()`/`getPath("userData")` (`voice-service.ts:79-93`). Native recognizers also never disposed on quit (`main.ts:934-946`).
3. **DuckDB `close()`** nulls JS refs without `.close()` on connections/instance → WAL not flushed, Windows file lock can block next launch (`duckdb-service.ts:1614`).
4. **Renderer hardening.** `sandbox:false` though the preload only uses `ipcRenderer`/`contextBridge`; no `will-navigate`/`setWindowOpenHandler`; no CSP injected in `onHeadersReceived` — together an XSS-to-main-process escalation path (`main.ts:715,892`).
5. **Auto-update applies unsigned builds silently** (Windows signing is env-gated; if absent, MSI is unsigned) with no user prompt (`main.ts:73-84`).
6. **Unbounded IPC inputs.** `llama:generate`/`generateStructured` accept arbitrary prompt/schema sizes (no Zod, unlike DuckDB handlers); deep `jsonSchema` can stall GBNF compilation on the main thread (`main.ts:519-601`). `collabHub:start` port/pairingCode unvalidated (`main.ts:671`). Multi-statement SQL can slip past `assertReadOnlySql` via `;` (`duckdb-service.ts:541`).
7. **Abort-controller leaks** on renderer destroy for both llama and download maps (`main.ts:512`).

**Offline-first (Next.js)**
8. **Pyodide CDN [confirmed]** (`python-sandbox.worker.ts:48`) — no bundle, error says "check your network" in an offline app.
9. **Google Fonts via `next/font/google`** — only offline-safe if the build ran online *and* the woff2 files are verified present in the asar; otherwise outbound to `fonts.gstatic.com` (`app/layout.tsx:2-39`).
10. **Server-dependent dashboard.** `dashboard/layout.tsx` is a `force-dynamic` Server Component doing `auth.api.getSession()` with no timeout/try-catch; settings/activity stores `fetch()` localhost with no server-readiness probe or retry queue → silent failures on cold Electron boot (`dashboard/layout.tsx:1-22`; `drizzle-storage.ts`; `auth.ts:17`).
11. **Mock data still shipping.** `file-store.ts:22-70` seeds 3 fake files + 3 fake folders (ids `"1"/"2"/"3"`) as unconditional initial state; `channel-monitor/lib/simulate.ts` renders synthetic health data with only a subtle badge as disclosure; `geo-analysis` expects a `public/maps/basemap.pmtiles` that doesn't exist (fallback works, but probe fires each mount with no skeleton).
12. **Missing Suspense/error boundaries** on ~20 of 30 dashboard routes; two routes use `<Suspense>` with no `fallback` (blank flash); `browser/page.tsx:42` swallows DuckDB fetch errors with `.catch(()=>{})`.

**Architecture (macro)**
13. **AI-provider migration ~65% done.** 28 files use the registry but **14 still import `@mlc-ai/web-llm`/`@huggingface/transformers` directly** (`report-studio/lib/insights.ts`, `geo-analysis/lib/ai-insights.ts`, `channel-monitor/lib/ai-suggestions.ts`, `ai-analysis/model/pipeline.ts`, `dashboard-home/lib/insight-prompt.ts`, `folders/hooks/useAutoOrganize.ts`, …) — capability routing and the WebGPU-safety demotion don't apply to them.
14. **Inverted platform boundary.** `platform/ai/provider/adapters/transformers.ts:8` imports the engine from `@/features/agent-canvas/core/llm`; `core/*` imports from `platform` and `features` (per `BACKLOG.md` Issue 2). `check:architecture` is red but informational, not a CI gate.
15. **Per-format report derivation diverges.** DOCX fallback = 5 static strings; PPTX = ~6 derived from success-rate thresholds — same report, different conclusions. A `report-studio/lib/insights.ts` seam exists but neither generator imports it.
16. **No observability/error spine.** Zero `ErrorBoundary` components; 29 files use raw `console.*`; perf RUM exists (`perfMetrics`) but there's no durable structured *error* log — failures are invisible and uncontained in a field-deployed offline app.
17. **Storage built ahead of consumers.** `app-db.ts` accessors with no callers: `putSavedQuery`, `putColumnProfile`, `addImportRecord`, `putReportDefinition`, `recordSettingsDrift`, `putCollabAnnotation` — the data-quality / import-history / settings-drift stories are schema'd but never produced or read.

---

## Export pipeline (detail under Theme C/E #15)

Beyond the recommendation divergence: XLSX ignores `primaryColor` (`xlsx-generator.ts:20`) and all logo/branding; DOCX never embeds the logo (PPTX/PDF do); the DOCX inline fallback drops the chart (`use-export-worker.ts:57`); the template library only switches tabs without applying presets (`ReportStudioScreen.tsx:85`); no CSV export despite `buildCsv` existing elsewhere; XLSX omits the period-over-period comparison sheet that DOCX/PDF include.

---

## Forecasting / reconciliation (detail under Theme B)

- Forecast engine sets a `degraded` flag (short/constant series) that **no consumer checks** → a flat forecast renders as if confident (`forecast-engine.ts:139`).
- Reconciliation `auto-map` fuzzy-matches column *names* only, never validates *values*/types (`auto-map.ts:47-78`).
- Anomaly z-score thresholds hardcoded, no sensitivity control (`period-queries.ts:479-482`); attribution "success" detection via `LIKE '%succe%'` can mis-match (`deep-analytics/lib/sql.ts:204`).

---

## Suggested workstreams (for later prioritization)

1. **Offline-AI reliability** (Theme A) — tokenizer + context-budget guard; wire embeddings RAG into column selection; stop `""`-on-failure. *Highest impact; it's the product's reason to exist.*
2. **Electron correctness** (Theme E #1–3) — single-instance lock; fix voice paths; model integrity + resume. *Small, concrete, prevents corruption and packaged-app breakage.*
3. **Generic-dataset correctness** (Theme B) — column-existence validation + honest errors.
4. **Collaboration integrity** (Theme D) — only if report sign-off/audit must be trustworthy; needs an authenticated principal, which is a larger design effort.
5. **Architecture gates** (Theme E #13–14) — make `check:architecture` + a "no direct AI-engine import" lint rule hard CI gates; this forces #1/#2 of the architecture debt closed and prevents regression.

---

*Generated by a multi-agent read-only audit. All findings cite `file:line`; re-verify any unmarked item against the live code before implementing, as the scan did not execute the app.*
