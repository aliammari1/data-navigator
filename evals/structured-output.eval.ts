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
import { extractJsonBlock, parseStructured, repairJson } from "@/platform/ai/provider/structured";
import { accuracy, assertAtLeast, mean, report } from "./_harness";
import { liveIt, loadLocalEngine } from "./_model";
import {
  NEGATIVE_CASES,
  POSITIVE_CASES,
  STRUCTURED_CASES,
  type StructuredCase,
} from "./fixtures/structured-corpus";

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
const POSITIVE_RECOVERY_THRESHOLD = 1.0; // observed: 11/11 recovered
const NEGATIVE_REJECTION_THRESHOLD = 1.0; // observed: 6/6 rejected
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

// ─── Encoding neutrality ──────────────────────────────────────────────────────
//
// The same payload wrapped in fences/prose must recover to the IDENTICAL value.
// Plain deep-equality is sufficient here: every recovery is already Zod-validated,
// so the only extra failure mode worth gating is extraction CORRUPTING a value
// (e.g. dropping a field yet still parsing) — exactly what toEqual catches.

/** Recover the parsed value for a corpus case by id, or throw a clear error. */
function recoverById(id: string): unknown {
  const testCase = STRUCTURED_CASES.find((c) => c.id === id);
  if (!testCase) throw new Error(`recoverById: no corpus case with id "${id}"`);
  return parseStructured(testCase.raw, testCase.schema, { label: testCase.id });
}

describe("structured-output encoding neutrality (deterministic)", () => {
  const EQUIVALENCE_PAIRS = [
    { a: "plan.clean", b: "plan.fencedJson" },
    { a: "plan.clean", b: "plan.fencedBare" },
    { a: "plan.clean", b: "plan.proseSandwich" },
    { a: "plan.clean", b: "plan.trailingCommas" },
  ] as const;

  it("surface-different encodings of one payload recover to identical values", () => {
    for (const { a, b } of EQUIVALENCE_PAIRS) {
      expect(recoverById(a)).toEqual(recoverById(b));
    }
  });

  it("every recovered value round-trips through JSON.stringify", () => {
    for (const c of POSITIVE_CASES) {
      expect(() => JSON.stringify(parseStructured(c.raw, c.schema, { label: c.id }))).not.toThrow();
    }
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
