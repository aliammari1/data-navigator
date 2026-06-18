import { describe, expect, it } from "vitest";
import { accuracy, assertAtLeast, EvalAssertionError, mean, report } from "./_harness";
import { hasLocalModel, liveIt, loadLocalEngine, resolveModelDir } from "./_model";

/**
 * Smoke eval — proves the harness wiring is sound:
 *  - the pure scoring helpers compute the expected values,
 *  - `assertAtLeast` passes on a trivial metric and throws below threshold,
 *  - the live gate skips cleanly when no local model is installed.
 *
 * This file must stay GREEN in the deterministic (`pnpm run test:eval`) run and
 * must SKIP — not fail — its live case when the GGUF is absent.
 */

describe("eval harness (deterministic)", () => {
  it("computes accuracy over aligned predicted/gold arrays", () => {
    // Arrange
    const predicted = ["a", "b", "c", "d"];
    const gold = ["a", "x", "c", "d"];

    // Act
    const score = accuracy(predicted, gold);
    report("smoke.accuracy", score);

    // Assert — 3 of 4 correct.
    expect(score).toBeCloseTo(0.75, 5);
  });

  it("treats two empty arrays as a perfect (vacuous) score", () => {
    expect(accuracy([], [])).toBe(1);
  });

  it("throws on misaligned eval sets rather than scoring zero", () => {
    expect(() => accuracy([1, 2], [1])).toThrow(RangeError);
  });

  it("supports a custom equality predicate", () => {
    const score = accuracy(
      [" YES ", "no"],
      ["yes", "NO"],
      (p, g) => p.trim().toLowerCase() === g.trim().toLowerCase(),
    );
    expect(score).toBe(1);
  });

  it("averages a score list (and handles empty)", () => {
    expect(mean([1, 0, 0.5, 0.5])).toBeCloseTo(0.5, 5);
    expect(mean([])).toBe(0);
  });

  it("passes assertAtLeast when the metric meets the threshold", () => {
    const metric = mean([1, 1, 1, 0]); // 0.75
    assertAtLeast(metric, 0.7, "smoke.threshold");
    expect(metric).toBeGreaterThanOrEqual(0.7);
  });

  it("throws EvalAssertionError with a clear message below threshold", () => {
    expect(() => assertAtLeast(0.4, 0.8, "smoke.failing")).toThrow(EvalAssertionError);
    expect(() => assertAtLeast(0.4, 0.8, "smoke.failing")).toThrow(/0\.4000 < threshold 0\.8000/);
  });

  it("reports whether a local model is present without throwing", () => {
    // Detection must be side-effect-free and total.
    const present = hasLocalModel();
    expect(typeof present).toBe("boolean");
    // When detection says "present", the dir resolves; otherwise it is null.
    expect(present ? resolveModelDir() !== null : true).toBe(true);
  });
});

describe("eval harness (live, model-gated)", () => {
  liveIt(
    "loads the local engine and generates non-empty text",
    async () => {
      const engine = await loadLocalEngine();
      try {
        await engine.ensureModel();
        const { text } = await engine.generate({
          prompt: "Reply with the single word: ok",
          maxTokens: 8,
          temperature: 0,
        });
        const score = text.trim().length > 0 ? 1 : 0;
        report("smoke.live.nonEmpty", score);
        assertAtLeast(score, 1, "smoke.live.nonEmpty");
      } finally {
        await engine.dispose();
      }
    },
  );
});
