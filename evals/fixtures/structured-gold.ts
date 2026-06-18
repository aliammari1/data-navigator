/**
 * Gold expected-VALUES for a subset of the structured-output corpus — used by
 * the autoevals `JSONDiff` similarity layer in `structured-output.eval.ts`.
 *
 * WHY:
 *   `structured-corpus.ts` only carries the raw model-like INPUT string and a
 *   boolean `shouldRecover`. That is enough to score the parser's *recovery
 *   rate* (did it throw or not), but it cannot answer the finer question the
 *   autoevals layer adds: when the parser DOES recover a value, how close is
 *   that value to the intended canonical object? This fixture supplies the gold
 *   canonical object for a focused subset of positive cases so `JSONDiff` can
 *   score recovered-vs-gold structural similarity (offline, deterministic).
 *
 * DETERMINISM:
 *   Static literals only — no I/O, no Math.random, no Date.now. The parser path
 *   is model-free, so the resulting `JSONDiff` scores are fully reproducible.
 *
 * The gold objects mirror the schema the corpus case validates against, so
 * `JSONDiff` walks the same nested shape `schema.parse(...)` produces.
 */

/** Map of corpus-case id → the canonical recovered object it should yield. */
export interface StructuredGold {
  /** Stable id — MUST match a positive case id in `structured-corpus.ts`. */
  readonly id: string;
  /** The canonical object a correct recovery should produce. */
  readonly expected: unknown;
}

export const STRUCTURED_GOLD: readonly StructuredGold[] = [
  {
    id: "insight.clean",
    expected: {
      insights: [
        {
          category: "anomaly",
          title: "Revenue dip on 2024-03-12",
          description: "Daily revenue fell 38% versus the trailing 7-day mean.",
          severity: "warning",
          impact: "high",
          confidence: 0.82,
        },
      ],
    },
  },
  {
    id: "recipe.clean",
    expected: {
      steps: [
        { type: "filter", label: "Amount over 100", condition: "amount > 100" },
        { type: "sort", label: "Newest first", column: "date", direction: "DESC" },
      ],
    },
  },
  {
    id: "plan.clean",
    expected: {
      goal: "Find revenue anomalies",
      reasoning: "Aggregate by day, then scan for dips.",
      sqlSpecs: [
        {
          id: "daily",
          purpose: "Daily revenue",
          sql: "SELECT date, SUM(amount) AS rev FROM v GROUP BY date",
        },
      ],
      chartSpecs: [{ usesSqlId: "daily", type: "line", x: "date", y: "rev" }],
      anomalyChecks: [{ usesSqlId: "daily", kind: "dip" }],
    },
  },
];

/**
 * Pairs of positive corpus ids whose recovered values MUST be structurally
 * identical because they encode the SAME payload through different surface
 * forms (e.g. clean JSON vs the same JSON inside a ```json fence). Scoring these
 * with `JSONDiff` proves the parser's fence/prose stripping is content-neutral.
 */
export const EQUIVALENT_RECOVERY_PAIRS: readonly { a: string; b: string }[] = [
  // Clean object vs the SAME object wrapped in a ```json fence.
  { a: "insight.clean", b: "insight.fencedJson" },
  // Clean object vs the SAME object with trailing prose after it.
  { a: "insight.clean", b: "insight.trailingProse" },
  // Clean object vs the SAME object with leading prose before it.
  { a: "insight.clean", b: "insight.leadingProse" },
];
