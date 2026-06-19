/**
 * Structured-output schema-conformance eval.
 *
 * FOCUS: how reliably the prompt+repair lane in
 * `src/platform/ai/provider/structured.ts` turns raw, model-like text into
 * schema-valid data — and how well a live local model emits schema-valid JSON
 * on the FIRST pass (no repair needed).
 *
 * Two layers:
 *
 *  DETERMINISTIC (the real gate — runs with NO model):
 *    - Recovery rate of `parseStructured` over a fixed positive corpus
 *      (clean JSON, fenced blocks, trailing/leading prose, trailing commas,
 *      smart quotes). Thresholds are calibrated to the parser's ACTUAL current
 *      behaviour (measured first, asserted at/just below the observed rate).
 *    - Rejection rate over a fixed negative corpus (wrong shape, bad enums,
 *      out-of-range numbers, pure prose, truncated JSON) — a healthy parser
 *      must THROW on these, not silently coerce.
 *    - Component checks: `extractJsonBlock` pulls the balanced block out of
 *      prose/fences; `repairJson` fixes trailing commas + smart quotes.
 *
 *  LIVE (model-gated via `liveIt` — auto-skips with no GGUF):
 *    - First-pass schema conformance: prompt the model for a small structured
 *      object and measure how often `JSON.parse(raw)` + `schema.parse(...)`
 *      succeeds with NO repair, plus the (looser) recovery rate WITH repair.
 */

import { JSONDiff, ValidJSON } from "autoevals";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { accuracy, assertAtLeast, mean, report } from "./_harness";
import { liveIt, loadLocalEngine } from "./_model";
import { extractJsonBlock, parseStructured, repairJson } from "@/platform/ai/provider/structured";
import {
  NEGATIVE_CASES,
  POSITIVE_CASES,
  STRUCTURED_CASES,
  type StructuredCase,
} from "./fixtures/structured-corpus";
import { EQUIVALENT_RECOVERY_PAIRS, STRUCTURED_GOLD } from "./fixtures/structured-gold";

/** Run one corpus case; `true` when the OBSERVED outcome matches `shouldRecover`. */
function outcomeMatchesExpectation(testCase: StructuredCase): boolean {
  let recovered: boolean;
  try {
    parseStructured(testCase.raw, testCase.schema, { label: testCase.id });
    recovered = true;
  } catch {
    recovered = false;
  }
  return recovered === testCase.shouldRecover;
}

// Calibrated to the parser's ACTUAL measured behaviour on this corpus. The
// parser recovers every positive case and rejects every negative case today, so
// both rates measure 1.0; the thresholds sit just below to leave headroom for a
// future hard fixture without masking a real regression.
const POSITIVE_RECOVERY_THRESHOLD = 1.0; // observed: 12/12 recovered
const NEGATIVE_REJECTION_THRESHOLD = 1.0; // observed: 5/5 rejected
const OVERALL_CONFORMANCE_THRESHOLD = 1.0; // observed: 17/17 outcomes correct

describe("structured-output recovery (deterministic)", () => {
  it("recovers schema-valid data from the positive corpus", () => {
    // Arrange / Act
    const predicted = POSITIVE_CASES.map((c) => {
      try {
        parseStructured(c.raw, c.schema, { label: c.id });
        return true;
      } catch {
        return false;
      }
    });
    const gold = POSITIVE_CASES.map(() => true);

    const recoveryRate = accuracy(predicted, gold);
    report("structured.recoveryRate", recoveryRate);

    // Assert — gate at the measured rate.
    assertAtLeast(recoveryRate, POSITIVE_RECOVERY_THRESHOLD, "structured.recoveryRate");
    expect(POSITIVE_CASES.length).toBeGreaterThanOrEqual(10);
  });

  it("rejects (throws on) the negative corpus rather than coercing", () => {
    const rejected = NEGATIVE_CASES.map((c) => {
      try {
        parseStructured(c.raw, c.schema, { label: c.id });
        return false; // recovered a wrong-shape value — that is a MISS here.
      } catch {
        return true; // correctly threw.
      }
    });
    const gold = NEGATIVE_CASES.map(() => true);

    const rejectionRate = accuracy(rejected, gold);
    report("structured.rejectionRate", rejectionRate);

    assertAtLeast(rejectionRate, NEGATIVE_REJECTION_THRESHOLD, "structured.rejectionRate");
    expect(NEGATIVE_CASES.length).toBeGreaterThanOrEqual(5);
  });

  it("produces the correct outcome across the full corpus", () => {
    const scores = STRUCTURED_CASES.map((c) => (outcomeMatchesExpectation(c) ? 1 : 0));
    const conformance = mean(scores);
    report("structured.overallConformance", conformance);

    assertAtLeast(conformance, OVERALL_CONFORMANCE_THRESHOLD, "structured.overallConformance");
  });

  it("extractJsonBlock pulls the balanced block out of prose and fences", () => {
    // Object inside trailing prose.
    expect(extractJsonBlock('{"a":1} trailing words')).toBe('{"a":1}');
    // Fenced block.
    expect(extractJsonBlock('```json\n{"a":1}\n```')).toBe('{"a":1}');
    // Array root chosen when it appears first.
    expect(extractJsonBlock("prose [1,2,3] more")).toBe("[1,2,3]");
    // Braces inside strings don't break balance.
    expect(extractJsonBlock('{"k":"a}b"} tail')).toBe('{"k":"a}b"}');
    // No JSON at all.
    expect(extractJsonBlock("no json here")).toBeNull();
  });

  it("repairJson fixes trailing commas and smart quotes", () => {
    const repaired = repairJson('{ "a": 1, "b": [2,3,], }');
    expect(JSON.parse(repaired)).toEqual({ a: 1, b: [2, 3] });

    const smart = repairJson("{ “key”: “value” }");
    expect(JSON.parse(smart)).toEqual({ key: "value" });
  });
});

// ─── DETERMINISTIC autoevals (offline scorers — recovered-value quality) ──────
//
// Wires the OFFLINE autoevals scorers (no network, no API key) into the suite:
//   - `ValidJSON`: every recovered value, re-serialized, must be valid JSON.
//   - `JSONDiff` (default offline Levenshtein+NumericDiff leaves): the recovered
//     value must structurally match its hand-authored gold object, AND two
//     surface-different encodings of the same payload (clean vs fenced vs prose)
//     must recover to structurally identical values.

/** Recover the parsed value for a corpus case by id, or throw a clear error. */
function recoverById(id: string): unknown {
  const testCase = STRUCTURED_CASES.find((c) => c.id === id);
  if (!testCase) throw new Error(`recoverById: no corpus case with id "${id}"`);
  return parseStructured(testCase.raw, testCase.schema, { label: testCase.id });
}

describe("structured-output autoevals (deterministic)", () => {
  it("every recovered value re-serializes to valid JSON (autoevals ValidJSON)", async () => {
    // Each positive case the parser recovers must yield a value that round-trips
    // through JSON.stringify into syntactically valid JSON.
    const scores = await Promise.all(
      POSITIVE_CASES.map(async (c) => {
        let serialized: string;
        try {
          serialized = JSON.stringify(parseStructured(c.raw, c.schema, { label: c.id }));
        } catch {
          return 0; // failed to recover at all — counts as a miss here.
        }
        const { score } = await ValidJSON({ output: serialized });
        return score ?? 0;
      }),
    );
    const validJsonRate = mean(scores);
    report("structured.autoevals.validJsonRate", validJsonRate);

    // Recovery yields a real object every time, so re-serialization is always
    // valid JSON — observed 1.0; gate AT 1.0 (a miss here is a real regression).
    assertAtLeast(validJsonRate, 1, "structured.autoevals.validJsonRate");
  });

  it("recovered values structurally match their gold objects (autoevals JSONDiff)", async () => {
    const scores = await Promise.all(
      STRUCTURED_GOLD.map(async ({ id, expected }) => {
        const recovered = recoverById(id);
        const { score } = await JSONDiff({ output: recovered, expected });
        return score ?? 0;
      }),
    );
    const meanSimilarity = mean(scores);
    report("structured.autoevals.goldJSONDiff", meanSimilarity);

    // The recovered object equals the canonical gold object field-for-field, so
    // structural similarity is 1.0 — observed first, gated just below for
    // robustness to an incidental future float-format delta.
    assertAtLeast(meanSimilarity, 0.99, "structured.autoevals.goldJSONDiff");
    expect(STRUCTURED_GOLD.length).toBeGreaterThanOrEqual(3);
  });

  it("surface-different encodings recover to identical values (autoevals JSONDiff)", async () => {
    // Clean JSON vs the SAME payload in a fence / with prose must recover to
    // structurally identical objects — proves fence/prose stripping is neutral.
    const scores = await Promise.all(
      EQUIVALENT_RECOVERY_PAIRS.map(async ({ a, b }) => {
        const { score } = await JSONDiff({ output: recoverById(a), expected: recoverById(b) });
        return score ?? 0;
      }),
    );
    const meanEquivalence = mean(scores);
    report("structured.autoevals.encodingEquivalence", meanEquivalence);

    // Identical payloads → perfect structural match regardless of surface form.
    assertAtLeast(meanEquivalence, 1, "structured.autoevals.encodingEquivalence");
  });

  it("ValidJSON rejects the pure-prose negative case (sanity anchor)", async () => {
    // Anchor that ValidJSON behaves as documented: non-JSON scores 0.
    const prose = STRUCTURED_CASES.find((c) => c.id === "prose.only");
    if (!prose) throw new Error('missing corpus case "prose.only"');
    const { score } = await ValidJSON({ output: prose.raw });
    expect(score).toBe(0);
  });
});

describe("structured-output live conformance (model-gated)", () => {
  // A small, flat schema the 1.5B model can satisfy reliably.
  const liveSchema = z.object({
    sentiment: z.enum(["positive", "negative", "neutral"]),
    score: z.number().min(0).max(1),
  });

  const livePrompts: readonly { text: string }[] = [
    { text: "I absolutely love this product, it works perfectly." },
    { text: "This is the worst experience I have ever had." },
    { text: "The package arrived on Tuesday as scheduled." },
    { text: "Great value and fast shipping, highly recommend." },
  ];

  liveIt("emits schema-valid JSON, measuring first-pass and repaired conformance", async () => {
    const engine = await loadLocalEngine();
    try {
      await engine.ensureModel();

      const system =
        "You output ONLY a single JSON object and nothing else — no prose, no code fences. " +
        'Shape: {"sentiment": "positive"|"negative"|"neutral", "score": <number 0..1>}.';

      const firstPass: number[] = [];
      const withRepair: number[] = [];

      for (const { text } of livePrompts) {
        const { text: raw } = await engine.generate({
          system,
          prompt: `Classify the sentiment of this text:\n"${text}"\nReturn ONLY the JSON object.`,
          maxTokens: 64,
          temperature: 0,
        });

        // First-pass: strict JSON.parse on the raw output, no repair.
        let firstPassOk = 0;
        try {
          liveSchema.parse(JSON.parse(raw.trim()));
          firstPassOk = 1;
        } catch {
          firstPassOk = 0;
        }
        firstPass.push(firstPassOk);

        // With repair: the production parseStructured lane.
        let repairedOk = 0;
        try {
          parseStructured(raw, liveSchema, { label: "live.sentiment" });
          repairedOk = 1;
        } catch {
          repairedOk = 0;
        }
        withRepair.push(repairedOk);
      }

      const firstPassRate = mean(firstPass);
      const repairedRate = mean(withRepair);
      report("structured.live.firstPassConformance", firstPassRate);
      report("structured.live.repairedConformance", repairedRate);

      // Repair can only help, never hurt: the recovered rate must dominate.
      expect(repairedRate).toBeGreaterThanOrEqual(firstPassRate);

      // Conservative live gate: at least half of repaired outputs conform.
      // (First-pass conformance is reported but not gated — small models are
      // noisy and the production path always runs through repair.)
      assertAtLeast(repairedRate, 0.5, "structured.live.repairedConformance");
    } finally {
      await engine.dispose();
    }
  });
});
