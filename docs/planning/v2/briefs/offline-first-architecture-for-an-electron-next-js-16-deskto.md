# Tech Radar Brief — Offline-first architecture for an Electron + Next.js 16 desktop data-analysis app on a medium-end PC (process model, OPFS/IndexedDB, web workers, code-splitting, caching, local model storage, IPC, security, local-first patterns)

## Key findings

- The data-navigator codebase already ships a strong, coherent offline-first stack: DuckDB (node-api in main + WASM path), Dexie/IndexedDB + OPFS for persistence, Comlink web workers built with esbuild, Transformers.js + ONNX Runtime Web + WebLLM + sherpa-onnx for on-device AI, Serwist service worker, Arrow/arquero columnar processing, TanStack Virtual/Table, Yjs + TanStack DB. The right move is consolidation and graceful-fallback hardening, not wholesale replacement.
- DuckDB-WASM is the fastest in-browser analytical engine (timlrx benchmarks: ~0.01ms aggregate, ~0.1ms group-by on 1M rows) and beats Arquero/SQLite-WASM for analytical workloads. Persist via OPFS SyncAccessHandle (must run in a Worker). On Firefox OPFS-SAH approaches in-memory speed; Chrome ~2x slower than memory but still strong. Keep DuckDB node-api in main for native-speed file/Parquet work and reserve DuckDB-WASM for the renderer; do not run two competing engines on the same hot path.
- OPFS via createSyncAccessHandle is ~10x faster than IndexedDB for large blobs (~90ms vs ~850ms for a 100MB write) and is the correct store for Parquet/model bytes; IndexedDB (via Dexie) stays best for many small structured records and metadata. ALWAYS call navigator.storage.persist() at startup to escape best-effort eviction, and surface navigator.storage.estimate() quota to the user. SyncAccessHandle is Worker-only because its ops are synchronous and block the thread.
- For the hard OFFLINE-ONLY + MEDIUM-END constraint, prefer WASM-SIMD + INT8 CPU inference with WebGPU as opportunistic acceleration, never a requirement. Sitepoint/MS benchmarks show INT8-on-WASM runs 2-3x faster than FP32 and small embedding models on WASM can match or beat WebGPU for short sequences. The codebase's existing enable-unsafe-webgpu + Vulkan-on-Linux switches with feature detection and WASM fallback is the correct pattern.
- Local-first SYNC engines that trend in 2025-2026 (ElectricSQL, Zero, PowerSync, Convex) are mostly server-coupled (Postgres/cloud) and therefore VIOLATE the offline-only constraint at runtime. The offline-safe local-first primitives are Yjs/Automerge CRDTs (already present) and TinyBase, optionally synced over a LAN-only y-websocket. TanStack DB (3.8k stars, MIT, beta) is usable as a reactive local store but is API/sync oriented and still beta; keep it scoped.
- Comlink (12.6k stars, MIT, commit within ~2 weeks) is the right worker-RPC layer and should stay; avoid stale alternatives (threads.js is effectively dead). Move all heavy work (DuckDB-WASM, ONNX inference, OPFS SyncAccessHandle, Parquet encode/decode, clustering/stats) off the main thread, and use Arrow zero-copy / Transferable / SharedArrayBuffer (requires COOP/COEP headers, which Electron can set on the custom protocol) to avoid serialization cost.
- For local LLM on a medium-end offline PC, the strongest path is @electron/llm or node-llama-cpp (GGUF Q4_K_M, ~75% memory reduction, utility-process isolation, Mojo IPC streaming) for 3B-8B models in the Electron main/utility process, with WebLLM/wllama as the in-renderer fallback only where WebGPU/threads are available. Token generation is memory-bandwidth-bound, so quantization + small models matter more than raw cores.
- Electron security in this app is already close to best-practice: trusted-sender IPC validation, a PathAccessController allowlist, and serverExternalPackages for native modules. Lock in sandbox:true + contextIsolation:true + nodeIntegration:false, expose one contextBridge method per channel (never raw ipcRenderer), add a strict CSP and IPC rate-limiting, and enable @electron/fuses (already a dep) to disable RunAsNode/inspector in production.

## Dependencies evaluated

| Package | Stars | Maintenance | License | Offline | Role / replaces | URL |
|---|---|---|---|---|---|---|
| `@duckdb/duckdb-wasm` | 31k (DuckDB core) | Very active, releases tracking DuckDB core through 2025-2026 | MIT | yes | Fastest in-browser analytical SQL engine; columnar/vectorized; persist to OPFS. Renderer-side analytics over Parquet/Arrow. | https://github.com/duckdb/duckdb-wasm |
| `@duckdb/node-api` | 31k (DuckDB core) | Active, official Node bindings, tracks core releases | MIT | yes | Native-speed SQL/Parquet/CSV in Electron main; already in use. Pair with WASM in renderer. | https://github.com/duckdb/duckdb-node |
| `apache-arrow / arquero` | 15k (Arrow) / 1.4k (arquero) | Arrow very active; arquero maintained (UW IDL), slower cadence | Apache-2.0 / BSD-3-Clause | yes | Zero-copy columnar interchange between workers/DuckDB; arquero for lightweight dataframe ops without DuckDB spin-up. | https://github.com/apache/arrow-js |
| `comlink` | 12.6k | Active (GoogleChromeLabs, commit within ~2 weeks) | Apache-2.0 | yes | Ergonomic Proxy-based RPC over postMessage; the worker boundary layer. Keep as-is. | https://github.com/GoogleChromeLabs/comlink |
| `dexie` | 13k | Active, frequent releases | Apache-2.0 | yes | IndexedDB wrapper for many small structured records (metadata, sessions, snapshots). Complements OPFS. | https://github.com/dexie/Dexie.js |
| `OPFS (browser API, no dep)` | n/a | Standardized; Chromium/Electron full support | Web standard | yes | createSyncAccessHandle (Worker-only) for fast large-blob storage: Parquet caches, model weights. ~10x faster than IndexedDB. | https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system |
| `@huggingface/transformers` | 14k | Very active (HF), frequent releases | Apache-2.0 | yes | Embeddings/STT/small-model inference; WASM-SIMD INT8 with optional WebGPU. Set env.numThreads + INT8. | https://github.com/huggingface/transformers.js |
| `onnxruntime-web` | 19k (ORT) | Very active (Microsoft) | MIT | yes | ONNX inference backend; drives Transformers.js + sherpa. Use simd+threaded build, host wasm locally. | https://github.com/microsoft/onnxruntime |
| `node-llama-cpp / @electron/llm` | 2.3k / Electron org | Active; @electron/llm new but official | MIT | yes | CPU/GPU GGUF LLM inference in Electron utility process (Q4_K_M). Primary local-LLM path for medium hardware. | https://github.com/withcatai/node-llama-cpp |
| `@mlc-ai/web-llm` | 16k | Active | Apache-2.0 | partial | In-renderer WebGPU LLM. Keep as opportunistic fallback only; WebGPU often unavailable on medium PCs. | https://github.com/mlc-ai/web-llm |
| `wllama` | 1.1k | Active (v3.4.1, May 2026), MIT | MIT | yes | llama.cpp WASM in browser, CPU-only path with SIMD; alternative in-renderer LLM fallback (needs COOP/COEP for threads). | https://github.com/ngxson/wllama |
| `sherpa-onnx (node + onnxruntime)` | 5k | Active (k2-fsa) | Apache-2.0 | yes | Offline STT/TTS/VAD; already wired with Whisper-tiny + Kokoro. Solid offline voice stack. | https://github.com/k2-fsa/sherpa-onnx |
| `serwist` | 1.5k | Active but single-org/single-maintainer dominant (~51%) | MIT | yes | Workbox-fork service worker for Next.js precaching/offline shell. Watch single-maintainer risk; pin versions. | https://github.com/serwist/serwist |
| `yjs` | 19k | Very active | MIT | yes | CRDT for offline-safe local-first state / optional LAN collaboration via y-websocket. Already present. | https://github.com/yjs/yjs |
| `tinybase` | 5.8k | Very active, single but prolific maintainer | MIT | yes | Reactive local-first store with pluggable IndexedDB/OPFS persistence and optional local sync. Candidate if you want a lighter reactive store than TanStack DB. | https://github.com/tinyplex/tinybase |
| `@tanstack/db` | 3.8k | Active (v1.0.40, Jun 2026) but BETA | MIT | partial | Reactive client collections + sub-ms live queries; API/sync-oriented and beta. Keep scoped; don't make it the offline source of truth yet. | https://github.com/TanStack/db |
| `sqlite-vec` | 6k | Active (Alex Garcia / Mozilla-backed) | Apache-2.0/MIT | yes | Embedded vector search inside SQLite (better-sqlite3) for offline RAG; simplest single-file vector store. | https://github.com/asg017/sqlite-vec |
| `@lancedb/lancedb` | 7k | Very active | Apache-2.0 | yes | Embedded Arrow-native vector DB; memory-maps, handles >RAM datasets via SSD. Use when corpus is large; otherwise sqlite-vec is simpler. | https://github.com/lancedb/lancedb |
| `@tanstack/react-virtual` | 5.5k (Virtual) | Very active (TanStack) | MIT | yes | Row/column virtualization for million-row tables; keep main-thread DOM work bounded. Already in use. | https://github.com/TanStack/virtual |
| `@electron/fuses` | Electron org | Active (official) | MIT | yes | Flip security fuses (disable RunAsNode, node CLI, inspector) in production builds. Already a devDep; ensure it's enforced. | https://github.com/electron/fuses |

## Brief

# Offline-First Tech Radar Brief — data-navigator (Electron + Next.js 16, fully on-device)

**Author:** Principal engineering review • **Date:** 2026-06-11
**Scope:** process model, storage (OPFS/IndexedDB), web workers, code-splitting/caching, local model storage, IPC, security, and trending local-first patterns — all under HARD constraints: **offline-only at runtime**, **medium-end PC (4-8 cores, 8-16GB RAM, weak/absent GPU)**, **mature or strongly-trending permissive-license deps only**.

---

## 0. TL;DR / Verdict

`data-navigator` is **already an unusually complete offline-first app**. The dependency manifest shows a deliberate, coherent stack: DuckDB (node-api + WASM path), Dexie/IndexedDB + OPFS, Comlink workers built by esbuild, Transformers.js + ONNX Runtime Web + WebLLM + sherpa-onnx (Whisper-tiny, Kokoro TTS, Silero VAD), Serwist service worker, Arrow/arquero, TanStack Virtual/Table/DB, Yjs.

**The right strategy is consolidation + graceful-fallback hardening, not replacement.** Specifically:

1. **Two-tier compute:** DuckDB **node-api in main** for native-speed file/Parquet/CSV, DuckDB-**WASM in a renderer worker** for interactive in-page analytics. Don't run both on the same hot path.
2. **Two-tier storage:** **OPFS SyncAccessHandle** (Worker-only) for big blobs (Parquet caches, model weights), **Dexie/IndexedDB** for many small records (metadata, snapshots, sessions). Call `navigator.storage.persist()` at boot.
3. **CPU-first AI:** WASM-SIMD + **INT8** as the default, WebGPU only as opportunistic acceleration with feature detection — because medium-end PCs frequently lack usable WebGPU.
4. **Local LLM:** `@electron/llm`/`node-llama-cpp` (GGUF Q4_K_M) in a **utility process** as the primary path; WebLLM/wllama in the renderer as fallback.
5. **Local-first state:** the trending *sync engines* (Electric/Zero/PowerSync/Convex) **violate offline-only** (they need a server). Stay with **Yjs CRDTs** (+ optional LAN-only y-websocket) and consider **TinyBase** as a lighter reactive store. Treat **TanStack DB** as scoped/beta, not the source of truth.
6. **Electron security:** you're close to best-practice already (trusted-sender IPC, `PathAccessController`, `serverExternalPackages`). Lock in `sandbox:true`, per-channel `contextBridge`, strict CSP, IPC rate-limiting, and enforce `@electron/fuses` in production.

---

## 1. Process model (Electron main / utility / renderer / workers)

### Recommended topology

```
┌────────────────────────────────────────────────────────────────────┐
│ MAIN process (Node)                                                  │
│  • Window/lifecycle, auto-update (already: update-electron-app)      │
│  • DuckDB node-api  ← native-speed Parquet/CSV ingest + heavy SQL    │
│  • better-sqlite3 (+ sqlite-vec) ← embedded RAG / metadata           │
│  • Filesystem allowlist (PathAccessController) + trusted-sender IPC  │
└───────────────┬──────────────────────────────┬─────────────────────┘
                │ Mojo/IPC (one method/channel) │ spawn
                ▼                                ▼
┌──────────────────────────────┐   ┌────────────────────────────────┐
│ RENDERER (sandboxed)         │   │ UTILITY process (utilityProcess)│
│  Next.js 16 / React 19       │   │  • node-llama-cpp / @electron/llm│
│  contextIsolation: true      │   │    GGUF Q4_K_M, streaming tokens │
│  nodeIntegration: false      │   │  • CPU-heavy isolation so a model│
│  sandbox: true               │   │    crash never takes down the UI │
│  ── Web Workers (Comlink) ── │   └────────────────────────────────┘
│   • DuckDB-WASM worker       │
│   • ONNX/Transformers worker │
│   • OPFS SyncAccessHandle    │
│   • Parquet/Arrow encode     │
└──────────────────────────────┘
```

**Why a utility process for the LLM:** `@electron/llm` (official, uses `node-llama-cpp`) loads the model in a **utility process** and streams responses over Chromium Mojo IPC. This isolates a multi-GB native inference workload from both the UI renderer and the main process — a crash or OOM in inference doesn't kill the app. On a medium-end PC where a 7B Q4 model can momentarily spike RAM, this isolation is the difference between a hiccup and a hard crash.

**Why keep two DuckDBs:** native node-api is materially faster for disk-bound ingest of large Parquet/CSV and avoids shipping multi-MB WASM for that path; DuckDB-WASM stays in the renderer for *interactive* slicing where round-tripping to main would add latency. The mental model in `src/platform/duckdb/duckdb.ts` (datasets → views, CSV→managed Parquet cache) already supports this split cleanly. Keep main as the writer/ingestor and the WASM instance read-mostly over exported Parquet.

---

## 2. Storage: OPFS vs IndexedDB — use both, deliberately

| Concern | OPFS (`createSyncAccessHandle`) | IndexedDB (Dexie) |
|---|---|---|
| 100MB blob write | ~**90ms** | ~**850ms** (≈10x slower) |
| Access | **Worker-only** (sync ops block) | Main or worker (async) |
| Best for | Parquet caches, model weights, DuckDB files, large Arrow buffers | Many small structured records, metadata, session state, snapshots |
| Querying | None (raw bytes) | Indexed key/range queries |
| Eviction | Same origin quota + eviction rules as IDB | Same |

Your current split is correct: `src/platform/storage/app-db.ts` (Dexie) holds `analyticsSnapshots`, `tableParquet`, `sessionState`, and `src/platform/duckdb/duckdb-fs.ts` + `storage-info.ts` handle OPFS. Two refinements:

**(a) Move `tableParquet.bytes` from IndexedDB to OPFS.** Dexie is storing raw Parquet `ArrayBuffer`s — exactly the large-blob case where OPFS is ~10x faster and avoids the IndexedDB structured-clone tax. Keep the *metadata row* in Dexie, store bytes in an OPFS file keyed by `tableName`.

```ts
// In a worker (SyncAccessHandle is synchronous → Worker-only)
async function writeParquet(name: string, bytes: ArrayBuffer) {
  const root = await navigator.storage.getDirectory();
  const dir  = await root.getDirectoryHandle("parquet", { create: true });
  const fh   = await dir.getFileHandle(`${name}.parquet`, { create: true });
  const sah  = await fh.createSyncAccessHandle();
  try { sah.truncate(0); sah.write(new Uint8Array(bytes), { at: 0 }); sah.flush(); }
  finally { sah.close(); }
}
```

**(b) Request persistent storage at startup** — otherwise everything is "best-effort" and can be evicted under disk pressure (Chrome allows up to ~80% of disk but only protects persistent origins; Firefox grants up to 50%/8TiB to persisted origins, exempt from the group limit).

```ts
export async function ensureDurableStorage() {
  if (navigator.storage?.persist) {
    const persisted = await navigator.storage.persisted();
    if (!persisted) await navigator.storage.persist();
  }
  const { quota = 0, usage = 0 } = (await navigator.storage?.estimate?.()) ?? {};
  return { quota, usage, ratio: quota ? usage / quota : 0 }; // surface in UI
}
```

In Electron the origin is your own app protocol, so `persist()` is effectively always granted — but calling it makes intent explicit and keeps the browser-fallback (PWA/Serwist) path honest. Surface `estimate()` to the user in a storage panel; you already have `storage-info.ts` as the home for this.

**Engine choice for in-browser data processing** (timlrx benchmarks, 1M-row dataset):

| Engine | Aggregate | Group-by+rank | Point lookup | Notes |
|---|---|---|---|---|
| **DuckDB-WASM** | ~0.014ms | ~0.114ms | — | Fastest analytical; vectorized scans, column pruning; ~3-6MB wasm |
| **SQLite-WASM (indexed)** | — | — | ~0.002ms | Best for transactional/point lookups; needs explicit indexes |
| **arquero** | mid | mid | — | No setup, ~80KB, good for light dataframe ops without DuckDB spin-up |

**Verdict:** DuckDB-WASM for analytical queries (your default), arquero for cheap in-memory transforms where spinning DuckDB is overkill, SQLite (better-sqlite3 in main) for indexed metadata + sqlite-vec RAG. This matches what's already installed.

---

## 3. Web workers, code-splitting, caching

**Keep Comlink** (12.6k★, Apache-2.0, commit within ~2 weeks of writing). It's the dominant, actively-maintained worker-RPC layer (~1.7M weekly downloads); the alternatives are either dead (`threads.js` ≈ 2★/16 weekly dl) or loaders tied to old bundler eras. Your `esbuild.workers.mjs` precompiles workers to `public/workers/*.js`, which is the right call for Electron (stable file URLs, no Next chunking surprises).

**Move every heavy operation off the main thread** and pass data zero-copy:
- **Arrow / Transferable:** ship `ArrayBuffer`/Arrow `RecordBatch` as transferables, not structured clones.
- **SharedArrayBuffer + multithreaded WASM:** ONNX Runtime's `ort-wasm-simd-threaded.wasm` and wllama's multi-thread build need `SharedArrayBuffer`, which requires **COOP/COEP headers** (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`). In Electron, set these on your custom app protocol / `onHeadersReceived` so cross-origin isolation is enabled and threads + SAB light up. This is the single highest-leverage perf unlock for CPU inference on medium hardware.

```ts
// electron/main.ts — enable cross-origin isolation for SAB + WASM threads
session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
  cb({ responseHeaders: {
    ...details.responseHeaders,
    "Cross-Origin-Opener-Policy": ["same-origin"],
    "Cross-Origin-Embedder-Policy": ["require-corp"],
  }});
});
```

**Code-splitting / bundle discipline:** your `size-limit` gate (1800kB gzip client chunks) is good. Keep the multi-MB payloads (DuckDB-WASM, ONNX wasm, model weights) **out of the initial bundle** and lazy-load on first use; host all `.wasm`/model assets **locally** (`public/`) so nothing fetches from a CDN at runtime — non-negotiable for offline-only. You already vendor models under `public/models/...` and `public/vad/...`; extend that to ORT and DuckDB wasm artifacts and point `ort.env.wasm.wasmPaths` / DuckDB bundle URLs at the local copies.

**Service worker / caching:** Serwist (1.5k★, MIT) is the maintained Workbox fork and the de-facto next-pwa successor; it precaches the Next app shell for the browser/PWA distribution. **Risk flag:** Serwist is single-maintainer/single-org dominant (~51% of contributions) — pin the version and keep the SW logic thin. In the *Electron* distribution the SW matters less (you ship the assets), so treat Serwist as the browser-target offline shell, not the core caching strategy. Model/asset caching should live in OPFS/IndexedDB (your `embedding-cache.ts`, `analytics-cache.ts` already do this), not in the SW Cache API, because OPFS is faster and gives you eviction control.

---

## 4. Local model storage & on-device AI (the offline-only core)

### Inference backend priority on a medium-end PC

```
WebGPU available + adapter healthy?  ──yes──► WebGPU path (3-10x) [opportunistic]
        │ no / unstable / Firefox-Safari
        ▼
WASM-SIMD + threads (SAB, COOP/COEP) + INT8 ──► default, robust
        │ threads unavailable (no SAB)
        ▼
WASM-SIMD single-thread + INT8 ──► last-resort, still works offline
```

Evidence: INT8-on-WASM runs **2-3x faster than FP32** because SIMD packs 8-bit ints natively; for small embedding models on short sequences, **WASM matches or beats WebGPU** (e.g., ~8-12ms WASM vs ~15-25ms WebGPU single-embedding on an M2). On medium-end integrated GPUs WebGPU is often unavailable or slower than expected — so **WASM-SIMD/INT8 is the correct default**, not the fallback. Your `enable-unsafe-webgpu` + Vulkan-on-Linux + `ignore-gpu-blocklist` switches are fine *as opportunistic enablement*, provided the code feature-detects an actual working adapter (`navigator.gpu.requestAdapter()` returning a usable device) before committing to the WebGPU path, and falls back automatically.

```ts
import { env } from "@huggingface/transformers";
env.backends.onnx.wasm.numThreads =
  crossOriginIsolated ? Math.min(navigator.hardwareConcurrency ?? 4, 4) : 1;
env.backends.onnx.wasm.wasmPaths = "/ort/";  // local, offline
// model dtype: prefer "q8" (INT8) on the WASM path
const pipe = await pipeline("feature-extraction", modelId,
  { device: hasUsableWebGPU ? "webgpu" : "wasm", dtype: hasUsableWebGPU ? "fp16" : "q8" });
```

### Model storage / "download once, cache forever"

- **Transformers.js / ONNX:** caches model files in the browser Cache/IndexedDB by default — for offline-first, **pre-vendor the models locally** (you already do for sherpa/Kokoro/Silero) and set `env.allowRemoteModels = false`, `env.localModelPath = "/models/"`. This guarantees zero network at runtime.
- **GGUF for the utility-process LLM:** store the `.gguf` once under `userData` (downloaded on first run via your own flow, or shipped in the installer for true zero-network), validate checksum, then load from disk. Q4_K_M gives ~75% memory reduction (a 7B that would need ~16GB drops to ~4-5GB), which is the difference between "runs" and "doesn't" on 16GB.
- **Large model weights in renderer:** store in **OPFS** (fast, big-blob-friendly), not IndexedDB.

### Voice stack (already solid)

`sherpa-onnx-node` (5k★, Apache-2.0) with Whisper-tiny.en (INT8 encoder/decoder), Kokoro TTS, Silero VAD — all vendored under `public/`. This is a strong, fully-offline STT/TTS/VAD pipeline. Whisper-tiny INT8 is the right size class for medium hardware. Keep `onnxruntime-web` (19k★ ORT core, MIT, Microsoft) as the renderer-side backend and `sherpa-onnx-node` for main-process voice. No change recommended beyond ensuring all `.onnx` assets load from local paths.

### Local LLM options compared

| Option | Where | Stars | Offline | Best for medium PC | Verdict |
|---|---|---|---|---|---|
| `@electron/llm` / `node-llama-cpp` | main/utility | 2.3k (nlc) | yes | **GGUF Q4 CPU/GPU, utility-process isolation, Mojo streaming** | **Primary** |
| `@mlc-ai/web-llm` | renderer | 16k | partial (needs WebGPU) | only when WebGPU present | Fallback |
| `wllama` | renderer | 1.1k (MIT, active) | yes | CPU WASM-SIMD, auto single/multi-thread (needs COOP/COEP) | Fallback / no-native option |

You currently have `@mlc-ai/web-llm`. For a medium-end offline target, **add the `node-llama-cpp` utility-process path as primary** and demote WebLLM to "use if a healthy WebGPU adapter exists." This single change is the biggest robustness win for users without WebGPU.

---

## 5. Local RAG / vector search (offline)

You ship both `sqlite-vec` and `@lancedb/lancedb`. Pick by corpus size:

- **`sqlite-vec`** (6k★, permissive): drop-in extension for your existing `better-sqlite3`; single-file, no extra runtime, simplest operationally. **Default** for typical local corpora (thousands to low-millions of vectors).
- **`@lancedb/lancedb`** (7k★, Apache-2.0, Arrow-native): memory-maps Lance columnar files, handles datasets larger than RAM via SSD, IVF-PQ for scale. **Use only when** the corpus genuinely exceeds what sqlite-vec handles comfortably; note IVF-PQ is approximate (lower recall than HNSW at defaults).

**Recommendation:** make `sqlite-vec` the default and keep LanceDB behind a "large corpus" capability flag rather than running both eagerly — fewer native modules to rebuild per Electron version (`@electron/rebuild`) and a smaller install.

---

## 6. Local-first patterns & sync engines (honest assessment vs the constraint)

The 2025-2026 hype is around **sync engines** — ElectricSQL (Postgres "durable sync" via shapes), **Zero** (best web DX, reactive, Notion/Figma-style multiuser), **PowerSync** (production/mobile), **Convex**. **Every one of these requires a server/cloud at runtime** (Postgres replication stream, sync service, etc.). Under your **offline-only** constraint they are **out** as the data backbone. They'd only be relevant if you later add *optional* sync that degrades gracefully to fully-local — and even then you'd self-host on LAN, not cloud.

**What is offline-safe and trending:**

- **Yjs** (19k★, MIT) — already present. CRDT for conflict-free local state and *optional* LAN collaboration via `y-websocket` (you have it) pointed at a local server (`scripts/lan-server.mjs` suggests you already do LAN). This is the correct local-first primitive for structured collaborative state. Automerge is the alternative but Yjs is lighter and you've already committed.
- **TinyBase** (5.8k★, MIT) — reactive local-first store with pluggable IndexedDB/OPFS persistence and optional local sync; a *lighter* reactive store than TanStack DB if you want one. Single but very active maintainer. Consider it only if you want a unified reactive table store; otherwise Zustand + TanStack Query (both present) already cover state.
- **TanStack DB** (3.8k★, MIT, **beta**) — reactive client collections with sub-ms live queries and optimistic writes. It's **API/sync-oriented** and still beta. Keep it **scoped** to ephemeral reactive views; do **not** make it the durable offline source of truth yet. Your durable truth should remain DuckDB/Parquet (analytics) + SQLite (metadata/RAG) + Dexie/OPFS.

**Net:** your local-first story should be "**local store is the source of truth; sync is optional and LAN-only via Yjs.**" That is exactly the shape the codebase already has — don't bolt on a cloud sync engine.

---

## 7. Electron security (already strong — lock it in)

What you already do well (confirmed in `electron/main.ts` + `electron/security.ts`):
- **Trusted-sender IPC:** `assertTrustedSender` validates `senderFrame.url` against `isAllowedAppOrigin` on every invoke — exactly the "validate the sender of all IPC messages" guidance.
- **Filesystem allowlist:** `PathAccessController` with unit-tested read/write/delete/dir assertions — prevents path traversal from a compromised renderer.
- **Native module isolation:** `serverExternalPackages` for `@duckdb/node-api`, `better-sqlite3`.
- **`@electron/fuses`** is a devDep.

Lock-in checklist (verify/enforce, don't assume):

1. **`webPreferences`:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`. These are the Electron 20+ defaults and **non-negotiable**; assert them explicitly when creating `BrowserWindow`.
2. **contextBridge:** expose **one method per IPC channel** via `contextBridge.exposeInMainWorld`; **never** expose raw `ipcRenderer` (the classic "any-channel" RCE pivot).
3. **CSP:** ship a strict `Content-Security-Policy` (`default-src 'self'`, `script-src 'self' 'wasm-unsafe-eval'` for WASM, `connect-src 'self'`) — with offline-only you can forbid all remote origins, which also hard-blocks accidental telemetry.
4. **IPC rate-limiting + arg validation:** validate (Zod is already a dep) every IPC payload in *both* preload and main; rate-limit to prevent a compromised renderer flooding the main process.
5. **`@electron/fuses` enforced in the build:** disable `RunAsNode`, `EnableNodeCliInspectArguments`, `EnableNodeOptionsEnvironmentVariable`, enable `OnlyLoadAppFromAsar` + cookie encryption. Make sure the forge build actually flips them (it's in devDeps — confirm it runs in `electron:make`).
6. **`will-navigate` / `setWindowOpenHandler`:** deny navigation to any non-app origin and deny `window.open` to external URLs — reinforces offline-only and blocks phishing pivots.
7. **No `enable-unsafe-webgpu` surprises:** it's fine for capability, but ensure WebGPU shaders only run trusted local models; with sandbox + CSP the blast radius stays contained.

---

## 8. Concrete recommendations (ranked)

**P0 — highest leverage, low risk**
1. Enable **COOP/COEP** on the app protocol → unlocks SAB + multithreaded WASM (ORT, wllama, DuckDB-WASM) on medium-end CPUs. Biggest perf unlock.
2. Call **`navigator.storage.persist()`** at boot and surface `estimate()` quota in the storage panel.
3. Make **WASM-SIMD + INT8 the default** inference path with real WebGPU adapter detection + automatic fallback (don't assume `enable-unsafe-webgpu` means a usable device).
4. Force **local-only model loading** (`allowRemoteModels=false`, local `wasmPaths`/model paths) so zero network is structurally guaranteed, not just incidental.

**P1 — robustness for the target hardware**
5. Add **`node-llama-cpp`/`@electron/llm` utility-process** LLM path as primary; demote WebLLM to WebGPU-only fallback.
6. **Move large Parquet/model blobs from Dexie to OPFS** (keep metadata in Dexie). ~10x faster writes, no clone tax.
7. Enforce **`@electron/fuses`** + strict CSP + per-channel `contextBridge` in the production build; confirm `sandbox:true` on every window.

**P2 — hygiene / future-proofing**
8. Default RAG to **sqlite-vec**; keep LanceDB behind a large-corpus flag to reduce native rebuild surface.
9. Keep local-first as **Yjs + LAN-only y-websocket**; explicitly reject cloud sync engines (Electric/Zero/PowerSync/Convex) for the offline backbone. Keep **TanStack DB scoped/beta**, evaluate **TinyBase** only if you want one unified reactive store.
10. Pin **Serwist** (single-maintainer risk) and keep SW logic thin; treat it as the browser-target offline shell, not the Electron caching strategy.

---

## 9. Migration sketches

**WebGPU capability gate (shared util):**
```ts
export async function pickInferenceDevice(): Promise<"webgpu" | "wasm"> {
  try {
    if (!("gpu" in navigator)) return "wasm";
    const adapter = await (navigator as any).gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return "wasm";
    const device = await adapter.requestDevice();
    return device ? "webgpu" : "wasm";
  } catch { return "wasm"; }
}
```

**Utility-process LLM (primary path):**
```ts
// main: spawn isolated inference; renderer talks to it over IPC, never holds the model
import { utilityProcess } from "electron";
const llm = utilityProcess.fork(path.join(__dirname, "llm-host.js"));
// llm-host.js loads GGUF via node-llama-cpp (Q4_K_M from userData), streams tokens back.
```

**Dexie→OPFS for Parquet bytes:** keep `tableParquet` metadata in Dexie, write/read bytes via the SyncAccessHandle worker (snippet in §2). Migration: on first launch of the new version, lazily move any existing `bytes` rows to OPFS and null the column.

---

## 10. Risks & watch-items

- **Serwist single-maintainer concentration** (~51%) — pin versions; have a fallback plan (raw Workbox or hand-rolled SW) if it stalls.
- **TanStack DB is beta** — don't make it durable truth.
- **WebGPU flakiness on integrated GPUs** — your default must be CPU/WASM; treat WebGPU as a bonus.
- **OPFS SyncAccessHandle is Worker-only** — any main-thread use will throw; keep all OPFS-SAH code in workers.
- **Native module rebuilds** (`@electron/rebuild`) for `@duckdb/node-api`, `better-sqlite3`, `sherpa-onnx-node`, `node-llama-cpp`, `@lancedb/lancedb` — each adds CI/build surface; minimizing the set (sqlite-vec over LanceDB by default) reduces breakage per Electron upgrade.
- **COOP/COEP side-effects** — cross-origin isolation can break embedding of third-party resources, but in an offline-only app you have none, so this is essentially free.

---

## Sources

- [DuckDB-WASM + OPFS persistence (MotherDuck)](https://motherduck.com/blog/duckdb-wasm-in-browser/) · [DuckDB + OPFS walkthrough](https://markwylde.com/blog/duckdb-opfs-todo-list/) · [OPFS caching with React + DuckDB-WASM](https://medium.com/@hadiyolworld007/opfs-caching-ftw-react-duckdb-wasm-blazing-parquet-0442ff695db5)
- [Browser data-processing benchmarks (Arquero/SQLite/DuckDB)](https://github.com/timlrx/browser-data-processing-benchmarks) · [The best in-browser data framework is SQL](https://www.timlrx.com/blog/the-best-in-browser-data-processing-framework-is-sql/)
- [MDN: Storage quotas & eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) · [MDN: OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) · [RxDB: localStorage vs IndexedDB vs OPFS vs SQLite-WASM](https://rxdb.info/articles/localstorage-indexeddb-cookies-opfs-sqlite-wasm.html) · [Dexie StorageManager](https://dexie.org/docs/StorageManager)
- [Transformers.js backend architecture](https://deepwiki.com/huggingface/transformers.js/8.2-backend-architecture) · [WebGPU vs WASM transformers.js benchmarks](https://www.sitepoint.com/webgpu-vs-webasm-transformers-js/) · [Optimizing Transformers.js for production](https://www.sitepoint.com/optimizing-transformers-js-production/)
- [Comlink (GoogleChromeLabs)](https://github.com/GoogleChromeLabs/comlink) · [comlink vs threads.js npm trends](https://npmtrends.com/comlink-vs-threads.js-vs-worker-loader-vs-worker-plugin-vs-workerize-vs-workerize-loader)
- [wllama (llama.cpp WASM)](https://github.com/ngxson/wllama) · [@electron/llm](https://github.com/electron/llm) · [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) · [GGUF CPU quantization guide](https://www.ionio.ai/blog/llms-on-cpu-the-power-of-quantization-with-gguf-awq-gptq)
- [Electron Security tutorial](https://www.electronjs.org/docs/latest/tutorial/security) · [Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) · [Process Sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox) · [contextBridge security guide](https://safeguard.sh/resources/blog/electron-contextbridge-security)
- [sqlite-vec local vector search](https://dev.to/aairom/embedded-intelligence-how-sqlite-vec-delivers-fast-local-vector-search-for-ai-3dpb) · [Embedded vector DBs compared (LanceDB/sqlite-vec)](https://shaharia.com/blog/choosing-embeddable-vector-database-go-application/)
- [Local-first sync engines compared (Electric/Zero/PowerSync)](https://trybuildpilot.com/648-electric-sql-vs-powersync-vs-zero-2026) · [Electric: alternatives](https://electric-sql.com/docs/reference/alternatives) · [TinyBase](https://tinybase.org/) · [awesome-local-first](https://github.com/alexanderop/awesome-local-first/blob/main/README.md) · [TanStack DB](https://github.com/TanStack/db)
- [Serwist (Workbox fork)](https://github.com/serwist/serwist) · [Serwist v9 notes](https://serwist.pages.dev/blog/2024/03/10/serwist-v9)