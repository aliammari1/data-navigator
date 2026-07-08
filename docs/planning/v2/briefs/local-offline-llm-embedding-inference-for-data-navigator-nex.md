# Tech Radar Brief — Local/offline LLM + embedding inference for data-navigator (Next.js 16 + Electron, on-device, medium-end PC)

## Key findings

- TWO-LANE ARCHITECTURE is the right call: use node-llama-cpp in the Electron main/node process as the PRIMARY generative LLM engine (CPU GGUF q4 + auto GPU offload + GBNF/JSON-schema grammars), and transformers.js (onnxruntime-web under the hood) in a Web Worker as the PRIMARY embedding engine plus the browser-only LLM fallback. This covers the offline-only + medium-end + WebGPU-often-missing constraints cleanly.
- WebGPU is NOT reliably available on your target hardware. Even at ~70-82% global support in 2026, it is frequently disabled on Linux, on integrated/older GPUs, behind enterprise policy, and degrades on weak iGPUs (8-12 tok/s vs 25-40 tok/s on discrete). WASM-SIMD must be the guaranteed baseline; WebGPU is an opportunistic accelerator, never a requirement. This rules out @mlc-ai/web-llm as a primary path (it is WebGPU-required with NO CPU fallback).
- node-llama-cpp (MIT, v3.18.1 Mar 2026, ~2.1k stars, withcatai) is the strongest Electron-side choice despite modest stars: it ships prebuilt binaries for mac/linux/windows, wraps llama.cpp (116k stars, MIT, extremely active), auto-detects hardware (Metal/CUDA/Vulkan + CPU AVX/AVX2/AVX512), and natively enforces JSON-schema/GBNF grammars and function calling at the sampling level. The low star count is offset by being the de-facto Node binding and riding llama.cpp's massive maintenance.
- transformers.js v3/v4 (@huggingface/transformers, Apache-2.0, ~16k stars, v4.2.0) is the best browser-side library: feature-extraction (embeddings) + text-generation pipelines, device:'webgpu' with automatic WASM-SIMD fallback, models cached in IndexedDB for true offline use, 1200+ converted ONNX models. Pair with onnxruntime-web (its engine) which you generally do not import directly.
- EMBEDDINGS: ship all-MiniLM-L6-v2 (384-dim, ~22M params, ~23MB int8 ONNX, ~14k sentences/sec on CPU, <30ms latency) as the default for RAG/semantic search; offer bge-small-en-v1.5 / gte-small (384-dim) as a higher-quality option. These run great in WASM-SIMD on 4-8 cores with no GPU. This is the single highest-value, lowest-risk offline AI feature for a data app.
- GENERATIVE MODELS: default to Qwen2.5-1.5B-Instruct or Qwen2.5-3B-Instruct (q4_K_M GGUF) for the main reasoning/structured-output workload, with Qwen2.5-0.5B-Instruct or SmolLM2-1.7B as the low-RAM/fast fallback. Qwen2.5 has the best coding/math/structured-output behavior at this size; SmolLM2-1.7B wins on raw instruction-following speed (~26-32 tok/s). All are permissive (Apache-2.0 / Qwen license). Avoid >3B on 8GB RAM machines.
- STRUCTURED/JSON OUTPUT is a solved problem on the llama.cpp side: GBNF grammars + JSON-schema-to-grammar conversion guarantee parseable output at the token-sampling level (not prompt-coaxing). node-llama-cpp exposes this directly. This is a decisive advantage over browser WebLLM/transformers.js for any feature that must return valid JSON (chart specs, SQL, filters, report sections).
- Ollama is a viable but heavier alternative to node-llama-cpp for the Electron lane: MIT, huge ecosystem, OpenAI-compatible local server, bundleable via electron-ollama (MIT). Trade-off: you ship/spawn a separate server process and manage its lifecycle. node-llama-cpp is more embeddable (in-process, no extra daemon) and is the recommended default; keep Ollama as a documented escape hatch for power users who already have it.
- BUNDLE/MEMORY discipline: never block the main thread or the renderer. Embeddings + any browser-side generation must run in Web Workers; Electron-side llama runs in main/node (separate process from renderer). Models are downloaded once and cached (IndexedDB/OPFS for browser, app userData dir for Electron), satisfying offline-only after first fetch. Use int8/q4 quantization everywhere to fit 8-16GB.

## Dependencies evaluated

| Package | Stars | Maintenance | License | Offline | Role / replaces | URL |
|---|---|---|---|---|---|---|
| `node-llama-cpp` | 2.1k | Very active; v3.18.1 released Mar 2026; tracks llama.cpp closely | MIT | yes | PRIMARY Electron-side LLM engine: GGUF q4 inference, auto GPU offload (Metal/CUDA/Vulkan)+CPU, JSON-schema/GBNF grammars, function calling, embeddings/reranking | https://github.com/withcatai/node-llama-cpp |
| `llama.cpp` | 116k | Extremely active; daily releases (b9601 Jun 2026); ggml-org, many maintainers | MIT | yes | Core inference engine: quantization (1.5-8bit GGUF/q4_K_M), GBNF grammars, JSON-schema constrained decoding, embeddings server, CPU AVX/AVX2/AVX512 + all GPU backends | https://github.com/ggml-org/llama.cpp |
| `@huggingface/transformers (transformers.js)` | 16k | Very active; v4.2.0; Huggingface-maintained, multi-contributor | Apache-2.0 | yes | PRIMARY browser-side embedding engine (feature-extraction) + browser LLM fallback (text-generation); WebGPU with automatic WASM-SIMD fallback; 1200+ ONNX models | https://github.com/huggingface/transformers.js |
| `onnxruntime-web` | 18k (microsoft/onnxruntime) | Extremely active; Microsoft, large team | MIT | yes | Underlying browser inference runtime for transformers.js (WASM-SIMD + multithreading + WebGPU EP); usually used transitively, not imported directly | https://github.com/microsoft/onnxruntime |
| `@mlc-ai/web-llm` | 18.2k | Active; v0.2.83 Apr 2026; MLC team | Apache-2.0 | yes | Browser WebGPU LLM engine with strong JSON-mode. NOT RECOMMENDED as primary: WebGPU-required, NO CPU/WASM fallback -> fails on medium-end/iGPU/Linux targets. Optional high-end-GPU accelerator only | https://github.com/mlc-ai/web-llm |
| `Ollama` | 150k+ (ollama/ollama) | Extremely active; frequent releases | MIT | yes | ALTERNATIVE Electron-side engine: OpenAI-compatible local server, large model library, bundleable via electron-ollama. Heavier (separate daemon) than node-llama-cpp; documented escape hatch | https://github.com/ollama/ollama |
| `electron-ollama` | ~100s (niche) | Active niche helper | MIT | yes | Helper to bundle + lifecycle-manage Ollama binaries inside an Electron app (only needed if you pick the Ollama lane) | https://github.com/antarasi/electron-ollama |

## Brief

# Offline-First Local LLM + Embedding Inference — Tech Radar Brief

**App:** `data-navigator` — Next.js 16 + Electron desktop data-analysis/visualization, 100% on-device.
**Constraints recap:** offline-only at runtime (no cloud/SaaS/telemetry), medium-end PC (4-8 cores, 8-16GB RAM, integrated/modest GPU, **WebGPU often unavailable**), mature/strongly-trending permissive deps only.

**Date of research:** 2026-06-11. All star counts and release dates pulled live from GitHub repo pages.

---

## TL;DR Recommendation

Adopt a **two-lane architecture**. Do not try to make one library do everything.

| Lane | Engine | Why | Runs where |
|---|---|---|---|
| **Generative LLM (primary)** | **node-llama-cpp** (wraps llama.cpp) | CPU-first GGUF q4, auto GPU offload, native JSON-schema/GBNF grammars, in-process | Electron **main/node** process |
| **Embeddings (primary)** | **transformers.js** + `all-MiniLM-L6-v2` (ONNX int8) | Tiny, fast on WASM-SIMD, no GPU needed, IndexedDB cache | Renderer **Web Worker** |
| **Browser LLM (fallback only)** | **transformers.js** `text-generation` + Qwen2.5-0.5B | When you must run in pure browser context / Electron disabled | Renderer **Web Worker** |
| **Optional GPU accelerator** | @mlc-ai/web-llm | Only if a discrete WebGPU GPU is detected; never required | Renderer (WebGPU) |
| **Optional alt engine** | Ollama (+ electron-ollama) | Power-user escape hatch, OpenAI-compatible | Spawned daemon |

**Why this split:** your generative workload needs *guaranteed valid structured output* (chart specs, SQL, filters, report JSON) and *good speed on CPU* — that is exactly what llama.cpp's GBNF/JSON-schema constrained decoding + q4 GGUF deliver in the Electron process. Your embedding/RAG workload needs to run *everywhere, even with no GPU*, with low memory — that is exactly what a 22M-param MiniLM in WASM-SIMD delivers. Trying to do generation in the browser via WebGPU (WebLLM) violates the "WebGPU often unavailable" constraint because WebLLM has **no CPU fallback**.

---

## The hard constraint that drives everything: WebGPU is not dependable

- 2026 WebGPU support is ~70-82% globally and "in all major browsers," **but** that headline hides your exact target:
  - **Linux desktop**: Firefox WebGPU not shipping until 2026; Chrome/Linux historically flaky. Many of your users are on Linux/WSL-adjacent setups.
  - **Integrated/old GPUs**: even when WebGPU *exists*, an Intel iGPU drops to **8-12 tok/s** vs **25-40 tok/s** on a discrete RTX. Some iGPUs fail device creation entirely.
  - **Enterprise policy / flags**: WebGPU is still disabled by IT policy in many managed environments.
- WASM-SIMD is the only thing you can *guarantee*. onnxruntime-web is even **dropping non-SIMD builds** (since v1.19), confirming SIMD is the universal floor.
- Performance reality from benchmarks:
  - WebGPU is **3-10x faster** than WASM when present.
  - WASM is **5-10x slower but works everywhere** — acceptable for embeddings and small (≤1.5B) generation.
  - TinyLlama-1.1B: WebGPU/RTX = 25-40 tok/s; WASM same machine = 2-5 tok/s.

**Design rule:** WebGPU is an *opportunistic accelerator behind feature detection*, never a hard dependency. Every AI feature must have a working WASM-SIMD (browser) or CPU-GGUF (Electron) path.

---

## Lane 1 — Generative LLM in Electron: node-llama-cpp (PRIMARY)

**Repo:** https://github.com/withcatai/node-llama-cpp — MIT, **v3.18.1 (Mar 2026)**, ~2.1k stars, TypeScript-first.
**Engine:** https://github.com/ggml-org/llama.cpp — MIT, **116k stars**, daily releases (b9601, Jun 2026), many maintainers.

### Why this over browser approaches
1. **CPU-first with auto GPU offload.** Ships prebuilt binaries (mac/linux/windows). Auto-detects Metal / CUDA / Vulkan and falls back to CPU with AVX/AVX2/AVX512. No WebGPU dependency at all — perfect for your "modest GPU" target.
2. **Native structured output.** Enforces a JSON schema / GBNF grammar **at the sampling level** — output is *guaranteed* parseable, not coaxed via prompt. This is the killer feature for a data app generating chart configs, SQL, filter predicates, and report sections.
3. **In-process, no daemon.** Unlike Ollama, it runs inside your Electron node process — simpler lifecycle, packaging, and IPC.
4. **Embeddings + reranking included** (useful as an alternative/extra to the transformers.js embedding lane if you want a single engine).
5. **Function calling** support for tool-style flows.

### Star-count caveat (and why it's fine)
2.1k stars is modest. Justification to adopt anyway: it is the **de-facto Node binding** for llama.cpp, it is actively released (Mar 2026), MIT licensed, and it inherits the maintenance of the 116k-star llama.cpp engine. The risk surface is the thin TS binding layer, not the inference core. This is a defensible "niche but load-bearing" pick.

### Recommended models (GGUF, q4_K_M)
- **Default reasoning/structured:** `Qwen2.5-1.5B-Instruct` (8GB RAM) or `Qwen2.5-3B-Instruct` (12-16GB RAM). Best coding/math/JSON behavior at size.
- **Low-RAM / fast fallback:** `Qwen2.5-0.5B-Instruct` or `SmolLM2-1.7B-Instruct` (SmolLM2 leads raw instruction-following + ~26-32 tok/s).
- **Avoid** >3B on 8GB machines; q4_K_M keeps a 3B around ~2-2.5GB resident.

### Code sketch (Electron main process)
```ts
// electron/llm.ts  (runs in main/node, NOT renderer)
import { getLlama, LlamaChatSession } from "node-llama-cpp";
import { app } from "electron";
import path from "node:path";

const modelPath = path.join(app.getPath("userData"), "models", "qwen2.5-1.5b-instruct-q4_k_m.gguf");

const llama = await getLlama();              // auto-detects Metal/CUDA/Vulkan, else CPU
const model = await llama.loadModel({ modelPath });
const context = await model.createContext({ contextSize: 4096 });
const session = new LlamaChatSession({ contextSequence: context.getSequence() });

// Guaranteed-valid JSON via schema grammar:
const grammar = await llama.createGrammarForJsonSchema({
  type: "object",
  properties: {
    chartType: { enum: ["bar", "line", "scatter", "area"] },
    x: { type: "string" },
    y: { type: "string" },
    aggregate: { enum: ["sum", "avg", "count", "none"] }
  },
  required: ["chartType", "x", "y"]
});

const answer = await session.prompt(
  "Columns: region, month, revenue. User wants revenue trend over months.",
  { grammar }
);
const spec = grammar.parse(answer);          // typed, always valid
```

Expose this over Electron IPC; the renderer calls `window.api.generateChartSpec(...)` and never touches the model directly.

---

## Lane 2 — Embeddings in the browser: transformers.js + MiniLM (PRIMARY)

**Lib:** https://github.com/huggingface/transformers.js — `@huggingface/transformers`, **Apache-2.0**, ~16k stars, **v4.2.0**, HF-maintained.
**Runtime under it:** onnxruntime-web (https://github.com/microsoft/onnxruntime, MIT, 18k+ stars) — you almost never import this directly.

### Why this is the highest-value, lowest-risk offline AI feature
- Embeddings power semantic search over datasets/columns/notes, dedup, clustering, "find similar rows", and RAG for any local chat — all of which a data app actually needs.
- `all-MiniLM-L6-v2`: 384-dim, ~22M params, **~23MB int8 ONNX**, **~14k sentences/sec on CPU**, **<30ms latency**. Runs comfortably in **WASM-SIMD with no GPU** on 4-8 cores. Use `bge-small-en-v1.5` or `gte-small` (also 384-dim) when you want higher retrieval quality.
- Models cached in **IndexedDB** after first download → genuinely offline thereafter.

### Code sketch (Web Worker, never main thread)
```ts
// workers/embed.worker.ts
import { pipeline, env } from "@huggingface/transformers";

env.allowRemoteModels = true;       // only for first-time fetch; cached after
env.useBrowserCache = true;         // IndexedDB cache => offline next time

// Opportunistic WebGPU, guaranteed WASM-SIMD fallback:
let device: "webgpu" | "wasm" = "wasm";
try { if ((navigator as any).gpu && await (navigator as any).gpu.requestAdapter()) device = "webgpu"; } catch {}

const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { device });

self.onmessage = async (e) => {
  const out = await extractor(e.data.texts, { pooling: "mean", normalize: true });
  (self as any).postMessage({ id: e.data.id, vectors: out.tolist() });
};
```
Configure `env.backends.onnx.wasm.numThreads` (defaults to ~half of `hardwareConcurrency`, capped at 4) — leave default or cap at cores-1 to avoid starving the UI.

### Vector store
For an offline data app, keep it simple: store vectors in **DuckDB** (you already have `core/queries/duckdb.ts`) or an in-memory cosine index for small sets; add HNSW only if you exceed ~50-100k vectors. No external vector DB — that would violate offline-only.

---

## Lane 3 — Browser LLM fallback: transformers.js text-generation

When you must run a generative model in a pure browser context (Electron node lane unavailable, or a future web build), use the **same** transformers.js with a tiny model:
```ts
const gen = await pipeline("text-generation", "onnx-community/Qwen2.5-0.5B-Instruct", { device }); // webgpu|wasm
```
Expect WASM throughput of single-digit tok/s on a medium PC — fine for short structured completions, painful for long chat. Prefer the Electron lane for anything heavy.

---

## Rejected / conditional options

### @mlc-ai/web-llm — NOT a primary path
**Repo:** https://github.com/mlc-ai/web-llm — Apache-2.0, **18.2k stars**, v0.2.83 (Apr 2026). Excellent engineering, best-in-class browser JSON mode, OpenAI-compatible API.
**Why rejected as primary:** **WebGPU-required, no CPU/WASM fallback.** On your medium-end / iGPU / Linux targets it will frequently fail to initialize or crawl. It directly violates the "WebGPU often unavailable → graceful fallback" constraint.
**Where it fits:** behind feature detection, *only* when a capable discrete WebGPU adapter is found, as an opportunistic speed boost for in-browser chat. Never the default.

### Ollama — capable ALTERNATIVE, heavier
**Repo:** https://github.com/ollama/ollama — MIT, 150k+ stars, very active. Bundle into Electron via **electron-ollama** (https://github.com/antarasi/electron-ollama, MIT).
**Why not primary:** it runs as a **separate spawned server/daemon** (~300-500MB binary) whose lifecycle, ports, and packaging you must manage. node-llama-cpp gives you the same llama.cpp engine **in-process** with native grammar APIs and less operational surface.
**Where it fits:** a documented "use your existing Ollama" escape hatch for power users, or if you later want a clean OpenAI-compatible HTTP boundary. Detect a running Ollama on `localhost:11434` and offer it as an engine option.

### llama.cpp directly
You consume it transitively via node-llama-cpp (or Ollama). Direct embedding of `llama-server` is possible but reinvents what node-llama-cpp already packages.

---

## Structured / JSON output — decision matrix

| Need | Use |
|---|---|
| **Guaranteed-valid JSON / schema (chart specs, SQL, filters, report sections)** | node-llama-cpp `createGrammarForJsonSchema` (GBNF, sampling-level) |
| Complex CFG / regex-constrained output | llama.cpp built with LLGuidance (Lark-style grammars) |
| Browser-side JSON when WebGPU present | web-llm JSON mode (fallback: validate + repair) |
| Browser-side JSON on WASM | transformers.js + post-hoc JSON validate/repair (no native grammar) — keep schemas tiny |

**Key gotcha (from llama.cpp docs):** the JSON schema *constrains tokens but is NOT injected into the prompt*. You must still **describe the expected structure in the prompt** so the model knows what to produce. Grammar guarantees *shape*, prompt guarantees *intent*.

---

## Speed expectations on a medium-end PC (4-8 cores, iGPU)

| Workload | Engine/path | Rough throughput |
|---|---|---|
| Embeddings (MiniLM-L6) | transformers.js WASM-SIMD, CPU | ~thousands sentences/sec batched, <30ms single |
| Qwen2.5-1.5B q4 generation | node-llama-cpp, CPU only | ~10-25 tok/s |
| Qwen2.5-3B q4 generation | node-llama-cpp, CPU only | ~5-12 tok/s |
| Qwen2.5-0.5B generation | transformers.js WASM | ~3-8 tok/s |
| Same model, WebGPU iGPU | transformers.js/web-llm | ~8-12 tok/s |
| Any model, WebGPU discrete | web-llm/transformers.js | ~25-40 tok/s |

Take these as order-of-magnitude planning numbers; they vary with prompt length, quant, and thread count.

---

## Packaging, memory & offline checklist

- **Process isolation:** llama runs in Electron **main/node** (separate OS process from renderer). Embeddings + any browser generation run in **Web Workers**. Never block the main thread or renderer UI thread.
- **Model delivery:** download-once-then-cache.
  - Browser lane → IndexedDB / OPFS (transformers.js `useBrowserCache`).
  - Electron lane → `app.getPath('userData')/models`. Offer an in-app "download model" step with progress; after that it is fully offline.
  - You already track model files via **git-lfs** (`public/models/...`) — keep large GGUF/ONNX out of the JS bundle; load from disk/cache at runtime.
- **Quantization:** int8 ONNX for embeddings; q4_K_M GGUF for generation. Keeps resident memory within 8-16GB.
- **Feature detection helper:** a single `await detectAccelerator()` that returns `webgpu | wasm` for browser and `gpu | cpu` for Electron, then route. Always have the slow-but-works path wired.
- **No telemetry:** set `env.allowRemoteModels` to false after first model fetch (or ship models pre-cached); disable any auto-update pings. Verify nothing phones home with network panel during a clean offline run.
- **Licensing:** every recommended dep is MIT or Apache-2.0. Models: Qwen2.5 (Qwen license, permissive for app use), SmolLM2 (Apache-2.0), MiniLM/bge/gte (Apache-2.0/MIT). Confirm the specific Qwen license terms for your distribution before shipping the weights.

---

## Suggested rollout order

1. **Embeddings first (highest ROI, lowest risk):** transformers.js + MiniLM in a worker → semantic search + RAG over datasets. Store vectors in DuckDB.
2. **Structured generation in Electron:** node-llama-cpp + Qwen2.5-1.5B q4 + JSON-schema grammar → "describe a chart in words → valid chart spec", NL→SQL, NL→filter.
3. **Graceful accelerator detection:** add WebGPU detection; opportunistically use it for embeddings/browser gen; keep WASM/CPU as the guaranteed floor.
4. **Optional:** detect/integrate Ollama as a power-user engine; add web-llm only behind a "discrete GPU detected" gate.

---

## Sources
- WebLLM repo (stars/license/WebGPU-required): https://github.com/mlc-ai/web-llm
- transformers.js repo + v3 blog: https://github.com/huggingface/transformers.js , https://huggingface.co/blog/transformersjs-v3
- node-llama-cpp repo (MIT, v3.18.1, grammars/JSON schema): https://github.com/withcatai/node-llama-cpp
- llama.cpp repo (116k stars, GBNF/JSON schema, backends): https://github.com/ggml-org/llama.cpp
- llama.cpp grammars/structured output: https://deepwiki.com/ggml-org/llama.cpp/8.1-grammar-and-structured-output , https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md
- onnxruntime-web WASM/SIMD/threads & flags: https://onnxruntime.ai/docs/tutorials/web/ , https://github.com/microsoft/onnxruntime/issues/25666
- WebGPU support 2026: https://web.dev/blog/webgpu-supported-major-browsers , https://caniuse.com/webgpu
- WebGPU vs WASM benchmarks: https://www.sitepoint.com/webgpu-vs-webasm-transformers-js/ , https://maddevs.io/writeups/running-ai-models-locally-in-the-browser/
- Small model comparison (Qwen2.5/SmolLM2/Phi/Gemma): https://machinelearningmastery.com/top-7-small-language-models-you-can-run-on-a-laptop/ , https://arxiv.org/pdf/2502.02737
- Embeddings (MiniLM/bge/gte dims+speed): https://aimultiple.com/open-source-embedding-models , https://huggingface.co/onnx-models/all-MiniLM-L6-v2-onnx
- Ollama in Electron: https://github.com/antarasi/electron-ollama , https://ollama.com/