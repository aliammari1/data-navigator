import { describe, expect, it } from "vitest";
import {
  buildAttributionFeaturesSql,
  buildClusterSampleSql,
  buildCohortRatesSql,
  buildPeriodMetricsSql,
  buildReconciliationActualsSql,
  quoteIdent,
  quoteLiteral,
} from "@/features/deep-analytics/lib/sql";

/**
 * Behavioral suite for the deep-analytics SQL builder helpers.
 *
 * Every function is pure (no IO / DuckDB calls), so we exercise the
 * output strings directly: check quoting safety, branch coverage for
 * optional parameters, and presence of the expected SQL clauses.
 */

// ---------------------------------------------------------------------------
// quoteIdent
// ---------------------------------------------------------------------------
describe("quoteIdent", () => {
  it("wraps the identifier in double quotes", () => {
    // Arrange / Act
    const result = quoteIdent("myColumn");
    // Assert
    expect(result).toBe('"myColumn"');
  });

  it("escapes embedded double quotes by doubling them", () => {
    // A column named: weird"name -> "weird""name"
    expect(quoteIdent('weird"name')).toBe('"weird""name"');
  });

  it("escapes multiple embedded double quotes", () => {
    expect(quoteIdent('a"b"c')).toBe('"a""b""c"');
  });

  it("handles an empty string without error", () => {
    expect(quoteIdent("")).toBe('""');
  });

  it("handles identifiers with only double-quote characters", () => {
    expect(quoteIdent('"')).toBe('""""');
  });

  it("does not alter identifiers that need no escaping", () => {
    expect(quoteIdent("total_revenue")).toBe('"total_revenue"');
  });
});

// ---------------------------------------------------------------------------
// quoteLiteral
// ---------------------------------------------------------------------------
describe("quoteLiteral", () => {
  it("wraps the value in single quotes", () => {
    expect(quoteLiteral("hello")).toBe("'hello'");
  });

  it("escapes embedded single quotes by doubling them", () => {
    // SQL injection guard: O'Brien -> 'O''Brien'
    expect(quoteLiteral("O'Brien")).toBe("'O''Brien'");
  });

  it("escapes multiple embedded single quotes", () => {
    expect(quoteLiteral("it's a 'test'")).toBe("'it''s a ''test'''");
  });

  it("handles an empty string", () => {
    expect(quoteLiteral("")).toBe("''");
  });

  it("does not alter strings that need no escaping", () => {
    expect(quoteLiteral("succe")).toBe("'succe'");
  });
});

// ---------------------------------------------------------------------------
// buildCohortRatesSql
// ---------------------------------------------------------------------------
describe("buildCohortRatesSql", () => {
  it("produces a SELECT with cohort, bucket, total, successes, rate columns", () => {
    // Arrange
    const sql = buildCohortRatesSql({
      view: "transactions",
      categoryCol: "channel",
      dateCol: "created_at",
    });
    // Assert — essential output columns
    expect(sql).toContain("cohort");
    expect(sql).toContain("bucket");
    expect(sql).toContain("total");
    expect(sql).toContain("successes");
    expect(sql).toContain("rate");
  });

  it("quotes the view identifier", () => {
    const sql = buildCohortRatesSql({
      view: "my_view",
      categoryCol: "cat",
      dateCol: "dt",
    });
    expect(sql).toContain('"my_view"');
  });

  it("quotes the categoryCol and dateCol identifiers", () => {
    const sql = buildCohortRatesSql({
      view: "v",
      categoryCol: "channel",
      dateCol: "created_at",
    });
    expect(sql).toContain('"channel"');
    expect(sql).toContain('"created_at"');
  });

  it("defaults to 'week' bucket when none is supplied", () => {
    const sql = buildCohortRatesSql({
      view: "v",
      categoryCol: "cat",
      dateCol: "dt",
    });
    expect(sql).toContain("date_trunc('week'");
  });

  it("respects an explicit 'day' bucket", () => {
    const sql = buildCohortRatesSql({
      view: "v",
      categoryCol: "cat",
      dateCol: "dt",
      bucket: "day",
    });
    expect(sql).toContain("date_trunc('day'");
  });

  it("respects an explicit 'month' bucket", () => {
    const sql = buildCohortRatesSql({
      view: "v",
      categoryCol: "cat",
      dateCol: "dt",
      bucket: "month",
    });
    expect(sql).toContain("date_trunc('month'");
  });

  it("defaults topCategories to LIMIT 12", () => {
    const sql = buildCohortRatesSql({
      view: "v",
      categoryCol: "cat",
      dateCol: "dt",
    });
    expect(sql).toContain("LIMIT 12");
  });

  it("uses a custom topCategories limit", () => {
    const sql = buildCohortRatesSql({
      view: "v",
      categoryCol: "cat",
      dateCol: "dt",
      topCategories: 5,
    });
    expect(sql).toContain("LIMIT 5");
  });

  it("floors a fractional topCategories value", () => {
    const sql = buildCohortRatesSql({
      view: "v",
      categoryCol: "cat",
      dateCol: "dt",
      topCategories: 7.9,
    });
    expect(sql).toContain("LIMIT 7");
    expect(sql).not.toContain("LIMIT 7.9");
  });

  it("injects a CASE WHEN success expression when statusCol is supplied", () => {
    const sql = buildCohortRatesSql({
      view: "v",
      categoryCol: "cat",
      dateCol: "dt",
      statusCol: "status",
    });
    // Should include CASE WHEN with the default 'succe' pattern
    expect(sql).toContain("CASE WHEN");
    expect(sql).toContain("'%succe%'");
    expect(sql).toContain('"status"');
  });

  it("uses a custom successPattern when provided with a statusCol", () => {
    const sql = buildCohortRatesSql({
      view: "v",
      categoryCol: "cat",
      dateCol: "dt",
      statusCol: "state",
      successPattern: "APPROVED",
    });
    // Pattern should be lowercased
    expect(sql).toContain("'%approved%'");
  });

  it("falls back to '1' (row-share) when no statusCol is given", () => {
    const sql = buildCohortRatesSql({
      view: "v",
      categoryCol: "cat",
      dateCol: "dt",
    });
    // No CASE WHEN — plain '1' used as is_success
    expect(sql).not.toContain("CASE WHEN");
    expect(sql).toContain("1");
  });

  it("quotes identifiers that require escaping (double quotes in names)", () => {
    const sql = buildCohortRatesSql({
      view: 'weird"view',
      categoryCol: 'cat"col',
      dateCol: "dt",
    });
    expect(sql).toContain('"weird""view"');
    expect(sql).toContain('"cat""col"');
  });

  it("includes the ranked CTE and bucketed CTE", () => {
    const sql = buildCohortRatesSql({
      view: "v",
      categoryCol: "cat",
      dateCol: "dt",
    });
    expect(sql).toContain("ranked AS");
    expect(sql).toContain("bucketed AS");
  });

  it("joins bucketed to ranked on cohort", () => {
    const sql = buildCohortRatesSql({
      view: "v",
      categoryCol: "cat",
      dateCol: "dt",
    });
    expect(sql).toContain("JOIN ranked r ON r.cohort = b.cohort");
  });
});

// ---------------------------------------------------------------------------
// buildPeriodMetricsSql
// ---------------------------------------------------------------------------
describe("buildPeriodMetricsSql", () => {
  it("produces the required period-metrics columns", () => {
    const sql = buildPeriodMetricsSql({
      view: "txns",
      dateCol: "date",
    });
    expect(sql).toContain("period");
    expect(sql).toContain("volume");
    expect(sql).toContain("success_rate");
    expect(sql).toContain("revenue");
    expect(sql).toContain("failures");
    expect(sql).toContain("avg_amount");
  });

  it("defaults to week bucket", () => {
    const sql = buildPeriodMetricsSql({ view: "v", dateCol: "dt" });
    expect(sql).toContain("date_trunc('week'");
  });

  it("uses an explicit 'day' bucket", () => {
    const sql = buildPeriodMetricsSql({ view: "v", dateCol: "dt", bucket: "day" });
    expect(sql).toContain("date_trunc('day'");
  });

  it("uses an explicit 'month' bucket", () => {
    const sql = buildPeriodMetricsSql({ view: "v", dateCol: "dt", bucket: "month" });
    expect(sql).toContain("date_trunc('month'");
  });

  it("defaults to LIMIT 26", () => {
    const sql = buildPeriodMetricsSql({ view: "v", dateCol: "dt" });
    expect(sql).toContain("LIMIT 26");
  });

  it("uses a custom limit", () => {
    const sql = buildPeriodMetricsSql({ view: "v", dateCol: "dt", limit: 52 });
    expect(sql).toContain("LIMIT 52");
  });

  it("floors a fractional limit", () => {
    const sql = buildPeriodMetricsSql({ view: "v", dateCol: "dt", limit: 13.7 });
    expect(sql).toContain("LIMIT 13");
  });

  it("uses COUNT(*) for revenue and 0 for avg_amount when amountCol is absent", () => {
    const sql = buildPeriodMetricsSql({ view: "v", dateCol: "dt" });
    expect(sql).toContain("COUNT(*) AS revenue");
    expect(sql).toContain("0 AS avg_amount");
  });

  it("uses SUM(amountCol) for revenue and AVG(amountCol) for avg_amount when amountCol is supplied", () => {
    const sql = buildPeriodMetricsSql({ view: "v", dateCol: "dt", amountCol: "amount" });
    expect(sql).toContain('SUM("amount") AS revenue');
    expect(sql).toContain('AVG("amount") AS avg_amount');
  });

  it("defaults success expression to '1' when no statusCol is given", () => {
    const sql = buildPeriodMetricsSql({ view: "v", dateCol: "dt" });
    expect(sql).not.toContain("CASE WHEN");
  });

  it("injects CASE WHEN expression when statusCol is provided", () => {
    const sql = buildPeriodMetricsSql({ view: "v", dateCol: "dt", statusCol: "status" });
    expect(sql).toContain("CASE WHEN");
    expect(sql).toContain("'%succe%'");
  });

  it("uses a custom successPattern with statusCol", () => {
    const sql = buildPeriodMetricsSql({
      view: "v",
      dateCol: "dt",
      statusCol: "status",
      successPattern: "PAID",
    });
    expect(sql).toContain("'%paid%'");
  });

  it("quotes the view and dateCol identifiers", () => {
    const sql = buildPeriodMetricsSql({ view: "my_view", dateCol: "created_at" });
    expect(sql).toContain('"my_view"');
    expect(sql).toContain('"created_at"');
  });

  it("filters rows where dateCol IS NOT NULL", () => {
    const sql = buildPeriodMetricsSql({ view: "v", dateCol: "dt" });
    expect(sql).toContain("IS NOT NULL");
  });

  it("orders results descending by period", () => {
    const sql = buildPeriodMetricsSql({ view: "v", dateCol: "dt" });
    expect(sql).toContain("ORDER BY 1 DESC");
  });
});

// ---------------------------------------------------------------------------
// buildClusterSampleSql
// ---------------------------------------------------------------------------
describe("buildClusterSampleSql", () => {
  it("casts x and y to DOUBLE and filters non-finite values", () => {
    const sql = buildClusterSampleSql({ view: "v", xCol: "amount", yCol: "count" });
    expect(sql).toContain("CAST");
    expect(sql).toContain("AS DOUBLE");
    expect(sql).toContain("isfinite");
  });

  it("selects x, y, label, and status columns", () => {
    const sql = buildClusterSampleSql({ view: "v", xCol: "x", yCol: "y" });
    expect(sql).toContain("AS x");
    expect(sql).toContain("AS y");
    expect(sql).toContain("AS label");
    expect(sql).toContain("AS status");
  });

  it("uses NULL AS label when labelCol is absent", () => {
    const sql = buildClusterSampleSql({ view: "v", xCol: "x", yCol: "y" });
    expect(sql).toContain("NULL AS label");
  });

  it("uses NULL AS status when statusCol is absent", () => {
    const sql = buildClusterSampleSql({ view: "v", xCol: "x", yCol: "y" });
    expect(sql).toContain("NULL AS status");
  });

  it("uses the labelCol when supplied", () => {
    const sql = buildClusterSampleSql({ view: "v", xCol: "x", yCol: "y", labelCol: "channel" });
    expect(sql).toContain('"channel"');
    expect(sql).not.toContain("NULL AS label");
  });

  it("uses the statusCol when supplied", () => {
    const sql = buildClusterSampleSql({ view: "v", xCol: "x", yCol: "y", statusCol: "state" });
    expect(sql).toContain('"state"');
    expect(sql).not.toContain("NULL AS status");
  });

  it("defaults to USING SAMPLE 5000 ROWS", () => {
    const sql = buildClusterSampleSql({ view: "v", xCol: "x", yCol: "y" });
    expect(sql).toContain("USING SAMPLE 5000 ROWS");
  });

  it("uses a custom sampleRows count", () => {
    const sql = buildClusterSampleSql({ view: "v", xCol: "x", yCol: "y", sampleRows: 1000 });
    expect(sql).toContain("USING SAMPLE 1000 ROWS");
  });

  it("floors a fractional sampleRows value", () => {
    const sql = buildClusterSampleSql({ view: "v", xCol: "x", yCol: "y", sampleRows: 999.9 });
    expect(sql).toContain("USING SAMPLE 999 ROWS");
    expect(sql).not.toContain("999.9");
  });

  it("quotes view, xCol, and yCol identifiers", () => {
    const sql = buildClusterSampleSql({ view: "my_view", xCol: "col_x", yCol: "col_y" });
    expect(sql).toContain('"my_view"');
    expect(sql).toContain('"col_x"');
    expect(sql).toContain('"col_y"');
  });

  it("filters NULL values from x and y", () => {
    const sql = buildClusterSampleSql({ view: "v", xCol: "x", yCol: "y" });
    expect(sql).toContain("IS NOT NULL");
  });

  it("includes both labelCol and statusCol when both are supplied", () => {
    const sql = buildClusterSampleSql({
      view: "v",
      xCol: "x",
      yCol: "y",
      labelCol: "lbl",
      statusCol: "sta",
    });
    expect(sql).toContain('"lbl"');
    expect(sql).toContain('"sta"');
    expect(sql).not.toContain("NULL AS label");
    expect(sql).not.toContain("NULL AS status");
  });
});

// ---------------------------------------------------------------------------
// buildAttributionFeaturesSql
// ---------------------------------------------------------------------------
describe("buildAttributionFeaturesSql", () => {
  it("produces channel, volume, success_rate, avg_amount, revenue columns", () => {
    const sql = buildAttributionFeaturesSql({
      view: "txns",
      categoryCol: "channel",
      amountCol: "amount",
    });
    expect(sql).toContain("channel");
    expect(sql).toContain("volume");
    expect(sql).toContain("success_rate");
    expect(sql).toContain("avg_amount");
    expect(sql).toContain("revenue");
  });

  it("quotes view, categoryCol, amountCol identifiers", () => {
    const sql = buildAttributionFeaturesSql({
      view: "my_view",
      categoryCol: "category",
      amountCol: "revenue_col",
    });
    expect(sql).toContain('"my_view"');
    expect(sql).toContain('"category"');
    expect(sql).toContain('"revenue_col"');
  });

  it("defaults success_rate to '100.0' (i.e. always 100%) when no statusCol", () => {
    const sql = buildAttributionFeaturesSql({
      view: "v",
      categoryCol: "cat",
      amountCol: "amt",
    });
    // No CASE WHEN — static 100.0 is used
    expect(sql).not.toContain("CASE WHEN");
    expect(sql).toContain("100.0");
  });

  it("injects a CASE WHEN success expression when statusCol is provided", () => {
    const sql = buildAttributionFeaturesSql({
      view: "v",
      categoryCol: "cat",
      amountCol: "amt",
      statusCol: "status",
    });
    expect(sql).toContain("CASE WHEN");
    expect(sql).toContain("'%succe%'");
    expect(sql).toContain('"status"');
  });

  it("uses a custom successPattern (lowercased) when provided", () => {
    const sql = buildAttributionFeaturesSql({
      view: "v",
      categoryCol: "cat",
      amountCol: "amt",
      statusCol: "status",
      successPattern: "COMPLETED",
    });
    expect(sql).toContain("'%completed%'");
  });

  it("defaults topCategories to LIMIT 40", () => {
    const sql = buildAttributionFeaturesSql({
      view: "v",
      categoryCol: "cat",
      amountCol: "amt",
    });
    expect(sql).toContain("LIMIT 40");
  });

  it("uses a custom topCategories limit", () => {
    const sql = buildAttributionFeaturesSql({
      view: "v",
      categoryCol: "cat",
      amountCol: "amt",
      topCategories: 10,
    });
    expect(sql).toContain("LIMIT 10");
  });

  it("floors a fractional topCategories value", () => {
    const sql = buildAttributionFeaturesSql({
      view: "v",
      categoryCol: "cat",
      amountCol: "amt",
      topCategories: 15.8,
    });
    expect(sql).toContain("LIMIT 15");
    expect(sql).not.toContain("LIMIT 15.8");
  });

  it("orders by revenue DESC", () => {
    const sql = buildAttributionFeaturesSql({
      view: "v",
      categoryCol: "cat",
      amountCol: "amt",
    });
    expect(sql).toContain("ORDER BY revenue DESC");
  });

  it("filters rows where categoryCol and amountCol are NOT NULL", () => {
    const sql = buildAttributionFeaturesSql({
      view: "v",
      categoryCol: "cat",
      amountCol: "amt",
    });
    expect(sql).toContain("IS NOT NULL");
  });

  it("uses AVG and SUM over the amountCol cast to DOUBLE", () => {
    const sql = buildAttributionFeaturesSql({
      view: "v",
      categoryCol: "cat",
      amountCol: "price",
    });
    expect(sql).toContain('AVG(CAST("price" AS DOUBLE))');
    expect(sql).toContain('SUM(CAST("price" AS DOUBLE))');
  });
});

// ---------------------------------------------------------------------------
// buildReconciliationActualsSql
// ---------------------------------------------------------------------------
describe("buildReconciliationActualsSql", () => {
  it("produces channel, actual_volume, actual_revenue columns", () => {
    const sql = buildReconciliationActualsSql({ view: "v", categoryCol: "channel" });
    expect(sql).toContain("channel");
    expect(sql).toContain("actual_volume");
    expect(sql).toContain("actual_revenue");
  });

  it("quotes view and categoryCol identifiers", () => {
    const sql = buildReconciliationActualsSql({
      view: "my_view",
      categoryCol: "cat_col",
    });
    expect(sql).toContain('"my_view"');
    expect(sql).toContain('"cat_col"');
  });

  it("uses COUNT(*) for revenue when amountCol is absent", () => {
    const sql = buildReconciliationActualsSql({ view: "v", categoryCol: "cat" });
    expect(sql).toContain("COUNT(*) AS actual_revenue");
  });

  it("uses SUM(amountCol cast to DOUBLE) when amountCol is supplied", () => {
    const sql = buildReconciliationActualsSql({
      view: "v",
      categoryCol: "cat",
      amountCol: "revenue",
    });
    expect(sql).toContain('SUM(CAST("revenue" AS DOUBLE)) AS actual_revenue');
  });

  it("defaults topCategories to LIMIT 25", () => {
    const sql = buildReconciliationActualsSql({ view: "v", categoryCol: "cat" });
    expect(sql).toContain("LIMIT 25");
  });

  it("uses a custom topCategories limit", () => {
    const sql = buildReconciliationActualsSql({
      view: "v",
      categoryCol: "cat",
      topCategories: 10,
    });
    expect(sql).toContain("LIMIT 10");
  });

  it("floors a fractional topCategories value", () => {
    const sql = buildReconciliationActualsSql({
      view: "v",
      categoryCol: "cat",
      topCategories: 8.6,
    });
    expect(sql).toContain("LIMIT 8");
    expect(sql).not.toContain("LIMIT 8.6");
  });

  it("orders by actual_revenue DESC", () => {
    const sql = buildReconciliationActualsSql({ view: "v", categoryCol: "cat" });
    expect(sql).toContain("ORDER BY actual_revenue DESC");
  });

  it("filters rows where categoryCol IS NOT NULL", () => {
    const sql = buildReconciliationActualsSql({ view: "v", categoryCol: "cat" });
    expect(sql).toContain("IS NOT NULL");
  });

  it("groups by 1 (the channel alias)", () => {
    const sql = buildReconciliationActualsSql({ view: "v", categoryCol: "cat" });
    expect(sql).toContain("GROUP BY 1");
  });

  it("quotes amountCol identifier that contains a double-quote", () => {
    const sql = buildReconciliationActualsSql({
      view: "v",
      categoryCol: "cat",
      amountCol: 'rev"col',
    });
    expect(sql).toContain('"rev""col"');
  });
});
