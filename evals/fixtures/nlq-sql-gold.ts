/**
 * Gold-SQL corpus for the NLQ translator — used by the autoevals string/structural
 * similarity layer in `nlq.eval.ts`.
 *
 * WHY a SEPARATE fixture from `nlq-gold.json`:
 *   `nlq-gold.json` carries only the *intent shape* of each question
 *   (aggregation kind, group-by flag, chart suggestion, confidence band). That
 *   is what the existing deterministic eval scores. It deliberately does NOT
 *   carry a gold SQL string, because the translator's exact emitted SQL (column
 *   order, ROUND wrapping, alias names, LIMIT) is an implementation detail the
 *   intent-shape eval should not be coupled to.
 *
 *   This fixture adds the missing layer: a hand-authored, canonical "what a
 *   competent analyst would write" SQL string per question, so we can score how
 *   CLOSE the generated SQL is to a human reference — not just whether the
 *   coarse intent matches. The autoevals `Levenshtein` scorer measures raw
 *   textual closeness; a structural decomposition scored with `JSONDiff`
 *   measures closeness of the parsed *shape* (select list, group-by, order-by,
 *   limit) independent of whitespace.
 *
 * DETERMINISM:
 *   Every gold string here is a static literal — no Math.random, no Date.now, no
 *   I/O. The translator is itself deterministic (no model on this path), so the
 *   resulting similarity scores are fully reproducible and safe to gate in CI.
 *
 * CALIBRATION HONESTY:
 *   The gold SQL is authored independently in a clean canonical style. It is NOT
 *   copied verbatim from the translator output, so the similarity scores are
 *   REAL numbers below 1.0 where the translator's style differs from the
 *   reference (e.g. the translator wraps aggregates in ROUND(...), the reference
 *   does not; the translator always appends a LIMIT, etc.). Thresholds in the
 *   eval are set just below the first observed score, never to an invented
 *   target.
 */

/** One gold-SQL entry: a question id (matching `nlq-gold.json`), the question,
 *  and a canonical hand-authored reference SQL for that question. */
export interface SqlGoldCase {
  /** Stable id — MUST match a case id in `nlq-gold.json`. */
  readonly id: string;
  /** The natural-language question (duplicated here for readability). */
  readonly question: string;
  /** Canonical reference SQL a competent analyst would write for this question. */
  readonly goldSql: string;
}

/**
 * Focused subset of UNAMBIGUOUS questions whose canonical SQL is stable enough
 * to anchor a similarity score. Vague/heuristic cases (outliers, "tell me
 * something interesting", missing-value matrices) are intentionally excluded —
 * there is no single "gold" SQL for them, so a Levenshtein score would be noise.
 *
 * The references use the same identifier-quoting convention the translator uses
 * (double-quoted identifiers, double-quoted table name) so the similarity
 * measures real structural/stylistic distance, not a quoting-convention gap.
 */
export const SQL_GOLD_CASES: readonly SqlGoldCase[] = [
  {
    id: "count-rows",
    question: "How many transactions are in this dataset?",
    goldSql: 'SELECT COUNT(*) AS total_count FROM "daily_transactions"',
  },
  {
    id: "count-records",
    question: "Count the total number of records",
    goldSql: 'SELECT COUNT(*) AS total_count FROM "daily_transactions"',
  },
  {
    id: "top-region-revenue",
    question: "Top 5 regions by revenue",
    goldSql:
      'SELECT "Region", SUM("Revenue") AS total FROM "daily_transactions" GROUP BY "Region" ORDER BY total DESC LIMIT 5',
  },
  {
    id: "sum-revenue-by-servicetype",
    question: "Sum of revenue by servicetype",
    goldSql:
      'SELECT "ServiceType", SUM("Revenue") AS total FROM "daily_transactions" GROUP BY "ServiceType" ORDER BY total DESC LIMIT 100',
  },
  {
    id: "total-datausage-by-city",
    question: "Total datausage by city",
    goldSql:
      'SELECT "City", SUM("DataUsageMB") AS total FROM "daily_transactions" GROUP BY "City" ORDER BY total DESC LIMIT 100',
  },
  {
    id: "avg-revenue-by-region",
    question: "Average revenue by region",
    goldSql:
      'SELECT "Region", AVG("Revenue") AS avg_value FROM "daily_transactions" GROUP BY "Region" ORDER BY avg_value DESC LIMIT 100',
  },
  {
    id: "show-all",
    question: "show all rows",
    goldSql: 'SELECT * FROM "daily_transactions" LIMIT 500',
  },
  {
    id: "filter-status",
    question: "filter Status = active",
    goldSql: 'SELECT * FROM "daily_transactions" WHERE "Status" = \'active\' LIMIT 500',
  },
  {
    id: "max-revenue",
    question: "Maximum revenue",
    goldSql:
      'SELECT "Region", MAX("Revenue") AS result FROM "daily_transactions" GROUP BY "Region" ORDER BY result DESC LIMIT 100',
  },
  {
    id: "min-callduration",
    question: "Minimum callduration",
    goldSql:
      'SELECT "Region", MIN("CallDuration") AS result FROM "daily_transactions" GROUP BY "Region" ORDER BY result ASC LIMIT 100',
  },
];
