/**
 * SQL builders for geo-analysis.
 *
 * All aggregation is pushed down into DuckDB (off the renderer main thread) and
 * reuses the telecom feature's audited expression helpers (`qc`, `statusNorm`,
 * `canalCaseExpr`) so channel/status classification matches the rest of the app.
 *
 * Nothing here fabricates data: every number originates from the active
 * dataset's real rows.
 */

import type { ColumnMapping, StatusMapping } from "@/features/telecom/types";
import {
  canalCaseExpr,
  qc,
  sqlLiteral,
  statusNorm,
} from "@/features/telecom/lib/sql";

/** Row shape returned by {@link regionRollupSql}. */
export interface RegionRollupRow {
  region: string;
  transactions: number;
  revenue: number;
  success: number;
}

/** Row shape returned by {@link channelRegionMatrixSql}. */
export interface ChannelRegionRow {
  region: string;
  channel: string;
  transactions: number;
}

/** Row shape returned by {@link channelFlowSql}. */
export interface ChannelFlowRow {
  channel: string;
  region: string;
  transactions: number;
  success: number;
}

/**
 * Per-region rollup: transactions, revenue and success count grouped by the
 * mapped region column. Success is computed via the shared status
 * normalisation so it lines up with the telecom dashboards.
 */
export function regionRollupSql(
  table: string,
  m: ColumnMapping,
  sm: StatusMapping[],
  limit = 200,
): string {
  const reg = qc(m.region);
  const amt = qc(m.amount);
  const sn = statusNorm(m, sm);
  return `
    SELECT
      COALESCE(CAST(${reg} AS VARCHAR), 'Inconnu')                       AS region,
      COUNT(*)                                                            AS transactions,
      ROUND(SUM(TRY_CAST(${amt} AS DOUBLE)), 3)                           AS revenue,
      COUNT(*) FILTER (WHERE ${sn} = 'SUCCESS')                           AS success
    FROM ${qc(table)}
    WHERE ${reg} IS NOT NULL AND CAST(${reg} AS VARCHAR) NOT IN ('', 'NULL')
    GROUP BY 1
    ORDER BY transactions DESC
    LIMIT ${Math.max(1, Math.floor(limit))}
  `;
}

/**
 * Channel-by-region matrix restricted to the busiest regions and channels.
 * Used for the distribution heatmap and per-region channel mix. Returns long
 * (tidy) rows; the component pivots them into a matrix in memory.
 */
export function channelRegionMatrixSql(
  table: string,
  m: ColumnMapping,
  regionLimit = 12,
): string {
  const reg = qc(m.region);
  const canal = canalCaseExpr(m);
  return `
    WITH top_regions AS (
      SELECT COALESCE(CAST(${reg} AS VARCHAR), 'Inconnu') AS region, COUNT(*) AS n
      FROM ${qc(table)}
      WHERE ${reg} IS NOT NULL AND CAST(${reg} AS VARCHAR) NOT IN ('', 'NULL')
      GROUP BY 1
      ORDER BY n DESC
      LIMIT ${Math.max(1, Math.floor(regionLimit))}
    )
    SELECT
      COALESCE(CAST(${reg} AS VARCHAR), 'Inconnu') AS region,
      ${canal}                                     AS channel,
      COUNT(*)                                     AS transactions
    FROM ${qc(table)}
    WHERE COALESCE(CAST(${reg} AS VARCHAR), 'Inconnu') IN (SELECT region FROM top_regions)
    GROUP BY 1, 2
    ORDER BY 1, transactions DESC
  `;
}

/**
 * Channel -> region flows for the on-map arc/network view. Each row is a real
 * (channel, region) edge weighted by transaction volume and success count.
 */
export function channelFlowSql(
  table: string,
  m: ColumnMapping,
  sm: StatusMapping[],
  limit = 400,
): string {
  const reg = qc(m.region);
  const canal = canalCaseExpr(m);
  const sn = statusNorm(m, sm);
  return `
    SELECT
      ${canal}                                            AS channel,
      COALESCE(CAST(${reg} AS VARCHAR), 'Inconnu')        AS region,
      COUNT(*)                                            AS transactions,
      COUNT(*) FILTER (WHERE ${sn} = 'SUCCESS')           AS success
    FROM ${qc(table)}
    WHERE ${reg} IS NOT NULL AND CAST(${reg} AS VARCHAR) NOT IN ('', 'NULL')
    GROUP BY 1, 2
    HAVING COUNT(*) > 0
    ORDER BY transactions DESC
    LIMIT ${Math.max(1, Math.floor(limit))}
  `;
}

/** Existence probe for a view/table without throwing. */
export function tableExistsSql(table: string): string {
  return `SELECT 1 AS ok FROM information_schema.tables WHERE table_name = ${sqlLiteral(
    table,
  )} LIMIT 1`;
}
