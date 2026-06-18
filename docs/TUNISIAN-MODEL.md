# Tunisian Derja support — what's real, what's not

This is an honest engineering note about how far the **offline** AI in
data-navigator can go on Tunisian Arabic (Derja), on a **medium-end PC with no
runtime internet**. It separates what ships today from what needs a bigger model
and what needs a real fine-tune. No marketing.

## TL;DR

- We **ship** decent Derja *understanding* and same-language answers today, by
  prompting the existing small multilingual model with a Derja system hint +
  glossary, plus Whisper "arabic" speech-to-text. Quality is **good for MSA,
  partial for Derja**, and best when the question uses the words in our glossary.
- Real Derja **fluency** is not something a 1.5B model gives you. The honest
  upgrade is a **bigger on-device model** (Qwen2.5-7B) for stronger machines, and
  the honest *fix* is a **LoRA fine-tune** done offline at build time whose output
  GGUF simply drops into the models folder.

---

## 1. What works NOW, fully on-device

Nothing below needs the internet at runtime or any new model file.

### Text (generative)
The generative lane runs `qwen2.5-1.5b-instruct-q4_k_m.gguf` via
node-llama-cpp (`electron/llama-service.ts`, registered in
`src/platform/ai/models/model-manifest.ts`). Qwen2.5 is genuinely multilingual:
it handles **Modern Standard Arabic (MSA) well** and **some Tunisian Derja** —
but it is **not fine-tuned for Derja**, so raw Derja results are uneven.

To squeeze more out of it without a new model, we added
`src/platform/ai/locale/derja.ts`:

- **`DERJA_SYSTEM_HINT`** — a compact system-prompt fragment that tells the model
  Derja arrives as Arabic script, **Arabizi** (Latin + the 3/7/9 number-letters),
  or **French code-switching**, grounds it with a short glossary of common Derja
  analytics terms (`9adech`=how much, `chnowa`=what, `kifech`=how, `barcha`=a lot,
  `ennhar`=day, `flus`=money, `3dad`=count, …), and instructs it to answer in the
  user's own language **and script**.
- **`detectLikelyLanguage(text)`** — a tiny, dependency-free **heuristic** (NOT
  detection ML) that flags Arabic script, Arabizi digit-letters, Derja tokens, and
  French stopwords. It's a hint, not a classifier; it will be wrong on short input.
- **`localizedSystemPrefix(text)`** — returns the hint only when the message looks
  like Derja/Arabic, so we don't waste the small model's context otherwise.

This hint is wired (additively) into the Moudir swarm's **planner** and
**narrative** agents
(`src/features/data-formulator/core/swarm/agents/planner.ts`,
`narrative.ts`): the planner understands Derja phrasing when it decomposes the
question, and the narrative answers back in the user's language/script.

### Voice (speech-to-text)
STT is **Whisper-tiny (multilingual)**. Arabic (`"ar"`) is supported and the
voice layer already maps the `ar` / `ar-TN` hint to Whisper "arabic". Derja is
often spoken with French and Arabizi code-switching; Whisper-tiny will transcribe
the **Arabic-script** portion reasonably and is weaker on heavy code-switching.

### Realistic quality expectations

| Input | Expectation on the 1.5B default |
| --- | --- |
| MSA question, Arabic script | **Good** — understood and answered well |
| Derja using glossary words (`9adech el flus mta3 ennhar`) | **Decent** — the hint + glossary ground it; usually understood |
| Free-flowing Derja with slang / heavy code-switch | **Partial** — may misread idioms, sometimes drifts to MSA |
| Derja **generation** (fluent Derja prose back) | **Limited** — leans MSA-flavoured, not native Derja |
| Arabic voice → text (clean speech) | **Decent**; weaker on code-switching |

Bottom line for the default model: **understanding** is usable when grounded;
**native Derja fluency** is not there.

---

## 2. What needs a bigger model (still on-device, just heavier)

`Qwen2.5-7B-Instruct` (Q4_K_M, ~4.7 GB) understands Derja and Arabic
**noticeably better** and produces more natural Arabic responses. It is added as
an **optional** download in the manifest:

```ts
// src/platform/ai/models/model-manifest.ts
{
  key: "qwen2.5-7b-instruct-q4_k_m",
  label: "Qwen2.5 7B Instruct (GGUF q4) — stronger Derja/Arabic, high-RAM",
  optional: true,
  ggufFile: "qwen2.5-7b-instruct-q4_k_m.gguf",
  downloadUrl: ".../Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf",
  // sha256 / bytes: TODO before a verified release
}
```

**Honest caveats:** ~4.7 GB download, wants ~8 GB+ free RAM, and is **much
slower** per token on a CPU-only medium-end PC. It improves Derja, but it is
**still not a Derja-native model** — it's a stronger general multilingual model.
Treat it as an opt-in for capable machines, not the default.

---

## 3. The fine-tune path (aspirational; offline-incompatible to TRAIN, but the result ships)

True Derja fluency — idioms, slang, natural Arabizi handling, on-register answers
— realistically requires a **fine-tune**, not just prompting.

The honest shape of this:

1. **Pick a base**: a multilingual base (e.g. Qwen2.5-1.5B/7B) or a
   Derja/Arabic-leaning base.
2. **LoRA fine-tune** on a **Tunisian Derja instruction dataset** (Derja Q&A,
   Arabizi↔Arabic-script pairs, analytics-style prompts in Derja). This is a
   **build-time / offline-server GPU job** — it needs a machine with a GPU and the
   training data. **The app does NOT do this at runtime**, and the *training* step
   needs resources (and usually a network to gather data) the target PC won't have.
3. **Merge** the LoRA into the base, **quantize to GGUF** (Q4_K_M).
4. **Ship** the resulting `.gguf` exactly like any other entry: drop it into
   `<userData>/models/llm/`, add a manifest entry, select it. From the app's point
   of view it's just another offline model — **no runtime training, no network.**

**Dataset sources / effort (candid):** there is no large, clean, ready-made
Tunisian Derja instruction dataset. Expect real effort — community Derja corpora,
Arabizi↔Arabic transliteration pairs, and hand-curated analytics-domain Q&A in
Derja, plus cleaning. This is the part nobody can hand-wave: **without this work,
the model is not natively fluent in Derja.** Prompting (section 1) narrows the
gap; only a fine-tune closes it.

---

## 4. Shipped vs future — summary

| Capability | Status | Mechanism | Limit |
| --- | --- | --- | --- |
| Understand Derja analytics questions (Arabic script, Arabizi, FR mix) | **Shipped** | `derja.ts` hint + glossary on the 1.5B model | Best on glossary terms; uneven on heavy slang |
| Answer in the user's language & script | **Shipped** | Hint wired into planner + narrative agents | Generated Derja leans MSA-flavoured |
| Arabic voice → text | **Shipped** | Whisper-tiny "arabic" mapping | Weaker on code-switching |
| Stronger Derja/Arabic comprehension & phrasing | **Needs bigger model** | Optional Qwen2.5-7B GGUF (~4.7 GB) | Heavy: ~8 GB RAM, slow on CPU; still not Derja-native |
| Native Derja fluency (idioms, register, slang) | **Needs fine-tune** | Offline LoRA → merge → quantize → GGUF | Training is build-time/GPU + dataset effort; only the GGUF ships |

**Three-line honest summary:**
- **Shipped:** the 1.5B multilingual model + a Derja system hint/glossary + Whisper "arabic" give usable Derja *understanding* and same-language answers — good MSA, partial Derja.
- **Needs a bigger model:** optional on-device Qwen2.5-7B improves Derja/Arabic markedly, at a real RAM/speed cost, and is still not Derja-native.
- **Needs a fine-tune:** true Derja fluency requires an offline LoRA fine-tune on a Derja dataset; the app only consumes the resulting GGUF, never trains.
