# Implementation Brief — Offline LLM Runtime (Provider Registry)

**Cluster:** Offline LLM runtime (generative + structured output + browser fallback), wired into the existing `src/platform/ai/provider/` registry.
**Hard constraints:** 100% offline at runtime (no CDN / no network), medium-end PC (4-core, 8 GB, **no WebGPU guaranteed**), current stable APIs.
**Date verified:** 2026-06-12 (npm registry + official docs).

> Downstream agents: implement directly from this. Do **not** re-research. Every version, import path, signature, and asset location below is confirmed against the live npm registry and official docs.

---

## 0. Architecture decision (read first)

This app is **Electron + Next.js 16 (`output: "standalone"`)**. There are exactly two inference lanes:

| Lane | Engine | Runs in | Role |
|---|---|---|---|
| **A. Generative + structured (PRIMARY)** | `node-llama-cpp` (GGUF q4 + GBNF/JSON-schema grammar) | **Electron MAIN process** (reached via IPC) | NL→SQL, chart specs, action plans, insight narration, reconciliation hypotheses — anything needing guaranteed-valid JSON or decent CPU tok/s |
| **B. Embeddings + browser LLM fallback** | `@huggingface/transformers` (ONNX, WASM-SIMD, auto-WebGPU) | **Web Worker** (renderer side) | feature-extraction embeddings (always), text-generation fallback when the Electron lane is unavailable (web build / disabled) |
| **C. Opportunistic accelerator (DEMOTED)** | `@mlc-ai/web-llm` | Renderer (WebGPU only) | keep installed, **never default**; only when a discrete WebGPU adapter is detected |

**CRITICAL platform fact (confirmed from official docs):** node-llama-cpp **only runs in the Electron main process. Using it in a renderer crashes the app.** Therefore it is **not** a renderer-imported provider adapter like `transformers.ts`/`webllm.ts`. It is an Electron **main-process service** (`electron/llama-service.ts`) exposed over IPC (`electron/main.ts` + `electron/preload.ts`), and the renderer-side provider adapter (`adapters/llamacpp.ts`) is a **thin IPC client** that calls `window.electronLlama.*`. This mirrors the EXISTING `voice-service.ts` and `duckdb-service.ts` pattern already in this repo.

**What already exists in this repo (reuse, do not rebuild):**
- `src/platform/ai/provider/` — full registry: `types.ts` (`AIProvider`, `ProviderId`), `registry.ts` (`PROVIDERS`, `pickDefaultProvider`), `structured.ts` (`parseStructured`, `extractJsonBlock`, `repairJson`, `buildJsonInstruction`), `use-ai.ts` (`useAI()`), `adapters/{transformers,webllm,ollama,openai,base}.ts`.
- `src/platform/ai/transformers-env.ts` — `configureTransformersEnv()` ALREADY sets `allowLocalModels`, `localModelPath="/models/transformers/"`, `useBrowserCache`, and `wasmPaths="/models/onnx-runtime/"`. **Self-hosted ORT wasm is already shipped** at `public/models/onnx-runtime/` (`ort-wasm-simd-threaded.{wasm,mjs,jsep.*}`).
- `comlink@4.4.2` is installed. `zod@4.4.3` and `zod-to-json-schema@3.25.2` are installed. `@huggingface/transformers@4.2.0`, `onnxruntime-web@1.26.0`, `@mlc-ai/web-llm@0.2.84` are installed.
- Electron IPC pattern: `ipcMain.handle("ns:method", (event, input) => withTrustedSender(event, () => service.method(input)))` in `electron/main.ts`; `contextBridge.exposeInMainWorld("electronX", {...})` in `electron/preload.ts`.

**What is MISSING and this brief adds:** `node-llama-cpp` is **not installed** and there is **no Electron-main generative lane** — the only generative path today is renderer-side transformers.js (or WebGPU-only web-llm). That is the gap.

---

## 1. node-llama-cpp — PRIMARY generative + structured lane (Electron main)

### 1.1 Install + version

```bash
npm install node-llama-cpp@3.18.1
```

- **Confirmed latest:** `3.18.1`. **Requires Node `>=20`** (Electron ≥ 28 satisfies this).
- **Ships prebuilt binaries** for mac/linux/windows (no compiler needed for end users). MIT license.
- Wraps llama.cpp; auto-detects Metal/CUDA/Vulkan and **falls back to CPU (AVX/AVX2/AVX512)** — exactly the no-WebGPU target.
- Named exports used here: `getLlama`, `LlamaChatSession`. (Also available: `resolveModelFile`, `defineChatSessionFunction`, `LlamaJsonSchemaGrammar` — but use the `llama.createGrammarForJsonSchema(...)` factory method below, NOT the constructor.)

### 1.2 Build / bundle config (REQUIRED — three separate places)

**a) Next.js** — add to `serverExternalPackages` in `next.config.ts` (it already lists DuckDB/better-sqlite3; node-llama-cpp must NOT be webpack-bundled — its file structure must be preserved):

```ts
// next.config.ts
serverExternalPackages: [
  "@duckdb/node-api",
  "@duckdb/node-bindings",
  "better-sqlite3",
  "node-llama-cpp", // ADD
],
```

> Note: node-llama-cpp is imported only from `electron/` (main process), so the Next bundle never touches it at runtime; still add it here so any incidental server-component resolution uses native `require`.

**b) Electron main externalization** — node-llama-cpp must load from `node_modules` at runtime, never be bundled into the main-process bundle. If `electron/` is built with esbuild/tsc, mark it external (`external: ["node-llama-cpp"]`); if compiled with `tsc` to CJS/ESM that keeps `import`/`require` intact, no extra step.

**c) electron-builder packaging** — the native binary must stay OUTSIDE the asar archive. node-llama-cpp's binary is auto-detected by electron-builder's unpacked-native-module detection, but pin it explicitly to be safe (mirror however DuckDB/sherpa are already unpacked):

```jsonc
// electron-builder config (package.json "build" or electron-builder.yml)
"asarUnpack": [
  "**/node_modules/node-llama-cpp/**",
  "**/node_modules/@node-llama-cpp/**"  // platform binary subpackages
]
```

### 1.3 Model assets (self-host — where they go)

- GGUF weights are **NOT** bundled in the JS/asar. Store under the app userData dir, downloaded once while online:
  `app.getPath("userData") + "/models/llm/<model>.gguf"`.
- Default model: `Qwen2.5-1.5B-Instruct-q4_k_m.gguf` (~1 GB, fits 8 GB RAM). Low-RAM fallback: `Qwen2.5-0.5B-Instruct-q4_k_m.gguf` or `SmolLM2-1.7B-Instruct` GGUF.
- This repo already tracks model files via git-lfs and has a download-while-online UX (SetupScreen). Add a "download LLM" step that fetches the GGUF to userData and a presence preflight before allowing generation.

### 1.4 Minimal correct init + the four core calls (Electron MAIN, `electron/llama-service.ts`)

```ts
// electron/llama-service.ts  — runs in the Electron MAIN process ONLY
import path from "node:path";
import { app } from "electron";
import { getLlama, LlamaChatSession, type Llama, type LlamaModel } from "node-llama-cpp";

let llamaPromise: Promise<Llama> | null = null;
let model: LlamaModel | null = null;
let loadedModelPath: string | null = null;

function modelPath(file: string): string {
  return path.join(app.getPath("userData"), "models", "llm", file);
}

// getLlama() auto-detects Metal/CUDA/Vulkan, else CPU (AVX). Idempotent singleton.
async function getLlamaInstance(): Promise<Llama> {
  llamaPromise ??= getLlama(); // pass { gpu: false } to FORCE CPU on flaky GPUs
  return llamaPromise;
}

export async function ensureModel(file = "qwen2.5-1.5b-instruct-q4_k_m.gguf"): Promise<void> {
  const llama = await getLlamaInstance();
  const target = modelPath(file);
  if (model && loadedModelPath === target) return; // already loaded
  if (model) await model.dispose();
  model = await llama.loadModel({ modelPath: target });
  loadedModelPath = target;
}
```

### 1.5 Free-form generation (with streaming via IPC events)

```ts
// electron/llama-service.ts (cont.)
export async function generate(input: {
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  onToken?: (chunk: string) => void; // wired to a webContents.send stream in main.ts
}): Promise<{ text: string }> {
  await ensureModel();
  const context = await model!.createContext({ contextSize: 4096 });
  const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
    systemPrompt: input.system,
  });
  const text = await session.prompt(input.prompt, {
    maxTokens: input.maxTokens ?? 512,
    temperature: input.temperature ?? 0,
    onTextChunk: (chunk) => input.onToken?.(chunk), // v3 streaming callback
  });
  await context.dispose(); // free per-request context; keep model loaded
  return { text };
}
```

### 1.6 STRUCTURED output — guaranteed-valid JSON from a Zod schema (the killer feature)

The JSON schema **constrains tokens at the sampler** (output is parseable by construction) but is **NOT injected into the prompt** — you must still describe the shape in the prompt so the model knows the intent.

```ts
// electron/llama-service.ts (cont.)
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodType } from "zod";

export async function generateStructured(input: {
  system?: string;
  prompt: string;
  jsonSchema: object;       // pass zodToJsonSchema(MySchema) from the renderer OR build here
  maxTokens?: number;
}): Promise<unknown> {
  await ensureModel();
  const llama = await getLlamaInstance();

  // FACTORY method (correct v3 API) — returns a LlamaJsonSchemaGrammar.
  // Supported JSON-schema subset: type, properties, items, enum, oneOf, required.
  const grammar = await llama.createGrammarForJsonSchema(input.jsonSchema);

  const context = await model!.createContext({ contextSize: 4096 });
  const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
    systemPrompt: input.system,
  });
  const raw = await session.prompt(input.prompt, {
    grammar,                       // tokens that break the schema are never sampled
    maxTokens: input.maxTokens ?? 700,
  });
  const parsed = grammar.parse(raw); // typed, always schema-valid — no repair needed
  await context.dispose();
  return parsed;
}
```

Driving it from a Zod schema (renderer builds the JSON schema, passes it over IPC — keep Zod off the main process if you prefer):

```ts
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const InsightSchema = z.object({
  insights: z.array(z.object({
    category: z.enum(["anomaly", "trend", "correlation", "quality", "pattern", "forecast"]),
    title: z.string(),
    severity: z.enum(["critical", "warning", "info", "success"]),
    confidence: z.number(),
  })),
});

// renderer:
const jsonSchema = zodToJsonSchema(InsightSchema, { target: "openApi3" }); // strip $ref wrappers
const result = InsightSchema.parse(await window.electronLlama.generateStructured({ prompt, jsonSchema }));
```

> **zod-to-json-schema pitfall:** by default it emits a top-level `$ref` + `definitions`. Use `{ $refStrategy: "none" }` (or `target: "openApi3"`) so `createGrammarForJsonSchema` receives an inline schema. Validate the JSON-schema output against the GBNF-supported subset (no `$ref`, no `allOf`, no regex `pattern`, no `format`).

### 1.7 IPC wiring (exact files + pattern — mirror voice-service)

**`electron/main.ts`** (add next to the existing `voice:*` / `duckdb:*` handlers):

```ts
import * as llamaService from "./llama-service";

ipcMain.handle("llama:ensureModel", (event, input) =>
  withTrustedSender(event, () => llamaService.ensureModel(input?.file)));

ipcMain.handle("llama:generate", (event, input) =>
  withTrustedSender(event, () => llamaService.generate(input)));

ipcMain.handle("llama:generateStructured", (event, input) =>
  withTrustedSender(event, () => llamaService.generateStructured(input)));

ipcMain.handle("llama:isAvailable", (event) =>
  withTrustedSender(event, async () => {
    try { await llamaService.ensureModel(); return true; } catch { return false; }
  }));
```

For token streaming, push chunks back with `event.sender.send("llama:token", { id, chunk })` and have the preload register an `ipcRenderer.on("llama:token", ...)` dispatcher (same shape as a voice job stream).

**`electron/preload.ts`** (add after the existing `exposeInMainWorld` calls):

```ts
const electronLlama = {
  ensureModel: (input?: { file?: string }): Promise<void> =>
    ipcRenderer.invoke("llama:ensureModel", input),
  generate: (input: { system?: string; prompt: string; maxTokens?: number; temperature?: number }) =>
    ipcRenderer.invoke("llama:generate", input) as Promise<{ text: string }>,
  generateStructured: (input: { system?: string; prompt: string; jsonSchema: object; maxTokens?: number }) =>
    ipcRenderer.invoke("llama:generateStructured", input) as Promise<unknown>,
  isAvailable: (): Promise<boolean> => ipcRenderer.invoke("llama:isAvailable"),
} as const;
contextBridge.exposeInMainWorld("electronLlama", electronLlama);
```

### 1.8 Renderer-side provider adapter (NEW — thin IPC client)

Create `src/platform/ai/provider/adapters/llamacpp.ts` implementing the `AIProvider` interface. Add `"llamacpp"` to `ProviderId` in `types.ts` and register it FIRST in `PROVIDERS` (registry.ts) so it leads when available.

```ts
// src/platform/ai/provider/adapters/llamacpp.ts
import type { ZodType } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { AICapabilities, AIGenerateRequest, AIModelInfo, AIProvider, AIResult } from "../types";
import { toSystemUser } from "./base";

declare global {
  interface Window {
    electronLlama?: {
      ensureModel(input?: { file?: string }): Promise<void>;
      generate(input: { system?: string; prompt: string; maxTokens?: number; temperature?: number }): Promise<{ text: string }>;
      generateStructured(input: { system?: string; prompt: string; jsonSchema: object; maxTokens?: number }): Promise<unknown>;
      isAvailable(): Promise<boolean>;
    };
  }
}

const MODELS: AIModelInfo[] = [
  { id: "qwen2.5-1.5b-instruct-q4_k_m.gguf", label: "Qwen2.5 1.5B (GGUF q4)", family: "Qwen2.5", sizeLabel: "1.5B" },
  { id: "qwen2.5-0.5b-instruct-q4_k_m.gguf", label: "Qwen2.5 0.5B (GGUF q4)", family: "Qwen2.5", sizeLabel: "0.5B" },
];

export const llamacppProvider: AIProvider = {
  id: "llamacpp",
  label: "node-llama-cpp (offline, CPU/GPU, GBNF)",
  capabilities: {
    streaming: true,
    structuredNative: true,     // <-- the differentiator vs transformers/webllm
    offline: true,
    requiresWebGPU: false,
  } satisfies AICapabilities,

  async isAvailable() {
    return typeof window !== "undefined" && !!window.electronLlama && (await window.electronLlama.isAvailable().catch(() => false));
  },
  async listModels() { return MODELS; },
  async ensureReady(model) { await window.electronLlama!.ensureModel({ file: model }); },

  async generate(req: AIGenerateRequest): Promise<AIResult> {
    const { system, user } = toSystemUser(req);
    const started = Date.now();
    const { text } = await window.electronLlama!.generate({
      system, prompt: user, maxTokens: req.maxTokens ?? 512, temperature: req.temperature ?? 0,
    });
    return { text, model: req.model, provider: "llamacpp", finishReason: "stop", elapsedMs: Date.now() - started };
  },

  async generateStructured<T>(req: AIGenerateRequest, schema: ZodType<T>): Promise<T> {
    const { system, user } = toSystemUser(req);
    const jsonSchema = zodToJsonSchema(schema as ZodType, { $refStrategy: "none" });
    const out = await window.electronLlama!.generateStructured({
      system, prompt: user, jsonSchema, maxTokens: req.maxTokens ?? 700,
    });
    return schema.parse(out); // grammar guarantees shape; Zod re-validates types
  },
};
```

```ts
// registry.ts — llamacpp leads so the constrained-decoding lane wins when present
export const PROVIDERS = [llamacppProvider, transformersProvider, webllmProvider, ollamaProvider, openaiProvider] as const;
```

### 1.9 node-llama-cpp pitfalls

- **NEVER import it in renderer / any `"use client"` file.** It crashes the renderer. Only `electron/llama-service.ts` imports it.
- `getLlama()` once (singleton); reuse the `model`; create a **fresh context per request** and `context.dispose()` after — contexts hold KV-cache memory.
- On flaky/old GPUs that fail Vulkan device creation, call `getLlama({ gpu: false })` to force CPU. Consider a try-GPU-then-retry-CPU wrapper.
- JSON-schema grammar supports a **subset** only (`type/properties/items/enum/oneOf/required`). No `$ref`, `allOf`, `pattern`, `format`, `minLength`. Keep schemas flat; validate before shipping.
- Grammar constrains shape, not intent — keep describing the desired JSON in the prompt.
- Concurrency: one model context generates one sequence at a time. Serialize requests (queue) or use multiple `context.getSequence()` sequences; do not fire unbounded `Promise.all`.
- `serverExternalPackages` + `asarUnpack` are both mandatory — missing either yields "module did not self-register" / missing-binary errors only in the packaged build (works in dev), so test the packaged app.

---

## 2. @huggingface/transformers — embeddings + browser LLM fallback (Web Worker)

### 2.1 Install + version

- **Installed:** `@huggingface/transformers@4.2.0` (Apache-2.0). Backend `onnxruntime-web@1.26.0` installed. `comlink@4.4.2` installed.
- **Self-hosted ORT wasm already present:** `public/models/onnx-runtime/ort-wasm-simd-threaded.{wasm,mjs,jsep.wasm,jsep.mjs,...}`. Served at `/models/onnx-runtime/`. **Do not re-add** — `transformers-env.ts` already points `wasmPaths` here.

### 2.2 Offline env config — REUSE the existing helper

`src/platform/ai/transformers-env.ts` `configureTransformersEnv()` already sets, idempotently:

```ts
env.allowLocalModels = true;
env.localModelPath = "/models/transformers/";          // org/model/onnx/*.onnx + config + tokenizer go here
env.useBrowserCache = true;                             // IndexedDB cache => offline after first fetch
env.backends.onnx.wasm.wasmPaths = "/models/onnx-runtime/"; // self-hosted ORT wasm (already shipped)
env.allowRemoteModels = <user pref, default true>;     // set FALSE for strict air-gap via setModelDownloadAllowed(false)
```

**Call `configureTransformersEnv({ allowRemoteModels: false })` at the top of every worker BEFORE the first `pipeline(...)`.** For a strict offline build, force `false` and pre-bundle weights. Also pin threads inside the worker:

```ts
env.backends.onnx.wasm.numThreads = Math.max(1, Math.min(4, (navigator.hardwareConcurrency ?? 4) - 1));
```

### 2.3 On-disk model layout under `localModelPath` (where weights go)

For `Xenova/all-MiniLM-L6-v2` served from `/models/transformers/`:

```
public/models/transformers/Xenova/all-MiniLM-L6-v2/
  config.json
  tokenizer.json
  tokenizer_config.json
  onnx/model_quantized.onnx        # int8 (~23 MB) for dtype:"q8"
```

(Generative model e.g. `onnx-community/Qwen2.5-0.5B-Instruct` similarly: `config.json`, `tokenizer.json`, `generation_config.json`, `onnx/model_q4.onnx` / `decoder_model_merged_quantized.onnx`.) Prefetch once with `huggingface-cli download <repo> --include "onnx/*q8*" "*.json" "tokenizer*" --local-dir public/models/transformers/<repo>`.

### 2.4 Embeddings worker (NEW — `src/workers/embed.worker.ts`, Comlink)

```ts
// src/workers/embed.worker.ts
import * as Comlink from "comlink";
import { pipeline, env, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { configureTransformersEnv } from "@/platform/ai/transformers-env";

configureTransformersEnv({ allowRemoteModels: false });      // OFFLINE FIRST
env.backends.onnx.wasm.numThreads = Math.max(1, (navigator.hardwareConcurrency ?? 4) - 1);

let embedder: FeatureExtractionPipeline | null = null;

async function ensure(device: "webgpu" | "wasm" = "wasm") {
  embedder ??= await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
    device,                                  // "wasm" is the guaranteed floor
    dtype: device === "wasm" ? "q8" : "fp32" // int8 on CPU
  });
  return embedder;
}

const api = {
  async embedBatch(texts: string[], device: "webgpu" | "wasm" = "wasm") {
    const m = await ensure(device);
    const out = await m(texts, { pooling: "mean", normalize: true }); // TRUE batch, one forward pass
    const [n, d] = out.dims as [number, number];                       // [n, 384]
    const flat = out.data as Float32Array;
    const vecs: Float32Array[] = [];
    for (let i = 0; i < n; i++) vecs.push(flat.slice(i * d, (i + 1) * d));
    return Comlink.transfer(vecs, vecs.map((v) => v.buffer));          // zero-copy back
  },
};
export type EmbedWorkerApi = typeof api;
Comlink.expose(api);
```

```ts
// main-thread client
import * as Comlink from "comlink";
import type { EmbedWorkerApi } from "@/workers/embed.worker";
const worker = new Worker(new URL("@/workers/embed.worker.ts", import.meta.url), { type: "module" });
export const embedApi = Comlink.wrap<EmbedWorkerApi>(worker);
```

### 2.5 Browser LLM fallback with streaming (text-generation worker)

There is ALREADY a worker-capable generative path at `src/features/agent-canvas/core/llm.ts` (wrapped by `adapters/transformers.ts`). The required fix there is offline config (call `configureTransformersEnv({ allowRemoteModels:false })`, no hardcoded CDN). Current correct v4 streaming shape:

```ts
import { pipeline, TextStreamer, env, type Message } from "@huggingface/transformers";
const pipe = await pipeline("text-generation", "onnx-community/Qwen2.5-0.5B-Instruct", { device: "wasm", dtype: "q4" });
const streamer = new TextStreamer(pipe.tokenizer, { skip_prompt: true, callback_function: (t: string) => onToken(t) });
const out = await pipe(messages as Message[], { max_new_tokens: 256, do_sample: false, streamer, return_full_text: false });
```

`generateStructured` for this lane stays **prompt + repair + Zod** via the existing `generateStructuredByPrompt` / `parseStructured` (transformers.js has **no** grammar-constrained decoding — confirmed; only `LogitsProcessorList`).

### 2.6 transformers.js pitfalls

- Without `configureTransformersEnv()` BEFORE the first `pipeline()`, ORT fetches `.wasm` from jsDelivr CDN → dead offline. This is the #1 offline bug across agent-canvas/data-formulator (both currently set `allowRemoteModels=true`, no `wasmPaths`).
- `device: "webgpu"` must NOT be hardcoded — probe once (`navigator.gpu?.requestAdapter()`), default `"wasm"+"q8"`. Hardcoding webgpu pays a failing adapter probe every load on the target.
- Always run in a **Web Worker** — `loadLLM()` (model download/init) and token generation block the renderer.
- Batch embeddings: pass the whole `string[]` to the pipeline (one forward pass), never `await` per row.

---

## 3. onnxruntime-web — self-hosted wasm (already done; do not break)

- `onnxruntime-web@1.26.0` is the engine UNDER transformers.js. **You do not import it directly.** You only ensure its `.wasm` is served locally — already shipped at `public/models/onnx-runtime/` and pinned via `wasmPaths`.
- ORT ≥1.19 ships **SIMD-only** builds; `ort-wasm-simd-threaded.wasm` is the file. SIMD is the universal floor (works on the 4-core target). No non-SIMD fallback needed.
- **COOP/COEP (multi-thread requirement):** threaded ORT wasm needs cross-origin isolation (`SharedArrayBuffer`). Serve the renderer with `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`. In Electron, set these response headers in the custom protocol/`onHeadersReceived` for the app origin (check `electron/main.ts` / `electron/security.ts`). Without isolation, ORT silently drops to single-thread (slower but still works) — set `numThreads = 1` to avoid the warning if isolation is unavailable.
- Workers must be `{ type: "module" }`; `new Worker(new URL("...", import.meta.url), { type: "module" })`. Next/Turbopack bundles worker URLs correctly with this form.

---

## 4. zod-to-json-schema + comlink (support libs)

- `zod-to-json-schema@3.25.2` (installed). Use ONLY for the node-llama-cpp grammar bridge (§1.6). **Always** pass `{ $refStrategy: "none" }` so the schema is inline (GBNF subset has no `$ref`). Keep schemas flat: object/array/enum/string/number/boolean only.
- `comlink@4.4.2` (installed). `Comlink.expose(api)` in worker; `Comlink.wrap<Api>(worker)` on main; wrap callbacks with `Comlink.proxy(fn)`; transfer typed-array buffers with `Comlink.transfer(value, [buffers])`. Existing `src/workers/ml.worker.ts` already uses this pattern — copy it.

---

## 5. @mlc-ai/web-llm — DEMOTE (keep, never default)

- `@mlc-ai/web-llm@0.2.84` installed, wrapped by `adapters/webllm.ts` (`requiresWebGPU: true`). **WebGPU-only, no CPU fallback** — fails on the medium-end/iGPU/Linux target.
- Action: keep installed and registered, but it must rank AFTER `llamacpp` and `transformers` in `PROVIDERS`, and `isAvailable()` already gates on a real WebGPU adapter. Repoint the legacy `src/platform/ai/llm-engine.ts` consumers (ai-analysis, ai-briefing, channel-monitor, reconciliation, deep-analytics) OFF `llm-engine.ts` and onto `useAI()` so they get the registry (llamacpp → transformers) instead of the WebGPU-only singleton.

---

## 6. Where each piece wires in (file map for downstream agents)

| New / changed file | Purpose |
|---|---|
| `electron/llama-service.ts` (NEW) | node-llama-cpp main-process service: `ensureModel`, `generate`, `generateStructured`. Imports `node-llama-cpp` (main only). |
| `electron/main.ts` (EDIT) | Add `llama:*` `ipcMain.handle` entries (mirror `voice:*`). |
| `electron/preload.ts` (EDIT) | `contextBridge.exposeInMainWorld("electronLlama", {...})`. |
| `next.config.ts` (EDIT) | Add `"node-llama-cpp"` to `serverExternalPackages`. |
| electron-builder config (EDIT) | `asarUnpack` node-llama-cpp + platform binary subpackages. |
| `src/platform/ai/provider/types.ts` (EDIT) | Add `"llamacpp"` to `ProviderId`. |
| `src/platform/ai/provider/adapters/llamacpp.ts` (NEW) | Thin IPC-client adapter (`structuredNative: true`). |
| `src/platform/ai/provider/registry.ts` (EDIT) | Register `llamacppProvider` first in `PROVIDERS`. |
| `src/workers/embed.worker.ts` (NEW) | transformers.js feature-extraction (MiniLM, q8, wasm) over Comlink. |
| `src/platform/ai/transformers-env.ts` (REUSE) | Already correct; call `configureTransformersEnv({ allowRemoteModels:false })` in every worker. |
| `src/features/agent-canvas/core/llm.ts` (EDIT) | Move into a worker + call `configureTransformersEnv` (remove CDN reliance). Used by agent-canvas + data-formulator. |
| `public/models/transformers/<org>/<model>/...` (NEW assets) | Pre-bundled ONNX weights for strict air-gap. |
| `<userData>/models/llm/*.gguf` (runtime, downloaded once) | GGUF weights for node-llama-cpp. |
| Feature consumers (EDIT) | ai-analysis, ai-briefing, channel-monitor, reconciliation, deep-analytics, data-formulator: replace `llm-engine.ts`/`generateText` with `useAI()` → registry. |

---

## 7. THE most important offline gotchas (ranked)

1. **transformers.js silently fetches ORT `.wasm` from the jsDelivr CDN** unless `env.backends.onnx.wasm.wasmPaths` is pinned (already shipped at `/models/onnx-runtime/`) AND `configureTransformersEnv()` runs BEFORE the first `pipeline()`. Today agent-canvas/data-formulator set `allowRemoteModels=true` with no `wasmPaths` → dead on a fresh offline machine. **Fix every worker entry point.**
2. **node-llama-cpp must run in the Electron MAIN process** (crashes in renderer) and needs BOTH `serverExternalPackages` (Next) AND `asarUnpack` (electron-builder) — missing either fails only in the packaged build. GGUF weights live in userData, never the asar.
3. **WebGPU is not guaranteed** — `device:"wasm"+dtype:"q8"` is the floor; WebGPU is an opportunistic upgrade behind `navigator.gpu.requestAdapter()`. `@mlc-ai/web-llm` (WebGPU-only) must never be the default.
4. **Cross-origin isolation (COOP/COEP)** is required for multi-threaded ORT wasm; set the headers on the Electron app origin or pin `numThreads=1`.
5. **zod-to-json-schema** must emit inline schemas (`$refStrategy:"none"`) within the GBNF subset, or `createGrammarForJsonSchema` rejects them.
