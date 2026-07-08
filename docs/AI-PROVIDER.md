# Unified AI provider layer

`src/platform/ai/provider/` wraps node-llama-cpp — the app's sole text-generation
provider — behind one `AIProvider` interface, so feature code depends on a
stable surface (`useAI()`) rather than importing the Electron IPC bridge
directly. The app previously carried three parallel inference stacks
(Transformers.js, MLC web-LLM, an Ollama/OpenAI HTTP lane); those adapters have
been removed, and `@huggingface/transformers` itself is gone. The embeddings
lane (`src/platform/ai/embeddings.ts` / `inference-client.ts`) now also runs
through node-llama-cpp in the Electron main process — see
`electron/embed-service.ts` — unrelated to text generation.

## Architecture

```
provider/
  types.ts          AIProvider interface, requests, results, capabilities, errors
  structured.ts     robust JSON extraction + Zod validation (pure, tested)
  adapters/
    base.ts         prompt-based structured fallback + message flattening
    llamacpp.ts      thin IPC client for the Electron main-process GGUF lane
                      (grammar-constrained JSON, offline)              [sole provider]
  registry.ts       PROVIDERS = [llamacppProvider]; pickDefaultProvider()
  store.ts          persisted provider/model selection + live progress (zustand)
  use-ai.ts         useAI() React hook — the entry point for feature code
  index.ts          public barrel ("@/platform/ai/provider")
```

The registry/store shape stays in place even with one provider so a future
lane can be added without every call site changing.

## Using it from a component

```tsx
import { useAI } from "@/platform/ai/provider";
import { z } from "zod";

const ChartPlan = z.object({
  chartType: z.enum(["bar", "line", "pie"]),
  x: z.string(),
  y: z.string(),
  reasoning: z.string(),
});

function Suggest() {
  const ai = useAI(); // resolves the llamacpp lane on mount
  async function run() {
    const plan = await ai.generateStructured(
      { system: "You are a data viz expert.", prompt: "Plan a chart for revenue by channel." },
      ChartPlan,
    );
    // plan is fully typed + schema-validated
  }
  // ai.progress drives a loading bar; ai.availability reports readiness
}
```

## The llamacpp lane

node-llama-cpp can only run in the Electron main process (it crashes the
renderer), so `adapters/llamacpp.ts` is a thin IPC client: it calls
`window.electronLlama.*`, exposed by `electron/preload.ts` over the `llama:*`
channels and backed by `electron/llama-service.ts`. `isAvailable()` is gated on
`window.electronLlama` existing AND the main-process service reporting a
loadable model — on the web build, or before a GGUF is downloaded, it's simply
`false`; there is no fallback to a different provider, so callers see an
`AIUnavailableError` and should prompt the user through the Setup / model
download flow rather than silently degrading.

## Structured output

`generateStructured(req, zodSchema)` returns typed, validated data using
grammar-constrained decoding: a JSON schema (derived from the caller's Zod
schema via `zodToInlineJsonSchema`) constrains the sampler so the output is
valid JSON *by construction* — no regex-repair fallback needed for the happy
path. `parseStructured` / `extractJsonBlock` (pure, in `structured.ts`) remain
as a defensive net for edge cases and are covered by
`tests/platform/ai/provider-structured.test.ts`.

## The model catalog

**`electron/model-download-service.ts`'s `MODEL_DOWNLOADS` array is the single
source of truth** for which GGUF models this app ships. Three other files
mirror it (hand-synced — see the comment on each explaining why they can't
just import it):

| File | Role |
| --- | --- |
| `electron/model-download-service.ts` | Canonical catalog (key, file, HF URI, sha256, bytes, family, sizeLabel) + the in-app downloader (node-llama-cpp's `createModelDownloader`) |
| `electron/llama-service.ts` | Imports `MODEL_DOWNLOADS` directly (same main process) for `DEFAULT_LLM_MODEL` / `KNOWN_MODELS` |
| `src/platform/ai/models/model-manifest.ts` | Renderer-side mirror (adds `downloadMb`, presence-probe metadata for the Setup UI) — can't import the main-process file across the bundling boundary |
| `src/platform/ai/provider/adapters/llamacpp.ts` | Renderer-side `AIModelInfo[]` mirror, feeds the model picker in Setup |

Currently ships: **Gemma 4 E4B Instruct** (`gemma-4-e4b-it-q4_k_m.gguf`,
default) and **Granite 4.1 3B Instruct** (`granite-4.1-3b-instruct-q4_k_m.gguf`,
optional, lower resource use). `electron/ipc-validation.ts`'s `ModelKeySchema`
allowlists exactly these two keys for the `models:*` IPC channels.

Voice models (STT/TTS — `voice-model-registry.ts`, `electron/voice-service.ts`)
are a separate catalog. The embeddings model (Qwen3 Embedding 0.6B GGUF, also
in `model-manifest.ts`) now runs through node-llama-cpp as well, via
`electron/embed-service.ts`.

## Configuration

Provider/model selection persists via `useAIRuntimeStore`, durable in the
`"settings"` drizzle namespace (survives reloads, included in settings
backup/restore) — see `store.ts`.
