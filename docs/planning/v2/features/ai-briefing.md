# Feature Plan — ai-briefing — Auto-generated narrative briefings from data

**Maturity:** partial

## Performance issues

- Every LLM call runs on the React render thread via generateText() with stream:false — the entire 800-token generation blocks before any text appears, freezing the tab for seconds and showing only a skeleton; no token streaming despite the underlying providers supporting onToken.
- Data Story tab fires 3 concurrent generateText() calls (Promise.all) into a single web-llm engine — on a single-engine backend these serialize anyway but triple peak memory and prompt-eval cost; on transformers.js WASM they oversubscribe the one worker.
- AIBriefingScreen.tsx is a 1336-line client component with 4 heavy tab bodies all mounted/evaluated; motion/react animations, lucide icons, and skeletons are eagerly imported. No code-splitting per tab, no dynamic import of the LLM provider until click.
- Anomaly detection (runAnalysis) computes mean/std/z-scores synchronously on the main thread over SAMPLE_DATA arrays; fine for 20 values but the design hard-codes in-memory arrays and will block badly when wired to real columns (no SQL pushdown, no worker).
- JSON action-plan parsing uses a regex /\[[\s\S]*\]/ + JSON.parse with no schema validation and no native constrained decoding — frequent silent failures ('silent fail — user can retry') and re-generations, wasting full inference passes.
- Re-render churn: anomaly list re-maps and re-sorts on every keystroke of state; actionPlanItems.sort() mutates in render; large motion lists animate with per-item delay causing layout thrash.
- Read-Aloud uses window.speechSynthesis (OS voices) instead of the already-bundled sherpa/Kokoro TTS worker, so it is inconsistent, not offline-deterministic, and re-synthesizes the whole string with no sentence chunking or caching.

## Offline gaps

- Primary LLM path is @mlc-ai/web-llm (llm-engine.ts) which is WebGPU-REQUIRED with NO CPU fallback. On the medium-end / iGPU / Linux target WebGPU is frequently unavailable, so the entire feature silently fails with 'WebGPU not supported'. The repo already has a transformers.js (WASM-SIMD) adapter and a unified provider registry that ai-briefing does NOT use.
- Feature is hard-wired to SAMPLE_DATA — it never reads the user's real loaded dataset (useDataStore / runReadOnlyQuery exist but are unused here). 'Auto-generated briefings from data' currently briefs on fake data, so it is offline but meaningless.
- Read-Aloud depends on browser SpeechSynthesis voices which are OS/online-dependent and absent in packaged Electron with no system voices; the offline Kokoro/sherpa TTS stack already in the repo (voice-tts-worker.ts, sherpa-onnx-node) is not wired in.
- No persisted model-readiness or cached-weights signaling specific to briefings; relies on the legacy engine singleton with no IndexedDB/OPFS weight-cache awareness surfaced to the user.
- Exports are plain Blob/text downloads — fine offline, but no use of the bundled pdfmake/docx/exceljs export stack for branded, paginated, offline reports.

## Recommended dependencies

| Package | Category | Stars | Maint. | License | Offline | Replaces | Why | URL |
|---|---|---|---|---|---|---|---|---|
| `@huggingface/transformers (already a dep — make it the briefing default)` | LLM inference (WASM-SIMD/WebGPU auto) | 14-16k | Very active (v4.x, 2026) | Apache-2.0 | yes | @mlc-ai/web-llm as the PRIMARY briefing path | Guaranteed CPU/WASM-SIMD fallback when WebGPU is missing — the exact gap web-llm leaves. Already wrapped by the repo's transformersProvider + agent-canvas worker with token streaming. Switch ai-briefing off llm-engine.ts onto the provider registry so it works on the target hardware. | https://github.com/huggingface/transformers.js |
| `node-llama-cpp (Electron main/utility process)` | LLM inference (native GGUF) | 2.1k | Very active (v3.x, Mar 2026) | MIT | yes | prompt-and-repair JSON for structured briefing output (Electron) | In the Electron desktop build this is the fast primary engine: GGUF q4, auto GPU offload + CPU AVX, and crucially GBNF / JSON-schema GRAMMARS that make action-plan/anomaly JSON correct at the token level — eliminating the regex-parse-and-retry loop. Add as a 5th provider adapter (ProviderId 'llamacpp'). | https://github.com/withcatai/node-llama-cpp |
| `kokoro-js (already a dep)` | Offline neural TTS | n/a (Xenova/HF; Kokoro-82M model ~80M params) | Active (v1.2.x, 2026) | Apache-2.0 (MIT lib) | yes | window.speechSynthesis | Replace window.speechSynthesis for Read-Aloud with the bundled Kokoro worker (voice-tts-worker.ts) — deterministic, fully offline, sentence-chunked WAV. Already integrated in data-formulator; ai-briefing should reuse voice-output-player.tsx. | https://www.npmjs.com/package/kokoro-js |
| `sherpa-onnx-node (already a dep)` | Offline STT/TTS (Electron native) | 5k | Active (k2-fsa) | Apache-2.0 | yes | browser SpeechSynthesis in packaged app | Native-process TTS/STT path for the Electron build (Whisper-tiny + Kokoro already downloaded via scripts). Use for low-latency briefing narration without the WASM payload, and for future voice-driven 'brief me on X'. | https://github.com/k2-fsa/sherpa-onnx |
| `streamdown` | Streaming markdown renderer | ~3k (Vercel) | Very active (2026) | Apache-2.0 | yes | manual paragraph splitting + full re-render on each token | Briefings/stories/reports are markdown streamed token-by-token. Streamdown is a drop-in react-markdown replacement that handles incomplete/unterminated markdown during streaming, memoizes, and only re-renders changed blocks — far smoother than the current .split('\n\n').map(<p>) approach. Pin and self-host (no CDN). | https://github.com/vercel/streamdown |
| `comlink (already in radar/likely dep)` | Worker RPC | 12.6k | Active (GoogleChromeLabs) | Apache-2.0 | yes | main-thread generateText() calls | Wrap the briefing inference + anomaly stats workers behind a typed Proxy so all heavy work leaves the render thread. The agent-canvas LLM already runs in a worker; use Comlink to expose a single briefingWorker API (generate, detectAnomalies, narrate). | https://github.com/GoogleChromeLabs/comlink |
| `zod (already a dep)` | Schema validation | 34k+ | Very active | MIT | yes | hand-rolled regex JSON extraction | The provider layer already validates with Zod (parseStructured). Define BriefingSchema, ActionPlanSchema, AnomalyExplanationSchema and route every structured generation through generateStructured() instead of regex+JSON.parse, so failures are typed and recoverable. | https://github.com/colinhacks/zod |
| `@stdlib/stats` | Statistics (rigorous tests/distributions) | 5.8k | Active | Apache-2.0 | yes | ad-hoc z-score threshold for severity | For real anomaly reports beyond naive z>2.5: GESD/Grubbs critical values, robust MAD, distribution p-values. Modular imports keep bundle small; complements simple-statistics already in use. Run inside the stats worker. | https://github.com/stdlib-js/stats |
| `pdfmake (already in radar)` | Offline PDF export | 12.3k | Active | MIT | yes | plain Blob text download | Turn the TXT-download briefings/anomaly reports into branded, paginated offline PDFs (executive summary + metrics table + narrative). Auto-paginates large anomaly tables; run in a worker/main. | https://github.com/bpampuch/pdfmake |
| `docx (already in radar)` | Offline DOCX export | 5.8k | Very active | MIT | yes | TXT-only export | Management often wants editable .docx of the executive narrative/action plan. Zero native deps, works in browser+Node, fully offline. | https://github.com/dolanmiu/docx |

## CLIs & tools

| Tool | Type | Offline | Why | URL |
|---|---|---|---|---|
| `transformers.js (Web Worker, WASM-SIMD)` | library | yes | Default offline briefing engine with CPU fallback; weights cached to IndexedDB after first download. | https://github.com/huggingface/transformers.js |
| `node-llama-cpp + GBNF grammar` | library | yes | Electron-native engine with token-level JSON-schema constrained decoding for reliable structured briefing output. | https://github.com/withcatai/node-llama-cpp |
| `Kokoro-82M ONNX via kokoro-js` | model | yes | On-device neural narration of briefings; sentence-chunked WAV, no network. | https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX |
| `size-limit (per-route/per-worker budget)` | cli | yes | Add a budget for the ai-briefing route + briefing worker so lazy-loaded LLM/TTS chunks don't regress first paint. Runs fully offline. | https://github.com/ai/size-limit |
| `@lhci/cli (Lighthouse CI vs localhost)` | cli | yes | Measure TBT/INP of the briefing tab against bundled Chromium offline to prove main-thread work moved to workers. | https://github.com/GoogleChrome/lighthouse-ci |
| `react-scan` | library | yes | Detect the anomaly-list / action-plan re-render churn during dev (install as dep, not CDN). | https://github.com/aidenybai/react-scan |
| `tinybench (via Vitest bench)` | cli | yes | Microbench the anomaly stats worker (z-score/MAD/GESD) on real column sizes to set a perf budget. | https://github.com/tinylibs/tinybench |

---

# Deep Improvement Plan — `ai-briefing` (Auto-generated narrative briefings)

## 0. TL;DR for the team

The `ai-briefing` feature is a visually-polished, 4-tab "AI Intelligence Suite" (Daily Briefing, Anomaly Report, Action Plan, Data Story) but it has **three structural problems** that make it both slow and offline-broken on the target hardware:

1. **Wrong engine.** It calls `@/platform/ai/llm-engine` (`generateText`), which is a thin wrapper over **`@mlc-ai/web-llm`** — a **WebGPU-required** engine with **no CPU fallback**. On a medium-end PC / iGPU / Linux (where WebGPU is frequently unavailable), the feature dies with `"WebGPU not supported — try Chrome 113+ or Edge"`. The repo **already ships** a unified, offline-first provider registry (`@/platform/ai/provider`) with a **transformers.js WASM-SIMD adapter** that has the exact fallback we need — `ai-briefing` simply doesn't use it.

2. **Fake data.** The whole feature briefs on a hard-coded `SAMPLE_DATA` constant. The product promise is "auto-generated narratives **from data**" but it never touches the user's real loaded dataset (`useDataStore` / `runReadOnlyQuery` exist and are unused here).

3. **Main-thread, non-streaming, unvalidated.** Every generation runs with `stream: false` on the render thread, freezing the tab for seconds with only a skeleton; structured output (action plan) is recovered with a regex + `JSON.parse` that "silently fails"; Read-Aloud uses `window.speechSynthesis` instead of the already-bundled **Kokoro/sherpa offline TTS**.

The fix is **mostly consolidation onto infrastructure that already exists in this repo**, plus a worker boundary, token streaming, schema-constrained decoding, and real-data wiring. New dependencies are minimal (`streamdown`, optionally `node-llama-cpp` for the Electron native path).

---

## 1. Current implementation (file-by-file)

### 1.1 Route
`src/app/dashboard/ai-briefing/page.tsx` (10 lines) — a `Suspense` wrapper around `AIBriefingScreen`. No `dynamic()` splitting, no streaming boundary, no per-tab lazy load.

### 1.2 Screen
`src/features/ai-briefing/screens/AIBriefingScreen.tsx` (**1336 lines**, single `"use client"` file). Structure:

- `SAMPLE_DATA` (lines 56–77): hard-coded telecom day with `channels[]` and `numericValues{}`.
- `formatDateTime`, `SpeakingAnimation`, `LLMNotReadyBanner`, `LLMLoadingBar` helpers.
- **Tab 1 `DailyBriefingTab`** (151–503): `generateBriefing()` and `generateSummary()` call `generateText(prompt, {systemPrompt, maxTokens:800, temperature})`. `readAloud()` (240–251) uses `window.speechSynthesis`. Export via `Blob` + `a.click()`.
- **Tab 2 `AnomalyReportTab`** (521–827): `runAnalysis()` (538) computes `ss.mean`/`ss.standardDeviation` and `z>2.5` **synchronously on the main thread** over `SAMPLE_DATA.numericValues`. `explainAnomaly()` (579) fires **two concurrent** `generateText` calls (`Promise.all`) per anomaly; hypotheses parsed by `split('\n').filter(startsWith('-'))`. SQL string is **templated, not validated**.
- **Tab 3 `ActionPlanTab`** (831–1036): `generatePlan()` (846) prompts for a JSON array, then `raw.match(/\[[\s\S]*\]/)` + `JSON.parse` with **no Zod validation**; on failure `// silent fail — user can retry`. `.sort()` runs in render (977).
- **Tab 4 `DataStoryTab`** (1048–1251): `generateStory()` fires **3 concurrent** `generateText` calls (`Promise.all`, 1079) for the three "acts".
- **Main `AIBriefingScreen`** (1255–1336): subscribes to `getLLMEngineState()/subscribeLLMEngine`, renders all 4 tab bodies under shadcn `Tabs` (all mounted).

### 1.3 Store
`src/features/ai-briefing/store/briefing-store.ts` (93 lines) — persisted Zustand store: `lastBriefing`, `actionPlanItems`, `briefingHistory` (capped 5). Solid and offline-safe; keep mostly as-is. Persists to `localStorage` (default `persist`), which is fine for small text but should move to IndexedDB for larger histories (see §5.6).

### 1.4 Engine it depends on (the core problem)
`src/platform/ai/llm-engine.ts` (161 lines):
- `LLMModelId` is a union of **MLC web-llm** ids (`Qwen2-0.5B-Instruct-q4f16_1-MLC`, …).
- `initLLMEngine` does `await import("@mlc-ai/web-llm")` → `CreateMLCEngine(...)`. The catch block special-cases `"webgpu"` → `"WebGPU not supported"`.
- `generateText` always uses `stream: false`.

This is the single most impactful thing to replace.

### 1.5 Infrastructure ai-briefing ignores (but should use)

- **Unified provider layer** `src/platform/ai/provider/` — `types.ts` (AIProvider contract with `capabilities.requiresWebGPU`, `streaming`, `structuredNative`, `offline`), `registry.ts` (`pickDefaultProvider`, `detectAvailability`), `structured.ts` (`parseStructured`, `extractJsonBlock`, `repairJson`, `buildJsonInstruction`), `use-ai.ts` (`useAI()` hook with `generate`/`generateStructured`), and adapters: `webllm.ts`, **`transformers.ts`** (WASM-SIMD, streaming, `requiresWebGPU:false`), `ollama.ts`, `openai.ts`.
- **Transformers worker** `src/features/agent-canvas/core/llm.ts` — `loadLLM({modelId, preferredDevice:'auto', onProgress, signal})`, `chat(system, user, {maxTokens, temperature, onToken, signal})` with **token streaming** (`createStreamer`, line ~580), `getLLMStatus`, `isLoaded`, `unloadLLM`.
- **Offline TTS** `src/features/data-formulator/core/voice/voice-tts-worker.ts` (Kokoro-82M ONNX, sentence chunking, WAV/PCM, cancellation) + `voice-output-player.tsx` (play/pause/seek UI) + `sherpa-onnx-node` for Electron-native TTS.
- **Stats engine** `src/platform/ai/insights.ts` — `detectAnomalies(values, columnName)` (z-score **and** IQR, severity tiers, capped 20), `pearsonCorr`, etc. ai-briefing reimplements a weaker z-only version inline.
- **Real data access** `useDataStore` (`getActiveDataset`, `ColMeta`) and `runReadOnlyQuery(sql)` from `@/platform/duckdb/duckdb` (native DuckDB in Electron, streams Arrow).

---

## 2. Performance bottlenecks and exact fixes

### 2.1 Main-thread, non-streaming generation (highest impact)

**Problem.** `generateText(..., stream:false)` resolves only after the **entire** 800-token completion. With a 0.5–1.7B model on WASM-SIMD that is multiple seconds of *nothing* (skeleton), and the call sits on the React thread.

**Fix.** Route through the provider's **streaming** path and a worker. The transformers adapter already supports `onToken`. Stream into local state and render with `streamdown`.

```tsx
// hooks/useBriefingGeneration.ts
import { useCallback, useRef, useState } from "react";
import { useAI } from "@/platform/ai/provider";

export function useStreamingGeneration() {
  const ai = useAI();                         // picks default offline provider (transformers/WASM)
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (system: string, prompt: string, maxTokens = 700) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setText(""); setBusy(true);
    try {
      let acc = "";
      await ai.generate({
        model: "",                            // empty => provider default model
        system, prompt, maxTokens, temperature: 0.6,
        signal: ac.signal,
        onToken: (t) => { acc += t; setText(acc); },   // incremental render
      });
    } finally { setBusy(false); }
  }, [ai]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);
  return { text, busy, run, cancel };
}
```

```tsx
// render with streamdown instead of split("\n\n").map(<p>)
import { Streamdown } from "streamdown";
<Streamdown>{text}</Streamdown>     // handles unterminated markdown mid-stream, memoized
```

This gives **first token in <1s perceived latency**, cancelable generation, and no full-document re-render per token.

### 2.2 Concurrent generations oversubscribe the single engine

**Problem.** `DataStoryTab` and `explainAnomaly` use `Promise.all` of 2–3 generations against **one** engine instance. On a single-worker transformers backend these queue head-of-line and **triple peak KV-cache memory** if the engine ever parallelizes.

**Fix.** Generate **sequentially** and **stream each act** as it completes, or — better — make it **one prompt** that returns a structured 3-act object via constrained decoding (§2.4). Sequential + streaming feels faster than a 3-way `Promise.all` that blocks until all finish.

```tsx
for (const act of ["setup","conflict","resolution"] as const) {
  await run(SYSTEM_BY_ACT[act], buildActPrompt(act, ctx));  // streams into that act's slot
}
```

### 2.3 Stats on the main thread + no SQL pushdown

**Problem.** `runAnalysis` iterates arrays on the render thread. Fine for 20 sample values; catastrophic when wired to real columns of 100k+ rows (the stated goal).

**Fix.** (a) **Push aggregation to DuckDB** so the JS never sees raw rows; (b) run the residual z/MAD/GESD pass in a **Comlink stats worker**.

```ts
// SQL pushdown: per-numeric-column stats in one query (DuckDB native, streams)
const stats = await runReadOnlyQuery(`
  SELECT '${col}' AS col,
         avg("${col}")                       AS mean,
         stddev_samp("${col}")               AS std,
         quantile_cont("${col}", 0.25)       AS q1,
         quantile_cont("${col}", 0.75)       AS q3,
         min("${col}") AS lo, max("${col}") AS hi, count(*) AS n
  FROM "${table}" WHERE "${col}" IS NOT NULL`);
// Then pull ONLY the outlier rows (z>3 by SQL), never the whole column:
const outliers = await runReadOnlyQuery(`
  SELECT "${col}" FROM "${table}"
  WHERE abs(("${col}" - ${mean}) / ${std}) > 3 LIMIT 50`);
```

```ts
// stats.worker.ts (Comlink) for anything not expressible in SQL (MAD, GESD, S-H-ESD)
import * as Comlink from "comlink";
import { detectAnomalies } from "@/platform/ai/insights";    // reuse existing engine
Comlink.expose({ detectAnomalies });
```

### 2.4 Unvalidated structured output → wasted full inferences

**Problem.** Action-plan parsing is `raw.match(/\[[\s\S]*\]/) + JSON.parse` with no schema; on malformed output the user must regenerate an **entire 800-token pass**.

**Fix.** Route through `generateStructured(req, schema)` (already in the provider). In **Electron**, add a `node-llama-cpp` adapter that uses **GBNF / JSON-schema grammars** so the model *cannot* emit invalid JSON.

```ts
import { z } from "zod";

export const ActionPlanSchema = z.object({
  items: z.array(z.object({
    priority: z.number().int().min(1).max(5),
    category: z.enum(["critical","high","medium","low"]),
    action: z.string().min(4),
    rationale: z.string().min(4),
    estimatedImpact: z.string().min(2),
  })).length(5),
});

const ai = useAI();
const plan = await ai.generateStructured(
  { model: "", system: ACTION_SYSTEM, prompt: actionPrompt, maxTokens: 700, temperature: 0.3 },
  ActionPlanSchema,            // browser: prompt+repair+Zod; Electron: GBNF-constrained, always valid
);
addActionItems(plan.items);
```

`node-llama-cpp` grammar wiring (Electron main, exposed over IPC):

```ts
import { getLlama, LlamaChatSession } from "node-llama-cpp";
const llama = await getLlama();
const model = await llama.loadModel({ modelPath });      // GGUF q4 on disk
const ctx = await model.createContext();
const session = new LlamaChatSession({ contextSequence: ctx.getSequence() });
const grammar = await llama.createGrammarForJsonSchema(zodToJsonSchema(ActionPlanSchema));
const res = await session.prompt(actionPrompt, { grammar });   // guaranteed schema-valid JSON
```

### 2.5 Re-render churn

**Problems.** `actionPlanItems.sort()` mutates during render (977); anomaly `.map` rebuilds on each `setAnomalies`; `motion` lists animate every item with `delay: idx*0.08`.

**Fixes.**
- Sort with a memo: `const sorted = useMemo(() => [...items].sort((a,b)=>a.priority-b.priority), [items]);`
- Memoize each row: `const Row = memo(function Row({item}){...})`.
- Cap the entrance animation to the first ~8 items; for longer lists drop per-item `delay` (use a single container fade).
- Use `react-scan` in dev to confirm the churn is gone.

### 2.6 Bundle / code-splitting

**Problem.** 1336-line client component imports `motion/react`, all lucide icons, all 4 tabs, and (transitively) the LLM provider eagerly.

**Fixes.**
- Split each tab into its own file under `components/` and `dynamic(() => import(...), { ssr:false })` the inactive tabs (TanStack `Tabs` with lazy content).
- Lazy-import the provider only on first generate (`const { useAI } = await import(...)` is already deferred by the worker, but ensure web-llm/transformers chunks are not in the route's initial JS).
- Add a **size-limit** entry: `{ path: ".next/.../ai-briefing*.js", limit: "180 KB" }` and a separate budget for the briefing worker.

---

## 3. Offline gaps and how to close them

| Gap | Current | Fix |
|---|---|---|
| WebGPU-only engine | `llm-engine.ts` → web-llm, no CPU fallback | Switch to `useAI()`/provider registry; default to **transformers.js WASM-SIMD** (`requiresWebGPU:false`); use web-llm only as an *opportunistic upgrade* when `navigator.gpu` exists. |
| Fake data | `SAMPLE_DATA` | Wire `useDataStore.getActiveDataset()` + `runReadOnlyQuery` to build the briefing context from the user's real dataset (keep SAMPLE_DATA only as an empty-state demo). |
| Browser TTS | `window.speechSynthesis` | Reuse `voice-tts-worker.ts` (Kokoro-82M ONNX) + `voice-output-player.tsx`; in Electron use `sherpa-onnx-node`. Sentence-chunked, deterministic, offline. |
| Model weight UX | engine singleton, no cache signal | Surface `navigator.storage.persist()` + cached-weights state; show "model cached, works offline" once downloaded. |
| Exports | TXT Blob only | Add offline `pdfmake`/`docx` exports for management-ready reports. |

**Provider selection sketch (offline-first):**

```ts
import { pickDefaultProvider } from "@/platform/ai/provider";
// Prefer transformers (WASM, always available) unless WebGPU is present AND user opts into web-llm.
const prefer = (typeof navigator !== "undefined" && "gpu" in navigator) ? undefined : "transformers";
const provider = await pickDefaultProvider(prefer);
```

---

## 4. Better architecture (step-by-step)

### 4.1 Target module layout

```
src/features/ai-briefing/
  screens/AIBriefingScreen.tsx        // thin shell: header + Tabs + lazy tab imports
  components/
    DailyBriefingTab.tsx
    AnomalyReportTab.tsx
    ActionPlanTab.tsx
    DataStoryTab.tsx
    BriefingNarrator.tsx              // wraps voice-output-player + Kokoro worker
    ModelStatusBar.tsx               // provider/readiness/cache UI
  core/
    briefing-context.ts              // builds context from REAL dataset (DuckDB SQL pushdown)
    briefing-prompts.ts              // system+user prompt builders (typed)
    briefing-schemas.ts              // Zod schemas (ActionPlan, StoryActs, AnomalyExplain)
    briefing.worker.ts               // Comlink: generate(stream) + stats (reuses insights.ts)
  hooks/
    useStreamingGeneration.ts
    useBriefingContext.ts            // memoized real-data context
  store/briefing-store.ts            // keep; move persistence to IndexedDB
```

### 4.2 Real-data context builder (replaces SAMPLE_DATA)

```ts
// core/briefing-context.ts
import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import { useDataStore } from "@/core/stores/data-store";

export interface BriefingContext {
  datasetName: string; rowCount: number;
  numericCols: { name: string; mean: number; std: number; min: number; max: number }[];
  topCategories?: { dimension: string; values: { label: string; count: number }[] };
}

export async function buildBriefingContext(table: string, cols: ColMeta[]): Promise<BriefingContext> {
  const numeric = cols.filter(c => c.type === "number");
  const aggSelects = numeric.map(c =>
    `avg("${c.name}") AS "${c.name}__mean", stddev_samp("${c.name}") AS "${c.name}__std",
     min("${c.name}") AS "${c.name}__min", max("${c.name}") AS "${c.name}__max"`
  ).join(", ");
  const [agg] = await runReadOnlyQuery(
    `SELECT count(*) AS n${aggSelects ? ", " + aggSelects : ""} FROM "${table}"`
  );
  // ... assemble BriefingContext from agg (no raw rows ever materialized in JS)
}
```

### 4.3 Prompt builders (typed, deterministic)

```ts
// core/briefing-prompts.ts
export function buildDailyBriefingPrompt(ctx: BriefingContext): { system: string; prompt: string } {
  return {
    system: "You are a professional data analyst. Write a 3-paragraph spoken briefing in a news-anchor style: overall performance, key drivers, then concerns. Markdown only.",
    prompt: `Dataset "${ctx.datasetName}", ${ctx.rowCount.toLocaleString()} rows. ` +
      ctx.numericCols.map(c => `${c.name}: mean ${c.mean.toFixed(2)} (σ ${c.std.toFixed(2)}, ${c.min}–${c.max}).`).join(" "),
  };
}
```

### 4.4 The worker boundary

```ts
// core/briefing.worker.ts
import * as Comlink from "comlink";
import { loadLLM, chat } from "@/features/agent-canvas/core/llm";   // transformers.js worker-side
import { detectAnomalies } from "@/platform/ai/insights";

const api = {
  async ensure(model: string, onProgress: (p:number)=>void) {
    await loadLLM({ modelId: model, preferredDevice: "auto", onProgress: (p)=>onProgress(p) });
  },
  async generate(system: string, user: string, onToken: (t:string)=>void, maxTokens: number) {
    return chat(system, user, { maxTokens, temperature: 0.5, onToken });
  },
  detectAnomalies,
};
export type BriefingWorkerApi = typeof api;
Comlink.expose(api);
```

```ts
// hooks/useBriefingWorker.ts
import * as Comlink from "comlink";
import type { BriefingWorkerApi } from "../core/briefing.worker";
const worker = new Worker(new URL("../core/briefing.worker.ts", import.meta.url), { type: "module" });
export const briefingApi = Comlink.wrap<BriefingWorkerApi>(worker);
// onToken must be wrapped: briefingApi.generate(sys, user, Comlink.proxy(t => append(t)), 700)
```

### 4.5 Offline narration (replace speechSynthesis)

```tsx
// components/BriefingNarrator.tsx
import { VoiceOutputPlayer } from "@/features/data-formulator/components/voice-output-player";
// drive the existing Kokoro voice-tts-worker: post { type: "speak", text, mode: "full" }
// receive WAV bytes -> feed to VoiceOutputPlayer (play/pause/seek/replay), fully offline.
```

### 4.6 Tabs become thin + lazy

```tsx
// screens/AIBriefingScreen.tsx
const DailyBriefingTab = dynamic(() => import("../components/DailyBriefingTab"), { ssr:false });
const AnomalyReportTab = dynamic(() => import("../components/AnomalyReportTab"), { ssr:false });
// ... only the active TabsContent mounts; provider chunk loads on first generate.
```

### 4.7 Offline export (management-ready)

```ts
// pdfmake (run in worker/main): metrics table + streamed narrative
import pdfMake from "pdfmake/build/pdfmake";
import vfs from "pdfmake/build/vfs_fonts";
pdfMake.vfs = vfs.pdfMake.vfs;
const doc = { content: [
  { text: `Executive Briefing — ${ctx.datasetName}`, style: "h1" },
  { table: { body: metricsRows } },
  { text: briefingText },              // markdown stripped to text or rendered
]};
pdfMake.createPdf(doc).download(`briefing-${date}.pdf`);
```

---

## 5. Recommended dependencies (offline, mature)

| Dep | Stars | Maint. | License | Offline | Why |
|---|---|---|---|---|---|
| @huggingface/transformers (already dep — make primary) | 14-16k | Very active v4.x | Apache-2.0 | yes | WASM-SIMD CPU fallback — fixes the WebGPU-only failure. Already wrapped by `transformersProvider` with streaming. |
| node-llama-cpp (Electron) | 2.1k | Very active v3.x (Mar 2026) | MIT | yes | Native GGUF + **GBNF/JSON-schema grammars** → always-valid action-plan/anomaly JSON; eliminates regex-parse-retry. |
| kokoro-js (already dep) | — (Kokoro-82M) | Active v1.2 | Apache-2.0 | yes | Offline neural narration; replaces `speechSynthesis`. Worker already exists. |
| sherpa-onnx-node (already dep) | 5k | Active | Apache-2.0 | yes | Native Electron TTS/STT path; models pre-downloaded. |
| streamdown | ~3k (Vercel) | Very active 2026 | Apache-2.0 | yes | Streaming markdown renderer; handles unterminated markdown, memoized; replaces `split('\n\n').map(<p>)`. |
| comlink | 12.6k | Active | Apache-2.0 | yes | Typed worker RPC for the briefing/stats worker. |
| zod (already dep) | 34k+ | Very active | MIT | yes | Schema validation via existing `generateStructured`/`parseStructured`. |
| @stdlib/stats | 5.8k | Active | Apache-2.0 | yes | Rigorous anomaly tests (GESD/MAD/p-values) in the stats worker. |
| pdfmake | 12.3k | Active | MIT | yes | Offline paginated PDF briefings. |
| docx | 5.8k | Very active | MIT | yes | Editable DOCX export of narratives/action plans. |

**Hold/avoid:** `@mlc-ai/web-llm` as a *primary* path (keep only as an opportunistic WebGPU upgrade); `window.speechSynthesis` (not deterministic offline). Verified web-llm has no WASM/CPU fallback and fails on iGPU/Linux (mlc-ai/web-llm issues #783, #609).

---

## 6. CLIs & tools to build/verify offline

- **size-limit** (`@size-limit/preset-app` + time plugin) — per-route + per-worker byte/eval budgets for `ai-briefing`. Runs offline.
- **@lhci/cli** — Lighthouse vs localhost/bundled Chromium; assert TBT/INP improvements after moving work to workers.
- **react-scan** — dev-time detection of the anomaly/action-plan re-render churn.
- **tinybench** (via Vitest `bench`) — microbench the stats worker (z/MAD/GESD) at real column sizes; set a budget.
- **knip** — confirm the old `llm-engine.ts` import is removed from `ai-briefing` and no dead exports remain.
- **binaryen / wasm-opt** — if any first-party WASM is vendored for stats, shrink + enable SIMD at build time.
- **dependency-cruiser** — add a rule forbidding `features/ai-briefing` from importing `platform/ai/llm-engine` directly (force it through `platform/ai/provider`).

Example verification loop (all offline):

```bash
pnpm size-limit                       # route + worker budgets
pnpm vitest bench src/features/ai-briefing
pnpm lhci autorun --collect.url=http://localhost:3000/dashboard/ai-briefing
pnpm knip && pnpm depcruise src/features/ai-briefing
```

---

## 7. Phased task list

### P1 — Correctness & offline survival (highest value, low risk)
1. **Lock behavior with tests first**: snapshot current tab UI + store actions (regression net) before refactor.
2. **Swap engine**: replace all `generateText`/`getLLMEngineState` usage in `AIBriefingScreen.tsx` with `useAI()` from `@/platform/ai/provider`; default to transformers (WASM) via `pickDefaultProvider("transformers")` unless `navigator.gpu` exists. *Outcome:* feature works with no WebGPU.
3. **Token streaming + cancel**: add `useStreamingGeneration` (`onToken`, `AbortController`); render with `streamdown`. Remove `split('\n\n').map`.
4. **Schema-validate structured output**: define `briefing-schemas.ts`; route Action Plan and Story through `generateStructured`. Kill the regex/`JSON.parse`/"silent fail" path.
5. **Replace Read-Aloud**: wire `BriefingNarrator` to the existing Kokoro `voice-tts-worker` + `voice-output-player`; drop `window.speechSynthesis`.
6. **dependency-cruiser rule** forbidding direct `llm-engine` import from this feature.

### P2 — Real data + performance
7. **Real-data context**: implement `buildBriefingContext` with DuckDB SQL pushdown; feed it to prompt builders; keep `SAMPLE_DATA` only as empty-state demo.
8. **Worker boundary**: move generation + stats into `briefing.worker.ts` (Comlink); reuse `insights.detectAnomalies`. SQL-pushdown the per-column stats; pull only outlier rows.
9. **Sequential/structured story**: replace 3-way `Promise.all` with sequential streamed acts (or one constrained 3-act object).
10. **Re-render fixes**: `useMemo` sort, `memo` rows, cap entrance animation, verify with `react-scan`.
11. **Code-split tabs**: `dynamic()` per tab; add `size-limit` budgets.

### P3 — Electron-native + reporting polish
12. **node-llama-cpp adapter** (`ProviderId 'llamacpp'`) in Electron main with **GBNF/JSON-schema grammars**; expose over IPC; prefer it on desktop.
13. **sherpa-onnx-node TTS** path for packaged Electron narration.
14. **Offline exports**: `pdfmake` (paginated PDF) and `docx` (editable) for briefings/anomaly reports/action plans; reuse repo export stack.
15. **Persistence upgrade**: move `briefing-store` history to IndexedDB (Dexie) for larger histories; call `navigator.storage.persist()`.
16. **Perf budget CI**: wire `size-limit` + `lhci` assertions for the `ai-briefing` route into CI (offline against localhost).

---

## 8. Risks & notes
- Keep `@mlc-ai/web-llm` installed but **demote it** to an opportunistic upgrade; do not delete (other features may use it via the registry). The registry's preference order currently lists `webllm` first — for *this feature* override with `pickDefaultProvider("transformers")` or, project-wide, reorder so transformers leads when `navigator.gpu` is absent.
- `streamdown` pulls `remark`/`rehype`; pin versions and self-host (no CDN) to honor offline-only. Confirm with `size-limit`.
- `node-llama-cpp` is a native addon — must be in `serverExternalPackages`/unpacked in the Electron build; grammar path only applies to the desktop build, browser keeps prompt+repair+Zod.
- Real-data wiring must handle datasets with **zero numeric columns** gracefully (briefing should still summarize categorical structure) — add an empty/degenerate-context branch.
- `briefing-store` uses default (localStorage) persistence; large histories should move to IndexedDB to avoid the ~5MB quota and main-thread JSON serialization.