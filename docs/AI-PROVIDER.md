# Unified AI provider layer

The app previously had three independent inference stacks that feature code
imported directly and inconsistently:

- **Transformers.js** — `src/features/agent-canvas/core/llm.ts` (ONNX in a Web
  Worker, WASM/WebGPU).
- **MLC web-LLM** — `src/platform/ai/llm-engine.ts` (WebGPU, quantized weights).
- **Edge/Ollama worker** — `src/features/data-formulator/core/ollama-provider.ts`.

`src/platform/ai/provider/` unifies them behind one `AIProvider` interface so
features depend on a stable surface and the runtime is swappable / auto-selected.

## Architecture

```
provider/
  types.ts          AIProvider interface, requests, results, capabilities, errors
  structured.ts     robust JSON extraction + Zod validation (pure, tested)
  adapters/
    base.ts         prompt-based structured fallback + message flattening
    webllm.ts       wraps llm-engine.ts (MLC, WebGPU)        [offline]
    transformers.ts wraps agent-canvas/core/llm.ts (ONNX)    [offline, streaming]
    ollama.ts       local Ollama HTTP (native JSON schema)   [offline, streaming]
    openai.ts       OpenAI-compatible cloud (opt-in)         [cloud, structured]
  registry.ts       capability detection + offline-first default selection
  store.ts          persisted provider/model selection + live progress (zustand)
  use-ai.ts         useAI() React hook — the entry point for feature code
  index.ts          public barrel ("@/platform/ai/provider")
```

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
  const ai = useAI(); // auto-detects an offline runtime on mount
  async function run() {
    const plan = await ai.generateStructured(
      { system: "You are a data viz expert.", prompt: "Plan a chart for revenue by channel." },
      ChartPlan,
    );
    // plan is fully typed + schema-validated
  }
  // ai.progress drives a loading bar; ai.availability lists runtimes
}
```

## Offline-first selection

`registry.pickDefaultProvider()` probes providers in preference order and returns
the first available one:

1. **web-LLM** when WebGPU is present (best offline quality),
2. **Transformers.js** otherwise (runs anywhere with Web Workers + WASM),
3. **Ollama** if a local daemon answers on `127.0.0.1:11434`,
4. **OpenAI-compatible** only when the user configures a base URL.

Nothing leaves the machine unless the user explicitly configures the cloud
adapter. Selection persists in `localStorage` under `ai-runtime`.

## Structured output

`generateStructured(req, zodSchema)` returns typed, validated data:

- **Ollama / OpenAI** use native JSON-schema constrained decoding (Zod →
  JSON-Schema via `z.toJSONSchema`).
- **web-LLM / Transformers.js** use a strict "JSON only" prompt, then
  `parseStructured` recovers the JSON (fence-stripping, balanced-block
  extraction, trailing-comma/smart-quote repair) and validates it with Zod.

`parseStructured` / `extractJsonBlock` are pure and covered by
`tests/platform/ai/provider-structured.test.ts`.

## Configuration (localStorage keys)

| Key | Purpose |
| --- | --- |
| `ai-runtime` | persisted `{ providerId, model }` |
| `ai.ollama.host` | override Ollama host (default `http://127.0.0.1:11434`) |
| `ai.openai.baseUrl` | enable cloud adapter (e.g. `https://api.openai.com`) |
| `ai.openai.apiKey` | bearer token for the cloud adapter |
| `ai.openai.models` | comma-separated model ids for the menu |

## Migration guide

Replace direct engine imports with the hook:

```diff
- import { generateText } from "@/platform/ai/llm-engine";
- const text = await generateText(prompt, { systemPrompt });
+ import { useAI } from "@/platform/ai/provider";
+ const ai = useAI();
+ const { text } = await ai.generate({ system, prompt });
```

The old engine modules remain as the adapter implementations — do not import them
directly from feature code anymore; go through the provider so runtime selection,
progress, and structured output behave consistently everywhere.
