/**
 * Pure scoring + reporting helpers for the offline-LLM eval harness.
 *
 * Design constraints (deliberate):
 * - ZERO runtime dependencies — no vitest, no app code, no native modules. This
 *   file can be imported by any eval suite (or a plain `tsx` script) without
 *   pulling in jsdom or node-llama-cpp.
 * - Pure + deterministic — every function is a value->value transform with no
 *   side effects, EXCEPT `report`, which only `console.log`s.
 * - Fail LOUD — `assertAtLeast` throws an `EvalAssertionError` with a clear,
 *   greppable message so a regression shows up as a normal test failure.
 *
 * Downstream eval suites import these verbatim; keep the signatures stable.
 */

/** Equality predicate used to compare a predicted value against its gold value. */
export type EqFn<T> = (predicted: T, gold: T) => boolean;

/** Thrown by {@link assertAtLeast} when a metric is below its threshold. */
export class EvalAssertionError extends Error {
  readonly metric: number;
  readonly threshold: number;
  readonly label: string;

  constructor(label: string, metric: number, threshold: number) {
    super(
      `Eval "${label}" failed: metric ${metric.toFixed(4)} < threshold ${threshold.toFixed(4)}`,
    );
    this.name = "EvalAssertionError";
    this.metric = metric;
    this.threshold = threshold;
    this.label = label;
  }
}

/**
 * Fraction of `predicted` entries that match the aligned `gold` entry, in
 * `[0, 1]`. Returns `1` for two empty arrays (vacuously perfect — nothing to
 * get wrong). Compares by `Object.is` unless a custom `eq` is supplied.
 *
 * @throws RangeError when the arrays differ in length (a misaligned eval set is
 *         a bug, not a 0% score).
 */
export function accuracy<T>(predicted: readonly T[], gold: readonly T[], eq?: EqFn<T>): number {
  if (predicted.length !== gold.length) {
    throw new RangeError(
      `accuracy(): length mismatch — predicted=${predicted.length}, gold=${gold.length}`,
    );
  }
  if (predicted.length === 0) return 1;

  const equals: EqFn<T> = eq ?? ((a, b) => Object.is(a, b));
  let hits = 0;
  for (let i = 0; i < predicted.length; i += 1) {
    if (equals(predicted[i], gold[i])) hits += 1;
  }
  return hits / predicted.length;
}

/**
 * Arithmetic mean of `nums`. Returns `0` for an empty array (so callers can
 * average a possibly-empty score list without a divide-by-zero `NaN`).
 */
export function mean(nums: readonly number[]): number {
  if (nums.length === 0) return 0;
  let sum = 0;
  for (const n of nums) sum += n;
  return sum / nums.length;
}

/**
 * Assert a metric meets a minimum threshold. No-op on success; throws
 * {@link EvalAssertionError} with a clear, greppable message on failure.
 *
 * @param metric    Observed score (typically in `[0, 1]`).
 * @param threshold Minimum acceptable score.
 * @param label     Human-readable name of the metric, used in the error message.
 */
export function assertAtLeast(metric: number, threshold: number, label: string): void {
  if (Number.isNaN(metric)) {
    throw new EvalAssertionError(label, metric, threshold);
  }
  if (metric < threshold) {
    throw new EvalAssertionError(label, metric, threshold);
  }
}

/**
 * Log a single metric line for human inspection of an eval run. Side-effecting
 * by design (the ONLY side-effecting helper here). `metric` is rendered to 4
 * decimal places.
 */
export function report(label: string, metric: number): void {
  // eslint-disable-next-line no-console
  console.log(`[eval] ${label}: ${metric.toFixed(4)}`);
}
