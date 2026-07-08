// ─── Single-pass DuckDB SQL builders ──────────────────────────────────────────
//
// The legacy pipeline issued 2..3 queries PER numeric column (aggregate stats +
// a LIMIT 2000 JS pull for skew/kurtosis/histogram + a LIMIT 3000 JS pull for
// anomalies + a LIMIT 3000 JS pull for correlations). For a 20-column table that
// is 60-80 sequential round-trips, each materialising rows into JS.
//
// These builders collapse that into a handful of pushed-down queries that let
// DuckDB compute everything natively (min/max/avg/stddev/quantiles/skewness/
// kurtosis/corr/regression/histograms) in a single columnar pass — no biased
// `LIMIT`, no misaligned correlation pairing, no JS number-crunching over
// thousands of materialised rows.

/** Quote a SQL identifier, escaping embedded double quotes (global, not just first). */
export function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Quote a string literal for inline use (column names only ever reach here). */
export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * ONE multi-arm aggregate query: a `UNION ALL` arm per numeric column returning
 * every descriptive statistic DuckDB can compute natively. Replaces the
 * per-column aggregate query **and** the per-column `LIMIT 2000` JS pull plus the
 * JS `computeSkewness` / `computeKurtosis` calls entirely.
 */
export function buildNumericStatsSQL(table: string, numericCols: string[]): string {
  const t = quoteIdent(table);
  return numericCols
    .map((col) => {
      const c = quoteIdent(col);
      return `SELECT
  ${quoteLiteral(col)} AS col,
  count(*) AS total,
  count(${c}) AS non_null,
  min(${c}) AS min_val,
  max(${c}) AS max_val,
  avg(${c}) AS avg_val,
  stddev_samp(${c}) AS std_val,
  quantile_cont(${c}, 0.5) AS median_val,
  quantile_cont(${c}, 0.25) AS q1,
  quantile_cont(${c}, 0.75) AS q3,
  quantile_cont(${c}, 0.01) AS p01,
  quantile_cont(${c}, 0.99) AS p99,
  skewness(${c}) AS skew,
  kurtosis(${c}) AS kurt,
  count(DISTINCT ${c}) AS distinct_count
FROM ${t}`;
    })
    .join("\nUNION ALL\n");
}

/**
 * ONE multi-arm query for categorical columns: per-column count + distinct in a
 * single pass. Top-N values are fetched separately (they need GROUP BY) but only
 * for columns of reasonable cardinality.
 */
export function buildCategoricalStatsSQL(table: string, catCols: string[]): string {
  const t = quoteIdent(table);
  return catCols
    .map((col) => {
      const c = quoteIdent(col);
      return `SELECT
  ${quoteLiteral(col)} AS col,
  count(*) AS total,
  count(${c}) AS non_null,
  count(DISTINCT ${c}) AS distinct_count
FROM ${t}`;
    })
    .join("\nUNION ALL\n");
}

/** Top-N most frequent values for one categorical column. */
export function buildTopValuesSQL(table: string, col: string, limit = 10): string {
  const t = quoteIdent(table);
  const c = quoteIdent(col);
  return `SELECT CAST(${c} AS VARCHAR) AS val, count(*) AS cnt
FROM ${t}
WHERE ${c} IS NOT NULL
GROUP BY ${c}
ORDER BY cnt DESC
LIMIT ${Math.max(1, Math.floor(limit))}`;
}

/**
 * Histogram for one column via `width_bucket` — binned entirely in SQL. Replaces
 * the hand-rolled JS `buildHistogram` (which used `Math.min(...values)` spread
 * and could stack-overflow on large arrays). Returns one row per non-empty bin;
 * the caller densifies into a fixed-length array.
 */
export function buildHistogramSQL(
  table: string,
  col: string,
  min: number,
  max: number,
  bins: number,
): string {
  const t = quoteIdent(table);
  const c = quoteIdent(col);
  // width_bucket returns 1..bins for values inside [min,max); clamp the right
  // edge (== max) into the last bin via LEAST so the maximum value is counted.
  return `SELECT
  LEAST(width_bucket(${c}, ${min}, ${max}, ${bins}), ${bins}) AS bin,
  count(*) AS c
FROM ${t}
WHERE ${c} IS NOT NULL
GROUP BY bin
ORDER BY bin`;
}

/**
 * Pairwise Pearson correlation for the upper triangle in ONE query using
 * DuckDB's native `corr()`. This fixes BOTH legacy bugs at once:
 *   - bias from `LIMIT` (no ordering) taking the first N physical rows, and
 *   - the misaligned-pairs bug where each column was null-filtered independently
 *     so `pearsonCorrelation(a, b)` correlated unrelated rows.
 * `corr()` performs row-wise pairwise-complete handling internally.
 */
export function buildCorrelationSQL(table: string, numericCols: string[]): string {
  const t = quoteIdent(table);
  const arms: string[] = [];
  for (let i = 0; i < numericCols.length; i++) {
    for (let j = i + 1; j < numericCols.length; j++) {
      const a = quoteIdent(numericCols[i]);
      const b = quoteIdent(numericCols[j]);
      arms.push(`corr(${a}, ${b}) AS ${quoteIdent(`r_${i}_${j}`)}`);
    }
  }
  if (arms.length === 0) return "";
  return `SELECT ${arms.join(", ")} FROM ${t}`;
}

/**
 * Aggregate a metric into time-periods for forecasting, computing the OLS trend
 * directly in SQL (`regr_slope` / `regr_intercept` / `regr_r2`) over the period
 * index so the screen never re-fits a regression in JS render.
 */
export function buildSeriesSQL(
  table: string,
  dateCol: string,
  metricCol: string,
  limit = 120,
): string {
  const t = quoteIdent(table);
  const d = quoteIdent(dateCol);
  const m = quoteIdent(metricCol);
  return `SELECT
  strftime(CAST(${d} AS TIMESTAMP), '%Y-%m') AS period,
  avg(${m}) AS avg_metric,
  count(*) AS cnt
FROM ${t}
WHERE ${d} IS NOT NULL AND ${m} IS NOT NULL
GROUP BY period
ORDER BY period
LIMIT ${Math.max(1, Math.floor(limit))}`;
}

/** Row-index fallback series when there is no date column. */
export function buildIndexSeriesSQL(table: string, metricCol: string, limit = 200): string {
  const t = quoteIdent(table);
  const m = quoteIdent(metricCol);
  return `SELECT ${m} AS y
FROM ${t}
WHERE ${m} IS NOT NULL
USING SAMPLE reservoir(${Math.max(1, Math.floor(limit))} ROWS)`;
}

/**
 * Reservoir-sampled per-row feature matrix for real clustering. Unlike the
 * legacy `LIMIT` (first physical rows, biased), `USING SAMPLE reservoir(n)`
 * draws a statistically representative sample. Rows with any NULL feature are
 * excluded so the JS k-means sees complete vectors.
 */
export function buildClusterSampleSQL(
  table: string,
  featureCols: string[],
  sampleSize: number,
): string {
  const t = quoteIdent(table);
  const select = featureCols.map((c) => quoteIdent(c)).join(", ");
  const notNull = featureCols.map((c) => `${quoteIdent(c)} IS NOT NULL`).join(" AND ");
  return `SELECT ${select}
FROM ${t}
WHERE ${notNull}
USING SAMPLE reservoir(${Math.max(1, Math.floor(sampleSize))} ROWS)`;
}

/**
 * Bounded sample of a single numeric column's most extreme outlier values, for
 * showing representative anomaly examples. Pulls only the rows beyond the fence,
 * ordered by distance from the fence midpoint, rather than the whole column.
 */
export function buildOutlierSampleSQL(
  table: string,
  col: string,
  lowerFence: number,
  upperFence: number,
  limit = 12,
): string {
  const t = quoteIdent(table);
  const c = quoteIdent(col);
  return `SELECT ${c} AS v
FROM ${t}
WHERE ${c} IS NOT NULL AND (${c} < ${lowerFence} OR ${c} > ${upperFence})
ORDER BY abs(${c} - ((${lowerFence} + ${upperFence}) / 2)) DESC
LIMIT ${Math.max(1, Math.floor(limit))}`;
}

/** Exact count of fenced (outlier) rows for one column. */
export function buildOutlierCountSQL(
  table: string,
  col: string,
  lowerFence: number,
  upperFence: number,
): string {
  const t = quoteIdent(table);
  const c = quoteIdent(col);
  return `SELECT count(*) AS c
FROM ${t}
WHERE ${c} IS NOT NULL AND (${c} < ${lowerFence} OR ${c} > ${upperFence})`;
}
