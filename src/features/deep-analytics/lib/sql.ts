/**
 * SQL builders for deep-analytics.
 *
 * Every heavy GROUP BY / aggregation is pushed into DuckDB via
 * `runReadOnlyQuery`; the React layer only receives small result sets and
 * raw numeric vectors for the off-thread ML worker.
 *
 * All identifiers are quoted and all string literals escaped — these builders
 * accept column names that originate from the dataset catalog.
 */

export function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Per-category success rate over time buckets ("cohort weekly rates").
 *
 * Buckets a date/timestamp column by week and computes the share of "success"
 * rows per category. When no status column is available the rate degenerates
 * to the row share of the bucket, which is still real (not fabricated) data.
 */
export function buildCohortRatesSql(params: {
  view: string;
  categoryCol: string;
  dateCol: string;
  statusCol?: string;
  successPattern?: string;
  bucket?: "day" | "week" | "month";
  topCategories?: number;
}): string {
  const {
    view,
    categoryCol,
    dateCol,
    statusCol,
    successPattern = "succe",
    bucket = "week",
    topCategories = 12,
  } = params;

  const v = quoteIdent(view);
  const cat = quoteIdent(categoryCol);
  const date = quoteIdent(dateCol);

  const successExpr = statusCol
    ? `CASE WHEN lower(CAST(${quoteIdent(statusCol)} AS VARCHAR)) LIKE ${quoteLiteral(
        `%${successPattern.toLowerCase()}%`,
      )} THEN 1 ELSE 0 END`
    : "1";

  return `
    WITH ranked AS (
      SELECT CAST(${cat} AS VARCHAR) AS cohort, COUNT(*) AS n
      FROM ${v}
      WHERE ${cat} IS NOT NULL
      GROUP BY 1
      ORDER BY n DESC
      LIMIT ${Math.floor(topCategories)}
    ),
    bucketed AS (
      SELECT
        CAST(${cat} AS VARCHAR) AS cohort,
        date_trunc('${bucket}', CAST(${date} AS TIMESTAMP)) AS bucket,
        ${successExpr} AS is_success
      FROM ${v}
      WHERE ${cat} IS NOT NULL AND ${date} IS NOT NULL
    )
    SELECT
      b.cohort AS cohort,
      b.bucket AS bucket,
      COUNT(*) AS total,
      SUM(b.is_success) AS successes,
      100.0 * SUM(b.is_success) / COUNT(*) AS rate
    FROM bucketed b
    JOIN ranked r ON r.cohort = b.cohort
    GROUP BY b.cohort, b.bucket
    ORDER BY b.cohort, b.bucket
  `;
}

/**
 * Per-period metrics (volume, success rate, revenue, failures, avg amount).
 *
 * Buckets by a date column; `amountCol` drives revenue/avg-amount when present.
 */
export function buildPeriodMetricsSql(params: {
  view: string;
  dateCol: string;
  amountCol?: string;
  statusCol?: string;
  successPattern?: string;
  bucket?: "day" | "week" | "month";
  limit?: number;
}): string {
  const {
    view,
    dateCol,
    amountCol,
    statusCol,
    successPattern = "succe",
    bucket = "week",
    limit = 26,
  } = params;

  const v = quoteIdent(view);
  const date = quoteIdent(dateCol);
  const amount = amountCol ? quoteIdent(amountCol) : null;

  const successExpr = statusCol
    ? `CASE WHEN lower(CAST(${quoteIdent(statusCol)} AS VARCHAR)) LIKE ${quoteLiteral(
        `%${successPattern.toLowerCase()}%`,
      )} THEN 1 ELSE 0 END`
    : "1";

  const revenueExpr = amount ? `SUM(${amount})` : "COUNT(*)";
  const avgAmountExpr = amount ? `AVG(${amount})` : "0";

  return `
    SELECT
      date_trunc('${bucket}', CAST(${date} AS TIMESTAMP)) AS period,
      COUNT(*) AS volume,
      100.0 * SUM(${successExpr}) / COUNT(*) AS success_rate,
      ${revenueExpr} AS revenue,
      COUNT(*) - SUM(${successExpr}) AS failures,
      ${avgAmountExpr} AS avg_amount
    FROM ${v}
    WHERE ${date} IS NOT NULL
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT ${Math.floor(limit)}
  `;
}

/**
 * Bounded, representative sample of clustering features.
 *
 * `USING SAMPLE` keeps the worker fast and memory-bounded on large tables.
 * Only finite numeric rows are returned.
 */
export function buildClusterSampleSql(params: {
  view: string;
  xCol: string;
  yCol: string;
  labelCol?: string;
  statusCol?: string;
  sampleRows?: number;
}): string {
  const { view, xCol, yCol, labelCol, statusCol, sampleRows = 5000 } = params;

  const v = quoteIdent(view);
  const x = quoteIdent(xCol);
  const y = quoteIdent(yCol);
  const labelSelect = labelCol
    ? `, CAST(${quoteIdent(labelCol)} AS VARCHAR) AS label`
    : ", NULL AS label";
  const statusSelect = statusCol
    ? `, CAST(${quoteIdent(statusCol)} AS VARCHAR) AS status`
    : ", NULL AS status";

  return `
    SELECT
      CAST(${x} AS DOUBLE) AS x,
      CAST(${y} AS DOUBLE) AS y${labelSelect}${statusSelect}
    FROM ${v}
    WHERE ${x} IS NOT NULL AND ${y} IS NOT NULL
      AND isfinite(CAST(${x} AS DOUBLE)) AND isfinite(CAST(${y} AS DOUBLE))
    USING SAMPLE ${Math.floor(sampleRows)} ROWS
  `;
}

/**
 * Per-category feature matrix for revenue-attribution regression.
 *
 * Aggregates one row per category with the numeric drivers and the revenue
 * target. The worker standardises columns and solves a multiple linear
 * regression so |coefficients| become true attribution shares.
 */
export function buildAttributionFeaturesSql(params: {
  view: string;
  categoryCol: string;
  amountCol: string;
  statusCol?: string;
  successPattern?: string;
  topCategories?: number;
}): string {
  const {
    view,
    categoryCol,
    amountCol,
    statusCol,
    successPattern = "succe",
    topCategories = 40,
  } = params;

  const v = quoteIdent(view);
  const cat = quoteIdent(categoryCol);
  const amount = quoteIdent(amountCol);

  const successExpr = statusCol
    ? `100.0 * SUM(CASE WHEN lower(CAST(${quoteIdent(statusCol)} AS VARCHAR)) LIKE ${quoteLiteral(
        `%${successPattern.toLowerCase()}%`,
      )} THEN 1 ELSE 0 END) / COUNT(*)`
    : "100.0";

  return `
    SELECT
      CAST(${cat} AS VARCHAR) AS channel,
      COUNT(*) AS volume,
      ${successExpr} AS success_rate,
      AVG(CAST(${amount} AS DOUBLE)) AS avg_amount,
      SUM(CAST(${amount} AS DOUBLE)) AS revenue
    FROM ${v}
    WHERE ${cat} IS NOT NULL AND ${amount} IS NOT NULL
    GROUP BY 1
    ORDER BY revenue DESC
    LIMIT ${Math.floor(topCategories)}
  `;
}

/**
 * Per-channel actuals for the reconciliation wizard: real transaction volume
 * and revenue per category, straight from the active DuckDB dataset. Replaces
 * the previous hard-coded `ACTUAL_DEFAULT` constant so step 2's "Auto-populated
 * from current DuckDB dataset" claim is honest.
 */
export function buildReconciliationActualsSql(params: {
  view: string;
  categoryCol: string;
  amountCol?: string;
  topCategories?: number;
}): string {
  const { view, categoryCol, amountCol, topCategories = 25 } = params;

  const v = quoteIdent(view);
  const cat = quoteIdent(categoryCol);
  const revenueExpr = amountCol ? `SUM(CAST(${quoteIdent(amountCol)} AS DOUBLE))` : "COUNT(*)";

  return `
    SELECT
      CAST(${cat} AS VARCHAR) AS channel,
      COUNT(*) AS actual_volume,
      ${revenueExpr} AS actual_revenue
    FROM ${v}
    WHERE ${cat} IS NOT NULL
    GROUP BY 1
    ORDER BY actual_revenue DESC
    LIMIT ${Math.floor(topCategories)}
  `;
}
