# Brainstorm — Fastest Offline Inference (+ the "sandbox" question) & Typography

**Date:** 2026-06-15 · **Status:** research / brainstorming (pre-design) · **Target box:** 4-core / 8 GB RAM / integrated-GPU-only (no WebGPU) / **offline at runtime** / Windows.

> This is an exploration document, not an approved spec. Numbers are web-researched and cross-checked against primary sources (GitHub repos, HF model cards, arXiv, official docs). Where a number is estimated, blog-sourced, or hardware-specific, it's flagged.

---

## TL;DR — the honest answer

1. **Your latency villain is not the engine — it's the architecture.** The Moudir swarm fires **a dozen-plus *serialized* 1.5B calls per question** on a memory-bandwidth-bound CPU. Total latency = sum of those calls. No engine swap fixes that; collapsing the call graph does. **This is the single biggest, cheapest win and it stays on your current stack.**
2. **A "sandbox" will not make inference faster — it never does.** Sandboxes (microVMs, gVisor, WASM) exist for *isolation/security/portability* and always *add* overhead. The legitimate use here is sandboxing the **code your agents generate** (SQL/Python), not the inference engine. On Windows the microVM family needs WSL2 → a bad fit for an offline MSI.
3. **BitNet 1.58-bit is genuinely the best *engine-level* win for your exact hardware** — ~2.2× faster decode than Qwen2.5-1.5B, 0.4 GB working set, 1.19 GB on disk, MIT, comparable quality. But it's a bigger lift: no Node binding, no prebuilt Windows binaries, and you lose native grammar-constrained JSON. It's a Phase-2 option, not a quick fix.
4. **You can't kill the ~1 GB download by "bundling into one file" on Windows** (4 GB .exe cap blocks llamafile single-file embedding). The lever to shrink first-run download is a **smaller default model** (Qwen2.5-0.5B ~400 MB, or BitNet 1.19 GB), not a different runtime.
5. **Typography:** there is **no Poppins** in the app today. The "techy" feel is **two monospaces** (Fira Code + JetBrains Mono) with JetBrains Mono over-used for desktop chrome. Fix = **1 serif (Fraunces, headlines) + 1 sans (Geist or Inter, everything incl. chrome) + 1 mono (code/data only)**. Don't make Poppins the workhorse.

---

## Part 0 — Why it's slow today (grounded in your code)

From `electron/llama-service.ts` + `docs/.../offline-llm-runtime.md`:

- **Engine:** `node-llama-cpp@3.18.1` in the Electron **main process**, auto Vulkan/Metal/CUDA → CPU(AVX) fallback. Default model **Qwen2.5-1.5B-Instruct q4_k_m** (~1 GB), downloaded to `%APPDATA%/Electron/models/llm` (not bundled → "AI hangs until downloaded").
- **One shared `LlamaContext`, serialized request queue.** (A per-call context churn reproducibly crashed Windows with `STATUS_STACK_BUFFER_OVERRUN 0xC0000409`, so it was made a singleton — good.)
- **Structured output** via native GBNF grammar (`createGrammarForJsonSchema`) — *parseable by construction*. This is your most valuable AI feature and the thing most alternatives lose.
- **The bottleneck:** the swarm scheduler issues many **serialized** structured calls per question. On CPU each call has large fixed cost (prompt prefill + decode). 12 × (prefill + decode) is the latency you feel.

Three independent levers, in order of ROI: **(A) fewer/cheaper calls (architecture)** → **(B) make each call cheaper (warm + prefix-cache + quant)** → **(C) a faster engine (BitNet)**. A–B are mostly free and keep your stack. C is a project.

---

## Part 1 — The lever that matters most: swarm architecture

Researched 2026 best practices for fast on-device agentic apps. The structural fixes:

### 1.1 Cut the number of LLM calls (target 12+ → 1–3)
- **Replace LLM-based classify/route/intent steps with embeddings or rules.** Embedding nearest-neighbour classification is reported **~81× faster for text** (and ~10× cheaper) than prompting — *caveat: that figure is from one domain-specific study (Thumbtack, arXiv 2504.04277); treat as directional, not a guarantee.* The mechanism is sound: a cosine-similarity lookup is sub-millisecond vs a full forward pass. You already ship MiniLM embeddings (`Xenova/all-MiniLM-L6-v2`) — reuse it for routing the **Commander** and the swarm's intent steps.
- **Merge multi-step extraction into ONE grammar-constrained call** that emits all fields at once, instead of N free-text calls + parsing.
- **Cascade / confidence routing:** a tiny/fast path handles the easy majority; escalate to the heavy path only on low confidence.

### 1.2 Make each remaining call cheaper
- **Keep the model warm** (you already keep one context; also `mlock` it on the 8 GB box so it never swaps, and run a 1-token warm-up after load to pay dequant cost before the first user request).
- **Prefix-cache the system prompt.** Your swarm reuses a big static system prompt + tool defs across calls. llama.cpp host-memory prompt caching computes that prefix **once** — reported **~93 % TTFT reduction** (e.g. 4.3 s → 0.3 s on an 8k-token prefix). *That figure is from a GPU tutorial (llama.cpp #20574); on CPU absolute prefill is slower so the savings are directionally larger, but measure on your box.* node-llama-cpp exposes this via `preloadPrompt()`, `createPromptCompletionEngine()`, and `saveStateToFile/loadStateFromFile`. **Keep all variable content at the END of the prompt** or the prefix cache won't hit.
- **Smaller quant** (decode is memory-bandwidth-bound → fewer bytes/token = faster). See Part 3.

### 1.3 Parallelize only *genuinely independent* agents
llama.cpp's unified KV cache lets multiple sequences share one prefix (computed once). On 4 cores, batching independent agents raises throughput but **does not reduce single-call latency** — so serial *dependent* chains gain nothing; they must be *eliminated*, not parallelized.

**Bottom line:** collapse the graph first. This alone likely gets you most of the perceived speedup, on your current engine, for near-zero packaging risk.

---

## Part 2 — Option A (engine): BitNet 1.58-bit (Microsoft)

**What it is:** `bitnet.cpp` (MIT), Microsoft's inference framework for ternary {-1,0,+1} weight LLMs. It's a **patched fork of llama.cpp** (custom GGML types `I2_S`/`TL1`/`TL2`) that builds standard `llama-cli` / `llama-server` (OpenAI-compatible HTTP) / `llama-quantize`.

**Flagship model:** `microsoft/bitnet-b1.58-2B-4T` — ~2 B params, 4096-token context, **1.19 GB GGUF** on disk, **0.4 GB** non-embedding working set, MIT.

**Performance (all cross-checked ✅ against arXiv 2504.12285 Table 1, measured on a 13th-gen i7):**
| Metric | BitNet 2B | Qwen2.5-1.5B |
|---|---|---|
| CPU decode latency (TPOT) | **29 ms/tok** | 65 ms/tok |
| Non-embedding RAM | **0.4 GB** | 2.6 GB |
| Energy/token (estimated) | **0.028 J** | 0.347 J (~12×) |
| Avg quality (10 benchmarks) | 54.19 | 55.23 |
| GSM8K (math) | **58.38** | 56.79 |
| MMLU (knowledge) | 53.17 | **60.25** |

- **~2.2× faster per token than your current model, at ~1/6 the working memory, comparable quality** — and stronger on math/reasoning, weaker on knowledge (MMLU). x86 speedup vs fp baseline is **2.37×–6.17×** (the "6.46×" headline is a cherry-picked 2-thread case — use the range).
- **No GPU needed** (GPU kernels exist since May 2025; NPU is roadmap). Perfect for no-WebGPU.

**The catch (why it's Phase 2, not a quick fix):**
- **No Node binding** and the I2_S GGUF **can't load in your existing node-llama-cpp lane.** You'd run it as a **spawned `llama-server` sidecar** over its OpenAI-compatible HTTP endpoint (mirrors how you'd use Ollama; you already have `adapters/ollama.ts` to copy).
- **No prebuilt Windows binaries** — you must compile `llama-server` yourself (VS2022 + Clang-18 + CMake) and bundle it per-arch. CI/packaging burden.
- **You lose native GBNF grammar** — structured output regresses to prompt + repair + Zod (you already have `repairTruncatedJson` as a net, but constrained decoding is strictly better).
- 4096-token context cap; can't bring arbitrary fine-tunes (ternary needs quantization-aware training → limited to official BitNet checkpoints).

**Verdict:** the best efficiency-per-quality CPU model in its class and an excellent fit for your hardware — adopt it as an **optional "fast CPU" engine behind your provider registry**, bundled (1.19 GB), with the HTTP-sidecar + structured-output-fallback caveats understood. Validate real tok/s on a true 4-core box (the i7 numbers are an upper bound).

---

## Part 3 — Option B (engine, cheap): tune node-llama-cpp in place

Stay on your current lane and turn knobs. On a bandwidth-bound CPU:

- **Quantization:** smaller = faster decode. **Q4_0 is the fastest** for CPU token-gen; **Q8_0 is ~2× slower** at generation. *(Note: the exact ik_llama #164 t/s table I first cited was misattributed per fact-check; the **ordering/mechanism is confirmed** — I'm not quoting the wrong absolute numbers.)* **Recommendation: default Q4_K_M (quality), ship a Q4_0 "fast" profile for the weakest machines.** For a telecom engine where numbers matter, validate Q4_0 fidelity before defaulting to it.
- **Threads = physical cores (4)**, not hyperthreads — extra threads just contend for the memory bus.
- **Keep small context** (KV RAM + per-token attention grow with it; past ~4k, bandwidth dominates).
- **Flash attention / KV-cache quant:** treat as **opt-in, measure-first** — mainly to fit longer context in 8 GB, *not* a guaranteed CPU speed win (and flagged experimental in node-llama-cpp).
- **Speculative decoding: skip on the 8 GB target.** A second draft model doesn't fit, CPU spec-decode is unoptimized in 2026 (llama.cpp #21453), and at 1.5B the headroom is small (~1.6×). Reserve for higher-RAM machines only.
- **Vulkan iGPU offload: don't default to it.** On Windows shared-memory iGPUs it's bandwidth-capped and frequently a wash-or-worse vs tuned CPU, and adds driver/packaging fragility. Experimental toggle only.

---

## Part 4 — Option C: llamafile / Ollama sidecars (and the download myth)

- **The premise "bundle weights into one file to skip the download" fails on Windows.** llamafile is the only true single-file fuse (Cosmopolitan libc), but **Windows caps executables at 4 GB** and Mozilla's own docs tell Windows users to run the bare binary against an **external `-m model.gguf`** — i.e. exactly your current "small engine + separate GGUF" situation. The smallest prebuilt llamafile (Llama-3.2-1B Q6_K) is **1.11 GB**, no smaller than what you ship.
- **llamafile's real wins:** tinyBLAS CPU kernels (30–500 % faster **prompt-eval**, *not* token-gen — decode is bandwidth-bound) and an OpenAI `/v1` wire boundary. *(Per-chip tinyBLAS numbers couldn't be re-verified at primary source — expired TLS cert — but the "prompt-eval not decode" nuance is corroborated.)*
- **Ollama:** ~200 MB installer, ≥4 GB footprint, a `pull/create` step, and `electron-ollama` downloads Ollama at runtime by default → fights offline + small-download. Heavier for no structured-output gain.
- **Switching to any HTTP server loses native GBNF grammar** (your best feature).

**Verdict:** keep node-llama-cpp as primary. To shrink first-run download, **default to a smaller model** (0.5B ~400 MB, or BitNet 1.19 GB). Use a sidecar (llamafile *or* BitNet) only as an explicit engine option, pointed at the same userData GGUF, behind the provider registry.

---

## Part 5 — The "sandbox" question, answered honestly

**Sandboxing never speeds inference up.** Every option adds overhead; they're for isolation/security/portability.

- **microVMs (Firecracker, E2B, microsandbox, Kata) and gVisor are Linux+KVM-first.** On Windows they need **WSL2** (a Linux VM via Hyper-V) — heavy, hard to bundle into an offline MSI, hostile to 8 GB. microsandbox explicitly lists Windows as WSL2-only. **Skip for this target.**
- **WASM inference (wllama, wasmtime+wasi-nn) is 1.45–1.55× *slower* than native** (up to ~2.5× worst case; confirmed against the "Not So Fast" USENIX paper), plus a 2 GB model-file cap and COOP/COEP threading headers. **Wrong place to lose 1.5–2× on your box.**
- **The ONE legitimate sandbox here is around model-*generated* code:**
  - **SQL (you already do this):** keep the model-facing DuckDB connection **read-only** + statement allow-list (SELECT/CTE only) + row/time limits. *No sandbox runtime needed* — and you already run renderer DuckDB read-only.
  - **Arbitrary Python/JS the agent writes (if you ever allow it):** run it in a **Pyodide (WASM) worker** or a bundled **Deno** child process with no FS/network grants. Here WASM's perf penalty is irrelevant and capability-isolation is the whole point. Ship the runtime offline (vendor it; no CDN).
- **Windows-native isolation you already get:** Electron/Chromium renderers run in **AppContainer**. That's your process sandbox; no microVM needed.

**So:** native inference + read-only DuckDB + WASM-for-generated-code. The word "sandbox" in your goal should attach to *the agents' outputs*, not the model.

---

## Part 6 — Typography

**Reality check:** `src/app/layout.tsx` loads **Geist** (sans, `--font-sans`), **Fraunces** (serif, `--font-edition-serif` — the "Bon après-midi" headline), **Fira Code** + **JetBrains Mono** (`--font-nerd`, used for desktop chrome: menus, dock, window titles, search). **There is no Poppins.** The over-techy feel = monospace driving the chrome.

**Research verdict (2026, data-dense desktop on Windows):**
- **Don't make Poppins the workhorse.** It's a headline/marketing geometric sans; below ~14 px it goes "clinical" and loses legibility — wrong for dense tables and small chrome.
- **Pick ONE neutral UI sans for everything (body + ALL chrome):** **Geist** (already in your stack, Swiss-geometric, ships `tnum`) — lowest-churn; or **Inter** (best small-size legibility, near-best Windows ClearType hinting) — safest purely on small-size rendering. Either pairs cleanly with Fraunces (the serif/sans contrast carries the editorial warmth).
- **Keep Fraunces for editorial headlines** — that's the "Daily Edition" voice.
- **Monospace discipline:** stop using JetBrains Mono for navigation/menus/dock/titles/search. **Collapse two monospaces to one** (Geist Mono or JetBrains Mono), scoped strictly to **code, file paths, command strings, and raw data cells.**
- **Numbers:** get aligned columns from the body sans via `font-variant-numeric: lining-nums tabular-nums` (only on tables/KPIs/timers — not body), *not* from a monospace. Watch the silent-override gotcha: any ancestor `font-feature-settings: 'tnum' 0` disables it.
- **Scale:** table cells ~13 px / line-height 1.4.

**Target system: 1 serif (Fraunces) + 1 sans (Geist *or* Inter, everywhere) + 1 mono (code/data only).** This is a renderer/CSS-token change — it does **not** touch the inference lane. Self-host woff2 (offline-first); ship only the weights/axes you use.

---

## Recommended path (phased)

**Phase 1 — Architecture (biggest ROI, ~free, no packaging risk).** Collapse the swarm's 12+ serialized calls to 1–3: embeddings/rules for routing & intent (reuse MiniLM), single grammar-constrained call for multi-field extraction, confidence-cascade for the heavy path. Add prefix-caching of the static system prompt (`preloadPrompt`/`saveState`), `mlock` + warm-up, threads=4, small context. Default the Commander's routing to embeddings, not an LLM call.

**Phase 2 — Engine choice (after Phase 1, measure first).** Either (a) tune in place (Q4_0 "fast" profile + the above), and/or (b) add **BitNet b1.58-2B** as an optional bundled "fast CPU" engine via a spawned `llama-server` sidecar behind your provider registry, with prompt+repair+Zod structured fallback. Default download → a smaller model to kill the 1 GB first-run wait.

**Phase 3 — Typography.** Token-level refactor to 1 serif + 1 sans + 1 mono; repoint chrome off JetBrains Mono; add a `tnum` utility for data. Low risk, high polish.

**Sandbox — only when you let agents run code.** SQL stays read-only DuckDB + allow-list (now). Python → Pyodide worker (later, if needed). No microVM.

---

## Decisions to converge on
1. **Priority/scope:** architecture-first (Phase 1, recommended) vs jump to the BitNet engine swap vs typography-first?
2. **Engine direction:** keep node-llama-cpp + tune, or commit to building/bundling the BitNet sidecar (accepting the Windows-binary build + loss of native grammar)?
3. **Download strategy:** shrink default model (0.5B / BitNet) to kill the first-run wait — yes/no?
4. **UI sans:** Geist (lowest churn, already in stack) vs Inter (best small-size Windows legibility)?

---

## Sources (selected, verified)
- BitNet: github.com/microsoft/BitNet · huggingface.co/microsoft/bitnet-b1.58-2B-4T · arxiv.org/html/2504.12285v1 · arxiv.org/html/2410.16144
- llamafile/Ollama: github.com/mozilla-ai/llamafile · docs.mozilla.ai/llamafile · github.com/antarasi/electron-ollama
- llama.cpp tuning: llama.cpp discussions #20574 (prompt cache), #572 (threads), #4130 (shared KV); docs/speculative.md; ik_llama #164 (quant ordering); node-llama-cpp.withcat.ai/guide/chat-session & /tips-and-tricks
- Sandboxes: firecracker-microvm.github.io · github.com/superradcompany/microsandbox (#47 Windows) · gvisor.dev/docs/architecture_guide/performance · USENIX ATC19 "Not So Fast" (WASM) · github.com/ngxson/wllama · amirmalik.net/2025/03/07/code-sandboxes-for-llm-ai-agents
- Architecture: arxiv 2504.04277 (embeddings vs prompting) · langchain.com/blog/how-do-i-speed-up-my-agent · arxiv 2510.05059 (staircase streaming)
- Typography: fontfyi.com/blog/best-sans-serif-fonts-2026 · fontalternatives.com/blog/best-fonts-dense-dashboards · datawrapper.de/blog/fonts-for-data-visualization · vercel.com/font
