# Offline-LLM Eval Harness

Behavioural evaluations for the local LLM features (NL→SQL, structured/Zod
output, the "Moudir" agent swarm, AI briefings).

These evals live **outside** the unit suite. The unit suite (`vitest.config.ts`)
includes `tests/**`; this harness (`vitest.eval.config.ts`) includes only
`evals/**/*.eval.ts`, so `pnpm run test` never runs (or is slowed by) evals.

## Two run modes

| Mode | Command | What runs |
| --- | --- | --- |
| **Deterministic** | `pnpm run test:eval` | Pure scoring/harness checks. No model. Always runnable in CI. |
| **Live** | `pnpm run test:eval:live` | Everything above **plus** evals that load the real GGUF and call the local LLM. |

`test:eval:live` sets `DN_EVAL_LIVE=1` (via `cross-env`). Live evals **auto-skip**
unless **both** are true:

1. `DN_EVAL_LIVE` is set, and
2. a `*.gguf` file is found under the model directory.

So running `test:eval:live` without a model still passes — the live cases skip
cleanly rather than failing.

## Installing a model for live runs

The GGUF weights are **not** bundled. The app downloads them (while online) into
`<userData>/models/llm/` — on Windows dev that is
`%APPDATA%/Electron/models/llm/`. The default model is
`qwen2.5-1.5b-instruct-q4_k_m.gguf`.

To point the harness at a model in a custom location, set `DN_MODEL_DIR`:

```bash
# PowerShell
$env:DN_MODEL_DIR = "D:\models\llm"
pnpm run test:eval:live

# bash / git-bash
DN_MODEL_DIR=/d/models/llm pnpm run test:eval:live
```

The harness probes, in order: `DN_MODEL_DIR`, then the per-OS Electron userData
location for both the dev (`Electron`) and packaged (`Data Navigator`) app names.

## Writing an eval

```ts
import { describe } from "vitest";
import { accuracy, assertAtLeast, mean, report } from "./_harness";
import { liveIt, loadLocalEngine } from "./_model";

describe("nl->sql", () => {
  // Deterministic cases use `it` and score fixtures with the harness helpers.

  // Live cases use `liveIt` — they auto-skip when no model is present.
  liveIt("generates correct SQL for known prompts", async () => {
    const engine = await loadLocalEngine();
    try {
      await engine.ensureModel();
      // ...drive engine.generate(...), score with accuracy()/mean(),
      // then gate with assertAtLeast(score, threshold, "label").
    } finally {
      await engine.dispose();
    }
  });
});
```

### Helpers

- `_harness.ts` — pure, dependency-free scoring/reporting:
  - `accuracy(predicted, gold, eq?)` → fraction correct in `[0,1]`.
  - `mean(nums)` → arithmetic mean (`0` for empty).
  - `assertAtLeast(metric, threshold, label)` → throws `EvalAssertionError` below threshold.
  - `report(label, metric)` → `console.log` one metric line.
- `_model.ts` — model detection + lazy engine loading:
  - `hasLocalModel()` → `true` only when live mode is on AND a GGUF exists.
  - `resolveModelDir()` → the dir containing a GGUF, or `null`.
  - `liveIt` / `liveDescribe` → `it`/`describe` that skip without a model.
  - `loadLocalEngine()` → dynamically imports the native llama engine (only when called).

> Importing `_model.ts` never loads native modules — the `node-llama-cpp`
> import happens only inside `loadLocalEngine()`.

## Fixtures

Put prompt/gold datasets under `evals/fixtures/`.
